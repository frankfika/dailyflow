/**
 * End-to-end route test for the Proactive Proposal endpoints.
 *
 * Spins up the v2 router, seeds an overdue commitment, and asserts that
 * GET /proactive/scan returns the proposal and that POST /proactive/:id/action
 * records the dismissal.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { v2Router } from '../../../routes/v2/index';
import { saveConfig } from '../../../services/config';
import { bootstrapV2 } from '../workspaceContext';
import { createCommitment } from '../commitmentService';

let app: express.Express;
let server: any;
let workspace: string;
let configDir: string;
let previousConfigFile: string | undefined;
let previousConfigEnv: string | undefined;
let previousProactiveConfig: string | undefined;
let previousProactiveHistory: string | undefined;
let previousWorkspaceRoot: string | undefined;
let previousWorkspaceId: string | undefined;

beforeAll(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'df-v2-proactive-routes-'));
  configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'df-v2-proactive-cfg-'));
  previousConfigFile = process.env.DAILYFLOW_CONFIG_FILE;
  previousProactiveConfig = process.env.DAILYFLOW_PROACTIVE_CONFIG_FILE;
  previousProactiveHistory = process.env.DAILYFLOW_PROACTIVE_HISTORY_FILE;
  previousWorkspaceRoot = process.env.DAILYFLOW_V2_WORKSPACE_ROOT;
  previousWorkspaceId = process.env.DAILYFLOW_V2_WORKSPACE_ID;
  previousConfigEnv = process.env.V2_AI_PROVIDER;
  process.env.DAILYFLOW_CONFIG_FILE = path.join(configDir, 'config.json');
  process.env.DAILYFLOW_PROACTIVE_CONFIG_FILE = path.join(workspace, 'proactive.json');
  process.env.DAILYFLOW_PROACTIVE_HISTORY_FILE = path.join(workspace, 'proactive_history.json');
  process.env.DAILYFLOW_V2_WORKSPACE_ROOT = workspace;
  process.env.DAILYFLOW_V2_WORKSPACE_ID = 'ws_proactive';
  process.env.V2_AI_PROVIDER = 'local-deterministic';
  process.env.V2_AI_API_KEY = ''
  process.env.PROACTIVE_DEBUG = '1';

  const cfg = await (await import('../../../services/config.js')).loadConfig();
  await saveConfig({
    ...cfg,
    workspaceRoot: workspace,
    workspaces: [{
      id: 'ws_proactive',
      name: 'Proactive',
      path: workspace,
      createdAt: new Date().toISOString(),
    }],
    activeWorkspaceId: 'ws_proactive',
    v2: { enabled: true, inboxV2: true, todayV2: true, memoryV2: true, connectorsV2: false, aiEnabled: false, contextBudgetBytes: 32000 } as any,
  });

  app = express();
  app.use(cors());
  app.use(express.json({ limit: '20mb' }));
  app.use('/api/v2', v2Router);
  await new Promise<void>(resolve => {
    server = app.listen(0, () => resolve());
  });
});

afterAll(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  if (previousConfigFile === undefined) delete process.env.DAILYFLOW_CONFIG_FILE;
  else process.env.DAILYFLOW_CONFIG_FILE = previousConfigFile;
  if (previousProactiveConfig === undefined) delete process.env.DAILYFLOW_PROACTIVE_CONFIG_FILE;
  else process.env.DAILYFLOW_PROACTIVE_CONFIG_FILE = previousProactiveConfig;
  if (previousProactiveHistory === undefined) delete process.env.DAILYFLOW_PROACTIVE_HISTORY_FILE;
  else process.env.DAILYFLOW_PROACTIVE_HISTORY_FILE = previousProactiveHistory;
  if (previousWorkspaceRoot === undefined) delete process.env.DAILYFLOW_V2_WORKSPACE_ROOT;
  else process.env.DAILYFLOW_V2_WORKSPACE_ROOT = previousWorkspaceRoot;
  if (previousWorkspaceId === undefined) delete process.env.DAILYFLOW_V2_WORKSPACE_ID;
  else process.env.DAILYFLOW_V2_WORKSPACE_ID = previousWorkspaceId;
  if (previousConfigEnv === undefined) delete process.env.V2_AI_PROVIDER;
  else process.env.V2_AI_PROVIDER = previousConfigEnv;
  await fs.rm(workspace, { recursive: true, force: true });
  await fs.rm(configDir, { recursive: true, force: true });
});

beforeEach(async () => {
  // Reset config & history per test so each case is independent.
  const cfgPath = path.join(workspace, 'proactive.json');
  const histPath = path.join(workspace, 'proactive_history.json');
  try { await fs.unlink(cfgPath); } catch {}
  try { await fs.unlink(histPath); } catch {}
});

async function getJson<T>(path: string): Promise<{ status: number; body: T }> {
  const port = (server.address() as any).port;
  const res = await fetch(`http://127.0.0.1:${port}${path}`);
  return { status: res.status, body: await res.json() as T };
}

async function sendJson<T>(path: string, method: string, body: unknown): Promise<{ status: number; body: T }> {
  const port = (server.address() as any).port;
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() as T };
}

async function seedOverdueCommitment(daysOverdue: number) {
  const b = await bootstrapV2({ workspaceRoot: workspace, workspaceId: 'ws_proactive' });
  const c = await createCommitment(b.repo, b.ctx.workspaceId, {
    title: 'Send weekly plan',
    outcome: 'send',
    state: 'active',
  });
  const dueAt = new Date(Date.now() - daysOverdue * 86_400_000).toISOString();
  const w = await b.repo.getCommitment(c.id);
  await b.repo.saveCommitment(
    { ...w, dueAt } as any,
    { auditKind: 'commitment.update', auditEntity: { type: 'commitment', id: c.id } },
  );
  return c.id;
}

describe('Proactive Proposal routes', () => {
  it('GET /proactive/config returns defaults when no file exists', async () => {
    const res = await getJson<{ config: any }>('/api/v2/proactive/config');
    expect(res.status).toBe(200);
    expect(res.body.config).toMatchObject({
      enabled: true,
      maxPerWeek: 3,
      overdueTaskDays: 5,
    });
  });

  it('PUT /proactive/config saves and returns the new config', async () => {
    const res = await sendJson<{ config: any }>('/api/v2/proactive/config', 'PUT', {
      enabled: true,
      quietHours: { start: 0, end: 0 },
      maxPerWeek: 5,
      overdueTaskDays: 7,
    });
    expect(res.status).toBe(200);
    expect(res.body.config).toMatchObject({
      maxPerWeek: 5,
      overdueTaskDays: 7,
    });
  });

  it('GET /proactive/scan returns an overdue task proposal', async () => {
    // Disable quiet hours so the scan can run regardless of the test clock.
    await sendJson('/api/v2/proactive/config', 'PUT', {
      enabled: true,
      quietHours: { start: 0, end: 0 },
      maxPerWeek: 3,
      overdueTaskDays: 5,
    });
    await seedOverdueCommitment(7);
    const res = await getJson<{ proposals: any[] }>('/api/v2/proactive/scan?channel=today_load');
    expect(res.status).toBe(200);
    const overdue = res.body.proposals.filter(p => p.kind === 'overdue_task');
    expect(overdue.length).toBe(1);
    expect(overdue[0].body).toContain('7');
    expect(overdue[0].severity).toBe('warning');
    expect(overdue[0].suggestions.map((s: any) => s.action)).toEqual(
      expect.arrayContaining(['move_to_today', 'mark_done', 'dismiss']),
    );
  });

  it('POST /proactive/:id/action records dismissal', async () => {
    await sendJson('/api/v2/proactive/config', 'PUT', {
      enabled: true,
      quietHours: { start: 0, end: 0 },
      maxPerWeek: 3,
      overdueTaskDays: 5,
    });
    const seedId = await seedOverdueCommitment(7);
    const scan = await getJson<{ proposals: any[] }>('/api/v2/proactive/scan?channel=today_load');
    const own = scan.body.proposals.filter((p: any) => p.entityId === seedId);
    expect(own.length).toBe(1);
    // Dismiss the proposal that matches our seedId (not just [0]).
    const id = own[0].id;
    const post = await sendJson<{ ok: boolean }>(`/api/v2/proactive/${id}/action`, 'POST', {
      action: 'dismissed',
    });
    expect(post.status).toBe(200);
    expect(post.body.ok).toBe(true);
    // Second scan should not include the same proposal again.
    const after = await getJson<{ proposals: any[] }>('/api/v2/proactive/scan?channel=today_load');
    const stillOurs = after.body.proposals.filter((p: any) => p.entityId === seedId);
    expect(stillOurs).toEqual([]);
  });
});
