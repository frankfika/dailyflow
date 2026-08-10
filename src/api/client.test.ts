import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  configApi,
  dispatchDomainEvent,
  DOMAIN_EVENTS,
  dailyApi,
  eventsApi,
  filesApi,
  mindmapsApi,
  rolloverApi,
  tasksApi,
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

  describe('eventsApi compatibility facade', () => {
    it('normalizes the server array responses used by event routes', async () => {
      const event = { id: 'ev_1', title: 'Launch' };
      global.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([event]) })
        .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(event) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([{ id: 'today_1' }]) });

      await expect(eventsApi.list()).resolves.toEqual({ events: [event] });
      await expect(eventsApi.getById('ev_1')).resolves.toEqual({ event });
      await expect(eventsApi.listTodayItems('2026-08-10')).resolves.toEqual({ items: [{ id: 'today_1' }] });
    });

    it('uses Event semantic command endpoints for unschedule and reschedule', async () => {
      global.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ unscheduled: true, alreadyUnscheduled: false }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ rescheduled: true, alreadyScheduled: false }) });

      await eventsApi.unscheduleNodeTask({ taskId: 't1', scheduledDate: '2026-08-10', mindmapId: 'mm1', nodeId: 'n1' });
      await eventsApi.rescheduleNodeTask({ taskId: 't1', fromDate: '2026-08-10', toDate: '2026-08-11', mindmapId: 'mm1', nodeId: 'n1' });

      expect(fetch).toHaveBeenNthCalledWith(1, '/api/events/actions/unschedule-node-task', expect.objectContaining({ method: 'POST' }));
      expect(fetch).toHaveBeenNthCalledWith(2, '/api/events/actions/reschedule-node-task', expect.objectContaining({ method: 'POST' }));
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

});
