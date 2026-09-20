import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Check, ChevronDown, ChevronRight, Network, Plus, Sparkles, X } from 'lucide-react';
import { TaskCard } from './TaskCard';
import type { RecurrenceRule, EventSummary } from '../api/client';

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
  /** Every event in the current context (including ones with no tasks today) —
   *  each becomes a tab in the horizontal tab bar. */
  events?: EventSummary[];
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
   *  (`useCreateTaskForNode` on the server). Shown as the inline "+ Add to
   *  {event}" input on that event's tab. */
  onAddToEvent?: (group: TodayPlanningGroup, title: string) => void | Promise<void>;
  /** Add a standalone task — used by the empty state CTA. */
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

export function TodayBacklog({
  tasks,
  planningGroups = [],
  events = [],
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
  // Which event tab is active; null = the "All" tab.
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  // Active tag chip; null = no tag filter.
  const [activeTag, setActiveTag] = useState<string | null>(null);
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

  // A task belongs to its source Event (mind map); anything unclaimed is
  // standalone and only lives in the All tab.
  const eventByTaskId = useMemo(() => {
    const lookup = new Map<string, TodayPlanningGroup>();
    for (const group of planningGroups) {
      for (const taskId of group.taskIds) lookup.set(taskId, group);
    }
    return lookup;
  }, [planningGroups]);

  // Tab list: every event (in list order, so recency) plus orphan groups that
  // hold today's tasks but aren't in the events query.
  const tabs = useMemo(() => {
    const byId = new Map<string, { id: string; mindmapId: string; spaceId?: string; title: string }>();
    for (const e of events) {
      byId.set(e.id, { id: e.id, mindmapId: e.mindmapId ?? e.id, spaceId: e.id, title: e.title || (language === 'zh' ? '未命名事件' : 'Untitled event') });
    }
    for (const g of planningGroups) {
      if (!byId.has(g.id)) byId.set(g.id, { id: g.id, mindmapId: g.mindmapId, spaceId: g.spaceId, title: g.title });
    }
    const openCountByEvent = new Map<string, number>();
    for (const task of openTasks) {
      const group = eventByTaskId.get(task.id);
      if (group) openCountByEvent.set(group.id, (openCountByEvent.get(group.id) ?? 0) + 1);
    }
    return [...byId.values()].map(e => ({ ...e, openCount: openCountByEvent.get(e.id) ?? 0 }));
  }, [events, planningGroups, openTasks, eventByTaskId, language]);

  // If the active event disappears (deleted), fall back to All.
  useEffect(() => {
    if (activeEventId && !tabs.some(t => t.id === activeEventId)) setActiveEventId(null);
  }, [activeEventId, tabs]);

  const activePlanningGroup = useMemo<TodayPlanningGroup | null>(() => {
    if (!activeEventId) return null;
    const existing = planningGroups.find(g => g.id === activeEventId);
    if (existing) return existing;
    const tab = tabs.find(t => t.id === activeEventId);
    if (!tab) return null;
    return { id: tab.id, mindmapId: tab.mindmapId, spaceId: tab.spaceId, title: tab.title, taskIds: [], completedTaskIds: [] };
  }, [activeEventId, planningGroups, tabs]);

  const matchesTab = (task: TodayTask) => activeEventId === null || eventByTaskId.get(task.id)?.id === activeEventId;
  const matchesTag = (task: TodayTask) => activeTag === null || (task.tags ?? []).includes(activeTag);

  const visibleOpenTasks = useMemo(
    () => openTasks.filter(task => matchesTab(task) && matchesTag(task)),
    [openTasks, activeEventId, activeTag], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const visibleCompletedTasks = useMemo(
    () => completedTasks.filter(task => matchesTab(task) && matchesTag(task)),
    [completedTasks, activeEventId, activeTag], // eslint-disable-line react-hooks/exhaustive-deps
  );

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

  const hasOpenWork = visibleOpenTasks.length > 0;
  const isAllTab = activeEventId === null;
  const emptyLabel = isToday
    ? (language === 'zh' ? '今天还没有任务。记下一件事就可以开始。' : 'Nothing here yet. Add one thing to get started.')
    : (language === 'zh' ? '这一天没有任务。' : 'No open tasks on this day.');
  const allLabel = language === 'zh' ? '全部' : 'All';

  return (
    <div className="today-backlog today-simple" data-testid="today-backlog">
      <nav className="today-tabbar" data-testid="today-tabbar" aria-label={language === 'zh' ? '事件' : 'Events'}>
        <button
          type="button"
          onClick={() => setActiveEventId(null)}
          className={`today-tab ${isAllTab ? 'today-tab-active' : ''}`}
          aria-pressed={isAllTab}
          data-testid="today-tab-all"
        >
          <span>{allLabel}</span>
          {openTasks.length > 0 && <span className="today-tab-count">{openTasks.length}</span>}
        </button>
        {tabs.map(tab => {
          const active = activeEventId === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveEventId(active ? null : tab.id)}
              className={`today-tab ${active ? 'today-tab-active' : ''}`}
              aria-pressed={active}
              data-testid={`today-tab-${tab.id}`}
              title={tab.title}
            >
              <span className="truncate">{tab.title}</span>
              {tab.openCount > 0 && <span className="today-tab-count">{tab.openCount}</span>}
            </button>
          );
        })}
      </nav>

      {categories.length > 0 && (
        <div className="today-tagbar" data-testid="today-tagbar">
          {categories.map(tag => (
            <button
              key={tag}
              type="button"
              onClick={() => setActiveTag(activeTag === tag ? null : tag)}
              className={`today-tag-chip ${activeTag === tag ? 'today-tag-chip-active' : ''}`}
              aria-pressed={activeTag === tag}
              data-testid={`today-tag-${tag}`}
            >
              #{tag}
            </button>
          ))}
        </div>
      )}

      <section className="today-simple-open" aria-labelledby="today-task-list-title">
        <header className="today-simple-section-header">
          <div>
            <p className="today-simple-eyebrow">
              {language === 'zh' ? '今天要完成的事' : 'What needs doing today'}
            </p>
            <h2 id="today-task-list-title">{isAllTab
              ? (language === 'zh' ? '任务' : 'Tasks')
              : activePlanningGroup?.title ?? ''}</h2>
          </div>
          <div className="today-simple-header-actions">
            <span aria-label={language === 'zh' ? `${visibleOpenTasks.length} 个待办` : `${visibleOpenTasks.length} open tasks`}>
              {visibleOpenTasks.length}
            </span>
          </div>
        </header>

        {isAllTab ? (
          hasOpenWork ? (
            <ul className="today-simple-list" data-testid="today-execution-list">
              {visibleOpenTasks.map(renderTask)}
            </ul>
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
              <p>{emptyLabel}</p>
              {isToday && (
                <button onClick={onAddTask} className="today-backlog-empty-cta transition-transform active:scale-[0.97]">
                  {language === 'zh' ? '添加任务' : 'Add one thing'}
                </button>
              )}
            </div>
          )
        ) : (
          activePlanningGroup && (
            <div className="space-y-3" data-testid="today-execution-list">
              <EventSection
                group={activePlanningGroup}
                tasks={visibleOpenTasks}
                isCollapsed={collapsed.has(activePlanningGroup.mindmapId)}
                onToggleCollapsed={() => toggleCollapsed(activePlanningGroup.mindmapId)}
                onOpenPlanningGroup={onOpenPlanningGroup}
                language={language}
                isToday={isToday}
                showAddInput={activeAddSection === activePlanningGroup.mindmapId}
                onRequestAdd={() => setActiveAddSection(activePlanningGroup.mindmapId)}
                onCancelAdd={() => setActiveAddSection(null)}
                onAddToEvent={onAddToEvent}
                renderTask={renderTask}
              />
            </div>
          )
        )}
      </section>

      {visibleCompletedTasks.length > 0 && (
        <section className="today-simple-completed" data-testid="today-group-completed">
          <button
            type="button"
            onClick={() => setShowCompleted(value => !value)}
            aria-expanded={showCompleted}
            aria-label={`${language === 'zh' ? '已完成' : 'Completed'} ${visibleCompletedTasks.length}`}
          >
            <Check className="h-3.5 w-3.5" />
            <span>{language === 'zh' ? '已完成' : 'Completed'}</span>
            <span>{visibleCompletedTasks.length}</span>
            <ChevronDown className={`ml-auto h-3.5 w-3.5 transition-transform ${showCompleted ? 'rotate-180' : ''}`} />
          </button>
          {showCompleted && <ul className="today-simple-list">{visibleCompletedTasks.map(renderTask)}</ul>}
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Event section — collapsible container that owns one event's tasks plus its
// own inline "+ Add to {event}" affordance. Rendered inside that event's tab.
// Clicking the header opens the event canvas; the trailing chevron toggles
// collapse.
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
          {tasks.length === 0 && (
            <li className="today-event-section-empty">
              {language === 'zh' ? '这个事件今天还没有任务。' : 'No tasks for this event today.'}
            </li>
          )}
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
