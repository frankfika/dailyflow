import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { V2Repository } from '../repository';
import { EventOperatorRunSchema } from '../../../domain/v2/eventOperator';
import { persistRuntimeEvent, replayRuntimeEvents, sanitizeRuntimeValue, toSseFrame } from '../../../services/v2/runtimeEventPersistence';

let root: string;
const RUN_ID = 'eval_01K3AAAAAAAAAAAAAAAAAAAAAA';

beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'dailyflow-run-events-')); });
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

function repository(workspaceId = 'ws_events') { return new V2Repository({ root, workspaceId }); }

async function seedRun(repo: V2Repository) {
  const now = '2026-08-26T00:00:00.000Z';
  await repo.saveEventOperatorRun(EventOperatorRunSchema.parse({
    id: RUN_ID, schemaVersion: 2, workspaceId: repo.workspaceId,
    eventId: 'event_01K3AAAAAAAAAAAAAAAAAAAAA', mindmapId: 'mindmap_01K3AAAAAAAAAAAAAAAAAAA',
    runtimeId: 'deepseek-harness', runtimeVersion: 'test', modelProvider: 'test', model: 'test', promptVersion: '1',
    scope: { workspaceId: repo.workspaceId, eventId: 'event_01K3AAAAAAAAAAAAAAAAAAAAA', mindmapId: 'mindmap_01K3AAAAAAAAAAAAAAAAAAA', trigger: 'event_canvas', selectedContextRefs: [], contextBudgetBytes: 4096 },
    phase: 'collect', status: 'running', contextManifest: [], metrics: {}, idempotencyKey: 'run-test', createdAt: now, updatedAt: now,
  }));
}

describe('durable Event Operator RuntimeEvent log', () => {
  it('assigns monotonic cursors and deduplicates concurrent runtime events', async () => {
    const repo = repository();
    await seedRun(repo);
    const event = { type: 'phase.changed' as const, phase: 'collect' as const, at: '2026-08-26T00:00:01.000Z' };
    const writes = await Promise.all(Array.from({ length: 12 }, () => persistRuntimeEvent(repo, RUN_ID, event)));
    expect(writes.filter((item) => item.appended)).toHaveLength(1);
    await persistRuntimeEvent(repo, RUN_ID, { type: 'phase.changed', phase: 'retrieve', at: '2026-08-26T00:00:02.000Z' });
    const page = await replayRuntimeEvents(repo, RUN_ID, '1');
    expect(page.items).toHaveLength(1);
    expect(page.items[0].cursor).toBe('2');
    expect((await repo.getEventOperatorRun(RUN_ID))?.lastEventCursor).toBe('2');
    expect(toSseFrame(page.items[0])).toContain('id: 2\nevent: phase.changed\n');
  });

  it('redacts secrets before persistence and isolates foreign workspaces', async () => {
    const repo = repository();
    await seedRun(repo);
    await persistRuntimeEvent(repo, RUN_ID, {
      type: 'tool.started', callId: 'call_1', tool: 'read_event',
      safeArgs: { authorization: 'Bearer secret-token', nested: { apiKey: 'sk-very-secret-value' } },
      at: '2026-08-26T00:00:01.000Z',
    });
    const stored = await repo.readEventOperatorRunEvents(RUN_ID);
    expect(JSON.stringify(stored)).not.toContain('secret-token');
    expect(JSON.stringify(stored)).not.toContain('very-secret');
    expect(sanitizeRuntimeValue({ password: 'hello' })).toEqual({ password: '[REDACTED]' });
    expect(await repository('ws_foreign').readEventOperatorRunEvents(RUN_ID)).toEqual([]);
  });

  it('rejects malformed cursors instead of silently replaying from zero', async () => {
    const repo = repository();
    await seedRun(repo);
    await expect(repo.pageEventOperatorRunEvents(RUN_ID, { afterCursor: 'oops' })).rejects.toMatchObject({ code: 'invalid_cursor' });
  });
});
