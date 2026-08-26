import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { V2Repository } from '../../../repositories/v2/repository';
import type {
  EventOperatorRun,
  EventGraphProposal,
  EventOperatorScope,
  GraphOperation,
} from '../../../domain/v2/eventOperator';
import type { GraphSnapshotBase } from '../../../domain/v2/eventGraphValidator';
import type { ApplyPlan } from '../../../domain/v2/eventGraphApplier';
import { FakeEventOperatorRuntime } from '../../harness/FakeEventOperatorRuntime';
import type { AgentRuntime, RuntimeRunSpec } from '../../harness/AgentRuntime';
import {
  startEventOperatorRun,
  applyEventGraphProposal,
  rejectEventGraphProposal,
  getPendingGraphProposal,
  cancelEventOperatorRun,
  type EventOperatorDeps,
} from '../eventOperatorService';
import { computeBaseRevision } from '../../../domain/v2/eventGraphValidator';
import { EventGraphProposalSchema } from '../../../domain/v2/eventOperator';
import { newId } from '../../../domain/v2/ulid';
import { createCommitment } from '../commitmentService';

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'dailyflow-eos-'));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

function repo(workspaceId = 'ws_eos') {
  return new V2Repository({ root, workspaceId });
}

const ROOT_NODE_ID = 'node_root_AAAAAAAAAAAAAAAA';
const MAP_ID = 'map_ev_AAAAAAAAAAAAAAAA';

/** A fresh, root-only event — the template decomposes the root into steps. */
function baseSnapshot(workspaceId = 'ws_eos', eventId = 'ev_AAAAAAAAAAAAAAAAAAAAAA'): GraphSnapshotBase {
  return {
    workspaceId,
    eventId,
    mindmapId: MAP_ID,
    mindmapUpdatedAt: '2026-08-23T00:00:00+08:00',
    eventStatus: 'active',
    nodes: [{ id: ROOT_NODE_ID, kind: 'root', text: '产品上线' }],
    edges: [],
    commitments: [],
    knownEntityIds: new Set(),
    knownEvidenceIds: new Set(['ev_AAAAAAAAAAAAAAAAAAAAAA']),
  };
}

function scope(eventId = 'ev_AAAAAAAAAAAAAAAAAAAAAA', workspaceId = 'ws_eos'): EventOperatorScope {
  return {
    workspaceId,
    eventId,
    mindmapId: MAP_ID,
    trigger: 'event_canvas',
    selectedContextRefs: [],
    contextBudgetBytes: 256 * 1024,
  };
}

interface Harness {
  deps: EventOperatorDeps;
  snapshotRef: { current: GraphSnapshotBase };
  writes: Array<{ scope: EventOperatorScope; plan: ApplyPlan; entities: Map<string, { type: 'commitment' | 'decision' | 'outcome'; id: string }> }>;
}

function makeHarness(eventId: string): Harness {
  const snapshotRef = { current: baseSnapshot('ws_eos', eventId) };
  const writes: Harness['writes'] = [];
  const deps: EventOperatorDeps = {
    runtime: new FakeEventOperatorRuntime({
      phases: ['collect', 'retrieve', 'extract', 'resolve', 'prepare'],
      deltas: 1,
      tools: ['read_mindmap'],
      proposal: true,
      result: { status: 'succeeded' },
    }),
    loadSnapshot: async () => snapshotRef.current,
    writeGraph: async ({ scope: s, plan, entities }) => {
      writes.push({ scope: s, plan, entities });
    },
  };
  return { deps, snapshotRef, writes };
}

/** Harness with NO runtime injected — exercises the shipped default template flight. */
function makePlainHarness(eventId: string): Harness {
  const snapshotRef = { current: baseSnapshot('ws_eos', eventId) };
  const writes: Harness['writes'] = [];
  const deps: EventOperatorDeps = {
    loadSnapshot: async () => snapshotRef.current,
    writeGraph: async ({ scope: s, plan, entities }) => {
      writes.push({ scope: s, plan, entities });
    },
  };
  return { deps, snapshotRef, writes };
}

