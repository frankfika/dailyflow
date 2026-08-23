/**
 * Event Operator Run state machine — pure and table-testable.
 *
 * Spec: docs/DAILYFLOW_2_2_DEEPSEEK_HARNESS_IMPLEMENTATION_PLAN.md §7, DFH-204.
 *
 * Legal arcs:
 *   queued → starting → running → waiting_review → applying → succeeded
 *                          ↘ failed / cancelled         ↘ failed
 *   queued → cancelled (before start)
 *   waiting_review → applying (server bind) ; waiting_review → succeeded
 *                     when the user declines the proposal (run concludes)
 *   running / starting → succeeded: the runtime concluded with nothing to
 *                     propose (a clean, empty completion — not a failure)
 *   failed → queued (retry, only when error.retryable)
 *
 * Terminal states: succeeded, failed, cancelled. A terminal Run is never
 * recovered into `running`.
 */
import type { EventOperatorStatus } from './eventOperator.js';

export const RUN_TERMINAL: ReadonlySet<EventOperatorStatus> = new Set(['succeeded', 'failed', 'cancelled']);

export type RunTransitionError = { code: 'INVALID_TRANSITION'; message: string };

const ALLOWED: Record<EventOperatorStatus, ReadonlySet<EventOperatorStatus>> = {
  queued: new Set(['starting', 'cancelled']),
  starting: new Set(['running', 'failed', 'cancelled', 'succeeded']),
  running: new Set(['waiting_review', 'failed', 'cancelled', 'succeeded']),
  waiting_review: new Set(['applying', 'succeeded', 'failed']),
  applying: new Set(['succeeded', 'failed']),
  succeeded: new Set<'succeeded'>([]),
  failed: new Set(['queued']), // retry only
  cancelled: new Set<'cancelled'>([]),
};

export function canTransition(from: EventOperatorStatus, to: EventOperatorStatus): boolean {
  return ALLOWED[from]?.has(to) ?? false;
}

export function isTerminal(status: EventOperatorStatus): boolean {
  return RUN_TERMINAL.has(status);
}

/** Safe transition. Returns the new status or throws a stable error. */
export function transition(from: EventOperatorStatus, to: EventOperatorStatus): EventOperatorStatus {
  if (canTransition(from, to)) return to;
  throw Object.assign(new Error(`Illegal run status transition ${from} → ${to}`), {
    code: 'INVALID_TRANSITION',
  }) as RunTransitionError;
}

/** Cancel is idempotent: a Run may request cancel from any pre-terminal state. */
export function cancelAllowed(status: EventOperatorStatus): boolean {
  return !isTerminal(status);
}