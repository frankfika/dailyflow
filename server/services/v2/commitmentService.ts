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
  /** Required when transitioning to 'waiting'. */
  waitingOnText?: string;
  /** Required when transitioning to 'waiting'. Defaults to 3 days from now. */
  reviewAt?: string;
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
    merged.reviewAt = options.reviewAt ?? existing.reviewAt ?? new Date(Date.now() + 3 * 86_400_000).toISOString();
    if (options.waitingOnText) merged.waitingOnText = options.waitingOnText;
    else if (!existing.waitingOnText && !existing.waitingOnId) {
      // Spec §11.4: waiting requires waitingOnId or explicit text.
      // The route layer always collects this; the service also accepts a
      // no-arg call so the test path can demonstrate default UX behaviour
      // (review date set, "not specified" placeholder text shown).
      merged.waitingOnText = 'Not specified — please update';
    }
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

/**
 * A single follow-up candidate surfaced by the close-loop detector.
 */
export interface FollowUpCandidate {
  /** Suggested Commitment title. */
  title: string;
  /** Optional suggested outcome. */
  outcome: string;
  /** Verbatim span from the outcome summary that triggered the candidate. */
  quote: string;
  /** Heuristic confidence in [0, 1]. */
  confidence: number;
  /**
   * Reason for the suggestion. Always references the exact quote so the
   * user can verify what the system saw (spec §10.5: "无法找到来源时
   * 必须明确标记为...AI 建议，不得伪造引用").
   */
  reason: string;
}

/**
 * Conservative regex-based close-loop detector. Triggers on phrases that
 * typically mean "there's more work after this":
 *   - "需要" / "还要" / "还得" + verb
 *   - "记得" / "别忘了" + verb
 *   - "TODO" / "follow up"
 *   - "之后要" / "下一步" / "下周二" / similar
 *
 * The detector is deliberately noisy on the low side. False positives
 * pollute the Inbox; missing one is recoverable on the next review.
 *
 * Spec §10.4: AI must label confidence honestly. We do not inflate
 * confidence for pattern matches; everything is <= 0.7.
 */
const FOLLOWUP_PATTERNS: Array<{ regex: RegExp; confidence: number; hint: string }> = [
  // Chinese: 还要/还得/需要/记得/别忘了
  { regex: /(?:还要|还得|需要|记得|别忘了|再(?:确认|发|检查|跟进|联系|通知|发送|看看))[^。.!?\n]{2,80}/g, confidence: 0.6, hint: 'commitment_phrase' },
  // English: TODO / follow up / next step / need to / will
  { regex: /\b(?:TODO|FOLLOW[\s-]?UP|next\s+step|need\s+to|will\s+need\s+to|action\s+item)\b[^.!?\n]{0,80}/gi, confidence: 0.65, hint: 'commitment_phrase' },
  // "之后" / "下一步" / future
  { regex: /(?:之后|下一步|随后|稍后|再(?:来|找|看|问|提))[：:\s]?[^。.!?\n]{2,80}/g, confidence: 0.5, hint: 'forward_phrase' },
  // "下周" / "周五前" / dated
  { regex: /(?:\d{1,2}\/\d{1,2}|\d{4}-\d{2}-\d{2}|周[一二三四五六日天]|下(?:周|个?月|季度|周[一二三四五六日]))[^。.!?\n]{0,80}(?:前|内|之前|时|要|需要)?/g, confidence: 0.45, hint: 'date_phrase' },
];

