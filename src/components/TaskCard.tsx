import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  BellOff,
  Calendar,
  Check,
  ChevronRight,
  Edit2,
  FileText,
  MessageSquare,
  MoreHorizontal,
  Network,
  Repeat,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type { Task } from '../types/task';
import type { RecurrenceRule } from '../api/client';
import { getTagColor, getTodayStr } from '../utils/tagColors';
import { TagInput } from './TagInput';

const SUPPRESS_KEY = 'df_suppress_completion_comments';

function suppressComments(): void {
  try { sessionStorage.setItem(SUPPRESS_KEY, '1'); } catch { /* unavailable in some webviews */ }
}

interface TaskCardProps {
  task: Task;
  language: 'en' | 'zh';
  categories: string[];
  currentFileDate: string;
  linkedNotesCount?: number;
  /** Event title for tasks created from an Event map. */
  spaceTitle?: string;
  /** Opens the shared mind note that owns this task; receives the node id. */
  onOpenSpace?: (nodeId?: string) => void;
  onUnlinkFromSpace?: (taskId: string) => void;
  onToggle: () => void;
  onEdit: (updates: {
    title?: string;
    description?: string;
    comment?: string;
    comments?: { text: string; timestamp: string }[];
    tags?: string[];
    deadline?: string;
    priority?: 'high' | 'medium' | 'low';
    project?: string;
  }) => void;
  onDelete: () => void;
  onCreateLinkedNote?: () => void;
  onShowLinkedNotes?: () => void;
  /** UX S6 AI actions: decompose / rewrite / summarize. Omit to hide the row. */
  onAiAction?: (task: Task, action: 'decompose' | 'rewrite' | 'summarize') => Promise<void>;
  /** UX S7: convert the task into a new project event and open its canvas. */
  onConvertToProject?: (task: Task, opts: { title: string; extraNodes: string[] }) => Promise<void>;
  /** UX_DESIGN §12: inline "R" — save a recurrence rule for this task. */
  onSetRecurrence?: (task: Task, recurrence: RecurrenceRule) => void;
  showCompletionPrompt?: boolean;
  onCompletionPromptClosed?: () => void;
}

