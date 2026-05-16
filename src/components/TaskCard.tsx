import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Briefcase, Calendar, Check, CornerUpRight, Edit2, Trash2, X } from 'lucide-react';
import type { Task } from '../types/task';
import { getTagColor } from '../utils/tagColors';

interface TaskCardProps {
  task: Task;
  language: 'en' | 'zh';
  categories: string[];
  currentFileDate: string;
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
      whileHover={{ scale: 1.01 }}
      className={`group relative floating-card rounded-[24px] p-6 flex items-start space-x-5
        ${isDone ? 'bg-background border-border/30 shadow-none opacity-60' : 'bg-surface-white border-border/80'}`}
    >
      <button
        onClick={onToggle}
        className="mt-1 flex-shrink-0 hover:scale-110 transition-transform focus:outline-none"
      >
        {isDone ? (
          <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center shadow-sm">
            <Check className="w-3.5 h-3.5 text-white" />
          </div>
        ) : (
          <div className="w-6 h-6 rounded-full border-2 border-border flex items-center justify-center text-transparent hover:border-accent hover:text-accent transition-colors">
            <Check className="w-3.5 h-3.5" />
          </div>
        )}
      </button>

      <div className="flex-1 min-w-0 pr-[72px] sm:pr-16 xl:pr-8">
        {isEditing ? (
          <div className="space-y-4">
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
              className="bg-transparent border-b border-border focus:border-accent outline-none font-serif text-xl leading-snug w-full text-text-heading resize-none overflow-hidden min-h-[32px] pb-1 transition-colors"
            />

            <div className="flex flex-wrap items-center gap-3">
              <label className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${editDeadline ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-surface text-text-muted border-border hover:bg-surface-white'}`}>
                <Calendar className="w-3.5 h-3.5" />
                <input
                  type="date"
                  className="bg-transparent outline-none border-none text-[10px] uppercase tracking-widest font-bold cursor-pointer"
                  value={editDeadline}
                  onChange={e => setEditDeadline(e.target.value)}
                />
                {editDeadline && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      setEditDeadline('');
                    }}
                    className="ml-1 text-blue-600 opacity-60 hover:opacity-100 hover:text-red-600 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </label>

              {editTags.map(tag => (
                <span key={tag} className={`px-2.5 py-1.5 rounded-lg text-[10px] uppercase font-bold flex items-center gap-1.5 group border ${getTagColor(tag)} cursor-default`}>
                  {tag}
                  <X className="w-3 h-3 cursor-pointer opacity-50 hover:opacity-100" onClick={() => setEditTags(prev => prev.filter(t => t !== tag))} />
                </span>
              ))}

              <div className="flex flex-wrap items-center gap-1.5">
                {categories.filter(c => !editTags.includes(c)).map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => {
                      if (!editTags.includes(cat)) {
                        setEditTags([...editTags, cat]);
                      }
                    }}
                    className={`px-2 py-1.5 rounded-lg text-[10px] uppercase font-bold transition-all border ${getTagColor(cat)} opacity-50 hover:opacity-100 hover:scale-105 active:scale-95`}
                  >
                    + {cat}
                  </button>
                ))}

                <input
                  type="text"
                  className="bg-surface border border-border focus:border-accent rounded-lg px-2.5 py-1.5 text-[10px] uppercase tracking-widest font-bold outline-none text-text-heading placeholder:text-text-muted w-24 transition-colors"
                  placeholder={language === 'zh' ? '+ 自定义' : '+ Custom'}
                  value={tagInputValue}
                  onChange={e => setTagInputValue(e.target.value)}
                  onKeyDown={e => {
                    if ((e.key === 'Enter' || e.key === ' ' || e.key === ',') && tagInputValue.trim()) {
                      e.preventDefault();
                      const newTag = tagInputValue.trim().toLowerCase();
                      if (!editTags.includes(newTag)) {
                        setEditTags([...editTags, newTag]);
                      }
                      setTagInputValue('');
                    }
                  }}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-border/50">
              <button
                onClick={() => {
                  setEditContent(task.title + (task.description ? '\n' + task.description : ''));
                  setEditTags(task.tags || []);
                  setEditDeadline(task.deadline || '');
                  setIsEditing(false);
                }}
                className="px-4 py-1.5 text-text-muted hover:text-text-heading text-xs uppercase font-bold tracking-widest transition-colors"
              >
                {language === 'zh' ? '取消' : 'Cancel'}
              </button>
              <button
                onClick={submitEdit}
                className="px-6 py-1.5 bg-accent text-white rounded-lg text-xs uppercase font-bold tracking-widest hover:bg-accent/90 transition-colors shadow-sm"
              >
                {language === 'zh' ? '保存' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <h3
              onDoubleClick={() => !isDone && setIsEditing(true)}
              className={`font-serif text-xl leading-snug transition-colors cursor-text ${isDone ? 'text-text-muted line-through' : 'text-text-heading hover:text-accent'}`}
              title={language === 'zh' ? '双击编辑' : 'Double-click to edit'}
            >
              {task.title}
            </h3>
            {task.description && (
              <div
                onDoubleClick={() => !isDone && setIsEditing(true)}
                className={`mt-2 text-[13px] tracking-wide whitespace-pre-wrap leading-relaxed cursor-text ${isDone ? 'text-text-muted/60' : 'text-text-muted/90 max-w-[90%]'}`}
              >
                {task.description}
              </div>
            )}
          </div>
        )}

        {(task.project || task.deadline || task.priority || task.source_date !== currentFileDate || (task.tags && task.tags.length > 0)) && (
          <div className="flex flex-wrap gap-2 mt-4 mt-3">
            {task.source_date && task.source_date !== currentFileDate && (
              <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md bg-accent-highlight text-[#966b4d] text-[10px] font-sans font-bold tracking-widest uppercase border border-[#edcdb6]">
                <CornerUpRight className="w-3 h-3" />
                <span>{language === 'zh' ? `结转自 ${task.source_date}` : `from ${task.source_date}`}</span>
              </span>
            )}
            {task.tags && task.tags.filter((t: string) => t !== 'tasks').map((tag: string) => (
              <span key={tag} className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-md text-[10px] font-sans font-bold tracking-widest uppercase border ${getTagColor(tag)}`}>
                <span>#{tag}</span>
              </span>
            ))}
            {task.project && (
              <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-surface text-text-main text-[10px] font-sans font-bold tracking-widest uppercase border border-border">
                <Briefcase className="w-3 h-3 opacity-60" />
                <span>{task.project}</span>
              </span>
            )}
            {task.deadline && (
              <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-blue-50 text-blue-600 border border-blue-200 text-[10px] font-sans font-bold tracking-widest uppercase">
                <Calendar className="w-3 h-3" />
                <span>{task.deadline}</span>
              </span>
            )}
            {task.priority === 'high' && (
              <span className="inline-flex items-center justify-center space-x-1 px-2.5 py-1 rounded-md bg-accent text-white text-[10px] font-sans font-bold tracking-widest uppercase shadow-sm shadow-accent/20">
                <span>Priority</span>
              </span>
            )}
          </div>
        )}
      </div>

      <div className="absolute xl:top-6 sm:top-[22px] top-[14px] xl:right-6 sm:right-6 right-4 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex items-center xl:space-x-2 space-x-1">
        {!isDone && !isEditing && (
          <button onClick={() => setIsEditing(true)} className="p-2 sm:p-1.5 text-text-muted hover:text-accent transition-colors rounded-lg sm:bg-surface border border-border/50 sm:border-transparent bg-surface-white sm:bg-transparent shadow-sm sm:shadow-none">
            <Edit2 className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
          </button>
        )}
        {confirmingDelete ? (
          <button
            onClick={() => { onDelete(); setConfirmingDelete(false); }}
            onBlur={() => setConfirmingDelete(false)}
            autoFocus
            className="px-2.5 py-1.5 text-[10px] uppercase tracking-widest font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg animate-pulse whitespace-nowrap"
          >
            {language === 'zh' ? '确认删除?' : 'Confirm?'}
          </button>
        ) : (
          <button
            onClick={() => {
              setConfirmingDelete(true);
              setTimeout(() => setConfirmingDelete(false), 3000);
            }}
            className="p-2 sm:p-1.5 text-text-muted hover:text-red-500 transition-colors rounded-lg sm:bg-surface hover:bg-red-50 border border-border/50 sm:border-transparent bg-surface-white sm:bg-transparent shadow-sm sm:shadow-none"
          >
            <Trash2 className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
          </button>
        )}
      </div>
    </motion.div>
  );
};
