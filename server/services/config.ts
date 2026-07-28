import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import type { Config, Workspace } from '../types/task.js';

const DEFAULT_CONFIG_FILE = path.join(os.homedir(), '.dailyflow', 'config.json');

/**
 * Resolve the config path at call time so tests can use an isolated file.
 *
 * This must not be a module-level snapshot: Vitest hoists imports before test
 * setup hooks run. Reading the environment lazily lets each test point config
 * reads/writes at its own temporary directory without ever touching the
 * user's real ~/.dailyflow/config.json.
 */
function getConfigFile(): string {
  return process.env.DAILYFLOW_CONFIG_FILE || DEFAULT_CONFIG_FILE;
}

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

export interface VersionedConfig extends Config {
  version: string;
}

export type ConfigPatch = {
  [K in keyof Config]?: Config[K] | null;
};

export type ConfigPatchResult =
  | { ok: true; config: VersionedConfig }
  | { ok: false; config: VersionedConfig };

let configWriteQueue: Promise<void> = Promise.resolve();

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
  const configFile = getConfigFile();
  let raw: Partial<Config> = {};
  let fileExisted = false;
  try {
    const content = await fs.readFile(configFile, 'utf-8');
    raw = JSON.parse(content);
    fileExisted = true;
  } catch (error: any) {
    if (error.code !== 'ENOENT') throw error;
    // File did not exist — that's a real first run, seed defaults.
  }

  const merged = { ...DEFAULT_CONFIG, ...raw } as Config & Record<string, unknown>;
  delete merged.githubToken;
  const normalized = ensureWorkspaces(merged);
  const hadLegacyGithubToken = Object.prototype.hasOwnProperty.call(raw, 'githubToken');

  // Only seed the file when it was missing entirely. If the file existed
  // but had no workspaces, the user either (a) explicitly deleted the last
  // workspace via DELETE /api/config/workspaces/:id, or (b) a race left
  // the file empty. In both cases we must NOT echo an empty workspaces
  // array back to disk — that would re-wipe on the next read, and the
  // resulting cascade is what was wiping the e2e workspace mid-test.
  if (!fileExisted) {
    try {
      const dir = path.dirname(configFile);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(configFile, JSON.stringify(normalized, null, 2), { encoding: 'utf-8', mode: 0o600 });
    } catch {
      // best-effort; subsequent saveConfig will persist
    }
  }
  if (fileExisted && hadLegacyGithubToken) {
    await writeConfig(normalized);
  }

  return normalized;
}

function configVersion(config: Config): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(config))
    .digest('hex');
}

export async function loadVersionedConfig(): Promise<VersionedConfig> {
  const config = await loadConfig();
  return { ...config, version: configVersion(config) };
}

async function writeConfig(config: Config): Promise<Config> {
  const configFile = getConfigFile();
  const dir = path.dirname(configFile);
  await fs.mkdir(dir, { recursive: true });
  const sanitized = { ...(config as Config & Record<string, unknown>) };
  delete sanitized.githubToken;
  const normalized = ensureWorkspaces(sanitized);
  const tempFile = `${configFile}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  try {
    await fs.writeFile(tempFile, JSON.stringify(normalized, null, 2), { encoding: 'utf-8', mode: 0o600 });
    await fs.rename(tempFile, configFile);
    await fs.chmod(configFile, 0o600);
  } finally {
    await fs.rm(tempFile, { force: true }).catch(() => undefined);
  }
  return normalized;
}

function enqueueConfigWrite<T>(operation: () => Promise<T>): Promise<T> {
  const result = configWriteQueue.then(operation, operation);
  configWriteQueue = result.then(() => undefined, () => undefined);
  return result;
}

export async function saveConfig(config: Config): Promise<void> {
  await enqueueConfigWrite(async () => {
    await writeConfig(config);
  });
}

/**
 * Apply a partial config update only when the caller's version still matches.
 * Serializing the read/compare/write sequence prevents two concurrent PATCH
 * requests from both observing the same version and silently overwriting one
 * another.
 */
export async function patchConfig(
  patch: ConfigPatch,
  expectedVersion: string,
): Promise<ConfigPatchResult> {
  return enqueueConfigWrite(async () => {
    const current = await loadConfig();
    const currentVersioned = { ...current, version: configVersion(current) };
    if (expectedVersion !== currentVersioned.version) {
      return { ok: false, config: currentVersioned };
    }

    const next = { ...current } as Config & Record<string, unknown>;
    for (const [key, value] of Object.entries(patch)) {
      if (key === 'version') continue;
      if (value === null) delete next[key];
      else if (value !== undefined) next[key] = value;
    }
    const normalized = await writeConfig(next);
    return {
      ok: true,
      config: { ...normalized, version: configVersion(normalized) },
    };
  });
}

export function generateWorkspaceId(): string {
  return newWorkspaceId();
}
