import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import readline from 'node:readline';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';

export interface SidecarMessage {
  jsonrpc: '2.0';
  id?: string | number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: unknown;
}

export interface SidecarProcessOptions {
  command: string;
  args?: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  startupTimeoutMs?: number;
  maxStderrBytes?: number;
}

/** Process boundary for the official ACP JSON-RPC stdio executable. */
export class RuntimeProcessManager {
  private child?: ChildProcessWithoutNullStreams;
  private stderr = '';
  private readonly messages: SidecarMessage[] = [];
  private readonly waiters = new Set<() => void>();
  private protocolError?: Error;

  constructor(private readonly opts: SidecarProcessOptions) {}

  get alive(): boolean {
    return !!this.child && this.child.exitCode === null && this.child.signalCode === null && !this.child.killed;
  }

  get safeStderr(): string {
    return this.stderr;
  }

  async start(): Promise<void> {
    if (this.alive) return;
    const child = spawn(this.opts.command, this.opts.args ?? [], {
      cwd: this.opts.cwd,
      // Do not leak the host application's unrelated credentials into the
      // model runtime. Callers must explicitly pass every DSH/provider value.
      env: { ...safeInheritedEnvironment(), ...this.opts.env },
      detached: process.platform !== 'win32',
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child = child;
    const stderrLimit = this.opts.maxStderrBytes ?? 32 * 1024;
    child.stderr.on('data', (chunk: Buffer) => {
      this.stderr = redactSidecarDiagnostic(
        `${this.stderr}${chunk.toString('utf8')}`,
        this.opts.env,
      ).slice(-stderrLimit);
    });
    readline.createInterface({ input: child.stdout }).on('line', (line) => {
      try {
        const parsed = JSON.parse(line) as SidecarMessage;
        if (parsed.jsonrpc !== '2.0') throw new Error('Not a JSON-RPC 2.0 message.');
        this.messages.push(parsed);
      } catch {
        this.protocolError = Object.assign(new Error('Sidecar wrote non-protocol data to stdout.'), { code: 'SIDECAR_PROTOCOL_INVALID' });
        void this.stop();
      }
      this.notify();
    });
    child.once('exit', () => this.notify());
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(Object.assign(new Error('Sidecar startup timed out.'), { code: 'SIDECAR_START_TIMEOUT' }));
      }, this.opts.startupTimeoutMs ?? 10_000);
      const cleanup = () => {
        clearTimeout(timer);
        child.off('spawn', onSpawn);
        child.off('error', onError);
      };
      const onSpawn = () => { cleanup(); resolve(); };
      const onError = (error: Error) => { cleanup(); reject(Object.assign(error, { code: 'SIDECAR_START_FAILED' })); };
      child.once('spawn', onSpawn);
      child.once('error', onError);
    });
  }

  send(message: SidecarMessage): void {
    if (!this.alive || !this.child) throw Object.assign(new Error('Sidecar is not running.'), { code: 'SIDECAR_NOT_RUNNING' });
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  async nextMessage(timeoutMs = 30_000): Promise<SidecarMessage> {
    if (this.messages.length) return this.messages.shift()!;
    if (this.protocolError) throw this.protocolError;
    await new Promise<void>((resolve, reject) => {
      const wake = () => { cleanup(); resolve(); };
      const timer = setTimeout(() => { cleanup(); reject(Object.assign(new Error('Sidecar response timed out.'), { code: 'SIDECAR_RESPONSE_TIMEOUT' })); }, timeoutMs);
      const cleanup = () => { clearTimeout(timer); this.waiters.delete(wake); };
      this.waiters.add(wake);
    });
    if (this.protocolError) throw this.protocolError;
    if (this.messages.length) return this.messages.shift()!;
    throw Object.assign(new Error('Sidecar exited before responding.'), { code: 'SIDECAR_CRASHED' });
  }

  async stop(): Promise<void> {
    const child = this.child;
    if (!child || child.exitCode !== null) return;
    child.stdin.end();
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        if (child.pid && child.pid > 1) {
          try {
            if (process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL');
            else child.kill('SIGKILL');
          } catch { /* already exited */ }
        }
        resolve();
      }, 2_000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
      if (child.pid && child.pid > 1) {
        try {
          if (process.platform !== 'win32') process.kill(-child.pid, 'SIGTERM');
          else child.kill('SIGTERM');
        } catch { clearTimeout(timer); resolve(); }
      }
    });
  }

  private notify(): void {
    for (const waiter of this.waiters) waiter();
    this.waiters.clear();
  }
}

const SAFE_INHERITED_ENV = [
  'PATH', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ',
  'SystemRoot', 'WINDIR', 'PATHEXT', '__CF_USER_TEXT_ENCODING', 'NODE_EXTRA_CA_CERTS',
] as const;

function safeInheritedEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of SAFE_INHERITED_ENV) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  return env;
}

function redactSidecarDiagnostic(input: string, explicitEnv?: NodeJS.ProcessEnv): string {
  let output = input;
  for (const [key, value] of Object.entries(explicitEnv ?? {})) {
    if (!value || !/api.?key|authorization|token|secret|password/i.test(key)) continue;
    output = output.split(value).join('[REDACTED]');
  }
  return output
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:sk|key)-[A-Za-z0-9_-]{8,}\b/g, '[REDACTED]')
    .replace(/<think>[\s\S]*?<\/think>/gi, '<think>[REDACTED]</think>');
}

export interface AcpNotification {
  method: string;
  params?: unknown;
}

/** Narrow ACP client used by DailyFlow. It deliberately implements no MCP or permission bridge. */
export class DailyFlowAcpClient {
  private requestId = 0;
  private readonly notifications: AcpNotification[] = [];
  private readonly notificationWaiters = new Set<() => void>();

  constructor(private readonly process: RuntimeProcessManager) {}

  async initialize(): Promise<unknown> {
    return this.request('initialize', { protocolVersion: 1, clientCapabilities: {} });
  }

  async newSession(cwd: string): Promise<string> {
    const result = await this.request('session/new', { cwd: path.resolve(cwd), mcpServers: [] });
    const sessionId = isObject(result) ? result.sessionId : undefined;
    if (typeof sessionId !== 'string' || !sessionId) throw protocolError('session/new returned no sessionId');
    return sessionId;
  }

  prompt(sessionId: string, text: string): Promise<unknown> {
    return this.request('session/prompt', { sessionId, prompt: [{ type: 'text', text }] }, 180_000);
  }

  cancel(sessionId: string): void {
    this.process.send({ jsonrpc: '2.0', method: 'session/cancel', params: { sessionId } });
  }

  async nextNotification(timeoutMs = 30_000): Promise<AcpNotification> {
    if (this.notifications.length) return this.notifications.shift()!;
    await new Promise<void>((resolve, reject) => {
      const wake = () => { cleanup(); resolve(); };
      const timer = setTimeout(() => { cleanup(); reject(Object.assign(new Error('ACP notification timed out.'), { code: 'ACP_NOTIFICATION_TIMEOUT' })); }, timeoutMs);
      const cleanup = () => { clearTimeout(timer); this.notificationWaiters.delete(wake); };
      this.notificationWaiters.add(wake);
    });
    return this.notifications.shift()!;
  }

  drainNotifications(): AcpNotification[] {
    return this.notifications.splice(0);
  }

