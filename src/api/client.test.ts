import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  configApi,
  dispatchDomainEvent,
  DOMAIN_EVENTS,
  dailyApi,
  filesApi,
  gitApi,
  mindmapsApi,
  projectsApi,
  rolloverApi,
  tasksApi,
  thinkingWorkspacesApi,
  type ConfigData,
} from './client';

describe('API Client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('filesApi', () => {
    it('get returns null on 404', async () => {
      global.fetch = vi.fn().mockResolvedValue({ status: 404, ok: false });
      const result = await filesApi.get('2026-05-05');
      expect(result).toBeNull();
    });

    it('get returns data on success', async () => {
      const mockData = { date: '2026-05-05', content: '# Test', tasks: [] };
      global.fetch = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: () => Promise.resolve(mockData),
      });
      const result = await filesApi.get('2026-05-05');
      expect(result).toEqual(mockData);
    });

    it('get throws on non-404 error', async () => {
      global.fetch = vi.fn().mockResolvedValue({ status: 500, ok: false });
      await expect(filesApi.get('2026-05-05')).rejects.toThrow('Failed to fetch file');
    });

    it('create calls POST with correct body', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true });
      await filesApi.create('2026-05-05', '# Content');
      expect(fetch).toHaveBeenCalledWith(
        '/api/files/2026-05-05',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: '# Content' }),
        })
      );
    });
  });

  describe('dailyApi', () => {
    it('initializes a day through the explicit idempotent command endpoint', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ commandId: 'daily-initialize:ws:2026-07-28:work', recurringCreated: 0, migratedCount: 0 }),
      });
      await dailyApi.initialize('2026-07-28', 'work');
      expect(fetch).toHaveBeenCalledWith(
        '/api/daily/2026-07-28/initialize',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ context: 'work' }) }),
      );
    });
  });

  describe('tasksApi', () => {
    it('updateStatus calls PATCH with correct body', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true });
      await tasksApi.updateStatus('t1', '2026-05-05', 'done');
      expect(fetch).toHaveBeenCalledWith(
        '/api/tasks/t1',
        expect.objectContaining({
          method: 'PATCH',
          body: expect.stringContaining('"status":"done"'),
        })
      );
    });

    it('delete calls DELETE with date in body', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true });
      await tasksApi.delete('t1', '2026-05-05');
      expect(fetch).toHaveBeenCalledWith(
        '/api/tasks/t1',
        expect.objectContaining({
          method: 'DELETE',
          body: expect.stringContaining('"date":"2026-05-05"'),
        })
      );
    });
  });

  describe('mindmapsApi', () => {
    const map = {
      id: 'mm_1',
      title: 'Map',
      rootId: 'root',
      nodes: [{ id: 'root', text: 'Map', position: { x: 0, y: 0 }, kind: 'root' as const }],
      edges: [],
      version: 2 as const,
      createdAt: '2026-08-08T00:00:00.000Z',
      updatedAt: '2026-08-08T00:00:00.000Z',
    };

    it('unwraps the mindmap from promote-to-task responses', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ task: { id: 't_1' }, node: map.nodes[0], mindmap: map }),
      });
      await expect(
        mindmapsApi.promoteNodeToTask('mm_1', 'n_1', { date: '2026-08-08' }),
      ).resolves.toEqual(map);
    });

    it('unwraps the mindmap from link-task responses', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ node: map.nodes[0], mindmap: map }),
      });
      await expect(
        mindmapsApi.linkNodeToTask('mm_1', 'n_1', 't_1', '2026-08-08'),
      ).resolves.toEqual(map);
    });
  });

  describe('rolloverApi', () => {
    it('preview calls POST /api/rollover/preview', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ fromDate: '2026-05-04', toDate: '2026-05-05', tasksToMigrate: [], targetContent: '' }),
      });
      await rolloverApi.preview('2026-05-05');
      expect(fetch).toHaveBeenCalledWith(
        '/api/rollover/preview',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ toDate: '2026-05-05', context: 'work' }),
        })
      );
    });
  });

  describe('configApi', () => {
    it('update calls versioned PATCH with a partial config body', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          version: 'v2',
          workspaceRoot: '/tmp/test',
          dailyPathTemplate: '{date}.md',
          rolloverTrigger: 'manual',
          rolloverSkipTags: ['no-rollover'],
          activeContext: 'life',
        }),
      });
      const config: ConfigData = {
        version: 'v1',
        workspaceRoot: '/tmp/test',
        dailyPathTemplate: '{date}.md',
        rolloverTrigger: 'manual',
        rolloverSkipTags: ['no-rollover'],
      };
      const result = await configApi.update({ activeContext: 'life' }, config.version);
      expect(fetch).toHaveBeenCalledWith(
        '/api/config',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            version: 'v1',
            patch: { activeContext: 'life' },
          }),
        })
      );
      expect(result.version).toBe('v2');
    });

    it('surfaces a 409 config version conflict', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        status: 409,
        ok: false,
        json: () => Promise.resolve({ error: 'Config changed since it was loaded' }),
      });
      const error = await configApi.update({ activeContext: 'life' }, 'stale')
        .catch((caught: Error & { status?: number }) => caught);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error & { status?: number }).status).toBe(409);
    });
  });

  describe('domain events', () => {
    it('dispatches a typed calendar event with its detail payload', () => {
      const listener = vi.fn();
      window.addEventListener(DOMAIN_EVENTS.calendarEventsChanged, listener);

      dispatchDomainEvent(DOMAIN_EVENTS.calendarEventsChanged, {
        provider: 'feishu',
        reason: 'manual-sync',
      });

      expect(listener).toHaveBeenCalledOnce();
      expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({
        provider: 'feishu',
        reason: 'manual-sync',
      });
      window.removeEventListener(DOMAIN_EVENTS.calendarEventsChanged, listener);
    });
  });

  describe('projectsApi', () => {
    it('create calls POST with project data', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'p1', name: 'Test Project' }),
      });
      const result = await projectsApi.create({ name: 'Test Project', status: 'active' });
      expect(result.name).toBe('Test Project');
    });
  });


  describe('thinkingWorkspacesApi', () => {
    it('create calls POST with workspace data', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'ws1', title: 'Think clearly', kind: 'workspace', status: 'active', intent: '', scratchpad: '', taskIds: [], linkedNoteIds: [], timeline: [], createdAt: 'now', updatedAt: 'now' }),
      });
      const result = await thinkingWorkspacesApi.create({ title: 'Think clearly', intent: 'Plan before tasks' });
      expect(result.id).toBe('ws1');
      expect(fetch).toHaveBeenCalledWith(
        '/api/thinking-workspaces',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ title: 'Think clearly', intent: 'Plan before tasks' }),
        })
      );
    });

    it('update calls PUT with workspace updates', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'ws1', title: 'Updated' }),
      });
      await thinkingWorkspacesApi.update('ws1', { title: 'Updated' });
      expect(fetch).toHaveBeenCalledWith(
        '/api/thinking-workspaces/ws1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ title: 'Updated' }),
        })
      );
    });
  });

  describe('gitApi', () => {
    it('sync calls POST with message', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, commitHash: 'abc123' }),
      });
      await gitApi.sync('Test commit', 'session-token');
      expect(fetch).toHaveBeenCalledWith(
        '/api/git/sync',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ message: 'Test commit', token: 'session-token' }),
        })
      );
    });
  });
});
