import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Check, ChevronDown, ChevronRight, Network, Pin, Plus, Sparkles, X } from 'lucide-react';
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
  /** Add a new task directly to an event's canvas, bound to a fresh node
   *  (`useCreateTaskForNode` on the server). When provided, each event
   *  section shows its own inline "+ Add to {event}" input. */
  onAddToEvent?: (group: TodayPlanningGroup, title: string) => void | Promise<void>;
  /** Add a standalone task — used by the empty state CTA and the section
   *  header fallback when onAddToEvent isn't wired. */
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
  onAddToEvent,
  onAddTask,
  language,
  isToday,
  completionPromptTaskIds = new Set<string>(),
  onCompletionPromptClosed,
}: TodayBacklogProps) {
  const [showCompleted, setShowCompleted] = useState(false);
  // Per-section collapse state, keyed by group id. Defaults to all expanded.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // Which event section has its inline "+ Add" input open. Mutually exclusive.
  const [activeAddSection, setActiveAddSection] = useState<string | null>(null);

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

  const toggleCollapsed = (key: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

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
          </div>
        </header>

        {hasOpenWork ? (
          <div className="space-y-3" data-testid="today-execution-list">
            {eventGroups.map(({ group, openTasks: groupTasks }) => {
              const isCollapsed = collapsed.has(group.mindmapId);
              return (
                <EventSection
                  key={group.mindmapId}
                  group={group}
                  tasks={groupTasks}
                  isCollapsed={isCollapsed}
                  onToggleCollapsed={() => toggleCollapsed(group.mindmapId)}
                  onOpenPlanningGroup={onOpenPlanningGroup}
                  language={language}
                  isToday={isToday}
                  showAddInput={activeAddSection === group.mindmapId}
                  onRequestAdd={() => setActiveAddSection(group.mindmapId)}
                  onCancelAdd={() => setActiveAddSection(null)}
                  onAddToEvent={onAddToEvent}
                  renderTask={renderTask}
                />
              );
            })}

            {standaloneTasks.length > 0 && (
              <StandaloneSection
                tasks={standaloneTasks}
                isCollapsed={collapsed.has('__standalone__')}
                onToggleCollapsed={() => toggleCollapsed('__standalone__')}
                language={language}
                standaloneLabel={standaloneLabel}
                renderTask={renderTask}
              />
            )}
          </div>
        ) : (
          <div className="today-backlog-empty">
            <motion.div
              aria-hidden="true"
              animate={{ scale: [1, 1.08, 1], rotate: [0, -4, 0, 4, 0] }}
              transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
              className="text-accent"
            >
              <Sparkles className="h-4 w-4" />
            </motion.div>
            <p>{isToday
              ? (language === 'zh' ? '今天还没有任务。记下一件事就可以开始。' : 'Nothing here yet. Add one thing to get started.')
              : (language === 'zh' ? '这一天没有任务。' : 'No open tasks on this day.')}</p>
            {isToday && (
              <button onClick={onAddTask} className="today-backlog-empty-cta transition-transform active:scale-[0.97]">
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

// ---------------------------------------------------------------------------
// Event section — collapsible container that owns one event's tasks plus its
// own inline "+ Add to {event}" affordance. Clicking the header opens the
// event canvas (replacing the chip-on-card click); the trailing chevron
// toggles collapse.
// ---------------------------------------------------------------------------

interface EventSectionProps {
  group: TodayPlanningGroup;
  tasks: TodayTask[];
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  onOpenPlanningGroup?: (group: TodayPlanningGroup, nodeId?: string) => void;
  language: 'en' | 'zh';
  isToday: boolean;
  showAddInput: boolean;
  onRequestAdd: () => void;
  onCancelAdd: () => void;
  onAddToEvent?: (group: TodayPlanningGroup, title: string) => void | Promise<void>;
  renderTask: (task: TodayTask) => React.ReactNode;
}

function EventSection({
  group,
  tasks,
  isCollapsed,
  onToggleCollapsed,
  onOpenPlanningGroup,
  language,
  isToday,
  showAddInput,
  onRequestAdd,
  onCancelAdd,
  onAddToEvent,
  renderTask,
}: EventSectionProps) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (showAddInput) inputRef.current?.focus();
  }, [showAddInput]);

  const submit = async () => {
    const title = draft.trim();
    if (!title || !onAddToEvent) return;
    setSubmitting(true);
    try {
      await onAddToEvent(group, title);
      setDraft('');
      onCancelAdd();
    } finally {
      setSubmitting(false);
    }
  };

  const addLabel = language === 'zh' ? `添加到 ${group.title}` : `Add to ${group.title}`;
  const placeholder = language === 'zh' ? `${group.title} 的任务…` : `Task for ${group.title}…`;

  return (
    <div
      className="today-event-section"
      data-testid={`today-section-${group.mindmapId}`}
    >
      <div className="today-event-section-header">
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={!isCollapsed}
          aria-label={`${isCollapsed ? (language === 'zh' ? '展开' : 'Expand') : (language === 'zh' ? '收起' : 'Collapse')} ${group.title}`}
          className="today-event-section-chevron"
        >
          <ChevronRight className={`h-3.5 w-3.5 transition-transform ${isCollapsed ? '' : 'rotate-90'}`} />
        </button>
        <button
          type="button"
          onClick={() => onOpenPlanningGroup?.(group)}
          className="today-event-section-title"
          data-testid={`today-section-title-${group.mindmapId}`}
          title={language === 'zh' ? '打开事件画布' : 'Open event canvas'}
        >
          <Network className="today-event-icon" aria-hidden="true" />
          <span className="truncate">{group.title}</span>
          <span className="today-event-section-count">{tasks.length}</span>
        </button>
      </div>
      {!isCollapsed && (
        <ul className="today-event-section-list">
          {tasks.map(renderTask)}
          {isToday && onAddToEvent && (
            <li className="today-event-section-add">
              {showAddInput ? (
                <div className="today-event-add-form">
                  <input
                    ref={inputRef}
                    type="text"
                    value={draft}
                    onChange={event => setDraft(event.target.value)}
                    onKeyDown={event => {
                      if (event.nativeEvent.isComposing) return;
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void submit();
                      } else if (event.key === 'Escape') {
                        setDraft('');
                        onCancelAdd();
                      }
                    }}
                    placeholder={placeholder}
                    disabled={submitting}
                    className="today-event-add-input"
                    data-testid={`today-event-add-input-${group.mindmapId}`}
                  />
                  <button
                    type="button"
                    onClick={() => void submit()}
                    disabled={!draft.trim() || submitting}
                    className="today-event-add-submit"
                    aria-label={language === 'zh' ? '确认添加' : 'Confirm add'}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => { setDraft(''); onCancelAdd(); }}
                    disabled={submitting}
                    className="today-event-add-cancel"
                    aria-label={language === 'zh' ? '取消' : 'Cancel'}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={onRequestAdd}
                  className="today-event-add-trigger"
                  data-testid={`today-event-add-trigger-${group.mindmapId}`}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {addLabel}
                </button>
              )}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Standalone section — collapsible list of unlinked tasks. No inline add;
// the global TodayInputBar at the bottom handles standalone creation.
// ---------------------------------------------------------------------------

interface StandaloneSectionProps {
  tasks: TodayTask[];
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  language: 'en' | 'zh';
  standaloneLabel: string;
  renderTask: (task: TodayTask) => React.ReactNode;
}

function StandaloneSection({
  tasks,
  isCollapsed,
  onToggleCollapsed,
  language,
  standaloneLabel,
  renderTask,
}: StandaloneSectionProps) {
  return (
    <div className="today-standalone-section" data-testid="today-section-standalone">
      <div className="today-event-section-header">
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={!isCollapsed}
          aria-label={`${isCollapsed ? (language === 'zh' ? '展开' : 'Expand') : (language === 'zh' ? '收起' : 'Collapse')} ${standaloneLabel}`}
          className="today-event-section-chevron"
        >
          <ChevronRight className={`h-3.5 w-3.5 transition-transform ${isCollapsed ? '' : 'rotate-90'}`} />
        </button>
        <span className="today-event-section-title" data-testid="today-section-title-standalone">
          <Pin className="today-event-icon" aria-hidden="true" />
          <span className="truncate">{standaloneLabel}</span>
          <span className="today-event-section-count">{tasks.length}</span>
        </span>
      </div>
      {!isCollapsed && (
        <ul className="today-event-section-list">
          {tasks.map(renderTask)}
        </ul>
      )}
    </div>
  );
}
