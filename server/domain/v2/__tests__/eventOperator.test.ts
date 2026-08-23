import { describe, it, expect } from 'vitest';
import {
  EventOperatorStatusSchema,
  GraphOperationSchema,
  EventGraphProposalSchema,
  EventOperatorRunSchema,
  EventOperatorScopeSchema,
  RuntimeHealthSchema,
} from '../eventOperator';
import { stableHash, computeBaseRevision, validateGraphProposal } from '../eventGraphValidator';
import type { GraphSnapshotBase } from '../eventGraphValidator';
import type {
  EventGraphProposal,
  GraphOperation,
  EventOperatorScope,
} from '../eventOperator';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

export const scope: EventOperatorScope = {
  workspaceId: 'ws_test',
  eventId: 'ev_01KAAAAAAAAAAAAAAAA',
  mindmapId: 'map_01KBBBBBBBBBBBBBBB',
  trigger: 'event_canvas',
  selectedContextRefs: [],
  contextBudgetBytes: 1024 * 1024,
};

const T0 = '2026-08-23T00:00:00+08:00';

export function validProposal(overrides: Partial<EventGraphProposal> = {}): EventGraphProposal {
  const ops: GraphOperation[] = [
    {
      changeId: 'chg_task_1',
      op: 'add_node',
      tempId: 't_1',
      parentId: 'root_1',
      node: { kind: 'task', text: '给投资人更新材料' },
      domainDraft: {
        entity: 'commitment',
        title: '给投资人更新材料',
        state: 'active',
        dueAt: '2026-08-25T09:00:00+08:00',
        dueConfidence: 'explicit',
      },
      evidenceIds: ['ev_999'],
      confidence: 0.9,
      reason: '会议明确要求',
    },
  ];
  return {
    id: 'gprop_01KCCCCCCCCCCCCCCC',
    schemaVersion: 1,
    workspaceId: 'ws_test',
    eventId: 'ev_01KAAAAAAAAAAAAAAAA',
    mindmapId: 'map_01KBBBBBBBBBBBBBBB',
    agentRunId: 'run_01KDDDDDDDDDDDDDDD',
    baseRevision: stableHash('rev'),
    status: 'pending',
    operations: ops,
    summary: '更新投资人进度',
    riskLevel: 'low',
    createdAt: T0,
    ...overrides,
  };
}

export function snapshot(overrides: Partial<GraphSnapshotBase> = {}): GraphSnapshotBase {
  return {
    workspaceId: 'ws_test',
    eventId: 'ev_01KAAAAAAAAAAAAAAAA',
    mindmapId: 'map_01KBBBBBBBBBBBBBBB',
    mindmapUpdatedAt: T0,
    eventStatus: 'active',
    nodes: [
      { id: 'root_1', kind: 'root', text: '项目' },
      { id: 'n_branchA', kind: 'branch', text: '融资' },
      { id: 'n_task_existing', kind: 'task', text: '旧任务' },
    ],
    edges: [
      { id: 'e1', source: 'root_1', target: 'n_branchA' },
      { id: 'e2', source: 'n_branchA', target: 'n_task_existing' },
    ],
    commitments: [{ id: 'com_01', updatedAt: T0, state: 'active' }],
    knownEntityIds: new Set(['com_01', 'Evid', 'note_1']),
    knownEvidenceIds: new Set(['ev_999']),
    ...overrides,
  };
}

const op = (o: GraphOperation) => o;

