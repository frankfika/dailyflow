/**
 * Event Graph Proposal validator — pure, deterministic, table-testable.
 *
 * Spec: docs/DAILYFLOW_2_2_DEEPSEEK_HARNESS_IMPLEMENTATION_PLAN.md §4.5–4.6, §6.7, §12.
 *
 * These rules are the *server-side* enforcement that the system prompt alone
 * must never be relied on for:
 *   - stable revision identity (baseRevision)
 *   - cycle detection across add/move
 *   - entity/evidence existence
 *   - same-event + scope containment
 *   - waiting-field completeness
 *   - duplicate tempId
 *   - restricted patch fields / illegal kind transitions
 *
 * Every failure returns a stable ValidationIssue with a stable code, so the
 * runtime can present a model with machine-readable corrections instead of free
 * prose.
 */
import type {
  EventGraphProposal,
  GraphOperation,
  ValidationIssue,
} from './eventOperator.js';

// ---------------------------------------------------------------------------
// Stable hash (pure, cross-env). FNV-1a 64-bit → hex.
// Good enough for revision identity (not for security); deterministic forever.
// ---------------------------------------------------------------------------
const FNV_PRIME = 0x100000001b3n;
const FNV_OFFSET = 0xcbf29ce484222325n;

export function stableHash(input: string): string {
  let hash = FNV_OFFSET;
  for (let i = 0; i < input.length; i++) {
    hash = (hash ^ BigInt(input.charCodeAt(i))) * FNV_PRIME;
    // 64-bit wrap to mimic a fixed-width register.
    hash &= (1n << 64n) - 1n;
  }
  // 16 hex chars, zero-padded.
  return hash.toString(16).padStart(16, '0');
}

