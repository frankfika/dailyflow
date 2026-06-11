/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Send, Plus, Sparkles, Loader2, Settings, Trash2, MessageSquare, Paperclip,
  X, ChevronDown, Zap, Calendar, FileText, Folder, Bot, User,
  StopCircle, Copy, PanelLeftClose, PanelLeftOpen, Bookmark,
  PlusCircle, RotateCcw,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { aiApi, promptsApi, notesApi, tasksApi, type PromptTemplateData, loadSkillUsage, recordSkillUse, sortSkillsByUsage } from '../api/client';
import { loadProviderConfigs, persistProviderConfigsToBackend, type ProviderConfig } from '../types/models';
import {
  loadChatStore,
  saveChatStore,
  createNewSession,
  deriveSessionTitle,
  type ChatSession,
  type ChatMessage,
  type ContextItem,
} from '../types/chat';
import { buildToolInstructions, parseToolCalls } from '../types/ai-tools';
import { executeToolCall } from '../utils/aiToolExecutor';
import { getTodayStr } from '../utils/tagColors';
import { generateTaskId, generateShortId } from '../utils/idGenerator';
import { createTasksFromMessage, copyMessageContent } from '../utils/chatActions';
import { ChatSettingsPanel } from './ChatSettingsPanel';
import { ContextPicker } from './ContextPicker';

/**
 * Translate technical error messages into user-friendly actionable guidance
 */
function getFriendlyErrorMessage(rawError: string, language: 'en' | 'zh', providerName: string): string {
  const lower = rawError.toLowerCase();

  // Network / fetch failures
  if (lower.includes('fetch failed') || lower.includes('network') || lower.includes('econnrefused')) {
    return language === 'zh'
      ? `网络连接失败。请检查：\n1. 网络连接是否正常\n2. API 地址是否正确\n3. 防火墙/代理设置\n\n可前往「模型 & Skills」检查配置。`
      : `Network connection failed. Check:\n1. Internet connection\n2. API URL is correct\n3. Firewall/proxy settings\n\nGo to "Models & Skills" to verify config.`;
  }

  // Auth failures (401/403)
  if (lower.includes('401') || lower.includes('403') || lower.includes('unauthorized') || lower.includes('invalid_api_key')) {
    return language === 'zh'
      ? `API Key 无效或已过期。\n\n请前往「模型 & Skills」→ 编辑 ${providerName} → 更新 API Key。\n\n获取新 Key 请访问对应平台官网。`
      : `API Key is invalid or expired.\n\nGo to "Models & Skills" → Edit ${providerName} → Update API Key.\n\nGet a new key from the provider's website.`;
  }

  // Rate limit / quota (429)
  if (lower.includes('429') || lower.includes('rate limit') || lower.includes('quota')) {
    return language === 'zh'
      ? `API 请求超限或额度不足。\n\n请检查账户余额，或稍后重试。\n若持续出现，可在「模型 & Skills」切换到其他供应商。`
      : `API rate limit exceeded or quota insufficient.\n\nCheck account balance or try again later.\n\nSwitch to another provider in "Models & Skills" if it persists.`;
  }

  // Model not found / invalid model
  if (lower.includes('model') && (lower.includes('not found') || lower.includes('does not exist'))) {
    return language === 'zh'
      ? `模型 ID 不存在或拼写错误。\n\n请前往「模型 & Skills」→ 编辑 ${providerName} → 确认 Model ID 正确。`
      : `Model ID not found or misspelled.\n\nGo to "Models & Skills" → Edit ${providerName} → Verify Model ID.`;
  }

  // Timeout
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return language === 'zh'
      ? `请求超时，可能是网络较慢或模型负载高。\n\n建议稍后重试，或切换到其他供应商。`
      : `Request timed out. Network may be slow or model is overloaded.\n\nRetry later or switch providers.`;
  }

  // Generic fallback
  return language === 'zh'
    ? `调用 ${providerName} 时出错：\n${rawError}\n\n请前往「模型 & Skills」检查配置，或切换到其他供应商。`
    : `Error calling ${providerName}:\n${rawError}\n\nCheck config in "Models & Skills" or switch providers.`;
}

interface AIChatProps {
  language: 'en' | 'zh';
  activeContext?: 'work' | 'life';
  tasks: any[];
  notes: any[];
  filesMap: Record<string, string>;
  showToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
  initialDraft?: { text: string; key: string; sourceTitle?: string } | null;
  onDraftConsumed?: () => void;
}

