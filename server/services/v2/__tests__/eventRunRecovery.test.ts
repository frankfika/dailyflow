import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { V2Repository } from '../../../repositories/v2/repository';
import { EventOperatorRunSchema } from '../../../domain/v2/eventOperator';
import { newId } from '../../../domain/v2/ulid';
import { prepareEventOperatorRunRetry, recoverEventOperatorRuns } from '../eventRunRecovery';

let root: string;
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'dailyflow-recovery-')); });
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

async function saveRun(repo: V2Repository, status: 'running' | 'waiting_review') {
  const now = '2026-08-26T00:00:00.000Z';
  const id = newId('eval');
  const eventId = `event_${newId('run')}`;
  const mindmapId = `mindmap_${newId('run')}`;
  await repo.saveEventOperatorRun(EventOperatorRunSchema.parse({
    id, schemaVersion: 2, workspaceId: repo.workspaceId, eventId, mindmapId,
    runtimeId: 'deepseek-harness', runtimeVersion: 'test', runtimeSessionId: `session-${id}`,
    modelProvider: 'test', model: 'test', promptVersion: '1',
    scope: { workspaceId: repo.workspaceId, eventId, mindmapId, trigger: 'event_canvas', selectedContextRefs: [], contextBudgetBytes: 4096 },
    phase: status === 'waiting_review' ? 'review' : 'retrieve', status, contextManifest: [], metrics: { startedAt: now },
    idempotencyKey: id, createdAt: now, updatedAt: now,
  }));
  return id;
}

describe('Event Operator restart recovery', () => {
  it('marks a lost running session retryable and leaves waiting review recoverable', async () => {
    const repo = new V2Repository({ root, workspaceId: 'ws_recovery' });
    const runningId = await saveRun(repo, 'running');
    const reviewId = await saveRun(repo, 'waiting_review');
    const results = await recoverEventOperatorRuns(repo);
    expect(results.find((item) => item.run.id === runningId)?.action).toBe('marked_retryable_failed');
    expect((await repo.getEventOperatorRun(runningId))?.error?.code).toBe('RUNTIME_SESSION_LOST');
    expect(results.find((item) => item.run.id === reviewId)?.action).toBe('resume_review');
    expect((await prepareEventOperatorRunRetry(repo, runningId))?.status).toBe('queued');
  });
});
