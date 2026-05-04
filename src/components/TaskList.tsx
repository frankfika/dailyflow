import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Calendar, ChevronDown, Sparkles, Loader2 } from 'lucide-react';
import { TaskItem } from './TaskItem';
import type { Task } from '../types/task';

interface TaskListProps {
  tasks: Task[];
  currentDate: string;
  onToggle: (id: string, date: string, status: 'todo' | 'done') => void;
  onDelete: (id: string, date: string) => void;
  onEdit: (task: Task) => void;
  onAddTask: (title: string, tags: string[], deadline: string) => void;
  onGenerateFromBrainDump: () => void;
  newTaskTitle: string;
  setNewTaskTitle: (value: string) => void;
  newTaskTagsList: string[];
  setNewTaskTagsList: (value: string[]) => void;
  tagInputValue: string;
  setTagInputValue: (value: string) => void;
  newTaskDeadline: string;
  setNewTaskDeadline: (value: string) => void;
  isProcessingBrainDump: boolean;
  selectedCategory: string | null;
  onSelectCategory: (category: string | null) => void;
  onGenerateSummary: () => void;
  isGeneratingSummary: boolean;
}

export function TaskList({
  tasks,
  currentDate,
  onToggle,
  onDelete,
  onEdit,
  onAddTask,
  onGenerateFromBrainDump,
  newTaskTitle,
  setNewTaskTitle,
  newTaskTagsList,
  setNewTaskTagsList,
  tagInputValue,
  setTagInputValue,
  newTaskDeadline,
  setNewTaskDeadline,
  isProcessingBrainDump,
  selectedCategory,
  onSelectCategory,
  onGenerateSummary,
  isGeneratingSummary,
}: TaskListProps) {
  const [showFilters, setShowFilters] = useState(false);

  const todoTasks = tasks.filter(t => t.status === 'todo' && !t.source_date);
  const doneTasks = tasks.filter(t => t.status === 'done');
  const migratedTasks = tasks.filter(t => t.status === 'migrated');

  const categories = Array.from(new Set(
    tasks.flatMap(t => t.tags || [])
  ));

  const filteredTodoTasks = selectedCategory
    ? todoTasks.filter(t => t.tags?.includes(selectedCategory))
    : todoTasks;

  const handleAddTag = () => {
    if (tagInputValue.trim() && !newTaskTagsList.includes(tagInputValue.trim())) {
      setNewTaskTagsList([...newTaskTagsList, tagInputValue.trim()]);
      setTagInputValue('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleSubmitTask = () => {
    if (newTaskTitle.trim()) {
      onAddTask(newTaskTitle, newTaskTagsList, newTaskDeadline);
      setNewTaskTitle('');
      setNewTaskTagsList([]);
      setNewTaskDeadline('');
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Calendar className="w-5 h-5 text-accent" />
          {currentDate}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-2 rounded-lg transition-colors ${
              showFilters ? 'bg-accent/10 text-accent' : 'hover:bg-accent/5 text-muted-foreground'
            }`}
          >
            <Sparkles className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filters */}
      <AnimatePresence>
        {showFilters && categories.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mb-4 overflow-hidden"
          >
            <div className="flex flex-wrap gap-2 p-3 bg-accent/5 rounded-xl">
              <button
                onClick={() => onSelectCategory(null)}
                className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                  !selectedCategory
                    ? 'bg-accent text-white'
                    : 'bg-background hover:bg-accent/10'
                }`}
              >
                All
              </button>
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => onSelectCategory(cat)}
                  className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                    selectedCategory === cat
                      ? 'bg-accent text-white'
                      : 'bg-background hover:bg-accent/10'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Task Form */}
      <div className="mb-4 p-4 bg-background rounded-xl border border-border">
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmitTask();
            }}
            placeholder="Add a new task..."
            className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-muted-foreground"
          />
          <input
            type="date"
            value={newTaskDeadline}
            onChange={(e) => setNewTaskDeadline(e.target.value)}
            className="bg-transparent border border-border rounded-lg px-2 py-1 text-sm"
          />
        </div>

        {/* Tags input */}
        <div className="flex flex-wrap gap-2 mb-2">
          {newTaskTagsList.map(tag => (
            <span
              key={tag}
              className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent flex items-center gap-1"
            >
              {tag}
              <button onClick={() => setNewTaskTagsList(newTaskTagsList.filter(t => t !== tag))}>
                ×
              </button>
            </span>
          ))}
          <input
            type="text"
            value={tagInputValue}
            onChange={(e) => setTagInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleAddTag}
            placeholder="Add tag..."
            className="text-xs bg-transparent outline-none w-20"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleSubmitTask}
            className="flex-1 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Task
          </button>
          <button
            onClick={onGenerateFromBrainDump}
            disabled={isProcessingBrainDump}
            className="px-4 py-2 rounded-lg bg-purple-500 text-white text-sm font-medium hover:bg-purple-600 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isProcessingBrainDump ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                AI
              </>
            )}
          </button>
        </div>
      </div>

      {/* Task Lists */}
      <div className="flex-1 overflow-y-auto space-y-6">
        {/* Pending Tasks */}
        {filteredTodoTasks.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
              To Do ({filteredTodoTasks.length})
            </h3>
            <motion.div className="space-y-2">
              <AnimatePresence>
                {filteredTodoTasks.map(task => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    onToggle={onToggle}
                    onDelete={onDelete}
                    onEdit={onEdit}
                    currentDate={currentDate}
                  />
                ))}
              </AnimatePresence>
            </motion.div>
          </div>
        )}

        {/* Done Tasks */}
        {doneTasks.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
              Done ({doneTasks.length})
            </h3>
            <motion.div className="space-y-2">
              <AnimatePresence>
                {doneTasks.map(task => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    onToggle={onToggle}
                    onDelete={onDelete}
                    onEdit={onEdit}
                    currentDate={currentDate}
                  />
                ))}
              </AnimatePresence>
            </motion.div>
          </div>
        )}

        {/* Migrated Tasks */}
        {migratedTasks.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">
              Migrated ({migratedTasks.length})
            </h3>
            <motion.div className="space-y-2">
              <AnimatePresence>
                {migratedTasks.map(task => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    onToggle={onToggle}
                    onDelete={onDelete}
                    onEdit={onEdit}
                    currentDate={currentDate}
                  />
                ))}
              </AnimatePresence>
            </motion.div>
          </div>
        )}

        {/* Empty State */}
        {tasks.length === 0 && (
          <div className="text-center py-12">
            <Calendar className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-muted-foreground">No tasks for this date</p>
            <p className="text-sm text-muted-foreground/70">Add a task or use AI to generate</p>
          </div>
        )}
      </div>

      {/* Summary Button */}
      <button
        onClick={onGenerateSummary}
        disabled={isGeneratingSummary}
        className="mt-4 w-full py-3 rounded-xl bg-gradient-to-r from-accent/20 to-purple-500/20 border border-accent/30 text-sm font-medium hover:border-accent transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {isGeneratingSummary ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Generating summary...
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" />
            Generate AI Summary
          </>
        )}
      </button>
    </div>
  );
}
