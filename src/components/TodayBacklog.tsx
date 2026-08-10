import { useMemo, useState } from 'react';
import { Check, ChevronDown, Plus, Sparkles } from 'lucide-react';
import { TaskCard } from './TaskCard';

type Task = {
  id: string;
  title: string;
  description?: string;
  comment?: string;
  comments?: { text: string; timestamp: string }[];
  status: 'todo' | 'done' | 'migrated';
  tags?: string[];
  project?: string;
  deadline?: string;
  time?: string;
  priority?: 'high' | 'medium' | 'low';
  source_date?: string;
  host_date?: string;
  spaceId?: string;
  originMindmapId?: string;
  originNodeId?: string;
  planOrder?: number;
};

export interface TodayPlanningGroup {
  id: string;
  mindmapId: string;
  spaceId?: string;
  title: string;
  taskIds: string[];
  completedTaskIds: string[];
}

interface TodayBacklogProps {
  tasks: Task[];
  planningGroups?: TodayPlanningGroup[];
  onOpenPlanningGroup?: (group: TodayPlanningGroup) => void;
  selectedDate: string;
  categories: string[];
  focusTaskIds: string[];
  onFocusTaskIdsChange: (ids: string[]) => void;
  onToggleTask: (id: string, hostDate?: string) => void;
  onEditTask: (id: string, updates: Partial<Task>, hostDate?: string) => void;
  onDeleteTask: (id: string, hostDate?: string) => void;
  onCreateLinkedNote: (taskId: string) => void;
  onShowLinkedNotes: (taskId: string) => void;
  linkedNotesCount: (taskId: string) => number;
  onAddTask: () => void;
  language: 'en' | 'zh';
  isToday: boolean;
  completionPromptTaskIds?: Set<string>;
  onCompletionPromptClosed?: (taskId: string) => void;
}

const PRIORITY_RANK: Record<'high' | 'medium' | 'low', number> = { high: 0, medium: 1, low: 2 };

function compareTasks(a: Task, b: Task): number {
  const aDeadline = a.deadline || '9999-12-31';
  const bDeadline = b.deadline || '9999-12-31';
  if (aDeadline !== bDeadline) return aDeadline.localeCompare(bDeadline);
  const aPriority = a.priority ? PRIORITY_RANK[a.priority] : 3;
  const bPriority = b.priority ? PRIORITY_RANK[b.priority] : 3;
  if (aPriority !== bPriority) return aPriority - bPriority;
  return (a.planOrder ?? Number.MAX_SAFE_INTEGER) - (b.planOrder ?? Number.MAX_SAFE_INTEGER);
}

export function TodayBacklog({
  tasks,
  planningGroups = [],
  selectedDate,
  categories,
  onToggleTask,
  onEditTask,
  onDeleteTask,
  onCreateLinkedNote,
  onShowLinkedNotes,
  linkedNotesCount,
  onAddTask,
  language,
  isToday,
  completionPromptTaskIds = new Set<string>(),
  onCompletionPromptClosed,
}: TodayBacklogProps) {
  const [showCompleted, setShowCompleted] = useState(false);

  const openTasks = useMemo(
    () => tasks.filter(task => task.status === 'todo').sort(compareTasks),
    [tasks],
  );
  const completedTasks = useMemo(
    () => tasks.filter(task => task.status === 'done'),
    [tasks],
  );
  const eventByTaskId = useMemo(() => {
    const lookup = new Map<string, TodayPlanningGroup>();
    for (const group of planningGroups) {
      for (const taskId of group.taskIds) lookup.set(taskId, group);
    }
    return lookup;
  }, [planningGroups]);

  const renderTask = (task: Task) => (
    <li key={`${task.host_date ?? selectedDate}:${task.id}`} className="today-simple-task">
      <TaskCard
        task={task}
        spaceTitle={eventByTaskId.get(task.id)?.title}
        language={language}
        categories={categories}
        currentFileDate={selectedDate}
        linkedNotesCount={linkedNotesCount(task.id)}
        onToggle={() => onToggleTask(task.id, task.host_date)}
        onEdit={updates => onEditTask(task.id, updates, task.host_date)}
        onDelete={() => onDeleteTask(task.id, task.host_date)}
        onCreateLinkedNote={() => onCreateLinkedNote(task.id)}
        onShowLinkedNotes={() => onShowLinkedNotes(task.id)}
        showCompletionPrompt={completionPromptTaskIds.has(task.id)}
        onCompletionPromptClosed={() => onCompletionPromptClosed?.(task.id)}
      />
    </li>
  );

  return (
    <div className="today-backlog today-simple" data-testid="today-backlog">
      <section className="today-simple-open" aria-labelledby="today-task-list-title">
        <header className="today-simple-section-header">
          <div>
            <p className="today-simple-eyebrow">
              {language === 'zh' ? '今天要完成的事' : 'What needs doing today'}
            </p>
            <h2 id="today-task-list-title">{language === 'zh' ? '任务' : 'Tasks'}</h2>
          </div>
          <div className="today-simple-header-actions">
            <span aria-label={language === 'zh' ? `${openTasks.length} 个待办` : `${openTasks.length} open tasks`}>
              {openTasks.length}
            </span>
            {isToday && (
              <button type="button" onClick={onAddTask} className="today-simple-add">
                <Plus className="h-3.5 w-3.5" />
                {language === 'zh' ? '添加任务' : 'Add task'}
              </button>
            )}
          </div>
        </header>

        {openTasks.length > 0 ? (
          <ul className="today-simple-list" data-testid="today-execution-list">
            {openTasks.map(renderTask)}
          </ul>
        ) : (
          <div className="today-backlog-empty">
            <Sparkles className="h-4 w-4" />
            <p>{isToday
              ? (language === 'zh' ? '今天还没有任务。记下一件事就可以开始。' : 'Nothing here yet. Add one thing to get started.')
              : (language === 'zh' ? '这一天没有任务。' : 'No open tasks on this day.')}</p>
            {isToday && (
              <button onClick={onAddTask} className="today-backlog-empty-cta">
                {language === 'zh' ? '添加任务' : 'Add one thing'}
              </button>
            )}
          </div>
        )}
      </section>

      {completedTasks.length > 0 && (
        <section className="today-simple-completed" data-testid="today-group-completed">
          <button
            type="button"
            onClick={() => setShowCompleted(value => !value)}
            aria-expanded={showCompleted}
            aria-label={`${language === 'zh' ? '已完成' : 'Completed'} ${completedTasks.length}`}
          >
            <Check className="h-3.5 w-3.5" />
            <span>{language === 'zh' ? '已完成' : 'Completed'}</span>
            <span>{completedTasks.length}</span>
            <ChevronDown className={`ml-auto h-3.5 w-3.5 transition-transform ${showCompleted ? 'rotate-180' : ''}`} />
          </button>
          {showCompleted && <ul className="today-simple-list">{completedTasks.map(renderTask)}</ul>}
        </section>
      )}
    </div>
  );
}
