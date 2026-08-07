/**
 * Diagnostics routes (Topic Spaces Phase 4).
 *
 *   GET  /api/diagnostics/broken-links
 *   GET  /api/diagnostics/summary
 *   POST /api/diagnostics/repair-task-link
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import http from 'http';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import * as config from '../../services/config.ts';
import router from '../diagnostics.js';
import { createTopicSpace } from '../../services/topicSpaces.js';
import { writeDailyNote } from '../../services/fileSystem.js';
import {
  createMindMap,
  updateMindMap,
  updateNodeInMindMap,
  getMindMap,
} from '../../services/mindmaps.js';

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

describe.sequential('GET /api/diagnostics/broken-links', () => {
  let tmpRoot: string;
  let app: express.Express;
  const configObj = {
    workspaceRoot: '',
    dailyPathTemplate: 'Daily/{year}/{month}/{date}.md',
    rolloverTrigger: 'manual',
    rolloverSkipTags: [],
  } as any;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'df-diag-'));
    configObj.workspaceRoot = tmpRoot;
    vi.spyOn(config, 'loadConfig').mockResolvedValue(configObj);
    app = express();
    app.use(express.json());
    app.use('/api/diagnostics', router);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (tmpRoot) {
      await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('returns an empty issue list on a clean workspace', async () => {
    const res = await withServer(app, (p) => request(p, 'GET', '/api/diagnostics/broken-links'));
    expect(res.status).toBe(200);
    expect(res.body.issues).toEqual([]);
  });

  it('detects a kind: task node pointing at a missing taskId', async () => {
    // Create a map (no topic space needed) with a kind: task node
    // whose taskId does not exist on disk.
    const map = await createMindMap({ title: 'Orphan' });
    await updateMindMap(map.id, {
      nodes: [
        ...map.nodes,
        { id: 'n_orphan', text: 'orphan', position: { x: 1, y: 0 }, kind: 'task', taskId: 't_does_not_exist' },
      ],
    });
    const res = await withServer(app, (p) => request(p, 'GET', '/api/diagnostics/broken-links'));
    expect(res.status).toBe(200);
    expect(res.body.issues).toHaveLength(1);
    const issue = res.body.issues[0];
    expect(issue.reason).toBe('task_not_found');
    expect(issue.mindmapId).toBe(map.id);
    expect(issue.nodeId).toBe('n_orphan');
    expect(issue.taskId).toBe('t_does_not_exist');
  });

  it('does not flag a kind: task node whose taskId exists on disk', async () => {
    const date = '2026-08-11';
    const taskId = 't_alive';
    await writeDailyNote(date, `- [ ] 真实任务 ^id-${taskId}\n`, configObj);

    const map = await createMindMap({ title: 'Live' });
    await updateMindMap(map.id, {
      nodes: [
        ...map.nodes,
        { id: 'n_live', text: 'live', position: { x: 1, y: 0 }, kind: 'task', taskId },
      ],
    });
    const res = await withServer(app, (p) => request(p, 'GET', '/api/diagnostics/broken-links'));
    expect(res.status).toBe(200);
    expect(res.body.issues).toEqual([]);
  });

  it('detects a MindMap whose spaceId points at a missing topic space', async () => {
    const map = await createMindMap({ title: 'Orphan map', spaceId: 'tw_missing_space' });
    const res = await withServer(app, (p) => request(p, 'GET', '/api/diagnostics/broken-links'));
    expect(res.status).toBe(200);
    const orphan = res.body.issues.find(
      (i: any) => i.mindmapId === map.id && i.reason === 'space_not_found',
    );
    expect(orphan).toBeDefined();
    expect(orphan.spaceId).toBe('tw_missing_space');
  });
});

describe.sequential('GET /api/diagnostics/summary', () => {
  let tmpRoot: string;
  let app: express.Express;
  const configObj = {
    workspaceRoot: '',
    dailyPathTemplate: 'Daily/{year}/{month}/{date}.md',
    rolloverTrigger: 'manual',
    rolloverSkipTags: [],
  } as any;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'df-summary-'));
    configObj.workspaceRoot = tmpRoot;
    vi.spyOn(config, 'loadConfig').mockResolvedValue(configObj);
    app = express();
    app.use(express.json());
    app.use('/api/diagnostics', router);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (tmpRoot) {
      await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('returns the expected counts on a clean workspace', async () => {
    const res = await withServer(app, (p) => request(p, 'GET', '/api/diagnostics/summary'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      topicSpaces: 0,
      mindmaps: 0,
      tasks: 0,
      brokenLinks: 0,
      orphanMindmaps: 0,
    });
  });

  it('counts a real task in the workspace', async () => {
    await writeDailyNote('2026-08-12', '- [ ] One task ^id-t_one\n- [x] Two task ^id-t_two\n', configObj);
    const res = await withServer(app, (p) => request(p, 'GET', '/api/diagnostics/summary'));
    expect(res.status).toBe(200);
    expect(res.body.tasks).toBe(2);
  });

  it('counts broken links and orphan mindmaps in the summary', async () => {
    // Seed: a daily note with one real task, a mindmap that links to a
    // missing task, and a mindmap pointing at a non-existent space.
    await writeDailyNote('2026-08-12', '- [ ] live ^id-t_live\n', configObj);
    const map1 = await createMindMap({ title: 'Broken node' });
    await updateMindMap(map1.id, {
      nodes: [
        ...map1.nodes,
        { id: 'n1', text: 'broken', position: { x: 1, y: 0 }, kind: 'task', taskId: 't_dead' },
      ],
    });
    const map2 = await createMindMap({ title: 'Orphan', spaceId: 'tw_no_space' });

    const res = await withServer(app, (p) => request(p, 'GET', '/api/diagnostics/summary'));
    expect(res.status).toBe(200);
    expect(res.body.mindmaps).toBe(2);
    expect(res.body.tasks).toBe(1);
    expect(res.body.brokenLinks).toBe(2); // task_not_found + space_not_found
    expect(res.body.orphanMindmaps).toBe(1);
    expect(res.body.topicSpaces).toBe(0);
  });
});

describe.sequential('POST /api/diagnostics/repair-task-link', () => {
  let tmpRoot: string;
  let app: express.Express;
  const configObj = {
    workspaceRoot: '',
    dailyPathTemplate: 'Daily/{year}/{month}/{date}.md',
    rolloverTrigger: 'manual',
    rolloverSkipTags: [],
  } as any;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'df-repair-'));
    configObj.workspaceRoot = tmpRoot;
    vi.spyOn(config, 'loadConfig').mockResolvedValue(configObj);
    app = express();
    app.use(express.json());
    app.use('/api/diagnostics', router);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (tmpRoot) {
      await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('returns 501 for action: recreate', async () => {
    const res = await withServer(app, (p) =>
      request(p, 'POST', '/api/diagnostics/repair-task-link', {
        mindmapId: 'mm_any',
        nodeId: 'n_any',
        action: 'recreate',
      }),
    );
    expect(res.status).toBe(501);
  });

  it('unlinks a kind: task node and demotes it back to branch', async () => {
    const map = await createMindMap({ title: 'Repair' });
    const nodeId = 'n_repair_target';
    await updateMindMap(map.id, {
      nodes: [
        ...map.nodes,
        { id: nodeId, text: 'broken', position: { x: 1, y: 0 }, kind: 'task', taskId: 't_dead' },
      ],
    });

    const res = await withServer(app, (p) =>
      request(p, 'POST', '/api/diagnostics/repair-task-link', {
        mindmapId: map.id,
        nodeId,
        action: 'unlink',
      }),
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // The persisted state was updated.
    const after = await getMindMap(map.id);
    const node = after!.nodes.find((n) => n.id === nodeId);
    expect(node?.kind).toBe('branch');
    expect(node?.taskId).toBeUndefined();
  });

  it('returns 404 when the mindmap does not exist', async () => {
    const res = await withServer(app, (p) =>
      request(p, 'POST', '/api/diagnostics/repair-task-link', {
        mindmapId: 'mm_missing',
        nodeId: 'n1',
        action: 'unlink',
      }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 for an unknown action', async () => {
    const map = await createMindMap({ title: 'Bad action' });
    const res = await withServer(app, (p) =>
      request(p, 'POST', '/api/diagnostics/repair-task-link', {
        mindmapId: map.id,
        nodeId: map.rootId,
        action: 'teleport',
      }),
    );
    expect(res.status).toBe(400);
  });
});
