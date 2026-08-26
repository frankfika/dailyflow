import type { V2Repository } from '../../repositories/v2/repository.js';
import { EventOperatorRunSchema, type EventOperatorRun } from '../../domain/v2/eventOperator.js';
import { transition } from '../../domain/v2/eventRuntimeState.js';

export interface RecoveryResult {
  run: EventOperatorRun;
  action: 'none' | 'resume_review' | 'completed_apply' | 'marked_retryable_failed';
}

/**
 * Reconcile durable Runs after an application/process restart. No runtime
 * session is assumed resumable unless the caller explicitly proves it.
 */
export async function recoverEventOperatorRuns(
  repo: V2Repository,
  options: { resumableRuntimeSessionIds?: ReadonlySet<string> } = {},
): Promise<RecoveryResult[]> {
  const candidates = (await repo.listEventOperatorRuns())
    .filter((run) => ['starting', 'running', 'waiting_review', 'applying'].includes(run.status));
  const results: RecoveryResult[] = [];
  for (const run of candidates) {
    if (run.status === 'waiting_review') {
      results.push({ run, action: 'resume_review' });
      continue;
    }
    if (run.status === 'applying') {
      const proposal = run.proposalId ? await repo.getEventGraphProposal(run.proposalId) : null;
      if (proposal?.status === 'accepted' && proposal.applyReceipt) {
        const succeeded = await persistRecovery(repo, run, 'succeeded');
        results.push({ run: succeeded, action: 'completed_apply' });
      } else {
        const failed = await persistRecovery(repo, run, 'failed', {
          code: 'APPLY_RECOVERY_REQUIRED',
          message: 'The application stopped during Proposal apply. The durable receipt was incomplete; retry the reviewed Proposal.',
          retryable: true,
          stage: 'review',
        });
        results.push({ run: failed, action: 'marked_retryable_failed' });
      }
      continue;
    }
    const resumable = Boolean(run.runtimeSessionId && options.resumableRuntimeSessionIds?.has(run.runtimeSessionId));
    if (resumable) {
      results.push({ run, action: 'none' });
      continue;
    }
    const failed = await persistRecovery(repo, run, 'failed', {
      code: 'RUNTIME_SESSION_LOST',
      message: 'The runtime session could not be resumed after restart. Retry the Run to start a new session.',
      retryable: true,
      stage: run.phase,
    });
    results.push({ run: failed, action: 'marked_retryable_failed' });
  }
  return results;
}

export async function prepareEventOperatorRunRetry(repo: V2Repository, runId: string): Promise<EventOperatorRun | null> {
  const run = await repo.getEventOperatorRun(runId);
  if (!run) return null;
  if (run.status !== 'failed' || !run.error?.retryable) {
    throw Object.assign(new Error('Only retryable failed Runs can be retried.'), { code: 'run_not_retryable' });
  }
  transition('failed', 'queued');
  const updated = EventOperatorRunSchema.parse({
    ...run,
    status: 'queued',
    phase: 'collect',
    runtimeSessionId: undefined,
    proposalId: undefined,
    error: undefined,
    lastEventCursor: undefined,
    metrics: { modelRequests: 0, toolCalls: 0 },
    updatedAt: new Date().toISOString(),
  });
  await repo.saveEventOperatorRun(updated, {
    auditKind: 'event_run.update',
    auditActor: 'user',
    auditEntity: { type: 'event_operator_run', id: run.id },
    auditData: { event: 'run.retry.queued' },
  });
  return updated;
}

async function persistRecovery(
  repo: V2Repository,
  run: EventOperatorRun,
  status: 'succeeded' | 'failed',
  error?: EventOperatorRun['error'],
): Promise<EventOperatorRun> {
  transition(run.status, status);
  const now = new Date().toISOString();
  const startedAt = run.metrics.startedAt;
  const durationMs = startedAt ? Math.max(0, Date.parse(now) - Date.parse(startedAt)) : run.metrics.durationMs;
  const updated = EventOperatorRunSchema.parse({
    ...run,
    status,
    error,
    metrics: { ...run.metrics, finishedAt: now, durationMs },
    updatedAt: now,
  });
  await repo.saveEventOperatorRun(updated, {
    auditKind: 'event_run.update',
    auditActor: 'system',
    auditEntity: { type: 'event_operator_run', id: run.id },
    auditData: { event: 'run.recovered', from: run.status, to: status, errorCode: error?.code },
  });
  return updated;
}
