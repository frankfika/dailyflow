/**
 * Cross-date task search route for AI tools.
 *
 *   GET /api/tasks/search?q=keyword
 *   GET /api/tasks/search?id=taskId
 *
 * Registered before GET /:date so "search" is never parsed as a date.
 * The route reuses the same taskIndex primitives as the offline index
 * build, so we cover the integration with one focused suite.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import http from 'http';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import * as config from '../../services/config.ts';
import tasksRouter from '../tasks.js';
import { writeDailyNote } from '../../services/fileSystem.js';

interface HttpResponse { status: number; body: any }

function request(port: number, method: string, urlPath: string): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: urlPath, method }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8');
        let parsed: any = raw;
        try { parsed = raw ? JSON.parse(raw) : null; } catch { /* keep raw */ }
        resolve({ status: res.statusCode ?? 0, body: parsed });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function withServer(app: express.Express, fn: (port: number) => Promise<HttpResponse>): Promise<HttpResponse> {
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

describe.sequential('GET /api/tasks/search', () => {
  let tmpRoot: string;
  let app: express.Express;
  const configObj = {
    workspaceRoot: '',
    dailyPathTemplate: 'Daily/{year}/{month}/{date}.md',
    rolloverTrigger: 'manual',
    rolloverSkipTags: [],
  } as any;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'df-tasks-search-'));
    configObj.workspaceRoot = tmpRoot;
    vi.spyOn(config, 'loadConfig').mockResolvedValue(configObj);
    app = express();
    app.use(express.json());
    app.use('/api/tasks', tasksRouter);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (tmpRoot) await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
  });

  it('finds tasks across dates by title keyword (newest first)', async () => {
    await writeDailyNote('2026-08-01', '- [ ] draft plan ^id-a1\n- [ ] unrelated ^id-a2\n', configObj);
    await writeDailyNote('2026-08-10', '- [ ] polish plan ^id-b1\n', configObj);

    const res = await withServer(app, (p) => request(p, 'GET', '/api/tasks/search?q=plan'));
    expect(res.status).toBe(200);
    const ids = (res.body.tasks as any[]).map((t) => t.id);
    // Newest host date first; "draft plan" and "polish plan" both match.
    expect(ids).toEqual(['b1', 'a1']);
    // Each row carries the lightweight payload the AI needs.
    expect(res.body.tasks[0]).toMatchObject({
      id: 'b1', title: 'polish plan', source_date: '2026-08-10', status: 'todo',
    });
  });

  it('matches by tag too, case-insensitively', async () => {
    await writeDailyNote('2026-08-02', '- [ ] quiet work ^id-t1 #Urgent\n', configObj);

    const res = await withServer(app, (p) => request(p, 'GET', '/api/tasks/search?q=urgent'));
    expect(res.status).toBe(200);
    expect(res.body.tasks).toHaveLength(1);
    expect(res.body.tasks[0].id).toBe('t1');
    expect(res.body.tasks[0].tags).toContain('urgent');
  });

  it('resolves a task by id across dates', async () => {
    await writeDailyNote('2026-08-01', '- [ ] deep archive ^id-deep\n', configObj);
    await writeDailyNote('2026-08-05', '- [ ] not deep ^id-shallow\n', configObj);

    const res = await withServer(app, (p) => request(p, 'GET', '/api/tasks/search?id=deep'));
    expect(res.status).toBe(200);
    expect(res.body.tasks).toEqual([
      expect.objectContaining({ id: 'deep', title: 'deep archive', source_date: '2026-08-01' }),
    ]);
  });

  it('returns an empty list for an unknown id without erroring', async () => {
    await writeDailyNote('2026-08-01', '- [ ] something ^id-some\n', configObj);
    const res = await withServer(app, (p) => request(p, 'GET', '/api/tasks/search?id=does-not-exist'));
    expect(res.status).toBe(200);
    expect(res.body.tasks).toEqual([]);
  });

  it('requires q or id (400)', async () => {
    const res = await withServer(app, (p) => request(p, 'GET', '/api/tasks/search'));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/q or id/);
  });

  it('does not collide with GET /:date — /search is its own segment', async () => {
    // Regression: a /search route registered after /:date would swallow
    // the segment and treat it as a date. We register search first; pin it.
    const res = await withServer(app, (p) => request(p, 'GET', '/api/tasks/search?q=anything'));
    expect(res.status).not.toBe(500);
    expect(res.body).toBeTypeOf('object');
  });
});