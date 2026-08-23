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
import {
  startEventOperatorRun,
  applyEventGraphProposal,
  rejectEventGraphProposal,
  getPendingGraphProposal,
  cancelEventOperatorRun,
  type EventOperatorDeps,
} from '../eventOperatorService';

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

  it('produces a proposal with NO injected runtime (shipped default template flight)', async () => {
    // Regression: the empty default Fake emitted only run.started, so the
    // HTTP path never produced a proposition ("AI 推进" was inert).
    const h = makePlainHarness('ev_AAAAAAAAAAAAAAAAAAAAAA');
    const repository = repo();
    const { run, proposal } = await startEventOperatorRun(repository, 'ws_eos', { eventId: 'ev_AAAAAAAAAAAAAAAAAAAAAA', mindmapId: MAP_ID }, h.deps);
    expect(proposal).not.toBeNull();
    expect(run.status).toBe('waiting_review');
    expect(run.proposalId).toBe(proposal!.id);
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
    // Entities were created by the failed attempt.
    const afterFail = await repository.listCommitments();
    expect(afterFail.length).toBeGreaterThan(0);
    const createdAfterFail = afterFail.length;

    // Retry: same proposal, graph write succeeds now — must NOT create more entities.
    const retried = await applyEventGraphProposal(repository, deps, proposal!.id, {});
    expect(retried.proposal.status).toBe('accepted');
    const afterRetry = await repository.listCommitments();
    expect(afterRetry.length).toBe(createdAfterFail);
    // And the graph was written the second time.
    expect((h.writes.length)).toBeGreaterThanOrEqual(1);
  });
});