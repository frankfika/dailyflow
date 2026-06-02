/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Send, Plus, Sparkles, Loader2, Settings, Trash2, MessageSquare, Paperclip,
  X, ChevronDown, Zap, Calendar, FileText, Folder, Pencil, Check, Bot, User,
  StopCircle, Copy, RefreshCw,
} from 'lucide-react';
import { aiApi, promptsApi, type PromptTemplateData } from '../api/client';
import { loadProviderConfigs, type ProviderConfig } from '../types/models';
import {
  loadChatStore,
  saveChatStore,
  createNewSession,
  deriveSessionTitle,
  type ChatSession,
  type ChatMessage,
  type ContextItem,
  type ContextItemType,
} from '../types/chat';
import { ChatSettingsPanel } from './ChatSettingsPanel';
import { ContextPicker } from './ContextPicker';

interface AIChatProps {
  language: 'en' | 'zh';
  tasks: any[];
  notes: any[];
  filesMap: Record<string, string>;
  currentFileDate: string;
  showToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

export function AIChat({ language, tasks, notes, filesMap, currentFileDate, showToast }: AIChatProps) {
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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load on mount
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

    promptsApi.getAll().then(setSkills).catch(err => console.error('Load skills failed:', err));
  }, []);

  // Persist sessions
  useEffect(() => {
    if (sessions.length > 0) {
      saveChatStore({ sessions, activeSessionId });
    }
  }, [sessions, activeSessionId]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSessionId, isStreaming]);

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
    setShowContextPicker(false);
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
          if (content) {
            parts.push(`## ${language === 'zh' ? '任务' : 'Tasks'} (${date})\n${content}`);
          }
          break;
        }
        case 'note': {
          const note = notes.find((n: any) => n.id === item.data.noteId);
          if (note) {
            parts.push(`## ${language === 'zh' ? '笔记' : 'Note'}: ${note.title}\n${note.body || note.content || ''}`);
          }
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

  const handleSend = async () => {
    if (!inputValue.trim() || isStreaming || !activeSession) return;

    if (!activeProvider) {
      showToast(
        language === 'zh' ? '请先添加一个模型供应商' : 'Please add a model provider first',
        'error'
      );
      setShowSettings(true);
      return;
    }

    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date().toISOString(),
    };

    // Snapshot context for this message
    const contextSnapshot = [...activeSession.contextItems];
    const userInputCopy = inputValue.trim();
    const skillForThisMessage = activeSkill;

    // Update session: add user message, set title if first message
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
    setIsStreaming(true);
    setPendingSkillId(null); // skill applied to this message only

    // Build the prompt
    const contextText = buildContextText(contextSnapshot);
    let userPrompt = userInputCopy;
    if (contextText) {
      userPrompt = `${userPrompt}\n\n---\n${language === 'zh' ? '参考以下上下文：' : 'Reference context:'}\n\n${contextText}`;
    }

    const systemPrompt = skillForThisMessage
      ? skillForThisMessage.prompt
      : (language === 'zh'
        ? '你是一位专业、友好的 AI 助手，帮助用户管理日常工作和任务。回复简洁清晰，使用 Markdown 格式。'
        : 'You are a professional, friendly AI assistant helping with daily work and tasks. Reply concisely and clearly using Markdown.');

    abortRef.current = new AbortController();

    try {
      const { summary } = await aiApi.summarize({
        provider: activeProvider.type === 'anthropic' ? 'anthropic' : 'custom',
        apiKey: activeProvider.apiKey,
        model: activeProvider.model,
        baseUrl: activeProvider.baseUrl,
        systemPrompt,
        userPrompt,
        format: activeProvider.type === 'anthropic' ? 'anthropic' : 'openai',
      });

      const aiMessage: ChatMessage = {
        id: `msg_${Date.now() + 1}`,
        role: 'assistant',
        content: summary,
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
      const errorMessage: ChatMessage = {
        id: `msg_${Date.now() + 1}`,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        modelName: activeProvider.name,
        error: err.message || String(err),
      };

      updateActiveSession(s => ({
        ...s,
        messages: [...s.messages, errorMessage],
        updatedAt: new Date().toISOString(),
      }));

      showToast(language === 'zh' ? `AI 调用失败: ${err.message}` : `AI failed: ${err.message}`, 'error');
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setIsStreaming(false);
  };

  const handleCopyMessage = (content: string) => {
    navigator.clipboard.writeText(content);
    showToast(language === 'zh' ? '已复制' : 'Copied', 'success');
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

  return (
    <div className="h-full flex bg-surface">
      {/* Sessions sidebar */}
      <div className="w-64 border-r border-border flex flex-col">
        <div className="p-3 border-b border-border">
          <button
            onClick={handleNewSession}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold bg-accent text-white rounded hover:bg-accent/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            {language === 'zh' ? '新对话' : 'New Chat'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sessions.map(session => (
            <div
              key={session.id}
              onClick={() => setActiveSessionId(session.id)}
              className={`group flex items-center gap-2 px-3 py-2 rounded cursor-pointer transition-colors ${
                activeSessionId === session.id
                  ? 'bg-accent/10 text-accent'
                  : 'hover:bg-surface-white text-text-heading'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="flex-1 text-xs truncate">{session.title}</span>
              <button
                onClick={(e) => { e.stopPropagation(); handleDeleteSession(session.id); }}
                className="opacity-0 group-hover:opacity-100 p-0.5 text-text-muted hover:text-red-500 transition-all"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>

        <div className="p-2 border-t border-border">
          <button
            onClick={() => setShowSettings(true)}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-text-muted hover:bg-surface-white rounded transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
            {language === 'zh' ? 'AI 设置' : 'AI Settings'}
          </button>
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col">
        {/* Header with context */}
        <div className="px-6 py-3 border-b border-border">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-accent" />
            <h3 className="text-sm font-semibold text-text-heading">
              {activeSession?.title || (language === 'zh' ? 'AI 对话' : 'AI Chat')}
            </h3>
            {activeProvider && (
              <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-accent/10 text-accent rounded">
                <Zap className="w-2.5 h-2.5" />
                {activeProvider.name}
              </span>
            )}
          </div>

          {/* Context items */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {activeSession?.contextItems.map(item => (
              <span
                key={item.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold bg-surface-white border border-border rounded"
              >
                {item.type === 'today-tasks' && <Calendar className="w-3 h-3" />}
                {item.type === 'date-tasks' && <Calendar className="w-3 h-3" />}
                {item.type === 'note' && <FileText className="w-3 h-3" />}
                {item.type === 'project' && <Folder className="w-3 h-3" />}
                {item.type === 'custom-text' && <FileText className="w-3 h-3" />}
                <span className="text-text-heading">{item.label}</span>
                <button
                  onClick={() => handleRemoveContext(item.id)}
                  className="text-text-muted hover:text-red-500 transition-colors"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
            <button
              onClick={() => setShowContextPicker(true)}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold text-accent border border-dashed border-accent/40 rounded hover:bg-accent/5 transition-colors"
            >
              <Paperclip className="w-3 h-3" />
              {language === 'zh' ? '添加上下文' : 'Add context'}
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {activeSession?.messages.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center max-w-md">
                <Sparkles className="w-12 h-12 mx-auto mb-4 text-accent opacity-50" />
                <h2 className="text-lg font-semibold text-text-heading mb-2">
                  {language === 'zh' ? '开始与 AI 对话' : 'Start chatting with AI'}
                </h2>
                <p className="text-sm text-text-muted mb-6">
                  {language === 'zh'
                    ? '附加任务、笔记或项目作为上下文，让 AI 帮你分析、总结、规划'
                    : 'Attach tasks, notes, or projects as context. Let AI help you analyze, summarize, plan'}
                </p>
                <div className="grid grid-cols-2 gap-2 text-left">
                  {[
                    { icon: '📝', label: language === 'zh' ? '总结今日任务' : 'Summarize today' },
                    { icon: '📊', label: language === 'zh' ? '生成周报' : 'Weekly report' },
                    { icon: '🏷️', label: language === 'zh' ? '推荐标签' : 'Suggest tags' },
                    { icon: '📋', label: language === 'zh' ? '拆解任务' : 'Break down task' },
                  ].map(suggestion => (
                    <button
                      key={suggestion.label}
                      onClick={() => setInputValue(suggestion.label)}
                      className="flex items-center gap-2 px-3 py-2 text-xs bg-surface-white border border-border rounded hover:border-accent/30 transition-colors"
                    >
                      <span>{suggestion.icon}</span>
                      <span className="text-text-heading">{suggestion.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {activeSession?.messages.map(msg => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="group"
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-7 h-7 rounded flex items-center justify-center flex-shrink-0 ${
                      msg.role === 'user' ? 'bg-accent/10 text-accent' : 'bg-surface-white border border-border text-text-heading'
                    }`}>
                      {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-text-heading">
                          {msg.role === 'user' ? (language === 'zh' ? '你' : 'You') : 'AI'}
                        </span>
                        {msg.modelName && (
                          <span className="text-[10px] font-bold text-text-muted">· {msg.modelName}</span>
                        )}
                        {msg.skillName && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-accent">
                            · ⚡ {msg.skillName}
                          </span>
                        )}
                        <button
                          onClick={() => handleCopyMessage(msg.content)}
                          className="ml-auto opacity-0 group-hover:opacity-100 p-1 text-text-muted hover:text-accent transition-all"
                          title={language === 'zh' ? '复制' : 'Copy'}
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                      {msg.error ? (
                        <div className="text-xs text-red-500 bg-red-50 p-3 rounded border border-red-200">
                          {language === 'zh' ? '错误：' : 'Error: '}{msg.error}
                        </div>
                      ) : (
                        <div className="text-sm text-text-heading whitespace-pre-wrap leading-relaxed">
                          {msg.content}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
          {isStreaming && (
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded bg-surface-white border border-border flex items-center justify-center">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
              </div>
              <div className="text-sm text-text-muted">
                {language === 'zh' ? '思考中…' : 'Thinking…'}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="px-6 py-4 border-t border-border bg-surface-white">
          {pendingSkillId && activeSkill && (
            <div className="mb-2 flex items-center gap-2">
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
          <div className="flex items-end gap-2">
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={language === 'zh' ? '输入消息... (Enter 发送, Shift+Enter 换行)' : 'Type a message... (Enter to send, Shift+Enter for newline)'}
                rows={3}
                className="w-full px-3 py-2 text-sm border border-border rounded bg-surface focus:outline-none focus:border-accent resize-none"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              {/* Skill picker */}
              <div className="relative">
                <button
                  onClick={() => { setShowSkillMenu(!showSkillMenu); setShowModelMenu(false); }}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold border border-border rounded bg-surface hover:border-accent/30 transition-colors"
                  title={language === 'zh' ? '选择 Skill' : 'Pick Skill'}
                >
                  <Zap className="w-3 h-3" />
                  {language === 'zh' ? 'Skill' : 'Skill'}
                  <ChevronDown className="w-2.5 h-2.5" />
                </button>
                {showSkillMenu && (
                  <div className="absolute bottom-full mb-1 right-0 w-56 bg-surface-white border border-border rounded shadow-lg max-h-60 overflow-y-auto z-50">
                    <div className="p-2 text-[10px] font-bold text-text-muted border-b border-border">
                      {language === 'zh' ? '选择 Skill 应用到下条消息' : 'Apply skill to next message'}
                    </div>
                    {skills.length === 0 ? (
                      <div className="p-3 text-xs text-text-muted">
                        {language === 'zh' ? '暂无 Skill，请在设置中添加' : 'No skills yet'}
                      </div>
                    ) : skills.map(skill => (
                      <button
                        key={skill.id}
                        onClick={() => { setPendingSkillId(skill.id); setShowSkillMenu(false); }}
                        className={`w-full text-left px-3 py-2 text-xs hover:bg-surface transition-colors ${
                          pendingSkillId === skill.id ? 'bg-accent/10 text-accent' : ''
                        }`}
                      >
                        <div className="font-bold">{skill.name}</div>
                        <div className="text-[10px] text-text-muted truncate">{skill.prompt.slice(0, 40)}…</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Model picker */}
              <div className="relative">
                <button
                  onClick={() => { setShowModelMenu(!showModelMenu); setShowSkillMenu(false); }}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold border border-border rounded bg-surface hover:border-accent/30 transition-colors"
                  title={language === 'zh' ? '切换模型' : 'Switch model'}
                >
                  <Bot className="w-3 h-3" />
                  {activeProvider?.name.slice(0, 8) || (language === 'zh' ? '模型' : 'Model')}
                  <ChevronDown className="w-2.5 h-2.5" />
                </button>
                {showModelMenu && (
                  <div className="absolute bottom-full mb-1 right-0 w-56 bg-surface-white border border-border rounded shadow-lg max-h-60 overflow-y-auto z-50">
                    {providers.length === 0 ? (
                      <div className="p-3 text-xs text-text-muted">
                        {language === 'zh' ? '暂无模型供应商' : 'No providers'}
                        <button
                          onClick={() => { setShowModelMenu(false); setShowSettings(true); }}
                          className="block mt-2 text-accent font-bold"
                        >
                          {language === 'zh' ? '+ 添加供应商' : '+ Add provider'}
                        </button>
                      </div>
                    ) : providers.map(p => (
                      <button
                        key={p.id}
                        onClick={() => handleProviderChange(p.id)}
                        className={`w-full text-left px-3 py-2 text-xs hover:bg-surface transition-colors ${
                          activeProviderId === p.id ? 'bg-accent/10 text-accent' : ''
                        }`}
                      >
                        <div className="font-bold flex items-center gap-1">
                          {p.name}
                          {activeProviderId === p.id && <Check className="w-3 h-3" />}
                        </div>
                        <div className="text-[10px] text-text-muted truncate">{p.model}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={isStreaming ? handleStop : handleSend}
              disabled={!isStreaming && !inputValue.trim()}
              className={`p-2.5 rounded transition-colors disabled:opacity-50 ${
                isStreaming
                  ? 'bg-red-500 text-white hover:bg-red-600'
                  : 'bg-accent text-white hover:bg-accent/90'
              }`}
            >
              {isStreaming ? <StopCircle className="w-4 h-4" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Settings modal */}
      <AnimatePresence>
        {showSettings && (
          <ChatSettingsPanel
            language={language}
            onClose={() => {
              setShowSettings(false);
              // Reload providers and skills after settings closes
              const ps = loadProviderConfigs();
              setProviders(ps.configs);
              setActiveProviderId(ps.activeId);
              promptsApi.getAll().then(setSkills).catch(() => {});
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
            onSelect={handleAddContext}
            onClose={() => setShowContextPicker(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
