import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Calendar, Check, ChevronDown, Clock3, Flame, Sparkles, Target, WandSparkles, X } from 'lucide-react';
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
  priority?: 'high' | 'medium' | 'low';
  source_date?: string;
};

type Filter = 'all' | 'overdue' | 'today' | 'week' | 'later';

interface TodayBacklogProps {
  tasks: Task[];
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
  aiAvailable: boolean;
  onGenerateAIPlan: (brief: string) => Promise<{ taskIds: string[]; summary: string }>;
  onConfigureAI: () => void;
}

const FOCUS_LIMIT = 3;

function startOfTodayIso(): string {
  // Returns YYYY-MM-DD in the user's local time.
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function daysBetween(a: string, b: string): number {
  // a, b are YYYY-MM-DD; returns signed day count (b - a).
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const at = Date.UTC(ay, am - 1, ad);
  const bt = Date.UTC(by, bm - 1, bd);
  return Math.round((bt - at) / 86_400_000);
}

type Group = 'overdue' | 'today' | 'week' | 'later';

function classifyDeadline(deadline: string | undefined, today: string): Group | null {
  if (!deadline) return null;
  const diff = daysBetween(today, deadline);
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  if (diff <= 7) return 'week';
  return 'later';
}

const PRIORITY_RANK: Record<'high' | 'medium' | 'low', number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function compareTasks(a: Task, b: Task, today: string): number {
  // Higher priority first; then sooner deadline; then keep stable order otherwise.
  const pa = a.priority ? PRIORITY_RANK[a.priority] : 3;
  const pb = b.priority ? PRIORITY_RANK[b.priority] : 3;
  if (pa !== pb) return pa - pb;
  const da = a.deadline || '9999-12-31';
  const db = b.deadline || '9999-12-31';
  if (da !== db) return da.localeCompare(db);
  return 0;
}

export function TodayBacklog({
  tasks,
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
  aiAvailable,
  onGenerateAIPlan,
  onConfigureAI,
}: TodayBacklogProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const [showFocus, setShowFocus] = useState(true);
  const [showAllNoDeadline, setShowAllNoDeadline] = useState(false);

  const today = useMemo(() => startOfTodayIso(), []);

  // Open (non-done) tasks; migrated tasks are excluded (they live in source_date).
  const openTasks = useMemo(
    () => tasks.filter(t => t.status !== 'done' && t.status !== 'migrated'),
    [tasks],
  );

  const focusTasks = useMemo(
    () => focusTaskIds
      .map(id => openTasks.find(t => t.id === id))
      .filter((t): t is Task => Boolean(t)),
    [focusTaskIds, openTasks],
  );

  const backlog = useMemo(
    () => openTasks.filter(t => !focusTaskIds.includes(t.id)),
    [openTasks, focusTaskIds],
  );

  // Group backlog tasks by urgency bucket.
  const groups = useMemo(() => {
    const buckets: Record<Group, Task[]> = { overdue: [], today: [], week: [], later: [] };
    const noDeadline: Task[] = [];
    for (const task of backlog) {
      const bucket = classifyDeadline(task.deadline, today);
      if (bucket) buckets[bucket].push(task);
      else noDeadline.push(task);
    }
    for (const key of Object.keys(buckets) as Group[]) {
      buckets[key].sort((a, b) => compareTasks(a, b, today));
    }
    noDeadline.sort((a, b) => compareTasks(a, b, today));
    return { buckets, noDeadline };
  }, [backlog, today]);

  // Active filter: when user picks a specific bucket, only show that one
  // group; the rest are hidden so the filter actually narrows the view.
  const visibleBuckets: Record<Group, Task[]> = useMemo(() => {
    if (filter === 'all') return groups.buckets;
    return {
      overdue: filter === 'overdue' ? groups.buckets.overdue : [],
      today: filter === 'today' ? groups.buckets.today : [],
      week: filter === 'week' ? groups.buckets.week : [],
      later: filter === 'later' ? groups.buckets.later : [],
    };
  }, [groups, filter]);

  const groupDefs: { key: Group | 'nodate'; label: string; sub: string; icon: typeof Flame; accent: string }[] = [
    { key: 'overdue', label: language === 'zh' ? '已过期' : 'Overdue', sub: language === 'zh' ? '已经过了截止日期' : 'Past the deadline', icon: Flame, accent: 'overdue' },
    { key: 'today',   label: language === 'zh' ? '今天截止' : 'Due today', sub: language === 'zh' ? '今天必须处理' : 'Must be handled today', icon: Target, accent: 'today' },
    { key: 'week',    label: language === 'zh' ? '本周' : 'This week', sub: language === 'zh' ? '未来 7 天内截止' : 'Due in the next 7 days', icon: Calendar, accent: 'week' },
    { key: 'later',   label: language === 'zh' ? '之后再说' : 'Later', sub: language === 'zh' ? '7 天以上' : 'Beyond 7 days', icon: Clock3, accent: 'later' },
  ];

  const counts: Record<Group, number> = {
    overdue: groups.buckets.overdue.length,
    today: groups.buckets.today.length,
    week: groups.buckets.week.length,
    later: groups.buckets.later.length,
  };

  const addToFocus = (id: string) => {
    if (focusTaskIds.length >= FOCUS_LIMIT) return;
    if (focusTaskIds.includes(id)) return;
    onFocusTaskIdsChange([...focusTaskIds, id]);
  };
  const removeFromFocus = (id: string) => {
    onFocusTaskIdsChange(focusTaskIds.filter(fid => fid !== id));
  };
  const isInFocus = (id: string) => focusTaskIds.includes(id);

  const completedFocus = focusTasks.filter(t => t.status === 'done').length;
  const progress = focusTasks.length === 0 ? 0 : Math.round((completedFocus / focusTasks.length) * 100);

  // i18n for filter pills
  const labels: Record<string, string> = {
    all: language === 'zh' ? '全部' : 'All',
    overdue: language === 'zh' ? '已过期' : 'Overdue',
    today: language === 'zh' ? '今天' : 'Today',
    week: language === 'zh' ? '本周' : 'This week',
    later: language === 'zh' ? '之后' : 'Later',
  };

  return (
    <div className="today-backlog" data-testid="today-backlog">
      {/* Focus bar (sticky on desktop, collapsible on mobile) */}
      <section className="today-focus-bar" data-testid="today-focus-bar">
        <button
          className="today-focus-bar-toggle"
          onClick={() => setShowFocus(s => !s)}
          aria-expanded={showFocus}
        >
          <span className="today-focus-bar-mark"><Target className="w-4 h-4" /></span>
          <div className="min-w-0 flex-1 text-left">
            <p className="today-focus-bar-eyebrow">
              {language === 'zh' ? '今日承诺 · 最多 3 件' : "TODAY'S COMMITMENT · UP TO 3"}
            </p>
            <h2 className="today-focus-bar-title">
              {focusTasks.length === 0
                ? (language === 'zh' ? '挑出今天最重要的 3 件事' : 'Pick the 3 things that matter today')
                : (language === 'zh' ? `已选 ${focusTasks.length} 件` : `${focusTasks.length} picked`)}
            </h2>
          </div>
          {focusTasks.length > 0 && (
            <div className="today-focus-bar-progress" aria-label={`${progress}%`}>
              <span>{completedFocus}/{focusTasks.length}</span>
              <div className="today-focus-bar-progress-track">
                <motion.div
                  className="today-focus-bar-progress-value"
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.35 }}
                />
              </div>
            </div>
          )}
          <ChevronDown className={`w-4 h-4 text-text-muted transition-transform ${showFocus ? 'rotate-180' : ''}`} />
        </button>

        <AnimatePresence initial={false}>
          {showFocus && (
            <motion.div
              key="focus-body"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden"
            >
              {focusTasks.length === 0 ? (
                <p className="today-focus-bar-empty">
                  {language === 'zh'
                    ? '从下面挑任务加进今天 — 加号 / 拖动都可以，或者直接点 AI 帮你选。'
                    : 'Add tasks below with the + button, drag them, or let AI pick for you.'}
                </p>
              ) : (
                <ul className="today-focus-bar-list">
                  {focusTasks.map((task, index) => (
                    <li key={task.id} className={`today-focus-bar-item ${task.status === 'done' ? 'is-done' : ''}`}>
                      <button
                        className="today-focus-bar-check"
                        onClick={() => onToggleTask(task.id)}
                        aria-label={task.status === 'done' ? 'Mark incomplete' : 'Mark complete'}
                      >
                        {task.status === 'done' ? <Check className="w-3.5 h-3.5" /> : <span>{index + 1}</span>}
                      </button>
                      <span className="today-focus-bar-task-title">{task.title}</span>
                      {task.deadline && <span className="today-focus-bar-meta">{task.deadline}</span>}
                      {isToday && (
                        <button
                          className="today-focus-bar-remove"
                          onClick={() => removeFromFocus(task.id)}
                          title={language === 'zh' ? '移出今日三件事' : 'Remove from today’s three'}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* Filter pills */}
      <div className="today-filter-row" role="tablist">
        {(['all', 'overdue', 'today', 'week', 'later'] as Filter[]).map(key => {
          const count = key === 'all'
            ? backlog.length
            : counts[key as Group];
          const isActive = filter === key;
          return (
            <button
              key={key}
              role="tab"
              aria-selected={isActive}
              onClick={() => setFilter(key)}
              className={`today-filter-pill ${isActive ? 'is-active' : ''} ${key !== 'all' ? `is-${key}` : ''}`}
              data-testid={`today-filter-${key}`}
            >
              <span>{labels[key]}</span>
              <span className="today-filter-pill-count">{count}</span>
            </button>
          );
        })}
        {isToday && (
          <button
            onClick={onAddTask}
            className="today-filter-add"
            data-testid="today-add-task"
          >
            <WandSparkles className="w-3.5 h-3.5" />
            {language === 'zh' ? '记下一件事' : 'Capture a task'}
          </button>
        )}
      </div>

      {/* Backlog groups */}
      <div className="today-backlog-groups">
        {groupDefs.map(def => {
          const items = visibleBuckets[def.key];
          // All-view: hide empty groups so we don't ship blank sections.
          // Filtered view: only render the active group, even if empty
          // (so the "Nothing here" empty state stays visible).
          if (items.length === 0 && filter === 'all') return null;
          if (filter !== 'all' && def.key !== filter) return null;
          const Icon = def.icon;
          return (
            <section key={def.key} className={`today-group is-${def.accent}`} data-testid={`today-group-${def.key}`}>
              <header className="today-group-header">
                <span className="today-group-mark"><Icon className="w-3.5 h-3.5" /></span>
                <h3 className="today-group-title">{def.label}</h3>
                <span className="today-group-count">{items.length}</span>
                <p className="today-group-sub">{def.sub}</p>
              </header>
              {items.length > 0 ? (
                <ul className="today-group-list">
                  {items.map(task => (
                    <li key={task.id} className="today-group-item" data-priority={task.priority || 'none'}>
                      <TaskCard
                        task={task}
                        language={language}
                        categories={[]}
                        currentFileDate={today}
                        linkedNotesCount={linkedNotesCount(task.id)}
                        onToggle={() => onToggleTask(task.id)}
                        onEdit={updates => onEditTask(task.id, updates)}
                        onDelete={() => onDeleteTask(task.id)}
                        onCreateLinkedNote={() => onCreateLinkedNote(task.id)}
                        onShowLinkedNotes={() => onShowLinkedNotes(task.id)}
                        showCompletionPrompt={false}
                        onCompletionPromptClosed={() => {}}
                      />
                      {!isInFocus(task.id) ? (
                        <button
                          className="today-group-add"
                          onClick={() => addToFocus(task.id)}
                          disabled={focusTaskIds.length >= FOCUS_LIMIT}
                          title={
                            focusTaskIds.length >= FOCUS_LIMIT
                              ? (language === 'zh' ? '今天已经选了 3 件' : 'Already 3 picked')
                              : (language === 'zh' ? '加进今天' : 'Add to today')
                          }
                          aria-label={language === 'zh' ? '加进今天' : 'Add to today'}
                          data-testid={`add-to-focus-${task.id}`}
                        >
                          +
                        </button>
                      ) : (
                        <button
                          className="today-group-remove"
                          onClick={() => removeFromFocus(task.id)}
                          title={language === 'zh' ? '已在今日 3 件中（点此移出）' : 'In today’s 3 (click to remove)'}
                          aria-label={language === 'zh' ? '已在今日 3 件' : 'In today’s 3'}
                          data-testid={`in-focus-${task.id}`}
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : filter === def.key ? (
                <p className="today-group-empty">
                  {language === 'zh' ? '这一组没有任务' : 'Nothing here'}
                </p>
              ) : null}
            </section>
          );
        })}

        {/* No-deadline tasks: collapsed by default since they’re usually the
            noisiest bucket, but show the count so users know they exist. */}
        {groups.noDeadline.length > 0 && (
          <section className="today-group is-nodate" data-testid="today-group-nodate">
            <button
              className="today-group-header today-group-header-collapsible"
              onClick={() => setShowAllNoDeadline(v => !v)}
              aria-expanded={showAllNoDeadline}
            >
              <span className="today-group-mark"><Clock3 className="w-3.5 h-3.5" /></span>
              <h3 className="today-group-title">
                {language === 'zh' ? '没有截止日期' : 'No deadline'}
              </h3>
              <span className="today-group-count">{groups.noDeadline.length}</span>
              <ChevronDown className={`w-3.5 h-3.5 text-text-muted transition-transform ${showAllNoDeadline ? 'rotate-180' : ''}`} />
            </button>
            {showAllNoDeadline && (
              <ul className="today-group-list">
                {groups.noDeadline.map(task => (
                  <li key={task.id} className="today-group-item" data-priority={task.priority || 'none'}>
                    <TaskCard
                      task={task}
                      language={language}
                      categories={[]}
                      currentFileDate={today}
                      linkedNotesCount={linkedNotesCount(task.id)}
                      onToggle={() => onToggleTask(task.id)}
                      onEdit={updates => onEditTask(task.id, updates)}
                      onDelete={() => onDeleteTask(task.id)}
                      onCreateLinkedNote={() => onCreateLinkedNote(task.id)}
                      onShowLinkedNotes={() => onShowLinkedNotes(task.id)}
                      showCompletionPrompt={false}
                      onCompletionPromptClosed={() => {}}
                    />
                    {!isInFocus(task.id) ? (
                      <button
                        className="today-group-add"
                        onClick={() => addToFocus(task.id)}
                        disabled={focusTaskIds.length >= FOCUS_LIMIT}
                        title={language === 'zh' ? '加进今天' : 'Add to today'}
                        aria-label={language === 'zh' ? '加进今天' : 'Add to today'}
                        data-testid={`add-to-focus-${task.id}`}
                      >
                        +
                      </button>
                    ) : (
                      <button
                        className="today-group-remove"
                        onClick={() => removeFromFocus(task.id)}
                        title={language === 'zh' ? '已在今日 3 件' : 'In today’s 3'}
                        data-testid={`in-focus-${task.id}`}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {backlog.length === 0 && groups.noDeadline.length === 0 && (
          <div className="today-backlog-empty">
            <Sparkles className="w-4 h-4 text-text-muted" />
            <p>
              {isToday
                ? (language === 'zh' ? '今天还没有积压任务。记下一件事开始。' : 'No backlog yet. Capture something to get started.')
                : (language === 'zh' ? '这一天没有积压任务。' : 'Nothing pending on this day.')}
            </p>
            {isToday && (
              <button onClick={onAddTask} className="today-backlog-empty-cta">
                <WandSparkles className="w-3.5 h-3.5" />
                {language === 'zh' ? '记下一件事' : 'Capture a task'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
