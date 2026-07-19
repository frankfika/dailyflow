/**
 * Today v2 — Morning Brief + Focus + Waiting + Replan.
 *
 * Spec §7.2: Today answers four questions:
 *   1. What is most worth pushing forward today?
 *   2. Why these?
 *   3. What's the first step?
 *   4. What changed and needs a re-decision?
 *
 * The view shows: a morning brief (commitments due soon / at risk),
 * the active plan for today, the waiting list, and a "replan with
 * natural language" affordance.
 */
import React, { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  generatePlan,
  acceptPlan,
  getPlan,
  listCommitments,
  waitOnCommitment,
  resumeCommitment,
  completeCommitment,
  replan,
  getWaitingOverdue,
  V2ApiError,
  type DailyPlan,
  type Commitment,
  type WaitingOverdueItem,
} from '../api/client';
import { Card, Button, Badge, StateView } from '../components/States';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function TodayView() {
  const today = useMemo(() => todayStr(), []);
  const qc = useQueryClient();
  const plan = useQuery({
    queryKey: ['v2-plan', today],
    queryFn: () => getPlan(today),
  });
  const commitments = useQuery({
    queryKey: ['v2-commitments'],
    queryFn: () => listCommitments(),
  });

  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['v2-plan'] });
    qc.invalidateQueries({ queryKey: ['v2-commitments'] });
  }, [qc]);

  const generate = useMutation({
    mutationFn: () => generatePlan({ date: today }),
    onSuccess: () => refresh(),
  });
  const accept = useMutation({
    mutationFn: (id: string) => acceptPlan(id),
    onSuccess: () => refresh(),
  });
  const replanMut = useMutation({
    mutationFn: (brief: string) => replan(today, { brief }),
    onSuccess: () => refresh(),
  });

  const allCommitments = commitments.data?.items ?? [];
  const waiting = allCommitments.filter(c => c.state === 'waiting');
  const completedRecently = allCommitments.filter(c => c.state === 'completed');
  const overdue = allCommitments.filter(
    c => c.dueAt && c.state !== 'completed' && c.state !== 'cancelled' && new Date(c.dueAt) < new Date()
  );

  // Spec §26 step 12: surface overdue waiting items so the user can
  // review them. The system must NOT auto-resume or auto-send.
  const overdueWaiting = useQuery({
    queryKey: ['v2-waiting-overdue'],
    queryFn: () => getWaitingOverdue(),
  });

  return (
    <div className="flex flex-col gap-4 p-4">
      <MorningBrief
        overdue={overdue}
        waiting={waiting}
        completedRecently={completedRecently}
        onRefresh={refresh}
      />

      {overdueWaiting.data && overdueWaiting.data.items.length > 0 && (
        <OverdueWaitingSection
          items={overdueWaiting.data.items}
          onResume={async (id) => {
            await resumeCommitment(id);
            refresh();
            overdueWaiting.refetch();
          }}
          onChanged={() => {
            refresh();
            overdueWaiting.refetch();
          }}
        />
      )}

      <ReplanBar
        loading={replanMut.isPending}
        onReplan={brief => replanMut.mutate(brief)}
        onQuickReplan={mins => replanMut.mutate(`Only ${mins} minutes available today`)}
      />

      <PlanSection
        plan={plan.data?.plan ?? null}
        loading={plan.isLoading || generate.isPending || replanMut.isPending}
        error={plan.error || generate.error || replanMut.error
          ? { code: 'plan', message: (plan.error || generate.error || replanMut.error) instanceof Error ? (plan.error || generate.error || replanMut.error as Error).message : 'Failed' }
          : null}
        onGenerate={() => generate.mutate()}
        onAccept={(id) => accept.mutate(id)}
        onChanged={refresh}
        commitmentsById={Object.fromEntries(allCommitments.map(c => [c.id, c]))}
      />

      <WaitingSection waiting={waiting} onChanged={refresh} />

      <DoneTodaySection completed={completedRecently} />
    </div>
  );
}

function MorningBrief({
  overdue,
  waiting,
  completedRecently,
  onRefresh,
}: {
  overdue: Commitment[];
  waiting: Commitment[];
  completedRecently: Commitment[];
  onRefresh: () => void;
}) {
  const today = new Date();
  const dueToday = overdue.filter(c => {
    const d = new Date(c.dueAt!);
    return d.toDateString() === today.toDateString();
  });
  return (
    <Card>
      <div className="flex flex-col gap-2">
        <div className="text-sm font-medium">Morning Brief</div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <BriefStat
            label="今天到期 / 已超期"
            value={dueToday.length + overdue.length}
            tone={overdue.length > 0 ? 'danger' : 'default'}
            items={overdue.slice(0, 3).map(c => c.title)}
          />
          <BriefStat
            label="等待中"
            value={waiting.length}
            tone="info"
            items={waiting.slice(0, 3).map(c => `${c.title}（${c.waitingOnText ?? c.waitingOnId ?? '?'}）`)}
          />
          <BriefStat
            label="最近完成"
            value={completedRecently.length}
            tone="success"
            items={completedRecently.slice(0, 3).map(c => c.title)}
          />
        </div>
        <div className="text-xs text-[var(--color-text-muted)]">
          没有连接日历时，这些数字来自你手动记录的内容；不会假装"我看过你的日历"。
        </div>
      </div>
    </Card>
  );
}

