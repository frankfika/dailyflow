/**
 * Cross-date task search used by AI tools. Mirrors the taskIndex harness:
 * we point DAILYFLOW_CONFIG_FILE at a temp config and write real daily
 * notes under the activated workspace so the full scan + filter runs
 * exactly as in production.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { searchAllTasks } from '../taskIndex.js';

const TEST_DIR = path.join(os.tmpdir(), 'dailyflow-searchall-test-' + Date.now());
const WORKSPACE = path.join(TEST_DIR, 'ws');
const CONFIG_FILE = path.join(TEST_DIR, 'config.json');

let previousConfigFile: string | undefined;

async function writeNote(date: string, body: string) {
  const [year, month] = date.split('-');
  const dir = path.join(WORKSPACE, 'Daily', year, month);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${date}.md`), body, 'utf-8');
}

beforeAll(async () => {
  previousConfigFile = process.env.DAILYFLOW_CONFIG_FILE;
  process.env.DAILYFLOW_CONFIG_FILE = CONFIG_FILE;
  await fs.mkdir(WORKSPACE, { recursive: true });
});

beforeEach(async () => {
  await fs.rm(WORKSPACE, { recursive: true, force: true });
  await fs.mkdir(WORKSPACE, { recursive: true });
  await fs.writeFile(CONFIG_FILE, JSON.stringify({
    workspaces: [
      { id: 'ws_a', name: 'A', path: WORKSPACE, createdAt: '2026-01-01T00:00:00.000Z' },
    ],
    activeWorkspaceId: 'ws_a',
    dailyPathTemplate: 'Daily/{year}/{month}/{date}.md',
    rolloverTrigger: 'manual',
    rolloverSkipTags: ['no-rollover'],
  }), 'utf-8');
});

afterAll(async () => {
  if (previousConfigFile === undefined) delete process.env.DAILYFLOW_CONFIG_FILE;
  else process.env.DAILYFLOW_CONFIG_FILE = previousConfigFile;
  await fs.rm(TEST_DIR, { recursive: true, force: true });
});

describe('searchAllTasks', () => {
  it('returns matches with their host date, newest first', async () => {
    await writeNote('2026-05-01', '## Tasks\n- [ ] First task ^id-a1\n');
    await writeNote('2026-05-10', '## Tasks\n- [ ] First follow-up ^id-a2\n- [ ] unrelated ^id-a3\n');
    await writeNote('2026-05-20', '## Tasks\n- [ ] Last first ^id-a4\n');

    const hits = await searchAllTasks('first');

    const dates = hits.map((h) => h.date);
    expect(dates).toEqual(['2026-05-20', '2026-05-10', '2026-05-01']);
    expect(hits.map((h) => h.task.id)).toEqual(['a4', 'a2', 'a1']);
  });

  it('matches by manual tag too', async () => {
    await writeNote('2026-06-01', '## Tasks\n- [ ] quiet work ^id-tag1 #urgent\n- [ ] loud work ^id-tag2\n');
    const hits = await searchAllTasks('urgent');
    expect(hits).toHaveLength(1);
    expect(hits[0].task.id).toBe('tag1');
    expect(hits[0].task.tags).toContain('urgent');
  });

  it('is case-insensitive for both title and tag', async () => {
    await writeNote('2026-07-01', '## Tasks\n- [ ] MixEd CaSe ^id-case #Urgent\n');
    const a = await searchAllTasks('mixed case');
    const b = await searchAllTasks('URGENT');
    expect(a[0].task.id).toBe('case');
    expect(b[0].task.id).toBe('case');
  });

  it('returns an empty array for empty or whitespace queries without scanning', async () => {
    await writeNote('2026-08-01', '## Tasks\n- [ ] something ^id-x\n');
    expect(await searchAllTasks('')).toEqual([]);
    expect(await searchAllTasks('   ')).toEqual([]);
  });

  it('caps results so AI tool calls stay small', async () => {
    // Exceeding the cap exercises the early break, not just silent overflow.
    const lines: string[] = [];
    for (let i = 0; i < 60; i++) {
      lines.push(`- [ ] noisy task ${i} ^id-n${i}`);
    }
    await writeNote('2026-09-01', '## Tasks\n' + lines.join('\n') + '\n');
    const hits = await searchAllTasks('noisy');
    expect(hits.length).toBeLessThanOrEqual(50);
    expect(hits.length).toBeGreaterThan(0);
  });

  it('surfaces tasks mirrored from an event canvas (^mm/^node markers)', async () => {
    // Mindmap-bound tasks still live in the daily note and should appear
    // in cross-date search — the AI uses them to update / unschedule
    // canvas items.
    await writeNote('2026-10-01', [
      '## Tasks',
      '- [ ] canvas mirror ^mm:mm1 ^node:n1',
      '- [ ] unrelated ^id-plain',
    ].join('\n'));
    const hits = await searchAllTasks('canvas');
    expect(hits).toHaveLength(1);
    expect(hits[0].task.originMindmapId).toBe('mm1');
    expect(hits[0].task.originNodeId).toBe('n1');
    expect(hits[0].task.title).toContain('canvas mirror');
  });
});