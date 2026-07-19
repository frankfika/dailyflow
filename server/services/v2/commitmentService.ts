/**
 * Commitment service (DF2-007).
 *
 * Implements the Commitment state machine and the canonical business
 * operations: create, update, transition, wait, resume, complete, cancel.
 *
 * Constraints from spec §11.4:
 *   - waiting requires waitingOnId|waitingOnText AND reviewAt
 *   - completed requires completedAt
 *   - high/critical completed commitments need an Outcome
 *
 * Every mutation goes through:
 *   1. Validate the draft with Zod (Domain).
 *   2. Run business rules (rules.ts).
 *   3. Persist via Repository (atomic write + audit).
 *   4. Update the audit log (kind-specific).
 */
import { z } from 'zod';
import { newId } from '../../domain/v2/ulid.js';
import {
  CommitmentSchema,
  type Commitment,
  type CommitmentState,
  type Outcome,
  type Evidence,
} from '../../domain/v2/types.js';
import {
  validateCommitment,
  assertTransition,
  canTransitionCommitment,
  CommitmentTransitionError,
} from '../../domain/v2/rules.js';
import type { V2Repository } from '../../repositories/v2/repository.js';
import { buildSourceItem, sha256 as _sha } from './captureService.js';

export const CreateCommitmentInputSchema = z.object({
  title: z.string().min(1).max(300),
  outcome: z.string().min(1).max(1000),
  state: z
    .enum(['inbox', 'active', 'planned', 'waiting', 'someday', 'completed', 'cancelled', 'archived'])
    .default('inbox'),
  ownerId: z.string().optional(),
  beneficiaryId: z.string().optional(),
  projectId: z.string().optional(),
  dueAt: z.string().datetime({ offset: true }).optional(),
  dueConfidence: z.enum(['explicit', 'inferred', 'unknown']).optional(),
  importance: z.enum(['critical', 'high', 'normal', 'low']).optional(),
  effortMinutes: z.number().int().positive().max(60 * 24).optional(),
  energy: z.enum(['high', 'medium', 'low']).optional(),
  nextAction: z.string().max(500).optional(),
  waitingOnId: z.string().optional(),
  waitingOnText: z.string().max(200).optional(),
  waitingSince: z.string().datetime({ offset: true }).optional(),
  reviewAt: z.string().datetime({ offset: true }).optional(),
  evidenceIds: z.array(z.string()).default([]),
  sourceIds: z.array(z.string()).default([]),
  tagIds: z.array(z.string()).optional(),
  legacyTaskId: z.string().optional(),
  createdBy: z.enum(['user', 'ai', 'connector', 'migration']).default('user'),
});
export type CreateCommitmentInput = z.infer<typeof CreateCommitmentInputSchema>;

export interface CommitmentServiceError {
  code: string;
  message: string;
  field?: string;
  severity: 'error' | 'warning';
}

export class CommitmentValidationFailed extends Error {
  code = 'commitment_invalid';
  constructor(public issues: CommitmentServiceError[]) {
    super(issues.map(i => `${i.code}: ${i.message}`).join('; '));
  }
}

export async function createCommitment(
  repo: V2Repository,
  workspaceId: string,
  input: CreateCommitmentInput,
  options: { applyAtomic?: boolean; expectedHash?: string } = {}
): Promise<Commitment> {
  // Apply defaults via Zod parse before building the domain draft.
  const parsedInput = CreateCommitmentInputSchema.parse(input);
  const now = new Date().toISOString();
  const draft: Commitment = {
    id: newId('com'),
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    createdBy: parsedInput.createdBy,
    workspaceId,
    title: parsedInput.title,
    outcome: parsedInput.outcome,
    state: parsedInput.state,
    ownerId: parsedInput.ownerId,
    beneficiaryId: parsedInput.beneficiaryId,
    projectId: parsedInput.projectId,
    dueAt: parsedInput.dueAt,
    dueConfidence: parsedInput.dueConfidence,
    importance: parsedInput.importance,
    effortMinutes: parsedInput.effortMinutes,
    energy: parsedInput.energy,
    nextAction: parsedInput.nextAction,
    waitingOnId: parsedInput.waitingOnId,
    waitingOnText: parsedInput.waitingOnText,
    waitingSince: parsedInput.waitingSince,
    reviewAt: parsedInput.reviewAt,
    evidenceIds: parsedInput.evidenceIds,
    sourceIds: parsedInput.sourceIds,
    tagIds: parsedInput.tagIds,
    legacyTaskId: parsedInput.legacyTaskId,
  };

  const issues = validateCommitment(draft);
  const errors = issues.filter(i => i.severity === 'error');
  if (errors.length > 0) {
    throw new CommitmentValidationFailed(errors);
  }

  const validated = CommitmentSchema.parse(draft);
  await repo.saveCommitment(validated, {
    expectedHash: options.expectedHash,
    auditKind: 'commitment.create',
    auditActor: input.createdBy,
    auditEntity: { type: 'commitment', id: validated.id },
    auditData: { state: validated.state, hasDueAt: !!validated.dueAt },
  });
  return validated;
}

