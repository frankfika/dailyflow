import { useMemo, useState } from 'react';
import { Check, ChevronDown, Plus, Sparkles } from 'lucide-react';
import { TaskCard } from './TaskCard';

export type TodayTask = {
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

export const STANDALONE_MINDMAP_FILTER = '__standalone__';

export function filterTodayTasks(
  tasks: TodayTask[],
  selectedTag: string | null,
  selectedMindmapId: string | null,
  planningGroups: TodayPlanningGroup[],
): TodayTask[] {
  const groupByTaskId = new Map<string, TodayPlanningGroup>();
  for (const group of planningGroups) {
    for (const taskId of group.taskIds) groupByTaskId.set(taskId, group);
  }
  return tasks.filter((task) => {
    if (selectedTag && !(task.tags ?? []).includes(selectedTag)) return false;
    if (!selectedMindmapId) return true;
    const group = groupByTaskId.get(task.id);
    if (selectedMindmapId === STANDALONE_MINDMAP_FILTER) return !group;
    return group?.mindmapId === selectedMindmapId;
  });
}

export interface TodayPlanningGroup {
  id: string;
  mindmapId: string;
  spaceId?: string;
  title: string;
  taskIds: string[];
  completedTaskIds: string[];
}

interface TodayBacklogProps {
  tasks: TodayTask[];
  planningGroups?: TodayPlanningGroup[];
  onOpenPlanningGroup?: (group: TodayPlanningGroup) => void;
  selectedDate: string;
  categories: string[];
  focusTaskIds: string[];
  onFocusTaskIdsChange: (ids: string[]) => void;
  onToggleTask: (id: string, hostDate?: string) => void;
  onEditTask: (id: string, updates: Partial<TodayTask>, hostDate?: string) => void;
  onDeleteTask: (id: string, hostDate?: string) => void;
  onCreateLinkedNote: (taskId: string) => void;
  onShowLinkedNotes: (taskId: string) => void;
  linkedNotesCount: (taskId: string) => number;
  onAddTask: () => void;
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;
  language: 'en' | 'zh';
  isToday: boolean;
  completionPromptTaskIds?: Set<string>;
  onCompletionPromptClosed?: (taskId: string) => void;
}

const PRIORITY_RANK: Record<'high' | 'medium' | 'low', number> = { high: 0, medium: 1, low: 2 };

function compareTasks(a: TodayTask, b: TodayTask): number {
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
  onOpenPlanningGroup,
  selectedDate,
  categories,
  onToggleTask,
  onEditTask,
  onDeleteTask,
  onCreateLinkedNote,
  onShowLinkedNotes,
  linkedNotesCount,
  onAddTask,
  hasActiveFilters = false,
  onClearFilters,
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
  const openTaskGroups = useMemo(() => {
    const groups: Array<{ key: 'overdue' | 'today' | 'upcoming' | 'unscheduled'; label: string; tasks: TodayTask[] }> = [
      { key: 'overdue', label: language === 'zh' ? '已逾期' : 'Overdue', tasks: [] },
      { key: 'today', label: language === 'zh' ? '今天截止' : 'Due today', tasks: [] },
      { key: 'upcoming', label: language === 'zh' ? '接下来' : 'Upcoming', tasks: [] },
      { key: 'unscheduled', label: language === 'zh' ? '无截止日期' : 'No due date', tasks: [] },
    ];
    for (const task of openTasks) {
      const key = !task.deadline
        ? 'unscheduled'
        : task.deadline < selectedDate
          ? 'overdue'
          : task.deadline === selectedDate ? 'today' : 'upcoming';
      groups.find((group) => group.key === key)!.tasks.push(task);
    }
    return groups.filter((group) => group.tasks.length > 0);
  }, [language, openTasks, selectedDate]);
  const eventByTaskId = useMemo(() => {
    const lookup = new Map<string, TodayPlanningGroup>();
    for (const group of planningGroups) {
      for (const taskId of group.taskIds) lookup.set(taskId, group);
    }
    return lookup;
  }, [planningGroups]);

  const renderTask = (task: TodayTask) => (
    <li key={`${task.host_date ?? selectedDate}:${task.id}`} className="today-simple-task">
      <TaskCard
        task={task}
        spaceTitle={eventByTaskId.get(task.id)?.title}
        onOpenSpace={onOpenPlanningGroup && eventByTaskId.has(task.id)
          ? () => onOpenPlanningGroup(eventByTaskId.get(task.id)!)
          : undefined}
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
          <div className="space-y-4" data-testid="today-execution-list">
            {openTaskGroups.map((group) => (
              <section key={group.key} aria-labelledby={`today-task-group-${group.key}`}>
                <div className="mb-1.5 flex items-center gap-2 px-1 text-[11px] font-semibold text-text-muted">
                  <h3 id={`today-task-group-${group.key}`}>{group.label}</h3>
                  <span className="tabular-nums opacity-60">{group.tasks.length}</span>
                </div>
                <ul className="today-simple-list">{group.tasks.map(renderTask)}</ul>
              </section>
            ))}
          </div>
        ) : (
          <div className="today-backlog-empty">
            <Sparkles className="h-4 w-4" />
            <p>{hasActiveFilters
              ? (language === 'zh' ? '没有符合当前筛选条件的任务。' : 'No tasks match the current filters.')
              : isToday
              ? (language === 'zh' ? '今天还没有任务。记下一件事就可以开始。' : 'Nothing here yet. Add one thing to get started.')
              : (language === 'zh' ? '这一天没有任务。' : 'No open tasks on this day.')}</p>
            {hasActiveFilters && onClearFilters ? (
              <button type="button" onClick={onClearFilters} className="today-backlog-empty-cta">
                {language === 'zh' ? '清除筛选' : 'Clear filters'}
              </button>
            ) : isToday && (
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
