import React, { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { calendarApi, type CalendarWorkspaceItem } from '../../../api/client';
import { queryKeys } from '../../../queryKeys';
import { mergeWorkItems, type WorkItem } from '../../../types/workItem';
import { useWorkspaceScope } from '../../../workspaceScope';
import {
  getStaleCommitments,
  getWaitingOverdue,
  listCommitments,
  listJobs,
  listLegacyTasks,
  listProposals,
  moveCommitmentToSomeday,
  patchCommitment,
  resumeCommitment,
  retryJob,
  updateLegacyTask,
  waitOnCommitment,
  type Commitment,
  type LegacyTaskView,
} from '../api/client';
import { Badge, Card, EmptyState, Spinner } from '../components/States';
import { ProposalReview } from '../proposals/ProposalReview';

type ReviewViewProps = {
  language?: 'zh' | 'en';
  onOpenPlan?: () => void;
};

const DAY_MS = 86_400_000;

export function ReviewView({ language = 'zh', onOpenPlan }: ReviewViewProps) {
  const workspaceId = useWorkspaceScope();
  const queryClient = useQueryClient();
  const isZh = language === 'zh';
  const today = localDateString();

  const waiting = useQuery({
    queryKey: queryKeys.commitments(workspaceId, { review: 'waiting-due' }),
    queryFn: getWaitingOverdue,
  });
  const stale = useQuery({
    queryKey: queryKeys.commitments(workspaceId, { review: 'stale' }),
    queryFn: getStaleCommitments,
  });
  const commitments = useQuery({
    queryKey: queryKeys.commitments(workspaceId, { state: 'open', review: true }),
    queryFn: () => listCommitments({ state: 'open' }),
  });
  const legacy = useQuery({
    queryKey: queryKeys.today(workspaceId, 'legacy-global'),
    queryFn: listLegacyTasks,
  });
  const proposals = useQuery({
    queryKey: queryKeys.proposals(workspaceId, { status: 'pending', review: true }),
    queryFn: () => listProposals({ status: 'pending' }),
  });
  const failedJobs = useQuery({
    queryKey: queryKeys.jobs(workspaceId, { status: 'failed', review: true }),
    queryFn: () => listJobs('failed'),
  });
  const calendar = useQuery({
    queryKey: queryKeys.calendar(workspaceId, { date: today, review: 'conflicts' }),
    queryFn: () => calendarApi.getWorkspace(today, today),
  });

  const workItems = useMemo(
    () => mergeWorkItems(legacy.data?.items ?? [], commitments.data?.items ?? [], workspaceId),
    [commitments.data, legacy.data, workspaceId],
  );
  const overdue = useMemo(
    () => workItems
      .filter(item => item.status !== 'waiting' && item.status !== 'done' && item.status !== 'cancelled' && isPastDue(item, today))
      .sort((a, b) => dueTimestamp(a) - dueTimestamp(b)),
    [today, workItems],
  );
  const waitingIds = useMemo(
    () => new Set((waiting.data?.items ?? []).map(item => item.commitmentId)),
    [waiting.data],
  );
  const staleItems = useMemo(
    () => (stale.data?.items ?? []).filter(item => !waitingIds.has(item.commitmentId)),
    [stale.data, waitingIds],
  );
  const retryableJobs = useMemo(
    () => (failedJobs.data?.items ?? []).filter(job => job.error?.retryable),
    [failedJobs.data],
  );
  const conflicts = useMemo(
    () => detectCalendarConflicts(calendar.data?.items ?? []),
    [calendar.data],
  );

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.workspace(workspaceId) });
  const action = useMutation({
    mutationFn: (run: () => Promise<unknown>) => run(),
    onSuccess: refresh,
  });

  const total = (waiting.data?.items.length ?? 0)
    + overdue.length
    + staleItems.length
    + (proposals.data?.items.length ?? 0)
    + retryableJobs.length
    + conflicts.length;
  const anyLoading = waiting.isLoading || stale.isLoading || commitments.isLoading || legacy.isLoading
    || proposals.isLoading || failedJobs.isLoading || calendar.isLoading;
  const allReady = !anyLoading;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-heading">
            {isZh ? '待处理' : 'Needs attention'}
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-text-muted">
            {isZh
              ? '当前工作区中需要你处理的异常，不受正在浏览的历史日期影响。'
              : 'Actionable exceptions across this workspace, independent of the date you are browsing.'}
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text-muted hover:bg-black/5 hover:text-text-heading"
        >
          {isZh ? '刷新' : 'Refresh'}
        </button>
      </div>

      {allReady && total === 0 && (
        <Card>
          <EmptyState title={isZh ? '目前没有需要处理的事项' : 'Nothing needs attention'} />
        </Card>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <QueueSection
          title={isZh ? '等待已到复查时间' : 'Waiting review is due'}
          count={waiting.data?.items.length ?? 0}
          loading={waiting.isLoading}
          error={waiting.error}
          onRetry={() => waiting.refetch()}
          isZh={isZh}
        >
          {(waiting.data?.items ?? []).map(item => (
            <QueueItem
              key={item.commitmentId}
              badge={isZh ? `已到期 ${item.daysOverdue} 天` : `${item.daysOverdue}d overdue`}
              tone="danger"
              title={item.title}
              detail={isZh ? `正在等：${item.waitingOn}` : `Waiting on: ${item.waitingOn}`}
              actions={[
                {
                  label: isZh ? '恢复推进' : 'Resume',
                  onClick: () => action.mutate(() => resumeCommitment(item.commitmentId)),
                },
                {
                  label: isZh ? '7 天后再看' : 'Review in 7 days',
                  onClick: () => action.mutate(() => waitOnCommitment(item.commitmentId, {
                    waitingOnText: item.waitingOn,
                    reviewAt: new Date(Date.now() + 7 * DAY_MS).toISOString(),
                  })),
                },
              ]}
              disabled={action.isPending}
            />
          ))}
        </QueueSection>

        <QueueSection
          title={isZh ? '已逾期事项' : 'Overdue work'}
          count={overdue.length}
          loading={commitments.isLoading || legacy.isLoading}
          error={commitments.error || legacy.error}
          onRetry={() => { commitments.refetch(); legacy.refetch(); }}
          isZh={isZh}
        >
          {overdue.map(item => (
            <OverdueWorkItem
              key={`${item.kind}:${item.id}`}
              item={item}
              today={today}
              isZh={isZh}
              disabled={action.isPending}
              run={run => action.mutate(run)}
            />
          ))}
        </QueueSection>

        <QueueSection
          title={isZh ? '等待确认的 AI 建议' : 'AI suggestions to review'}
          count={proposals.data?.items.length ?? 0}
          loading={proposals.isLoading}
          error={proposals.error}
          onRetry={() => proposals.refetch()}
          isZh={isZh}
        >
          {(proposals.data?.items ?? []).map(proposal => (
            <ProposalReview
              key={proposal.id}
              proposal={proposal}
              language={language}
              onChanged={refresh}
            />
          ))}
        </QueueSection>

        <QueueSection
          title={isZh ? '长期未推进' : 'Stale work'}
          count={staleItems.length}
          loading={stale.isLoading}
          error={stale.error}
          onRetry={() => stale.refetch()}
          isZh={isZh}
        >
          {staleItems.map(item => (
            <QueueItem
              key={item.commitmentId}
              badge={`${item.daysSinceProgress}d`}
              tone="warning"
              title={item.title}
              detail={isZh ? `已经 ${item.daysSinceProgress} 天没有进展。` : `No progress for ${item.daysSinceProgress} days.`}
              actions={[{
                label: isZh ? '移到以后再做' : 'Move to Someday',
                onClick: () => action.mutate(() => moveCommitmentToSomeday(item.commitmentId)),
              }]}
              disabled={action.isPending}
            />
          ))}
        </QueueSection>

        <QueueSection
          title={isZh ? '计划冲突' : 'Schedule conflicts'}
          count={conflicts.length}
          loading={calendar.isLoading}
          error={calendar.error}
          onRetry={() => calendar.refetch()}
          isZh={isZh}
        >
          {conflicts.map(conflict => (
            <QueueItem
              key={`${conflict.first.id}:${conflict.second.id}`}
              badge={formatTimeRange(conflict.first, language)}
              tone="warning"
              title={`${conflict.first.title} ↔ ${conflict.second.title}`}
              detail={isZh ? '两个日程的时间发生重叠。' : 'These events overlap.'}
              actions={onOpenPlan ? [{
                label: isZh ? '打开计划' : 'Open plan',
                onClick: onOpenPlan,
              }] : []}
              disabled={false}
            />
          ))}
        </QueueSection>

        <QueueSection
          title={isZh ? '可重试的失败任务' : 'Retryable failed jobs'}
          count={retryableJobs.length}
          loading={failedJobs.isLoading}
          error={failedJobs.error}
          onRetry={() => failedJobs.refetch()}
          isZh={isZh}
        >
          {retryableJobs.map(job => (
            <QueueItem
              key={job.id}
              badge={isZh ? '可重试' : 'Retryable'}
              tone="danger"
              title={jobKindLabel(job.kind, isZh)}
              detail={job.error?.message || (isZh ? '任务执行失败' : 'Job failed')}
              actions={[{
                label: isZh ? '重试' : 'Retry',
                onClick: () => action.mutate(() => retryJob(job.id)),
              }]}
              disabled={action.isPending}
            />
          ))}
        </QueueSection>
      </div>

      {anyLoading && total === 0 && (
        <div className="flex items-center justify-center gap-2 py-4 text-xs text-text-muted">
          <Spinner size="sm" /> {isZh ? '正在汇总工作区…' : 'Checking workspace…'}
        </div>
      )}
      {action.error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {isZh ? '操作失败：' : 'Action failed: '}{(action.error as Error).message}
        </div>
      )}
    </div>
  );
}