export function AIChat({ language, activeContext = 'work', tasks, notes, filesMap, showToast, initialDraft, onDraftConsumed }: AIChatProps) {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null);
  const [skills, setSkills] = useState<PromptTemplateData[]>([]);

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showContextPicker, setShowContextPicker] = useState(false);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showSkillMenu, setShowSkillMenu] = useState(false);
  const [pendingSkillId, setPendingSkillId] = useState<string | null>(null);
  const [draftSourceTitle, setDraftSourceTitle] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      const stored = localStorage.getItem('df_ai_chat_sidebar_collapsed');
      if (stored !== null) return stored === '1';
      // Default: collapsed on small screens
      return typeof window !== 'undefined' && window.innerWidth < 768;
    } catch { return false; }
  });
  const [saveNoteModal, setSaveNoteModal] = useState<{
    open: boolean;
    title: string;
    content: string;
    type: 'note' | 'meeting_note' | 'summary';
  }>({ open: false, title: '', content: '', type: 'note' });

  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const providerStore = loadProviderConfigs();
    setProviders(providerStore.configs);
    setActiveProviderId(providerStore.activeId);

    const chatStore = loadChatStore();
    if (chatStore.sessions.length === 0) {
      const newSession = createNewSession();
      setSessions([newSession]);
      setActiveSessionId(newSession.id);
    } else {
      setSessions(chatStore.sessions);
      setActiveSessionId(chatStore.activeSessionId || chatStore.sessions[0].id);
    }

    promptsApi.getAll()
      .then(loaded => setSkills(sortSkillsByUsage(loaded, loadSkillUsage())))
      .catch(err => console.error('Load skills failed:', err));
  }, []);

  // Listen for provider config changes from other components (e.g. FloatingAIPanel)
  useEffect(() => {
    const handleProviderChange = () => {
      const ps = loadProviderConfigs();
      setProviders(ps.configs);
      setActiveProviderId(ps.activeId);
    };
    window.addEventListener('df:provider-changed', handleProviderChange);
    return () => window.removeEventListener('df:provider-changed', handleProviderChange);
  }, []);

  useEffect(() => {
    if (sessions.length > 0) {
      saveChatStore({ sessions, activeSessionId });
    }
  }, [sessions, activeSessionId]);

  // When NoteEditor sends a note over, start a fresh session and prefill the input.
  // The `key` ensures we don't re-fire if the same draft is still in props.
  const consumedDraftKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!initialDraft) return;
    if (consumedDraftKeyRef.current === initialDraft.key) return;
    consumedDraftKeyRef.current = initialDraft.key;
    const newSession = createNewSession();
    setSessions(prev => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    setInputValue(initialDraft.text);
    setDraftSourceTitle(initialDraft.sourceTitle || null);
    setTimeout(() => {
      textareaRef.current?.focus();
      const el = textareaRef.current;
      if (el) {
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 240) + 'px';
      }
    }, 50);
    onDraftConsumed?.();
  }, [initialDraft, onDraftConsumed]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSessionId, isStreaming]);

  useEffect(() => {
    try { localStorage.setItem('df_ai_chat_sidebar_collapsed', sidebarCollapsed ? '1' : '0'); } catch {}
  }, [sidebarCollapsed]);

  const activeSession = useMemo(
    () => sessions.find(s => s.id === activeSessionId) || null,
    [sessions, activeSessionId]
  );

  const activeProvider = useMemo(
    () => providers.find(p => p.id === activeProviderId) || null,
    [providers, activeProviderId]
  );

  const activeSkill = useMemo(
    () => pendingSkillId ? skills.find(s => s.id === pendingSkillId) : null,
    [skills, pendingSkillId]
  );

  const updateActiveSession = (updater: (s: ChatSession) => ChatSession) => {
    setSessions(prev => prev.map(s => s.id === activeSessionId ? updater(s) : s));
  };

  const handleNewSession = () => {
    const newSession = createNewSession();
    setSessions(prev => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    setPendingSkillId(null);
  };

  const handleDeleteSession = (id: string) => {
    if (!confirm(language === 'zh' ? '删除此对话？' : 'Delete this chat?')) return;
    setSessions(prev => {
      const filtered = prev.filter(s => s.id !== id);
      if (filtered.length === 0) {
        const newSession = createNewSession();
        setActiveSessionId(newSession.id);
        return [newSession];
      }
      if (activeSessionId === id) {
        setActiveSessionId(filtered[0].id);
      }
      return filtered;
    });
  };

  const startRenameSession = (session: ChatSession) => {
    setEditingSessionId(session.id);
    setEditTitle(session.title);
  };

  const commitRename = () => {
    if (!editingSessionId) return;
    const trimmed = editTitle.trim();
    if (!trimmed) {
      setEditingSessionId(null);
      return;
    }
    setSessions(prev => prev.map(s => s.id === editingSessionId ? { ...s, title: trimmed } : s));
    setEditingSessionId(null);
  };

  const handleAddContext = (item: ContextItem) => {
    updateActiveSession(s => ({
      ...s,
      contextItems: [...s.contextItems.filter(c => c.id !== item.id), item],
      updatedAt: new Date().toISOString(),
    }));
    // Don't close the picker — let the user pick multiple
  };

  const handleRemoveContext = (id: string) => {
    updateActiveSession(s => ({
      ...s,
      contextItems: s.contextItems.filter(c => c.id !== id),
      updatedAt: new Date().toISOString(),
    }));
  };

  const buildContextText = (items: ContextItem[]): string => {
    if (items.length === 0) return '';
    const parts: string[] = [];
    for (const item of items) {
      switch (item.type) {
        case 'today-tasks': {
          const todayTasks = tasks.filter(t => t.status !== 'done');
          parts.push(`## ${language === 'zh' ? '今日任务' : "Today's Tasks"}\n${
            todayTasks.length > 0
              ? todayTasks.map((t: any) => `- ${t.title}${t.tags?.length ? ` [${t.tags.join(', ')}]` : ''}`).join('\n')
              : (language === 'zh' ? '（无）' : '(none)')
          }`);
          break;
        }
        case 'date-tasks': {
          const date = item.data.date!;
          const content = filesMap[date];
          if (content) parts.push(`## ${language === 'zh' ? '任务' : 'Tasks'} (${date})\n${content}`);
          break;
        }
        case 'note': {
          const note = notes.find((n: any) => n.id === item.data.noteId);
          if (note) parts.push(`## ${language === 'zh' ? '笔记' : 'Note'}: ${note.title}\n${note.body || note.content || ''}`);
          break;
        }
        case 'project': {
          const projectName = item.data.projectName!;
          const projectTasks = tasks.filter((t: any) => t.project === projectName || t.tags?.includes(projectName));
          parts.push(`## ${language === 'zh' ? '项目' : 'Project'}: ${projectName}\n${
            projectTasks.map((t: any) => `- [${t.status === 'done' ? 'x' : ' '}] ${t.title}`).join('\n') || '(empty)'
          }`);
          break;
        }
        case 'custom-text':
          parts.push(`## ${item.label}\n${item.data.text || ''}`);
          break;
      }
    }
    return parts.join('\n\n');
  };

  const handleSend = async (overrideContent?: string) => {
    const contentToSend = (overrideContent || inputValue).trim();
    if (!contentToSend || isStreaming || !activeSession) return;
    if (!activeProvider) {
      showToast(
        language === 'zh' ? '请先添加一个模型供应商' : 'Please add a model provider first',
        'error'
      );
      setShowSettings(true);
      return;
    }

    const userMessage: ChatMessage = {
      id: generateShortId('msg'),
      role: 'user',
      content: contentToSend,
      timestamp: new Date().toISOString(),
    };

    const contextSnapshot = [...activeSession.contextItems];
    const userInputCopy = contentToSend;
    const skillForThisMessage = activeSkill;

    updateActiveSession(s => {
      const newMessages = [...s.messages, userMessage];
      return {
        ...s,
        messages: newMessages,
        title: s.messages.length === 0 ? deriveSessionTitle(newMessages) : s.title,
        updatedAt: new Date().toISOString(),
      };
    });

    setInputValue('');
    setDraftSourceTitle(null);
    setIsStreaming(true);
    setPendingSkillId(null);
    // Record skill usage (if any) and re-sort the skill list so the
    // just-used one floats to the top next time the menu opens.
    if (skillForThisMessage) {
      recordSkillUse(skillForThisMessage.id);
      setSkills(prev => sortSkillsByUsage(
        prev.some(s => s.id === skillForThisMessage.id) ? prev : [...prev, skillForThisMessage],
        loadSkillUsage()
      ));
    }

    const contextText = buildContextText(contextSnapshot);
    let userPrompt = userInputCopy;
    if (contextText) {
      userPrompt = `${userPrompt}\n\n---\n${language === 'zh' ? '参考以下上下文：' : 'Reference context:'}\n\n${contextText}`;
    }

    const baseSystemPrompt = skillForThisMessage
      ? (skillForThisMessage.systemPrompt || skillForThisMessage.prompt || '')
      : (language === 'zh'
        ? '你是一位专业、友好的 AI 助手，帮助用户管理日常工作和任务。回复简洁清晰，使用 Markdown 格式。'
        : 'You are a professional, friendly AI assistant helping with daily work and tasks. Reply concisely and clearly using Markdown.');
    const systemPrompt = baseSystemPrompt + buildToolInstructions(language);

    abortRef.current = new AbortController();

    try {
      const { summary } = await aiApi.summarize({
        apiKey: activeProvider.apiKey,
        model: activeProvider.model,
        baseUrl: activeProvider.baseUrl,
        systemPrompt,
        userPrompt,
      });

      // Parse and execute any tool calls in the response
      const { text: cleanedText, calls } = parseToolCalls(summary);
      const toolResults: { call: any; result: any }[] = [];
      for (const call of calls) {
        const result = await executeToolCall(call, {
          currentDate: getTodayStr(),
          activeContext,
          language,
          tasks,
          showToast,
        });
        toolResults.push({ call, result });
      }

      // Build AI message — if there were tool calls, show cleaned text + tool results
      let finalContent = cleanedText;
      if (toolResults.length > 0) {
        const toolSummary = toolResults.map(({ call, result }) => {
          const icon = result.success ? '✓' : '✗';
          return `${icon} **${call.name}**: ${result.message}`;
        }).join('\n');
        finalContent = cleanedText
          ? `${cleanedText}\n\n---\n${toolSummary}`
          : toolSummary;
      }

      const aiMessage: ChatMessage = {
        id: generateShortId('msg'),
        role: 'assistant',
        content: finalContent,
        timestamp: new Date().toISOString(),
        modelName: activeProvider.name,
        skillName: skillForThisMessage?.name,
        contextSnapshot,
      };

      updateActiveSession(s => ({
        ...s,
        messages: [...s.messages, aiMessage],
        updatedAt: new Date().toISOString(),
      }));
    } catch (err: any) {
      const rawError = err.message || String(err);
      const friendlyError = getFriendlyErrorMessage(rawError, language, activeProvider.name);

      const errorMessage: ChatMessage = {
        id: generateShortId('msg'),
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        modelName: activeProvider.name,
        error: friendlyError,
      };
      updateActiveSession(s => ({
        ...s,
        messages: [...s.messages, errorMessage],
        updatedAt: new Date().toISOString(),
      }));
      showToast(friendlyError, 'error');
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setIsStreaming(false);
  };

  const handleRetryMessage = (msgIndex: number) => {
    const session = activeSession;
    if (!session || msgIndex < 1) return;
    let userIdx = msgIndex - 1;
    while (userIdx >= 0 && session.messages[userIdx].role !== 'user') userIdx--;
    if (userIdx < 0) return;
    const userMsg = session.messages[userIdx];
    updateActiveSession(s => ({
      ...s,
      messages: s.messages.slice(0, userIdx),
      updatedAt: new Date().toISOString(),
    }));
    handleSend(userMsg.content);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleProviderChange = (id: string) => {
    setActiveProviderId(id);
    const store = loadProviderConfigs();
    store.activeId = id;
    localStorage.setItem('df_provider_configs', JSON.stringify(store));
    setShowModelMenu(false);
    const p = providers.find(pr => pr.id === id);
    if (p) showToast(language === 'zh' ? `已切换到 ${p.name}` : `Switched to ${p.name}`, 'success');
  };

  const reloadProvidersAndSkills = () => {
    const ps = loadProviderConfigs();
    setProviders(ps.configs);
    setActiveProviderId(ps.activeId);
    promptsApi.getAll()
      .then(loaded => setSkills(sortSkillsByUsage(loaded, loadSkillUsage())))
      .catch(() => {});
  };

  return (
    <div className="h-full flex bg-background">
      {/* —— Left: sessions —— */}
      <aside className={`flex flex-col border-r border-border bg-surface transition-all duration-200 ${sidebarCollapsed ? 'w-0 md:w-12 items-center overflow-hidden' : 'w-[260px]'}`}>
        {!sidebarCollapsed ? (
          <>
            <div className="px-4 pt-5 pb-3 border-b border-border">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-accent text-white flex items-center justify-center">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-bold text-text-heading">
                    {language === 'zh' ? 'AI 工作台' : 'AI Workspace'}
                  </span>
                </div>
                <button
                  onClick={() => setSidebarCollapsed(true)}
                  className="p-1 text-text-muted hover:text-text-heading transition-colors"
                  title={language === 'zh' ? '收起侧边栏' : 'Collapse sidebar'}
                >
                  <PanelLeftClose className="w-4 h-4" />
                </button>
              </div>
              <button
                onClick={handleNewSession}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                {language === 'zh' ? '新对话' : 'New Chat'}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-0.5 w-full">
              <div className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-wider text-text-muted/70 font-bold">
                {language === 'zh' ? '历史对话' : 'Recent'}
              </div>
              {sessions.map(session => (
                <div
                  key={session.id}
                  onClick={() => setActiveSessionId(session.id)}
                  className={`group flex items-center gap-2 px-2.5 py-2 rounded-md cursor-pointer transition-colors ${
                    activeSessionId === session.id
                      ? 'bg-accent/10 text-accent'
                      : 'hover:bg-surface-white text-text-heading'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5 flex-shrink-0" />
                  {editingSessionId === session.id ? (
                    <input
                      autoFocus
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitRename();
                        if (e.key === 'Escape') setEditingSessionId(null);
                      }}
                      onClick={e => e.stopPropagation()}
                      className="flex-1 text-xs bg-white border border-accent/40 rounded px-1.5 py-0.5 outline-none"
                    />
                  ) : (
                    <span
                      className="flex-1 text-xs truncate"
                      onDoubleClick={(e) => { e.stopPropagation(); startRenameSession(session); }}
                      title={language === 'zh' ? '双击重命名' : 'Double-click to rename'}
                    >
                      {session.title}
                    </span>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteSession(session.id); }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 text-text-muted hover:text-red-500 transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>

            <div className="p-2 border-t border-border w-full">
              <button
                onClick={() => setShowSettings(true)}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-text-muted hover:bg-surface-white hover:text-text-heading rounded-md transition-colors"
                title={language === 'zh' ? '在此处管理模型供应商和 Skill 提示词库' : 'Manage providers & skill prompts here'}
              >
                <Settings className="w-3.5 h-3.5" />
                {language === 'zh' ? '模型 & Skills 设置' : 'Models & Skills'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="pt-4 pb-2 border-b border-border flex flex-col items-center gap-3">
              <button
                onClick={handleNewSession}
                className="w-8 h-8 rounded-lg bg-accent text-white flex items-center justify-center hover:bg-accent/90 transition-colors shadow-sm"
                title={language === 'zh' ? '新对话' : 'New Chat'}
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                onClick={() => setSidebarCollapsed(false)}
                className="p-1 text-text-muted hover:text-text-heading transition-colors"
                title={language === 'zh' ? '展开侧边栏' : 'Expand sidebar'}
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-2 space-y-1 flex flex-col items-center w-full">
              {sessions.slice(0, 8).map(session => (
                <button
                  key={session.id}
                  onClick={() => setActiveSessionId(session.id)}
                  title={session.title}
                  className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors ${
                    activeSessionId === session.id
                      ? 'bg-accent/10 text-accent'
                      : 'hover:bg-surface-white text-text-muted'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                </button>
              ))}
            </div>
            <div className="py-2 border-t border-border flex flex-col items-center gap-2">
              <button
                onClick={() => setShowSettings(true)}
                className="w-8 h-8 rounded-md flex items-center justify-center text-text-muted hover:bg-surface-white hover:text-text-heading transition-colors"
                title={language === 'zh' ? '模型 & Skills 设置' : 'Models & Skills'}
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </>
        )}
      </aside>

      {/* —— Right: chat —— */}
      <section className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="px-4 md:px-6 py-3 md:py-4 border-b border-border bg-background flex items-center justify-between shrink-0 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setSidebarCollapsed(false)}
              className="md:hidden p-1 text-text-muted hover:text-text-heading shrink-0"
              title={language === 'zh' ? '打开对话列表' : 'Open sessions'}
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold text-text-heading truncate">
                {activeSession?.title || (language === 'zh' ? '新对话' : 'New chat')}
              </h2>
              <div className="flex items-center gap-2 mt-0.5">
                {activeProvider ? (
                  <>
                    <span className="inline-flex items-center gap-1 text-[11px] text-text-muted">
                      <Bot className="w-3 h-3" />
                      {activeProvider.name}
                      <span className="text-text-muted/60 font-mono truncate">· {activeProvider.model}</span>
                    </span>
                  </>
                ) : (
                  <button
                    onClick={() => setShowSettings(true)}
                    className="inline-flex items-center gap-1 text-[11px] text-amber-600 hover:underline"
                  >
                    <Bot className="w-3 h-3" />
                    {language === 'zh' ? '尚未配置模型，点这里添加' : 'No model configured — click to add'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          {!activeSession || activeSession.messages.length === 0 ? (
            <div className="h-full flex items-center justify-center px-4 md:px-6">
              <div className="text-center max-w-xl w-full">
                <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-accent to-accent/60 text-white flex items-center justify-center shadow-lg">
                  <Sparkles className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold text-text-heading mb-2">
                  {language === 'zh' ? '今天想聊点什么？' : 'What can I help with?'}
                </h2>
                <p className="text-sm text-text-muted mb-8">
                  {language === 'zh'
                    ? '把今日任务、笔记或某个项目挂上来当上下文，我会基于真实数据帮你分析'
                    : 'Attach tasks, notes, or projects as context. I will work with your real data.'}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-left">
                  {[
                    { icon: '📝', label: language === 'zh' ? '总结今日任务' : 'Summarize today',
                      hint: language === 'zh' ? '一段话回顾今天' : 'Recap today in a paragraph' },
                    { icon: '📊', label: language === 'zh' ? '生成周报' : 'Weekly report',
                      hint: language === 'zh' ? '按项目维度汇总' : 'Group by project' },
                    { icon: '🏷️', label: language === 'zh' ? '推荐标签' : 'Suggest tags',
                      hint: language === 'zh' ? '帮我归类未打标的任务' : 'Classify untagged tasks' },
                    { icon: '📋', label: language === 'zh' ? '拆解一个目标' : 'Break down a goal',
                      hint: language === 'zh' ? '变成可执行的子任务' : 'Into actionable steps' },
                  ].map(s => (
                    <button
                      key={s.label}
                      onClick={() => { setInputValue(s.label); textareaRef.current?.focus(); }}
                      className="group flex items-start gap-3 p-3.5 bg-surface border border-border rounded-xl hover:border-accent/40 hover:bg-surface-white transition-all"
                    >
                      <span className="text-xl leading-none mt-0.5">{s.icon}</span>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-text-heading">{s.label}</div>
                        <div className="text-[11px] text-text-muted mt-0.5">{s.hint}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="w-full px-4 md:px-8 lg:px-12 py-6 md:py-8 space-y-6 md:space-y-8">
              <AnimatePresence initial={false}>
                {activeSession.messages.map((msg, i) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="group"
                  >
                    <div className="flex items-start gap-4">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm ${
                        msg.role === 'user'
                          ? 'bg-accent text-white'
                          : 'bg-surface-white border border-border text-text-heading'
                      }`}>
                        {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-sm font-bold text-text-heading">
                            {msg.role === 'user' ? (language === 'zh' ? '你' : 'You') : 'AI'}
                          </span>
                          {msg.modelName && (
                            <span className="text-[10px] text-text-muted">· {msg.modelName}</span>
                          )}
                          {msg.skillName && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-accent bg-accent/10 px-1.5 py-0.5 rounded">
                              <Zap className="w-2.5 h-2.5" />
                              {msg.skillName}
                            </span>
                          )}
                        </div>
                        {msg.error ? (
                          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 leading-relaxed">
                            <div className="flex items-start gap-2.5">
                              <div className="w-5 h-5 rounded-full bg-amber-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                                <span className="text-amber-700 text-xs font-bold">!</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-bold text-amber-800 mb-1">
                                  {language === 'zh' ? '调用未完成' : 'Request did not complete'}
                                </div>
                                <div className="text-[13px] text-amber-900 whitespace-pre-wrap leading-[1.6]">
                                  {msg.error}
                                </div>
                                <div className="mt-3 flex items-center gap-2">
                                  <button
                                    onClick={() => setShowSettings(true)}
                                    className="px-2.5 py-1 text-[11px] font-bold bg-amber-200 text-amber-900 rounded hover:bg-amber-300 transition-colors"
                                  >
                                    {language === 'zh' ? '打开模型设置' : 'Open Model Settings'}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-[15px] text-text-heading leading-[1.7]">
                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                              p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                              ul: ({ children }) => <ul className="list-disc pl-5 mb-2">{children}</ul>,
                              ol: ({ children }) => <ol className="list-decimal pl-5 mb-2">{children}</ol>,
                              li: ({ children }) => <li className="mb-0.5">{children}</li>,
                              h1: ({ children }) => <h1 className="text-lg font-bold mt-3 mb-2">{children}</h1>,
                              h2: ({ children }) => <h2 className="text-base font-bold mt-3 mb-2">{children}</h2>,
                              h3: ({ children }) => <h3 className="text-sm font-bold mt-2 mb-1">{children}</h3>,
                              hr: () => <hr className="my-3 border-border/50" />,
                              code: ({ children, className }) => (
                                <code className={`${className ? 'block bg-surface p-2 rounded text-xs overflow-x-auto my-2' : 'bg-surface px-1 py-0.5 rounded text-xs'}`}>
                                  {children}
                                </code>
                              ),
                              pre: ({ children }) => <pre className="whitespace-pre-wrap">{children}</pre>,
                            }}>
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                        )}
                        {/* Message action bar */}
                        {msg.role === 'assistant' && !msg.error && (
                          <div className="flex items-center gap-1 mt-2">
                            <button
                              onClick={() => copyMessageContent(msg.content, { language, showToast })}
                              className="flex items-center gap-1 px-2 py-1 text-[11px] text-text-muted hover:text-text-heading hover:bg-surface rounded transition-colors"
                              title={language === 'zh' ? '复制' : 'Copy'}
                            >
                              <Copy className="w-3 h-3" />
                              {language === 'zh' ? '复制' : 'Copy'}
                            </button>
                            <button
                              onClick={() => {
                                const title = activeSession?.title || (language === 'zh' ? 'AI 笔记' : 'AI Note');
                                setSaveNoteModal({ open: true, title, content: msg.content, type: 'note' });
                              }}
                              className="flex items-center gap-1 px-2 py-1 text-[11px] text-text-muted hover:text-text-heading hover:bg-surface rounded transition-colors"
                              title={language === 'zh' ? '保存为笔记' : 'Save as note'}
                            >
                              <Bookmark className="w-3 h-3" />
                              {language === 'zh' ? '保存为笔记' : 'Save as note'}
                            </button>
                            <button
                              onClick={() => createTasksFromMessage(msg.content, { activeContext, language, showToast })}
                              className="flex items-center gap-1 px-2 py-1 text-[11px] text-text-muted hover:text-text-heading hover:bg-surface rounded transition-colors"
                              title={language === 'zh' ? '创建任务' : 'Create tasks'}
                            >
                              <PlusCircle className="w-3 h-3" />
                              {language === 'zh' ? '创建任务' : 'Create tasks'}
                            </button>
                            <button
                              onClick={() => handleRetryMessage(i)}
                              className="flex items-center gap-1 px-2 py-1 text-[11px] text-text-muted hover:text-text-heading hover:bg-surface rounded transition-colors"
                              title={language === 'zh' ? '重复提问' : 'Retry'}
                            >
                              <RotateCcw className="w-3 h-3" />
                              {language === 'zh' ? '重复提问' : 'Retry'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {isStreaming && (
                <div className="flex items-start gap-4">
                  <div className="w-9 h-9 rounded-xl bg-surface-white border border-border flex items-center justify-center">
                    <Loader2 className="w-4 h-4 animate-spin text-accent" />
                  </div>
                  <div className="text-[15px] text-text-muted pt-1.5">
                    {language === 'zh' ? '思考中…' : 'Thinking…'}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input area — composer card */}
        <div className="px-4 md:px-8 pb-4 md:pb-6 pt-2 shrink-0">
          <div className="w-full">
            {/* Context pills — sit right above the textarea, where the user types */}
            {activeSession && activeSession.contextItems.length > 0 && (
              <div className="mb-1.5 flex items-center gap-1.5 flex-wrap px-1">
                <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-text-muted/70 font-bold mr-0.5">
                  {language === 'zh' ? '上下文' : 'Context'}
                </span>
                {activeSession.contextItems.map(item => (
                  <span
                    key={item.id}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] bg-accent/10 border border-accent/20 text-accent rounded-full"
                  >
                    {item.type === 'today-tasks' && <Calendar className="w-3 h-3" />}
                    {item.type === 'date-tasks' && <Calendar className="w-3 h-3" />}
                    {item.type === 'note' && <FileText className="w-3 h-3" />}
                    {item.type === 'project' && <Folder className="w-3 h-3" />}
                    {item.type === 'custom-text' && <FileText className="w-3 h-3" />}
                    <span className="max-w-[160px] truncate font-medium">{item.label}</span>
                    <button
                      onClick={() => handleRemoveContext(item.id)}
                      className="text-accent/70 hover:text-red-500 transition-colors ml-0.5"
                      title={language === 'zh' ? '移除' : 'Remove'}
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {pendingSkillId && activeSkill && (
              <div className="mb-2 flex items-center gap-2 px-1">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold bg-accent/10 text-accent rounded">
                  <Zap className="w-3 h-3" />
                  {language === 'zh' ? '应用 Skill: ' : 'Skill: '}{activeSkill.name}
                </span>
                <button
                  onClick={() => setPendingSkillId(null)}
                  className="text-[11px] text-text-muted hover:text-red-500"
                >
                  {language === 'zh' ? '移除' : 'Remove'}
                </button>
              </div>
            )}

            {draftSourceTitle && (
              <div className="mb-2 flex items-center gap-2 px-1">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded">
                  <FileText className="w-3 h-3" />
                  {language === 'zh' ? '来自笔记: ' : 'From note: '}{draftSourceTitle}
                </span>
                <button
                  onClick={() => setDraftSourceTitle(null)}
                  className="text-[11px] text-text-muted hover:text-red-500"
                >
                  {language === 'zh' ? '清除' : 'Clear'}
                </button>
              </div>
            )}

            <div className="bg-surface-white border border-border rounded-2xl shadow-sm focus-within:border-accent/50 focus-within:ring-2 focus-within:ring-accent/10 transition-all">
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={e => { setInputValue(e.target.value); setDraftSourceTitle(null); }}
                onKeyDown={handleKeyDown}
                placeholder={language === 'zh' ? '问点什么…  Enter 发送 / Shift+Enter 换行' : 'Ask anything…  Enter to send · Shift+Enter for new line'}
                rows={2}
                className="w-full px-5 pt-4 pb-2 text-[15px] bg-transparent focus:outline-none resize-none placeholder:text-text-muted/60 leading-relaxed"
              />

              <div className="flex items-center gap-1.5 px-3 pb-3">
                {/* Add context */}
                <button
                  onClick={() => setShowContextPicker(true)}
                  className={`relative flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    (activeSession?.contextItems.length || 0) > 0
                      ? 'text-accent bg-accent/10 hover:bg-accent/15'
                      : 'text-text-muted hover:text-accent hover:bg-accent/5'
                  }`}
                  title={language === 'zh' ? '挂载上下文' : 'Attach context'}
                >
                  <Paperclip className="w-3.5 h-3.5" />
                  {language === 'zh' ? '上下文' : 'Context'}
                  {(activeSession?.contextItems.length || 0) > 0 && (
                    <span className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full bg-accent text-white">
                      {activeSession!.contextItems.length}
                    </span>
                  )}
                </button>

                {/* Skill picker */}
                <div className="relative">
                  <button
                    onClick={() => { setShowSkillMenu(!showSkillMenu); setShowModelMenu(false); }}
                    className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                      pendingSkillId ? 'bg-accent/10 text-accent' : 'text-text-muted hover:text-accent hover:bg-accent/5'
                    }`}
                    title={language === 'zh' ? '选择 Skill' : 'Pick Skill'}
                  >
                    <Zap className="w-3.5 h-3.5" />
                    {pendingSkillId && activeSkill ? activeSkill.name : (language === 'zh' ? 'Skill' : 'Skill')}
                    <ChevronDown className="w-2.5 h-2.5" />
                  </button>
                  {showSkillMenu && (
                    <div className="absolute bottom-full mb-1.5 left-0 w-72 bg-surface-white border border-border rounded-lg shadow-lg max-h-72 overflow-y-auto z-50">
                      <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-text-muted/80 font-bold border-b border-border">
                        {language === 'zh' ? 'Skills（提示词预设）' : 'Skills (prompt presets)'}
                      </div>
                      {skills.length === 0 ? (
                        <div className="p-4 text-xs text-text-muted">
                          <p className="mb-2">{language === 'zh' ? '还没有 Skill。' : 'No skills yet.'}</p>
                          <button
                            onClick={() => { setShowSkillMenu(false); setShowSettings(true); }}
                            className="text-accent font-bold hover:underline"
                          >
                            {language === 'zh' ? '+ 在「模型 & Skills 设置」中添加' : '+ Manage in Models & Skills'}
                          </button>
                        </div>
                      ) : (
                        <>
                          {skills.map(skill => (
                            <button
                              key={skill.id}
                              onClick={() => { setPendingSkillId(skill.id); setShowSkillMenu(false); }}
                              className={`w-full text-left px-3 py-2 text-xs hover:bg-surface transition-colors ${
                                pendingSkillId === skill.id ? 'bg-accent/10 text-accent' : ''
                              }`}
                              title={skill.description || ''}
                            >
                              <div className="font-bold">{skill.name}</div>
                              <div className="text-[10px] text-text-muted truncate">
                                {skill.description || (skill.systemPrompt || skill.prompt || '').slice(0, 60) + '…'}
                              </div>
                            </button>
                          ))}
                          <button
                            onClick={() => { setShowSkillMenu(false); setShowSettings(true); }}
                            className="w-full text-left px-3 py-2 text-[11px] font-bold text-accent border-t border-border hover:bg-accent/5"
                          >
                            {language === 'zh' ? '管理 Skills…' : 'Manage skills…'}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Model picker */}
                <div className="relative ml-auto">
                  <button
                    onClick={() => { setShowModelMenu(!showModelMenu); setShowSkillMenu(false); }}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-text-muted hover:text-accent hover:bg-accent/5 rounded-lg transition-colors"
                    title={language === 'zh' ? '切换模型' : 'Switch model'}
                  >
                    <Bot className="w-3.5 h-3.5" />
                    {activeProvider?.name || (language === 'zh' ? '选择模型' : 'Pick model')}
                    <ChevronDown className="w-2.5 h-2.5" />
                  </button>
                  {showModelMenu && (
                    <div className="absolute bottom-full mb-1.5 right-0 w-72 bg-surface-white border border-border rounded-lg shadow-lg max-h-72 overflow-y-auto z-50">
                      <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-text-muted/80 font-bold border-b border-border">
                        {language === 'zh' ? '模型供应商' : 'Providers'}
                      </div>
                      {providers.length === 0 ? (
                        <div className="p-4 text-xs text-text-muted">
                          <p className="mb-2">{language === 'zh' ? '还没有添加任何模型。' : 'No providers yet.'}</p>
                          <button
                            onClick={() => { setShowModelMenu(false); setShowSettings(true); }}
                            className="text-accent font-bold hover:underline"
                          >
                            {language === 'zh' ? '+ 添加供应商' : '+ Add provider'}
                          </button>
                        </div>
                      ) : (
                        <>
                          {providers.map(p => (
                            <button
                              key={p.id}
                              onClick={() => handleProviderChange(p.id)}
                              className={`w-full text-left px-3 py-2 text-xs hover:bg-surface transition-colors ${
                                activeProviderId === p.id ? 'bg-accent/10 text-accent' : ''
                              }`}
                            >
                              <div className="font-bold flex items-center gap-1">
                                {p.name}
                                {activeProviderId === p.id && <span className="ml-auto text-[10px]">✓</span>}
                              </div>
                              <div className="text-[10px] text-text-muted truncate font-mono">{p.model}</div>
                            </button>
                          ))}
                          <button
                            onClick={() => { setShowModelMenu(false); setShowSettings(true); }}
                            className="w-full text-left px-3 py-2 text-[11px] font-bold text-accent border-t border-border hover:bg-accent/5"
                          >
                            {language === 'zh' ? '管理供应商…' : 'Manage providers…'}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Send */}
                <button
                  onClick={isStreaming ? handleStop : () => handleSend()}
                  disabled={!isStreaming && !inputValue.trim()}
                  className={`p-2 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    isStreaming
                      ? 'bg-red-500 text-white hover:bg-red-600'
                      : 'bg-accent text-white hover:bg-accent/90'
                  }`}
                  title={isStreaming ? (language === 'zh' ? '停止' : 'Stop') : (language === 'zh' ? '发送' : 'Send')}
                >
                  {isStreaming ? <StopCircle className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <p className="text-[10px] text-text-muted/70 text-center mt-2">
              {language === 'zh'
                ? `通过「模型 & Skills 设置」管理供应商与提示词预设`
                : `Manage providers & prompt presets in “Models & Skills”`}
            </p>
          </div>
        </div>
      </section>

      {/* Settings modal */}
      <AnimatePresence>
        {showSettings && (
          <ChatSettingsPanel
            language={language}
            onClose={() => {
              setShowSettings(false);
              reloadProvidersAndSkills();
              persistProviderConfigsToBackend();
            }}
          />
        )}
      </AnimatePresence>

      {/* Context picker modal */}
      <AnimatePresence>
        {showContextPicker && (
          <ContextPicker
            language={language}
            tasks={tasks}
            notes={notes}
            filesMap={filesMap}
            selectedItems={activeSession?.contextItems || []}
            onSelect={handleAddContext}
            onDeselect={handleRemoveContext}
            onClose={() => setShowContextPicker(false)}
          />
        )}
      </AnimatePresence>

      {/* Save as Note modal */}
      <AnimatePresence>
        {saveNoteModal.open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[1px] flex items-center justify-center"
            onClick={() => setSaveNoteModal(prev => ({ ...prev, open: false }))}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.15 }}
              className="bg-surface-white border border-border rounded-xl shadow-xl w-full max-w-lg mx-4 overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="px-5 py-3 border-b border-border flex items-center justify-between"
              >
                <h3 className="text-sm font-bold text-text-heading"
                >
                  {language === 'zh' ? '保存为笔记' : 'Save as Note'}
                </h3>
                <button
                  onClick={() => setSaveNoteModal(prev => ({ ...prev, open: false }))}
                  className="p-1 text-text-muted hover:text-red-500 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5 space-y-3"
              >
                <div>
                  <label className="block text-[11px] font-bold text-text-muted mb-1"
                  >{language === 'zh' ? '标题' : 'Title'}</label>
                  <input
                    type="text"
                    value={saveNoteModal.title}
                    onChange={e => setSaveNoteModal(prev => ({ ...prev, title: e.target.value }))}
                    className="w-full px-3 py-1.5 text-sm border border-border rounded bg-surface focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-text-muted mb-1"
                  >{language === 'zh' ? '类型' : 'Type'}</label>
                  <select
                    value={saveNoteModal.type}
                    onChange={e => setSaveNoteModal(prev => ({ ...prev, type: e.target.value as any }))}
                    className="w-full px-3 py-1.5 text-sm border border-border rounded bg-surface focus:outline-none focus:border-accent"
                  >
                    <option value="note"
                    >{language === 'zh' ? '笔记' : 'Note'}</option>
                    <option value="meeting_note"
                    >{language === 'zh' ? '会议' : 'Meeting'}</option>
                    <option value="summary"
                    >{language === 'zh' ? '总结' : 'Summary'}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-text-muted mb-1"
                  >{language === 'zh' ? '内容预览' : 'Content Preview'}</label>
                  <div className="w-full px-3 py-2 text-sm border border-border rounded bg-surface max-h-40 overflow-y-auto whitespace-pre-wrap"
                  >
                    {saveNoteModal.content}
                  </div>
                </div>
              </div>
              <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2"
              >
                <button
                  onClick={() => setSaveNoteModal(prev => ({ ...prev, open: false }))}
                  className="px-3 py-1.5 text-xs font-bold text-text-muted hover:text-text-heading transition-colors"
                >
                  {language === 'zh' ? '取消' : 'Cancel'}
                </button>
                <button
                  onClick={async () => {
                    try {
                      await notesApi.create({
                        title: saveNoteModal.title.trim(),
                        body: saveNoteModal.content,
                        type: saveNoteModal.type as any,
                        date: new Date().toISOString().slice(0, 10),
                        context: 'work',
                        tags: ['ai-generated'],
                        linkedTaskIds: [],
                        linkedProjectIds: [],
                      });
                      showToast(language === 'zh' ? '已保存到笔记' : 'Saved to notes', 'success');
                      setSaveNoteModal({ open: false, title: '', content: '', type: 'note' });
                    } catch (e) {
                      showToast(language === 'zh' ? '保存失败' : 'Save failed', 'error');
                    }
                  }}
                  disabled={!saveNoteModal.title.trim()}
                  className="px-4 py-1.5 text-xs font-bold bg-accent text-white rounded hover:bg-accent/90 transition-colors disabled:opacity-50"
                >
                  {language === 'zh' ? '保存' : 'Save'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
