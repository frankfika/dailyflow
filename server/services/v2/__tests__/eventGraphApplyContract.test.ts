import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { V2Repository } from '../../../repositories/v2/repository';
import { EventGraphProposalSchema } from '../../../domain/v2/eventOperator';
import { graphApplyRequestHash, inspectGraphApplyReplay, withEventGraphApplyLock } from '../eventGraphApplyContract';

let root: string;
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'dailyflow-graph-lock-')); });
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

describe('Graph Proposal apply contract', () => {
  it('serializes concurrent applies across repository instances', async () => {
    const first = new V2Repository({ root, workspaceId: 'ws_lock' });
    const second = new V2Repository({ root, workspaceId: 'ws_lock' });
    const proposalId = 'gprop_01K3CCCCCCCCCCCCCCCCCCCCCC';
    let active = 0;
    let maxActive = 0;
    await Promise.all(Array.from({ length: 8 }, (_, index) => withEventGraphApplyLock(index % 2 ? first : second, proposalId, async () => {
      active += 1; maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
    })));
    expect(maxActive).toBe(1);
  });

  it('replays the same request and rejects key reuse with different selection', () => {
    const request = { idempotencyKey: 'apply-1', selection: ['chg_1'], overrides: {} };
    const proposal = EventGraphProposalSchema.parse({
      id: 'gprop_01K3CCCCCCCCCCCCCCCCCCCCCC', schemaVersion: 1, workspaceId: 'ws_lock',
      eventId: 'event_01K3CCCCCCCCCCCCCCCCCCCCC', mindmapId: 'mindmap_01K3CCCCCCCCCCCCCCCCCC',
      agentRunId: 'eval_01K3CCCCCCCCCCCCCCCCCCCCCC', baseRevision: 'rev', status: 'partially_accepted',
      operations: [{ changeId: 'chg_1', op: 'add_node', tempId: 'tmp_1', parentId: 'root', node: { kind: 'branch', text: 'A' }, evidenceIds: [], confidence: 1, reason: 'A' }],
      summary: 'A', riskLevel: 'low', createdAt: '2026-08-26T00:00:00.000Z', acceptedChangeIds: ['chg_1'],
      applyReceipt: { idempotencyKey: request.idempotencyKey, requestHash: graphApplyRequestHash(request), appliedAt: '2026-08-26T00:00:01.000Z', acceptedChangeIds: ['chg_1'] },
    });
    expect(inspectGraphApplyReplay(proposal, request)).toMatchObject({ replayed: true, appliedChanges: ['chg_1'] });
    expect(() => inspectGraphApplyReplay(proposal, { ...request, selection: ['chg_2'] })).toThrowError(expect.objectContaining({ code: 'IDEMPOTENCY_KEY_REUSED' }));
  });
});
