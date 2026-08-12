/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence } from 'motion/react';
import { Plus, Sparkles, Settings, Trash2, MessageSquare, PanelLeftClose, PanelLeftOpen, Bot, Loader2, Maximize2, X } from 'lucide-react';
import { persistProviderConfigsToBackend } from '../types/models';
import { type ChatMessage, type ContextItem } from '../types/chat';
import { useAiSession } from '../hooks/useAiSession';
import { ChatSettingsPanel } from './ChatSettingsPanel';
import { ContextPicker } from './ContextPicker';
import { SaveNoteModal } from './SaveNoteModal';
import { MessageBubble } from './MessageBubble';
import { ChatInputArea } from './ChatInputArea';

interface AIChatProps {
  workspaceId?: string;
  language: 'en' | 'zh';
  activeContext?: 'work' | 'life';
  tasks: any[];
  notes: any[];
  filesMap: Record<string, string>;
  showToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
  initialDraft?: { text: string; key: string; sourceTitle?: string; contextText?: string; contextLabel?: string; noteId?: string } | null;
  onDraftConsumed?: () => void;
  onCreateMeetingNote?: () => void;
  onNoteCreated?: () => void;
  compact?: boolean;
  onClose?: () => void;
  onOpenFullChat?: () => void;
}

export function AIChat({ workspaceId = 'default', language, activeContext = 'work', tasks, notes, filesMap, showToast, initialDraft, onDraftConsumed, onCreateMeetingNote, onNoteCreated, compact = false, onClose, onOpenFullChat }: AIChatProps) {
  const {
    sessions, activeSession, setActiveSessionId, createSession, prepareSessionForDraft, deleteSession, renameSession,
    isStreaming, sendMessage, stopMessage, retryMessage,
    providers, activeProvider, switchProvider, reloadProvidersAndSkills,
    skills, pendingSkillId, setPendingSkillId, activeSkill,
    addContext, removeContext,
  } = useAiSession({ workspaceId, language, tasks, notes, filesMap, activeContext, showToast });

  // UI 状态 (本地)
  const [inputValue, setInputValue] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showContextPicker, setShowContextPicker] = useState(false);
  const [draftSourceTitle, setDraftSourceTitle] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      const stored = localStorage.getItem('df_ai_chat_sidebar_collapsed');
      if (stored !== null) return stored === '1';
      return typeof window !== 'undefined' && window.innerWidth < 768;
    } catch { return false; }
  });
  const [saveNoteModal, setSaveNoteModal] = useState<{
    open: boolean;
    title: string;
    content: string;
    linkedTaskIds: string[];
    linkedProjectIds: string[];
    savedNoteId: string | null;
  }>({ open: false, title: '', content: '', linkedTaskIds: [], linkedProjectIds: [], savedNoteId: null });
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try { localStorage.setItem('df_ai_chat_sidebar_collapsed', sidebarCollapsed ? '1' : '0'); } catch {}
  }, [sidebarCollapsed]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession?.messages.length, isStreaming]);

  // Initial draft handling
  const consumedDraftKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!initialDraft) return;
    if (consumedDraftKeyRef.current === initialDraft.key) return;
    consumedDraftKeyRef.current = initialDraft.key;
    const contextItems: ContextItem[] = initialDraft.noteId
      ? [{
          id: `ctx_note_${initialDraft.key}`,
          type: 'note',
          label: initialDraft.contextLabel || initialDraft.sourceTitle || (language === 'zh' ? '笔记' : 'Note'),
          data: { noteId: initialDraft.noteId },
        }]
      : initialDraft.contextText
        ? [{
            id: `ctx_note_${initialDraft.key}`,
            type: 'custom-text',
            label: initialDraft.contextLabel || initialDraft.sourceTitle || (language === 'zh' ? '笔记' : 'Note'),
            data: { text: initialDraft.contextText },
          }]
        : [];
    prepareSessionForDraft(contextItems);
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
  }, [initialDraft, onDraftConsumed, language, prepareSessionForDraft]);

  const startRename = useCallback((session: typeof sessions[number]) => {
    setEditingSessionId(session.id);
    setEditTitle(session.title);
  }, []);
  const commitRename = useCallback(() => {
    if (!editingSessionId) return;
    renameSession(editingSessionId, editTitle);
    setEditingSessionId(null);
  }, [editingSessionId, editTitle, renameSession]);

  const handleSend = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    sendMessage(trimmed);
    setInputValue('');
    setDraftSourceTitle(null);
  }, [inputValue, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !isComposing && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleProviderChange = (id: string) => {
    const p = switchProvider(id);
    if (p) showToast(language === 'zh' ? `已切换到 ${p.name}` : `Switched to ${p.name}`, 'success');
  };

  // Save-as-note prefill logic
  const openSaveAsNote = (msg: ChatMessage) => {
    let title = activeSession?.title || (language === 'zh' ? 'AI 笔记' : 'AI Note');
    const h1Match = msg.content.match(/^#\s+(.+)$/m);
    if (h1Match) title = h1Match[1].trim();
    else {
      const firstLine = msg.content.split('\n')[0].trim();
      if (firstLine && firstLine.length <= 80) title = firstLine;
    }
    const linkedTaskIds = msg.contextSnapshot?.filter(c => c.type === 'today-tasks' && c.data.taskId).map(c => c.data.taskId as string) || [];
    const linkedProjectIds = msg.contextSnapshot?.filter(c => c.type === 'project' && c.data.projectName).map(c => c.data.projectName as string) || [];
    const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
    const duplicate = notes.find((n: any) => normalize(n.body) === normalize(msg.content));
    setSaveNoteModal({
      open: true, title, content: msg.content,
      linkedTaskIds, linkedProjectIds,
      savedNoteId: duplicate?.id || null,
    });
  };

  return (
    <div className="flex h-full min-h-0 bg-background" data-testid={compact ? 'compact-ai-chat' : 'full-ai-chat'}>
      {/* —— Left: sessions —— */}
      {!compact && <aside className={`flex min-h-0 flex-col border-r border-border bg-surface transition-all duration-200 ${sidebarCollapsed ? 'w-0 md:w-12 items-center overflow-hidden' : 'w-[260px]'}`}>
        {!sidebarCollapsed ? (
          <>
            <div className="px-4 pt-5 pb-3 border-b border-border">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-accent text-white flex items-center justify-center">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-bold text-text-heading">
                    {language === 'zh' ? 'AI 对话' : 'AI Chat'}
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
                onClick={() => createSession()}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                {language === 'zh' ? '新对话' : 'New Chat'}
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2 space-y-0.5 w-full" data-testid="chat-session-scroll-region">
              <div className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-wider text-text-muted/70 font-bold">
                {language === 'zh' ? '历史对话' : 'Recent'}
              </div>
              {sessions.map(session => (
                <div
                  key={session.id}
                  onClick={() => setActiveSessionId(session.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setActiveSessionId(session.id);
                    } else if (event.key === 'F2') {
                      event.preventDefault();
                      startRename(session);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-current={activeSession?.id === session.id ? 'true' : undefined}
                  aria-label={`${session.title}. ${language === 'zh' ? '按 F2 重命名' : 'Press F2 to rename'}`}
                  className={`group flex items-center gap-2 px-2.5 py-2 rounded-md cursor-pointer transition-colors ${
                    activeSession?.id === session.id ? 'bg-accent/10 text-accent' : 'hover:bg-surface-white text-text-heading'
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
                        if (e.key === 'Enter' && !e.nativeEvent.isComposing) commitRename();
                        if (e.key === 'Escape' && !e.nativeEvent.isComposing) setEditingSessionId(null);
                      }}
                      onClick={e => e.stopPropagation()}
                      className="flex-1 text-xs bg-white border border-accent/40 rounded px-1.5 py-0.5 outline-none"
                    />
                  ) : (
                    <span
                      className="flex-1 text-xs truncate"
                      onDoubleClick={(e) => { e.stopPropagation(); startRename(session); }}
                      title={language === 'zh' ? '双击重命名' : 'Double-click to rename'}
                    >
                      {session.title}
                    </span>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); if (confirm(language === 'zh' ? '删除此对话？' : 'Delete this chat?')) deleteSession(session.id); }}
                    aria-label={language === 'zh' ? `删除对话：${session.title}` : `Delete chat: ${session.title}`}
                    className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 p-0.5 text-text-muted hover:text-red-500 transition-all"
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
                onClick={() => createSession()}
                className="w-8 h-8 rounded-lg bg-accent text-white flex items-center justify-center hover:bg-accent/90 transition-colors shadow-sm"
                title={language === 'zh' ? '新对话' : 'New Chat'}
                aria-label={language === 'zh' ? '新对话' : 'New Chat'}
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                onClick={() => setSidebarCollapsed(false)}
                className="p-1 text-text-muted hover:text-text-heading transition-colors"
                title={language === 'zh' ? '展开侧边栏' : 'Expand sidebar'}
                aria-label={language === 'zh' ? '展开侧边栏' : 'Expand sidebar'}
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto py-2 space-y-1 flex flex-col items-center w-full">
              {sessions.slice(0, 8).map(session => (
                <button
                  key={session.id}
                  onClick={() => setActiveSessionId(session.id)}
                  title={session.title}
                  className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors ${
                    activeSession?.id === session.id ? 'bg-accent/10 text-accent' : 'hover:bg-surface-white text-text-muted'
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
      </aside>}

      {/* —— Right: chat —— */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className={`${compact ? 'px-4 py-3' : 'px-4 md:px-6 py-3 md:py-4'} border-b border-border bg-background flex items-center justify-between shrink-0 gap-2`}>
          <div className="flex items-center gap-2 min-w-0">
            {!compact && <button
              onClick={() => setSidebarCollapsed(false)}
              className="md:hidden p-1 text-text-muted hover:text-text-heading shrink-0"
              title={language === 'zh' ? '打开对话列表' : 'Open sessions'}
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>}
            {compact && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-white">
                <Sparkles className="h-4 w-4" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h2 className={`${compact ? 'text-sm' : 'text-base'} font-semibold text-text-heading truncate`}>
                {compact
                  ? (language === 'zh' ? 'AI 助手' : 'AI Assistant')
                  : (activeSession?.title || (language === 'zh' ? '新对话' : 'New chat'))}
              </h2>
              <div className="flex items-center gap-2 mt-0.5">
                {activeProvider ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-text-muted">
                    <Bot className="w-3 h-3" />
                    {activeProvider.name}
                    <span className="text-text-muted/60 font-mono truncate">· {activeProvider.model}</span>
                  </span>
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
          {compact && (
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => createSession()}
                className="rounded-lg p-2 text-text-muted transition-colors hover:bg-surface hover:text-text-heading"
                title={language === 'zh' ? '新对话' : 'New chat'}
                aria-label={language === 'zh' ? '新对话' : 'New chat'}
              >
                <Plus className="h-4 w-4" />
              </button>
              {onOpenFullChat && (
                <button
                  type="button"
                  onClick={onOpenFullChat}
                  className="rounded-lg p-2 text-text-muted transition-colors hover:bg-surface hover:text-text-heading"
                  title={language === 'zh' ? '打开完整 AI 对话' : 'Open full AI Chat'}
                  aria-label={language === 'zh' ? '打开完整 AI 对话' : 'Open full AI Chat'}
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
              )}
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg p-2 text-text-muted transition-colors hover:bg-surface hover:text-text-heading"
                  title={language === 'zh' ? '关闭' : 'Close'}
                  aria-label={language === 'zh' ? '关闭' : 'Close'}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </header>

        {/* Messages */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-testid="chat-message-scroll-region">
          {!activeSession || activeSession.messages.length === 0 ? (
            <div className={`h-full flex items-center justify-center ${compact ? 'px-5' : 'px-4 md:px-6'}`}>
              <div className={`text-center w-full ${compact ? 'max-w-sm' : 'max-w-xl'}`}>
                <div className={`${compact ? 'w-10 h-10 mb-4 rounded-xl' : 'w-16 h-16 mb-6 rounded-xl shadow-lg'} mx-auto bg-accent text-white flex items-center justify-center`}>
                  <Sparkles className={compact ? 'w-5 h-5' : 'w-8 h-8'} />
                </div>
                <h2 className={`${compact ? 'text-lg' : 'text-2xl'} font-semibold text-text-heading mb-2`}>
                  {compact
                    ? (language === 'zh' ? '需要我帮你做什么？' : 'How can I help?')
                    : (language === 'zh' ? '今天想聊点什么？' : 'What can I help with?')}
                </h2>
                <p className={`${compact ? 'text-xs mb-5' : 'text-sm mb-8'} text-text-muted`}>
                  {language === 'zh'
                    ? '把今日任务、笔记或某个项目挂上来当上下文，我会基于真实数据帮你分析'
                    : 'Attach tasks, notes, or projects as context. I will work with your real data.'}
                </p>
                <div className={compact ? 'flex flex-wrap justify-center gap-2' : 'grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-left'}>
                  {[
                    { icon: '📝', label: language === 'zh' ? '总结今日任务' : 'Summarize today', hint: language === 'zh' ? '一段话回顾今天' : 'Recap today in a paragraph' },
                    { icon: '📊', label: language === 'zh' ? '生成周报' : 'Weekly report', hint: language === 'zh' ? '按项目维度汇总' : 'Group by project' },
                    { icon: '🏷️', label: language === 'zh' ? '推荐标签' : 'Suggest tags', hint: language === 'zh' ? '帮我归类未打标的任务' : 'Classify untagged tasks' },
                    { icon: '📋', label: language === 'zh' ? '拆解一个目标' : 'Break down a goal', hint: language === 'zh' ? '变成可执行的子任务' : 'Into actionable steps' },
                  ].slice(0, compact ? 3 : 4).map(s => (
                    <button
                      key={s.label}
                      onClick={() => { setInputValue(s.label); textareaRef.current?.focus(); }}
                      className={compact
                        ? 'rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-main transition-colors hover:border-accent/30 hover:bg-accent/5'
                        : 'group flex items-start gap-3 p-3.5 bg-surface border border-border rounded-xl hover:border-accent/40 hover:bg-surface-white transition-all'}
                    >
                      {compact ? s.label : <><span className="text-xl leading-none mt-0.5">{s.icon}</span><div className="min-w-0">
                        <div className="text-sm font-semibold text-text-heading">{s.label}</div>
                        <div className="text-[11px] text-text-muted mt-0.5">{s.hint}</div>
                      </div></>}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className={`w-full ${compact ? 'px-4 py-4 space-y-5' : 'px-4 md:px-8 lg:px-12 py-6 md:py-8 space-y-6 md:space-y-8'}`}>
              <AnimatePresence initial={false}>
                {activeSession.messages.map((msg, i) => (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    language={language}
                    activeContext={activeContext}
                    notes={notes}
                    showToast={showToast}
                    onRetry={() => retryMessage(i)}
                    onSaveAsNote={openSaveAsNote}
                    onOpenSettings={() => setShowSettings(true)}
                  />
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

        {/* Input area (extracted) */}
        <ChatInputArea
          language={language}
          activeSession={activeSession}
          inputValue={inputValue}
          isStreaming={isStreaming}
          isComposing={isComposing}
          onInputChange={setInputValue}
          onSend={handleSend}
          onStop={stopMessage}
          onKeyDown={handleKeyDown}
          onOpenContextPicker={() => setShowContextPicker(true)}
          onCreateMeetingNote={onCreateMeetingNote}
          onOpenSettings={() => setShowSettings(true)}
          onRemoveContext={removeContext}
          skills={skills}
          pendingSkillId={pendingSkillId}
          activeSkill={activeSkill}
          onSelectSkill={setPendingSkillId}
          onClearPendingSkill={() => setPendingSkillId(null)}
          providers={providers}
          activeProvider={activeProvider}
          onChangeProvider={handleProviderChange}
          draftSourceTitle={draftSourceTitle}
          onClearDraftSource={() => setDraftSourceTitle(null)}
          textareaRef={textareaRef}
          compact={compact}
        />
      </section>

      {/* Modals */}
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
        {showContextPicker && (
          <ContextPicker
            language={language}
            tasks={tasks}
            notes={notes}
            filesMap={filesMap}
            selectedItems={activeSession?.contextItems || []}
            onSelect={addContext}
            onDeselect={removeContext}
            onClose={() => setShowContextPicker(false)}
          />
        )}
        {saveNoteModal.open && (
          <SaveNoteModal
            isOpen={saveNoteModal.open}
            language={language}
            activeContext={activeContext}
            initialTitle={saveNoteModal.title}
            initialContent={saveNoteModal.content}
            initialLinkedTaskIds={saveNoteModal.linkedTaskIds}
            initialLinkedProjectIds={saveNoteModal.linkedProjectIds}
            existingNoteId={saveNoteModal.savedNoteId}
            showToast={showToast}
            onClose={() => setSaveNoteModal(prev => ({ ...prev, open: false }))}
            onSaved={() => onNoteCreated?.()}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
