import { describe, it, expect } from 'vitest';
import {
  validateCommitment,
  canTransitionCommitment,
  assertTransition,
  CommitmentTransitionError,
  rankCandidates,
  pickTopCandidates,
  validatePlan,
} from '../rules';
import type { Commitment, DailyPlan } from '../types';

const baseTime = '2026-07-19T11:00:00+08:00';
const futureReview = '2026-07-22T09:00:00+08:00';
const pastReview = '2026-07-15T09:00:00+08:00';

const baseCommitment: Commitment = {
  id: 'com_01KAAAAAAAAAAAAAAAA',
  schemaVersion: 1,
  createdAt: baseTime,
  updatedAt: baseTime,
  createdBy: 'user',
  workspaceId: 'ws_test',
  title: 'Send updated plan',
  outcome: 'Zhang receives the updated plan.',
  state: 'active',
  evidenceIds: [],
  sourceIds: [],
};

describe('validateCommitment', () => {
  it('rejects empty title', () => {
    const c = { ...baseCommitment, title: '' };
    const issues = validateCommitment(c);
    expect(issues.some(i => i.code === 'title_empty')).toBe(true);
  });

  it('rejects waiting without waitingOnId/Text', () => {
    const c: Commitment = { ...baseCommitment, state: 'waiting' };
    const issues = validateCommitment(c);
    expect(issues.some(i => i.code === 'waiting_missing_target')).toBe(true);
  });

  it('rejects waiting without reviewAt', () => {
    const c: Commitment = { ...baseCommitment, state: 'waiting', waitingOnId: 'person_zhang' };
    const issues = validateCommitment(c);
    expect(issues.some(i => i.code === 'waiting_missing_review')).toBe(true);
  });

  it('rejects waiting with reviewAt in the past', () => {
    const c: Commitment = {
      ...baseCommitment,
      state: 'waiting',
      waitingOnId: 'person_zhang',
      reviewAt: pastReview,
    };
    const issues = validateCommitment(c);
    expect(issues.some(i => i.code === 'waiting_review_past')).toBe(true);
  });

  it('accepts a valid waiting commitment', () => {
    const c: Commitment = {
      ...baseCommitment,
      state: 'waiting',
      waitingOnId: 'person_zhang',
      reviewAt: futureReview,
    };
    const issues = validateCommitment(c);
    expect(issues.filter(i => i.severity === 'error')).toHaveLength(0);
  });

  it('rejects completed without completedAt', () => {
    const c: Commitment = { ...baseCommitment, state: 'completed' };
    const issues = validateCommitment(c);
    expect(issues.some(i => i.code === 'completed_missing_at')).toBe(true);
  });

  it('warns when high-importance completed without outcomeId', () => {
    const c: Commitment = {
      ...baseCommitment,
      state: 'completed',
      completedAt: baseTime,
      importance: 'high',
    };
    const issues = validateCommitment(c);
    expect(issues.some(i => i.code === 'completed_missing_outcome' && i.severity === 'warning')).toBe(true);
  });

  it('rejects inferred dueAt without evidence', () => {
    const c: Commitment = {
      ...baseCommitment,
      dueAt: futureReview,
      dueConfidence: 'inferred',
    };
    const issues = validateCommitment(c);
    expect(issues.some(i => i.code === 'due_no_evidence')).toBe(true);
  });

  it('accepts inferred dueAt when evidence is present', () => {
    const c: Commitment = {
      ...baseCommitment,
      dueAt: futureReview,
      dueConfidence: 'inferred',
      evidenceIds: ['ev_01KAAAAAAAAAAAAAAAA'],
    };
    const issues = validateCommitment(c);
    expect(issues.filter(i => i.severity === 'error')).toHaveLength(0);
  });

  it('flags stale commitments (no progress for 14+ days)', () => {
    const longAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const c: Commitment = { ...baseCommitment, lastProgressAt: longAgo };
    const issues = validateCommitment(c);
    expect(issues.some(i => i.code === 'stale_progress' && i.severity === 'warning')).toBe(true);
  });
});

describe('Commitment state transitions', () => {
  it('allows inbox → active', () => {
    expect(canTransitionCommitment('inbox', 'active')).toBe(true);
  });
  it('blocks completed → active (use cancelled or revive explicitly)', () => {
    expect(canTransitionCommitment('completed', 'active')).toBe(false);
  });
  it('allows cancelled → active (revive)', () => {
    expect(canTransitionCommitment('cancelled', 'active')).toBe(true);
  });
  it('blocks archived → anything', () => {
    expect(canTransitionCommitment('archived', 'active')).toBe(false);
  });
  it('assertTransition throws on invalid', () => {
    expect(() => assertTransition('completed', 'active')).toThrow(CommitmentTransitionError);
  });
});

describe('Planner', () => {
  const today = new Date('2026-07-19T00:00:00+08:00');
  const todayPlus3 = new Date('2026-07-22T00:00:00+08:00').toISOString();
  const todayPlus7 = new Date('2026-07-26T00:00:00+08:00').toISOString();
  const yesterday = new Date('2026-07-18T00:00:00+08:00').toISOString();

  function makeC(over: Partial<Commitment>): Commitment {
    return {
      ...baseCommitment,
      id: over.id ?? 'com_' + Math.random().toString(36).slice(2, 8),
      ...over,
    };
  }

  it('rankCandidates filters out waiting/completed/cancelled', () => {
    const cs = [
      makeC({ state: 'active', id: 'a', dueAt: todayPlus3, importance: 'high' }),
      makeC({ state: 'waiting', id: 'b', dueAt: todayPlus3, importance: 'high' }),
      makeC({ state: 'completed', id: 'c', dueAt: todayPlus3, importance: 'high' }),
    ];
    const ranked = rankCandidates(cs, { now: today });
    expect(ranked.map(r => r.commitment.id)).toEqual(['a']);
  });

  it('overdue commitments rank higher than future', () => {
    const overdue = makeC({ state: 'active', id: 'over', dueAt: yesterday, importance: 'high' });
    const future = makeC({ state: 'active', id: 'future', dueAt: todayPlus7, importance: 'high' });
    const ranked = rankCandidates([future, overdue], { now: today });
    expect(ranked[0]!.commitment.id).toBe('over');
  });

  it('pickTopCandidates caps at 1-3 by default', () => {
    const cs = Array.from({ length: 6 }).map((_, i) =>
      makeC({ state: 'active', id: 'c' + i, dueAt: todayPlus3, importance: 'high', effortMinutes: 60 })
    );
    const ranked = rankCandidates(cs, { now: today });
    const top = pickTopCandidates(ranked, { availableMinutes: 480 });
    expect(top.length).toBeLessThanOrEqual(3);
  });

  it('validatePlan blocks waiting items', () => {
    const waiting = makeC({ state: 'waiting', id: 'w', waitingOnId: 'p', reviewAt: futureReview });
    const active = makeC({ state: 'active', id: 'a' });
    const plan: DailyPlan = {
      id: 'plan_01',
      schemaVersion: 1,
      createdAt: baseTime,
      updatedAt: baseTime,
      createdBy: 'ai',
      workspaceId: 'ws_test',
      date: '2026-07-19',
      items: [
        {
          commitmentId: 'w',
          intendedOutcome: 'x',
          suggestedNextAction: 'y',
          reason: 'r',
          rank: 1,
        },
      ],
      deferredCommitmentIds: [],
    };
    const issues = validatePlan(plan, [waiting, active]);
    expect(issues.some(i => i.code === 'plan_includes_waiting')).toBe(true);
  });
});
