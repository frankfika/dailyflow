/**
 * Business rules & state machine for v2 entities.
 *
 * These are the *invariants* a Commitment / Outcome / DailyPlan must obey.
 * Spec §11.4:
 *   - state === 'waiting' requires waitingOnId or waitingOnText AND reviewAt.
 *   - state === 'completed' requires completedAt; key commitments also need Outcome.
 *   - dueAt from AI inference must keep dueConfidence='inferred' + Evidence.
 *   - Next Action is not a new Commitment; only follow-up responsibility is.
 *
 * Spec §15.3:
 *   - Waiting / blocked items MUST NOT enter the Today plan.
 *
 * The rules are split into:
 *   - pure: validate a draft before it is persisted (used by services + tests).
 *   - transitions: enumerate legal state changes.
 */
import type { Commitment, CommitmentState, DailyPlan, DailyPlanItem } from './types.js';

// ---------------------------------------------------------------------------
// Commitment invariants
// ---------------------------------------------------------------------------

export interface CommitmentValidationIssue {
  code: string;
  message: string;
  field?: string;
  severity: 'error' | 'warning';
}

const WARNING_THRESHOLDS = {
  /** No progress recorded for N days → Triage warning. */
  staleDays: 14,
};

export function validateCommitment(c: Commitment, now = new Date()): CommitmentValidationIssue[] {
  const issues: CommitmentValidationIssue[] = [];

  if (!c.title || c.title.trim().length === 0) {
    issues.push({ code: 'title_empty', message: 'Commitment title is required.', field: 'title', severity: 'error' });
  }
  if (!c.outcome || c.outcome.trim().length === 0) {
    issues.push({ code: 'outcome_empty', message: 'Commitment outcome is required.', field: 'outcome', severity: 'error' });
  }

  // Spec §11.4: waiting requires waitingOn + reviewAt
  if (c.state === 'waiting') {
    if (!c.waitingOnId && !c.waitingOnText) {
      issues.push({
        code: 'waiting_missing_target',
        message: 'Waiting commitments must specify who or what is being waited on.',
        field: 'waitingOnId',
        severity: 'error',
      });
    }
    if (!c.reviewAt) {
      issues.push({
        code: 'waiting_missing_review',
        message: 'Waiting commitments must schedule a review date.',
        field: 'reviewAt',
        severity: 'error',
      });
    } else if (new Date(c.reviewAt) <= now) {
      issues.push({
        code: 'waiting_review_past',
        message: 'Review date must be in the future.',
        field: 'reviewAt',
        severity: 'error',
      });
    }
  }

  // Spec §11.4: completed requires completedAt; key commitments also need an Outcome.
  if (c.state === 'completed') {
    if (!c.completedAt) {
      issues.push({
        code: 'completed_missing_at',
        message: 'Completed commitments must record a completedAt timestamp.',
        field: 'completedAt',
        severity: 'error',
      });
    }
    if (c.importance === 'critical' || c.importance === 'high') {
      if (!c.outcomeId) {
        issues.push({
          code: 'completed_missing_outcome',
          message: 'High-importance commitments require an Outcome record before completion.',
          field: 'outcomeId',
          severity: 'warning',
        });
      }
    }
  }

  // dueAt inferred must carry confidence + at least one evidence
  if (c.dueAt && c.dueConfidence === 'inferred' && (!c.evidenceIds || c.evidenceIds.length === 0)) {
    issues.push({
      code: 'due_no_evidence',
      message: 'Inferred due dates must reference at least one Evidence.',
      field: 'evidenceIds',
      severity: 'error',
    });
  }

  // Staleness — soft warning, never blocking
  if (c.lastProgressAt) {
    const daysSince = (now.getTime() - new Date(c.lastProgressAt).getTime()) / 86_400_000;
    if (daysSince > WARNING_THRESHOLDS.staleDays && c.state !== 'completed' && c.state !== 'cancelled') {
      issues.push({
        code: 'stale_progress',
        message: `No progress recorded for ${Math.floor(daysSince)} days.`,
        severity: 'warning',
      });
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// State transitions
// ---------------------------------------------------------------------------

/** Allowed Commitment state transitions. */
const COMMITMENT_TRANSITIONS: Record<CommitmentState, CommitmentState[]> = {
  inbox: ['active', 'planned', 'waiting', 'someday', 'cancelled', 'archived'],
  active: ['planned', 'waiting', 'someday', 'completed', 'cancelled', 'archived'],
  planned: ['active', 'waiting', 'someday', 'completed', 'cancelled', 'archived'],
  waiting: ['active', 'someday', 'completed', 'cancelled', 'archived'],
  someday: ['active', 'planned', 'waiting', 'cancelled', 'archived'],
  completed: ['archived'],
  cancelled: ['archived', 'active'], // revive is allowed
  archived: [], // terminal
};

export function canTransitionCommitment(from: CommitmentState, to: CommitmentState): boolean {
  if (from === to) return true;
  return COMMITMENT_TRANSITIONS[from].includes(to);
}

export class CommitmentTransitionError extends Error {
  code = 'invalid_transition';
  constructor(public from: CommitmentState, public to: CommitmentState) {
    super(`Cannot transition Commitment from "${from}" to "${to}"`);
  }
}

export function assertTransition(from: CommitmentState, to: CommitmentState): void {
  if (!canTransitionCommitment(from, to)) {
    throw new CommitmentTransitionError(from, to);
  }
}

// ---------------------------------------------------------------------------
// DailyPlan — Waiting must not be planned
// ---------------------------------------------------------------------------

export interface PlanValidationIssue {
  code: string;
  message: string;
  field?: string;
}

export function validatePlan(plan: DailyPlan, commitments: Commitment[]): PlanValidationIssue[] {
  const issues: PlanValidationIssue[] = [];
  const byId = new Map(commitments.map(c => [c.id, c]));

  for (const item of plan.items) {
    const c = byId.get(item.commitmentId);
    if (!c) {
      issues.push({
        code: 'plan_orphan',
        message: `Plan references missing commitment ${item.commitmentId}`,
        field: 'items',
      });
      continue;
    }
    if (c.state === 'waiting') {
      issues.push({
        code: 'plan_includes_waiting',
        message: `Waiting commitment "${c.title}" must not appear in today's plan.`,
        field: 'items',
      });
    }
    if (c.state === 'completed' || c.state === 'cancelled' || c.state === 'archived') {
      issues.push({
        code: 'plan_includes_terminal',
        message: `Terminal commitment "${c.title}" must not appear in today's plan.`,
        field: 'items',
      });
    }
  }

  // Capacity check
  if (plan.availableMinutes !== undefined) {
    const totalPlanned = plan.items.reduce((s, i) => s + (i.plannedMinutes ?? 0), 0);
    if (totalPlanned > plan.availableMinutes * 1.2) {
      issues.push({
        code: 'plan_over_capacity',
        message: `Planned minutes (${totalPlanned}) exceed 120% of available (${plan.availableMinutes}).`,
        field: 'availableMinutes',
      });
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Item ranking — used by Planner fallback (spec §15.3 baseline scoring)
// ---------------------------------------------------------------------------

export interface PlanCandidate {
  commitment: Commitment;
  score: number;
  reason: string;
}

export function rankCandidates(
  commitments: Commitment[],
  options: {
    availableMinutes?: number;
    now?: Date;
    blockedIds?: Set<string>;
  } = {}
): PlanCandidate[] {
  const now = options.now ?? new Date();
  const blocked = options.blockedIds ?? new Set<string>();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const dayMs = 86_400_000;

  return commitments
    .filter(c => {
      if (c.state !== 'active' && c.state !== 'planned' && c.state !== 'inbox') return false;
      if (blocked.has(c.id)) return false;
      return true;
    })
    .map<PlanCandidate>(c => {
      let urgency = 0;
      if (c.dueAt) {
        const days = (new Date(c.dueAt).getTime() - today.getTime()) / dayMs;
        if (days < 0) urgency += 80 + Math.min(40, -days * 4);
        else urgency += Math.max(0, 60 - days * 4);
      } else {
        urgency += 5;
      }

      const impact =
        c.importance === 'critical' ? 70 : c.importance === 'high' ? 45 : c.importance === 'low' ? 5 : 20;

      const risk = c.state === 'inbox' ? 5 : 0;
      const unblock = 0; // filled by follow-up graph in later phases
      const staleness = c.lastProgressAt
        ? Math.min(30, Math.max(0, ((today.getTime() - new Date(c.lastProgressAt).getTime()) / dayMs) * 2))
        : 5;

      const effort = c.effortMinutes ?? 60;
      const effortMismatch = options.availableMinutes
        ? Math.max(0, effort - options.availableMinutes) * 0.4
        : 0;

      const score = Math.round(urgency + impact + risk + unblock + staleness - effortMismatch);
      return {
        commitment: c,
        score,
        reason: buildReason(c, urgency, impact, staleness, today, dayMs),
      };
    })
    .sort((a, b) => b.score - a.score);
}

function buildReason(
  c: Commitment,
  urgency: number,
  impact: number,
  staleness: number,
  today: Date,
  dayMs: number
): string {
  const parts: string[] = [];
  if (c.dueAt) {
    const days = Math.round((new Date(c.dueAt).getTime() - today.getTime()) / dayMs);
    if (days < 0) parts.push(`overdue by ${-days}d`);
    else if (days === 0) parts.push('due today');
    else parts.push(`due in ${days}d`);
  }
  if (c.importance === 'critical' || c.importance === 'high') parts.push(`${c.importance} importance`);
  if (staleness > 15) parts.push(`stale (${Math.floor(staleness)}d)`);
  if (impact > 40) parts.push('high impact');
  if (parts.length === 0) parts.push('available');
  return parts.join(', ');
}

export function pickTopCandidates(
  candidates: PlanCandidate[],
  options: { availableMinutes?: number; maxItems?: number } = {}
): DailyPlanItem[] {
  const maxItems = options.maxItems ?? 3;
  const out: DailyPlanItem[] = [];
  let remaining = options.availableMinutes ?? Infinity;
  for (const c of candidates) {
    if (out.length >= maxItems) break;
    const planned = Math.min(c.commitment.effortMinutes ?? 60, Number.isFinite(remaining) ? remaining : 60);
    out.push({
      commitmentId: c.commitment.id,
      intendedOutcome: c.commitment.outcome,
      suggestedNextAction: c.commitment.nextAction ?? `Take the next concrete step on "${c.commitment.title}".`,
      plannedMinutes: planned,
      reason: c.reason,
      rank: out.length + 1,
    });
    if (Number.isFinite(remaining)) remaining -= planned;
    if (remaining <= 0) break;
  }
  return out;
}