  private async request(method: string, params: object, timeoutMs = 30_000): Promise<unknown> {
    const id = ++this.requestId;
    this.process.send({ jsonrpc: '2.0', id, method, params });
    const deadline = Date.now() + timeoutMs;
    while (true) {
      const message = await this.process.nextMessage(Math.max(1, deadline - Date.now()));
      if (message.method) {
        this.notifications.push({ method: message.method, params: message.params });
        for (const wake of this.notificationWaiters) wake();
        this.notificationWaiters.clear();
        continue;
      }
      if (message.id !== id) throw protocolError(`unexpected ACP response id ${String(message.id)}`);
      if (message.error !== undefined) {
        const error = Object.assign(new Error(`ACP ${method} failed`), { code: 'ACP_RESPONSE_ERROR', data: message.error });
        throw error;
      }
      return message.result;
    }
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function protocolError(message: string): Error {
  return Object.assign(new Error(message), { code: 'ACP_PROTOCOL_INVALID' });
}

export function dailyFlowDshProfileDir(): string {
  const packaged = path.join(moduleDirectory(), 'dsh', 'profile');
  if (existsSync(path.join(packaged, 'cordis.yml')) && existsSync(path.join(packaged, 'dailyflow-tools.mjs'))) return packaged;
  return path.join(process.cwd(), 'server', 'services', 'harness', 'dsh-profile');
}

export function createDailyFlowSidecar(options: { cwd: string; env: NodeJS.ProcessEnv }): RuntimeProcessManager {
  const packaged = path.join(moduleDirectory(), 'dsh');
  const require = createRequire(path.join(packaged, 'package.json'));
  const pkg = require.resolve('@deepseek-ai/dsh-acp-demo/package.json');
  const bin = path.join(path.dirname(pkg), 'lib', 'bin.js');
  const profileDir = dailyFlowDshProfileDir();
  return new RuntimeProcessManager({
    command: process.execPath,
    args: [bin, '--config', path.join(profileDir, 'cordis.yml')],
    cwd: options.cwd,
    env: options.env,
    startupTimeoutMs: 10_000,
  });
}

function moduleDirectory(): string {
  return typeof __filename === 'string' ? path.dirname(__filename) : process.cwd();
}

let readinessCache: { at: number; result: { ready: boolean; failureCode?: string } } | undefined;

/** Boot-level readiness: profile integrity + real ACP initialize/session/new + resolved schema snapshot. */
export async function checkDailyFlowSidecarReadiness(expectedTools: readonly string[]): Promise<{ ready: boolean; failureCode?: string }> {
  if (readinessCache && Date.now() - readinessCache.at < 30_000) return readinessCache.result;
  const profile = dailyFlowDshProfileDir();
  try {
    await Promise.all(['package.json', 'cordis.yml', 'dailyflow-tools.mjs', 'profile.snapshot.json'].map(file => access(path.join(profile, file))));
    const snapshot = JSON.parse(await readFile(path.join(profile, 'profile.snapshot.json'), 'utf8')) as { tools?: unknown };
    if (!Array.isArray(snapshot.tools) || JSON.stringify(snapshot.tools) !== JSON.stringify(expectedTools)) {
      return cacheReadiness({ ready: false, failureCode: 'TOOLSET_UNSAFE' });
    }
  } catch {
    return cacheReadiness({ ready: false, failureCode: 'PROFILE_MISSING' });
  }
  const root = await mkdtemp(path.join(os.tmpdir(), 'dailyflow-dsh-health-'));
  const projection = path.join(root, 'projection.json');
  const toolset = path.join(root, 'toolset.json');
  const manager = createDailyFlowSidecar({
    cwd: root,
    env: {
      DAILYFLOW_DSH_API_KEY: 'keyless-readiness-probe',
      DAILYFLOW_DSH_BASE_URL: 'https://api.openai.com/v1',
      DAILYFLOW_DSH_MODEL: 'gpt-4o-mini',
      DAILYFLOW_DSH_PROJECTION_PATH: projection,
      DAILYFLOW_DSH_HANDOFF_PATH: path.join(root, 'handoff.json'),
      DAILYFLOW_DSH_EVENTS_PATH: path.join(root, 'events.jsonl'),
      DAILYFLOW_DSH_TOOLSET_SNAPSHOT_PATH: toolset,
      DAILYFLOW_DSH_SESSION_ROOT: path.join(root, 'sessions'),
      DSH_HOME: path.join(root, '.dsh'),
      DSH_AGENTS_HOME: path.join(root, '.agents'),
    },
  });
  try {
    await writeFile(projection, JSON.stringify({ baseRevision: 'health', event: {}, mindmap: { nodes: [], edges: [] } }), { mode: 0o600 });
    await manager.start();
    const client = new DailyFlowAcpClient(manager);
    await client.initialize();
    await client.newSession(root);
    const resolved = JSON.parse(await readFile(toolset, 'utf8')) as unknown;
    if (JSON.stringify(resolved) !== JSON.stringify([...expectedTools].sort())) {
      return cacheReadiness({ ready: false, failureCode: 'TOOLSET_UNSAFE' });
    }
    return cacheReadiness({ ready: true });
  } catch {
    return cacheReadiness({ ready: false, failureCode: 'SIDECAR_NOT_READY' });
  } finally {
    await manager.stop();
    await rm(root, { recursive: true, force: true });
  }
}

function cacheReadiness(result: { ready: boolean; failureCode?: string }): { ready: boolean; failureCode?: string } {
  readinessCache = { at: Date.now(), result };
  return result;
}

export interface DshInstallationProbe {
  installed: boolean;
  version?: string;
  cliPath?: string;
  acpModulePath?: string;
  failureCode?: string;
}

/** Resolve only pinned official packages; never searches PATH or executes user aliases. */
export function probeDshInstallation(): DshInstallationProbe {
  try {
    const require = createRequire(path.join(moduleDirectory(), 'dsh', 'package.json'));
    const dshPackagePath = require.resolve('@deepseek-ai/dsh/package.json');
    const dshPackage = require(dshPackagePath) as { version?: string };
    const cliPath = path.join(path.dirname(dshPackagePath), 'lib', 'bin.js');
    const acpModulePath = require.resolve('@deepseek-ai/dsh-acp/package.json');
    if (dshPackage.version !== '0.1.1-rc.2') {
      return { installed: true, version: dshPackage.version, cliPath, acpModulePath, failureCode: 'DSH_VERSION_MISMATCH' };
    }
    return { installed: true, version: dshPackage.version, cliPath, acpModulePath };
  } catch {
    return { installed: false, failureCode: 'DSH_NOT_INSTALLED' };
  }
}
