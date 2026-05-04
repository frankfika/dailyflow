import { motion } from 'motion/react';
import { Check, Edit2, Trash2, ChevronRight } from 'lucide-react';
import { getTagColor } from '../utils/tagColors';
import type { Task } from '../types/task';

interface TaskItemProps {
  task: Task;
  onToggle: (id: string, date: string, status: 'todo' | 'done') => void;
  onDelete: (id: string, date: string) => void;
  onEdit: (task: Task) => void;
  currentDate: string;
  isSelected?: boolean;
  onClick?: () => void;
}

export function TaskItem({ task, onToggle, onDelete, onEdit, currentDate, isSelected, onClick }: TaskItemProps) {
  const isDone = task.status === 'done';
  const isMigrated = task.status === 'migrated';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className={`group flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
        isSelected
          ? 'bg-accent/10 border-accent'
          : isDone
            ? 'bg-emerald-50/50 border-emerald-200/50'
            : 'bg-background border-border hover:border-accent/50'
      } ${isMigrated ? 'opacity-50' : ''}`}
      onClick={onClick}
    >
      {/* Checkbox */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (!isMigrated) {
            onToggle(task.id, currentDate, isDone ? 'todo' : 'done');
          }
        }}
        className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all flex-shrink-0 ${
          isDone
            ? 'bg-emerald-500 border-emerald-500'
            : isMigrated
              ? 'bg-gray-300 border-gray-300 cursor-not-allowed'
              : 'border-border hover:border-accent'
        }`}
        disabled={isMigrated}
      >
        {isDone && <Check className="w-3 h-3 text-white" />}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <span className={`font-medium ${isDone ? 'line-through text-muted-foreground' : ''}`}>
            {task.title}
          </span>
          {task.priority && (
            <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${
              task.priority === 'high'
                ? 'bg-rose-100 text-rose-700'
                : task.priority === 'medium'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-blue-100 text-blue-700'
            }`}>
              {task.priority}
            </span>
          )}
        </div>

        {task.description && (
          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
            {task.description}
          </p>
        )}

        {/* Tags */}
        {task.tags && task.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {task.tags.map(tag => (
              <span
                key={tag}
                className={`text-xs px-2 py-0.5 rounded-full border ${getTagColor(tag)}`}
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {!isMigrated && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit(task);
              }}
              className="p-1.5 rounded-lg hover:bg-accent/10 text-muted-foreground hover:text-accent transition-colors"
              title="Edit"
            >
              <Edit2 className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(task.id, currentDate);
              }}
              className="p-1.5 rounded-lg hover:bg-rose-500/10 text-muted-foreground hover:text-rose-500 transition-colors"
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </>
        )}
        {isMigrated && (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
      </div>
    </motion.div>
  );
}