class ModelProposalRuntime implements AgentRuntime {
  readonly runtimeId = 'deepseek-harness';
  async health() {
    return { ready: true, modelConfigured: true, sidecarAlive: false, toolkitSafe: true, degraded: true, runtimeVersion: 'test-model@1' };
  }
  async start(spec: RuntimeRunSpec) {
    const proposal = {
      baseRevision: spec.context.baseRevision!,
      summary: '模型建议：确认发布负责人',
      operations: [{
        changeId: 'model-change-1', op: 'add_node' as const, tempId: 'model-temp-1', parentId: ROOT_NODE_ID,
        node: { kind: 'question' as const, text: '谁负责最终发布？' },
        domainDraft: { entity: 'none' as const }, evidenceIds: [], confidence: 0.9, reason: '负责人尚未明确',
      }],
    };
    const events = [
      { type: 'run.started' as const, runId: 'dsh_model_run', at: new Date().toISOString() },
      { type: 'phase.changed' as const, phase: 'prepare' as const, at: new Date().toISOString() },
      { type: 'proposal.ready' as const, proposalId: 'pending_model', proposal, at: new Date().toISOString() },
      { type: 'run.completed' as const, result: { status: 'succeeded' as const }, at: new Date().toISOString() },
    ];
    return {
      runId: 'dsh_model_run',
      async cancel() {},
      async dispose() {},
      async *events() { for (const event of events) yield event; },
    };
  }
}

