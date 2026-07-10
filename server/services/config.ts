import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import type { Config, Workspace } from '../types/task.js';

const CONFIG_FILE = path.join(os.homedir(), '.dailyflow', 'config.json');

const DEFAULT_WORKSPACE_PATH = path.join(os.homedir(), 'Desktop', 'DailyFlow');

const DEFAULT_CONFIG: Config = {
  workspaceRoot: DEFAULT_WORKSPACE_PATH,
  workspaces: [],
  activeWorkspaceId: '',
  dailyPathTemplate: 'Daily/{year}/{month}/{date}.md',
  rolloverTrigger: 'manual',
  rolloverSkipTags: ['no-rollover'],
  activeContext: 'work'
};

function newWorkspaceId(): string {
  return 'ws_' + crypto.randomBytes(6).toString('hex');
}

/**
 * Normalize workspaces[] and activeWorkspaceId.
 *
 * Important: we never silently seed a default workspace when workspaces[] is empty.
 * Doing so would cause the app to "snap back" to ~/Desktop/DailyFlow on every
 * cold start whenever the array got lost, masking real data the user picked.
 * Instead we leave workspaces empty and let the frontend show the first-run
 * setup screen.
 */
function ensureWorkspaces(config: Config): Config {
  const workspaces = Array.isArray(config.workspaces) ? [...config.workspaces] : [];

  if (workspaces.length === 0) {
    config.workspaces = [];
    config.activeWorkspaceId = '';
    config.workspaceRoot = '';
    return config;
  }

  const active = workspaces.find(w => w.id === config.activeWorkspaceId) || workspaces[0];
  config.workspaces = workspaces;
  config.activeWorkspaceId = active.id;
  config.workspaceRoot = active.path;
  return config;
}

export async function loadConfig(): Promise<Config> {
  let raw: Partial<Config> = {};
  let needsPersist = false;
  try {
    const content = await fs.readFile(CONFIG_FILE, 'utf-8');
    raw = JSON.parse(content);
  } catch (error: any) {
    if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) {
      throw error;
    }
    needsPersist = true;
  }

  const hadWorkspaces = Array.isArray(raw.workspaces) && raw.workspaces.length > 0;
  const merged: Config = { ...DEFAULT_CONFIG, ...raw };
  const normalized = ensureWorkspaces(merged);

  if (!hadWorkspaces) needsPersist = true;

  if (needsPersist) {
    try {
      const dir = path.dirname(CONFIG_FILE);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(CONFIG_FILE, JSON.stringify(normalized, null, 2), 'utf-8');
    } catch {
      // best-effort; subsequent saveConfig will persist
    }
  }

  return normalized;
}

export async function saveConfig(config: Config): Promise<void> {
  const dir = path.dirname(CONFIG_FILE);
  await fs.mkdir(dir, { recursive: true });
  const normalized = ensureWorkspaces({ ...config });
  await fs.writeFile(CONFIG_FILE, JSON.stringify(normalized, null, 2), 'utf-8');
}

export function generateWorkspaceId(): string {
  return newWorkspaceId();
}
