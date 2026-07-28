import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { loadConfig, loadVersionedConfig, patchConfig, saveConfig } from '../config.js';
import type { Config } from '../../types/task.js';
import { normalizeWorkspacePath } from '../../routes/config.js';

let testConfigDir: string;
let previousConfigFile: string | undefined;

describe('loadConfig', () => {
  beforeAll(async () => {
    testConfigDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dailyflow-config-test-'));
    previousConfigFile = process.env.DAILYFLOW_CONFIG_FILE;
    process.env.DAILYFLOW_CONFIG_FILE = path.join(testConfigDir, 'config.json');
  });

  afterAll(async () => {
    if (previousConfigFile === undefined) {
      delete process.env.DAILYFLOW_CONFIG_FILE;
    } else {
      process.env.DAILYFLOW_CONFIG_FILE = previousConfigFile;
    }
    await fs.rm(testConfigDir, { recursive: true, force: true });
  });

  it('returns default config when file does not exist', async () => {
    const config = await loadConfig();
    // When no config file exists, defaults are populated but no synthetic
    // workspace is seeded — the frontend should drive the first-run setup.
    expect(config.workspaceRoot).toBe('');
    expect(config.workspaces).toEqual([]);
    expect(config.activeWorkspaceId).toBe('');
    expect(config.dailyPathTemplate).toBe('Daily/{year}/{month}/{date}.md');
    expect(config.rolloverTrigger).toBe('manual');
    expect(config.rolloverSkipTags).toEqual(['no-rollover']);
  });

  it('merges saved config with defaults', async () => {
    const partial: Config = {
      workspaceRoot: '/tmp/custom-workspace',
      workspaces: [
        {
          id: 'ws_partial',
          name: 'Partial',
          path: '/tmp/custom-workspace',
          createdAt: new Date().toISOString(),
        },
      ],
      activeWorkspaceId: 'ws_partial',
      dailyPathTemplate: '{date}.md',
      rolloverTrigger: 'manual',
      rolloverSkipTags: ['no-rollover'],
      aiApiKey: 'sk-test123',
    };
    await saveConfig(partial);

    const loaded = await loadConfig();
    expect(loaded.workspaceRoot).toBe('/tmp/custom-workspace');
    expect(loaded.dailyPathTemplate).toBe('{date}.md');
    expect(loaded.aiApiKey).toBe('sk-test123');
    // Defaults should still be present
    expect(loaded.rolloverSkipTags).toEqual(['no-rollover']);
  });

  it('saves and loads full config', async () => {
    const full: Config = {
      workspaceRoot: '/tmp/test',
      workspaces: [
        {
          id: 'ws_test',
          name: 'Test',
          path: '/tmp/test',
          createdAt: new Date().toISOString(),
        },
      ],
      activeWorkspaceId: 'ws_test',
      dailyPathTemplate: 'Notes/{date}.md',
      rolloverTrigger: 'on_app_open',
      rolloverSkipTags: ['no-rollover', 'hold'],
      githubRepo: 'https://github.com/user/repo',
      aiApiKey: 'sk-secret',
      ipfsEnabled: true,
      ipfsApiKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test',
      ipfsGateway: 'https://gateway.pinata.cloud',
    };
    await saveConfig(full);
    const loaded = await loadConfig();
    expect(loaded).toEqual(expect.objectContaining(full));
  });

  it('keeps concurrent writes parseable', async () => {
    const configs = Array.from({ length: 12 }, (_, index): Config => ({
      workspaceRoot: `/tmp/concurrent-${index}`,
      workspaces: [{
        id: `ws_concurrent_${index}`,
        name: `Concurrent ${index}`,
        path: `/tmp/concurrent-${index}`,
        createdAt: new Date().toISOString(),
      }],
      activeWorkspaceId: `ws_concurrent_${index}`,
      dailyPathTemplate: 'Daily/{date}.md',
      rolloverTrigger: 'manual',
      rolloverSkipTags: [],
    }));

    await Promise.all(configs.map(config => saveConfig(config)));
    const loaded = await loadConfig();
    expect(loaded.workspaces).toHaveLength(1);
    expect(loaded.workspaceRoot).toMatch(/^\/tmp\/concurrent-\d+$/);
  });

  it('applies partial updates without dropping unrelated settings', async () => {
    await saveConfig({
      workspaceRoot: '/tmp/versioned',
      workspaces: [{
        id: 'ws_versioned',
        name: 'Versioned',
        path: '/tmp/versioned',
        createdAt: new Date().toISOString(),
      }],
      activeWorkspaceId: 'ws_versioned',
      dailyPathTemplate: 'Daily/{date}.md',
      rolloverTrigger: 'manual',
      rolloverSkipTags: ['keep'],
      githubRepo: 'https://github.com/example/dailyflow',
    });
    const before = await loadVersionedConfig();

    const result = await patchConfig({ activeContext: 'life' }, before.version);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected patch to succeed');
    expect(result.config.activeContext).toBe('life');
    expect(result.config.githubRepo).toBe('https://github.com/example/dailyflow');
    expect(result.config.rolloverSkipTags).toEqual(['keep']);
    expect(result.config.version).not.toBe(before.version);
  });

  it('rejects a stale config version and preserves the winning update', async () => {
    const before = await loadVersionedConfig();
    const winningContext = before.activeContext === 'work' ? 'life' : 'work';
    const first = await patchConfig({ activeContext: winningContext }, before.version);
    expect(first.ok).toBe(true);

    const stale = await patchConfig({ githubRepo: 'https://github.com/stale/write' }, before.version);
    expect(stale.ok).toBe(false);
    const persisted = await loadConfig();
    expect(persisted.activeContext).toBe(winningContext);
    expect(persisted.githubRepo).not.toBe('https://github.com/stale/write');
  });

  it('treats null in a patch as removing an optional setting', async () => {
    const before = await loadVersionedConfig();
    const result = await patchConfig({ githubRepo: null }, before.version);
    expect(result.ok).toBe(true);
    expect((await loadConfig()).githubRepo).toBeUndefined();
  });

  it('removes legacy GitHub tokens and stores config with owner-only permissions', async () => {
    const configFile = process.env.DAILYFLOW_CONFIG_FILE!;
    await fs.writeFile(configFile, JSON.stringify({
      workspaceRoot: '/tmp/secure',
      workspaces: [{
        id: 'ws_secure',
        name: 'Secure',
        path: '/tmp/secure',
        createdAt: new Date().toISOString(),
      }],
      activeWorkspaceId: 'ws_secure',
      dailyPathTemplate: 'Daily/{date}.md',
      rolloverTrigger: 'manual',
      rolloverSkipTags: [],
      githubRepo: 'https://github.com/user/repo',
      githubToken: 'ghp_must_not_persist',
    }), 'utf8');

    const loaded = await loadConfig();
    expect(loaded).not.toHaveProperty('githubToken');
    const persisted = await fs.readFile(configFile, 'utf8');
    expect(persisted).not.toContain('ghp_must_not_persist');
    expect((await fs.stat(configFile)).mode & 0o777).toBe(0o600);
  });

  it('does not turn a malformed existing config into first-run state', async () => {
    const configFile = process.env.DAILYFLOW_CONFIG_FILE!;
    await fs.writeFile(configFile, '{"workspaces":', 'utf8');
    await expect(loadConfig()).rejects.toBeInstanceOf(SyntaxError);
    expect(await fs.readFile(configFile, 'utf8')).toBe('{"workspaces":');
  });
});

describe('normalizeWorkspacePath', () => {
  it.each([
    ['/Users/fangchen/Documents/DailyFlow/', '/Users/fangchen/Documents/DailyFlow'],
    ['  /Users/fangchen/Documents/DailyFlow////  ', '/Users/fangchen/Documents/DailyFlow'],
    ['/', '/'],
    ['C:\\', 'C:\\'],
    ['C:\\Users\\fangchen\\DailyFlow\\', 'C:\\Users\\fangchen\\DailyFlow'],
    ['\\\\server\\share\\', '\\\\server\\share'],
    ['', ''],
  ])('normalizes %s as %s', (input, expected) => {
    expect(normalizeWorkspacePath(input)).toBe(expected);
  });
});
