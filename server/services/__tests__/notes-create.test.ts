import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNote, parseNoteFile, updateNote } from '../notes.js';

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


// Round-trip contract for the frontmatter title: write-side escaping and
// read-side unescaping must be exact mirrors, or every update stacks another
// layer of backslashes onto quoted titles.
describe('note title round-trip (frontmatter)', () => {
  const base = {
    body: 'no heading in this body',
    type: 'note' as const,
    date: '2026-08-12',
    context: 'work' as const,
    tags: [],
    linkedTaskIds: [],
    linkedProjectIds: [],
  };

  it('survives quotes, backslashes and colons byte-exact', async () => {
    const title = 'He said "hi": \\ path & 100%';
    const note = await createNote({ ...base, title });
    const parsed = parseNoteFile(await readFile(note.filePath!, 'utf8'), note.filePath!);
    expect(parsed.title).toBe(title);
  });

  it('flattens newlines instead of corrupting the frontmatter', async () => {
    const note = await createNote({ ...base, title: 'line one\nline two' });
    const raw = await readFile(note.filePath!, 'utf8');
    expect(raw.split('\n').filter((l) => l.startsWith('title:'))).toHaveLength(1);
    const parsed = parseNoteFile(raw, note.filePath!);
    expect(parsed.title).toBe('line one line two');
  });

  it('does not stack escapes across successive updates', async () => {
    const title = 'Q3 "stretch" goals';
    const note = await createNote({ ...base, title });
    const once = await updateNote(note.id, { body: 'second body' });
    expect(once!.title).toBe(title);
    const twice = await updateNote(note.id, { body: 'third body' });
    expect(twice!.title).toBe(title);
    const parsed = parseNoteFile(await readFile(twice!.filePath!, 'utf8'), twice!.filePath!);
    expect(parsed.title).toBe(title);
  });

  it('falls back to the first body heading for legacy notes without a title field', () => {
    const legacy = ['---', 'type: note', 'date: 2026-08-12', 'context: work', '---', '', '# Legacy heading', '', 'body text'].join('\n');
    const parsed = parseNoteFile(legacy, '/x/2026-08-12-legacy.md');
    expect(parsed.title).toBe('Legacy heading');
  });
});
