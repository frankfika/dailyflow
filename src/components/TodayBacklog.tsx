import { useMemo, useState } from 'react';
import { Check, ChevronDown, Network, Pin, Plus, Sparkles } from 'lucide-react';
import { TaskCard } from './TaskCard';
import type { RecurrenceRule } from '../api/client';

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
  sourcePath?: string[];
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
  tasks: TodayTask[];
  planningGroups?: TodayPlanningGroup[];
  onOpenPlanningGroup?: (group: TodayPlanningGroup, nodeId?: string) => void;
  /** Task IDs the user has starred; drives the star button on each card. */
  starredTaskIds?: Set<string>;
  /** Toggle the starred state of a task. When provided, each task shows a star button. */
  onToggleStar?: (taskId: string) => void;
  selectedDate: string;
  categories: string[];
  onToggleTask: (id: string, hostDate?: string) => void;
  onEditTask: (id: string, updates: Omit<Partial<TodayTask>, 'priority'> & { priority?: 'high' | 'medium' | 'low' | '' }, hostDate?: string) => void;
  /** Permanently delete a task from its host daily note. */
  onDeleteTask?: (id: string, hostDate?: string) => void;
  onUnlinkFromSpace?: (taskId: string, hostDate: string) => void;
  /** UX S6 AI actions on the expanded card (decompose / rewrite / summarize). */
  /** UX S7: convert the task into a new project event. */
  onAddTask: () => void;
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

interface RenderedEventGroup {
  group: TodayPlanningGroup;
  openTasks: TodayTask[];
}

export function TodayBacklog({
  tasks,
  planningGroups = [],
  onOpenPlanningGroup,
  starredTaskIds,
  onToggleStar,
  selectedDate,
  categories,
  onToggleTask,
  onEditTask,
  onDeleteTask,
  onUnlinkFromSpace,
  onAddTask,
  language,
  isToday,
  completionPromptTaskIds = new Set<string>(),
  onCompletionPromptClosed,
}: TodayBacklogProps) {
  const [showCompleted, setShowCompleted] = useState(false);
  // Horizontal tabs: null means "follow default" (first tab).
  const [selectedTabKey, setSelectedTabKey] = useState<string | null>(null);

  const openTasks = useMemo(
    () => tasks.filter(task => task.status === 'todo').sort(compareTasks),
    [tasks],
  );
  const completedTasks = useMemo(
    () => tasks.filter(task => task.status === 'done'),
    [tasks],
  );

  // Tasks belong to their source Event (mind map); anything unclaimed renders
  // under a plain "standalone" group. Groups without open work are omitted so
  // the list only shows events that still need attention today.
  const { eventGroups, standaloneTasks } = useMemo(() => {
    const taskById = new Map(openTasks.map(task => [task.id, task] as const));
    const claimed = new Set<string>();
    const eventGroups: RenderedEventGroup[] = [];
    for (const group of planningGroups) {
      const openTasksInGroup: TodayTask[] = [];
      for (const taskId of group.taskIds) {
        const task = taskById.get(taskId);
        if (!task || claimed.has(taskId)) continue;
        claimed.add(taskId);
        openTasksInGroup.push(task);
      }
      if (openTasksInGroup.length === 0) continue;
      eventGroups.push({ group, openTasks: openTasksInGroup });
    }
    const standaloneTasks = openTasks.filter(task => !claimed.has(task.id));
    return { eventGroups, standaloneTasks };
  }, [openTasks, planningGroups]);

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
        isStarred={starredTaskIds?.has(task.id)}
        onToggleStar={onToggleStar ? () => onToggleStar(task.id) : undefined}
        spaceTitle={eventByTaskId.get(task.id)?.title}
        onOpenSpace={onOpenPlanningGroup && eventByTaskId.has(task.id)
          ? (nodeId) => onOpenPlanningGroup(eventByTaskId.get(task.id)!, nodeId)
          : undefined}
        language={language}
        categories={categories}
        currentFileDate={selectedDate}
        onToggle={() => onToggleTask(task.id, task.host_date)}
        onEdit={updates => onEditTask(task.id, updates, task.host_date)}
        onDelete={onDeleteTask ? () => onDeleteTask(task.id, task.host_date) : undefined}
        onUnlinkFromSpace={onUnlinkFromSpace
          ? () => onUnlinkFromSpace(task.id, task.host_date || selectedDate)
          : undefined}
        showCompletionPrompt={completionPromptTaskIds.has(task.id)}
        onCompletionPromptClosed={() => onCompletionPromptClosed?.(task.id)}
      />
    </li>
  );

  const hasOpenWork = eventGroups.length > 0 || standaloneTasks.length > 0;
  const standaloneLabel = language === 'zh' ? '独立任务' : 'Standalone';

  interface EventTab {
    key: string;
    title: string;
    count: number;
    tasks: TodayTask[];
  }
  const tabs = useMemo<EventTab[]>(() => {
    const result: EventTab[] = eventGroups.map(({ group, openTasks: groupTasks }) => ({
      key: group.mindmapId,
      title: group.title,
      count: groupTasks.length,
      tasks: groupTasks,
    }));
    if (standaloneTasks.length > 0) {
      result.push({ key: 'standalone', title: standaloneLabel, count: standaloneTasks.length, tasks: standaloneTasks });
    }
    return result;
  }, [eventGroups, standaloneTasks, standaloneLabel]);

  // Selected tab falls back to the first one when the stored key no longer
  // exists (group disappeared / all its tasks completed).
  const activeKey = selectedTabKey && tabs.some(tab => tab.key === selectedTabKey)
    ? selectedTabKey
    : tabs[0]?.key;
  const activeTab = tabs.find(tab => tab.key === activeKey);

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

        {hasOpenWork ? (
          <div className="space-y-3" data-testid="today-execution-list">
            <div className="today-event-tabs" role="tablist" aria-label={language === 'zh' ? '事件分组' : 'Event groups'}>
              {tabs.map(tab => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={tab.key === activeKey}
                  data-testid={`today-event-group-${tab.key}`}
                  className={`today-event-tab ${tab.key === activeKey ? 'is-active' : ''}`}
                  onClick={() => setSelectedTabKey(tab.key)}
                >
                  {tab.key === 'standalone'
                    ? <Pin className="today-event-icon" aria-hidden="true" />
                    : <Network className="today-event-icon" aria-hidden="true" />}
                  <span className="today-event-title">{tab.title}</span>
                  <span className="today-event-count">{tab.count}</span>
                </button>
              ))}
            </div>
            {activeTab && <ul className="today-simple-list">{activeTab.tasks.map(renderTask)}</ul>}
          </div>
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
