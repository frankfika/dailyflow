import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNote } from '../notes.js';

let root = '';

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dailyflow-notes-test-'));
  const workspace = join(root, 'workspace');
  await mkdir(workspace, { recursive: true });
  process.env.DAILYFLOW_CONFIG_FILE = join(root, 'config.json');
  await writeFile(process.env.DAILYFLOW_CONFIG_FILE, JSON.stringify({
    workspaceRoot: workspace,
    workspaces: [{ id: 'test', name: 'Test', path: workspace, createdAt: new Date().toISOString() }],
    activeWorkspaceId: 'test',
  }));
});

afterEach(async () => {
  delete process.env.DAILYFLOW_CONFIG_FILE;
  await rm(root, { recursive: true, force: true });
});

describe('createNote filename allocation', () => {
  it('never overwrites a same-day note with the same title', async () => {
    const input = {
      title: 'Same title', body: 'first', type: 'note' as const, date: '2026-08-12',
      context: 'work' as const, tags: [], linkedTaskIds: [], linkedProjectIds: [],
    };
    const first = await createNote(input);
    const second = await createNote({ ...input, body: 'second' });

    expect(second.id).not.toBe(first.id);
    expect(await readFile(first.filePath!, 'utf8')).toContain('first');
    expect(await readFile(second.filePath!, 'utf8')).toContain('second');
  });

  it('allocates safe unique ids for titles without slug characters', async () => {
    const base = {
      title: '🚀', body: 'body', type: 'note' as const, date: '2026-08-12',
      context: 'work' as const, tags: [], linkedTaskIds: [], linkedProjectIds: [],
    };
    const first = await createNote(base);
    const second = await createNote(base);
    expect(first.id).toBe('2026-08-12-untitled');
    expect(second.id).toBe('2026-08-12-untitled-2');
  });
});
