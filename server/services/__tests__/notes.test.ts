import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Note, Config } from '../../types/task.js';
import * as fsMod from '../fileSystem.js';
import { pruneStaleTaskLinks } from '../notes.js';

// We only exercise `pruneStaleTaskLinks`, which depends on `readDailyNote`.
// Mock that so the test does not touch the real filesystem.
vi.mock('../fileSystem.js', async () => {
  const actual = await vi.importActual<typeof fsMod>('../fileSystem.js');
  return {
    ...actual,
    readDailyNote: vi.fn(),
  };
});

const baseNote = (overrides: Partial<Note> = {}): Note => ({
  id: '2026-06-08-test',
  title: 'Test note',
  body: 'body',
  type: 'note',
  date: '2026-06-08',
  context: 'work',
  tags: [],
  mentions: [],
  linkedTaskIds: [],
  linkedProjectIds: [],
  createdAt: '2026-06-08T00:00:00Z',
  updatedAt: '2026-06-08T00:00:00Z',
  ...overrides,
});

describe('pruneStaleTaskLinks', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('drops linkedTaskIds that do not exist in the referenced date', async () => {
    const realId = 't_real';
    const staleId = 't_deleted_yesterday';
    const note = baseNote({ linkedTaskIds: [realId, staleId] });

    vi.mocked(fsMod.readDailyNote).mockImplementation(async (date: string) => {
      if (date === '2026-06-08') {
        return { date, content: '', tasks: [{ id: realId, title: 'real', status: 'todo' }], lastModified: new Date() };
      }
      return null;
    });

    const { notes, prunedCount } = await pruneStaleTaskLinks([note]);

    expect(prunedCount).toBe(1);
    expect(notes[0].linkedTaskIds).toEqual([realId]);
  });

  it('returns the input untouched when every link is valid', async () => {
    const id = 't_keep';
    const note = baseNote({ linkedTaskIds: [id] });
    vi.mocked(fsMod.readDailyNote).mockResolvedValue({
      date: '2026-06-08', content: '', tasks: [{ id, title: 'keep', status: 'todo' }], lastModified: new Date(),
    });

    const { notes, prunedCount } = await pruneStaleTaskLinks([note]);

    expect(prunedCount).toBe(0);
    expect(notes[0].linkedTaskIds).toEqual([id]);
    // The note object identity is preserved when nothing was pruned.
    expect(notes[0]).toBe(note);
  });

  it('deduplicates daily-file reads across notes on the same date', async () => {
    const realId = 't_real';
    const notes: Note[] = [
      baseNote({ id: 'a', linkedTaskIds: [realId, 't_ghost'] }),
      baseNote({ id: 'b', linkedTaskIds: [realId] }),
      baseNote({ id: 'c', linkedTaskIds: ['t_other_ghost'] }),
    ];
    vi.mocked(fsMod.readDailyNote).mockResolvedValue({
      date: '2026-06-08', content: '', tasks: [{ id: realId, title: 'real', status: 'todo' }], lastModified: new Date(),
    });

    const { notes: pruned, prunedCount } = await pruneStaleTaskLinks(notes);

    expect(prunedCount).toBe(2);
    expect(pruned.map(n => n.linkedTaskIds)).toEqual([[realId], [realId], []]);
    // The cache should have collapsed N notes into a single file read.
    expect(fsMod.readDailyNote).toHaveBeenCalledTimes(1);
  });

  it('keeps notes with empty linkedTaskIds untouched and does not read the daily file', async () => {
    const note = baseNote({ linkedTaskIds: [] });

    const { notes, prunedCount } = await pruneStaleTaskLinks([note]);

    expect(prunedCount).toBe(0);
    expect(notes[0]).toBe(note);
    expect(fsMod.readDailyNote).not.toHaveBeenCalled();
  });
});