function OverdueWorkItem({
  item,
  today,
  isZh,
  disabled,
  run,
}: {
  item: WorkItem;
  today: string;
  isZh: boolean;
  disabled: boolean;
  run: (action: () => Promise<unknown>) => void;
}) {
  if (item.kind === 'task') {
    const task = item.raw as LegacyTaskView;
    return (
      <QueueItem
        badge={formatDaysOverdue(item, today, isZh)}
        tone="danger"
        title={item.title}
        detail={isZh ? '来自每日任务' : 'From Daily tasks'}
        actions={[
          {
            label: isZh ? '标记完成' : 'Mark done',
            onClick: () => run(() => updateLegacyTask(task.date, task.line, {
              expectedTitle: task.title,
              status: 'done',
            })),
          },
          {
            label: isZh ? '顺延 7 天' : 'Defer 7 days',
            onClick: () => run(() => updateLegacyTask(task.date, task.line, {
              expectedTitle: task.title,
              deadline: addDaysToDate(today, 7),
            })),
          },
        ]}
        disabled={disabled}
      />
    );
  }
  const commitment = item.raw as Commitment;
  return (
    <QueueItem
      badge={formatDaysOverdue(item, today, isZh)}
      tone="danger"
      title={item.title}
      detail={commitment.nextAction || commitment.outcome}
      actions={[{
        label: isZh ? '顺延 7 天' : 'Defer 7 days',
        onClick: () => run(() => patchCommitment(item.id, {
          dueAt: new Date(Date.now() + 7 * DAY_MS).toISOString(),
        })),
      }]}
      disabled={disabled}
    />
  );
}