export async function updateCommitment(
  repo: V2Repository,
  id: string,
  patch: Partial<CreateCommitmentInput>,
  options: { expectedHash?: string } = {}
): Promise<Commitment> {
  const existing = await repo.getCommitment(id);
  if (!existing) throw new Error('Commitment not found');
  const merged: Commitment = {
    ...existing,
    ...patch,
    evidenceIds: patch.evidenceIds ?? existing.evidenceIds,
    sourceIds: patch.sourceIds ?? existing.sourceIds,
    updatedAt: new Date().toISOString(),
  };
  const issues = validateCommitment(merged);
  if (issues.some(i => i.severity === 'error')) {
    throw new CommitmentValidationFailed(issues);
  }
  const validated = CommitmentSchema.parse(merged);
  await repo.saveCommitment(validated, {
    expectedHash: options.expectedHash,
    auditKind: 'commitment.update',
    auditEntity: { type: 'commitment', id: validated.id },
  });
  return validated;
}

export interface TransitionOptions {
  expectedHash?: string;
  reason?: string;
  outcomeId?: string;
}

export async function transitionCommitment(
  repo: V2Repository,
  id: string,
  to: CommitmentState,
  options: TransitionOptions = {}
): Promise<Commitment> {
  const existing = await repo.getCommitment(id);
  if (!existing) throw new Error('Commitment not found');
  if (!canTransitionCommitment(existing.state, to)) {
    throw new CommitmentTransitionError(existing.state, to);
  }
  const now = new Date().toISOString();
  const merged: Commitment = {
    ...existing,
    state: to,
    updatedAt: now,
  };
  if (to === 'completed') {
    merged.completedAt = now;
    if (options.outcomeId) merged.outcomeId = options.outcomeId;
    merged.lastProgressAt = now;
  } else if (to === 'waiting') {
    merged.waitingSince = existing.waitingSince ?? now;
    merged.reviewAt = existing.reviewAt;
  } else if (to === 'active' || to === 'planned') {
    merged.lastProgressAt = now;
    if (to === 'active') {
      merged.waitingSince = undefined;
      merged.waitingOnId = undefined;
      merged.waitingOnText = undefined;
    }
  }

  const issues = validateCommitment(merged);
  if (issues.some(i => i.severity === 'error')) {
    throw new CommitmentValidationFailed(issues);
  }
  const validated = CommitmentSchema.parse(merged);
  await repo.saveCommitment(validated, {
    expectedHash: options.expectedHash,
    auditKind: 'commitment.transition',
    auditEntity: { type: 'commitment', id: validated.id },
    auditData: { from: existing.state, to, reason: options.reason },
  });

  // If the state directory changed, clean up the stale file so a subsequent
  // read returns the new state. (We always re-derive the file path from the
  // canonical state, so the old file in the previous directory is now a
  // duplicate.)
  if (existing.state !== to) {
    const oldPath = entityPathForState(repo.layout, existing.state, id);
    const newPath = entityPathForState(repo.layout, to, id);
    if (oldPath !== newPath) {
      try {
        const fs = await import('fs/promises');
        await fs.unlink(oldPath);
      } catch {
        /* may not exist */
      }
    }
  }

  return validated;
}

function entityPathForState(layout: import('../../repositories/v2/repository.js').V2Repository['layout'], state: string, id: string): string {
  const path = (layout.commitments as Record<string, string>)[state];
  if (!path) return layout.commitments.all + '/' + id + '.md';
  return path + '/' + id + '.md';
}