function timestampNow(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export function formatTaskDeadline(deadline: string, language: 'en' | 'zh', today = getTodayStr()): string {
  const dayMs = 24 * 60 * 60 * 1000;
  const deadlineTime = new Date(`${deadline}T00:00:00`).getTime();
  const todayTime = new Date(`${today}T00:00:00`).getTime();
  const difference = Math.round((deadlineTime - todayTime) / dayMs);
  if (difference < 0) return language === 'zh' ? `逾期 ${Math.abs(difference)} 天` : `${Math.abs(difference)}d overdue`;
  if (difference === 0) return language === 'zh' ? '今天截止' : 'Due today';
  if (difference === 1) return language === 'zh' ? '明天截止' : 'Due tomorrow';
  if (difference <= 7) return language === 'zh' ? `${difference} 天后截止` : `Due in ${difference}d`;
  return deadline;
}

export const TaskCard: React.FC<TaskCardProps> = ({
  task,
  language,
  categories,
  currentFileDate,
  linkedNotesCount = 0,
  spaceTitle,
  onOpenSpace,
  onUnlinkFromSpace,
  onToggle,
  onEdit,
  onDelete,
  onAiAction,
  onConvertToProject,
  onSetRecurrence,
  onCreateLinkedNote,
  onShowLinkedNotes,
  showCompletionPrompt,
  onCompletionPromptClosed,
}) => {
  const isDone = task.status === 'done';
  const [editingContent, setEditingContent] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showComment, setShowComment] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [aiBusy, setAiBusy] = useState<'decompose' | 'rewrite' | 'summarize' | null>(null);
  const [showConvert, setShowConvert] = useState(false);
  const [convertTitle, setConvertTitle] = useState('');
  const [convertNodes, setConvertNodes] = useState('');
  const [converting, setConverting] = useState(false);
  const [editContent, setEditContent] = useState(task.title + (task.description ? `\n${task.description}` : ''));
  const [editTags, setEditTags] = useState<string[]>(task.tags || []);
  const [editDeadline, setEditDeadline] = useState(task.deadline || '');
  const [recOpen, setRecOpen] = useState(false);
  const [recRule, setRecRule] = useState<RecurrenceRule | null>(null);
  const detailsRef = useRef<HTMLDivElement>(null);
  const deadlineInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!showCompletionPrompt) return;
    const hasAnyComment = Boolean(task.comment || task.comments?.length);
    if (hasAnyComment) return;
    setShowDetails(true);
    setShowComment(true);
  }, [showCompletionPrompt, task.comment, task.comments]);

  // UX_DESIGN §12 inline shortcuts: E edit · D deadline · T tags · R repeat,
  // ⌘⏎ completes from anywhere inside the card. Only when focus is inside
  // the card and not inside a text field.
  const handleCardKeyDown = (event: React.KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      onToggle();
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (!showDetails) return;
    const key = event.key.toLowerCase();
    if (key === 'e') {
      event.preventDefault();
      if (!isDone) setEditingContent(true);
    } else if (key === 'd') {
      event.preventDefault();
      deadlineInputRef.current?.focus();
    } else if (key === 't') {
      event.preventDefault();
      detailsRef.current?.querySelector<HTMLInputElement>('[data-testid="taginput-field"]')?.focus();
    } else if (key === 'r') {
      event.preventDefault();
      setRecOpen(value => !value);
    }
  };

  useEffect(() => {
    if (editingContent) return;
    setEditContent(task.title + (task.description ? `\n${task.description}` : ''));
    setEditTags(task.tags || []);
    setEditDeadline(task.deadline || '');
  }, [task, editingContent]);

  const cancelEdit = () => {
    setEditContent(task.title + (task.description ? `\n${task.description}` : ''));
    setEditTags(task.tags || []);
    setEditDeadline(task.deadline || '');
    setEditingContent(false);
  };

  const submitEdit = () => {
    if (!editContent.trim()) {
      cancelEdit();
      return;
    }
    const lines = editContent.trim().split('\n');
    onEdit({
      title: lines[0].trim(),
      description: lines.slice(1).join('\n').trim() || '',
      tags: editTags,
      deadline: editDeadline || undefined,
    });
    setEditingContent(false);
  };

  const closeComment = () => {
    setShowComment(false);
    setCommentText('');
    onCompletionPromptClosed?.();
  };

  const saveComment = () => {
    if (commentText.trim()) {
      onEdit({
        comments: [...(task.comments || []), { text: commentText.trim(), timestamp: timestampNow() }],
      });
    }
    closeComment();
  };

  const eventLabel = spaceTitle
    ? (language === 'zh' ? `事件 · ${spaceTitle}` : `Event · ${spaceTitle}`)
    : (task.spaceId || task.originMindmapId
    ? (language === 'zh' ? '来自事件' : 'From event')
    : (language === 'zh' ? '独立任务' : 'Standalone'));
  const isOverdue = Boolean(task.deadline && !isDone && task.deadline < getTodayStr());
  const deadlineLabel = task.deadline ? formatTaskDeadline(task.deadline, language) : '';

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ layout: { type: 'spring', stiffness: 500, damping: 40 }, duration: 0.18 }}
      className={`group rounded-xl border shadow-[0_1px_2px_rgba(20,45,38,0.025)] transition-all ${isDone ? 'border-border/40 bg-surface opacity-65' : 'border-border/80 bg-surface-elevated hover:border-border-strong hover:shadow-[0_4px_16px_rgba(20,45,38,0.055)]'}`}
      data-testid={`task-card-${task.id}`}
      onKeyDown={handleCardKeyDown}
    >
      <div className="flex min-h-[54px] items-start gap-2.5 px-3 py-2.5">
        <button
          type="button"
          onClick={onToggle}
          className="mt-0.5 flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-md transition-colors hover:bg-black/[0.03] active:scale-95 group/check sm:h-7 sm:w-7"
          title={isDone ? (language === 'zh' ? '标记为未完成' : 'Mark as todo') : (language === 'zh' ? '标记为完成' : 'Mark as done')}
          aria-label={isDone ? (language === 'zh' ? '标记为未完成' : 'Mark as todo') : (language === 'zh' ? '标记为完成' : 'Mark as done')}
        >
          {isDone ? (
            <span className="flex h-[18px] w-[18px] items-center justify-center rounded-md bg-emerald-500 text-white">
              <Check className="h-3 w-3" strokeWidth={2.5} />
            </span>
          ) : (
            <span className="flex h-[18px] w-[18px] items-center justify-center rounded-md border-[1.5px] border-border-strong bg-surface-elevated text-transparent transition-colors group-hover/check:border-accent group-hover/check:text-accent/70">
              <Check className="h-3 w-3" strokeWidth={2.5} />
            </span>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <h3 className={`break-words text-[14px] font-medium leading-snug ${isDone ? 'text-text-muted line-through' : 'text-text-heading'}`}>
            {task.title}
          </h3>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-text-muted">
            {onOpenSpace ? (
              <button
                type="button"
                onClick={() => onOpenSpace(task.originNodeId)}
                className={`inline-flex min-w-0 items-center gap-1 rounded-md border px-1.5 py-0.5 font-medium cursor-pointer hover:border-accent/30 hover:bg-accent/15 ${spaceTitle ? 'border-accent/15 bg-accent/10 text-accent' : 'border-transparent text-text-muted'}`}
                data-testid={`task-card-event-${task.id}`}
                title={eventLabel}
              >
                {spaceTitle && <Network className="h-3 w-3 shrink-0" aria-hidden="true" />}
                <span className="truncate">{eventLabel}</span>
              </button>
            ) : (
              <span
                className="inline-flex min-w-0 items-center gap-1 border border-transparent px-1.5 py-0.5 font-medium text-text-muted"
                data-testid={`task-card-event-${task.id}`}
                title={eventLabel}
              >
                <span className="truncate">{eventLabel}</span>
              </span>
            )}
            {task.sourcePath && task.sourcePath.length > 0 && (
              <span className="inline-flex min-w-0 items-center gap-0.5 text-text-muted/80" data-testid={`task-card-path-${task.id}`}>
                {task.sourcePath.map((segment, index) => (
                  <React.Fragment key={`${segment}-${index}`}>
                    {index > 0 && <ChevronRight className="h-2.5 w-2.5 shrink-0 opacity-45" aria-hidden="true" />}
                    <span className="max-w-28 truncate">{segment}</span>
                  </React.Fragment>
                ))}
              </span>
            )}
            {task.deadline && (
              <span className={`inline-flex items-center gap-1 font-medium ${isOverdue ? 'text-[var(--color-danger)]' : 'text-text-muted'}`}>
                <Calendar className="h-3 w-3" aria-hidden="true" />
                <span title={task.deadline}>{deadlineLabel}</span>
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowDetails(value => !value)}
          className="mt-0.5 flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-black/[0.04] hover:text-text-heading sm:h-7 sm:w-7"
          aria-expanded={showDetails}
          aria-label={language === 'zh' ? '任务详情与操作' : 'Task details and actions'}
          data-testid={`task-details-toggle-${task.id}`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>

      {showDetails && (
        <div className="border-t border-border/50 px-3 pb-3 pt-2.5" ref={detailsRef} data-testid={`task-details-${task.id}`}>
          {/* Attribute bar (S3): deadline and tags edit inline, changes commit immediately. */}
          <div className="mb-2 flex flex-wrap items-center gap-2 border-b border-border/40 pb-2">
            <label className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1 text-[12px] text-text-muted">
              <Calendar className="h-3 w-3" />
              <input
                ref={deadlineInputRef}
                type="date"
                aria-label={language === 'zh' ? '截止日期' : 'Deadline'}
                className="border-0 bg-transparent outline-none"
                value={task.deadline || ''}
                onChange={event => onEdit({ deadline: event.target.value || undefined })}
              />
            </label>
            <TagInput tags={task.tags || []} onChange={tags => onEdit({ tags })} availableTags={categories} language={language} />
            {onSetRecurrence && (
              <div className="relative inline-flex">
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1 text-[12px] text-text-muted hover:text-text-heading"
                  data-testid={`task-recurrence-${task.id}`}
                  onClick={() => setRecOpen(value => !value)}
                >
                  <Repeat className="h-3 w-3" />
                  {language === 'zh' ? '重复' : 'Repeat'}
                </button>
                {recOpen && (
                  <div
                    className="absolute left-0 top-full z-30 mt-1 w-64 rounded-lg border border-border bg-surface p-2 shadow-lg"
                    data-testid={`task-recurrence-pop-${task.id}`}
                  >
                    <div className="flex flex-wrap items-center gap-1">
                      {(['daily', 'weekly', 'monthly'] as const).map(type => (
                        <button
                          key={type}
                          type="button"
                          className={`rounded-md px-2 py-1 text-[12px] font-medium ${
                            recRule?.type === type ? 'bg-accent/15 text-accent' : 'text-text-muted hover:bg-black/5'
                          }`}
                          data-testid={`task-recurrence-${type}-${task.id}`}
                          onClick={() => {
                            if (type === 'weekly') {
                              setRecRule({ type: 'weekly', weekdays: [1, 2, 3, 4, 5] });
                            } else if (type === 'monthly') {
                              setRecRule({ type: 'monthly', dayOfMonth: new Date().getDate() });
                            } else {
                              setRecRule({ type: 'daily' });
                            }
                          }}
                        >
                          {type === 'daily' ? (language === 'zh' ? '每天' : 'Daily')
                            : type === 'weekly' ? (language === 'zh' ? '每周' : 'Weekly')
                              : (language === 'zh' ? '每月' : 'Monthly')}
                        </button>
                      ))}
                    </div>
                    {recRule?.type === 'weekly' && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        {['日', '一', '二', '三', '四', '五', '六'].map((letter, index) => {
                          const selected = recRule.weekdays.includes(index);
                          return (
                            <button
                              key={letter}
                              type="button"
                              className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                                selected ? 'bg-accent/15 text-accent' : 'text-text-muted hover:bg-black/5'
                              }`}
                              onClick={() => {
                                const next = selected
                                  ? recRule.weekdays.filter(day => day !== index)
                                  : [...recRule.weekdays, index].sort((a, b) => a - b);
                                setRecRule(next.length > 0 ? { type: 'weekly', weekdays: next } : null);
                              }}
                            >
                              {letter}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {recRule?.type === 'monthly' && (
                      <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-text-muted">
                        {language === 'zh' ? '每月几号' : 'Day of month'}
                        <input
                          type="number"
                          min={1}
                          max={31}
                          className="w-14 rounded border border-border bg-transparent px-1.5 py-0.5 outline-none"
                          value={recRule.dayOfMonth}
                          onChange={(event) => {
                            const day = Number(event.target.value);
                            if (day >= 1 && day <= 31) setRecRule({ type: 'monthly', dayOfMonth: day });
                          }}
                        />
                      </div>
                    )}
                    <button
                      type="button"
                      className="mt-2 w-full rounded-md bg-accent/15 px-2 py-1 text-[12px] font-semibold text-accent disabled:opacity-40"
                      data-testid={`task-recurrence-save-${task.id}`}
                      disabled={!recRule}
                      onClick={() => {
                        if (recRule) onSetRecurrence(task, recRule);
                        setRecRule(null);
                        setRecOpen(false);
                      }}
                    >
                      {language === 'zh' ? '保存重复规则' : 'Save recurrence'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {editingContent ? (
            <div className="space-y-3">
              <textarea
                autoFocus
                value={editContent}
                onChange={event => setEditContent(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Escape' && !event.nativeEvent.isComposing) cancelEdit();
                }}
                rows={Math.max(2, editContent.split('\n').length)}
                placeholder={language === 'zh' ? '任务标题…' : 'Task title…'}
                className="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-[13px] text-text-heading outline-none focus:border-accent"
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={cancelEdit} className="rounded-lg px-3 py-1.5 text-[12px] text-text-muted hover:bg-black/[0.03]">
                  {language === 'zh' ? '取消' : 'Cancel'}
                </button>
                <button type="button" onClick={submitEdit} className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-white">
                  {language === 'zh' ? '保存' : 'Save'}
                </button>
              </div>
            </div>
          ) : (
            <>
              {task.description && <p className="mb-2 whitespace-pre-wrap text-[12px] leading-relaxed text-text-muted">{task.description}</p>}

              <div className="mb-2 flex flex-wrap gap-1.5">
                {task.tags?.filter(tag => !['tasks', 'work', 'life'].includes(tag)).map(tag => (
                  <span key={tag} className={`rounded-md border bg-transparent px-1.5 py-0.5 text-[11px] font-medium ${getTagColor(tag)}`}>#{tag}</span>
                ))}
                {task.project && <span className="rounded-md border border-border px-1.5 py-0.5 text-[11px] text-text-muted">{task.project}</span>}
                {task.priority && <span className="rounded-md border border-border px-1.5 py-0.5 text-[11px] capitalize text-text-muted">{task.priority}</span>}
                {task.source_date && task.source_date !== currentFileDate && (
                  <span className="rounded-md border border-border px-1.5 py-0.5 text-[11px] text-text-muted">
                    {language === 'zh' ? `从 ${task.source_date} 迁移` : `Migrated from ${task.source_date}`}
                  </span>
                )}
                {(task.spaceId || task.originMindmapId) && onUnlinkFromSpace && (
                  <button
                    type="button"
                    onClick={() => onUnlinkFromSpace(task.id)}
                    className="rounded-md border border-border px-1.5 py-0.5 text-[11px] text-text-muted hover:text-text-heading"
                    data-testid={`task-card-space-unlink-${task.id}`}
                  >
                    {language === 'zh' ? '移出事件' : 'Remove from event'}
                  </button>
                )}
              </div>

              {(task.comment || task.comments?.length || showComment) && (
                <div className="mb-2 space-y-2">
                  {(task.comment || task.comments?.length) && (
                    <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                      <MessageSquare className="h-3 w-3" />
                      {isDone ? (language === 'zh' ? '解决方案' : 'Resolution') : (language === 'zh' ? '备注' : 'Comments')}
                    </div>
                  )}
                  {task.comments?.map((comment, index) => (
                    <div key={`${comment.timestamp}-${index}`} className="group/comment relative rounded-lg border-l-2 border-border bg-black/[0.02] px-3 py-2 pr-8 text-xs text-text-muted">
                      {comment.timestamp && <div className="mb-0.5 font-mono text-[11px] opacity-60">{comment.timestamp}</div>}
                      <div className="whitespace-pre-wrap">{comment.text}</div>
                      <button
                        type="button"
                        onClick={() => onEdit({ comments: (task.comments || []).filter((_, itemIndex) => itemIndex !== index) })}
                        className="absolute right-1.5 top-1.5 rounded p-1 text-text-muted opacity-0 transition-opacity group-hover/comment:opacity-100"
                        aria-label={language === 'zh' ? '删除这条备注' : 'Delete this comment'}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  {task.comment && !task.comments?.length && (
                    <div className="rounded-lg border-l-2 border-border bg-black/[0.02] px-3 py-2 text-xs text-text-muted">{task.comment}</div>
                  )}
                  {showComment && (
                    <div className="space-y-1.5">
                      <textarea
                        autoFocus
                        value={commentText}
                        onChange={event => setCommentText(event.target.value)}
                        onKeyDown={event => {
                          if (event.key === 'Escape' && !event.nativeEvent.isComposing) closeComment();
                          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing) {
                            event.preventDefault();
                            saveComment();
                          }
                        }}
                        placeholder={isDone
                          ? (language === 'zh' ? '这件事是怎么解决的？（可选，⌘+Enter 保存）' : 'How did you resolve this? (optional, ⌘+Enter to save)')
                          : (language === 'zh' ? '添加备注…（⌘+Enter 保存）' : 'Add a note… (⌘+Enter to save)')}
                        className="min-h-[56px] w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text-heading outline-none focus:border-accent"
                        rows={2}
                      />
                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => { suppressComments(); closeComment(); }}
                          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-text-muted hover:bg-black/[0.03]"
                        >
                          <BellOff className="h-3 w-3" />
                          {language === 'zh' ? '不再询问' : "Don't ask again"}
                        </button>
                        <div className="flex gap-1.5">
                          <button type="button" onClick={closeComment} className="rounded-md px-2.5 py-1 text-[12px] text-text-muted hover:bg-black/[0.03]">
                            {language === 'zh' ? '取消' : 'Cancel'}
                          </button>
                          <button type="button" onClick={saveComment} className="rounded-md bg-accent px-3 py-1 text-[12px] font-semibold text-white">
                            {language === 'zh' ? '保存' : 'Save'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {(onAiAction || onConvertToProject) && (
                <div className="mb-2 flex flex-wrap items-center gap-1 border-t border-border/40 pt-2" data-testid={`task-ai-row-${task.id}`}>
                  {onAiAction && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                      <Sparkles className="h-3 w-3" />
                      {language === 'zh' ? 'AI 帮你' : 'AI'}
                    </span>
                  )}
                  {onConvertToProject && !task.originMindmapId && !task.spaceId && (
                    <button
                      type="button"
                      disabled={converting}
                      onClick={() => {
                        setConvertTitle(task.title);
                        setConvertNodes('');
                        setShowConvert(true);
                      }}
                      className="rounded-md border border-border/70 px-2 py-1 text-[12px] text-text-muted transition-colors hover:border-accent/30 hover:bg-accent/5 hover:text-accent disabled:opacity-50"
                      data-testid={`task-convert-project-${task.id}`}
                    >
                      {language === 'zh' ? '转成项目' : 'To project'}
                    </button>
                  )}
                  {([
                    ['decompose', language === 'zh' ? '拆解成子任务' : 'Subtasks'],
                    ['rewrite', language === 'zh' ? '改写更清晰' : 'Rewrite'],
                    ['summarize', language === 'zh' ? '总结' : 'Summarize'],
                  ] as const).map(([action, label]) => (
                    <button
                      key={action}
                      type="button"
                      disabled={aiBusy !== null}
                      onClick={() => {
                        setAiBusy(action);
                        void onAiAction?.(task, action).finally(() => setAiBusy(null));
                      }}
                      className="rounded-md border border-border/70 px-2 py-1 text-[12px] text-text-muted transition-colors hover:border-accent/30 hover:bg-accent/5 hover:text-accent disabled:opacity-50"
                      data-testid={`task-ai-${action}-${task.id}`}
                    >
                      {aiBusy === action ? (language === 'zh' ? '处理中…' : 'Working…') : label}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-1 border-t border-border/40 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowComment(true)}
                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] text-text-muted hover:bg-black/[0.03] hover:text-text-heading"
                    aria-label={language === 'zh' ? '添加任务备注' : 'Add task comment'}
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    {language === 'zh' ? '备注' : 'Comment'}
                  </button>
                  {onCreateLinkedNote && (
                    <button type="button" onClick={onCreateLinkedNote} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] text-text-muted hover:bg-black/[0.03] hover:text-text-heading">
                      <FileText className="h-3.5 w-3.5" />
                      {language === 'zh' ? '新建关联笔记' : 'Link note'}
                    </button>
                  )}
                  {linkedNotesCount > 0 && (
                    <button type="button" onClick={onShowLinkedNotes} className="rounded-md px-2 py-1.5 text-[12px] text-text-muted hover:bg-black/[0.03] hover:text-text-heading">
                      {language === 'zh' ? `查看笔记 ${linkedNotesCount}` : `View notes ${linkedNotesCount}`}
                    </button>
                  )}
                  {!isDone && (
                    <button type="button" onClick={() => setEditingContent(true)} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] text-text-muted hover:bg-black/[0.03] hover:text-text-heading" aria-label={language === 'zh' ? '编辑任务' : 'Edit task'}>
                      <Edit2 className="h-3.5 w-3.5" />
                      {language === 'zh' ? '编辑' : 'Edit'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onToggle}
                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] text-text-muted hover:bg-black/[0.03] hover:text-text-heading"
                    data-testid={`task-card-complete-${task.id}`}
                  >
                    <Check className="h-3.5 w-3.5" />
                    {isDone
                      ? (language === 'zh' ? '标记未完成' : 'Mark as todo')
                      : (language === 'zh' ? '标记完成' : 'Mark done')}
                  </button>
                  {confirmingDelete ? (
                    <div className="ml-auto flex items-center gap-1">
                      <button type="button" onClick={() => { onDelete(); setConfirmingDelete(false); }} className="rounded-md bg-[var(--color-danger)] px-2.5 py-1 text-[12px] font-semibold text-white">
                        {language === 'zh' ? '确认删除' : 'Confirm delete'}
                      </button>
                      <button type="button" onClick={() => setConfirmingDelete(false)} className="rounded-md px-2 py-1 text-[12px] text-text-muted hover:bg-black/[0.03]">
                        {language === 'zh' ? '取消' : 'Cancel'}
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setConfirmingDelete(true)} className="ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] text-text-muted hover:bg-[var(--color-danger-light)] hover:text-[var(--color-danger)]" aria-label={language === 'zh' ? '删除任务' : 'Delete task'}>
                      <Trash2 className="h-3.5 w-3.5" />
                      {language === 'zh' ? '删除' : 'Delete'}
                    </button>
                  )}
                </div>
            </>
          )}
        </div>
      )}

      {showConvert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4" data-testid={`task-convert-dialog-${task.id}`}>
          <div className="w-full max-w-md rounded-xl border border-border bg-background p-5 shadow-2xl">
            <p className="text-sm font-semibold text-text-heading">
              {language === 'zh' ? '把这个任务转成项目' : 'Convert this task into a project'}
            </p>
            <p className="mt-1 text-xs text-text-muted">
              {language === 'zh'
                ? '会新建一个事件画布，这个任务成为画布里的第一个任务节点。'
                : 'Creates a new event canvas; this task becomes its first task node.'}
            </p>
            <label className="mt-4 block text-[12px] font-medium text-text-muted">
              {language === 'zh' ? '项目名称' : 'Project title'}
              <input
                autoFocus
                value={convertTitle}
                onChange={event => setConvertTitle(event.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-[13px] text-text-heading outline-none focus:border-accent"
                data-testid={`task-convert-title-${task.id}`}
              />
            </label>
            <label className="mt-3 block text-[12px] font-medium text-text-muted">
              {language === 'zh' ? '初始步骤（每行一个，可留空）' : 'Initial steps (one per line, optional)'}
              <textarea
                value={convertNodes}
                onChange={event => setConvertNodes(event.target.value)}
                rows={3}
                placeholder={language === 'zh' ? '写测试\n评审\n部署' : 'Write tests\nReview\nDeploy'}
                className="mt-1 w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-[12px] text-text-heading outline-none focus:border-accent"
                data-testid={`task-convert-nodes-${task.id}`}
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowConvert(false)}
                className="rounded-lg px-3 py-1.5 text-[12px] text-text-muted hover:bg-black/[0.03]"
              >
                {language === 'zh' ? '取消' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={!convertTitle.trim() || converting}
                onClick={() => {
                  setConverting(true);
                  void onConvertToProject?.(task, {
                    title: convertTitle.trim(),
                    extraNodes: convertNodes.split('\n').map(line => line.trim()).filter(Boolean),
                  }).finally(() => {
                    setConverting(false);
                    setShowConvert(false);
                  });
                }}
                className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50"
                data-testid={`task-convert-confirm-${task.id}`}
              >
                {converting
                  ? (language === 'zh' ? '创建中…' : 'Creating…')
                  : (language === 'zh' ? '建项目 + 进画布 →' : 'Create + open canvas →')}
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.article>
  );
};
