/**
 * Sprint 1 / Gap 1 — Node-kind extension tests.
 *
 * Covers three contracts the V2 roadshow deck promises:
 *   1. The `PUT /api/mindmaps/:id/nodes/:nodeId/kind` endpoint accepts
 *      the three new Phase-2 label-only kinds (question / resource /
 *      risk), in addition to the existing branch / tag.
 *   2. The endpoint rejects illegal `kind` payloads with HTTP 400 and
 *      a descriptive error message; the on-disk file is untouched so
 *      a malformed request never silently corrupts state.
 *   3. The accepted kind is persisted to disk and re-read back; the
 *      sibling fields (`tag` / `taskId` / `taskDate`) follow the
 *      documented switch-from-task semantics (taskId/taskDate are
 *      cleared, `tag` is left alone when the new kind is not 'tag').
 *
 * We exercise both layers — the service (`updateNodeInMindMap`) and
 * the HTTP route — because the route carries the validation logic
 * (`MUTABLE_NODE_KINDS`) that the service does not enforce on its
 * own. Mounting the router on a tiny Express app mirrors the pattern
 * already used by `server/routes/__tests__/mindmapNodeTask.test.ts`,
 * but stays in this file so the gap-1 surface area is covered
 * end-to-end from one place.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import http from 'http';
import express from 'express';
import * as config from '../config.ts';
import {
  createMindMap,
  getMindMap,
  updateNodeInMindMap,
} from '../mindmaps.js';
import router from '../../routes/mindmaps.js';

interface HttpResponse {
  status: number;
  body: any;
  raw: string;
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
        headers: data
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
          : {},
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf-8');
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          let parsed: any = raw;
          if (raw && res.headers['content-type']?.toString().includes('application/json')) {
            try { parsed = JSON.parse(raw); } catch { /* keep raw */ }
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
        (res) => { server.close(() => resolve(res)); },
        (err) => { server.close(() => reject(err)); },
      );
    });
  });
}

