/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Sparkles, Settings, X, Bot, Zap, Loader2, StopCircle, Send } from 'lucide-react';
import { notesApi } from '../api/client';
import { persistProviderConfigsToBackend } from '../types/models';
import { type ChatMessage, type ContextItem } from '../types/chat';
import { useAiSession } from '../hooks/useAiSession';
import { ChatSettingsPanel } from './ChatSettingsPanel';
import { SaveNoteModal } from './SaveNoteModal';
import { MessageBubble } from './MessageBubble';
import { ChatInputArea } from './ChatInputArea';

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
  focusedContext,
}: FloatingAIPanelProps) {
  const {
    sessions, activeSession, setActiveSessionId, createSession, deleteSession,
    isStreaming, sendMessage, stopMessage, retryMessage,
    providers, activeProvider, switchProvider, reloadProvidersAndSkills,
    skills, pendingSkillId, setPendingSkillId, activeSkill,
    addContext, removeContext,
    autoContextLabel, placeholderText,
  } = useAiSession({ language, tasks, notes, filesMap, activeContext, showToast, focusedContext });

  // UI 状态 (本地)
  const [inputValue, setInputValue] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [draftSourceTitle, setDraftSourceTitle] = useState<string | null>(null);

  const [saveNoteModal, setSaveNoteModal] = useState<{
    open: boolean;
    title: string;
    content: string;
    linkedTaskIds: string[];
    linkedProjectIds: string[];
    savedNoteId: string | null;
  }>({ open: false, title: '', content: '', linkedTaskIds: [], linkedProjectIds: [], savedNoteId: null });

  // Resizable panel dimensions
  const [panelSize, setPanelSize] = useState(() => {
    try {
      const stored = localStorage.getItem('df_ai_panel_size');
      if (stored) return JSON.parse(stored) as { w: number; h: number };
    } catch {}
    return { w: 380, h: 600 };
  });
  const resizeRef = useRef<{ startX: number; startY: number; startW: number; startH: number; edge: string } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  // Initial draft
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
    createSession({ contextItems });
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
  }, [initialDraft, onDraftConsumed, language, createSession]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession?.messages.length, isStreaming]);

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
            <div onMouseDown={e => handleResizeStart(e, 'l')} className="absolute left-0 top-2 bottom-2 w-1.5 cursor-col-resize hover:bg-accent/20 rounded-full transition-colors z-10" />
            <div onMouseDown={e => handleResizeStart(e, 'b')} className="absolute bottom-0 left-2 right-2 h-1.5 cursor-row-resize hover:bg-accent/20 rounded-full transition-colors z-10" />
            <div onMouseDown={e => handleResizeStart(e, 'lb')} className="absolute left-0 bottom-0 w-3 h-3 cursor-nesw-resize z-10" />

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
                <button onClick={() => createSession()} className="p-1.5 text-text-muted hover:text-accent transition-colors rounded-md hover:bg-black/5" title={language === 'zh' ? '新对话' : 'New chat'}>
                  <Plus className="w-4 h-4" />
                </button>
                <button onClick={() => setShowSettings(true)} className="p-1.5 text-text-muted hover:text-text-heading transition-colors rounded-md hover:bg-black/5" title={language === 'zh' ? '设置' : 'Settings'}>
                  <Settings className="w-4 h-4" />
                </button>
                <button onClick={onClose} className="p-1.5 text-text-muted hover:text-text-heading transition-colors rounded-md hover:bg-black/5">
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
                  {focusedContext.type === 'note' ? focusedContext.title : (language === 'zh' ? '今日任务' : 'Today')}
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
                      { label: language === 'zh' ? '总结当前内容' : 'Summarize this', prompt: language === 'zh' ? '总结一下当前的内容' : 'Summarize the current content' },
                      { label: language === 'zh' ? '提取待办事项' : 'Extract tasks', prompt: language === 'zh' ? '从当前内容中提取待办事项' : 'Extract tasks from the current content' },
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
                      <MessageBubble
                        key={msg.id}
                        message={msg}
                        language={language}
                        activeContext={activeContext}
                        notes={notes}
                        showToast={showToast}
                        compact
                        onRetry={() => retryMessage(i)}
                        onSaveAsNote={openSaveAsNote}
                        onOpenSettings={() => setShowSettings(true)}
                      />
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

            {/* Input area (extracted, but in compact floating mode) */}
            <div className="p-3 bg-surface-white border-t border-border/30 shrink-0">
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
                      <button onClick={() => removeContext(item.id)} className="hover:text-red-500 transition-colors">
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {/* Compact input row — floating panel uses different visual treatment, so inline (not ChatInputArea) */}
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
                    {/* Skill picker (compact) */}
                    <SkillPickerCompact
                      language={language}
                      skills={skills}
                      pendingSkillId={pendingSkillId}
                      activeSkill={activeSkill}
                      onSelect={(id) => setPendingSkillId(id)}
                      onOpenSettings={() => setShowSettings(true)}
                    />
                    {/* Model picker (compact) */}
                    <ModelPickerCompact
                      language={language}
                      providers={providers}
                      activeProvider={activeProvider}
                      onChange={handleProviderChange}
                      onOpenSettings={() => setShowSettings(true)}
                    />
                  </div>
                  <button
                    onClick={isStreaming ? stopMessage : handleSend}
                    disabled={!isStreaming && !inputValue.trim()}
                    className={`p-1.5 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                      isStreaming ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-accent text-white hover:bg-accent/90'
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

      {/* Modals */}
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
          <SaveNoteModal
            isOpen={saveNoteModal.open}
            language={language}
            activeContext={activeContext}
            initialTitle={saveNoteModal.title}
            initialContent={saveNoteModal.content}
            initialLinkedTaskIds={saveNoteModal.linkedTaskIds}
            initialLinkedProjectIds={saveNoteModal.linkedProjectIds}
            notes={notes}
            showToast={showToast}
            onClose={() => setSaveNoteModal(prev => ({ ...prev, open: false }))}
            onSaved={() => onNoteCreated?.()}
          />,
          document.body
        )}
    </>
  );
}

// Compact skill picker for floating panel (different visual)
function SkillPickerCompact({ language, skills, pendingSkillId, activeSkill, onSelect, onOpenSettings }: {
  language: 'en' | 'zh';
  skills: import('../api/client').PromptTemplateData[];
  pendingSkillId: string | null;
  activeSkill: import('../api/client').PromptTemplateData | null;
  onSelect: (id: string) => void;
  onOpenSettings: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-md transition-colors ${
          pendingSkillId ? 'bg-accent/10 text-accent' : 'text-text-muted hover:text-accent hover:bg-accent/5'
        }`}
      >
        <Zap className="w-3 h-3" />
        {pendingSkillId && activeSkill ? activeSkill.name : 'Skill'}
      </button>
      {open && (
        <div className="absolute bottom-full mb-1 left-0 w-48 bg-white border border-border/50 rounded-lg shadow-xl max-h-60 overflow-y-auto z-50">
          {skills.map(skill => (
            <button
              key={skill.id}
              onClick={() => { onSelect(skill.id); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-xs hover:bg-surface transition-colors truncate"
            >
              {skill.name}
            </button>
          ))}
          <button onClick={() => { setOpen(false); onOpenSettings(); }} className="w-full text-left px-3 py-1.5 text-[10px] font-bold text-accent border-t border-border/50 hover:bg-accent/5">
            {language === 'zh' ? '管理 Skills…' : 'Manage skills…'}
          </button>
        </div>
      )}
    </div>
  );
}

function ModelPickerCompact({ language, providers, activeProvider, onChange, onOpenSettings }: {
  language: 'en' | 'zh';
  providers: import('../types/models').ProviderConfig[];
  activeProvider: import('../types/models').ProviderConfig | null;
  onChange: (id: string) => void;
  onOpenSettings: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-text-muted hover:text-accent hover:bg-accent/5 rounded-md transition-colors">
        <Bot className="w-3 h-3" />
        {activeProvider?.name || 'Model'}
      </button>
      {open && (
        <div className="absolute bottom-full mb-1 left-0 w-48 bg-white border border-border/50 rounded-lg shadow-xl max-h-60 overflow-y-auto z-50">
          {providers.map(p => (
            <button key={p.id} onClick={() => { onChange(p.id); setOpen(false); }} className="w-full text-left px-3 py-2 text-xs hover:bg-surface transition-colors truncate">
              {p.name}
            </button>
          ))}
          <button onClick={() => { setOpen(false); onOpenSettings(); }} className="w-full text-left px-3 py-1.5 text-[10px] font-bold text-accent border-t border-border/50 hover:bg-accent/5">
            {language === 'zh' ? '管理供应商…' : 'Manage providers…'}
          </button>
        </div>
      )}
    </div>
  );
}