function BriefStat({
  label,
  value,
  tone,
  items,
}: {
  label: string;
  value: number;
  tone: 'default' | 'success' | 'info' | 'danger';
  items: string[];
}) {
  return (
    <div className="rounded-md border border-[var(--color-border)] p-2">
      <div className="flex items-center gap-2">
        <Badge tone={tone}>{value}</Badge>
        <div className="text-xs text-[var(--color-text-muted)]">{label}</div>
      </div>
      {items.length > 0 && (
        <ul className="mt-1 list-disc pl-4 text-xs text-[var(--color-text)]">
          {items.map((s, i) => <li key={i} className="truncate">{s}</li>)}
        </ul>
      )}
    </div>
  );
}

function ReplanBar({
  loading,
  onReplan,
  onQuickReplan,
}: {
  loading: boolean;
  onReplan: (brief: string) => void;
  onQuickReplan: (mins: number) => void;
}) {
  const [brief, setBrief] = useState('');
  return (
    <Card>
      <div className="flex flex-col gap-2">
        <div className="text-sm font-medium">重新规划（自然语言）</div>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={brief}
            onChange={e => setBrief(e.target.value)}
            placeholder='例如："下午只剩两小时" / "今天不做，客户那件先"'
            className="min-w-0 flex-1 rounded-lg border border-[var(--color-border)] bg-transparent px-3 py-1.5 text-sm"
          />
          <Button onClick={() => onReplan(brief)} disabled={loading || !brief.trim()}>
            Re-plan
          </Button>
        </div>
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="ghost" onClick={() => onQuickReplan(60)} disabled={loading}>只剩 1 小时</Button>
          <Button size="sm" variant="ghost" onClick={() => onQuickReplan(120)} disabled={loading}>只剩 2 小时</Button>
          <Button size="sm" variant="ghost" onClick={() => onQuickReplan(240)} disabled={loading}>半天</Button>
        </div>
      </div>
    </Card>
  );
}