describe.sequential('mindmap nodeKind (Sprint 1 / Gap 1)', () => {
  let tmpRoot: string;
  let app: express.Express;
  let loadConfigSpy: ReturnType<typeof vi.spyOn>;
  let portHolder: { port: number | null } = { port: null };

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'df-mindmap-nodekind-'));
    loadConfigSpy = vi.spyOn(config, 'loadConfig').mockResolvedValue({ workspaceRoot: tmpRoot } as any);
    app = express();
    app.use(express.json());
    app.use('/api/mindmaps', router);
    portHolder.port = null;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (tmpRoot) {
      await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
    }
  });

  // ---------------------------------------------------------------------
  // Case 1 — the route accepts the three new kinds end-to-end.
  // ---------------------------------------------------------------------
  it('accepts question / resource / risk and persists the new kind', async () => {
    const map = await createMindMap({ title: 'Gap 1 accept' });
    const branchId = 'n_branch';
    // Add a plain branch via the service so we have a node to mutate.
    await updateNodeInMindMap(map.id, branchId, {
      // We don't have an "add node" path here, so use the existing
      // update helper to inject a branch alongside the auto-root.
    });
    // Insert the branch directly via updateMindMap to keep this test
    // focused on the kind-route behavior.
    await fs.mkdir(path.join(tmpRoot, '.dailyflow', 'mindmaps'), { recursive: true });
    const onDiskPath = path.join(tmpRoot, '.dailyflow', 'mindmaps', `${map.id}.json`);
    const seeded = {
      ...map,
      nodes: [
        map.nodes[0],
        { id: branchId, text: 'branch', position: { x: 1, y: 0 }, kind: 'branch' },
      ],
      edges: [{ id: 'e1', source: map.rootId, target: branchId }],
    };
    await fs.writeFile(onDiskPath, JSON.stringify(seeded), 'utf-8');

    // Issue three PUT calls (one per new kind) through the real
    // router. Each must return 200 with a body whose `nodes[…].kind`
    // matches the request.
    const accepts: Array<'question' | 'resource' | 'risk'> = ['question', 'resource', 'risk'];
    for (const kind of accepts) {
      const response = await withServer(app, (port) =>
        request(
          port,
          'PUT',
          `/api/mindmaps/${map.id}/nodes/${branchId}/kind`,
          { kind },
        ),
      );
      expect(response.status).toBe(200);
      const updated = await getMindMap(map.id);
      const node = updated?.nodes.find((n) => n.id === branchId);
      expect(node?.kind).toBe(kind);
    }
  });

  // ---------------------------------------------------------------------
  // Case 2 — the route rejects illegal `kind` payloads with HTTP 400
  // and does not touch the file on disk.
  // ---------------------------------------------------------------------
  it('rejects illegal kind payloads with 400 and leaves the file untouched', async () => {
    const map = await createMindMap({ title: 'Gap 1 reject' });
    const branchId = 'n_branch_reject';
    await fs.mkdir(path.join(tmpRoot, '.dailyflow', 'mindmaps'), { recursive: true });
    const onDiskPath = path.join(tmpRoot, '.dailyflow', 'mindmaps', `${map.id}.json`);
    const seeded = {
      ...map,
      nodes: [
        map.nodes[0],
        { id: branchId, text: 'branch', position: { x: 1, y: 0 }, kind: 'branch' },
      ],
      edges: [{ id: 'e1', source: map.rootId, target: branchId }],
    };
    await fs.writeFile(onDiskPath, JSON.stringify(seeded), 'utf-8');
    const beforeBytes = await fs.readFile(onDiskPath, 'utf-8');

    // A kind outside the seven defined values must be rejected.
    const illegal = await withServer(app, (port) =>
      request(
        port,
        'PUT',
        `/api/mindmaps/${map.id}/nodes/${branchId}/kind`,
        { kind: 'made-up-kind' },
      ),
    );
    expect(illegal.status).toBe(400);
    expect(illegal.body).toBeTypeOf('object');
    expect(String(illegal.body.error)).toMatch(/kind must be one of/);

    // Also reject `root` — the menu never offers it, but the route is
    // the second line of defense and should 400 if the body lies.
    const rootAttempt = await withServer(app, (port) =>
      request(
        port,
        'PUT',
        `/api/mindmaps/${map.id}/nodes/${branchId}/kind`,
        { kind: 'root' },
      ),
    );
    expect(rootAttempt.status).toBe(400);

    // File on disk must be byte-identical to the pre-call snapshot.
    const afterBytes = await fs.readFile(onDiskPath, 'utf-8');
    expect(afterBytes).toBe(beforeBytes);

    // And the in-memory node still reports `kind: 'branch'`.
    const reread = await getMindMap(map.id);
    expect(reread?.nodes.find((n) => n.id === branchId)?.kind).toBe('branch');
  });

  // ---------------------------------------------------------------------
  // Case 3 — the accepted kind is persisted and survives a reload.
  // ---------------------------------------------------------------------
  it('persists the new kind to disk and reads it back through the service layer', async () => {
    const map = await createMindMap({ title: 'Gap 1 persist' });
    const branchId = 'n_branch_persist';
    await fs.mkdir(path.join(tmpRoot, '.dailyflow', 'mindmaps'), { recursive: true });
    const onDiskPath = path.join(tmpRoot, '.dailyflow', 'mindmaps', `${map.id}.json`);
    const seeded = {
      ...map,
      nodes: [
        map.nodes[0],
        { id: branchId, text: '关键路径依赖', position: { x: 1, y: 0 }, kind: 'branch' },
      ],
      edges: [{ id: 'e1', source: map.rootId, target: branchId }],
    };
    await fs.writeFile(onDiskPath, JSON.stringify(seeded), 'utf-8');

    // Drive the round-trip through the route so the persistence path
    // is the same code path real clients hit.
    const put = await withServer(app, (port) =>
      request(
        port,
        'PUT',
        `/api/mindmaps/${map.id}/nodes/${branchId}/kind`,
        { kind: 'risk' },
      ),
    );
    expect(put.status).toBe(200);

    // 1) Service-layer read returns the new kind.
    const afterService = await getMindMap(map.id);
    expect(afterService?.version).toBe(2);
    const persistedNode = afterService?.nodes.find((n) => n.id === branchId);
    expect(persistedNode?.kind).toBe('risk');
    // taskId/taskDate cleared when leaving branch (defensive — they
    // were already empty, but the contract says they're reset).
    expect(persistedNode?.taskId).toBeUndefined();
    expect(persistedNode?.taskDate).toBeUndefined();

    // 2) Raw on-disk JSON shows the same value, proving the file was
    // rewritten (not just the in-memory copy).
    const onDisk = JSON.parse(await fs.readFile(onDiskPath, 'utf-8'));
    const onDiskNode = onDisk.nodes.find((n: any) => n.id === branchId);
    expect(onDiskNode.kind).toBe('risk');

    // 3) Service-layer update of a different kind replaces the
    // previous one — proves the field is mutable, not write-once.
    await updateNodeInMindMap(map.id, branchId, { kind: 'question' });
    const reread = await getMindMap(map.id);
    expect(reread?.nodes.find((n) => n.id === branchId)?.kind).toBe('question');
  });
});
