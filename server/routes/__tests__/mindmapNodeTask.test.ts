/**
 * Mindmap node → task routes (Topic Spaces Phase 2).
 *
 *   POST /api/mindmaps/:id/nodes/:nodeId/promote-to-task
 *   POST /api/mindmaps/:id/nodes/:nodeId/link-task
 *
 * Tested by mounting the router on a tiny Express app and hitting
 * the endpoints with the in-process http module. We don't use
 * supertest (not a dependency); the http API is enough.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import http from 'http';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import * as config from '../../services/config.ts';
import router from '../mindmaps.js';

interface HttpResponse {
  status: number;
  body: any;
  raw: string;
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
      const port = addr.port;
      fn(port).then(
        (res) => {
          server.close(() => resolve(res));
        },
        (err) => {
          server.close(() => reject(err));
        },
      );
    });
  });
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
          try {
            parsed = raw ? JSON.parse(raw) : null;
          } catch {
            /* keep raw string */
          }
          resolve({ status: res.statusCode ?? 0, body: parsed, raw });
        });
      },
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

describe.sequential('POST /api/mindmaps/:id/nodes/:nodeId/promote-to-task', () => {
  let tmpRoot: string;
  let app: express.Express;
  let port: number;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'df-promote-test-'));
    vi.spyOn(config, 'loadConfig').mockResolvedValue({ workspaceRoot: tmpRoot, dailyPathTemplate: 'Daily/{year}/{month}/{date}.md', rolloverTrigger: 'manual', rolloverSkipTags: [] } as any);
    app = express();
    app.use(express.json());
    app.use('/api/mindmaps', router);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (tmpRoot) {
      await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('creates a task, links the node, and records the taskId on the topic space', async () => {
    // Create a topic space (which auto-creates a mindmap).
    const { createTopicSpace } = await import('../../services/topicSpaces.js');
    const space = await createTopicSpace({ title: 'Promote space' });

    // Add a branch node under the auto-created root via the mindmap
    // service, since the route only does read/update.
    const { updateMindMap, getMindMap } = await import('../../services/mindmaps.js');
    const map = await getMindMap(space.mindmapId);
    if (!map) throw new Error('map not found');
    const branchId = 'n_branch_1';
    await updateMindMap(space.mindmapId, {
      nodes: [
        ...map.nodes,
        { id: branchId, text: '准备BP #投资人', position: { x: 1, y: 0 }, kind: 'branch' },
      ],
      edges: [...map.edges, { id: 'e1', source: map.rootId, target: branchId }],
    });

    const date = '2026-08-08';
    const res = await withServer(app, (p) =>
      request(p, 'POST', `/api/mindmaps/${space.mindmapId}/nodes/${branchId}/promote-to-task`, { date }),
    );
    expect(res.status).toBe(201);
    expect(res.body.task).toBeDefined();
    expect(res.body.task.title).toBe('准备BP #投资人');
    expect(res.body.task.spaceId).toBe(space.id);
    expect(res.body.task.originMindmapId).toBe(space.mindmapId);
    expect(res.body.task.originNodeId).toBe(branchId);
    // The user-supplied tag (#投资人) is preserved in the task tags.
    expect(res.body.task.tags).toContain('投资人');
    // The new task id starts with "t_".
    expect(res.body.task.id.startsWith('t_')).toBe(true);
    // The node was flipped to kind: 'task' with the new taskId.
    expect(res.body.node.kind).toBe('task');
    expect(res.body.node.taskId).toBe(res.body.task.id);
    expect(res.body.node.taskDate).toBe(date);
    expect(res.body.node.planOrder).toBe(0);
    // The topic space picked up the taskId.
    expect(res.body.topicSpace.taskIds).toContain(res.body.task.id);

    // The markdown was actually written to the daily note.
    const filePath = path.join(tmpRoot, 'Daily', '2026', '08', `${date}.md`);
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain('准备BP');
    expect(content).toContain('#投资人');
    expect(content).toContain('^space:' + space.id);
    expect(content).toContain('^id-' + res.body.task.id);
    // Phase 3: the origin markers are persisted so the task→node reverse
    // link survives a reload and works across dates.
    expect(content).toContain('^mm:' + space.mindmapId);
    expect(content).toContain('^node:' + branchId);
  });

  it('returns 404 when the mindmap does not exist', async () => {
    const res = await withServer(app, (p) =>
      request(p, 'POST', `/api/mindmaps/mm_does_not_exist/nodes/n1/promote-to-task`, {}),
    );
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/mind map/i);
  });

  it('returns 404 when the node does not exist', async () => {
    const { createTopicSpace } = await import('../../services/topicSpaces.js');
    const space = await createTopicSpace({ title: 'No node' });
    const res = await withServer(app, (p) =>
      request(p, 'POST', `/api/mindmaps/${space.mindmapId}/nodes/n_missing/promote-to-task`, {}),
    );
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/node/i);
  });

  it('returns 400 when the node is already a task', async () => {
    const { createTopicSpace } = await import('../../services/topicSpaces.js');
    const { updateMindMap, getMindMap } = await import('../../services/mindmaps.js');
    const space = await createTopicSpace({ title: 'Already a task' });
    const map = await getMindMap(space.mindmapId);
    if (!map) throw new Error('map not found');
    const id = 'n_already_task';
    await updateMindMap(space.mindmapId, {
      nodes: [
        ...map.nodes,
        { id, text: 'already', position: { x: 1, y: 0 }, kind: 'task', taskId: 't_old' },
      ],
    });
    const res = await withServer(app, (p) =>
      request(p, 'POST', `/api/mindmaps/${space.mindmapId}/nodes/${id}/promote-to-task`, {}),
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already/i);
  });

  it('returns 400 when the node is the root', async () => {
    const { createTopicSpace } = await import('../../services/topicSpaces.js');
    const { getMindMap } = await import('../../services/mindmaps.js');
    const space = await createTopicSpace({ title: 'Root case' });
    const map = await getMindMap(space.mindmapId);
    if (!map) throw new Error('map not found');
    const res = await withServer(app, (p) =>
      request(p, 'POST', `/api/mindmaps/${space.mindmapId}/nodes/${map.rootId}/promote-to-task`, {}),
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/root/i);
  });

  it('inherits tag ancestors and merges them with user-supplied tags', async () => {
    const { createTopicSpace } = await import('../../services/topicSpaces.js');
    const { updateMindMap, getMindMap } = await import('../../services/mindmaps.js');
    const space = await createTopicSpace({ title: 'Inherit' });
    const map = await getMindMap(space.mindmapId);
    if (!map) throw new Error('map not found');
    const tagId = 'n_tag';
    const branchId = 'n_subbranch';
    await updateMindMap(space.mindmapId, {
      nodes: [
        ...map.nodes,
        { id: tagId, text: '主题', position: { x: 1, y: 0 }, kind: 'tag', tag: 'waic' },
        { id: branchId, text: '准备BP #mywork', position: { x: 2, y: 0 }, kind: 'branch' },
      ],
      edges: [
        ...map.edges,
        { id: 'e_tag', source: map.rootId, target: tagId },
        { id: 'e_branch', source: tagId, target: branchId },
      ],
    });

    const date = '2026-08-08';
    const res = await withServer(app, (p) =>
      request(p, 'POST', `/api/mindmaps/${space.mindmapId}/nodes/${branchId}/promote-to-task`, { date }),
    );
    expect(res.status).toBe(201);
    // The user tag and the inherited tag are both present.
    expect(res.body.task.tags).toContain('mywork');
    expect(res.body.task.tags).toContain('waic');

    // The markdown line carries both, with system metadata at the end.
    const filePath = path.join(tmpRoot, 'Daily', '2026', '08', `${date}.md`);
    const content = await fs.readFile(filePath, 'utf-8');
    const lineWithTask = content.split('\n').find((l) => l.includes(res.body.task.id));
    expect(lineWithTask).toBeDefined();
    expect(lineWithTask).toContain('#mywork');
    expect(lineWithTask).toContain('#waic');
    // System metadata is at the end of the line.
    expect(lineWithTask!.indexOf('#waic')).toBeLessThan(lineWithTask!.indexOf('^space:'));
    expect(lineWithTask!.indexOf('^space:')).toBeLessThan(lineWithTask!.indexOf('^id-'));
  });
});

