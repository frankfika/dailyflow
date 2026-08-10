import { useMemo, useState } from 'react';
import { Check, ChevronDown, Clock3, Network, Plus, Sparkles, Target, X } from 'lucide-react';
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
  onToggleTask: (id: string) => void;
  onEditTask: (id: string, updates: Partial<Task>) => void;
  onDeleteTask: (id: string) => void;
  onCreateLinkedNote: (taskId: string) => void;
  onShowLinkedNotes: (taskId: string) => void;
  linkedNotesCount: (taskId: string) => number;
  onAddTask: () => void;
  language: 'en' | 'zh';
  isToday: boolean;
  completionPromptTaskIds?: Set<string>;
  onCompletionPromptClosed?: (taskId: string) => void;
}

const FOCUS_LIMIT = 3;
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
  onOpenPlanningGroup,
  selectedDate,
  categories,
  focusTaskIds,
  onFocusTaskIdsChange,
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
  const focusTasks = useMemo(
    () => focusTaskIds
      .map(id => tasks.find(task => task.id === id && task.status !== 'migrated'))
      .filter((task): task is Task => Boolean(task)),
    [focusTaskIds, tasks],
  );
  const planningGroupByTaskId = useMemo(() => {
    const lookup = new Map<string, TodayPlanningGroup>();
    for (const group of planningGroups) {
      for (const taskId of group.taskIds) lookup.set(taskId, group);
    }
    return lookup;
  }, [planningGroups]);

  const addToFocus = (id: string) => {
    if (focusTaskIds.includes(id) || focusTaskIds.length >= FOCUS_LIMIT) return;
    onFocusTaskIdsChange([...focusTaskIds, id]);
  };
  const removeFromFocus = (id: string) => {
    onFocusTaskIdsChange(focusTaskIds.filter(taskId => taskId !== id));
  };

  const renderTask = (task: Task) => {
    const inFocus = focusTaskIds.includes(task.id);
    return (
      <li
        key={task.id}
        className="today-simple-task"
      >
        <TaskCard
          task={task}
          spaceTitle={planningGroupByTaskId.get(task.id)?.title}
          language={language}
          categories={categories}
          currentFileDate={selectedDate}
          linkedNotesCount={linkedNotesCount(task.id)}
          onToggle={() => onToggleTask(task.id)}
          onEdit={updates => onEditTask(task.id, updates)}
          onDelete={() => onDeleteTask(task.id)}
          onCreateLinkedNote={() => onCreateLinkedNote(task.id)}
          onShowLinkedNotes={() => onShowLinkedNotes(task.id)}
          showCompletionPrompt={completionPromptTaskIds.has(task.id)}
          onCompletionPromptClosed={() => onCompletionPromptClosed?.(task.id)}
        />
        {isToday && task.status === 'todo' && (
          <button
            type="button"
            className={`today-simple-focus ${inFocus ? 'is-active' : ''}`}
            onClick={() => inFocus ? removeFromFocus(task.id) : addToFocus(task.id)}
            disabled={!inFocus && focusTaskIds.length >= FOCUS_LIMIT}
            aria-label={inFocus
              ? (language === 'zh' ? '移出今日重点' : 'Remove from focus')
              : (language === 'zh' ? '设为今日重点' : 'Make a focus task')}
            title={inFocus
              ? (language === 'zh' ? '今日重点' : 'In focus')
              : (language === 'zh' ? '设为今日重点' : 'Make a focus task')}
            data-testid={inFocus ? `in-focus-${task.id}` : `add-to-focus-${task.id}`}
          >
            {inFocus ? <Check className="h-3.5 w-3.5" /> : <Target className="h-3.5 w-3.5" />}
          </button>
        )}
      </li>
    );
  };

  return (
    <div className="today-backlog today-simple" data-testid="today-backlog">
      {focusTasks.length > 0 && (
        <section
          className="today-simple-focus-panel"
          data-testid="today-focus-bar"
        >
          <header className="today-simple-section-header">
            <div>
              <p className="today-simple-eyebrow">{language === 'zh' ? '今天先做这些' : 'Do these first'}</p>
              <h2>{language === 'zh' ? '今日重点' : "Today's focus"}</h2>
            </div>
            <span>{focusTasks.length}/{FOCUS_LIMIT}</span>
          </header>
          <ul className="today-simple-focus-list">
            {focusTasks.map((task, index) => (
              <li key={task.id} className={task.status === 'done' ? 'is-done' : ''}>
                <button
                  className="today-simple-focus-check"
                  onClick={() => onToggleTask(task.id)}
                  aria-label={task.status === 'done' ? 'Mark incomplete' : 'Mark complete'}
                >
                  {task.status === 'done' ? <Check className="h-3.5 w-3.5" /> : index + 1}
                </button>
                <span>{task.title}</span>
                {isToday && (
                  <button className="today-simple-focus-remove" onClick={() => removeFromFocus(task.id)}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="today-simple-open">
        <header className="today-simple-section-header">
          <div>
            <p className="today-simple-eyebrow">{language === 'zh' ? '按截止时间排列' : 'Sorted by due date'}</p>
            <h2>{language === 'zh' ? '待办事项' : 'Open tasks'}</h2>
          </div>
          <div className="today-simple-header-actions">
            <span>{openTasks.length}</span>
            {isToday && (
              <button type="button" onClick={onAddTask} className="today-simple-add">
                <Plus className="h-3.5 w-3.5" />
                {language === 'zh' ? '记一件事' : 'Add task'}
              </button>
            )}
          </div>
        </header>

        {openTasks.length > 0 ? (
          <ul className="today-simple-list">{openTasks.map(renderTask)}</ul>
        ) : (
          <div className="today-backlog-empty">
            <Sparkles className="h-4 w-4" />
            <p>{isToday
              ? (language === 'zh' ? '今天还没有待办。记下一件事就可以开始。' : 'Nothing here yet. Add one thing to get started.')
              : (language === 'zh' ? '这一天没有待办。' : 'No open tasks on this day.')}</p>
            {isToday && <button onClick={onAddTask} className="today-backlog-empty-cta">{language === 'zh' ? '记一件事' : 'Add one thing'}</button>}
          </div>
        )}
      </section>

      {planningGroups.length > 0 && (
        <details className="today-simple-disclosure" data-testid="today-planning">
          <summary>
            <span className="today-simple-disclosure-icon"><Network className="h-3.5 w-3.5" /></span>
            <span>{language === 'zh' ? '关联的计划' : 'Linked plans'}</span>
            <span className="today-simple-disclosure-count">{planningGroups.length}</span>
            <ChevronDown className="today-simple-disclosure-chevron h-3.5 w-3.5" />
          </summary>
          <div className="today-simple-plans">
            <p className="sr-only">{language === 'zh' ? '思维导图关联的任务' : 'Tasks linked from mind maps'}</p>
            {planningGroups.map(group => (
              <article key={group.id} className="today-simple-plan">
                <header>
                  <strong>{group.title}</strong>
                  <span>{group.completedTaskIds.length}/{group.taskIds.length}</span>
                  <button type="button" onClick={() => onOpenPlanningGroup?.(group)}>
                    {language === 'zh' ? '打开计划' : 'Open plan'}
                  </button>
                </header>
                <ul>
                  {group.taskIds
                    .map(taskId => tasks.find(task => task.id === taskId))
                    .filter((task): task is Task => Boolean(task))
                    .map(task => (
                      <li key={task.id} data-testid={`today-planning-task-${task.id}`}>
                        <button
                          type="button"
                          onClick={() => onToggleTask(task.id)}
                          aria-label={task.status === 'done' ? (language === 'zh' ? '恢复任务' : 'Reopen task') : (language === 'zh' ? '完成任务' : 'Complete task')}
                        >
                          {task.status === 'done' ? <Check className="h-3 w-3" /> : null}
                        </button>
                        <span>{task.title}</span>
                        <small><Clock3 className="h-3 w-3" />{task.deadline ?? task.source_date ?? selectedDate}</small>
                      </li>
                    ))}
                </ul>
              </article>
            ))}
          </div>
        </details>
      )}

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
