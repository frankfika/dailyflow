/**
 * GET /api/topic-spaces/:id/tasks — cross-date task source (Phase 3).
 *
 * The endpoint returns the space's tasks across ALL daily notes, not
 * just the currently-selected date. This replaces the old "filter
 * today's tasks by spaceId" behavior that silently dropped any task
 * not on the open date.
 *
 * Tested end-to-end with a real Express app + in-process http. We
 * seed two daily notes (today and yesterday), promote nodes from the
 * space's mindmap into both, and assert that both tasks appear in the
 * response with the correct hosting date.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import http from 'http';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import * as config from '../../services/config.ts';
import topicSpacesRouter from '../topicSpaces.js';
import mindmapsRouter from '../mindmaps.js';
import { createTopicSpace } from '../../services/topicSpaces.js';
import { writeDailyNote } from '../../services/fileSystem.js';
import { updateMindMap, getMindMap } from '../../services/mindmaps.js';
import { invalidateTaskIndex } from '../../services/taskIndex.js';

interface HttpResponse {
  status: number;
  body: any;
}

function request(port: number, urlPath: string): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: urlPath }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8');
        let parsed: any = raw;
        try { parsed = raw ? JSON.parse(raw) : null; } catch { /* keep raw */ }
        resolve({ status: res.statusCode ?? 0, body: parsed });
      });
    }).on('error', reject);
  });
}

async function post(
  port: number,
  urlPath: string,
  body: any,
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: urlPath,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
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
    req.write(data);
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

describe.sequential('GET /api/topic-spaces/:id/tasks (cross-date)', () => {
  let tmpRoot: string;
  let app: express.Express;
  const configObj = {
    workspaceRoot: '',
    dailyPathTemplate: 'Daily/{year}/{month}/{date}.md',
    rolloverTrigger: 'manual',
    rolloverSkipTags: [],
  } as any;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'df-space-tasks-'));
    configObj.workspaceRoot = tmpRoot;
    vi.spyOn(config, 'loadConfig').mockResolvedValue(configObj);
    // Each test starts with a fresh index memo.
    invalidateTaskIndex();
    app = express();
    app.use(express.json());
    app.use('/api/topic-spaces', topicSpacesRouter);
    app.use('/api/mindmaps', mindmapsRouter);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    invalidateTaskIndex();
    if (tmpRoot) await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
  });

  it('returns tasks from multiple daily notes with their hosting date', async () => {
    const space = await createTopicSpace({ title: 'Cross-date space' });
    const map = await getMindMap(space.mindmapId);
    if (!map) throw new Error('map not found');

    // Add two branch nodes under the root.
    const todayNodeId = 'n_today_task';
    const yesterdayNodeId = 'n_yesterday_task';
    await updateMindMap(space.mindmapId, {
      nodes: [
        ...map.nodes,
        { id: todayNodeId, text: 'today task', position: { x: 1, y: 0 }, kind: 'branch' },
        { id: yesterdayNodeId, text: 'yesterday task', position: { x: 2, y: 0 }, kind: 'branch' },
      ],
      edges: [
        ...map.edges,
        { id: 'e1', source: map.rootId, target: todayNodeId },
        { id: 'e2', source: map.rootId, target: yesterdayNodeId },
      ],
    });

    // Promote one node into today and another into yesterday.
    const today = '2026-08-08';
    const yesterday = '2026-08-07';
    const r1 = await withServer(app, (p) =>
      post(p, `/api/mindmaps/${space.mindmapId}/nodes/${todayNodeId}/promote-to-task`, { date: today }),
    );
    expect(r1.status).toBe(201);
    const r2 = await withServer(app, (p) =>
      post(p, `/api/mindmaps/${space.mindmapId}/nodes/${yesterdayNodeId}/promote-to-task`, { date: yesterday }),
    );
    expect(r2.status).toBe(201);

    // The cross-date endpoint should return BOTH tasks with their
    // respective hosting dates — even though only one of them is on
    // the "currently open" date.
    const res = await withServer(app, (p) =>
      request(p, `/api/topic-spaces/${space.id}/tasks`),
    );
    expect(res.status).toBe(200);
    expect(res.body.spaceId).toBe(space.id);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items).toHaveLength(2);

    const dates = res.body.items.map((it: any) => it.date).sort();
    expect(dates).toEqual([yesterday, today]);
    // Each item carries the task and its date.
    const yesterdayItem = res.body.items.find((it: any) => it.date === yesterday);
    expect(yesterdayItem.task.title).toBe('yesterday task');
    expect(yesterdayItem.task.originMindmapId).toBe(space.mindmapId);
    expect(yesterdayItem.task.originNodeId).toBe(yesterdayNodeId);
  });

  it('returns an empty list for a space with no tasks', async () => {
    const space = await createTopicSpace({ title: 'Empty' });
    const res = await withServer(app, (p) =>
      request(p, `/api/topic-spaces/${space.id}/tasks`),
    );
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });

  it('drops orphan ids from the result (task deleted but space.taskIds stale)', async () => {
    const space = await createTopicSpace({ title: 'Orphan space' });
    // Seed a daily note with a real task.
    const date = '2026-08-08';
    const realTaskId = 't_real';
    await writeDailyNote(date, `- [ ] real ^id-${realTaskId}\n`, configObj);
    // Manually mark the space as owning both a real task and an id
    // that does not exist anywhere.
    const { updateTopicSpace } = await import('../../services/topicSpaces.js');
    await updateTopicSpace(space.id, { taskIds: [realTaskId, 't_ghost'] });

    const res = await withServer(app, (p) =>
      request(p, `/api/topic-spaces/${space.id}/tasks`),
    );
    expect(res.status).toBe(200);
    // Only the real task survives; the ghost id is silently dropped
    // so the caller can detect orphans by diffing the counts.
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].task.id).toBe(realTaskId);
    expect(res.body.items[0].date).toBe(date);
  });

  it('returns 404 for an unknown space id', async () => {
    const res = await withServer(app, (p) =>
      request(p, `/api/topic-spaces/tw_does_not_exist/tasks`),
    );
    expect(res.status).toBe(404);
  });
});