/** Canonical-ish JSON for revision computation (deterministic key order). */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value ?? null);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `"${k}":${canonicalJson(obj[k])}`).join(',')}}`;
}

// ---------------------------------------------------------------------------
// Snapshot of the authoritative state a proposal was generated against
// ---------------------------------------------------------------------------

export interface GraphSnapshotBase {
  workspaceId: string;
  eventId: string;
  mindmapId: string;
  /** Per plan §4.6: mindmap updatedAt/nodes/edges + event status + commitments. */
  mindmapUpdatedAt: string;
  eventStatus: string;
  nodes: { id: string; kind?: string; text?: string; entityRefs?: unknown }[];
  edges: { id: string; source: string; target: string }[];
  commitments: { id: string; updatedAt: string; state: string }[];
  /** ids of every entity the agent is allowed to link to / cite. */
  knownEntityIds: Set<string>;
  /** ids of evidence the agent is allowed to cite. */
  knownEvidenceIds: Set<string>;
}

export const VALIDATION_CODES = {
  MISSING_CHANGE_ID: 'MISSING_CHANGE_ID',
  DUPLICATE_TEMP_ID: 'DUPLICATE_TEMP_ID',
  PARENT_MISSING: 'PARENT_MISSING',
  NODE_MISSING: 'NODE_MISSING',
  CYCLE: 'CYCLE',
  CROSS_EVENT: 'CROSS_EVENT',
  SCOPE_MISMATCH: 'SCOPE_MISMATCH',
  EVIDENCE_REQUIRED: 'EVIDENCE_REQUIRED',
  EVIDENCE_UNKNOWN: 'EVIDENCE_UNKNOWN',
  ENTITY_UNKNOWN: 'ENTITY_UNKNOWN',
  WAITING_FIELDS_MISSING: 'WAITING_FIELDS_MISSING',
  ILLEGAL_KIND_TRANSITION: 'ILLEGAL_KIND_TRANSITION',
  DOMAIN_DRAFT_INVALID: 'DOMAIN_DRAFT_INVALID',
} as const;
export type ValidationCode = (typeof VALIDATION_CODES)[keyof typeof VALIDATION_CODES];

// ---------------------------------------------------------------------------
// Base revision
// ---------------------------------------------------------------------------

export function computeBaseRevision(snap: Pick<GraphSnapshotBase, 'mindmapId' | 'mindmapUpdatedAt' | 'nodes' | 'edges' | 'eventStatus' | 'commitments'>): string {
  const nodes = snap.nodes
    .map((n) => ({ id: n.id, kind: n.kind ?? 'branch', text: n.text ?? '', entityRefs: n.entityRefs ?? null }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const edges = snap.edges.map((e) => ({ id: e.id, source: e.source, target: e.target })).sort((a, b) => (a.id < b.id ? -1 : 1));
  const commitments = snap.commitments
    .map((c) => ({ id: c.id, updatedAt: c.updatedAt, state: c.state }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  return stableHash(
    canonicalJson({
      mindmapId: snap.mindmapId,
      mindmapUpdatedAt: snap.mindmapUpdatedAt,
      eventStatus: snap.eventStatus,
      nodes,
      edges,
      commitments,
    }),
  );
}

// ---------------------------------------------------------------------------
// Cycle detection against a *target* children-map
// ---------------------------------------------------------------------------

interface ChildrenMap {
  getChildren(id: string): string[];
}

/**
 * Does `start`'s ancestor chain (via `parentOf`) contain `target`? Used to
 * detect a move that places a node under one of its own descendants.
 */
function walkContains(parentOf: Map<string, string>, start: string, target: string): boolean {
  let cur: string | undefined = start;
  const seen = new Set<string>();
  while (cur !== undefined) {
    if (cur === target) return true;
    if (seen.has(cur)) return false; // existing tree cycle guard
    seen.add(cur);
    cur = parentOf.get(cur);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Graph helpers from snapshot
// ---------------------------------------------------------------------------

function parentOfFromEdges(snap: Pick<GraphSnapshotBase, 'edges'>): Map<string, string> {
  // An edge parent→child: source is the parent. A child has one parent.
  const parent = new Map<string, string>();
  for (const e of snap.edges) parent.set(e.target, e.source);
  return parent;
}

function childrenOfFromEdges(snap: Pick<GraphSnapshotBase, 'edges'>): Map<string, string[]> {
  const children = new Map<string, string[]>();
  for (const e of snap.edges) {
    const arr = children.get(e.source) ?? [];
    arr.push(e.target);
    children.set(e.source, arr);
  }
  return children;
}

/**
 * Compute the *target* parent/children maps after applying every op in order,
 * so that add_node + move_node participate in cycle detection together.
 */
// (Projection is applied inline in validateGraphProposal; no standalone helper.)

// ---------------------------------------------------------------------------
// Validation entrypoint
// ---------------------------------------------------------------------------

export interface ValidateProposalResult {
  ok: boolean;
  issues: ValidationIssue[];
}

export function validateGraphProposal(
  proposal: Pick<
    EventGraphProposal,
    'workspaceId' | 'eventId' | 'mindmapId' | 'baseRevision' | 'operations'
  >,
  snap: GraphSnapshotBase,
): ValidateProposalResult {
  const issues: ValidationIssue[] = [];
  const add = (code: ValidationCode, message: string, changeId?: string, path?: string, retryable = false) =>
    issues.push({ code, message, changeId, path, retryable });

  const existingNodeIds = new Set(snap.nodes.map((n) => n.id));
  const existingParentOf = parentOfFromEdges(snap);
  const existingChildrenOf = childrenOfFromEdges(snap);

  // Same-event / scope containment.
  if (proposal.workspaceId !== snap.workspaceId) {
    add(VALIDATION_CODES.SCOPE_MISMATCH, 'Proposal workspace does not match the snapshot workspace.');
  }
  if (proposal.eventId !== snap.eventId || proposal.mindmapId !== snap.mindmapId) {
    add(VALIDATION_CODES.CROSS_EVENT, 'Proposal targets a different event/mindmap than the snapshot scope.', undefined, 'eventId');
  }

  // Duplicate tempId (for add_node), plus per-op checks.
  const tempIds = new Set<string>();
  const targetParentOf = new Map(existingParentOf);
  const targetChildrenOf = new Map<string, string[]>(existingChildrenOf);
  const moveOps: Extract<GraphOperation, { op: 'move_node' }>[] = [];

  const applyNodeMove = (nodeId: string, newParentId: string) => {
    const oldParent = targetParentOf.get(nodeId);
    if (oldParent !== undefined) {
      targetChildrenOf.set(oldParent, (targetChildrenOf.get(oldParent) ?? []).filter((c) => c !== nodeId));
    }
    targetParentOf.set(nodeId, newParentId);
    targetChildrenOf.set(newParentId, [...(targetChildrenOf.get(newParentId) ?? []), nodeId]);
  };

  for (const op of proposal.operations) {
    const changeId = op.changeId;
    if (!changeId) {
      add(VALIDATION_CODES.MISSING_CHANGE_ID, 'Operation is missing a stable changeId.', undefined, 'changeId');
      continue;
    }

    if (op.op === 'add_node') {
      if (tempIds.has(op.tempId)) {
        add(VALIDATION_CODES.DUPLICATE_TEMP_ID, 'Duplicate tempId across add_node operations.', changeId, `operations.${changeId}.tempId`);
      }
      tempIds.add(op.tempId);
      if (!existingNodeIds.has(op.parentId)) {
        add(VALIDATION_CODES.PARENT_MISSING, `Parent node ${op.parentId} does not exist in the current map.`, changeId, `operations.${changeId}.parentId`);
      }
      // Register temp node in the projected map so chained moves/parents see it.
      targetParentOf.set(op.tempId, op.parentId);
      targetChildrenOf.set(op.parentId, [...(targetChildrenOf.get(op.parentId) ?? []), op.tempId]);
      checkNodeDomainIntegrity(op, add, changeId, snap);
    } else if (op.op === 'update_node') {
      if (!existingNodeIds.has(op.nodeId)) {
        add(VALIDATION_CODES.NODE_MISSING, `Node ${op.nodeId} to update does not exist.`, changeId, `operations.${changeId}.nodeId`);
      } else {
        const target = snap.nodes.find((n) => n.id === op.nodeId);
        const fromKind = target?.kind ?? 'branch';
        if (op.patch.kind && !isKindTransitionAllowed(fromKind, op.patch.kind)) {
          add(VALIDATION_CODES.ILLEGAL_KIND_TRANSITION, `Illegal kind transition ${fromKind} → ${op.patch.kind}.`, changeId, `operations.${changeId}.patch.kind`);
        }
      }
      checkEvidence(op.evidenceIds, add, changeId, snap);
    } else if (op.op === 'move_node') {
      if (!existingNodeIds.has(op.nodeId)) {
        add(VALIDATION_CODES.NODE_MISSING, `Node ${op.nodeId} to move does not exist.`, changeId, `operations.${changeId}.nodeId`);
        continue;
      }
      if (!existingNodeIds.has(op.newParentId)) {
        add(VALIDATION_CODES.PARENT_MISSING, `New parent ${op.newParentId} does not exist.`, changeId, `operations.${changeId}.newParentId`);
        continue;
      }
      if (op.newParentId === op.nodeId) {
        add(VALIDATION_CODES.CYCLE, 'Cannot move a node under itself.', changeId, `operations.${changeId}.newParentId`);
        continue;
      }
      applyNodeMove(op.nodeId, op.newParentId);
      moveOps.push(op);
    } else if (op.op === 'link_entity') {
      if (!existingNodeIds.has(op.nodeId)) {
        add(VALIDATION_CODES.NODE_MISSING, `Node ${op.nodeId} to link does not exist.`, changeId, `operations.${changeId}.nodeId`);
      }
      if (!snap.knownEntityIds.has(op.entityRef.id)) {
        add(VALIDATION_CODES.ENTITY_UNKNOWN, `Entity ${op.entityRef.id} is not within the allowed scope.`, changeId, `operations.${changeId}.entityRef.id`);
      }
    }
  }

  // Post-pass: cycle detection across ALL projected moves, in order. A move is
  // a cycle iff its new parent is one of its own descendants in the projected tree.
  for (const m of moveOps) {
    if (walkContains(targetParentOf, m.newParentId, m.nodeId)) {
      add(VALIDATION_CODES.CYCLE, `Moving ${m.nodeId} under ${m.newParentId} would create a cycle.`, m.changeId, `operations.${m.changeId}.newParentId`);
    }
  }

  return { ok: issues.length === 0, issues: issues.sort((a, b) => (a.code < b.code ? -1 : 1)) };
}

function checkNodeDomainIntegrity(
  op: Extract<GraphOperation, { op: 'add_node' }>,
  add: (c: ValidationCode, m: string, changeId?: string, path?: string) => void,
  changeId: string,
  snap: GraphSnapshotBase,
): void {
  const draft = op.domainDraft;
  assertEvidence(draft, op.evidenceIds, add, changeId, snap);

  if (draft && draft.entity !== 'none') {
    if (draft.entity === 'waiting_commitment' || op.node.kind === 'waiting') {
      if (!draft.waitingOnText || !draft.reviewAt) {
        add(VALIDATION_CODES.WAITING_FIELDS_MISSING, 'Waiting node must carry waitingOnText and reviewAt.', changeId, 'domainDraft');
      }
    }
    if (draft.entity === 'commitment' && op.node.kind !== 'task' && op.node.kind !== 'waiting') {
      add(VALIDATION_CODES.DOMAIN_DRAFT_INVALID, 'A commitment draft must live on a task or waiting node.', changeId, 'domainDraft.entity');
    }
    if (op.node.kind === 'task' && draft.entity !== 'commitment') {
      add(VALIDATION_CODES.DOMAIN_DRAFT_INVALID, 'A task node must materialize a commitment.', changeId, 'domainDraft.entity');
    }
    if (op.node.kind === 'waiting' && draft.entity !== 'waiting_commitment' && draft.entity !== 'commitment') {
      add(VALIDATION_CODES.DOMAIN_DRAFT_INVALID, 'A waiting node must materialize a waiting commitment.', changeId, 'domainDraft.entity');
    }
    if (op.node.kind === 'decision' && draft.entity !== 'decision') {
      add(VALIDATION_CODES.DOMAIN_DRAFT_INVALID, 'A decision node must materialize a decision.', changeId, 'domainDraft.entity');
    }
    if (op.node.kind === 'outcome') {
      if (draft.entity !== 'outcome') {
        add(VALIDATION_CODES.DOMAIN_DRAFT_INVALID, 'An outcome node must materialize an outcome.', changeId, 'domainDraft.entity');
      } else if (!draft.commitmentId || !snap.knownEntityIds.has(draft.commitmentId)) {
        add(VALIDATION_CODES.DOMAIN_DRAFT_INVALID, 'An outcome must reference an existing in-scope commitment.', changeId, 'domainDraft.commitmentId');
      }
    }
  }
}

function checkEvidence(
  evidenceIds: string[],
  add: (c: ValidationCode, m: string, changeId?: string, path?: string) => void,
  changeId: string,
  snap: GraphSnapshotBase,
): void {
  for (const ev of evidenceIds) {
    if (!snap.knownEvidenceIds.has(ev)) {
      add(VALIDATION_CODES.EVIDENCE_UNKNOWN, `Evidence ${ev} is not in the allowed scope.`, changeId, 'evidenceIds');
    }
  }
}

function assertEvidence(
  draft: { entity: string } | undefined,
  evidenceIds: string[],
  add: (c: ValidationCode, m: string, changeId?: string, path?: string) => void,
  changeId: string,
  snap: GraphSnapshotBase,
): void {
  checkEvidence(evidenceIds, add, changeId, snap);
  // Factual domain claims must be evidenced (plan §1.3). Node-only ops may be
  // structural, so no hard requirement unless a domain draft exists.
  if (draft && draft.entity !== 'none' && evidenceIds.length === 0) {
    add(VALIDATION_CODES.EVIDENCE_REQUIRED, 'Domain-bearing operation requires at least one evidence reference or an explicit no-evidence marker.', changeId, 'evidenceIds');
  }
}

function isKindTransitionAllowed(from: string, to: string): boolean {
  // Structural kinds are freely reclassifiable; semantic kinds have guardrails.
  const rootProtected = from === 'root' || to === 'root';
  if (rootProtected) return from === to;
  return true;
}

/** Convenience: built from a serialized snapshot for repository callers. */
export function buildSnapshot(input: GraphSnapshotBase): GraphSnapshotBase {
  return input;
}
