import { describe, it, expect, vi, beforeEach } from 'vitest';
import { filesApi, tasksApi, rolloverApi, configApi, projectsApi, gitApi, type ConfigData } from './client';

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
          body: JSON.stringify({ toDate: '2026-05-05' }),
        })
      );
    });
  });

  describe('configApi', () => {
    it('update calls POST with config body', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true });
      const config: ConfigData = {
        workspaceRoot: '/tmp/test',
        dailyPathTemplate: '{date}.md',
        rolloverTrigger: 'manual',
        rolloverSkipTags: ['no-rollover'],
      };
      await configApi.update(config);
      expect(fetch).toHaveBeenCalledWith(
        '/api/config',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(config),
        })
      );
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

  describe('gitApi', () => {
    it('sync calls POST with message', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, commitHash: 'abc123' }),
      });
      await gitApi.sync('Test commit');
      expect(fetch).toHaveBeenCalledWith(
        '/api/git/sync',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ message: 'Test commit' }),
        })
      );
    });
  });
});
