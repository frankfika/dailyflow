import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import readline from 'node:readline';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist-server', 'dsh');

test('packaged DSH sidecar has pinned runtime, adapter, and boot profile', async () => {
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
  assert.equal(manifest.profile, 'dailyflow-event-operator@1');
  assert.deepEqual(manifest.versions, {
    '@deepseek-ai/dsh': '0.1.1-rc.2',
    '@deepseek-ai/dsh-acp-demo': '0.1.1-rc.2',
    '@deepseek-ai/dsh-llm-pi-ai': '0.1.1-rc.2',
  });
  await Promise.all([
    access(path.join(root, 'node_modules', '@deepseek-ai', 'dsh-acp-demo', 'lib', 'bin.js')),
    access(path.join(root, 'profile', 'cordis.yml')),
    access(path.join(root, 'profile', 'dailyflow-tools.mjs')),
    access(path.join(root, 'profile', 'profile.snapshot.json')),
  ]);
});

test('packaged Node boots ACP and resolves exactly the DailyFlow toolset', { timeout: 30_000 }, async () => {
  const work = await mkdtemp(path.join(os.tmpdir(), 'dailyflow-packaged-dsh-'));
  const projection = path.join(work, 'projection.json');
  const toolset = path.join(work, 'toolset.json');
  await writeFile(projection, JSON.stringify({ baseRevision: 'packaged', event: {}, mindmap: { nodes: [], edges: [] } }));
  const bundledNode = path.join(root, '..', process.platform === 'win32' ? 'node.exe' : 'node');
  const child = spawn(bundledNode, [
    path.join(root, 'node_modules', '@deepseek-ai', 'dsh-acp-demo', 'lib', 'bin.js'),
    '--config', path.join(root, 'profile', 'cordis.yml'),
  ], {
    cwd: work,
    env: {
      ...process.env,
      DAILYFLOW_DSH_API_KEY: 'keyless-packaged-smoke',
      DAILYFLOW_DSH_BASE_URL: 'https://api.openai.com/v1',
      DAILYFLOW_DSH_MODEL: 'gpt-4o-mini',
      DAILYFLOW_DSH_PROJECTION_PATH: projection,
      DAILYFLOW_DSH_HANDOFF_PATH: path.join(work, 'handoff.json'),
      DAILYFLOW_DSH_EVENTS_PATH: path.join(work, 'events.jsonl'),
      DAILYFLOW_DSH_TOOLSET_SNAPSHOT_PATH: toolset,
      DAILYFLOW_DSH_SESSION_ROOT: path.join(work, 'sessions'),
      DSH_HOME: path.join(work, '.dsh'),
      DSH_AGENTS_HOME: path.join(work, '.agents'),
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const messages = [];
  const waiters = [];
  readline.createInterface({ input: child.stdout }).on('line', line => {
    messages.push(JSON.parse(line));
    waiters.splice(0).forEach(resolve => resolve());
  });
  const request = async (id, method, params) => {
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    while (true) {
      const index = messages.findIndex(message => message.id === id);
      if (index >= 0) {
        const message = messages.splice(index, 1)[0];
        assert.equal(message.error, undefined, JSON.stringify(message.error));
        return message.result;
      }
      await new Promise(resolve => waiters.push(resolve));
    }
  };
  try {
    await request(1, 'initialize', { protocolVersion: 1, clientCapabilities: {} });
    const session = await request(2, 'session/new', { cwd: work, mcpServers: [] });
    assert.ok(session.sessionId);
    assert.deepEqual(JSON.parse(await readFile(toolset, 'utf8')), [
      'complete_event_run', 'list_commitments', 'propose_graph_patch', 'read_event',
      'read_evidence', 'read_mindmap', 'search_evidence',
    ]);
  } finally {
    child.stdin.end();
    child.kill('SIGTERM');
    await rm(work, { recursive: true, force: true });
  }
});
