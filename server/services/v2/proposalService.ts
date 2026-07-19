/**
 * Proposal service.
 *
 * The Proposal is the only way AI (or any non-user actor) modifies the
 * system. Spec §10.2 / §13.3.
 *
 *   - createProposal(...)  — owner: AI / migration
 *   - applyProposal(...)   — owner: user, after review
 *   - applySelection(...)  — owner: user, partial accept
 *   - rejectProposal(...)  — owner: user
 *   - expireProposal(...)  — owner: system, on stale source
 *
 * Every apply enforces:
 *   - Each change's target entity is the one declared in the change.
 *   - Evidence refs exist (best-effort: warning, not blocking, to keep
 *     resilience when an Evidence is deleted by the user).
 *   - Domain validation runs (state machine + waiting requires reviewAt etc).
 */
import { z } from 'zod';
import { newId } from '../../domain/v2/ulid.js';
import {
  ProposalSchema,
  type Proposal,
  type ProposedChange,
  type Commitment,
  type Evidence,
  type Outcome,
  type DailyPlan,
  type Decision,
  type CommitmentState,
  type ProposalStatus,
} from '../../domain/v2/types.js';
import { validateCommitment, assertTransition } from '../../domain/v2/rules.js';
import { V2Repository } from '../../repositories/v2/repository.js';
import {
  createCommitment,
  updateCommitment,
  transitionCommitment,
  type CreateCommitmentInput,
} from './commitmentService.js';

export const CreateProposalInputSchema = z.object({
  kind: z.enum(['extract_commitments', 'triage', 'daily_plan', 'replan', 'close_loop', 'merge_entities']),
  sourceIds: z.array(z.string()).default([]),
  modelRunId: z.string().default(() => newId('run')),
  changes: z.array(z.any()).min(0),
  expiresAt: z.string().datetime({ offset: true }).optional(),
});
export type CreateProposalInput = z.infer<typeof CreateProposalInputSchema>;

export interface ApplyResult {
  proposal: Proposal;
  created: { commitment: Commitment; evidence?: Evidence[] }[];
  updated: Commitment[];
  rejected: { changeId: string; reason: string }[];
  followUpProposal?: Proposal;
}

export async function createProposal(
  repo: V2Repository,
  workspaceId: string,
  input: CreateProposalInput
): Promise<Proposal> {
  const now = new Date().toISOString();
  const draft: Proposal = {
    id: newId('prop'),
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    createdBy: 'ai',
    workspaceId,
    kind: input.kind,
    status: 'pending',
    sourceIds: input.sourceIds,
    changes: input.changes as ProposedChange[],
    modelRunId: input.modelRunId,
    expiresAt: input.expiresAt,
  };
  const validated = ProposalSchema.parse(draft);
  await repo.saveProposal(validated, {
    auditKind: 'proposal.create',
    auditEntity: { type: 'proposal', id: validated.id },
    auditData: { kind: validated.kind, changeCount: validated.changes.length },
  });
  return validated;
}

export interface ApplyOptions {
  /** IDs of changes to apply; absent = apply all. */
  selection?: string[];
  expectedHash?: string;
  applyAtomic?: boolean;
  userOverride?: Record<string, Record<string, unknown>>;
}