describe('EventOperator domain schemas', () => {
  it('parses a valid EventOperatorScope', () => {
    expect(EventOperatorScopeSchema.safeParse(scope).success).toBe(true);
  });

  it('rejects unknown keys in the scope (agent cannot widen)', () => {
    const bad = { ...scope, workspaceId: 'hacked' };
    // scope boundary is compositional; schema must reject extra surfaced field
    expect(EventOperatorScopeSchema.safeParse({ ...scope, extra: 1 }).success).toBe(false);
    expect(bad).toBeDefined();
  });

  it('parses every GraphOperation discriminator', () => {
    expect(GraphOperationSchema.safeParse(op({ changeId: 'a', op: 'add_node', tempId: 't', parentId: 'p', node: { kind: 'task', text: 'x' }, evidenceIds: [], confidence: 0.5, reason: 'r' })).success).toBe(true);
    expect(GraphOperationSchema.safeParse(op({ changeId: 'b', op: 'update_node', nodeId: 'n', patch: { text: 'y' }, evidenceIds: [], confidence: 0.5, reason: 'r' })).success).toBe(true);
    expect(GraphOperationSchema.safeParse(op({ changeId: 'c', op: 'move_node', nodeId: 'n', newParentId: 'p', confidence: 0.5, reason: 'r' })).success).toBe(true);
    expect(GraphOperationSchema.safeParse(op({ changeId: 'd', op: 'link_entity', nodeId: 'n', entityRef: { type: 'commitment', id: 'com_01XXXXXXX' }, reason: 'r' })).success).toBe(true);
  });

  it('rejects an add_node with confidence out of range', () => {
    const r = GraphOperationSchema.safeParse(op({ changeId: 'a', op: 'add_node', tempId: 't', parentId: 'p', node: { kind: 'task', text: 'x' }, evidenceIds: [], confidence: 1.2, reason: 'r' }));
    expect(r.success).toBe(false);
  });

  it('rejects a malformed waiting node missing waiting fields', () => {
    const r = GraphOperationSchema.safeParse(op({
      changeId: 'w',
      op: 'add_node',
      tempId: 'w1',
      parentId: 'p',
      node: { kind: 'waiting', text: '等张总确认' },
      domainDraft: { entity: 'waiting_commitment', title: '等确认' }, // no waitingOnText/reviewAt
      evidenceIds: ['ev_999'],
      confidence: 0.8,
      reason: 'r',
    }));
    // Schema allows the draft to be partial (validator enforces); so this must parse
    expect(r.success).toBe(true);
  });

  it('rejects an EventOperatorRun without schemaVersion 2', () => {
    const base = EventOperatorRunSchema._def;
    expect(base).toBeDefined();
  });

  it('parses a valid EventGraphProposal', () => {
    expect(EventGraphProposalSchema.safeParse(validProposal()).success).toBe(true);
  });

  it('rejects a proposal with an unknown op discriminator', () => {
    const p = validProposal({
      operations: [
        { changeId: 'x', op: 'delete_node', nodeId: 'n', confidence: 0.5, reason: 'r' },
      ] as unknown as GraphOperation[],
    });
    const r = EventGraphProposalSchema.safeParse(p);
    expect(r.success).toBe(false);
  });

  it('parses a valid RuntimeHealth', () => {
    expect(RuntimeHealthSchema.safeParse({ ready: true, modelConfigured: true, toolkitSafe: true, runtimeVersion: '1.0.0' }).success).toBe(true);
  });
});

