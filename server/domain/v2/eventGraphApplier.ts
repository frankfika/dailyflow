/**
 * Graph apply planner — the pure heart of "accept → commit to real data".
 *
 * Spec: docs/DAILYFLOW_2_2_DEEPSEEK_HARNESS_IMPLEMENTATION_PLAN.md §7.7, DFH-402–404.
 *
 * Given a user-accepted selection of GraphOperations (plus overrides), this
 * module produces the ordered apply plan:
 *   - `createChanges`: ProposedChanges that creation flow feeds to the existing
 *     proposalService to materialise real Commitment/Decision/Outcome entities
 *     (*before* any mindmap write).
 *   - mindmap node writes: add / update / move / link, with the entityRef the
 *     created entity should attach to.
 *
 * It is pure + deterministic, so the "no partial state" and "idempotent" rules
 * are unit-testable without a repo.
 */
import type {
  EventGraphProposal,
  GraphOperation,
  DomainEntityDraft,
  GraphOperationDraft,
} from './eventOperator.js';
import type { ProposedChange } from './types.js';
import { computeBaseRevision } from './eventGraphValidator.js';
import type { GraphSnapshotBase } from './eventGraphValidator.js';

export interface AppliedNodeDraft {
  changeId: string;
  tempId: string;
  parentId: string;
  kind: string;
  text: string;
  note?: string;
  /** What the created domain entity is (null for structural nodes). */
  entityRefType: 'commitment' | 'decision' | 'outcome' | null;
}

export interface ApplyPlan {
  createChanges: ProposedChange[];
  addNodes: AppliedNodeDraft[];
  updateNodes: { changeId: string; nodeId: string; patch: { text?: string; note?: string; kind?: string } }[];
  moveNodes: { changeId: string; nodeId: string; newParentId: string }[];
  linkEntities: { changeId: string; nodeId: string; entityRef: { type: string; id: string } }[];
  /** changeIds that cannot be safely applied because the base revision changed. */
  staleChangeIds: string[];
  /** ops the user de-selected. */
  skippedChangeIds: string[];
}

export interface NewEntity {
  changeId: string;
  type: 'commitment' | 'waiting_commitment' | 'decision' | 'outcome';
  id: string;
}
export interface NewEntitiesResult {
  byChangeId: Map<string, NewEntity>;
  created: NewEntity[];
  rejected: { changeId: string; reason: string }[];
}

/**
 * A "waiting" node / waiting_commitment draft is realised as a Commitment in
 * the `waiting` state. `decision`/`outcome` map to their own entity types.
 */
function entityFor(draft: Partial<DomainEntityDraft> | undefined, kind: string): NonNullable<AppliedNodeDraft['entityRefType']> {
  if (draft?.entity === 'decision') return 'decision';
  if (draft?.entity === 'outcome') return 'outcome';
  if (kind === 'waiting' || draft?.entity === 'waiting_commitment') return 'commitment';
  if (kind === 'task' || draft?.entity === 'commitment') return 'commitment';
  return 'commitment';
}

/**
 * Build the apply plan for a user selection. Ops whose base revision no longer
 * matches the current snapshot are flagged stale and are never applied unless
 * the caller chooses to force them (caller responsibility).
 */
