import { useMemo, useState } from 'react';
import { Check, ChevronDown, Network, Pin, Plus, Sparkles } from 'lucide-react';
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
  sourcePath?: string[];
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
  onOpenPlanningGroup?: (group: TodayPlanningGroup, nodeId?: string) => void;
  selectedDate: string;
  categories: string[];
  onToggleTask: (id: string, hostDate?: string) => void;
  onEditTask: (id: string, updates: Partial<TodayTask>, hostDate?: string) => void;
  onDeleteTask: (id: string, hostDate?: string) => void;
  onCreateLinkedNote: (taskId: string) => void;
  onShowLinkedNotes: (taskId: string) => void;
  onUnlinkFromSpace?: (taskId: string, hostDate: string) => void;
  /** UX S6 AI actions on the expanded card (decompose / rewrite / summarize). */
  onAiAction?: (task: TodayTask, action: 'decompose' | 'rewrite' | 'summarize') => Promise<void>;
  /** UX S7: convert the task into a new project event. */
  onConvertToProject?: (task: TodayTask, opts: { title: string; extraNodes: string[] }) => Promise<void>;
  linkedNotesCount: (taskId: string) => number;
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
  selectedDate,
  categories,
  onToggleTask,
  onEditTask,
  onDeleteTask,
  onCreateLinkedNote,
  onShowLinkedNotes,
  onUnlinkFromSpace,
  onAiAction,
  onConvertToProject,
  linkedNotesCount,
  onAddTask,
  language,
  isToday,
  completionPromptTaskIds = new Set<string>(),
  onCompletionPromptClosed,
}: TodayBacklogProps) {
  const [showCompleted, setShowCompleted] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

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
        spaceTitle={eventByTaskId.get(task.id)?.title}
        onOpenSpace={onOpenPlanningGroup && eventByTaskId.has(task.id)
          ? (nodeId) => onOpenPlanningGroup(eventByTaskId.get(task.id)!, nodeId)
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
        onUnlinkFromSpace={onUnlinkFromSpace
          ? () => onUnlinkFromSpace(task.id, task.host_date || selectedDate)
          : undefined}
        onAiAction={onAiAction}
        onConvertToProject={onConvertToProject}
        showCompletionPrompt={completionPromptTaskIds.has(task.id)}
        onCompletionPromptClosed={() => onCompletionPromptClosed?.(task.id)}
      />
    </li>
  );

  const hasOpenWork = eventGroups.length > 0 || standaloneTasks.length > 0;
  const standaloneLabel = language === 'zh' ? '独立任务' : 'Standalone';
  const openCountLabel = (count: number) => language === 'zh' ? `${count} 项待办` : `${count} open`;
  const enterCanvasTitle = language === 'zh' ? '进入事件画布' : 'Open event canvas';

  const renderGroupBody = (key: string, groupTasks: TodayTask[]) => {
    if (collapsedGroups.has(key)) return null;
    return <ul className="today-simple-list">{groupTasks.map(renderTask)}</ul>;
  };

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
          <div className="space-y-4" data-testid="today-execution-list">
            {eventGroups.map(({ group, openTasks: groupTasks }) => {
              const key = group.mindmapId;
              const isCollapsed = collapsedGroups.has(key);
              return (
                <section key={key} className="today-event-group" data-testid={`today-event-group-${key}`}>
                  <div className="today-event-head">
                    {onOpenPlanningGroup ? (
                      <button
                        type="button"
                        className="today-event-head-main"
                        onClick={() => onOpenPlanningGroup(group)}
                        title={enterCanvasTitle}
                        data-testid={`today-event-head-${key}`}
                      >
                        <Network className="today-event-icon" aria-hidden="true" />
                        <span className="today-event-title">{group.title}</span>
                        <span className="today-event-count">{openCountLabel(groupTasks.length)}</span>
                      </button>
                    ) : (
                      <div className="today-event-head-main" data-testid={`today-event-head-${key}`}>
                        <Network className="today-event-icon" aria-hidden="true" />
                        <span className="today-event-title">{group.title}</span>
                        <span className="today-event-count">{openCountLabel(groupTasks.length)}</span>
                      </div>
                    )}
                    <button
                      type="button"
                      className="today-event-collapse"
                      onClick={() => toggleGroup(key)}
                      aria-expanded={!isCollapsed}
                      aria-label={`${isCollapsed
                        ? (language === 'zh' ? '展开' : 'Expand')
                        : (language === 'zh' ? '折叠' : 'Collapse')} ${group.title}`}
                    >
                      <ChevronDown className={`today-event-arrow ${isCollapsed ? 'is-collapsed' : ''}`} aria-hidden="true" />
                    </button>
                  </div>
                  {renderGroupBody(key, groupTasks)}
                </section>
              );
            })}

            {standaloneTasks.length > 0 && (
              <section className="today-event-group today-event-group-standalone" data-testid="today-event-group-standalone">
                <div className="today-standalone-head">
                  <span className="today-standalone-label">
                    <Pin className="today-event-icon" aria-hidden="true" />
                    {standaloneLabel}
                  </span>
                  <span className="today-event-count">{openCountLabel(standaloneTasks.length)}</span>
                  <button
                    type="button"
                    className="today-event-collapse"
                    onClick={() => toggleGroup('standalone')}
                    aria-expanded={!collapsedGroups.has('standalone')}
                    aria-label={`${collapsedGroups.has('standalone')
                      ? (language === 'zh' ? '展开' : 'Expand')
                      : (language === 'zh' ? '折叠' : 'Collapse')} ${standaloneLabel}`}
                  >
                    <ChevronDown className={`today-event-arrow ${collapsedGroups.has('standalone') ? 'is-collapsed' : ''}`} aria-hidden="true" />
                  </button>
                </div>
                {renderGroupBody('standalone', standaloneTasks)}
              </section>
            )}
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
