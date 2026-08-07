import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Briefcase, Calendar, Check, CornerUpRight, Edit2, FileText, MessageSquare, Trash2, X, BellOff } from 'lucide-react';
import type { Task } from '../types/task';
import { getTagColor, getTodayStr } from '../utils/tagColors';
import { TagInput } from './TagInput';

const SUPPRESS_KEY = 'df_suppress_completion_comments';
function isCommentSuppressed(): boolean {
  try { return sessionStorage.getItem(SUPPRESS_KEY) === '1'; } catch { return false; }
}
function suppressComments(): void {
  try { sessionStorage.setItem(SUPPRESS_KEY, '1'); } catch {}
}

interface TaskCardProps {
  task: Task;
  language: 'en' | 'zh';
  categories: string[];
  currentFileDate: string;
  linkedNotesCount?: number;
  /**
   * Phase 4 (Topic Spaces): human-readable title of the space the task
   * is bound to. When `task.spaceId` is set but `spaceTitle` is not
   * provided, the indicator falls back to showing the id.
   */
  spaceTitle?: string;
  /**
   * Phase 4: callback fired by the small × on the space binding. The
   * parent owns the actual update (e.g. `tasksApi.updateSpace(id, null)`).
   * If omitted the × is not rendered.
   */
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

export const TaskCard: React.FC<TaskCardProps> = ({
  task,
  language,
  categories,
  currentFileDate,
  linkedNotesCount = 0,
  spaceTitle,
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
  const [showComment, setShowComment] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editContent, setEditContent] = useState(
    task.title + (task.description ? '\n' + task.description : ''),
  );
  const [editTags, setEditTags] = useState<string[]>(task.tags || []);
  const [editDeadline, setEditDeadline] = useState<string>(task.deadline || '');
  const [tagInputValue, setTagInputValue] = useState('');

  // Sync external completion prompt signal with local state.
  // Defense-in-depth: even if the prompt is asserted true, skip opening the
  // textarea when the task already carries any comment (legacy or new).
  useEffect(() => {
    if (!showCompletionPrompt) return;
    const hasAnyComment = !!task.comment || !!(task.comments && task.comments.length > 0);
    if (hasAnyComment) return;
    setShowComment(true);
  }, [showCompletionPrompt, task.comment, task.comments]);

  useEffect(() => {
    if (!isEditing) {
      setEditContent(task.title + (task.description ? '\n' + task.description : ''));
      setEditTags(task.tags || []);
      setEditDeadline(task.deadline || '');
    }
  }, [task, isEditing]);

  const submitEdit = () => {
    if (editContent.trim()) {
      const lines = editContent.trim().split('\n');
      const newTitle = lines[0].trim();
      const newDesc = lines.slice(1).join('\n').trim() || '';

      onEdit({
        title: newTitle,
        description: newDesc,
        tags: editTags,
        deadline: editDeadline || undefined,
      });
    } else {
      setEditContent(task.title + (task.description ? '\n' + task.description : ''));
    }
    setIsEditing(false);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ layout: { type: 'spring', stiffness: 500, damping: 40 }, duration: 0.22 }}
      className={`group relative flex items-start gap-2.5 rounded-lg border p-3 transition-colors duration-200
        ${isDone
          ? 'border-border/40 bg-surface/45 opacity-65'
          : 'border-border/70 bg-surface-elevated/75 hover:border-border-strong hover:bg-surface-elevated'
        }`}
    >
      <button
        onClick={() => {
          onToggle();
        }}
        className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md transition-colors hover:bg-black/[0.03] active:scale-95 group/check"
        title={isDone ? (language === 'zh' ? '标记为未完成' : 'Mark as todo') : (language === 'zh' ? '标记为完成' : 'Mark as done')}
        aria-label={isDone ? (language === 'zh' ? '标记为未完成' : 'Mark as todo') : (language === 'zh' ? '标记为完成' : 'Mark as done')}
      >
        {isDone ? (
          <motion.div
            initial={{ scale: 0.8, rotate: -45 }}
            animate={{ scale: 1, rotate: 0 }}
            className="relative flex h-4.5 w-4.5 items-center justify-center overflow-hidden rounded-md bg-emerald-500"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent" />
            <Check className="w-3 h-3 text-white relative z-10" strokeWidth={2.5} />
          </motion.div>
        ) : (
          <div className="relative flex h-4.5 w-4.5 items-center justify-center rounded-md border-[1.5px] border-border-strong bg-surface-elevated text-transparent transition-colors group-hover/check:border-accent group-hover/check:text-accent/70">
            <Check className="w-3 h-3 relative z-10" strokeWidth={2.5} />
          </div>
        )}
      </button>

