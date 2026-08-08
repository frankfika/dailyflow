/**
 * Task space-binding route (Topic Spaces Phase 2).
 *
 *   PUT /api/tasks/:taskId/space
 *
 * Tested end-to-end with a real Express app + in-process http. The
 * route writes / clears the `^space:<id>` marker on the daily-note
 * line and updates the topic space's `taskIds` on both sides.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import http from 'http';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import * as config from '../../services/config.ts';
import tasksRouter from '../tasks.js';
import { createTopicSpace } from '../../services/topicSpaces.js';
import { writeDailyNote, readDailyNote } from '../../services/fileSystem.js';

interface HttpResponse {
  status: number;
  body: any;
}

function request(
  port: number,
  method: string,
  urlPath: string,
  body?: any,
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const data = body !== undefined ? JSON.stringify(body) : '';
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: urlPath,
        method,
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
    if (data) req.write(data);
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

describe.sequential('PUT /api/tasks/:taskId/space', () => {
  let tmpRoot: string;
  let app: express.Express;
  const configObj = {
    workspaceRoot: '',
    dailyPathTemplate: 'Daily/{year}/{month}/{date}.md',
    rolloverTrigger: 'manual',
    rolloverSkipTags: [],
  } as any;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'df-tasks-space-'));
    configObj.workspaceRoot = tmpRoot;
    vi.spyOn(config, 'loadConfig').mockResolvedValue(configObj);
    app = express();
    app.use(express.json());
    app.use('/api/tasks', tasksRouter);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (tmpRoot) {
      await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('writes ^space:<id> to the task line and updates the topic space taskIds', async () => {
    const date = '2026-08-10';
    const taskId = 't_persist_1';
    await writeDailyNote(date, `- [ ] 准备BP #work ^id-${taskId}\n`, configObj);

    const space = await createTopicSpace({ title: 'Persist space' });

    const res = await withServer(app, (p) =>
      request(p, 'PUT', `/api/tasks/${taskId}/space`, { spaceId: space.id, date }),
    );
    expect(res.status).toBe(200);
    expect(res.body.persisted).toBe(true);
    expect(res.body.task.spaceId).toBe(space.id);

    // The daily note on disk should now contain the ^space: marker.
    const note = await readDailyNote(date, configObj);
    const line = note!.content.split('\n').find((l) => l.includes(taskId));
    expect(line).toBeDefined();
    expect(line).toContain('^space:' + space.id);
    // The marker is placed before the id marker.
    expect(line!.indexOf('^space:')).toBeLessThan(line!.indexOf('^id-'));

    // The topic space has the taskId registered.
    const updated = await import('../../services/topicSpaces.js').then((m) => m.getTopicSpace(space.id));
    expect(updated!.taskIds).toContain(taskId);
  });

  it('clears ^space:<id> when spaceId is set to null', async () => {
    const date = '2026-08-10';
    const taskId = 't_persist_2';
    const space = await createTopicSpace({ title: 'Clear marker' });
    // Pre-seed the note with the marker already in place.
    await writeDailyNote(
      date,
      `- [ ] 准备BP #work ^space:${space.id} ^id-${taskId}\n`,
      configObj,
    );

    const res = await withServer(app, (p) =>
      request(p, 'PUT', `/api/tasks/${taskId}/space`, { spaceId: null, date }),
    );
    expect(res.status).toBe(200);
    expect(res.body.task.spaceId).toBeUndefined();

    const note = await readDailyNote(date, configObj);
    const line = note!.content.split('\n').find((l) => l.includes(taskId));
    expect(line).toBeDefined();
    expect(line).not.toContain('^space:');
    // The task id is still there.
    expect(line).toContain('^id-' + taskId);

    // The topic space has dropped the taskId.
    const updated = await import('../../services/topicSpaces.js').then((m) => m.getTopicSpace(space.id));
    expect(updated!.taskIds).not.toContain(taskId);
  });

  it('moves the taskId from one space to another (re-bind)', async () => {
    const date = '2026-08-10';
    const taskId = 't_persist_3';
    const a = await createTopicSpace({ title: 'Space A' });
    const b = await createTopicSpace({ title: 'Space B' });
    await writeDailyNote(date, `- [ ] 任务 #x ^space:${a.id} ^id-${taskId}\n`, configObj);

    const res = await withServer(app, (p) =>
      request(p, 'PUT', `/api/tasks/${taskId}/space`, { spaceId: b.id, date }),
    );
    expect(res.status).toBe(200);
    expect(res.body.task.spaceId).toBe(b.id);

    const note = await readDailyNote(date, configObj);
    const line = note!.content.split('\n').find((l) => l.includes(taskId));
    expect(line).toContain('^space:' + b.id);
    expect(line).not.toContain('^space:' + a.id);

    const ts = await import('../../services/topicSpaces.js');
    const updatedA = await ts.getTopicSpace(a.id);
    const updatedB = await ts.getTopicSpace(b.id);
    expect(updatedA!.taskIds).not.toContain(taskId);
    expect(updatedB!.taskIds).toContain(taskId);
  });

  it('returns 404 when the task is not on the named date', async () => {
    const res = await withServer(app, (p) =>
      request(p, 'PUT', `/api/tasks/t_missing/space`, { spaceId: null, date: '2026-08-10' }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when the target space does not exist', async () => {
    const date = '2026-08-10';
    const taskId = 't_persist_4';
    await writeDailyNote(date, `- [ ] task ^id-${taskId}\n`, configObj);

    const res = await withServer(app, (p) =>
      request(p, 'PUT', `/api/tasks/${taskId}/space`, { spaceId: 'tw_no_such', date }),
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/space/i);
  });

  it('returns 400 when the body omits date', async () => {
    const res = await withServer(app, (p) =>
      request(p, 'PUT', `/api/tasks/t_any/space`, { spaceId: null }),
    );
    expect(res.status).toBe(400);
  });

  it('syncs title/status to the source node and downgrades it when the Task is deleted', async () => {
    const date = '2026-08-10';
    const taskId = 't_lifecycle';
    const space = await createTopicSpace({ title: 'Lifecycle' });
    const mindmaps = await import('../../services/mindmaps.js');
    const topicSpaces = await import('../../services/topicSpaces.js');
    const map = await mindmaps.getMindMap(space.mindmapId);
    if (!map) throw new Error('map not found');
    await mindmaps.updateMindMap(map.id, {
      nodes: [
        ...map.nodes,
        {
          id: 'source-node',
          text: 'Old title',
          position: { x: 10, y: 20 },
          kind: 'task',
          taskId,
          taskDate: date,
          status: 'todo',
        },
      ],
      edges: [...map.edges, { id: 'edge', source: map.rootId, target: 'source-node' }],
    });
    await topicSpaces.updateTopicSpace(space.id, { taskIds: [taskId] });
    await writeDailyNote(
      date,
      `- [ ] Old title ^space:${space.id} ^mm:${map.id} ^node:source-node ^id-${taskId}\n`,
      configObj,
    );

    const statusRes = await withServer(app, (port) =>
      request(port, 'PATCH', `/api/tasks/${taskId}`, { status: 'done', date }),
    );
    expect(statusRes.status).toBe(200);
    expect((await mindmaps.getMindMap(map.id))!.nodes.find(node => node.id === 'source-node')!.status).toBe('done');

    const titleRes = await withServer(app, (port) =>
      request(port, 'PUT', `/api/tasks/${taskId}`, { title: 'New title', date }),
    );
    expect(titleRes.status).toBe(200);
    expect((await mindmaps.getMindMap(map.id))!.nodes.find(node => node.id === 'source-node')!.text).toBe('New title');

    const deleteRes = await withServer(app, (port) =>
      request(port, 'DELETE', `/api/tasks/${taskId}`, { date }),
    );
    expect(deleteRes.status).toBe(200);
    const sourceNode = (await mindmaps.getMindMap(map.id))!.nodes.find(node => node.id === 'source-node')!;
    expect(sourceNode.kind).toBe('branch');
    expect(sourceNode.taskId).toBeUndefined();
    expect(sourceNode.taskDate).toBeUndefined();
    expect((await topicSpaces.getTopicSpace(space.id))!.taskIds).not.toContain(taskId);
  });
});