export async function waitOn(
  repo: V2Repository,
  id: string,
  waiting: { waitingOnId?: string; waitingOnText: string; reviewAt: string },
  options: { expectedHash?: string } = {}
): Promise<Commitment> {
  const existing = await repo.getCommitment(id);
  if (!existing) throw new Error('Commitment not found');
  if (!canTransitionCommitment(existing.state, 'waiting')) {
    throw new CommitmentTransitionError(existing.state, 'waiting');
  }
  const now = new Date().toISOString();
  const merged: Commitment = {
    ...existing,
    state: 'waiting',
    waitingOnId: waiting.waitingOnId,
    waitingOnText: waiting.waitingOnText,
    waitingSince: now,
    reviewAt: waiting.reviewAt,
    updatedAt: now,
  };
  const issues = validateCommitment(merged);
  if (issues.some(i => i.severity === 'error')) {
    throw new CommitmentValidationFailed(issues);
  }
  const validated = CommitmentSchema.parse(merged);
  await repo.saveCommitment(validated, {
    expectedHash: options.expectedHash,
    auditKind: 'commitment.wait',
    auditEntity: { type: 'commitment', id: validated.id },
    auditData: { waitingOnId: waiting.waitingOnId, waitingOnText: waiting.waitingOnText, reviewAt: waiting.reviewAt },
  });

  // Clean up the previous state directory (if any)
  if (existing.state !== 'waiting') {
    const oldPath = entityPathForState(repo.layout, existing.state, id);
    try {
      const fs = await import('fs/promises');
      await fs.unlink(oldPath);
    } catch {
      /* may not exist */
    }
  }

  return validated;
}

export interface CompleteInput {
  outcomeKind: 'delivered' | 'decided' | 'sent' | 'confirmed' | 'failed' | 'cancelled';
  outcomeSummary: string;
  evidenceIds?: string[];
  followUpCommitmentIds?: string[];
  expectedHash?: string;
  /** When true, the system records a follow-up reminder; user still confirms. */
  suggestFollowUp?: boolean;
}

export async function completeWithOutcome(
  repo: V2Repository,
  id: string,
  input: CompleteInput
): Promise<{ commitment: Commitment; outcome: Outcome; followUps: Commitment[] }> {
  const existing = await repo.getCommitment(id);
  if (!existing) throw new Error('Commitment not found');
  if (!canTransitionCommitment(existing.state, 'completed')) {
    throw new CommitmentTransitionError(existing.state, 'completed');
  }
  const now = new Date().toISOString();
  const outcome: Outcome = {
    id: newId('out'),
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    createdBy: 'user',
    workspaceId: existing.workspaceId,
    commitmentId: existing.id,
    kind: input.outcomeKind,
    summary: input.outcomeSummary,
    evidenceIds: input.evidenceIds ?? [],
    followUpCommitmentIds: input.followUpCommitmentIds ?? [],
  };
  await repo.saveOutcome(outcome, {
    auditKind: 'outcome.create',
    auditEntity: { type: 'outcome', id: outcome.id },
    auditData: { commitmentId: existing.id, kind: outcome.kind },
  });

  const updated: Commitment = {
    ...existing,
    state: 'completed',
    completedAt: now,
    outcomeId: outcome.id,
    lastProgressAt: now,
    updatedAt: now,
  };
  await repo.saveCommitment(updated, {
    expectedHash: input.expectedHash,
    auditKind: 'commitment.complete',
    auditEntity: { type: 'commitment', id: updated.id },
    auditData: { outcomeId: outcome.id, kind: outcome.kind },
  });

  if (existing.state !== 'completed') {
    const oldPath = entityPathForState(repo.layout, existing.state, existing.id);
    try {
      const fs = await import('fs/promises');
      await fs.unlink(oldPath);
    } catch {
      /* ignore */
    }
  }

  // Spec §6: completing may surface new commitments. We propose but don't auto-create.
  return { commitment: updated, outcome, followUps: [] };
}

export async function listCommitments(repo: V2Repository, filter?: { state?: CommitmentState | 'open' }): Promise<Commitment[]> {
  const all = await repo.listCommitments();
  if (!filter || filter.state === undefined) return all;
  if (filter.state === 'open') {
    return all.filter(c => c.state !== 'completed' && c.state !== 'cancelled' && c.state !== 'archived');
  }
  return all.filter(c => c.state === filter.state);
}

export async function getCommitmentOrThrow(repo: V2Repository, id: string): Promise<Commitment> {
  const c = await repo.getCommitment(id);
  if (!c) throw new Error('Commitment not found');
  return c;
}