      <div className="min-w-0 flex-1 pr-[72px] sm:pr-16 xl:pr-8">
        {isEditing ? (
          <div className="space-y-3">
            <textarea
              autoFocus
              ref={(el) => {
                if (el) {
                  el.style.height = 'inherit';
                  el.style.height = `${el.scrollHeight}px`;
                }
              }}
              value={editContent}
              onChange={(e) => {
                setEditContent(e.target.value);
                e.target.style.height = 'inherit';
                e.target.style.height = `${e.target.scrollHeight}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && !e.nativeEvent.isComposing) {
                  setEditContent(task.title + (task.description ? '\n' + task.description : ''));
                  setEditTags(task.tags || []);
                  setEditDeadline(task.deadline || '');
                  setIsEditing(false);
                }
              }}
              rows={1}
              placeholder={language === 'zh' ? '任务标题...' : 'Task title...'}
              className="bg-transparent border-b border-border focus:border-accent outline-none font-sans font-medium text-[15px] leading-snug w-full text-text-heading resize-none overflow-hidden min-h-[32px] pb-1 transition-colors"
            />

            <div className="flex flex-col gap-3">
              <label className={`w-fit flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${editDeadline ? 'bg-accent/10 text-accent border-accent/20' : 'bg-surface text-text-muted border-transparent hover:bg-black/[0.03]'}`}>
                <Calendar className="w-3.5 h-3.5" />
                <input
                  type="date"
                  className="bg-transparent outline-none border-none text-[13px] font-medium cursor-pointer"
                  value={editDeadline}
                  onChange={e => setEditDeadline(e.target.value)}
                />
                {editDeadline && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      setEditDeadline('');
                    }}
                    className="ml-0.5 text-accent opacity-60 hover:opacity-100 hover:text-text-muted transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </label>

              <TagInput
                tags={editTags}
                onChange={setEditTags}
                availableTags={categories}
                language={language}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
              <button
                onClick={() => {
                  setEditContent(task.title + (task.description ? '\n' + task.description : ''));
                  setEditTags(task.tags || []);
                  setEditDeadline(task.deadline || '');
                  setIsEditing(false);
                }}
                className="px-3 py-1.5 text-text-muted hover:text-text-heading text-[13px] font-medium transition-colors rounded-lg hover:bg-black/[0.03]"
              >
                {language === 'zh' ? '取消' : 'Cancel'}
              </button>
              <button
                onClick={submitEdit}
                className="px-4 py-1.5 bg-gradient-to-br from-accent to-accent-warm text-white rounded-lg text-[13px] font-semibold hover:shadow-[0_4px_12px_rgba(0,122,255,0.3)] transition-all active:scale-95 shadow-sm relative overflow-hidden group/save"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent opacity-0 group-hover/save:opacity-100 transition-opacity" />
                <span className="relative z-10">{language === 'zh' ? '保存' : 'Save'}</span>
              </button>
            </div>
          </div>
        ) : (
          <div>
            <h3
              onDoubleClick={() => !isDone && setIsEditing(true)}
              className={`cursor-text break-words font-sans text-[14px] font-medium leading-snug transition-colors ${isDone ? 'text-text-muted line-through' : 'text-text-heading'}`}
              title={language === 'zh' ? '双击编辑' : 'Double-click to edit'}
            >
              {task.title}
            </h3>
            {task.description && (
              <div
                onDoubleClick={() => !isDone && setIsEditing(true)}
                className={`mt-1 cursor-text break-words text-[12px] leading-relaxed ${isDone ? 'text-text-muted/60' : 'max-w-[95%] text-text-muted/80'}`}
              >
                {task.description}
              </div>
            )}
          </div>
        )}

        {(task.project || task.deadline || task.priority || task.source_date !== currentFileDate || (task.tags && task.tags.length > 0)) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {task.source_date && task.source_date !== currentFileDate && (
              // Demoted to a small inline annotation — was a bright accent pill
              // that read as a system notification. Now it sits with the rest
              // of the metadata text.
              <span className="inline-flex items-center gap-1 text-text-muted text-[10px] font-normal">
                <CornerUpRight className="w-2.5 h-2.5" />
                <span>{language === 'zh' ? `从 ${task.source_date} 迁移` : `migrated from ${task.source_date}`}</span>
              </span>
            )}
            {task.tags && task.tags.filter((t: string) => !['tasks', 'work', 'life'].includes(t)).map((tag: string) => (
              <span key={tag} className={`inline-flex cursor-default items-center rounded-md border bg-transparent px-1.5 py-0.5 text-[10px] font-medium transition-colors ${getTagColor(tag)}`}>
                <span>#{tag}</span>
              </span>
            ))}
            {task.spaceId && (
              // Phase 4 (Topic Spaces): show a "已绑定到 [Space]" indicator
              // when the task is bound to a topic space. The title comes
              // from a lookup; we fall back to the id if the parent
              // didn't pass one. Unlink fires `onUnlinkFromSpace`.
              <span
                data-testid={`task-card-space-binding-${task.id}`}
                className="inline-flex items-center gap-1 rounded-md border border-[var(--color-accent)]/30 bg-[var(--color-accent-light)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-accent)]"
              >
                <span className="font-mono text-[9px] opacity-70">@</span>
                <span>{spaceTitle ?? task.spaceId}</span>
                {onUnlinkFromSpace && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onUnlinkFromSpace(task.id);
                    }}
                    title={language === 'zh' ? '解除主题绑定' : 'Unlink from space'}
                    data-testid={`task-card-space-unlink-${task.id}`}
                    className="ml-0.5 inline-flex h-3 w-3 items-center justify-center rounded-full text-[var(--color-accent)]/70 hover:bg-white/60 hover:text-[var(--color-accent)]"
                    aria-label={language === 'zh' ? '解除主题绑定' : 'Unlink from space'}
                  >
                    ×
                  </button>
                )}
              </span>
            )}
            {task.project && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-surface text-text-main text-[11px] font-medium border border-border/60">
                <Briefcase className="w-3 h-3 opacity-60" />
                <span>{task.project}</span>
              </span>
            )}
            {task.deadline && (() => {
              // 过期日期用 danger 色，未来日期用 info 色；从别的日期迁来的用 muted 色
              const today = getTodayStr();
              const isMigrated = task.status === 'migrated' || (task.source_date && task.source_date !== currentFileDate);
              const isOverdue = !isDone && !isMigrated && task.deadline < today;
              const cls = isMigrated
                ? 'bg-surface text-text-muted border-border/60'
                : isOverdue
                  ? 'bg-[var(--color-danger-light)] text-[var(--color-danger)] border-[var(--color-danger)]/15'
                  : 'bg-[var(--color-info-light)] text-[var(--color-info)] border-[var(--color-info)]/15';
              return (
                <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>
                  <Calendar className="w-3 h-3" />
                  <span>{task.deadline}</span>
                </span>
              );
            })()}
            {task.priority === 'high' && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-white text-[11px] font-medium shadow-sm" style={{ background: 'var(--gradient-warm)' }}>
                <span>Priority</span>
              </span>
            )}
            {task.priority === 'medium' && (
              <span className="status-pill status-pill-warning">
                <span>Medium</span>
              </span>
            )}
            {linkedNotesCount > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); onShowLinkedNotes?.(); }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-surface text-text-muted hover:text-accent hover:bg-accent/10 text-[11px] font-medium border border-border/60 transition-colors cursor-pointer"
                title={language === 'zh' ? '查看关联笔记' : 'View linked notes'}
              >
                <FileText className="w-3 h-3" />
                <span>{linkedNotesCount}</span>
              </button>
            )}
          </div>
        )}

        {/* Comment section — inline, lightweight notes attached to the task itself.
            Distinct from linked notes (a separate Note file referenced via FileText badge). */}
        {(task.comment || (task.comments && task.comments.length > 0) || showComment) && (
          <div className="mt-3 space-y-2">
            {(task.comments && task.comments.length > 0) || task.comment ? (
              <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-text-muted/70 font-semibold">
                <MessageSquare className="w-2.5 h-2.5" />
                {isDone
                  ? (language === 'zh' ? '解决方案' : 'Resolution')
                  : (language === 'zh' ? '备注' : 'Comments')}
              </div>
            ) : null}
            {/* List existing comments (with per-item delete) */}
            {(task.comments || []).map((c, idx) => (
              <div
                key={idx}
                className={`group/comment relative text-xs rounded-lg px-3 py-2 pr-7 transition-colors border-l-2 ${isDone ? 'bg-emerald-50/50 text-emerald-800 border-emerald-300' : 'bg-black/[0.02] text-text-muted/80 border-border/50'}`}
              >
                {c.timestamp && <div className="text-[10px] font-mono text-text-muted mb-0.5 opacity-60">{c.timestamp}</div>}
                <div className="whitespace-pre-wrap">{c.text}</div>
                <button
                  onClick={() => {
                    const next = (task.comments || []).filter((_, i) => i !== idx);
                    onEdit({ comments: next });
                  }}
                  className="absolute top-1.5 right-1.5 p-1 rounded opacity-0 group-hover/comment:opacity-100 text-text-muted/60 hover:text-text-muted hover:bg-black/5 transition-all"
                  title={language === 'zh' ? '删除这条备注' : 'Delete this comment'}
                  aria-label={language === 'zh' ? '删除这条备注' : 'Delete this comment'}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            {task.comment && (!task.comments || task.comments.length === 0) && (
              <div className={`text-xs rounded-lg px-3 py-2 transition-colors border-l-2 ${isDone ? 'bg-emerald-50/50 text-emerald-800 border-emerald-300' : 'bg-black/[0.02] text-text-muted/80 border-border/50'}`}>
                <div className="whitespace-pre-wrap">{task.comment}</div>
              </div>
            )}

            {showComment && (
              <div className="flex flex-col gap-1.5">
                <textarea
                  autoFocus
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Escape' && !e.nativeEvent.isComposing) {
                      setShowComment(false);
                      setCommentText('');
                      onCompletionPromptClosed?.();
                    }
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      if (commentText.trim()) {
                        const now = new Date();
                        const pad = (n: number) => String(n).padStart(2, '0');
                        const timestamp = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
                        const newComments = [...(task.comments || []), { text: commentText.trim(), timestamp }];
                        onEdit({ comments: newComments });
                      }
                      setShowComment(false);
                      setCommentText('');
                      onCompletionPromptClosed?.();
                    }
                  }}
                  placeholder={isDone
                    ? (language === 'zh' ? '这事是怎么解决的？(可选, ⌘+Enter 保存)' : "How did you resolve this? (optional, ⌘+Enter to save)")
                    : (language === 'zh' ? '添加备注... (⌘+Enter 保存)' : 'Add a note... (⌘+Enter to save)')}
                  className={`w-full bg-surface border rounded-lg px-3 py-2 text-xs outline-none resize-none min-h-[48px] ${isDone ? 'border-emerald-200 focus:border-emerald-400 text-emerald-900' : 'border-border/60 focus:border-accent text-text-muted'}`}
                  rows={2}
                />
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => { suppressComments(); setShowComment(false); setCommentText(''); onCompletionPromptClosed?.(); }}
                    className="flex items-center gap-1 text-[10px] text-text-muted/60 hover:text-text-muted transition-colors px-1.5 py-1 rounded-md hover:bg-black/[0.03]"
                    title={language === 'zh' ? '本次会话不再自动弹出' : 'Stop auto-prompting this session'}
                  >
                    <BellOff className="w-2.5 h-2.5" />
                    {language === 'zh' ? '不再询问' : "Don't ask again"}
                  </button>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => { setShowComment(false); setCommentText(''); onCompletionPromptClosed?.(); }}
                      className="px-2.5 py-1 text-[11px] text-text-muted hover:text-text-heading transition-colors rounded-md hover:bg-black/[0.03]"
                    >
                      {language === 'zh' ? '取消' : 'Cancel'}
                    </button>
                  <button
                    onClick={() => {
                      if (commentText.trim()) {
                        const now = new Date();
                        const pad = (n: number) => String(n).padStart(2, '0');
                        const timestamp = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
                        const newComments = [...(task.comments || []), { text: commentText.trim(), timestamp }];
                        onEdit({ comments: newComments });
                      }
                      setShowComment(false);
                      setCommentText('');
                      onCompletionPromptClosed?.();
                    }}
                    className={`px-3 py-1 text-white rounded-lg text-[11px] font-semibold transition-all shadow-sm hover:shadow-md active:scale-95 relative overflow-hidden group/csave ${isDone ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 hover:shadow-emerald-500/30' : 'bg-gradient-to-br from-accent to-accent-warm hover:shadow-accent/30'}`}
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent opacity-0 group-hover/csave:opacity-100 transition-opacity" />
                    <span className="relative z-10">{language === 'zh' ? '保存' : 'Save'}</span>
                  </button>
                </div>
              </div>
            </div>
            )}
          </div>
        )}
      </div>

      <div className="task-card-actions absolute top-3 right-3 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-all duration-200">
        {!isEditing && (
          <button
            onClick={() => setShowComment(true)}
            className="p-1.5 text-text-muted hover:text-accent hover:bg-accent/10 transition-all rounded-lg active:scale-95 hover:shadow-sm backdrop-blur-sm"
            title={language === 'zh' ? '加备注（写在任务上）' : 'Add comment (on this task)'}
            aria-label={language === 'zh' ? '添加任务备注' : 'Add task comment'}
          >
            <MessageSquare className="w-4 h-4" />
          </button>
        )}
        {!isEditing && onCreateLinkedNote && (
          <button
            onClick={onCreateLinkedNote}
            className="p-1.5 text-text-muted hover:text-accent hover:bg-accent/10 transition-all rounded-lg active:scale-95 hover:shadow-sm backdrop-blur-sm"
            title={language === 'zh' ? '关联一篇笔记（独立文件）' : 'Link a note (separate file)'}
            aria-label={language === 'zh' ? '关联笔记' : 'Link a note'}
          >
            <FileText className="w-4 h-4" />
          </button>
        )}
        {!isDone && !isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="p-1.5 text-text-muted hover:text-accent hover:bg-accent/10 transition-all rounded-lg active:scale-95 hover:shadow-sm backdrop-blur-sm"
            aria-label={language === 'zh' ? '编辑任务' : 'Edit task'}
          >
            <Edit2 className="w-4 h-4" />
          </button>
        )}
        {confirmingDelete ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-1"
          >
            <button
              onClick={() => { onDelete(); setConfirmingDelete(false); }}
              autoFocus
              className="px-2.5 py-1.5 text-[11px] font-semibold text-white bg-gradient-to-br from-[var(--color-danger)] to-red-600 hover:shadow-[0_4px_12px_rgba(255,59,48,0.3)] rounded-lg shadow-sm transition-all active:scale-95"
            >
              {language === 'zh' ? '删除' : 'Delete'}
            </button>
            <button
              onClick={() => setConfirmingDelete(false)}
              className="px-2.5 py-1.5 text-[11px] font-medium text-text-muted hover:text-text-heading hover:bg-black/[0.05] rounded-lg transition-colors"
            >
              {language === 'zh' ? '取消' : 'Cancel'}
            </button>
          </motion.div>
        ) : (
          <button
            onClick={() => {
              setConfirmingDelete(true);
              setTimeout(() => setConfirmingDelete(false), 4000);
            }}
            className="p-1.5 text-text-muted hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-light)] transition-all rounded-lg active:scale-95 hover:shadow-sm backdrop-blur-sm"
            aria-label={language === 'zh' ? '删除任务' : 'Delete task'}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </motion.div>
  );
};
