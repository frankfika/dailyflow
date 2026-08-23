import { describe, it, expect } from 'vitest';
import { buildGraphApplyPlan } from '../eventGraphApplier';
import { computeBaseRevision } from '../eventGraphValidator';
import type { EventGraphProposal, GraphOperation } from '../eventOperator';

const T0 = '2026-08-23T00:00:00+08:00';
const baseSnapshot = () => ({
  mindmapId: 'map_1',
  mindmapUpdatedAt: T0,
  eventStatus: 'active',
  nodes: [{ id: 'root_1', kind: 'root', text: '项目' }],
  edges: [],
  commitments: [{ id: 'com_1', updatedAt: T0, state: 'active' }],
});
const BASE = computeBaseRevision(baseSnapshot());
const snapshot = () => baseSnapshot();

const ops: GraphOperation[] = [
  {
    changeId: 'chg_task',
    op: 'add_node',
    tempId: 't_task',
    parentId: 'root_1',
    node: { kind: 'task', text: '给投资人发更新' },
    domainDraft: { entity: 'commitment', title: '给投资人发更新', state: 'active', dueAt: '2026-08-25T09:00:00+08:00', dueConfidence: 'explicit' },
    evidenceIds: ['ev_1'],
    confidence: 0.9,
    reason: '会议明确',
  },
  {
    changeId: 'chg_wait',
    op: 'add_node',
    tempId: 't_wait',
    parentId: 'root_1',
    node: { kind: 'waiting', text: '等张总确认' },
    domainDraft: { entity: 'waiting_commitment', title: '等张总确认', waitingOnText: '张总', reviewAt: '2026-08-26T09:00:00+08:00' },
    evidenceIds: ['ev_1'],
    confidence: 0.8,
    reason: '待办',
  },
  {
    changeId: 'chg_dec',
    op: 'add_node',
    tempId: 't_dec',
    parentId: 'root_1',
    node: { kind: 'decision', text: '确定用 A 方案' },
    domainDraft: { entity: 'decision', title: '确定用 A 方案', decision: '采用 A 方案推进' },
    evidenceIds: ['ev_2'],
    confidence: 0.95,
    reason: '讨论结论',
  },
  {
    changeId: 'chg_branch',
    op: 'add_node',
    tempId: 't_branch',
    parentId: 'root_1',
    node: { kind: 'branch', text: '融资分支' },
    evidenceIds: [],
    confidence: 0.6,
    reason: '结构补充',
  },
  {
    changeId: 'chg_move',
    op: 'move_node',
    nodeId: 't_task',
    newParentId: 'root_1',
    confidence: 0.5,
    reason: '调整挂载点',
  },
];

const proposal = (opsList: GraphOperation[] = ops, baseRevision = BASE): Parameters<typeof buildGraphApplyPlan>[0] => ({
  baseRevision,
  operations: opsList,
});

describe('buildGraphApplyPlan', () => {
  it('maps task + commitment draft to one commitment create + entityRef', () => {
    const plan = buildGraphApplyPlan(proposal(), snapshot(), undefined, undefined);
    const task = plan.addNodes.find((n) => n.tempId === 't_task')!;
    expect(task.entityRefType).toBe('commitment');
    const c = plan.createChanges.find((c) => c.changeId === 'chg_task')!;
    expect(c.entity).toBe('commitment');
    expect(c.op).toBe('create');
    expect(c.draft.title).toBe('给投资人发更新');
    expect(c.draft.dueAt).toBe('2026-08-25T09:00:00+08:00');
  });

  it('maps a waiting node to a Commitment in waiting state with waiting fields', () => {
    const plan = buildGraphApplyPlan(proposal(), snapshot(), undefined, undefined);
    const w = plan.createChanges.find((c) => c.changeId === 'chg_wait')!;
    expect(w.entity).toBe('commitment');
    expect(w.draft.state).toBe('waiting');
    expect(w.draft.waitingOnText).toBe('张总');
    expect(w.draft.reviewAt).toBe('2026-08-26T09:00:00+08:00');
  });

  it('maps a decision node to a decision create', () => {
    const plan = buildGraphApplyPlan(proposal(), snapshot(), undefined, undefined);
    const d = plan.createChanges.find((c) => c.changeId === 'chg_dec')!;
    expect(d.entity).toBe('decision');
    expect(d.draft.decision).toBe('采用 A 方案推进');
  });

  it('treats a structural branch as no domain entity', () => {
    const plan = buildGraphApplyPlan(proposal(), snapshot(), undefined, undefined);
    const branch = plan.addNodes.find((n) => n.tempId === 't_branch')!;
    expect(branch.entityRefType).toBeNull();
    expect(plan.createChanges.some((c) => c.changeId === 'chg_branch')).toBe(false);
  });

  it('passes through move ops without creating entities', () => {
    const plan = buildGraphApplyPlan(proposal(), snapshot(), undefined, undefined);
    expect(plan.moveNodes.map((m) => m.changeId)).toContain('chg_move');
  });

  it('honours a selection subset and marks the rest skipped', () => {
    const plan = buildGraphApplyPlan(proposal(), snapshot(), ['chg_task'], undefined);
    expect(plan.createChanges.map((c) => c.changeId)).toEqual(['chg_task']);
    expect(plan.skippedChangeIds).toContain('chg_dec');
    expect(plan.addNodes.map((n) => n.tempId)).toEqual(['t_task']);
  });

  it('never applies ops when the base revision is stale', () => {
    const plan = buildGraphApplyPlan(proposal(ops, 'stale-revision'), snapshot(), undefined, undefined);
    expect(plan.createChanges).toHaveLength(0);
    expect(plan.addNodes).toHaveLength(0);
    expect(plan.staleChangeIds).toHaveLength(ops.length);
  });

  it('applies a text override to the node and the created title', () => {
    const plan = buildGraphApplyPlan(proposal(), snapshot(), undefined, {
      chg_task: { text: '今天给投资人发更新' },
    });
    const node = plan.addNodes.find((n) => n.tempId === 't_task')!;
    expect(node.text).toBe('今天给投资人发更新');
    const c = plan.createChanges.find((c) => c.changeId === 'chg_task')!;
    expect(c.draft.title).toBe('今天给投资人发更新');
  });

  it('treats every changeId deterministically (same input → same plan)', () => {
    const a = buildGraphApplyPlan(proposal(), snapshot(), undefined, undefined);
    const b = buildGraphApplyPlan(proposal(), snapshot(), undefined, undefined);
    expect(a.createChanges.map((c) => c.changeId)).toEqual(b.createChanges.map((c) => c.changeId));
    expect(a.addNodes.map((n) => n.tempId)).toEqual(b.addNodes.map((n) => n.tempId));
  });
});