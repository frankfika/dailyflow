import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
  getTaskDateIndex,
  resolveTaskDate,
  invalidateTaskIndex,
} from '../taskIndex.js';

const TEST_DIR = path.join(os.tmpdir(), 'dailyflow-taskindex-test-' + Date.now());
const WS_A = path.join(TEST_DIR, 'ws-a');
const WS_B = path.join(TEST_DIR, 'ws-b');
const CONFIG_FILE = path.join(TEST_DIR, 'config.json');

let previousConfigFile: string | undefined;

async function writeNote(root: string, date: string, content: string) {
  const [year, month] = date.split('-');
  const dir = path.join(root, 'Daily', year, month);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${date}.md`), content, 'utf-8');
}

/** Point the shared config file at the given workspace, like the activate route does. */
async function activateWorkspace(id: 'ws_a' | 'ws_b') {
  await fs.writeFile(CONFIG_FILE, JSON.stringify({
    workspaces: [
      { id: 'ws_a', name: 'A', path: WS_A, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'ws_b', name: 'B', path: WS_B, createdAt: '2026-01-01T00:00:00.000Z' },
    ],
    activeWorkspaceId: id,
    dailyPathTemplate: 'Daily/{year}/{month}/{date}.md',
    rolloverTrigger: 'manual',
    rolloverSkipTags: ['no-rollover'],
  }), 'utf-8');
}

describe('taskIndex', () => {
  beforeAll(async () => {
    previousConfigFile = process.env.DAILYFLOW_CONFIG_FILE;
    process.env.DAILYFLOW_CONFIG_FILE = CONFIG_FILE;
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  beforeEach(async () => {
    invalidateTaskIndex();
    await fs.rm(WS_A, { recursive: true, force: true });
    await fs.rm(WS_B, { recursive: true, force: true });
    await fs.mkdir(WS_A, { recursive: true });
    await fs.mkdir(WS_B, { recursive: true });
    await activateWorkspace('ws_a');
  });

  afterAll(async () => {
    invalidateTaskIndex();
    if (previousConfigFile === undefined) {
      delete process.env.DAILYFLOW_CONFIG_FILE;
    } else {
      process.env.DAILYFLOW_CONFIG_FILE = previousConfigFile;
    }
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  it('builds a taskId → date index from multiple daily notes', async () => {
    await writeNote(WS_A, '2026-05-01', '## Tasks\n- [ ] First task ^id-a1\n');
    await writeNote(WS_A, '2026-05-02', '## Tasks\n- [ ] Second task ^id-a2\n- [ ] Third task ^id-a3\n');

    const index = await getTaskDateIndex();

    expect(index.get('a1')).toBe('2026-05-01');
    expect(index.get('a2')).toBe('2026-05-02');
    expect(index.get('a3')).toBe('2026-05-02');
    expect(await resolveTaskDate('a2')).toBe('2026-05-02');
  });

  it('serves the stale date until invalidateTaskIndex() forces a rebuild', async () => {
    // Regression pin: a task id that moves across dates on disk must be
    // re-resolved after invalidation, not keep pointing at the old date.
    await writeNote(WS_A, '2026-05-01', '## Tasks\n- [ ] Moving task ^id-move\n');

    expect(await resolveTaskDate('move')).toBe('2026-05-01');

    // Move the task on disk: empty the old note, write it into the new one.
    await writeNote(WS_A, '2026-05-01', '## Tasks\n');
    await writeNote(WS_A, '2026-05-02', '## Tasks\n- [ ] Moving task ^id-move\n');

    // The memoized index still reports the old host date...
    expect(await resolveTaskDate('move')).toBe('2026-05-01');

    // ...and only after invalidation does the rebuild see the move.
    invalidateTaskIndex();
    expect(await resolveTaskDate('move')).toBe('2026-05-02');
  });

  it('rebuilds against the new workspace root after the active workspace changes', async () => {
    await writeNote(WS_A, '2026-05-01', '## Tasks\n- [ ] Workspace A task ^id-wsa\n');
    const indexA = await getTaskDateIndex();
    expect(indexA.get('wsa')).toBe('2026-05-01');

    // Switch the active workspace WITHOUT calling invalidateTaskIndex:
    // the cache is keyed by workspaceRoot, so the next read must not
    // leak workspace A's mapping.
    await writeNote(WS_B, '2026-05-03', '## Tasks\n- [ ] Workspace B task ^id-wsb\n');
    await activateWorkspace('ws_b');

    const indexB = await getTaskDateIndex();
    expect(indexB.get('wsa')).toBeUndefined();
    expect(indexB.get('wsb')).toBe('2026-05-03');
  });
});
