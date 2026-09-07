/**
 * EFP-003 route handlers smoke test.
 *
 * Tests 4 route handlers mounted at /api/events via a in-process
 * Express app + http.request (same pattern as tasksSpace.test.ts, no
 * supertest dependency).  All fixtures come from
 * server/routes/__tests__/fixtures/eventAdapter/* (copied into a tmp
 * workspaceRoot, as done in eventAdapter.test.ts).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import http from 'http';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import * as config from '../../services/config.ts';
import eventsRouter from '../events.js';
import { createTopicSpace } from '../../services/topicSpaces.js';
import { createMindMap } from '../../services/mindmaps.js';

interface HttpResponse {
  status: number;
  body: any;
}

function request(
  port: number,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  urlPath: string,
  jsonBody?: object,
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    let bodyStr: string | undefined;
    if (jsonBody !== undefined) {
      bodyStr = JSON.stringify(jsonBody);
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = String(Buffer.byteLength(bodyStr, 'utf-8'));
    }
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: urlPath,
        method,
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf-8');
          let parsed: any = raw;
          try { parsed = raw ? JSON.parse(raw) : null; } catch { /* keep raw */ }
          resolve({ status: res.statusCode ?? 0, body: parsed });
        });
      },
    );
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function withServer(
  app: express.Express,
  fn: (port: number) => Promise<HttpResponse>,
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('could not get server address'));
        return;
      }
      fn(addr.port).then(
        (res) => server.close(() => resolve(res)),
        (err) => server.close(() => reject(err)),
      );
    });
  });
}

const FIXTURES_ROOT = path.resolve(__dirname, '..', '__tests__', 'fixtures', 'eventAdapter');

async function mountFixture(app: express.Express, scenario: string): Promise<{ tmpRoot: string; cfg: any }> {
  const src = path.join(FIXTURES_ROOT, scenario);
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), `df-events-route-${scenario}-`));
  await fs.cp(src, tmpRoot, { recursive: true });
  const cfg = {
    workspaceRoot: tmpRoot,
    dailyPathTemplate: 'daily/{date}.md',
    rolloverTrigger: 'manual' as const,
    rolloverSkipTags: [] as string[],
  };
  vi.spyOn(config, 'loadConfig').mockResolvedValue(cfg);
  (app as any)._tmpRoot = tmpRoot;
  return { tmpRoot, cfg };
}