describe.sequential('POST /api/mindmaps/:id/nodes/:nodeId/link-task', () => {
  let tmpRoot: string;
  let app: express.Express;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'df-link-test-'));
    vi.spyOn(config, 'loadConfig').mockResolvedValue({ workspaceRoot: tmpRoot, dailyPathTemplate: 'Daily/{year}/{month}/{date}.md', rolloverTrigger: 'manual', rolloverSkipTags: [] } as any);
    app = express();
    app.use(express.json());
    app.use('/api/mindmaps', router);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (tmpRoot) {
      await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('binds the node to an existing task and syncs the title', async () => {
    const { createTopicSpace } = await import('../../services/topicSpaces.js');
    const { updateMindMap, getMindMap } = await import('../../services/mindmaps.js');
    const { writeDailyNote } = await import('../../services/fileSystem.js');
    const space = await createTopicSpace({ title: 'Link space' });
    const map = await getMindMap(space.mindmapId);
    if (!map) throw new Error('map not found');
    const branchId = 'n_link_target';
    await updateMindMap(space.mindmapId, {
      nodes: [
        ...map.nodes,
        { id: branchId, text: 'stale label', position: { x: 1, y: 0 }, kind: 'branch' },
      ],
      edges: [...map.edges, { id: 'e1', source: map.rootId, target: branchId }],
    });

    // Pre-seed a daily note that contains the task we want to link to.
    const date = '2026-08-09';
    const taskId = 't_existing';
    const configObj = { workspaceRoot: tmpRoot, dailyPathTemplate: 'Daily/{year}/{month}/{date}.md', rolloverTrigger: 'manual', rolloverSkipTags: [] } as any;
    await writeDailyNote(date, `- [ ] 准备BP ^id-${taskId}\n`, configObj);

    const res = await withServer(app, (p) =>
      request(p, 'POST', `/api/mindmaps/${space.mindmapId}/nodes/${branchId}/link-task`, { taskId, date }),
    );
    expect(res.status).toBe(200);
    expect(res.body.node.kind).toBe('task');
    expect(res.body.node.taskId).toBe(taskId);
    expect(res.body.node.taskDate).toBe(date);
    // The text was synced from the live task title.
    expect(res.body.node.text).toBe('准备BP');
    // The topic space picked up the taskId.
    expect(res.body.topicSpace.taskIds).toContain(taskId);
    const filePath = path.join(tmpRoot, 'Daily', '2026', '08', `${date}.md`);
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain(`^mm:${space.mindmapId}`);
    expect(content).toContain(`^node:${branchId}`);
    expect(content).toContain(`^space:${space.id}`);
  });

  it('returns 404 when the task is not on the named date', async () => {
    const { createTopicSpace } = await import('../../services/topicSpaces.js');
    const { getMindMap, updateMindMap } = await import('../../services/mindmaps.js');
    const space = await createTopicSpace({ title: 'Missing task' });
    const map = await getMindMap(space.mindmapId);
    if (!map) throw new Error('map not found');
    // Add a regular branch node so the route doesn't reject it.
    const branchId = 'n_link_target';
    await updateMindMap(space.mindmapId, {
      nodes: [
        ...map.nodes,
        { id: branchId, text: 'label', position: { x: 1, y: 0 }, kind: 'branch' },
      ],
      edges: [...map.edges, { id: 'e1', source: map.rootId, target: branchId }],
    });
    const res = await withServer(app, (p) =>
      request(p, 'POST', `/api/mindmaps/${space.mindmapId}/nodes/${branchId}/link-task`, {
        taskId: 't_does_not_exist',
        date: '2026-08-09',
      }),
    );
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('returns 400 when taskId is missing', async () => {
    const { createTopicSpace } = await import('../../services/topicSpaces.js');
    const space = await createTopicSpace({ title: 'No taskId' });
    const res = await withServer(app, (p) =>
      request(p, 'POST', `/api/mindmaps/${space.mindmapId}/nodes/n1/link-task`, { date: '2026-08-09' }),
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/taskId/i);
  });

  it('rejects linking the root node', async () => {
    const { createTopicSpace } = await import('../../services/topicSpaces.js');
    const { getMindMap } = await import('../../services/mindmaps.js');
    const space = await createTopicSpace({ title: 'Root link' });
    const map = await getMindMap(space.mindmapId);
    if (!map) throw new Error('map not found');
    const res = await withServer(app, (p) =>
      request(p, 'POST', `/api/mindmaps/${space.mindmapId}/nodes/${map.rootId}/link-task`, {
        taskId: 't_any',
        date: '2026-08-09',
      }),
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/root/i);
  });

  it('returns 404 when the mindmap does not exist', async () => {
    const res = await withServer(app, (p) =>
      request(p, 'POST', `/api/mindmaps/mm_missing/nodes/n1/link-task`, { taskId: 't1', date: '2026-08-09' }),
    );
    expect(res.status).toBe(404);
  });
});

describe.sequential('PUT /api/mindmaps/:id/nodes/:nodeId/kind', () => {
  let tmpRoot: string;
  let app: express.Express;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'df-kind-test-'));
    vi.spyOn(config, 'loadConfig').mockResolvedValue({ workspaceRoot: tmpRoot } as any);
    app = express();
    app.use(express.json());
    app.use('/api/mindmaps', router);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (tmpRoot) await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
  });

  async function seedBranch(kind: 'branch' | 'task' = 'branch') {
    const { createMindMap, updateMindMap } = await import('../../services/mindmaps.js');
    const map = await createMindMap({ title: 'Kinds' });
    await updateMindMap(map.id, {
      nodes: [
        ...map.nodes,
        {
          id: 'branch',
          text: 'Priority',
          position: { x: 1, y: 0 },
          kind,
          ...(kind === 'task' ? { taskId: 't_old' } : {}),
          ...(kind === 'task' ? { taskDate: '2026-08-09' } : {}),
        },
      ],
      edges: [{ id: 'edge', source: map.rootId, target: 'branch' }],
    });
    return map;
  }

  it('marks a branch as a tag and defaults the label from node text', async () => {
    const map = await seedBranch();
    const res = await withServer(app, (p) =>
      request(p, 'PUT', `/api/mindmaps/${map.id}/nodes/branch/kind`, { kind: 'tag' }),
    );
    expect(res.status).toBe(200);
    expect(res.body.nodes.find((node: any) => node.id === 'branch')).toMatchObject({
      kind: 'tag',
      tag: 'Priority',
    });
  });

  it('unclassifies a task node and clears task/tag metadata', async () => {
    const map = await seedBranch('task');
    const res = await withServer(app, (p) =>
      request(p, 'PUT', `/api/mindmaps/${map.id}/nodes/branch/kind`, { kind: 'branch' }),
    );
    expect(res.status).toBe(200);
    const node = res.body.nodes.find((candidate: any) => candidate.id === 'branch');
    expect(node.kind).toBe('branch');
    expect(node.taskId).toBeUndefined();
    expect(node.taskDate).toBeUndefined();
    expect(node.tag).toBeUndefined();
  });

  it('rejects root reclassification', async () => {
    const map = await seedBranch();
    const res = await withServer(app, (p) =>
      request(p, 'PUT', `/api/mindmaps/${map.id}/nodes/${map.rootId}/kind`, { kind: 'tag' }),
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/root/i);
  });
});

