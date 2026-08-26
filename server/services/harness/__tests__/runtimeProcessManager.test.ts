import os from 'node:os';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDailyFlowSidecar, DailyFlowAcpClient, dailyFlowDshProfileDir, RuntimeProcessManager } from '../runtimeProcessManager';
import { DAILYFLOW_TOOL_ALLOWLIST } from '../runtimePolicy';

describe('RuntimeProcessManager', () => {
  it('keeps stdout as JSON-RPC, captures stderr separately, and stops cleanly', async () => {
    const manager = new RuntimeProcessManager({
      command: process.execPath,
      args: ['-e', `
        const readline = require('node:readline');
        process.stderr.write('sidecar diagnostic');
        readline.createInterface({ input: process.stdin }).on('line', line => {
          const msg = JSON.parse(line);
          process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { pong: true } }) + '\\n');
        });
      `],
      cwd: os.tmpdir(),
    });
    await manager.start();
    manager.send({ jsonrpc: '2.0', id: 1, method: 'ping' });
    await expect(manager.nextMessage(2_000)).resolves.toMatchObject({ id: 1, result: { pong: true } });
    expect(manager.safeStderr).toContain('sidecar diagnostic');
    await manager.stop();
    expect(manager.alive).toBe(false);
  });

  it('fails closed on non-protocol stdout', async () => {
    const manager = new RuntimeProcessManager({
      command: process.execPath,
      args: ['-e', `process.stdout.write('human log\\n'); setTimeout(() => {}, 5000)`],
      cwd: os.tmpdir(),
    });
    await manager.start();
    await expect(manager.nextMessage(2_000)).rejects.toMatchObject({ code: 'SIDECAR_PROTOCOL_INVALID' });
    await manager.stop();
  });

  it('reports a crash while waiting for a response', async () => {
    const manager = new RuntimeProcessManager({ command: process.execPath, args: ['-e', 'process.exit(7)'], cwd: os.tmpdir() });
    await manager.start();
    await expect(manager.nextMessage(2_000)).rejects.toMatchObject({ code: 'SIDECAR_CRASHED' });
  });

  it('boots the pinned DailyFlow ACP profile and creates a keyless fresh session', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'dailyflow-acp-smoke-'));
    const projection = path.join(root, 'projection.json');
    const toolsetSnapshot = path.join(root, 'toolset.json');
    await writeFile(projection, JSON.stringify({ baseRevision: 'smoke', event: {}, mindmap: { nodes: [], edges: [] } }));
    const manager = createDailyFlowSidecar({
      cwd: root,
      env: {
        DAILYFLOW_DSH_API_KEY: 'keyless-profile-smoke',
        DAILYFLOW_DSH_BASE_URL: 'https://api.openai.com/v1',
        DAILYFLOW_DSH_MODEL: 'gpt-4o-mini',
        DAILYFLOW_DSH_PROJECTION_PATH: projection,
        DAILYFLOW_DSH_HANDOFF_PATH: path.join(root, 'handoff.json'),
        DAILYFLOW_DSH_EVENTS_PATH: path.join(root, 'events.jsonl'),
        DAILYFLOW_DSH_TOOLSET_SNAPSHOT_PATH: toolsetSnapshot,
        DAILYFLOW_DSH_SESSION_ROOT: path.join(root, 'sessions'),
        DSH_HOME: path.join(root, '.dsh'),
        DSH_AGENTS_HOME: path.join(root, '.agents'),
      },
    });
    try {
      await manager.start();
      const client = new DailyFlowAcpClient(manager);
      await expect(client.initialize()).resolves.toMatchObject({ agentCapabilities: expect.any(Object) });
      await expect(client.newSession(root)).resolves.toEqual(expect.any(String));
      expect(JSON.parse(await readFile(toolsetSnapshot, 'utf8'))).toEqual([...DAILYFLOW_TOOL_ALLOWLIST].sort());
      expect(manager.alive).toBe(true);
      expect(manager.safeStderr).not.toContain('without inject');
    } finally {
      await manager.stop();
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  it('pins the boot profile to the exact seven proposal-only tools', async () => {
    const snapshot = JSON.parse(await readFile(path.join(dailyFlowDshProfileDir(), 'profile.snapshot.json'), 'utf8')) as {
      tools: string[]; disabled: string[]; businessWritePolicy: string;
    };
    expect(snapshot.tools).toEqual(DAILYFLOW_TOOL_ALLOWLIST);
    expect(snapshot.disabled).toEqual(expect.arrayContaining(['bash', 'filesystem', 'terminal', 'mcp', 'web', 'subagent', 'workflow']));
    expect(snapshot.businessWritePolicy).toBe('proposal-only');
  });
});