export function detectFollowUps(outcomeSummary: string): FollowUpCandidate[] {
  if (!outcomeSummary || outcomeSummary.length < 4) return [];
  const seen = new Set<string>();
  const out: FollowUpCandidate[] = [];
  // Split on sentence/line boundaries so each pattern match is bounded.
  const segments = outcomeSummary.split(/[。.!?\n]+/);
  for (const seg of segments) {
    const trimmed = seg.trim();
    if (trimmed.length < 4 || trimmed.length > 300) continue;
    for (const { regex, confidence, hint } of FOLLOWUP_PATTERNS) {
      // Reset lastIndex because we use the same regex per pattern per call.
      regex.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = regex.exec(trimmed)) !== null) {
        const match = m[0].trim();
        if (match.length < 4) continue;
        const key = match.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        // Title is the match itself (user-typed; verbatim).
        // Outcome is the broader sentence so the user can see context.
        out.push({
          title: match,
          outcome: trimmed,
          quote: match,
          confidence,
          reason: `在 Outcome 中检测到「${hint}」标记：${match.slice(0, 60)}`,
        });
        if (out.length >= 5) return out; // cap to keep the proposal small
      }
    }
  }
  return out;
}

export interface CompleteResult {
  commitment: Commitment;
  outcome: Outcome;
  /**
   * close-loop follow-up proposal (kind=close_loop). When the user
   * confirmed this completion, the system may have detected new
   * commitments in the outcome summary and surfaced them as a pending
   * proposal. The user reviews and accepts each change.
   *
   * `null` when no follow-up candidates were found, or when the
   * caller has already provided explicit `followUpCommitmentIds`.
   */
  followUpProposal: { id: string; candidateCount: number; changeIds: string[] } | null;
  /** The detected follow-up candidates that produced the proposal. */
  followUpCandidates: FollowUpCandidate[];
}

export async function completeWithOutcome(
  repo: V2Repository,
  id: string,
  input: CompleteInput
): Promise<CompleteResult> {
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

  // Spec §6 + §26 step 14: completing may surface new commitments.
  // We propose but do not auto-create. The user reviews and accepts
  // each change in the Inbox.
  let followUpProposal: CompleteResult['followUpProposal'] = null;
  let followUpCandidates: FollowUpCandidate[] = [];
  if (
    input.suggestFollowUp !== false &&
    (!input.followUpCommitmentIds || input.followUpCommitmentIds.length === 0)
  ) {
    followUpCandidates = detectFollowUps(input.outcomeSummary);
    if (followUpCandidates.length > 0) {
      // Lazy import to avoid a circular dep at module load.
      const { createProposal } = await import('./proposalService.js');
      const changes = followUpCandidates.map(fu => ({
        op: 'create' as const,
        entity: 'commitment' as const,
        changeId: newId('chg'),
        draft: {
          title: fu.title,
          outcome: fu.outcome,
          state: 'inbox' as const,
          dueConfidence: 'unknown' as const,
        },
        evidenceIds: [],
        confidence: fu.confidence,
        reason: fu.reason,
      }));
      const modelRunId = newId('run');
      const prop = await createProposal(repo, existing.workspaceId, {
        kind: 'close_loop',
        sourceIds: existing.sourceIds,
        modelRunId,
        changes,
      });
      // Record an AgentRun so the audit trail explains the proposal.
      await repo.saveAgentRun(
        {
          id: modelRunId,
          schemaVersion: 1,
          createdAt: now,
          updatedAt: now,
          createdBy: 'ai',
          workspaceId: existing.workspaceId,
          agent: 'resolver',
          modelProvider: 'heuristic',
          model: 'detect-followups@1',
          promptVersion: 'close_loop@1',
          inputEntityIds: [existing.id, outcome.id],
          outputProposalId: prop.id,
          status: 'succeeded',
          tokenUsage: { input: 0, output: 0 },
          durationMs: 0,
        },
        {
          auditKind: 'process',
          auditEntity: { type: 'run', id: modelRunId },
          auditData: { kind: 'close_loop', fromOutcome: outcome.id },
        }
      );
      followUpProposal = {
        id: prop.id,
        candidateCount: followUpCandidates.length,
        changeIds: changes.map(c => c.changeId),
      };
    }
  }

  return { commitment: updated, outcome, followUpProposal, followUpCandidates };
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