function PlanSection({
  plan,
  loading,
  error,
  onGenerate,
  onAccept,
  onChanged,
  commitmentsById,
}: {
  plan: DailyPlan | null;
  loading: boolean;
  error: { code?: string; message: string } | null;
  onGenerate: () => void;
  onAccept: (id: string) => void;
  onChanged: () => void;
  commitmentsById: Record<string, Commitment>;
}) {
  if (error) return <Card><div className="text-sm text-red-600">{error.message}</div></Card>;
  if (loading) {
    return <Card><div className="text-sm text-[var(--color-text-muted)]">生成计划中…</div></Card>;
  }
  if (!plan) {
    return (
      <Card>
        <div className="flex flex-col gap-2">
          <div className="text-sm text-[var(--color-text-muted)]">
            今天还没有可信计划。生成一份，或先把事情放进 Inbox。
          </div>
          <div>
            <Button onClick={onGenerate}>生成今日计划</Button>
          </div>
        </div>
      </Card>
    );
  }
  return (
    <Card>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Focus</div>
          <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
            {plan.availableMinutes && <Badge tone="info">{plan.availableMinutes}m 可用</Badge>}
            {plan.constraintSummary && <span>「{plan.constraintSummary}」</span>}
            {plan.acceptedAt && <Badge tone="success">已接受</Badge>}
          </div>
        </div>
        {plan.items.length === 0 ? (
          <div className="text-sm text-[var(--color-text-muted)]">
            没有可推进的事项。Inbox 里可能还有等待处理的内容。
          </div>
        ) : (
          <ol className="flex flex-col gap-2">
            {plan.items.map(item => {
              const c = commitmentsById[item.commitmentId];
              return (
                <li key={item.commitmentId} className="rounded-md border border-[var(--color-border)] p-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge>#{item.rank}</Badge>
                      <span className="font-medium">{c?.title ?? item.commitmentId}</span>
                    </div>
                    {item.plannedMinutes && (
                      <Badge tone="info">{item.plannedMinutes}m</Badge>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-[var(--color-text-muted)]">
                    <span className="font-medium">目标：</span> {item.intendedOutcome}
                  </div>
                  <div className="text-xs text-[var(--color-text-muted)]">
                    <span className="font-medium">下一步：</span> {item.suggestedNextAction}
                  </div>
                  <div className="text-xs text-[var(--color-text-muted)]">
                    <span className="font-medium">原因：</span> {item.reason}
                  </div>
                  {c && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => completeCommitment(c.id, {
                          outcomeKind: 'delivered',
                          outcomeSummary: item.suggestedNextAction,
                        })}
                      >
                        完成（记录 Outcome）
                      </Button>
                      <WaitButton commitment={c} onChanged={onChanged} />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        {!plan.acceptedAt && plan.items.length > 0 && (
          <div className="flex justify-end">
            <Button onClick={() => onAccept(plan.id)}>接受今日计划</Button>
          </div>
        )}
      </div>
    </Card>
  );
}

function WaitButton({ commitment, onChanged }: { commitment: Commitment; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [waitingOn, setWaitingOn] = useState('');
  const [reviewAt, setReviewAt] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toISOString().slice(0, 10);
  });

  const wait = useMutation({
    mutationFn: () => waitOnCommitment(commitment.id, {
      waitingOnText: waitingOn,
      reviewAt: new Date(reviewAt + 'T09:00:00').toISOString(),
    }),
    onSuccess: () => {
      setOpen(false);
      setWaitingOn('');
      onChanged();
    },
  });

  if (!open) {
    return <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>设置等待</Button>;
  }
  return (
    <div className="flex w-full flex-col gap-1 rounded border border-[var(--color-border)] p-2 text-xs">
      <input
        type="text"
        value={waitingOn}
        onChange={e => setWaitingOn(e.target.value)}
        placeholder="在等谁 / 什么？"
        className="rounded border border-[var(--color-border)] bg-transparent px-2 py-1"
      />
      <label className="flex items-center gap-1">
        <span>复查日期</span>
        <input
          type="date"
          value={reviewAt}
          onChange={e => setReviewAt(e.target.value)}
          className="rounded border border-[var(--color-border)] bg-transparent px-1 py-0.5"
        />
      </label>
      <div className="flex justify-end gap-1">
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>取消</Button>
        <Button size="sm" onClick={() => wait.mutate()} disabled={!waitingOn.trim() || wait.isPending}>
          {wait.isPending ? '设置中…' : '确定'}
        </Button>
      </div>
      {wait.error && <div className="text-xs text-red-600">{(wait.error as Error).message}</div>}
    </div>
  );
}

function WaitingSection({ waiting, onChanged }: { waiting: Commitment[]; onChanged: () => void }) {
  if (waiting.length === 0) {
    return (
      <Card>
        <div className="text-sm text-[var(--color-text-muted)]">没有等待中的事项。</div>
      </Card>
    );
  }
  return (
    <Card>
      <div className="flex flex-col gap-2">
        <div className="text-sm font-medium">Waiting</div>
        {waiting.map(c => {
          const reviewAt = c.reviewAt ? new Date(c.reviewAt) : null;
          const overdue = reviewAt && reviewAt < new Date();
          return (
            <div key={c.id} className="flex items-center justify-between rounded-md border border-[var(--color-border)] p-2 text-sm">
              <div>
                <div className="font-medium">{c.title}</div>
                <div className="text-xs text-[var(--color-text-muted)]">
                  在等 {c.waitingOnText ?? c.waitingOnId ?? '?'}
                  {reviewAt && (
                    <> · {overdue ? '已到期' : `${Math.ceil((reviewAt.getTime() - Date.now()) / 86_400_000)} 天后复查`}</>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => resumeCommitment(c.id).then(onChanged)}
              >
                恢复
              </Button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function DoneTodaySection({ completed }: { completed: Commitment[] }) {
  if (completed.length === 0) return null;
  return (
    <Card>
      <div className="text-sm font-medium">最近完成</div>
      <ul className="mt-1 list-disc pl-4 text-xs">
        {completed.slice(0, 5).map(c => (
          <li key={c.id} className="truncate">{c.title}</li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * OverdueWaitingSection — items whose `reviewAt` already passed.
 *
 * Spec §26 step 12: the system must remind the user, but must NOT
 * auto-resume or auto-send messages. The user reviews each item
 * explicitly: resume it, plan a new review, or cancel.
 */
function OverdueWaitingSection({
  items,
  onResume,
  onChanged,
}: {
  items: WaitingOverdueItem[];
  onResume: (id: string) => Promise<void>;
  onChanged: () => void;
}) {
  return (
    <Card>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Badge tone="danger">需复查</Badge>
          <div className="text-sm font-medium">已过复查日的 Waiting</div>
        </div>
        <div className="text-xs text-[var(--color-text-muted)]">
          系统只做提醒；不会自动恢复或发送消息。
        </div>
        <ul className="mt-1 flex flex-col gap-1">
          {items.map(it => (
            <li
              key={it.commitmentId}
              className="flex items-center justify-between rounded-md border border-[var(--color-border)] p-2 text-sm"
            >
              <div>
                <div className="font-medium">{it.title}</div>
                <div className="text-xs text-[var(--color-text-muted)]">
                  在等 {it.waitingOn} · 已超期 {it.daysOverdue} 天（应于 {new Date(it.reviewAt).toLocaleDateString()} 复查）
                </div>
              </div>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onResume(it.commitmentId)}
                >
                  恢复
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <Button size="sm" variant="ghost" onClick={onChanged}>刷新</Button>
      </div>
    </Card>
  );
}