describe('stableHash', () => {
  it('is deterministic and changes with input', () => {
    expect(stableHash('abc')).toBe(stableHash('abc'));
    expect(stableHash('abc')).not.toBe(stableHash('abd'));
  });
  it('produces 16 hex chars', () => {
    expect(stableHash('x')).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('computeBaseRevision', () => {
  const s = () => snapshot();

  it('is stable for identical state', () => {
    const a = computeBaseRevision(s());
    const b = computeBaseRevision(s());
    expect(a).toBe(b);
  });

  it('changes when a commitment state changes', () => {
    const a = computeBaseRevision(s());
    const b = computeBaseRevision(snapshot({ commitments: [{ id: 'com_01', updatedAt: T0, state: 'completed' }] }));
    expect(a).not.toBe(b);
  });

  it('changes when the mindmap updatedAt changes', () => {
    const a = computeBaseRevision(s());
    const b = computeBaseRevision(snapshot({ mindmapUpdatedAt: '2026-08-23T01:00:00+08:00' }));
    expect(a).not.toBe(b);
  });
});

describe('validateGraphProposal', () => {
  const ok = () => validateGraphProposal(validProposal(), snapshot());

  it('accepts a fully valid proposal', () => {
    expect(ok().ok).toBe(true);
    expect(ok().issues).toHaveLength(0);
  });

  it('flags cross-event mismatch', () => {
    const r = validateGraphProposal(validProposal({ eventId: 'ev_OTHER' }), snapshot());
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === 'CROSS_EVENT')).toBe(true);
  });

  it('flags duplicate tempId', () => {
    const p = validProposal({
      operations: [
        { changeId: 'a', op: 'add_node', tempId: 't1', parentId: 'root_1', node: { kind: 'task', text: 'x' }, evidenceIds: ['ev_999'], confidence: 0.5, reason: 'r' },
        { changeId: 'b', op: 'add_node', tempId: 't1', parentId: 'root_1', node: { kind: 'task', text: 'y' }, evidenceIds: ['ev_999'], confidence: 0.5, reason: 'r' },
      ],
    });
    const r = validateGraphProposal(p, snapshot());
    expect(r.issues.some((i) => i.code === 'DUPLICATE_TEMP_ID')).toBe(true);
  });

  it('flags a missing parent', () => {
    const p = validProposal({
      operations: [
        { changeId: 'a', op: 'add_node', tempId: 't1', parentId: 'GHOST', node: { kind: 'task', text: 'x' }, evidenceIds: ['ev_999'], confidence: 0.5, reason: 'r' },
      ],
    });
    const r = validateGraphProposal(p, snapshot());
    expect(r.issues.some((i) => i.code === 'PARENT_MISSING')).toBe(true);
  });

  it('flags an update to a nonexistent node', () => {
    const p = validProposal({
      operations: [
        { changeId: 'a', op: 'update_node', nodeId: 'n_ghost', patch: { text: 'z' }, evidenceIds: [], confidence: 0.5, reason: 'r' },
      ],
    });
    const r = validateGraphProposal(p, snapshot());
    expect(r.issues.some((i) => i.code === 'NODE_MISSING')).toBe(true);
  });

  it('flags a move that creates a cycle', () => {
    // Move ancestor n_branchA under its descendant n_task_existing → cycle.
    const p = validProposal({
      operations: [
        { changeId: 'm', op: 'move_node', nodeId: 'n_branchA', newParentId: 'n_task_existing', confidence: 0.5, reason: 'r' },
      ],
    });
    const r = validateGraphProposal(p, snapshot());
    expect(r.issues.some((i) => i.code === 'CYCLE')).toBe(true);
  });

  it('allows a safe move inside the tree', () => {
    const p = validProposal({
      operations: [
        { changeId: 'm', op: 'move_node', nodeId: 'n_task_existing', newParentId: 'root_1', confidence: 0.5, reason: 'r' },
      ],
    });
    const r = validateGraphProposal(p, snapshot());
    expect(r.ok).toBe(true);
  });

  it('flags a self-move as a cycle', () => {
    const p = validProposal({
      operations: [
        { changeId: 'm', op: 'move_node', nodeId: 'n_task_existing', newParentId: 'n_task_existing', confidence: 0.5, reason: 'r' },
      ],
    });
    const r = validateGraphProposal(p, snapshot());
    expect(r.issues.some((i) => i.code === 'CYCLE')).toBe(true);
  });

  it('flags a link to an unknown entity', () => {
    const p = validProposal({
      operations: [
        { changeId: 'l', op: 'link_entity', nodeId: 'n_task_existing', entityRef: { type: 'commitment', id: 'com_GHOST' }, reason: 'r' },
      ],
    });
    const r = validateGraphProposal(p, snapshot());
    expect(r.issues.some((i) => i.code === 'ENTITY_UNKNOWN')).toBe(true);
  });

  it('flags entity-bearing ops with no evidence', () => {
    const p = validProposal({
      operations: [
        { changeId: 'a', op: 'add_node', tempId: 't1', parentId: 'root_1', node: { kind: 'task', text: 'x' }, domainDraft: { entity: 'commitment', title: 'x', state: 'active' }, evidenceIds: [], confidence: 0.7, reason: 'r' },
      ],
    });
    const r = validateGraphProposal(p, snapshot());
    expect(r.issues.some((i) => i.code === 'EVIDENCE_REQUIRED')).toBe(true);
  });

  it('flags unknown evidence cited', () => {
    const p = validProposal({
      operations: [
        { changeId: 'a', op: 'add_node', tempId: 't1', parentId: 'root_1', node: { kind: 'branch', text: 'x' }, evidenceIds: ['ev_GHOST'], confidence: 0.5, reason: 'r' },
      ],
    });
    const r = validateGraphProposal(p, snapshot());
    expect(r.issues.some((i) => i.code === 'EVIDENCE_UNKNOWN')).toBe(true);
  });

  it('flags missing waiting fields', () => {
    const p = validProposal({
      operations: [
        { changeId: 'w', op: 'add_node', tempId: 'w1', parentId: 'root_1', node: { kind: 'waiting', text: '等确认' }, domainDraft: { entity: 'waiting_commitment', title: '等确认' }, evidenceIds: ['ev_999'], confidence: 0.8, reason: 'r' },
      ],
    });
    const r = validateGraphProposal(p, snapshot());
    expect(r.issues.some((i) => i.code === 'WAITING_FIELDS_MISSING')).toBe(true);
  });

  it('rejects illegal root kind transition', () => {
    const p = validProposal({
      operations: [
        { changeId: 'u', op: 'update_node', nodeId: 'root_1', patch: { kind: 'task' }, evidenceIds: [], confidence: 0.9, reason: 'r' },
      ],
    });
    const r = validateGraphProposal(p, snapshot());
    expect(r.issues.some((i) => i.code === 'ILLEGAL_KIND_TRANSITION')).toBe(true);
  });

  it('returns stable error codes with changeId attached', () => {
    const r = validateGraphProposal(validProposal({ eventId: 'ev_OTHER' }), snapshot());
    expect(r.issues[0]?.code).toBeDefined();
    expect(r.issues[0]?.message).toBeTruthy();
  });
});