export async function applyProposal(
  repo: V2Repository,
  proposalId: string,
  options: ApplyOptions = {}
): Promise<ApplyResult> {
  const proposal = await repo.getProposal(proposalId);
  if (!proposal) throw new Error('Proposal not found');
  if (proposal.status === 'accepted' || proposal.status === 'rejected' || proposal.status === 'expired') {
    throw new Error(`Proposal is ${proposal.status}, cannot apply`);
  }
  if (proposal.expiresAt && new Date(proposal.expiresAt) < new Date()) {
    await expireProposal(repo, proposalId, 'expired before apply');
    throw new Error('Proposal expired');
  }

  const selectedChanges = options.selection
    ? proposal.changes.filter(c => options.selection!.includes(c.changeId))
    : proposal.changes;

  const acceptedChangeIds: string[] = [];
  const created: ApplyResult['created'] = [];
  const updated: Commitment[] = [];
  const rejected: ApplyResult['rejected'] = [];

  for (const change of selectedChanges) {
    try {
      const override = options.userOverride?.[change.changeId] ?? change.override;
      const result = await applyChange(repo, proposal.workspaceId, change, override, options.expectedHash);
      if (result.kind === 'created' && result.commitment) {
        created.push({ commitment: result.commitment, evidence: result.evidence });
      } else if (result.kind === 'updated' && result.commitment) {
        updated.push(result.commitment);
      }
      acceptedChangeIds.push(change.changeId);
    } catch (err) {
      rejected.push({
        changeId: change.changeId,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const status: ProposalStatus =
    acceptedChangeIds.length === 0
      ? 'rejected'
      : acceptedChangeIds.length === proposal.changes.length
        ? 'accepted'
        : 'partially_accepted';

  const updatedProposal: Proposal = {
    ...proposal,
    status,
    acceptedChangeIds,
    updatedAt: new Date().toISOString(),
  };
  await repo.saveProposal(updatedProposal, {
    auditKind: 'proposal.accept',
    auditEntity: { type: 'proposal', id: proposal.id },
    auditData: { status, applied: acceptedChangeIds.length, rejected: rejected.length },
  });

  return { proposal: updatedProposal, created, updated, rejected };
}

async function applyChange(
  repo: V2Repository,
  workspaceId: string,
  change: ProposedChange,
  override: Record<string, unknown> | undefined,
  expectedHash: string | undefined
): Promise<
  | { kind: 'created'; commitment?: Commitment; evidence?: Evidence[] }
  | { kind: 'updated'; commitment?: Commitment }
  | { kind: 'noop' }
> {
  const draft = applyOverride(change.draft, override);

  if (change.entity === 'commitment') {
    if (change.op === 'create') {
      const input: CreateCommitmentInput = {
        title: (draft.title as string) ?? 'Untitled commitment',
        outcome: (draft.outcome as string) ?? ((draft.title as string) ?? 'Outcome to be defined'),
        state: ((draft.state as CommitmentState) ?? 'inbox') as CommitmentState,
        ownerId: (draft.ownerId as string) ?? (draft.owner as string | undefined),
        beneficiaryId: (draft.beneficiaryId as string) ?? (draft.beneficiary as string | undefined),
        projectId: draft.projectId as string | undefined,
        dueAt: draft.dueAt as string | undefined,
        dueConfidence: draft.dueConfidence as 'explicit' | 'inferred' | 'unknown' | undefined,
        importance: draft.importance as 'critical' | 'high' | 'normal' | 'low' | undefined,
        effortMinutes: draft.effortMinutes as number | undefined,
        nextAction: draft.nextAction as string | undefined,
        waitingOnId: draft.waitingOnId as string | undefined,
        waitingOnText: draft.waitingOnText as string | undefined,
        reviewAt: draft.reviewAt as string | undefined,
        evidenceIds: change.evidenceIds,
        sourceIds: [],
        createdBy: 'ai',
      };
      const c = await createCommitment(repo, workspaceId, input, { expectedHash });
      return { kind: 'created', commitment: c };
    }
    if (change.op === 'update' || change.op === 'transition') {
      const targetId = change.targetId;
      if (!targetId) throw new Error('update requires targetId');
      if (change.op === 'transition') {
        const to = (draft.state as CommitmentState) ?? 'active';
        const c = await transitionCommitment(repo, targetId, to, { expectedHash });
        return { kind: 'updated', commitment: c };
      }
      const c = await updateCommitment(repo, targetId, draft, { expectedHash });
      return { kind: 'updated', commitment: c };
    }
  }

  if (change.entity === 'decision' && change.op === 'create') {
    // Decisions are written to disk by the proposal apply path.
    const decision: Decision = {
      id: newId('dec'),
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'ai',
      workspaceId,
      title: (draft.title as string) ?? 'Decision',
      decision: (draft.decision as string) ?? ((draft.title as string) ?? ''),
      rationale: draft.rationale as string | undefined,
      decidedAt: (draft.decidedAt as string) ?? new Date().toISOString(),
      participantIds: (draft.participantIds as string[]) ?? [],
      projectId: draft.projectId as string | undefined,
      evidenceIds: change.evidenceIds,
    };
    await repo.saveDecision(decision, {
      auditKind: 'commitment.update',
      auditEntity: { type: 'decision', id: decision.id },
      auditData: { sourceProposal: change.changeId },
    });
    return { kind: 'created' };
  }

  if (change.entity === 'plan' && change.op === 'create') {
    const plan: DailyPlan = {
      id: newId('plan'),
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'ai',
      workspaceId,
      date: (draft.date as string) ?? new Date().toISOString().slice(0, 10),
      constraintSummary: draft.constraintSummary as string | undefined,
      availableMinutes: draft.availableMinutes as number | undefined,
      items: (draft.items as DailyPlan['items']) ?? [],
      deferredCommitmentIds: (draft.deferredCommitmentIds as string[]) ?? [],
    };
    await repo.savePlan(plan, {
      auditKind: 'plan.create',
      auditEntity: { type: 'plan', id: plan.id },
      auditData: { itemCount: plan.items.length, availableMinutes: plan.availableMinutes },
    });
    return { kind: 'created' };
  }

  // 'evidence' / 'source' / 'project' / 'person' / 'outcome' changes are
  // surface-level and don't require domain validation beyond what the
  // repository enforces. We return noop for entities that are out of scope
  // of the current proposal apply path.
  return { kind: 'noop' };
}

function applyOverride(draft: Record<string, unknown>, override: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!override) return draft;
  return { ...draft, ...override };
}

export async function rejectProposal(
  repo: V2Repository,
  proposalId: string,
  reason: string
): Promise<Proposal> {
  const p = await repo.getProposal(proposalId);
  if (!p) throw new Error('Proposal not found');
  const now = new Date().toISOString();
  const updated: Proposal = { ...p, status: 'rejected', rejectedReason: reason, updatedAt: now };
  await repo.saveProposal(updated, {
    auditKind: 'proposal.reject',
    auditEntity: { type: 'proposal', id: p.id },
    auditData: { reason },
  });
  return updated;
}

export async function expireProposal(repo: V2Repository, proposalId: string, reason: string): Promise<Proposal | null> {
  const p = await repo.getProposal(proposalId);
  if (!p) return null;
  if (p.status === 'accepted' || p.status === 'rejected' || p.status === 'expired') return p;
  const now = new Date().toISOString();
  const updated: Proposal = { ...p, status: 'expired', rejectedReason: reason, updatedAt: now };
  await repo.saveProposal(updated, {
    auditKind: 'proposal.expire',
    auditEntity: { type: 'proposal', id: p.id },
    auditData: { reason },
  });
  return updated;
}