export function buildGraphApplyPlan(
  proposal: Pick<EventGraphProposal, 'operations' | 'baseRevision'>,
  snapshot: Pick<GraphSnapshotBase, 'mindmapId' | 'mindmapUpdatedAt' | 'nodes' | 'edges' | 'eventStatus' | 'commitments'>,
  selection: string[] | undefined,
  overrides: Record<string, Record<string, unknown>> | undefined,
): ApplyPlan {
  const current = computeBaseRevision(snapshot);
  const stale = current !== proposal.baseRevision;

  const selectedIds = selection ? new Set(selection) : undefined;
  const oo = overrides ?? {};

  const plan: ApplyPlan = {
    createChanges: [],
    addNodes: [],
    updateNodes: [],
    moveNodes: [],
    linkEntities: [],
    skippedChangeIds: [],
    staleChangeIds: [],
  };

  for (const op of proposal.operations) {
    if (selectedIds && !selectedIds.has(op.changeId)) {
      plan.skippedChangeIds.push(op.changeId);
      continue;
    }
    if (stale) {
      // Never silently overwrite. Any changeId may still be individually safe;
      // a full re-derivation is the recovery path. Mark stale and skip.
      plan.staleChangeIds.push(op.changeId);
      continue;
    }

    switch (op.op) {
      case 'add_node': {
        const override = oo[op.changeId] as Record<string, unknown> | undefined;
        const draft = override ? { ...(op.domainDraft ?? {}), ...override } : op.domainDraft;
        const refType = entityFor(draft, op.node.kind);
        const oText = oo[op.changeId]?.text as string | undefined;
        const oKind = oo[op.changeId]?.kind as string | undefined;
        if (draft && draft.entity && draft.entity !== 'none') {
          plan.createChanges.push(makeCreateChange(op, draft, oText));
        }
        plan.addNodes.push({
          changeId: op.changeId,
          tempId: op.tempId,
          parentId: op.parentId,
          kind: oKind ?? op.node.kind,
          text: oText ?? op.node.text,
          note: op.node.note,
          entityRefType: draft && draft.entity !== 'none' ? refType : null,
        });
        break;
      }
      case 'update_node': {
        plan.updateNodes.push({
          changeId: op.changeId,
          nodeId: op.nodeId,
          patch: { ...op.patch, ...(oo[op.changeId] as object | undefined) },
        });
        break;
      }
      case 'move_node': {
        plan.moveNodes.push({ changeId: op.changeId, nodeId: op.nodeId, newParentId: op.newParentId });
        break;
      }
      case 'link_entity': {
        plan.linkEntities.push({ changeId: op.changeId, nodeId: op.nodeId, entityRef: op.entityRef });
        break;
      }
    }
  }

  return plan;
}

function makeCreateChange(
  op: Extract<GraphOperationDraft, { op: 'add_node' }>,
  draft: Partial<DomainEntityDraft>,
  textOverride?: string,
): ProposedChange {
  const title = textOverride ?? (draft.title as string | undefined) ?? op.node.text;
  const entity = draft.entity ?? (op.node.kind === 'waiting' ? 'waiting_commitment' : 'commitment');
  if (entity === 'decision') {
    return {
      changeId: op.changeId,
      op: 'create',
      entity: 'decision',
      draft: {
        title,
        decision: draft.decision ?? title,
        rationale: draft.rationale,
      },
      evidenceIds: op.evidenceIds,
      confidence: op.confidence,
      reason: op.reason,
    };
  }
  if (entity === 'outcome') {
    return {
      changeId: op.changeId,
      op: 'create',
      entity: 'outcome',
      draft: {
        summary: draft.outcomeSummary ?? title,
        kind: draft.outcomeKind ?? 'delivered',
      },
      evidenceIds: op.evidenceIds,
      confidence: op.confidence,
      reason: op.reason,
    };
  }
  // commitment / waiting_commitment → Commitment (waiting state when waiting).
  const isWaiting = entity === 'waiting_commitment' || op.node.kind === 'waiting';
  return {
    changeId: op.changeId,
    op: 'create',
    entity: 'commitment',
    draft: {
      title,
      outcome: draft.outcome ?? title,
      state: isWaiting ? 'waiting' : (draft.state ?? 'active'),
      ownerText: draft.ownerText ?? undefined,
      dueAt: draft.dueAt,
      dueConfidence: draft.dueConfidence,
      waitingOnText: isWaiting ? draft.waitingOnText : undefined,
      reviewAt: isWaiting ? draft.reviewAt : undefined,
      nextAction: draft.nextAction,
    },
    evidenceIds: op.evidenceIds,
    confidence: op.confidence,
    reason: op.reason,
  };
}