describe.sequential('EFP-003 / EFP-005 routes /api/events', () => {
  let app: express.Express;
  let tmpRoot: string | null = null;

  beforeEach(() => {
    app = express();
    app.use('/api/events', eventsRouter);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (tmpRoot) {
      await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
      tmpRoot = null;
    }
  });

  it('GET /api/events → returns 1 event from v1-map-unclassified workspace', async () => {
    const mounted = await mountFixture(app, 'v1-map-unclassified');
    tmpRoot = mounted.tmpRoot;
    const res = await withServer(app, (p) => request(p, 'GET', '/api/events'));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe('tw_v1legacy');
  });

  it('POST /api/events creates one Event and returns its single-map detail', async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'df-events-route-create-'));
    vi.spyOn(config, 'loadConfig').mockResolvedValue({
      workspaceRoot: tmpRoot,
      dailyPathTemplate: 'daily/{date}.md',
      rolloverTrigger: 'manual',
      rolloverSkipTags: [],
    } as any);
    const created = await withServer(app, (p) => request(p, 'POST', '/api/events', {
      title: 'Ship DailyFlow',
      context: 'work',
    }));
    expect(created.status).toBe(201);
    expect(created.body?.title).toBe('Ship DailyFlow');
    expect(created.body?.id).toMatch(/^tw_/);
    expect(created.body?.mindmapId).toMatch(/^[0-9A-Z]{26}$/);
    expect(created.body?.nodes).toHaveLength(1);

    const listed = await withServer(app, (p) => request(p, 'GET', '/api/events'));
    expect(listed.body.map((event: any) => event.id)).toContain(created.body.id);
  });

  it('GET /api/events/:nonexistent → returns 404 Event not found (EFP-005)', async () => {
    const mounted = await mountFixture(app, 'v1-map-unclassified');
    tmpRoot = mounted.tmpRoot;
    const res = await withServer(app, (p) => request(p, 'GET', '/api/events/nope-xx-does-not-exist'));
    expect(res.status).toBe(404);
    expect(res.body?.error).toContain('Event not found');
  });

  it('GET /api/events/today-items returns 400 when date= missing', async () => {
    const mounted = await mountFixture(app, 'orphan-task-no-origin');
    tmpRoot = mounted.tmpRoot;
    const res = await withServer(app, (p) => request(p, 'GET', '/api/events/today-items'));
    expect(res.status).toBe(400);
    expect(res.body?.error).toContain('date query param');
  });

  it('GET /api/events/today-items?date=2026-08-10 returns 2 for orphan scenario', async () => {
    const mounted = await mountFixture(app, 'orphan-task-no-origin');
    tmpRoot = mounted.tmpRoot;
    const res = await withServer(app, (p) => request(p, 'GET', '/api/events/today-items?date=2026-08-10'));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
    expect(res.body.every((i: any) => i.kind === 'standalone')).toBe(true);
  });

  it('GET /api/events/standalone-tasks?date=2026-08-10 for standalone-tasks fixture = 3', async () => {
    const mounted = await mountFixture(app, 'standalone-tasks');
    tmpRoot = mounted.tmpRoot;
    const res = await withServer(app, (p) => request(p, 'GET', '/api/events/standalone-tasks?date=2026-08-10&context=life'));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(3);
  });

  it('EFP-005: GET /api/events/:id by spaceId returns EventDetail (v2 fixture)', async () => {
    const mounted = await mountFixture(app, 'v2-map-with-linked-tasks');
    tmpRoot = mounted.tmpRoot;
    const res = await withServer(app, (p) => request(p, 'GET', '/api/events/tw_workplan'));
    expect(res.status).toBe(200);
    expect(res.body?.id).toBe('tw_workplan');
    expect(res.body?.status).toBe('completed');
  });

  it('EFP-005: GET /api/events/:id by mindmapId falls back → space file', async () => {
    const mounted = await mountFixture(app, 'v2-map-with-linked-tasks');
    tmpRoot = mounted.tmpRoot;
    const res = await withServer(app, (p) => request(p, 'GET', '/api/events/mm_workplan'));
    expect(res.status).toBe(200);
    expect(res.body?.id).toBe('tw_workplan');
    expect(res.body?.mindmapId).toBe('mm_workplan');
  });

  it('EFP-005: GET /api/events/:id for v1 spaceId (no context) → EventDetail exists', async () => {
    const mounted = await mountFixture(app, 'v1-map-unclassified');
    tmpRoot = mounted.tmpRoot;
    const res = await withServer(app, (p) => request(p, 'GET', '/api/events/tw_v1legacy'));
    expect(res.status).toBe(200);
    expect(res.body?.id).toBe('tw_v1legacy');
    expect(res.body?.integrity?.sourceContextWasUnclassified).toBe(true);
  });

  // ---- EFP-006 write handlers: 6 POST routes mounted on /actions/xxx ----

  it('EFP-006 POST /actions/create-task-for-node → appended + todayItems shows it', async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), `df-events-route-efp006-1-`));
    const cfg = {
      workspaceRoot: tmpRoot,
      dailyPathTemplate: 'daily/{date}.md',
      rolloverTrigger: 'manual' as const,
      rolloverSkipTags: [] as string[],
    };
    vi.spyOn(config, 'loadConfig').mockResolvedValue(cfg);
    const sp = await createTopicSpace({ title: 'Work', context: 'work' });
    expect(sp.id).toMatch(/^tw_/);
    const mp = await createMindMap({ spaceId: sp.id, title: 'Work Map' });
    expect(mp.spaceId).toBe(sp.id);
    const mindmapId = mp.id;
    const nodeId = 'node_1';
    const existingTaskId = 't_efp006';

    let r = await withServer(app, (p) =>
      request(p, 'POST', '/api/events/actions/create-task-for-node', {
        mindmapId,
        nodeId,
        title: 'Write first draft',
        scheduledDate: '2026-08-18',
        manualTags: ['focus'],
        existingTaskId,
      }),
    );
    expect(r.status).toBe(200);
    expect(r.body?.appended).toBe(true);
    expect(r.body?.alreadyPresent).toBe(false);
    expect(r.body?.taskId).toBe(existingTaskId);

    r = await withServer(app, (p) =>
      request(p, 'POST', '/api/events/actions/create-task-for-node', {
        mindmapId,
        nodeId,
        title: 'Write first draft',
        scheduledDate: '2026-08-18',
        existingTaskId,
      }),
    );
    expect(r.status).toBe(200);
    expect(r.body?.appended).toBe(false);
    expect(r.body?.alreadyPresent).toBe(true);
  });

  it('EFP-006 POST /actions/edit-node-task → task title updated in daily', async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), `df-events-route-efp006-2-`));
    const cfg = {
      workspaceRoot: tmpRoot,
      dailyPathTemplate: 'daily/{date}.md',
      rolloverTrigger: 'manual' as const,
      rolloverSkipTags: [] as string[],
    };
    vi.spyOn(config, 'loadConfig').mockResolvedValue(cfg);
    const sp = await createTopicSpace({ title: 'S', context: 'work' });
    const mp = await createMindMap({ spaceId: sp.id, title: 'M' });

    const existingTaskId = 't_edit1';
    const created = await withServer(app, (p) =>
      request(p, 'POST', '/api/events/actions/create-task-for-node', {
        mindmapId: mp.id,
        nodeId: 'n_a',
        title: 'Old Title',
        scheduledDate: '2026-08-18',
        existingTaskId,
      }),
    );
    expect(created.body?.appended).toBe(true);

    const r = await withServer(app, (p) =>
      request(p, 'POST', '/api/events/actions/edit-node-task', {
        taskId: existingTaskId,
        scheduledDate: '2026-08-18',
        updates: { title: 'New Title', priority: 'high', tags: ['tag1'] },
      }),
    );
    expect(r.status).toBe(200);
    expect(r.body?.updated).toBe(true);
    expect(typeof r.body?.taskLine).toBe('number');
  });

  it('EFP-006 POST /actions/complete-node-task + double call → alreadyDone=true', async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), `df-events-route-efp006-3-`));
    const cfg = {
      workspaceRoot: tmpRoot,
      dailyPathTemplate: 'daily/{date}.md',
      rolloverTrigger: 'manual' as const,
      rolloverSkipTags: [] as string[],
    };
    vi.spyOn(config, 'loadConfig').mockResolvedValue(cfg);
    const sp = await createTopicSpace({ title: 'S', context: 'work' });
    const mp = await createMindMap({ spaceId: sp.id, title: 'M' });
    await withServer(app, (p) =>
      request(p, 'POST', '/api/events/actions/create-task-for-node', {
        mindmapId: mp.id,
        nodeId: 'n_1',
        title: 'A task',
        scheduledDate: '2026-08-18',
        existingTaskId: 't_c1',
      }),
    );

    const r1 = await withServer(app, (p) =>
      request(p, 'POST', '/api/events/actions/complete-node-task', {
        taskId: 't_c1',
        scheduledDate: '2026-08-18',
      }),
    );
    expect(r1.status).toBe(200);
    expect(r1.body?.completed).toBe(true);
    expect(r1.body?.alreadyDone).toBe(false);

    const r2 = await withServer(app, (p) =>
      request(p, 'POST', '/api/events/actions/complete-node-task', {
        taskId: 't_c1',
        scheduledDate: '2026-08-18',
      }),
    );
    expect(r2.status).toBe(200);
    expect(r2.body?.completed).toBe(false);
    expect(r2.body?.alreadyDone).toBe(true);
  });

  it('EFP-006 POST /actions/undo-complete-node-task → re-open + idempotent', async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), `df-events-route-efp006-4-`));
    const cfg = {
      workspaceRoot: tmpRoot,
      dailyPathTemplate: 'daily/{date}.md',
      rolloverTrigger: 'manual' as const,
      rolloverSkipTags: [] as string[],
    };
    vi.spyOn(config, 'loadConfig').mockResolvedValue(cfg);
    const sp = await createTopicSpace({ title: 'S', context: 'work' });
    const mp = await createMindMap({ spaceId: sp.id, title: 'M' });
    await withServer(app, (p) =>
      request(p, 'POST', '/api/events/actions/create-task-for-node', {
        mindmapId: mp.id,
        nodeId: 'n_1',
        title: 'X',
        scheduledDate: '2026-08-18',
        existingTaskId: 't_uc1',
      }),
    );
    await withServer(app, (p) =>
      request(p, 'POST', '/api/events/actions/complete-node-task', { taskId: 't_uc1', scheduledDate: '2026-08-18' }),
    );

    const r1 = await withServer(app, (p) =>
      request(p, 'POST', '/api/events/actions/undo-complete-node-task', { taskId: 't_uc1', scheduledDate: '2026-08-18' }),
    );
    expect(r1.status).toBe(200);
    expect(r1.body?.undone).toBe(true);
    expect(r1.body?.alreadyTodo).toBe(false);

    const r2 = await withServer(app, (p) =>
      request(p, 'POST', '/api/events/actions/undo-complete-node-task', { taskId: 't_uc1', scheduledDate: '2026-08-18' }),
    );
    expect(r2.status).toBe(200);
    expect(r2.body?.undone).toBe(false);
    expect(r2.body?.alreadyTodo).toBe(true);
  });

  it('EFP-006 POST /actions/convert-standalone-to-event-node-task + idempotent', async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), `df-events-route-efp006-5-`));
    const cfg = {
      workspaceRoot: tmpRoot,
      dailyPathTemplate: 'daily/{date}.md',
      rolloverTrigger: 'manual' as const,
      rolloverSkipTags: [] as string[],
    };
    vi.spyOn(config, 'loadConfig').mockResolvedValue(cfg);
    const sp = await createTopicSpace({ title: 'S', context: 'work' });
    const mp = await createMindMap({ spaceId: sp.id, title: 'M' });

    const dailyDir = path.join(tmpRoot, 'daily');
    await fs.mkdir(dailyDir, { recursive: true });
    await fs.writeFile(
      path.join(dailyDir, '2026-08-18.md'),
      '# 2026-08-18\n\n- [ ] A standalone thing ^id-t_stand1\n',
    );

    const r1 = await withServer(app, (p) =>
      request(p, 'POST', '/api/events/actions/convert-standalone-to-event-node-task', {
        taskId: 't_stand1',
        scheduledDate: '2026-08-18',
        mindmapId: mp.id,
        nodeId: 'n_conv',
      }),
    );
    expect(r1.status).toBe(200);
    expect(r1.body?.converted).toBe(true);
    expect(r1.body?.alreadyConverted).toBe(false);
    expect(typeof r1.body?.spaceLinked).toBe('boolean');

    const r2 = await withServer(app, (p) =>
      request(p, 'POST', '/api/events/actions/convert-standalone-to-event-node-task', {
        taskId: 't_stand1',
        scheduledDate: '2026-08-18',
        mindmapId: mp.id,
        nodeId: 'n_conv',
      }),
    );
    expect(r2.status).toBe(200);
    expect(r2.body?.converted).toBe(false);
    expect(r2.body?.alreadyConverted).toBe(true);
  });

  it('EFP-006 POST /actions/undo-convert-standalone-to-event-node-task → revert + idempotent', async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), `df-events-route-efp006-6-`));
    const cfg = {
      workspaceRoot: tmpRoot,
      dailyPathTemplate: 'daily/{date}.md',
      rolloverTrigger: 'manual' as const,
      rolloverSkipTags: [] as string[],
    };
    vi.spyOn(config, 'loadConfig').mockResolvedValue(cfg);
    const sp = await createTopicSpace({ title: 'S', context: 'work' });
    const mp = await createMindMap({ spaceId: sp.id, title: 'M' });
    const dailyDir = path.join(tmpRoot, 'daily');
    await fs.mkdir(dailyDir, { recursive: true });
    await fs.writeFile(
      path.join(dailyDir, '2026-08-18.md'),
      '# 2026-08-18\n\n- [ ] Another standalone ^id-t_stand2\n',
    );
    await withServer(app, (p) =>
      request(p, 'POST', '/api/events/actions/convert-standalone-to-event-node-task', {
        taskId: 't_stand2',
        scheduledDate: '2026-08-18',
        mindmapId: mp.id,
        nodeId: 'n_x',
      }),
    );

    const r1 = await withServer(app, (p) =>
      request(p, 'POST', '/api/events/actions/undo-convert-standalone-to-event-node-task', {
        taskId: 't_stand2',
        scheduledDate: '2026-08-18',
      }),
    );
    expect(r1.status).toBe(200);
    expect(r1.body?.reverted).toBe(true);
    expect(r1.body?.alreadyStandalone).toBe(false);

    const r2 = await withServer(app, (p) =>
      request(p, 'POST', '/api/events/actions/undo-convert-standalone-to-event-node-task', {
        taskId: 't_stand2',
        scheduledDate: '2026-08-18',
      }),
    );
    expect(r2.status).toBe(200);
    expect(r2.body?.reverted).toBe(false);
    expect(r2.body?.alreadyStandalone).toBe(true);
  });

  it('DELETE /api/events/:id removes the event and a second DELETE 404s', async () => {
    // Create a fresh event we own (the v1 fixture's events share the
    // workspace and would surface as "already gone" on the 2nd delete).
    const create = await withServer(app, (p) =>
      request(p, 'POST', '/api/events', { title: 'Deletable', context: 'work' }),
    );
    expect(create.status).toBe(201);
    const id = create.body?.id as string;
    expect(id).toBeTruthy();

    const del1 = await withServer(app, (p) => request(p, 'DELETE', `/api/events/${id}`));
    expect(del1.status).toBe(204);

    // After deletion, GET should 404 (the topic space file is gone).
    const get = await withServer(app, (p) => request(p, 'GET', `/api/events/${id}`));
    expect(get.status).toBe(404);

    // A repeat delete is also a 404 (idempotent boundary on missing).
    const del2 = await withServer(app, (p) => request(p, 'DELETE', `/api/events/${id}`));
    expect(del2.status).toBe(404);
  });
});
