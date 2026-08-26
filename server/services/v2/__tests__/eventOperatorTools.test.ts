import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { V2Repository } from '../../../repositories/v2/repository';
import { EventOperatorRunSchema, type EventOperatorScope } from '../../../domain/v2/eventOperator';
import { computeBaseRevision, type GraphSnapshotBase } from '../../../domain/v2/eventGraphValidator';
import type { MindMap } from '../../../types/mindmap';
import type { EventSessionProjection } from '../eventSessionProjection';
import { EventOperatorToolGateway, validateToolWhitelist } from '../eventOperatorTools';

let root: string;
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'dailyflow-tools-')); });
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

const ids = {
  run: 'eval_01K3BBBBBBBBBBBBBBBBBBBBBB', event: 'event_01K3BBBBBBBBBBBBBBBBBBBBB',
  map: 'mindmap_01K3BBBBBBBBBBBBBBBBBBB', root: 'node_01K3BBBBBBBBBBBBBBBBBBBBB',
};

async function fixture() {
  const repo = new V2Repository({ root, workspaceId: 'ws_tools' });
  const now = '2026-08-26T00:00:00.000Z';
  const scope: EventOperatorScope = { workspaceId: 'ws_tools', eventId: ids.event, mindmapId: ids.map, trigger: 'event_canvas', selectedContextRefs: [], contextBudgetBytes: 65536 };
  const run = EventOperatorRunSchema.parse({ id: ids.run, schemaVersion: 2, workspaceId: 'ws_tools', eventId: ids.event, mindmapId: ids.map,
    runtimeId: 'deepseek-harness', runtimeVersion: 'test', modelProvider: 'test', model: 'test', promptVersion: '1', scope,
    phase: 'prepare', status: 'running', contextManifest: [], metrics: {}, idempotencyKey: 'tool-run', createdAt: now, updatedAt: now });
  await repo.saveEventOperatorRun(run);
  const mindmap: MindMap = { id: ids.map, title: 'Launch', rootId: ids.root, version: 2, createdAt: now, updatedAt: now,
    nodes: [{ id: ids.root, text: 'Launch', kind: 'root', position: { x: 1, y: 2 } }], edges: [] };
  const snapshot: GraphSnapshotBase = { workspaceId: 'ws_tools', eventId: ids.event, mindmapId: ids.map, mindmapUpdatedAt: now,
    eventStatus: 'active', nodes: [{ id: ids.root, text: 'Launch', kind: 'root' }], edges: [], commitments: [], knownEntityIds: new Set(), knownEvidenceIds: new Set() };
  const projection: EventSessionProjection = {
    schemaVersion: 1, workspaceId: 'ws_tools', event: { id: ids.event, title: 'Launch', status: 'active', context: 'work', progress: { done: 0, total: 0 }, tags: [], createdAt: now, updatedAt: now },
    mindmap: { id: ids.map, rootNodeId: ids.root, updatedAt: now, nodeCount: 1, edgeCount: 0, rootsAndBranches: [{ id: ids.root, text: 'Launch', kind: 'root' }] },
    linked: { noteIds: [], sourceIds: [], evidenceIds: [], commitmentIds: [], decisionIds: [], outcomeIds: [] }, commitments: [], recentDecisions: [], selectedContext: [],
    budget: { maxBytes: 65536, projectedBytes: 100, truncated: false }, contextManifest: [], manifestHash: 'a'.repeat(64),
  };
  return { repo, run, mindmap, snapshot, gateway: new EventOperatorToolGateway({ repo, run, projection, mindmap, snapshot }) };
}

describe('Event Operator typed tool gateway', () => {
  it('propose_graph_patch only writes a pending Proposal, then complete concludes the Run', async () => {
    const { repo, gateway, snapshot, mindmap } = await fixture();
    const beforeMap = JSON.stringify(mindmap);
    const proposed = await gateway.execute('propose_graph_patch', {
      baseRevision: computeBaseRevision(snapshot), summary: 'Add a review branch',
      operations: [{ changeId: 'chg_1', op: 'add_node', tempId: 'tmp_1', parentId: ids.root,
        node: { kind: 'branch', text: 'Review' }, evidenceIds: [], confidence: 0.8, reason: 'Structured follow-up' }],
    }) as { ok: true; proposalId: string };
    expect(proposed.ok).toBe(true);
    expect(await repo.listCommitments()).toEqual([]);
    expect(JSON.stringify(mindmap)).toBe(beforeMap);
    expect((await repo.getEventGraphProposal(proposed.proposalId))?.status).toBe('pending');
    await gateway.execute('complete_event_run', { proposalId: proposed.proposalId, userFacingSummary: 'Ready' });
    expect((await repo.getEventOperatorRun(ids.run))?.status).toBe('waiting_review');
    await expect(gateway.execute('read_event', {})).rejects.toMatchObject({ code: 'RUN_ALREADY_CONCLUDED' });
  });

  it('never exposes coordinates and rejects unsafe tool lists', async () => {
    const { gateway } = await fixture();
    const result = await gateway.execute('read_mindmap', {}) as { nodes: unknown[] };
    expect(JSON.stringify(result)).not.toContain('position');
    expect(JSON.stringify(result)).not.toContain('"x"');
    expect(validateToolWhitelist([...gateway.listTools(), 'bash'])).toMatchObject({ safe: false, unauthorized: ['bash'] });
  });
});
