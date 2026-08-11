import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  BellOff,
  Calendar,
  Check,
  Edit2,
  FileText,
  MessageSquare,
  MoreHorizontal,
  Network,
  Trash2,
  X,
} from 'lucide-react';
import type { Task } from '../types/task';
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
  /** Opens the shared mind note that owns this task. */
  onOpenSpace?: () => void;
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
  onCreateLinkedNote,
  onShowLinkedNotes,
  showCompletionPrompt,
  onCompletionPromptClosed,
}) => {
  const isDone = task.status === 'done';
  const [isEditing, setIsEditing] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showComment, setShowComment] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editContent, setEditContent] = useState(task.title + (task.description ? `\n${task.description}` : ''));
  const [editTags, setEditTags] = useState<string[]>(task.tags || []);
  const [editDeadline, setEditDeadline] = useState(task.deadline || '');

  useEffect(() => {
    if (!showCompletionPrompt) return;
    const hasAnyComment = Boolean(task.comment || task.comments?.length);
    if (hasAnyComment) return;
    setShowDetails(true);
    setShowComment(true);
  }, [showCompletionPrompt, task.comment, task.comments]);

  useEffect(() => {
    if (isEditing) return;
    setEditContent(task.title + (task.description ? `\n${task.description}` : ''));
    setEditTags(task.tags || []);
    setEditDeadline(task.deadline || '');
  }, [task, isEditing]);

  const cancelEdit = () => {
    setEditContent(task.title + (task.description ? `\n${task.description}` : ''));
    setEditTags(task.tags || []);
    setEditDeadline(task.deadline || '');
    setIsEditing(false);
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
    setIsEditing(false);
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
    ? (language === 'zh' ? `来自脑图 · ${spaceTitle}` : `Mind map · ${spaceTitle}`)
    : (task.spaceId || task.originMindmapId
    ? (language === 'zh' ? '来自脑图' : 'From mind map')
    : (language === 'zh' ? '独立任务' : 'Standalone'));
  const hasAdvancedContent = Boolean(
    task.description || task.comment || task.comments?.length || task.tags?.length || task.project ||
    task.priority || linkedNotesCount || onCreateLinkedNote || !isDone,
  );
  const isOverdue = Boolean(task.deadline && !isDone && task.deadline < getTodayStr());
  const deadlineLabel = task.deadline ? formatTaskDeadline(task.deadline, language) : '';

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ layout: { type: 'spring', stiffness: 500, damping: 40 }, duration: 0.18 }}
      className={`group rounded-xl border transition-colors ${isDone ? 'border-border/40 bg-surface opacity-65' : 'border-border/70 bg-surface-elevated hover:border-border-strong'}`}
      data-testid={`task-card-${task.id}`}
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
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-text-muted">
            <button
              type="button"
              onClick={onOpenSpace}
              disabled={!onOpenSpace}
              className={`inline-flex min-w-0 items-center gap-1 rounded-md border px-1.5 py-0.5 font-medium ${spaceTitle ? 'border-accent/15 bg-accent/10 text-accent' : 'border-transparent text-text-muted'} ${onOpenSpace ? 'cursor-pointer hover:border-accent/30 hover:bg-accent/15' : 'cursor-default'}`}
              data-testid={`task-card-event-${task.id}`}
              title={eventLabel}
            >
              {spaceTitle && <Network className="h-3 w-3 shrink-0" aria-hidden="true" />}
              <span className="truncate">{eventLabel}</span>
            </button>
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
        <div className="border-t border-border/50 px-3 pb-3 pt-2.5" data-testid={`task-details-${task.id}`}>
          {isEditing ? (
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
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[12px] text-text-muted">
                  <Calendar className="h-3.5 w-3.5" />
                  <input
                    type="date"
                    className="border-0 bg-transparent outline-none"
                    value={editDeadline}
                    onChange={event => setEditDeadline(event.target.value)}
                  />
                </label>
                <TagInput tags={editTags} onChange={setEditTags} availableTags={categories} language={language} />
              </div>
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
                  <span key={tag} className={`rounded-md border bg-transparent px-1.5 py-0.5 text-[10px] font-medium ${getTagColor(tag)}`}>#{tag}</span>
                ))}
                {task.project && <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] text-text-muted">{task.project}</span>}
                {task.priority && <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] capitalize text-text-muted">{task.priority}</span>}
                {task.source_date && task.source_date !== currentFileDate && (
                  <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] text-text-muted">
                    {language === 'zh' ? `从 ${task.source_date} 迁移` : `Migrated from ${task.source_date}`}
                  </span>
                )}
                {(task.spaceId || task.originMindmapId) && onUnlinkFromSpace && (
                  <button
                    type="button"
                    onClick={() => onUnlinkFromSpace(task.id)}
                    className="rounded-md border border-border px-1.5 py-0.5 text-[10px] text-text-muted hover:text-text-heading"
                    data-testid={`task-card-space-unlink-${task.id}`}
                  >
                    {language === 'zh' ? '移出事件' : 'Unlink event'}
                  </button>
                )}
              </div>

              {(task.comment || task.comments?.length || showComment) && (
                <div className="mb-2 space-y-2">
                  {(task.comment || task.comments?.length) && (
                    <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                      <MessageSquare className="h-3 w-3" />
                      {isDone ? (language === 'zh' ? '解决方案' : 'Resolution') : (language === 'zh' ? '备注' : 'Comments')}
                    </div>
                  )}
                  {task.comments?.map((comment, index) => (
                    <div key={`${comment.timestamp}-${index}`} className="group/comment relative rounded-lg border-l-2 border-border bg-black/[0.02] px-3 py-2 pr-8 text-xs text-text-muted">
                      {comment.timestamp && <div className="mb-0.5 font-mono text-[10px] opacity-60">{comment.timestamp}</div>}
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
                          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] text-text-muted hover:bg-black/[0.03]"
                        >
                          <BellOff className="h-3 w-3" />
                          {language === 'zh' ? '不再询问' : "Don't ask again"}
                        </button>
                        <div className="flex gap-1.5">
                          <button type="button" onClick={closeComment} className="rounded-md px-2.5 py-1 text-[11px] text-text-muted hover:bg-black/[0.03]">
                            {language === 'zh' ? '取消' : 'Cancel'}
                          </button>
                          <button type="button" onClick={saveComment} className="rounded-md bg-accent px-3 py-1 text-[11px] font-semibold text-white">
                            {language === 'zh' ? '保存' : 'Save'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {hasAdvancedContent && (
                <div className="flex flex-wrap items-center gap-1 border-t border-border/40 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowComment(true)}
                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] text-text-muted hover:bg-black/[0.03] hover:text-text-heading"
                    aria-label={language === 'zh' ? '添加任务备注' : 'Add task comment'}
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    {language === 'zh' ? '备注' : 'Comment'}
                  </button>
                  {onCreateLinkedNote && (
                    <button type="button" onClick={onCreateLinkedNote} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] text-text-muted hover:bg-black/[0.03] hover:text-text-heading">
                      <FileText className="h-3.5 w-3.5" />
                      {language === 'zh' ? '新建关联笔记' : 'Link note'}
                    </button>
                  )}
                  {linkedNotesCount > 0 && (
                    <button type="button" onClick={onShowLinkedNotes} className="rounded-md px-2 py-1.5 text-[11px] text-text-muted hover:bg-black/[0.03] hover:text-text-heading">
                      {language === 'zh' ? `查看笔记 ${linkedNotesCount}` : `View notes ${linkedNotesCount}`}
                    </button>
                  )}
                  {!isDone && (
                    <button type="button" onClick={() => setIsEditing(true)} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] text-text-muted hover:bg-black/[0.03] hover:text-text-heading" aria-label={language === 'zh' ? '编辑任务' : 'Edit task'}>
                      <Edit2 className="h-3.5 w-3.5" />
                      {language === 'zh' ? '编辑' : 'Edit'}
                    </button>
                  )}
                  {confirmingDelete ? (
                    <div className="ml-auto flex items-center gap-1">
                      <button type="button" onClick={() => { onDelete(); setConfirmingDelete(false); }} className="rounded-md bg-[var(--color-danger)] px-2.5 py-1 text-[11px] font-semibold text-white">
                        {language === 'zh' ? '确认删除' : 'Confirm delete'}
                      </button>
                      <button type="button" onClick={() => setConfirmingDelete(false)} className="rounded-md px-2 py-1 text-[11px] text-text-muted hover:bg-black/[0.03]">
                        {language === 'zh' ? '取消' : 'Cancel'}
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setConfirmingDelete(true)} className="ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] text-text-muted hover:bg-[var(--color-danger-light)] hover:text-[var(--color-danger)]" aria-label={language === 'zh' ? '删除任务' : 'Delete task'}>
                      <Trash2 className="h-3.5 w-3.5" />
                      {language === 'zh' ? '删除' : 'Delete'}
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </motion.article>
  );
};
