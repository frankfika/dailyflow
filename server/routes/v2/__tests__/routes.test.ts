/**
 * Integration test: full HTTP flow against the v2 router.
 *
 * Boots the Express app, uses a temp workspace, and exercises the spec
 * section 26 acceptance scenario end-to-end over the network boundary.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { v2Router } from '../index';
import { loadConfig } from '../../../services/config';
import { saveConfig } from '../../../services/config';

let app: express.Express;
let workspace: string;
let configDir: string;
let server: any;
let previousConfigFile: string | undefined;

beforeAll(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'df-v2-routes-'));
  configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'df-v2-config-'));
  previousConfigFile = process.env.DAILYFLOW_CONFIG_FILE;
  process.env.DAILYFLOW_CONFIG_FILE = path.join(configDir, 'config.json');
  process.env.DAILYFLOW_V2_WORKSPACE_ROOT = workspace;
  process.env.DAILYFLOW_V2_WORKSPACE_ID = 'ws_test';
  process.env.V2_AI_PROVIDER = 'local-deterministic';
  process.env.V2_AI_API_KEY = '';

  // Pre-populate ~/.dailyflow/config.json with v2 flags + workspaceRoot
  const cfg = await loadConfig();
  await saveConfig({
    ...cfg,
    workspaceRoot: workspace,
    workspaces: [{
      id: 'ws_test',
      name: 'V2 test workspace',
      path: workspace,
      createdAt: new Date().toISOString(),
    }],
    activeWorkspaceId: 'ws_test',
    v2: { enabled: true, inboxV2: true, todayV2: true, memoryV2: true, connectorsV2: false, aiEnabled: false, contextBudgetBytes: 32000 } as any,
  });

  app = express();
  app.use(cors());
  app.use(express.json({ limit: '20mb' }));
  app.use('/api/v2', v2Router);
});

afterAll(async () => {
  await fs.rm(workspace, { recursive: true, force: true });
  await fs.rm(configDir, { recursive: true, force: true });
  if (previousConfigFile === undefined) {
    delete process.env.DAILYFLOW_CONFIG_FILE;
  } else {
    process.env.DAILYFLOW_CONFIG_FILE = previousConfigFile;
  }
});

async function post(path: string, body: unknown) {
  return fetch(`http://localhost:9999/api/v2${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).then(r => r.json().then(j => ({ status: r.status, body: j })));
}

async function get(path: string) {
  return fetch(`http://localhost:9999/api/v2${path}`).then(r => r.json().then(j => ({ status: r.status, body: j })));
}

// We need a real server for these tests because the v2 router uses async
// middleware. We start it in beforeAll.
describe('v2 routes — full spec section 26 acceptance scenario', () => {
  it('runs end-to-end through HTTP', async () => {
    // Start a real server
    server = app.listen(9999);
    try {
      // 1. Status
      const status = await get('/status');
      expect(status.status).toBe(200);
      expect(status.body.flags.enabled).toBe(true);

      // 2. Capture meeting minutes
      const capture = await post('/inbox/capture', {
        kind: 'quick_capture',
        title: '周会',
        body: '讨论了 Q3 计划。\nAlex 答应下周三前给到技术方案。\n我承诺本周五前向 Zhang 发出更新后的合作方案。\n决定：采用两档定价。',
      });
      expect(capture.status).toBe(201);
      const sourceId = capture.body.source.id;

      // 3. Inbox lists the source
      const inbox = await get('/inbox');
      expect(inbox.status).toBe(200);
      expect(inbox.body.items.find((s: { id: string }) => s.id === sourceId)).toBeDefined();

      // Reading a note must not trigger a detached whole-file write that can
      // race and overwrite a subsequent autosave.
      const saveProbeNote = await post('/notes', { body: 'autosave probe' });
      expect(saveProbeNote.status).toBe(201);
      const saveProbeCreatedAt = saveProbeNote.body.note.createdAt as string;
      const saveProbePath = path.join(
        workspace,
        '.dailyflow',
        'notes',
        saveProbeCreatedAt.slice(0, 4),
        saveProbeCreatedAt.slice(5, 7),
        `${saveProbeNote.body.note.id}.md`,
      );
      const noteBeforeRead = await fs.readFile(saveProbePath, 'utf8');
      const readOnlyNote = await get(`/notes/${saveProbeNote.body.note.id}`);
      expect(readOnlyNote.status).toBe(200);
      // Give any accidentally detached write enough time to finish.
      await new Promise((resolve) => setTimeout(resolve, 25));
      expect(await fs.readFile(saveProbePath, 'utf8')).toBe(noteBeforeRead);

      // 4. Process: AI returns a fallback (no provider)
      const processed = await post(`/sources/${sourceId}/process`, {});
      expect(processed.status).toBe(200);
      expect(processed.body.fallback).toBe(true);
      expect(processed.body.job.status).toMatch(/succeeded|waiting_review/);
      const resumedProcessing = await post(`/sources/${sourceId}/process`, {});
      expect(resumedProcessing.status).toBe(200);
      expect(resumedProcessing.body.resumed).toBe(true);
      expect(resumedProcessing.body.job.id).toBe(processed.body.job.id);

      // Durable job can be recovered after the processing request returns.
      const processedJob = await get(`/jobs/${processed.body.job.id}`);
      expect(processedJob.status).toBe(200);
      expect(processedJob.body.job.entityRef).toEqual({ type: 'source', id: sourceId });

      // Generic jobs are idempotent and can be cancelled through the API.
      const jobBody = {
        kind: 'import',
        entityRef: { type: 'workspace', id: 'ws_test' },
        idempotencyKey: 'route-test-import-job',
      };
      const createdJob = await post('/jobs', jobBody);
      const duplicateJob = await post('/jobs', jobBody);
      expect(duplicateJob.body.job.id).toBe(createdJob.body.job.id);
      const cancelledJob = await post(`/jobs/${createdJob.body.job.id}/cancel`, {});
      expect(cancelledJob.body.job.status).toBe('cancelled');

      // 5. Manually create a commitment (user typed the data)
      const create = await post('/commitments', {
        title: '本周五前向 Zhang 发出更新后的合作方案',
        outcome: 'Zhang 收到包含最新报价和实施范围的合作方案。',
        state: 'active',
        importance: 'high',
        dueAt: '2026-07-24T17:00:00+08:00',
        dueConfidence: 'explicit',
        sourceIds: [sourceId],
      });
      expect(create.status).toBe(201);
      const comId = create.body.commitment.id;

      // 6. Reload: commitment is still there
      const reload = await get(`/commitments/${comId}`);
      expect(reload.status).toBe(200);
      expect(reload.body.commitment.title).toContain('Zhang');

      // 7. Generate today's plan
      const today = new Date().toISOString().slice(0, 10);
      const plan = await post('/plans/generate', { date: today, availableMinutes: 240 });
      expect(plan.status).toBe(200);
      const item = plan.body.plan.items.find((i: { commitmentId: string }) => i.commitmentId === comId);
      expect(item).toBeDefined();

      // 8. Re-plan with reduced capacity
      const replan = await post('/plans/generate', {
        date: today,
        brief: 'Only 2 hours in the afternoon',
      });
      expect(replan.status).toBe(200);
      expect(replan.body.plan.availableMinutes).toBe(120);

      // 9. Set to wait on Alex
      const wait = await post(`/commitments/${comId}/wait`, {
        waitingOnText: 'Alex',
        reviewAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      });
      expect(wait.status).toBe(200);
      expect(wait.body.commitment.state).toBe('waiting');

      // 10. Complete with outcome
      const complete = await post(`/commitments/${comId}/complete`, {
        outcomeKind: 'sent',
        outcomeSummary: '已通过邮件向 Zhang 发出合作方案。',
      });
      expect(complete.status).toBe(200);
      expect(complete.body.commitment.state).toBe('completed');
      expect(complete.body.outcome.id).toMatch(/^out_/);

      // 11. Memory search
      const search = await get('/memory/search?q=Zhang');
      expect(search.status).toBe(200);
      expect(search.body.hits.length).toBeGreaterThan(0);

      // 12. History
      const history = await get(`/commitments/${comId}/history`);
      expect(history.status).toBe(200);
      expect(history.body.events.length).toBeGreaterThan(0);

      // 13. Connectors list
      const connectors = await get('/connectors');
      expect(connectors.status).toBe(200);
      const blocked = connectors.body.items.find((c: { id: string }) => c.id === 'gmail');
      expect(blocked.blockedBy).toBe('external_authorization');

      // 14. Calendar sync is blocked
      const sync = await post('/connectors/google-calendar/sync', {});
      expect(sync.status).toBe(200);
      expect(sync.body.ok).toBe(false);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
