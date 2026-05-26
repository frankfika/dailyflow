import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Briefcase, Calendar, Check, CornerUpRight, Edit2, FileText, Trash2, X } from 'lucide-react';
import type { Task } from '../types/task';
import { getTagColor } from '../utils/tagColors';
import { TagInput } from './TagInput';

interface TaskCardProps {
  task: Task;
  language: 'en' | 'zh';
  categories: string[];
  currentFileDate: string;
  linkedNotesCount?: number;
  onToggle: () => void;
  onEdit: (updates: {
    title?: string;
    description?: string;
    tags?: string[];
    deadline?: string;
    priority?: 'high' | 'medium' | 'low';
    project?: string;
  }) => void;
  onDelete: () => void;
}

export const TaskCard: React.FC<TaskCardProps> = ({
  task,
  language,
  categories,
  currentFileDate,
  linkedNotesCount = 0,
  onToggle,
  onEdit,
  onDelete,
}) => {
  const isDone = task.status === 'done';
  const [isEditing, setIsEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editContent, setEditContent] = useState(
    task.title + (task.description ? '\n' + task.description : ''),
  );
  const [editTags, setEditTags] = useState<string[]>(task.tags || []);
  const [editDeadline, setEditDeadline] = useState<string>(task.deadline || '');
  const [tagInputValue, setTagInputValue] = useState('');

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
      exit={{ opacity: 0, scale: 0.95 }}
      className={`group relative floating-card p-5 flex items-start space-x-4
        ${isDone ? 'bg-background border-transparent shadow-none opacity-60' : 'bg-surface-white border-border/60'}`}
    >
      <button
        onClick={onToggle}
        className="mt-[2px] flex-shrink-0 hover:scale-105 active:scale-95 transition-transform focus:outline-none"
      >
        {isDone ? (
          <div className="w-5 h-5 rounded bg-accent flex items-center justify-center shadow-sm">
            <Check className="w-3 h-3 text-white" />
          </div>
        ) : (
          <div className="w-5 h-5 rounded border border-border flex items-center justify-center text-transparent hover:border-accent hover:text-accent transition-colors">
            <Check className="w-3 h-3" />
          </div>
        )}
      </button>

      <div className="flex-1 min-w-0 pr-[72px] sm:pr-16 xl:pr-8">
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
                if (e.key === 'Escape') {
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
              <label className={`w-fit flex items-center gap-1.5 px-2.5 py-1 rounded-md border transition-all cursor-pointer ${editDeadline ? 'bg-accent-highlight text-accent border-accent/20' : 'bg-surface text-text-muted border-transparent hover:bg-border/50'}`}>
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
                    className="ml-0.5 text-accent opacity-60 hover:opacity-100 hover:text-stone-500 transition-colors"
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

            <div className="flex justify-end gap-2 pt-2 border-t border-border/30">
              <button
                onClick={() => {
                  setEditContent(task.title + (task.description ? '\n' + task.description : ''));
                  setEditTags(task.tags || []);
                  setEditDeadline(task.deadline || '');
                  setIsEditing(false);
                }}
                className="px-3 py-1.5 text-text-muted hover:text-text-heading text-[13px] font-medium transition-colors"
              >
                {language === 'zh' ? '取消' : 'Cancel'}
              </button>
              <button
                onClick={submitEdit}
                className="px-4 py-1.5 bg-accent text-white rounded-md text-[13px] font-medium hover:bg-accent/90 transition-colors shadow-sm"
              >
                {language === 'zh' ? '保存' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <h3
              onDoubleClick={() => !isDone && setIsEditing(true)}
              className={`font-sans text-[15px] font-medium leading-snug transition-colors cursor-text ${isDone ? 'text-text-muted line-through' : 'text-text-heading hover:text-accent'}`}
              title={language === 'zh' ? '双击编辑' : 'Double-click to edit'}
            >
              {task.title}
            </h3>
            {task.description && (
              <div
                onDoubleClick={() => !isDone && setIsEditing(true)}
                className={`mt-1 text-[13px] leading-relaxed cursor-text ${isDone ? 'text-text-muted/60' : 'text-text-muted/80 max-w-[95%]'}`}
              >
                {task.description}
              </div>
            )}
          </div>
        )}

        {(task.project || task.deadline || task.priority || task.source_date !== currentFileDate || (task.tags && task.tags.length > 0)) && (
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {task.source_date && task.source_date !== currentFileDate && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-accent text-xs font-semibold bg-accent/10 border border-accent/20 shadow-sm">
                <CornerUpRight className="w-3.5 h-3.5" />
                <span>{language === 'zh' ? `从 ${task.source_date} 迁移` : `Migrated from ${task.source_date}`}</span>
              </span>
            )}
            {task.tags && task.tags.filter((t: string) => !['tasks', 'work', 'life'].includes(t)).map((tag: string) => (
              <span key={tag} className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${getTagColor(tag)}`}>
                <span>#{tag}</span>
              </span>
            ))}
            {task.project && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface text-text-main text-[11px] font-medium border border-transparent">
                <Briefcase className="w-3 h-3 opacity-60" />
                <span>{task.project}</span>
              </span>
            )}
            {task.deadline && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-accent-highlight text-accent border border-accent/10 text-[11px] font-medium">
                <Calendar className="w-3 h-3" />
                <span>{task.deadline}</span>
              </span>
            )}
            {task.priority === 'high' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-accent text-white text-[11px] font-medium shadow-sm shadow-accent/20">
                <span>Priority</span>
              </span>
            )}
            {linkedNotesCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface text-text-muted text-[11px] font-medium border border-transparent">
                <FileText className="w-3 h-3" />
                <span>{linkedNotesCount}</span>
              </span>
            )}
          </div>
        )}
      </div>

      <div className="absolute top-4 right-4 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex items-center space-x-1">
        {!isDone && !isEditing && (
          <button onClick={() => setIsEditing(true)} className="p-1.5 text-text-muted hover:text-accent transition-colors rounded-md hover:bg-surface">
            <Edit2 className="w-4 h-4" />
          </button>
        )}
        {confirmingDelete ? (
          <button
            onClick={() => { onDelete(); setConfirmingDelete(false); }}
            onBlur={() => setConfirmingDelete(false)}
            autoFocus
            className="px-2 py-1 text-[11px] font-medium text-stone-600 bg-stone-50 border border-stone-200 rounded-md animate-pulse whitespace-nowrap"
          >
            {language === 'zh' ? '确认删除?' : 'Confirm?'}
          </button>
        ) : (
          <button
            onClick={() => {
              setConfirmingDelete(true);
              setTimeout(() => setConfirmingDelete(false), 3000);
            }}
            className="p-1.5 text-text-muted hover:text-stone-500 transition-colors rounded-md hover:bg-stone-50"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </motion.div>
  );
};