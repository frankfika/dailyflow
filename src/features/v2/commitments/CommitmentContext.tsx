/**
 * CommitmentContext — inline detail panel for a single commitment.
 *
 * Spec §7.5 / §26 step 10: a Commitment detail page must surface
 *   - current state
 *   - next action
 *   - why it matters (related Decisions + Evidence)
 *   - related source context
 *   - executable actions (Wait, Complete, Resume, Cancel)
 *
 * The component fetches /memory/context?commitmentId=X and renders
 * the result. It does not modify the commitment directly — actions
 * are explicit buttons that hit the existing /commitments/:id/* APIs.
 */
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getContext,
  waitOnCommitment,
  resumeCommitment,
  completeCommitment,
  cancelCommitment,
  V2ApiError,
  type Commitment,
} from '../api/client';
import { Card, Button, Badge, StateView } from '../components/States';
import { queryKeys } from '../../../queryKeys';
import { useWorkspaceScope } from '../../../workspaceScope';

export function CommitmentContext({
  commitmentId,
  onChanged,
  onClose,
}: {
  commitmentId: string;
  onChanged?: () => void;
  onClose?: () => void;
}) {
  const qc = useQueryClient();
  const workspaceId = useWorkspaceScope();
  const ctx = useQuery({
    queryKey: queryKeys.commitment(workspaceId, commitmentId),
    queryFn: () => getContext(commitmentId),
  });

  const waitMut = useMutation({
    mutationFn: (body: { waitingOnText: string; reviewAt: string }) =>
      waitOnCommitment(commitmentId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.commitment(workspaceId, commitmentId) });
      qc.invalidateQueries({ queryKey: queryKeys.commitmentsRoot(workspaceId) });
      onChanged?.();
    },
  });
  const resumeMut = useMutation({
    mutationFn: () => resumeCommitment(commitmentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.commitment(workspaceId, commitmentId) });
      qc.invalidateQueries({ queryKey: queryKeys.commitmentsRoot(workspaceId) });
      onChanged?.();
    },
  });
  const completeMut = useMutation({
    mutationFn: (body: { outcomeKind: string; outcomeSummary: string }) =>
      completeCommitment(commitmentId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.commitment(workspaceId, commitmentId) });
      qc.invalidateQueries({ queryKey: queryKeys.commitmentsRoot(workspaceId) });
      onChanged?.();
    },
  });
  const cancelMut = useMutation({
    mutationFn: () => cancelCommitment(commitmentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.commitment(workspaceId, commitmentId) });
      qc.invalidateQueries({ queryKey: queryKeys.commitmentsRoot(workspaceId) });
      onChanged?.();
    },
  });

  const c = ctx.data?.commitment;
  return (
    <Card>
      {ctx.isLoading ? (
        <div className="text-sm text-[var(--color-text-muted)]">加载中…</div>
      ) : ctx.error ? (
        <div className="text-sm text-red-600">{(ctx.error as V2ApiError).message ?? '加载失败'}</div>
      ) : !c ? (
        <div className="text-sm text-[var(--color-text-muted)]">未找到</div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={stateTone(c.state)}>{c.state}</Badge>
                {c.importance && <Badge tone="info">{c.importance}</Badge>}
                {c.dueAt && (
                  <span className="text-xs text-[var(--color-text-muted)]">
                    截止 {new Date(c.dueAt).toLocaleDateString()}
                  </span>
                )}
              </div>
              <div className="mt-1 text-base font-medium">{c.title}</div>
              <div className="text-xs text-[var(--color-text-muted)]">{c.outcome}</div>
            </div>
            {onClose && (
              <Button size="sm" variant="ghost" onClick={onClose}>关闭</Button>
            )}
          </div>

          {/* Next Action */}
          {c.nextAction && (
            <div className="rounded-md border border-[var(--color-border)] p-2 text-sm">
              <div className="text-xs font-medium text-[var(--color-text-muted)]">Next Action</div>
              <div>{c.nextAction}</div>
            </div>
          )}

          {/* Why / Decisions */}
          {ctx.data!.related.decisions.length > 0 && (
            <div className="rounded-md border border-[var(--color-border)] p-2 text-sm">
              <div className="text-xs font-medium text-[var(--color-text-muted)]">相关决定（为什么这件事存在）</div>
              <ul className="mt-1 flex flex-col gap-1">
                {ctx.data!.related.decisions.map(d => (
                  <li key={d.id} className="text-xs">
                    <div className="font-medium">{d.title}</div>
                    <div className="italic text-[var(--color-text-muted)]">{d.decision}</div>
                    {d.rationale && <div className="text-[10px] text-[var(--color-text-muted)]">理由：{d.rationale}</div>}
                    <div className="text-[10px] text-[var(--color-text-muted)]">
                      决定于 {new Date(d.decidedAt).toLocaleString()}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Evidence */}
          {ctx.data!.related.evidence.length > 0 && (
            <div className="rounded-md border border-[var(--color-border)] p-2 text-sm">
              <div className="text-xs font-medium text-[var(--color-text-muted)]">Evidence</div>
              <ul className="mt-1 flex flex-col gap-1">
                {ctx.data!.related.evidence.map(e => (
                  <li key={e.id} className="text-xs">
                    <div className="italic">"{e.quote}"</div>
                    <div className="text-[10px] text-[var(--color-text-muted)]">
                      source: {e.sourceId} · ev: {e.id}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Source items */}
          {ctx.data!.related.sourceItems.length > 0 && (
            <div className="rounded-md border border-[var(--color-border)] p-2 text-sm">
              <div className="text-xs font-medium text-[var(--color-text-muted)]">来源材料</div>
              <ul className="mt-1 flex flex-col gap-1">
                {ctx.data!.related.sourceItems.map(s => (
                  <li key={s.id} className="text-xs">
                    <span className="font-medium">{s.title ?? '(untitled)'}</span>
                    <span className="ml-2 text-[var(--color-text-muted)]">{s.kind}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Outcomes */}
          {ctx.data!.related.outcomes.length > 0 && (
            <div className="rounded-md border border-[var(--color-border)] p-2 text-sm">
              <div className="text-xs font-medium text-[var(--color-text-muted)]">已记录的 Outcome</div>
              <ul className="mt-1 flex flex-col gap-1">
                {ctx.data!.related.outcomes.map(o => (
                  <li key={o.id} className="text-xs">
                    <Badge>{o.kind}</Badge>
                    <span className="ml-2">{o.summary}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Actions */}
          <ActionBar
            c={c}
            onWait={async (waitingOnText, reviewAt) => {
              await waitMut.mutateAsync({ waitingOnText, reviewAt });
            }}
            onResume={async () => {
              await resumeMut.mutateAsync();
            }}
            onComplete={async (kind, summary) => {
              await completeMut.mutateAsync({ outcomeKind: kind, outcomeSummary: summary });
            }}
            onCancel={async () => {
              await cancelMut.mutateAsync();
            }}
            busy={waitMut.isPending || resumeMut.isPending || completeMut.isPending || cancelMut.isPending}
          />
        </div>
      )}
    </Card>
  );
}

function stateTone(state: string): 'default' | 'info' | 'success' | 'danger' {
  if (state === 'completed' || state === 'cancelled') return 'success';
  if (state === 'waiting') return 'info';
  if (state === 'active' || state === 'planned') return 'default';
  return 'default';
}

function ActionBar({
  c,
  onWait,
  onResume,
  onComplete,
  onCancel,
  busy,
}: {
  c: Commitment;
  onWait: (waitingOnText: string, reviewAt: string) => Promise<void>;
  onResume: () => Promise<void>;
  onComplete: (kind: string, summary: string) => Promise<void>;
  onCancel: () => Promise<void>;
  busy: boolean;
}) {
  const [showWait, setShowWait] = useState(false);
  const [showComplete, setShowComplete] = useState(false);
  const [waitingOnText, setWaitingOnText] = useState(c.waitingOnText ?? '');
  const [reviewAt, setReviewAt] = useState(
    c.reviewAt ?? new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10)
  );
  const [outcomeKind, setOutcomeKind] = useState('delivered');
  const [outcomeSummary, setOutcomeSummary] = useState('');

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-border)] pt-2">
      {c.state === 'active' || c.state === 'planned' ? (
        <>
          <Button size="sm" disabled={busy} onClick={() => setShowWait(s => !s)}>
            {showWait ? '取消' : '进入 Waiting'}
          </Button>
          <Button size="sm" disabled={busy} onClick={() => setShowComplete(s => !s)}>
            {showComplete ? '取消' : '完成'}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
            取消
          </Button>
        </>
      ) : c.state === 'waiting' ? (
        <Button size="sm" disabled={busy} onClick={onResume}>
          恢复为 Active
        </Button>
      ) : null}

      {showWait && (
        <div className="flex w-full flex-col gap-2 rounded-md border border-[var(--color-border)] p-2 text-xs">
          <input
            value={waitingOnText}
            onChange={e => setWaitingOnText(e.target.value)}
            placeholder="在等谁？"
            className="rounded border border-[var(--color-border)] bg-transparent px-2 py-1"
          />
          <input
            type="date"
            value={reviewAt}
            onChange={e => setReviewAt(e.target.value)}
            className="rounded border border-[var(--color-border)] bg-transparent px-2 py-1"
          />
          <Button
            size="sm"
            disabled={!waitingOnText || busy}
            onClick={async () => {
              await onWait(waitingOnText, new Date(reviewAt).toISOString());
              setShowWait(false);
            }}
          >
            确认
          </Button>
        </div>
      )}

      {showComplete && (
        <div className="flex w-full flex-col gap-2 rounded-md border border-[var(--color-border)] p-2 text-xs">
          <select
            value={outcomeKind}
            onChange={e => setOutcomeKind(e.target.value)}
            className="rounded border border-[var(--color-border)] bg-transparent px-2 py-1"
          >
            <option value="delivered">delivered</option>
            <option value="decided">decided</option>
            <option value="sent">sent</option>
            <option value="confirmed">confirmed</option>
            <option value="failed">failed</option>
            <option value="cancelled">cancelled</option>
          </select>
          <textarea
            value={outcomeSummary}
            onChange={e => setOutcomeSummary(e.target.value)}
            placeholder="实际结果？是否需要后续？"
            className="rounded border border-[var(--color-border)] bg-transparent px-2 py-1"
            rows={3}
          />
          <Button
            size="sm"
            disabled={!outcomeSummary || busy}
            onClick={async () => {
              await onComplete(outcomeKind, outcomeSummary);
              setShowComplete(false);
            }}
          >
            确认完成
          </Button>
        </div>
      )}
    </div>
  );
}