describe('eventOperatorService — Event Operator vertical', () => {
  it('starts a run, persists a pending graph proposal, and lands at waiting_review', async () => {
    const { deps } = makeHarness('ev_AAAAAAAAAAAAAAAAAAAAAA');
    const repository = repo();
    const { run, proposal, events } = await startEventOperatorRun(
      repository, 'ws_eos',
      { eventId: 'ev_AAAAAAAAAAAAAAAAAAAAAA', mindmapId: MAP_ID, trigger: 'event_canvas' },
      deps,
    );

    expect(run.status).toBe('waiting_review');
    expect(run.proposalId).toBe(proposal!.id);
    expect(events.map((e) => e.type)).toContain('run.started');
    expect(events.map((e) => e.type)).toContain('run.completed');
    expect(proposal!.baseRevision).toBeTruthy();
    expect(proposal!.operations.length).toBeGreaterThan(0);
    expect(proposal!.operations.every((op) => op.changeId && op.reason)).toBe(true);

    // Persisted and discoverable as the event's pending proposal.
    const persisted = await repository.getEventOperatorRun(run.id);
    expect(persisted?.proposalId).toBe(proposal!.id);
    expect((await getPendingGraphProposal(repository, 'ev_AAAAAAAAAAAAAAAAAAAAAA'))?.id).toBe(proposal!.id);
  });

  it('persists the real model operations instead of replacing them with template operations', async () => {
    const h = makePlainHarness('ev_AAAAAAAAAAAAAAAAAAAAAA');
    h.deps.runtime = new ModelProposalRuntime();
    const repository = repo();
    const result = await startEventOperatorRun(
      repository, 'ws_eos',
      { eventId: 'ev_AAAAAAAAAAAAAAAAAAAAAA', mindmapId: MAP_ID },
      h.deps,
    );
    expect(result.proposal?.summary).toBe('模型建议：确认发布负责人');
    expect(result.proposal?.operations).toEqual([
      expect.objectContaining({ changeId: 'model-change-1', op: 'add_node', node: expect.objectContaining({ text: '谁负责最终发布？' }) }),
    ]);
    expect(result.proposal?.operations.some((op) => op.op === 'add_node' && op.node.text.includes('第一步'))).toBe(false);
  });

  it('refuses to start a second run while a pending proposal exists', async () => {
    const { deps } = makeHarness('ev_AAAAAAAAAAAAAAAAAAAAAA');
    const repository = repo();
    await startEventOperatorRun(repository, 'ws_eos', { eventId: 'ev_AAAAAAAAAAAAAAAAAAAAAA', mindmapId: MAP_ID }, deps);
    await expect(startEventOperatorRun(repository, 'ws_eos', { eventId: 'ev_AAAAAAAAAAAAAAAAAAAAAA', mindmapId: MAP_ID }, deps))
      .rejects.toMatchObject({ code: 'pending_proposal_exists' });
  });

  it('apply materialises a real Commitment and writes the graph via the seam', async () => {
    const { deps, writes } = makeHarness('ev_AAAAAAAAAAAAAAAAAAAAAA');
    const repository = repo();
    const { proposal } = await startEventOperatorRun(repository, 'ws_eos', { eventId: 'ev_AAAAAAAAAAAAAAAAAAAAAA', mindmapId: MAP_ID }, deps);

    const result = await applyEventGraphProposal(repository, deps, proposal!.id, {});
    expect(result.staleChangeIds).toEqual([]);
    expect(result.createdCommitments).toBeGreaterThan(0);
    expect(result.proposal.status).toBe('accepted');

    // A real Commitment exists in the workspace.
    const commitments = await repository.listCommitments();
    expect(commitments.length).toBe(result.createdCommitments);

    // The graph writer got the node drafts + an entity ref for the commitment.
    expect(writes).toHaveLength(1);
    const { plan, entities } = writes[0];
    expect(plan.addNodes.length).toBeGreaterThan(0);
    const refs = [...entities.values()];
    expect(refs.some((r) => r.type === 'commitment')).toBe(true);

    // The run moved applying → succeeded.
    const run = await repository.getEventOperatorRun(proposal!.agentRunId);
    expect(run?.status).toBe('succeeded');
  });

  it('apply is rejected when the event changed after the proposal was built (stale base revision)', async () => {
    const h = makeHarness('ev_AAAAAAAAAAAAAAAAAAAAAA');
    const repository = repo();
    const { proposal } = await startEventOperatorRun(repository, 'ws_eos', { eventId: 'ev_AAAAAAAAAAAAAAAAAAAAAA', mindmapId: MAP_ID }, h.deps);

    // The map changed under us — a new node appeared.
    h.snapshotRef.current = {
      ...h.snapshotRef.current,
      nodes: [
        { id: ROOT_NODE_ID, kind: 'root', text: '产品上线' },
        { id: 'node_extra_AAAAAAAAAAAAAAAAAAA', kind: 'task', text: '被用户手动加了' },
      ],
      edges: [],
    };

    await expect(applyEventGraphProposal(repository, h.deps, proposal!.id, {}))
      .rejects.toMatchObject({ code: 'proposal_stale' });
    // Nothing was created.
    expect(await repository.listCommitments()).toHaveLength(0);
  });

  it('reject marks the proposal rejected without creating anything', async () => {
    const { deps } = makeHarness('ev_AAAAAAAAAAAAAAAAAAAAAA');
    const repository = repo();
    const { proposal } = await startEventOperatorRun(repository, 'ws_eos', { eventId: 'ev_AAAAAAAAAAAAAAAAAAAAAA', mindmapId: MAP_ID }, deps);

    await rejectEventGraphProposal(repository, proposal!.id, 'user_rejected');
    const rejected = await repository.getEventGraphProposal(proposal!.id);
    expect(rejected?.status).toBe('rejected');
    expect(await repository.listCommitments()).toHaveLength(0);
  });

  it('cancel on an unknown run returns null without side effects', async () => {
  const repository = repo();
  const noRun = await cancelEventOperatorRun(repository, 'eval_AAAAAAAAAAAAAAAAAAAAAAAAAA');
  expect(noRun).toBeNull();
});

  it('template proposal derives real content and passes graph validation', async () => {
    const eventId = 'ev_AAAAAAAAAAAAAAAAAAAAAA';
    const h = makeHarness(eventId);
    // A branch with an existing text should be decomposed.
    h.snapshotRef.current = {
      ...baseSnapshot('ws_eos', eventId),
      nodes: [
        { id: ROOT_NODE_ID, kind: 'root', text: '产品上线' },
        { id: 'node_br_AAAAAAAAAAAAAAAAAAAAA', kind: 'branch', text: '融资准备' },
      ],
      edges: [{ id: 'edge_1_AAAAAAAAAAAAAAAAAAAA', source: ROOT_NODE_ID, target: 'node_br_AAAAAAAAAAAAAAAAAAAAA' }],
    };
    const repository = repo();
    const { proposal } = await startEventOperatorRun(repository, 'ws_eos', { eventId, mindmapId: MAP_ID }, h.deps);
    const ops = proposal!.operations as GraphOperation[];
    // The branch is decomposed into a task next-step (+ waiting) child.
    expect(ops.some((o) => o.op === 'add_node' && (o as any).parentId === 'node_br_AAAAAAAAAAAAAAAAAAAAA')).toBe(true);
  });

  it('fails fast with NO injected runtime when no model is configured', async () => {
    const h = makePlainHarness('ev_AAAAAAAAAAAAAAAAAAAAAA');
    const repository = repo();
    const previous = process.env.V2_AI_PROVIDER;
    process.env.V2_AI_PROVIDER = 'local-deterministic';
    try {
      await expect(startEventOperatorRun(repository, 'ws_eos', { eventId: 'ev_AAAAAAAAAAAAAAAAAAAAAA', mindmapId: MAP_ID }, h.deps))
        .rejects.toMatchObject({ code: 'MODEL_NOT_CONFIGURED' });
    } finally {
      if (previous === undefined) delete process.env.V2_AI_PROVIDER;
      else process.env.V2_AI_PROVIDER = previous;
    }
    const runs = await repository.listEventOperatorRuns({ eventId: 'ev_AAAAAAAAAAAAAAAAAAAAAA' });
    expect(runs[0]?.status).toBe('failed');
  });

  it('does NOT duplicate commitments when the graph write fails and the user retries', async () => {
    const h = makeHarness('ev_AAAAAAAAAAAAAAAAAAAAAA');
    // First apply: entities are created, then the graph write throws.
    let failGraphWrite = true;
    const deps: EventOperatorDeps = {
      ...h.deps,
      writeGraph: async (ctx) => {
        if (failGraphWrite) { failGraphWrite = false; throw new Error('mindmap disappeared'); }
        await h.deps.writeGraph!(ctx);
      },
    };
    const repository = repo();
    const { proposal } = await startEventOperatorRun(repository, 'ws_eos', { eventId: 'ev_AAAAAAAAAAAAAAAAAAAAAA', mindmapId: MAP_ID }, deps);

    await expect(applyEventGraphProposal(repository, deps, proposal!.id, {})).rejects.toThrow(/mindmap disappeared/);
    // Transaction compensation removes entities when the atomic graph write fails.
    const afterFail = await repository.listCommitments();
    expect(afterFail).toHaveLength(0);
    const createdAfterFail = afterFail.length;

    // Retry: same proposal, graph write succeeds now — must NOT create more entities.
    const retried = await applyEventGraphProposal(repository, deps, proposal!.id, {});
    expect(retried.proposal.status).toBe('accepted');
    const afterRetry = await repository.listCommitments();
    expect(afterRetry.length).toBeGreaterThan(createdAfterFail);
    // And the graph was written the second time.
    expect((h.writes.length)).toBeGreaterThanOrEqual(1);
  });

  it('materialises task, waiting, decision and outcome with typed refs and idempotent replay', async () => {
    const h = makeHarness('ev_AAAAAAAAAAAAAAAAAAAAAA');
    const repository = repo();
    const existing = await createCommitment(repository, 'ws_eos', { title: 'Ship', outcome: 'Shipped', state: 'active', createdBy: 'user' });
    h.snapshotRef.current = {
      ...h.snapshotRef.current,
      commitments: [{ id: existing.id, updatedAt: existing.updatedAt, state: existing.state }],
      knownEntityIds: new Set([existing.id]),
    };
    const operations: GraphOperation[] = [
      { changeId: 'chg_task', op: 'add_node', tempId: 'tmp_task', parentId: ROOT_NODE_ID, node: { kind: 'task', text: 'Send update' }, domainDraft: { entity: 'commitment', title: 'Send update', state: 'active' }, evidenceIds: [], confidence: 1, reason: 'test' },
      { changeId: 'chg_wait', op: 'add_node', tempId: 'tmp_wait', parentId: ROOT_NODE_ID, node: { kind: 'waiting', text: 'Wait reply' }, domainDraft: { entity: 'waiting_commitment', title: 'Wait reply', waitingOnText: 'Investor', reviewAt: '2027-08-26T00:00:00.000Z' }, evidenceIds: [], confidence: 1, reason: 'test' },
      { changeId: 'chg_dec', op: 'add_node', tempId: 'tmp_dec', parentId: ROOT_NODE_ID, node: { kind: 'decision', text: 'Choose A' }, domainDraft: { entity: 'decision', title: 'Choose A', decision: 'Use A' }, evidenceIds: [], confidence: 1, reason: 'test' },
      { changeId: 'chg_out', op: 'add_node', tempId: 'tmp_out', parentId: ROOT_NODE_ID, node: { kind: 'outcome', text: 'Shipped' }, domainDraft: { entity: 'outcome', title: 'Shipped', outcomeSummary: 'Delivered', outcomeKind: 'delivered', commitmentId: existing.id }, evidenceIds: [], confidence: 1, reason: 'test' },
    ];
    const proposal = EventGraphProposalSchema.parse({ id: newId('gprop'), schemaVersion: 1, workspaceId: 'ws_eos', eventId: h.snapshotRef.current.eventId,
      mindmapId: MAP_ID, agentRunId: newId('eval'), baseRevision: computeBaseRevision(h.snapshotRef.current), status: 'pending', operations,
      summary: 'all entity kinds', riskLevel: 'low', createdAt: new Date().toISOString() });
    await repository.saveEventGraphProposal(proposal);
    const first = await applyEventGraphProposal(repository, h.deps, proposal.id, { idempotencyKey: 'apply-all-kinds' });
    expect(first.appliedChanges).toEqual(['chg_task', 'chg_wait', 'chg_dec', 'chg_out']);
    expect(await repository.listCommitments()).toHaveLength(3);
    expect(await repository.listDecisions()).toHaveLength(1);
    expect(await repository.listOutcomes()).toHaveLength(1);
    expect([...h.writes[0].entities.values()].map((item) => item.type).sort()).toEqual(['commitment', 'commitment', 'decision', 'outcome']);
    const persisted = await repository.getEventGraphProposal(proposal.id);
    expect(persisted?.createdEntities?.map((item) => item.type).sort()).toEqual(['commitment', 'commitment', 'decision', 'outcome']);

    const replay = await applyEventGraphProposal(repository, h.deps, proposal.id, { idempotencyKey: 'apply-all-kinds' });
    expect(replay.replayed).toBe(true);
    expect(h.writes).toHaveLength(1);
    expect(await repository.listCommitments()).toHaveLength(3);
  });

  it('compensates successful domain creates when a later waiting/outcome change fails', async () => {
    const h = makeHarness('ev_AAAAAAAAAAAAAAAAAAAAAA');
    const repository = repo();
    const operations: GraphOperation[] = [
      { changeId: 'chg_task', op: 'add_node', tempId: 'tmp_task', parentId: ROOT_NODE_ID, node: { kind: 'task', text: 'Valid first' }, domainDraft: { entity: 'commitment', title: 'Valid first', state: 'active' }, evidenceIds: [], confidence: 1, reason: 'test' },
      { changeId: 'chg_wait', op: 'add_node', tempId: 'tmp_wait', parentId: ROOT_NODE_ID, node: { kind: 'waiting', text: 'Invalid waiting' }, domainDraft: { entity: 'waiting_commitment', title: 'Invalid waiting' }, evidenceIds: [], confidence: 1, reason: 'test' },
      { changeId: 'chg_out', op: 'add_node', tempId: 'tmp_out', parentId: ROOT_NODE_ID, node: { kind: 'outcome', text: 'Invalid outcome' }, domainDraft: { entity: 'outcome', outcomeSummary: 'No parent', commitmentId: 'com_DOES_NOT_EXIST' }, evidenceIds: [], confidence: 1, reason: 'test' },
    ];
    const proposal = EventGraphProposalSchema.parse({ id: newId('gprop'), schemaVersion: 1, workspaceId: 'ws_eos', eventId: h.snapshotRef.current.eventId,
      mindmapId: MAP_ID, agentRunId: newId('eval'), baseRevision: computeBaseRevision(h.snapshotRef.current), status: 'pending', operations,
      summary: 'failure compensation', riskLevel: 'low', createdAt: new Date().toISOString() });
    await repository.saveEventGraphProposal(proposal);
    await expect(applyEventGraphProposal(repository, h.deps, proposal.id, { idempotencyKey: 'apply-fail' }))
      .rejects.toMatchObject({ code: 'graph_domain_apply_failed' });
    expect(await repository.listCommitments()).toEqual([]);
    expect(await repository.listOutcomes()).toEqual([]);
    expect(h.writes).toEqual([]);
  });
});