describe.sequential('POST /api/mindmaps/:id/nodes/delete', () => {
  let tmpRoot: string;
  let app: express.Express;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'df-delete-node-test-'));
    vi.spyOn(config, 'loadConfig').mockResolvedValue({
      workspaceRoot: tmpRoot,
      dailyPathTemplate: 'Daily/{year}/{month}/{date}.md',
      rolloverTrigger: 'manual',
      rolloverSkipTags: [],
    } as any);
    app = express();
    app.use(express.json());
    app.use('/api/mindmaps', router);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (tmpRoot) await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
  });

  async function seedPromotedNode() {
    const { createTopicSpace } = await import('../../services/topicSpaces.js');
    const { getMindMap, updateMindMap } = await import('../../services/mindmaps.js');
    const space = await createTopicSpace({ title: 'Delete projection' });
    const map = await getMindMap(space.mindmapId);
    if (!map) throw new Error('map not found');
    await updateMindMap(map.id, {
      nodes: [...map.nodes, { id: 'branch', text: 'Keep the work', position: { x: 10, y: 20 }, kind: 'branch' }],
      edges: [...map.edges, { id: 'edge', source: map.rootId, target: 'branch' }],
    });
    const date = '2026-08-08';
    const promoted = await withServer(app, (port) =>
      request(port, 'POST', `/api/mindmaps/${map.id}/nodes/branch/promote-to-task`, { date }),
    );
    expect(promoted.status).toBe(201);
    return { space, mapId: map.id, date, taskId: promoted.body.task.id };
  }

  it('keeps the Task but clears origin and Topic Space references', async () => {
    const seeded = await seedPromotedNode();
    const res = await withServer(app, (port) =>
      request(port, 'POST', `/api/mindmaps/${seeded.mapId}/nodes/delete`, {
        nodeId: 'branch',
        taskPolicy: 'keep-tasks',
      }),
    );
    expect(res.status).toBe(200);
    expect(res.body.mindmap.nodes.some((node: any) => node.id === 'branch')).toBe(false);
    const filePath = path.join(tmpRoot, 'Daily', '2026', '08', `${seeded.date}.md`);
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain(`^id-${seeded.taskId}`);
    expect(content).not.toContain('^mm:');
    expect(content).not.toContain('^node:');
    expect(content).not.toContain('^space:');
    const { getTopicSpace } = await import('../../services/topicSpaces.js');
    expect((await getTopicSpace(seeded.space.id))?.taskIds).not.toContain(seeded.taskId);
  });

  it('deletes the linked Task when requested', async () => {
    const seeded = await seedPromotedNode();
    const res = await withServer(app, (port) =>
      request(port, 'POST', `/api/mindmaps/${seeded.mapId}/nodes/delete`, {
        nodeId: 'branch',
        taskPolicy: 'delete-tasks',
      }),
    );
    expect(res.status).toBe(200);
    const filePath = path.join(tmpRoot, 'Daily', '2026', '08', `${seeded.date}.md`);
    expect(await fs.readFile(filePath, 'utf-8')).not.toContain(seeded.taskId);
  });
});
