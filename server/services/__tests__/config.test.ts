import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { loadConfig, saveConfig } from '../config.js';
import type { Config } from '../../types/task.js';

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
});
