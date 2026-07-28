/**
 * Reviewer view (Phase 7).
 *
 * Spec §3.4 / F-08 / F-10: weekly review + stale commitment triage +
 * waiting overdue. The view is intentionally review-oriented; the user
 * takes explicit action on each item.
 */
import React from 'react';
import { useQuery } from '@tanstack/react-query';

export interface StaleItem {
  commitmentId: string;
  title: string;
  daysSinceProgress: number;
  reason: string;
  suggestions: Array<{ op: string; to?: string; reason: string }>;
}

export interface WaitingOverdueItem {
  commitmentId: string;
  title: string;
  waitingOn: string;
  reviewAt: string;
  daysOverdue: number;
}

export interface WeeklyReview {
  closedOutcomes: Array<{ commitmentId: string; title: string; completedAt: string }>;
  stillOpenCommitments: number;
  waitingOverdue: WaitingOverdueItem[];
  staleCommitments: StaleItem[];
  projectsAtRisk: Array<{ projectId: string; name: string; reason: string }>;
  decisionsThisWeek: number;
  suggestions: string[];
}

import { Card, Badge, StateView } from '../components/States';

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(`/api/v2${url}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export function ReviewView() {
  const stale = useQuery({ queryKey: ['v2-stale'], queryFn: () => getJson<{ items: StaleItem[] }>('/review/stale') });
  const overdue = useQuery({ queryKey: ['v2-overdue'], queryFn: () => getJson<{ items: WaitingOverdueItem[] }>('/review/waiting-overdue') });
  const weekly = useQuery({ queryKey: ['v2-weekly'], queryFn: () => getJson<WeeklyReview>('/review/weekly') });

  return (
    <div className="flex flex-col gap-4 p-4">
      <Card>
        <div className="text-sm font-medium">本周回顾</div>
        {weekly.isLoading ? (
          <div className="text-sm text-[var(--color-text-muted)]">加载中…</div>
        ) : weekly.error ? (
          <div className="text-xs text-red-600">{(weekly.error as Error).message}</div>
        ) : weekly.data && (
          <div className="mt-2 flex flex-col gap-2 text-sm">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <Stat label="完成 Outcomes" value={weekly.data.closedOutcomes.length} />
              <Stat label="进行中" value={weekly.data.stillOpenCommitments} />
              <Stat label="超期 Waiting" value={weekly.data.waitingOverdue.length} />
              <Stat label="新决定" value={weekly.data.decisionsThisWeek} />
            </div>
            {weekly.data.suggestions.length > 0 && (
              <ul className="list-disc pl-5 text-xs text-[var(--color-text-muted)]">
                {weekly.data.suggestions.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            )}
            {weekly.data.closedOutcomes.length > 0 && (
              <div>
                <div className="text-xs font-medium">本周闭环</div>
                <ul className="list-disc pl-5 text-xs">
                  {weekly.data.closedOutcomes.map(c => <li key={c.commitmentId}>{c.title}</li>)}
                </ul>
              </div>
            )}
            {weekly.data.projectsAtRisk.length > 0 && (
              <div>
                <div className="text-xs font-medium text-amber-600">项目风险</div>
                <ul className="list-disc pl-5 text-xs">
                  {weekly.data.projectsAtRisk.map(p => <li key={p.projectId}>{p.name} — {p.reason}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </Card>

      <Card>
        <div className="text-sm font-medium">陈旧 Commitment（{stale.data?.items.length ?? 0}）</div>
        {stale.isLoading ? (
          <div className="text-sm text-[var(--color-text-muted)]">加载中…</div>
        ) : stale.error ? (
          <div className="text-xs text-red-600">{(stale.error as Error).message}</div>
        ) : (stale.data?.items.length ?? 0) === 0 ? (
          <div className="text-sm text-[var(--color-text-muted)]">没有超过 14 天未推进的 Commitment。</div>
        ) : (
          <ul className="mt-1 flex flex-col gap-1">
            {stale.data!.items.map(s => (
              <li key={s.commitmentId} className="rounded-md border border-[var(--color-border)] p-2 text-xs">
                <div className="flex items-center gap-2">
                  <Badge tone="warning">{s.daysSinceProgress}d</Badge>
                  <span className="font-medium">{s.title}</span>
                </div>
                <div className="text-[10px] text-[var(--color-text-muted)]">{s.reason}</div>
                {s.suggestions.length > 0 && (
                  <ul className="mt-1 list-disc pl-4 text-[10px]">
                    {s.suggestions.map((sg, i) => <li key={i}>{sg.reason}</li>)}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <div className="text-sm font-medium">超期 Waiting（{overdue.data?.items.length ?? 0}）</div>
        <StateView
          loading={overdue.isLoading}
          error={overdue.error ? { message: (overdue.error as Error).message } : null}
          empty={overdue.data?.items.length === 0}
          emptyTitle="没有超期的 Waiting"
        >
          <ul className="mt-1 flex flex-col gap-1">
            {(overdue.data?.items ?? []).map(o => (
              <li key={o.commitmentId} className="rounded-md border border-[var(--color-border)] p-2 text-xs">
                <div className="flex items-center gap-2">
                  <Badge tone="danger">+{o.daysOverdue}d</Badge>
                  <span className="font-medium">{o.title}</span>
                </div>
                <div className="text-[10px] text-[var(--color-text-muted)]">在等 {o.waitingOn}</div>
              </li>
            ))}
          </ul>
        </StateView>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-[var(--color-border)] p-2">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-[var(--color-text-muted)]">{label}</div>
    </div>
  );
}
