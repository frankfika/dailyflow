/**
 * TaskListView — the list-view counterpart of the MindMap view for a
 * single Topic Space.
 *
 * Renders the tasks bound to the active space as a flat list using the
 * same `TaskCard` pattern TodayView uses. We don't reuse TodayBacklog
 * directly because that component owns its own date picker / filter
 * strip; here we just need the cards in scope.
 *
 * Per Phase 4, every task that has a `spaceId` shows a small "已绑定到
 * [Space name]" indicator with an unlink button. The unlink is a
 * fire-and-forget mutation that calls the parent onChange handler when
 * done so the parent can refetch the list.
 */
import { useMemo, useState } from 'react';
import { CheckSquare, Link2, X } from 'lucide-react';
import type { TaskInput } from '../../api/client';

export interface TaskListViewTask extends TaskInput {
  /** The space this task is bound to. Optional so legacy / un-bound tasks
   *  render without the indicator. */
  spaceId?: string;
  /** Source date for the task (used for the unlink tooltip). */
  source_date?: string;
}

export interface TaskListViewProps {
  tasks: ReadonlyArray<TaskListViewTask>;
  /** The space currently being viewed. Used for the header + the
   *  unlink confirmation. */
  spaceId: string;
  spaceTitle: string;
  language: 'en' | 'zh';
  isLoading?: boolean;
  /**
   * Selected tag filter. When non-empty, only tasks whose `tags` array
   * contains at least one of the selected tags are rendered. Multi-
   * select: union of tag matches.
   */
  selectedTagFilter?: ReadonlyArray<string>;
  /**
   * Optional callback when the user clicks "unlink" on a task. The
   * parent decides how to actually update the binding (server or local).
   */
  onUnlinkTask?: (taskId: string) => void;
  /**
   * Optional click handler for a task — e.g. to navigate to TodayView
   * with the task's date.
   */
  onSelectTask?: (task: TaskListViewTask) => void;
  /**
   * Optional toggle handler. Wired by the parent to the existing
   * `tasksApi.updateStatus` flow.
   */
  onToggleTask?: (taskId: string) => void;
}

const LANG = {
  zh: {
    title: (s: string) => `${s} · 任务列表`,
    empty: '该主题下还没有任务',
    emptyHint: '右键导图里的节点选「转为待办」即可添加。',
    bound: (s: string) => `已绑定到 ${s}`,
    unlink: '解除绑定',
    unlinkConfirm: '确定要解除这个任务的主题绑定吗？',
    statusDone: '已完成',
    statusTodo: '待办',
    filterEmpty: '当前过滤下没有任务',
    untagged: '无标签',
  },
  en: {
    title: (s: string) => `${s} · Tasks`,
    empty: 'No tasks in this space yet',
    emptyHint: 'Right-click a mind map node and pick "Convert to Task".',
    bound: (s: string) => `Linked to ${s}`,
    unlink: 'Unlink',
    unlinkConfirm: 'Unlink this task from the space?',
    statusDone: 'Done',
    statusTodo: 'Todo',
    filterEmpty: 'No tasks match the current filter',
    untagged: 'No tags',
  },
};

function formatDate(iso: string | undefined, language: 'en' | 'zh'): string {
  if (!iso) return '';
  return iso;
}

