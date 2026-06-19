/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
import { loadProviderConfigs, saveProviderConfigs, persistProviderConfigsToBackend, type ProviderConfig } from '../types/models';
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

export interface FloatingAIPanelProps {
  isOpen: boolean;
  onClose: () => void;
  language: 'en' | 'zh';
  activeContext?: 'work' | 'life';
  tasks: any[];
  notes: any[];
  filesMap: Record<string, string>;
  showToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
  initialDraft?: { text: string; key: string; sourceTitle?: string; contextText?: string; contextLabel?: string; noteId?: string } | null;
  onDraftConsumed?: () => void;
  onNoteCreated?: () => void;
  focusedContext?: { type: 'note' | 'today'; id?: string; title?: string; content?: string } | null;
}

export function FloatingAIPanel({
  isOpen,
  onClose,
  language,
  activeContext = 'work',
  tasks,
  notes,
  filesMap,
  showToast,
  initialDraft,
  onDraftConsumed,
  onNoteCreated,
  focusedContext
}: FloatingAIPanelProps) {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null);
  const [skills, setSkills] = useState<PromptTemplateData[]>([]);

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const [inputValue, setInputValue] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showContextPicker, setShowContextPicker] = useState(false);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showSkillMenu, setShowSkillMenu] = useState(false);
  const [pendingSkillId, setPendingSkillId] = useState<string | null>(null);

  // Resizable panel dimensions
  const [panelSize, setPanelSize] = useState(() => {
    try {
      const stored = localStorage.getItem('df_ai_panel_size');
      if (stored) return JSON.parse(stored) as { w: number; h: number };
    } catch {}
    return { w: 380, h: 600 };
  });
  const resizeRef = useRef<{ startX: number; startY: number; startW: number; startH: number; edge: string } | null>(null);

  const handleResizeStart = useCallback((e: React.MouseEvent, edge: string) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { startX: e.clientX, startY: e.clientY, startW: panelSize.w, startH: panelSize.h, edge };
    const handleMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const { startX, startY, startW, startH, edge: edg } = resizeRef.current;
      let newW = startW, newH = startH;
      if (edg.includes('l')) newW = Math.max(320, Math.min(800, startW - (ev.clientX - startX)));
      if (edg.includes('b')) newH = Math.max(400, Math.min(window.innerHeight - 100, startH + (ev.clientY - startY)));
      setPanelSize({ w: newW, h: newH });
    };
    const handleUp = () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      if (resizeRef.current) {
        const finalSize = { w: panelSize.w, h: panelSize.h };
        // Read latest from DOM via setState callback
        setPanelSize(prev => {
          try { localStorage.setItem('df_ai_panel_size', JSON.stringify(prev)); } catch {}
          return prev;
        });
      }
      resizeRef.current = null;
    };
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, [panelSize]);
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
    tags: string[];
    savedNoteId: string | null;
    linkedTaskIds: string[];
    linkedProjectIds: string[];
  }>({ open: false, title: '', content: '', type: 'note', tags: ['ai-generated'], savedNoteId: null, linkedTaskIds: [], linkedProjectIds: [] });

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

  // Listen for provider config changes from other components (e.g. AIChat tab)
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
    // Bind the note as an attached context item rather than dumping its full
    // body into the input — the user types their question, the note rides along.
    if (initialDraft.noteId) {
      newSession.contextItems = [{
        id: `ctx_note_${initialDraft.key}`,
        type: 'note',
        label: initialDraft.contextLabel || initialDraft.sourceTitle || (language === 'zh' ? '笔记' : 'Note'),
        data: { noteId: initialDraft.noteId },
      }];
    } else if (initialDraft.contextText) {
      newSession.contextItems = [{
        id: `ctx_note_${initialDraft.key}`,
        type: 'custom-text',
        label: initialDraft.contextLabel || initialDraft.sourceTitle || (language === 'zh' ? '笔记' : 'Note'),
        data: { text: initialDraft.contextText },
      }];
    }
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
          const taskId = item.data.taskId;
          if (taskId) {
            const task = tasks.find((t: any) => t.id === taskId);
            if (task) {
              parts.push(`## ${language === 'zh' ? '任务' : 'Task'}\n- ${task.title}${task.tags?.length ? ` [${task.tags.join(', ')}]` : ''}`);
            }
          } else {
            const todayTasks = tasks.filter(t => t.status !== 'done');
            parts.push(`## ${language === 'zh' ? '今日任务' : "Today's Tasks"}\n${
              todayTasks.length > 0
                ? todayTasks.map((t: any) => `- ${t.title}${t.tags?.length ? ` [${t.tags.join(', ')}]` : ''}`).join('\n')
                : (language === 'zh' ? '（无）' : '(none)')
            }`);
          }
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

  const buildAutoContextText = (): string => {
    if (!focusedContext) return '';

    if (focusedContext.type === 'today') {
      const todayTasks = tasks.filter((t: any) => t.status !== 'done');
      if (todayTasks.length === 0) return '';
      return `## ${language === 'zh' ? '今日任务' : "Today's Tasks"}\n${todayTasks.map((t: any) => `- [${t.status === 'done' ? 'x' : ' '}] ${t.title}${t.tags?.length ? ` [${t.tags.join(', ')}]` : ''}`).join('\n')}`;
    }

    if (focusedContext.type === 'note') {
      if (focusedContext.content) {
        return `## ${language === 'zh' ? '当前笔记' : 'Current Note'}${focusedContext.title ? ': ' + focusedContext.title : ''}\n${focusedContext.content}`;
      }
      if (notes.length > 0) {
        const recentNotes = notes.slice(0, 5);
        return `## ${language === 'zh' ? '笔记列表' : 'Notes'}\n${recentNotes.map((n: any) => `- ${n.title || (language === 'zh' ? '（无标题）' : '(untitled)')}`).join('\n')}`;
      }
    }

    return '';
  };

  const autoContextLabel = useMemo(() => {
    if (!focusedContext) return null;
    if (focusedContext.type === 'today') {
      const count = tasks.filter((t: any) => t.status !== 'done').length;
      return `${language === 'zh' ? '今日任务' : "Today's Tasks"} (${count})`;
    }
    if (focusedContext.type === 'note') {
      return focusedContext.title || (language === 'zh' ? '当前笔记' : 'Current Note');
    }
    return null;
  }, [focusedContext, tasks, language]);

  const placeholderText = useMemo(() => {
    if (focusedContext) {
      return language === 'zh' ? '关于当前内容问点什么…' : 'Ask about the current content…';
    }
    return language === 'zh' ? '问点什么…' : 'Ask anything…';
  }, [focusedContext, language]);

  const resolveSlashCommand = (text: string): { content: string; matchedSkill: PromptTemplateData | null } => {
    if (!text.startsWith('/')) return { content: text, matchedSkill: null };
    const cmd = text.split(/\s/)[0];
    const matched = skills.find(s => s.commands?.some(c => c === cmd));
    if (matched) {
      return { content: text.slice(cmd.length).trim(), matchedSkill: matched };
    }
    return { content: text, matchedSkill: null };
  };

  const handleSend = async (overrideContent?: string) => {
    let contentToSend = (overrideContent || inputValue).trim();
    if (!contentToSend || isStreaming || !activeSession) return;

    // Slash command resolution
    const { content: cleanedContent, matchedSkill } = resolveSlashCommand(contentToSend);
    if (matchedSkill) {
      contentToSend = cleanedContent;
      setPendingSkillId(matchedSkill.id);
    }

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
    // Use matchedSkill directly (from slash command) to avoid race with useMemo
    const skillForThisMessage = matchedSkill || activeSkill;

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
    // Clear pending skill only if it wasn't set by slash command this turn
    if (!matchedSkill) setPendingSkillId(null);
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
    const autoContextText = buildAutoContextText();
    let userPrompt = userInputCopy;

    const contexts: string[] = [];
    if (autoContextText) contexts.push(autoContextText);
    if (contextText) contexts.push(contextText);

    // Agent skill injection: append knowledge base to user prompt instead of replacing system prompt
    if (skillForThisMessage && skillForThisMessage.type === 'agent') {
      contexts.push(`${language === 'zh' ? '参考以下知识库：' : 'Reference knowledge base:'}\n\n${skillForThisMessage.systemPrompt || skillForThisMessage.prompt || ''}`);
    }

    if (contexts.length > 0) {
      userPrompt = `${userPrompt}\n\n---\n${language === 'zh' ? '参考以下上下文：' : 'Reference context:'}\n\n${contexts.join('\n\n---\n')}`;
    }

    const defaultSystemPrompt = language === 'zh'
      ? '你是一位专业、友好的 AI 助手，帮助用户管理日常工作和任务。回复简洁清晰，使用 Markdown 格式。'
      : 'You are a professional, friendly AI assistant helping with daily work and tasks. Reply concisely and clearly using Markdown.';
    const baseSystemPrompt = (skillForThisMessage && skillForThisMessage.type !== 'agent')
      ? (skillForThisMessage.systemPrompt || skillForThisMessage.prompt || '')
      : defaultSystemPrompt;
    const systemPrompt = baseSystemPrompt + buildToolInstructions(language);

    abortRef.current = new AbortController();

    try {
      const { summary } = await aiApi.summarize({
        apiKey: activeProvider.apiKey,
        model: activeProvider.model,
        baseUrl: activeProvider.baseUrl,
        systemPrompt,
        userPrompt,
        signal: abortRef.current?.signal,
      });

      // If the user aborted while the request was in flight, don't append the response.
      if (abortRef.current?.signal.aborted) {
        setIsStreaming(false);
        abortRef.current = null;
        return;
      }

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
      if (rawError.toLowerCase().includes('abort') || err.name === 'AbortError') {
        // User-initiated stop; don't show an error message.
      } else {
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
      }
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
    if (e.key === 'Enter' && !e.shiftKey && !isComposing && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleProviderChange = (id: string) => {
    setActiveProviderId(id);
    const store = loadProviderConfigs();
    store.activeId = id;
    saveProviderConfigs(store); // persists + dispatches df:provider-changed so Notes/NoteEditor stay in sync
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
    <>
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          style={{ width: panelSize.w, height: panelSize.h, maxHeight: 'calc(100vh - 120px)', maxWidth: 'calc(100vw - 2rem)' }}
          className="fixed top-16 sm:top-16 right-4 sm:right-6 z-[60] flex flex-col bg-white/85 backdrop-blur-2xl border border-white/50 shadow-2xl shadow-black/5 rounded-2xl overflow-hidden"
        >
          {/* Resize handles */}
          <div
            onMouseDown={e => handleResizeStart(e, 'l')}
            className="absolute left-0 top-2 bottom-2 w-1.5 cursor-col-resize hover:bg-accent/20 rounded-full transition-colors z-10"
          />
          <div
            onMouseDown={e => handleResizeStart(e, 'b')}
            className="absolute bottom-0 left-2 right-2 h-1.5 cursor-row-resize hover:bg-accent/20 rounded-full transition-colors z-10"
          />
          <div
            onMouseDown={e => handleResizeStart(e, 'lb')}
            className="absolute left-0 bottom-0 w-3 h-3 cursor-nesw-resize z-10"
          />
          {/* Top bar */}
          <header className="px-4 py-3 border-b border-border/30 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-accent text-white flex items-center justify-center shadow-sm">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <h2 className="text-sm font-semibold text-text-heading truncate">
                {activeSession?.title || (language === 'zh' ? '新对话' : 'New chat')}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleNewSession}
                className="p-1.5 text-text-muted hover:text-accent transition-colors rounded-md hover:bg-black/5"
                title={language === 'zh' ? '新对话' : 'New chat'}
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowSettings(true)}
                className="p-1.5 text-text-muted hover:text-text-heading transition-colors rounded-md hover:bg-black/5"
                title={language === 'zh' ? '设置' : 'Settings'}
              >
                <Settings className="w-4 h-4" />
              </button>
              <button
                onClick={onClose}
                className="p-1.5 text-text-muted hover:text-text-heading transition-colors rounded-md hover:bg-black/5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </header>

          {/* Context indicator */}
          {focusedContext && (
            <div className="px-3 py-1.5 bg-accent/5 border-b border-accent/10 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse"></span>
              <span className="text-[10px] font-bold text-accent">
                {language === 'zh' ? '当前范围: ' : 'Scoped to: '}
                {focusedContext.type === 'note'
                  ? focusedContext.title
                  : (language === 'zh' ? '今日任务' : "Today")}
              </span>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto">
            {!activeSession || activeSession.messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center px-6 py-8 text-center">
                <div className="w-12 h-12 mb-4 rounded-2xl bg-gradient-to-br from-accent/80 to-accent/40 text-white flex items-center justify-center shadow-md">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-text-heading mb-2">
                  {language === 'zh' ? 'AI 助手已就绪' : 'AI Assistant Ready'}
                </h3>
                <p className="text-xs text-text-muted mb-6">
                  {language === 'zh'
                    ? '我可以帮您分析当前内容、提取待办或润色文本。'
                    : 'I can analyze the current context, extract tasks, or refine text.'}
                </p>
                <div className="flex flex-col gap-2 w-full">
                  {[
                    { label: language === 'zh' ? '总结当前内容' : 'Summarize this',
                      prompt: language === 'zh' ? '总结一下当前的内容' : 'Summarize the current content' },
                    { label: language === 'zh' ? '提取待办事项' : 'Extract tasks',
                      prompt: language === 'zh' ? '从当前内容中提取待办事项' : 'Extract tasks from the current content' },
                  ].map(s => (
                    <button
                      key={s.label}
                      onClick={() => { setInputValue(s.prompt); textareaRef.current?.focus(); }}
                      className="px-3 py-2 text-xs text-left bg-surface border border-border/50 rounded-lg hover:border-accent/30 hover:bg-surface-white transition-all shadow-sm"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="px-4 py-4 space-y-4">
                <AnimatePresence initial={false}>
                  {activeSession.messages.map((msg, i) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="group flex flex-col"
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[10px] font-bold text-text-heading">
                          {msg.role === 'user' ? (language === 'zh' ? '你' : 'You') : 'AI'}
                        </span>
                        {msg.modelName && (
                          <span className="text-[9px] text-text-muted">· {msg.modelName}</span>
                        )}
                        {msg.skillName && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-accent bg-accent/10 px-1 py-0.5 rounded">
                            <Zap className="w-2 h-2" />
                            {msg.skillName}
                          </span>
                        )}
                      </div>

                      <div className={`p-2.5 rounded-xl text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-accent/5 border border-accent/10 text-text-heading'
                          : 'bg-surface-white border border-border/50 text-text-heading'
                      }`}>
                        {msg.error ? (
                          <div className="text-amber-800 text-xs">{msg.error}</div>
                        ) : (
                          <div className="text-sm leading-relaxed">
                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                              p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
                              ul: ({ children }) => <ul className="list-disc pl-4 mb-1.5">{children}</ul>,
                              ol: ({ children }) => <ol className="list-decimal pl-4 mb-1.5">{children}</ol>,
                              li: ({ children }) => <li className="mb-0.5">{children}</li>,
                              h1: ({ children }) => <h1 className="text-base font-bold mt-2 mb-1">{children}</h1>,
                              h2: ({ children }) => <h2 className="text-sm font-bold mt-2 mb-1">{children}</h2>,
                              h3: ({ children }) => <h3 className="text-xs font-bold mt-1.5 mb-0.5">{children}</h3>,
                              hr: () => <hr className="my-2 border-border/50" />,
                              code: ({ children, className }) => (
                                <code className={`${className ? 'block bg-surface p-1.5 rounded text-[11px] overflow-x-auto my-1.5' : 'bg-surface px-1 py-0.5 rounded text-[11px]'}`}>
                                  {children}
                                </code>
                              ),
                              pre: ({ children }) => <pre className="whitespace-pre-wrap">{children}</pre>,
                            }}>
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                        )}
                      </div>

                      {/* Message action bar */}
                      {msg.role === 'assistant' && !msg.error && (
                        <div className="flex items-center gap-1 mt-1">
                          <button
                            onClick={() => copyMessageContent(msg.content, { language, showToast })}
                            className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-text-muted hover:text-text-heading hover:bg-surface rounded transition-colors"
                            title={language === 'zh' ? '复制' : 'Copy'}
                          >
                            <Copy className="w-3 h-3" />
                            {language === 'zh' ? '复制' : 'Copy'}
                          </button>
                          <button
                            onClick={() => {
                              // Auto-extract title from first H1 or first line
                              let title = activeSession?.title || (language === 'zh' ? 'AI 笔记' : 'AI Note');
                              const h1Match = msg.content.match(/^#\s+(.+)$/m);
                              if (h1Match) {
                                title = h1Match[1].trim();
                              } else {
                                const firstLine = msg.content.split('\n')[0].trim();
                                if (firstLine && firstLine.length <= 80) title = firstLine;
                              }
                              // Extract links from the context snapshot that produced this reply.
                              const linkedTaskIds = msg.contextSnapshot
                                ?.filter(c => c.type === 'today-tasks' && c.data.taskId)
                                .map(c => c.data.taskId as string) || [];
                              const linkedProjectIds = msg.contextSnapshot
                                ?.filter(c => c.type === 'project' && c.data.projectName)
                                .map(c => c.data.projectName as string) || [];
                              // Check for duplicate: same content already saved as a note (normalized).
                              const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
                              const duplicate = notes.find((n: any) => normalize(n.body) === normalize(msg.content));
                              setSaveNoteModal({
                                open: true,
                                title,
                                content: msg.content,
                                type: 'note',
                                tags: ['ai-generated'],
                                savedNoteId: duplicate?.id || null,
                                linkedTaskIds,
                                linkedProjectIds,
                              });
                            }}
                            className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-text-muted hover:text-text-heading hover:bg-surface rounded transition-colors"
                            title={language === 'zh' ? '保存为笔记' : 'Save as note'}
                          >
                            <Bookmark className="w-3 h-3" />
                            {language === 'zh' ? '保存为笔记' : 'Save as note'}
                          </button>
                          <button
                            onClick={() => createTasksFromMessage(msg.content, { activeContext, language, showToast })}
                            className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-text-muted hover:text-text-heading hover:bg-surface rounded transition-colors"
                            title={language === 'zh' ? '创建任务' : 'Create tasks'}
                          >
                            <PlusCircle className="w-3 h-3" />
                            {language === 'zh' ? '创建任务' : 'Create tasks'}
                          </button>
                          <button
                            onClick={() => handleRetryMessage(i)}
                            className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-text-muted hover:text-text-heading hover:bg-surface rounded transition-colors"
                            title={language === 'zh' ? '重复提问' : 'Retry'}
                          >
                            <RotateCcw className="w-3 h-3" />
                            {language === 'zh' ? '重复提问' : 'Retry'}
                          </button>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>

                {isStreaming && (
                  <div className="flex items-center gap-2 text-xs text-text-muted">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
                    {language === 'zh' ? '思考中…' : 'Thinking…'}
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input area */}
          <div className="p-3 bg-surface-white border-t border-border/30 shrink-0">
            {/* Context pills bar */}
            {(focusedContext || (activeSession && activeSession.contextItems.length > 0)) && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {focusedContext && autoContextLabel && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/10 text-accent text-[10px] font-medium border border-accent/20">
                    {focusedContext.type === 'today' ? '📋' : '📄'}
                    <span className="opacity-70">{language === 'zh' ? '自动' : 'Auto'}</span>
                    <span className="opacity-50">·</span>
                    <span>{autoContextLabel}</span>
                  </span>
                )}
                {activeSession?.contextItems.map(item => (
                  <span key={item.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface text-text-muted text-[10px] font-medium border border-border/50">
                    {item.label}
                    <button
                      onClick={() => handleRemoveContext(item.id)}
                      className="hover:text-red-500 transition-colors"
                      title={language === 'zh' ? '移除' : 'Remove'}
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="bg-surface border border-border/50 rounded-xl shadow-sm focus-within:border-accent/40 focus-within:ring-2 focus-within:ring-accent/10 transition-all">
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={e => { setInputValue(e.target.value); setDraftSourceTitle(null); }}
                onCompositionStart={() => setIsComposing(true)}
                onCompositionEnd={() => setIsComposing(false)}
                onKeyDown={handleKeyDown}
                placeholder={placeholderText}
                rows={1}
                className="w-full px-3 py-2.5 text-sm bg-transparent focus:outline-none resize-none placeholder:text-text-muted/60 leading-relaxed max-h-32"
              />
              <div className="flex items-center justify-between px-2 pb-2">
                <div className="flex items-center gap-1">
                  {/* Skill picker */}
                  <div className="relative">
                    <button
                      onClick={() => { setShowSkillMenu(!showSkillMenu); setShowModelMenu(false); }}
                      className={`flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-md transition-colors ${
                        pendingSkillId ? 'bg-accent/10 text-accent' : 'text-text-muted hover:text-accent hover:bg-accent/5'
                      }`}
                      title={language === 'zh' ? '选择 Skill' : 'Pick Skill'}
                    >
                      <Zap className="w-3 h-3" />
                      {pendingSkillId && activeSkill ? activeSkill.name : 'Skill'}
                    </button>
                    {showSkillMenu && (
                      <div className="absolute bottom-full mb-1 left-0 w-48 bg-white border border-border/50 rounded-lg shadow-xl max-h-60 overflow-y-auto z-50">
                        {skills.map(skill => (
                          <button
                            key={skill.id}
                            onClick={() => { setPendingSkillId(skill.id); setShowSkillMenu(false); }}
                            className="w-full text-left px-3 py-2 text-xs hover:bg-surface transition-colors truncate"
                          >
                            {skill.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Model picker */}
                  <div className="relative">
                    <button
                      onClick={() => { setShowModelMenu(!showModelMenu); setShowSkillMenu(false); }}
                      className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-text-muted hover:text-accent hover:bg-accent/5 rounded-md transition-colors"
                    >
                      <Bot className="w-3 h-3" />
                      {activeProvider?.name || 'Model'}
                    </button>
                    {showModelMenu && (
                      <div className="absolute bottom-full mb-1 left-0 w-48 bg-white border border-border/50 rounded-lg shadow-xl max-h-60 overflow-y-auto z-50">
                        {providers.map(p => (
                          <button
                            key={p.id}
                            onClick={() => handleProviderChange(p.id)}
                            className="w-full text-left px-3 py-2 text-xs hover:bg-surface transition-colors truncate"
                          >
                            {p.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={isStreaming ? handleStop : () => handleSend()}
                  disabled={!isStreaming && !inputValue.trim()}
                  className={`p-1.5 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    isStreaming
                      ? 'bg-red-500 text-white hover:bg-red-600'
                      : 'bg-accent text-white hover:bg-accent/90'
                  }`}
                >
                  {isStreaming ? <StopCircle className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
    {showSettings &&
      createPortal(
        <ChatSettingsPanel
          language={language}
          onClose={() => {
            setShowSettings(false);
            reloadProvidersAndSkills();
            persistProviderConfigsToBackend();
          }}
        />,
        document.body
      )}
    {saveNoteModal.open &&
      createPortal(
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
                onClick={() => setSaveNoteModal({ open: false, title: '', content: '', type: 'note', tags: ['ai-generated'], savedNoteId: null, linkedTaskIds: [], linkedProjectIds: [] })}
                className="p-1 text-text-muted hover:text-red-500 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3"
            >
              {saveNoteModal.savedNoteId && (
                <div className="px-3 py-2 rounded bg-amber-50 border border-amber-200 text-xs text-amber-700">
                  {language === 'zh'
                    ? '⚠️ 这条内容已经保存过笔记，继续保存将创建重复条目。'
                    : '⚠️ This content has already been saved as a note. Continuing will create a duplicate.'}
                </div>
              )}
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
                >{language === 'zh' ? '标签' : 'Tags'}</label>
                <div className="flex flex-wrap gap-1.5">
                  {saveNoteModal.tags.map(tag => (
                    <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-accent/10 text-accent border border-accent/20">
                      #{tag}
                      <button
                        onClick={() => setSaveNoteModal(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) }))}
                        className="hover:text-red-500"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    placeholder={language === 'zh' ? '+ 添加标签' : '+ Add tag'}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                        const v = (e.target as HTMLInputElement).value.trim().toLowerCase();
                        if (v && !saveNoteModal.tags.includes(v)) {
                          setSaveNoteModal(prev => ({ ...prev, tags: [...prev.tags, v] }));
                          (e.target as HTMLInputElement).value = '';
                        }
                      }
                    }}
                    className="w-24 px-2 py-0.5 text-[11px] border border-border rounded bg-surface focus:outline-none focus:border-accent"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-text-muted mb-1"
                >{language === 'zh' ? '内容' : 'Content'}</label>
                <textarea
                  value={saveNoteModal.content}
                  onChange={e => setSaveNoteModal(prev => ({ ...prev, content: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-border rounded bg-surface focus:outline-none focus:border-accent max-h-60 min-h-[120px] resize-y"
                />
              </div>
            </div>
            <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2"
            >
              <button
                onClick={() => setSaveNoteModal({ open: false, title: '', content: '', type: 'note', tags: ['ai-generated'], savedNoteId: null, linkedTaskIds: [], linkedProjectIds: [] })}
                className="px-3 py-1.5 text-xs font-bold text-text-muted hover:text-text-heading transition-colors"
              >
                {language === 'zh' ? '取消' : 'Cancel'}
              </button>
              {saveNoteModal.savedNoteId ? (
                <button
                  onClick={() => {
                    showToast(language === 'zh' ? '请前往「笔记」页查看' : 'Go to Notes tab to view', 'info');
                    setSaveNoteModal({ open: false, title: '', content: '', type: 'note', tags: ['ai-generated'], savedNoteId: null, linkedTaskIds: [], linkedProjectIds: [] });
                  }}
                  className="px-4 py-1.5 text-xs font-bold border border-accent text-accent rounded hover:bg-accent/10 transition-colors"
                >
                  {language === 'zh' ? '查看笔记' : 'View Note'}
                </button>
              ) : null}
              <button
                onClick={async () => {
                  try {
                    if (saveNoteModal.savedNoteId) {
                      await notesApi.update(saveNoteModal.savedNoteId, {
                        title: saveNoteModal.title.trim(),
                        body: saveNoteModal.content,
                        type: saveNoteModal.type as any,
                        tags: saveNoteModal.tags,
                        linkedTaskIds: saveNoteModal.linkedTaskIds,
                        linkedProjectIds: saveNoteModal.linkedProjectIds,
                      });
                    } else {
                      await notesApi.create({
                        title: saveNoteModal.title.trim(),
                        body: saveNoteModal.content,
                        type: saveNoteModal.type as any,
                        date: new Date().toISOString().slice(0, 10),
                        context: activeContext,
                        tags: saveNoteModal.tags,
                        linkedTaskIds: saveNoteModal.linkedTaskIds,
                        linkedProjectIds: saveNoteModal.linkedProjectIds,
                      });
                    }
                    showToast(language === 'zh' ? '已保存到笔记' : 'Saved to notes', 'success');
                    onNoteCreated?.();
                    setSaveNoteModal({ open: false, title: '', content: '', type: 'note', tags: ['ai-generated'], savedNoteId: null, linkedTaskIds: [], linkedProjectIds: [] });
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
        </motion.div>,
        document.body
      )}
  </>
  );
}