function QueueSection({
  title,
  count,
  loading,
  error,
  onRetry,
  isZh,
  children,
}: {
  title: string;
  count: number;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  isZh: boolean;
  children: React.ReactNode;
}) {
  if (!loading && !error && count === 0) return null;
  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-medium">{title}</div>
        <Badge>{count}</Badge>
      </div>
      {loading && count === 0 ? (
        <div className="flex items-center gap-2 py-2 text-xs text-text-muted">
          <Spinner size="sm" /> {isZh ? '加载中…' : 'Loading…'}
        </div>
      ) : error ? (
        <div className="rounded-md bg-red-500/10 p-2 text-xs text-red-600">
          <div>{(error as Error).message}</div>
          <button type="button" onClick={onRetry} className="mt-1 font-medium underline">
            {isZh ? '重试此部分' : 'Retry section'}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">{children}</div>
      )}
    </Card>
  );
}

function QueueItem({
  badge,
  tone,
  title,
  detail,
  actions,
  disabled,
}: {
  badge: string;
  tone?: 'default' | 'success' | 'info' | 'warning' | 'danger';
  title: string;
  detail?: string;
  actions: Array<{ label: string; onClick: () => void }>;
  disabled: boolean;
}) {
  return (
    <div className="rounded-lg border border-border p-3 text-xs">
      <div className="flex items-start gap-2">
        <Badge tone={tone}>{badge}</Badge>
        <span className="min-w-0 flex-1 font-medium text-text-heading">{title}</span>
      </div>
      {detail && <div className="mt-1.5 leading-5 text-text-muted">{detail}</div>}
      {actions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {actions.map(item => (
            <button
              key={item.label}
              type="button"
              disabled={disabled}
              onClick={item.onClick}
              className="rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-text-muted hover:border-accent/30 hover:bg-accent/10 hover:text-accent disabled:opacity-50"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type CalendarConflict = { first: CalendarWorkspaceItem; second: CalendarWorkspaceItem };

export function detectCalendarConflicts(items: CalendarWorkspaceItem[]): CalendarConflict[] {
  const timed = items
    .filter(item => !item.allDay && item.status !== 'done')
    .map(item => ({
      item,
      start: new Date(item.start).getTime(),
      end: item.end ? new Date(item.end).getTime() : new Date(item.start).getTime() + 30 * 60_000,
    }))
    .filter(item => Number.isFinite(item.start) && Number.isFinite(item.end))
    .sort((a, b) => a.start - b.start);
  const conflicts: CalendarConflict[] = [];
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length && timed[j]!.start < timed[i]!.end; j++) {
      if (timed[i]!.item.id !== timed[j]!.item.id) {
        conflicts.push({ first: timed[i]!.item, second: timed[j]!.item });
      }
    }
  }
  return conflicts;
}

function isPastDue(item: WorkItem, today: string): boolean {
  if (!item.dueAt) return false;
  return normalizedDueDate(item.dueAt) < today;
}

function dueTimestamp(item: WorkItem): number {
  return item.dueAt ? dateToUtc(normalizedDueDate(item.dueAt)) : Number.MAX_SAFE_INTEGER;
}

function normalizedDueDate(value: string): string {
  return value.slice(0, 10);
}

function formatDaysOverdue(item: WorkItem, today: string, isZh: boolean): string {
  const days = Math.max(0, Math.floor((dateToUtc(today) - dueTimestamp(item)) / DAY_MS));
  return isZh ? `逾期 ${days} 天` : `${days}d overdue`;
}

function formatTimeRange(item: CalendarWorkspaceItem, language: 'zh' | 'en'): string {
  const formatter = new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const start = formatter.format(new Date(item.start));
  const end = item.end ? formatter.format(new Date(item.end)) : '';
  return end ? `${start}–${end}` : start;
}

function jobKindLabel(kind: string, isZh: boolean): string {
  const labels: Record<string, [string, string]> = {
    source_analysis: ['内容分析', 'Content analysis'],
    transcription: ['会议转写', 'Transcription'],
    calendar_sync: ['日历同步', 'Calendar sync'],
    import: ['资料导入', 'Import'],
  };
  return labels[kind]?.[isZh ? 0 : 1] ?? kind.replaceAll('_', ' ');
}

function addDaysToDate(date: string, days: number): string {
  return new Date(dateToUtc(date) + days * DAY_MS).toISOString().slice(0, 10);
}

function dateToUtc(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

function localDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