export function TaskListView({
  tasks,
  spaceId,
  spaceTitle,
  language,
  isLoading = false,
  selectedTagFilter = [],
  onUnlinkTask,
  onSelectTask,
  onToggleTask,
}: TaskListViewProps) {
  const L = LANG[language];
  const [pendingUnlinkId, setPendingUnlinkId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (selectedTagFilter.length === 0) return tasks;
    return tasks.filter((t) =>
      (t.tags ?? []).some((tag) => selectedTagFilter.includes(tag)),
    );
  }, [tasks, selectedTagFilter]);

  const stats = useMemo(() => {
    let done = 0;
    for (const t of filtered) if (t.status === 'done') done += 1;
    return { done, total: filtered.length };
  }, [filtered]);

  if (isLoading) {
    return (
      <div
        className="flex h-full items-center justify-center text-sm text-text-muted"
        data-testid="task-list-view-loading"
      >
        {language === 'zh' ? '加载中…' : 'Loading…'}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="task-list-view" data-space-id={spaceId}>
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 bg-surface/50 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <CheckSquare className="h-4 w-4 shrink-0 text-[var(--color-accent)]" />
          <h2 className="truncate text-sm font-semibold text-text-heading">
            {L.title(spaceTitle)}
          </h2>
          {stats.total > 0 && (
            <span
              className="shrink-0 rounded-md border border-border bg-white/80 px-1.5 py-0.5 text-[10px] text-text-muted"
              data-testid="task-list-view-stats"
            >
              {stats.done}/{stats.total}
            </span>
          )}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {filtered.length === 0 ? (
          <div
            className="flex h-full flex-col items-center justify-center gap-1 text-center"
            data-testid="task-list-view-empty"
          >
            <div className="text-sm text-text-muted">
              {tasks.length === 0 ? L.empty : L.filterEmpty}
            </div>
            {tasks.length === 0 && (
              <div className="max-w-sm text-[11px] text-text-muted/80">
                {L.emptyHint}
              </div>
            )}
          </div>
        ) : (
          <ul className="space-y-2" data-testid="task-list-view-list">
            {filtered.map((t) => (
              <li
                key={t.id}
                className="group rounded-md border border-border bg-white/95 p-3 shadow-sm transition-colors hover:border-[var(--color-accent)]/30"
                data-testid={`task-list-view-item-${t.id}`}
                data-priority={t.priority || 'none'}
                data-status={t.status}
              >
                <div className="flex items-start gap-2">
                  {onToggleTask && (
                    <button
                      type="button"
                      onClick={() => onToggleTask(t.id)}
                      className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border ${
                        t.status === 'done'
                          ? 'border-[var(--color-success)] bg-[var(--color-success)]'
                          : 'border-border bg-white'
                      }`}
                      title={t.status === 'done' ? L.statusDone : L.statusTodo}
                      data-testid={`task-list-view-toggle-${t.id}`}
                      aria-label={t.status === 'done' ? L.statusDone : L.statusTodo}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => onSelectTask?.(t)}
                      className={`block w-full truncate text-left text-sm ${
                        t.status === 'done' ? 'text-text-muted line-through' : 'text-text-heading'
                      }`}
                    >
                      {t.title}
                    </button>
                    {(t.tags?.length || 0) > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {t.tags!.filter((tag) => !['tasks', 'work', 'life'].includes(tag)).map((tag) => (
                          <span
                            key={tag}
                            className="rounded-md border border-border bg-black/[0.04] px-1.5 py-0.5 text-[10px] text-text-muted"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                    {t.deadline && (
                      <div className="mt-0.5 text-[10px] text-text-muted">
                        {formatDate(t.deadline, language)}
                      </div>
                    )}
                  </div>
                </div>
                {t.spaceId === spaceId && (
                  <div
                    className="mt-2 flex items-center justify-between gap-2 border-t border-border/40 pt-2"
                    data-testid={`task-list-view-binding-${t.id}`}
                  >
                    <div className="flex min-w-0 items-center gap-1 text-[10px] text-text-muted">
                      <Link2 className="h-3 w-3 shrink-0" />
                      <span className="truncate">{L.bound(spaceTitle)}</span>
                    </div>
                    {onUnlinkTask && (
                      pendingUnlinkId === t.id ? (
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-text-muted">{L.unlinkConfirm}</span>
                          <button
                            type="button"
                            onClick={() => {
                              onUnlinkTask(t.id);
                              setPendingUnlinkId(null);
                            }}
                            data-testid={`task-list-view-unlink-confirm-${t.id}`}
                            className="rounded bg-[var(--color-danger)] px-1.5 py-0.5 text-[10px] font-medium text-white shadow-sm hover:bg-[var(--color-danger)]/90"
                          >
                            {L.unlink}
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingUnlinkId(null)}
                            data-testid={`task-list-view-unlink-cancel-${t.id}`}
                            className="rounded border border-border bg-white/80 px-1.5 py-0.5 text-[10px] text-text-muted"
                          >
                            ×
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setPendingUnlinkId(t.id)}
                          data-testid={`task-list-view-unlink-${t.id}`}
                          title={L.unlink}
                          className="inline-flex items-center gap-0.5 rounded border border-border bg-white/80 px-1.5 py-0.5 text-[10px] text-text-muted transition-colors hover:border-[var(--color-danger)]/40 hover:text-[var(--color-danger)]"
                        >
                          <X className="h-3 w-3" />
                          {L.unlink}
                        </button>
                      )
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
