import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
  getDailyNotePath,
  validatePath,
  readDailyNote,
  writeDailyNote,
  listDailyNotes,
} from '../fileSystem.js';
import type { Config } from '../../types/task.js';

const TEST_DIR = path.join(os.tmpdir(), 'dailyflow-test-' + Date.now());

const TEST_CONFIG: Config = {
  workspaceRoot: TEST_DIR,
  dailyPathTemplate: 'Daily/{year}/{month}/{date}.md',
  rolloverTrigger: 'manual',
  rolloverSkipTags: ['no-rollover'],
};

const FLAT_CONFIG: Config = {
  workspaceRoot: TEST_DIR,
  dailyPathTemplate: '{date}.md',
  rolloverTrigger: 'manual',
  rolloverSkipTags: ['no-rollover'],
};

describe('getDailyNotePath', () => {
  it('builds nested path from template', () => {
    const p = getDailyNotePath('2026-05-05', TEST_CONFIG);
    expect(p).toBe(path.join(TEST_DIR, 'Daily', '2026', '05', '2026-05-05.md'));
  });

  it('builds flat path from template', () => {
    const p = getDailyNotePath('2026-05-05', FLAT_CONFIG);
    expect(p).toBe(path.join(TEST_DIR, '2026-05-05.md'));
  });
});

describe('validatePath', () => {
  it('allows valid workspace path', () => {
    expect(validatePath(path.join(TEST_DIR, 'Daily/2026/test.md'), TEST_DIR)).toBe(true);
  });

  it('rejects path traversal attack', () => {
    expect(validatePath(path.join(TEST_DIR, '../etc/passwd'), TEST_DIR)).toBe(false);
  });

  it('rejects completely different path', () => {
    expect(validatePath('/tmp/other/file.md', TEST_DIR)).toBe(false);
  });

  // Regression for the startsWith prefix-collision bug.
  // If workspaceRoot is '/tmp/dailyflow-test-XXX' and a sibling directory
  // exists at '/tmp/dailyflow-test-XXX-other', the old implementation let
  // paths inside the sibling through because '/tmp/dailyflow-test-XXX'
  // is a string prefix of '/tmp/dailyflow-test-XXX-other/secret'.
  it('rejects sibling directory that shares a name prefix (prefix collision)', () => {
    const sibling = TEST_DIR + '-other';
    try {
      const evil = path.join(sibling, 'secret.md');
      expect(validatePath(evil, TEST_DIR)).toBe(false);
    } finally {
      // Nothing to clean up; sibling is virtual here (path.resolve only).
    }
  });

  it('rejects ../ traversal escape', () => {
    expect(validatePath(path.join(TEST_DIR, 'a', '..', '..', 'etc', 'passwd'), TEST_DIR)).toBe(false);
  });

  it('accepts nested paths under workspace', () => {
    expect(validatePath(path.join(TEST_DIR, 'a', 'b', 'c', 'd.md'), TEST_DIR)).toBe(true);
  });
});

describe('writeDailyNote + readDailyNote', () => {
  beforeAll(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  beforeEach(async () => {
    // Clean test files before each test
    try {
      await fs.rm(path.join(TEST_DIR, 'Daily'), { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  it('writes and reads a daily note', async () => {
    const content = '# May 05, 2026\n\n## Tasks\n\n- [ ] Test task\n';
    await writeDailyNote('2026-05-05', content, TEST_CONFIG);

    const note = await readDailyNote('2026-05-05', TEST_CONFIG);
    expect(note).not.toBeNull();
    expect(note!.content).toBe(content);
    expect(note!.date).toBe('2026-05-05');
    expect(note!.tasks).toHaveLength(1);
    expect(note!.tasks[0].title).toBe('Test task');
  });

  it('returns null for non-existent file', async () => {
    const note = await readDailyNote('1999-01-01', TEST_CONFIG);
    expect(note).toBeNull();
  });

  it('deduplicates migrated task lines that only differ by id', async () => {
    const content = [
      '## Tasks',
      '',
      '- [>] 准备推特kol #work #delayed #deadline:2026-05-30 ↗ migrated:2026-05-30 ^id-t_old_1',
      '- [>] 准备推特kol #work #delayed #deadline:2026-05-30 ↗ migrated:2026-05-30 ^id-t_old_2',
      '',
    ].join('\n');

    await writeDailyNote('2026-06-01', content, TEST_CONFIG);

    const note = await readDailyNote('2026-06-01', TEST_CONFIG);
    expect(note).not.toBeNull();
    expect(note!.tasks).toHaveLength(1);
    expect(note!.tasks[0].title).toBe('准备推特kol');

    const filePath = getDailyNotePath('2026-06-01', TEST_CONFIG);
    const cleaned = await fs.readFile(filePath, 'utf-8');
    expect(cleaned.match(/准备推特kol/g)?.length).toBe(1);
  });

  it('creates nested directories automatically', async () => {
    await writeDailyNote('2026-05-05', 'content', TEST_CONFIG);
    const dir = path.join(TEST_DIR, 'Daily', '2026', '05');
    const stat = await fs.stat(dir);
    expect(stat.isDirectory()).toBe(true);
  });

  it('throws on path traversal', async () => {
    const badConfig = { ...TEST_CONFIG, workspaceRoot: '/tmp' };
    const maliciousDate = '../../../etc/passwd';
    await expect(writeDailyNote(maliciousDate, 'xss', badConfig)).rejects.toThrow('Invalid file path');
  });
});

describe('listDailyNotes', () => {
  const LIST_DIR = path.join(os.tmpdir(), 'dailyflow-list-test-' + Date.now());
  const LIST_CONFIG: Config = {
    workspaceRoot: LIST_DIR,
    dailyPathTemplate: 'Daily/{year}/{month}/{date}.md',
    rolloverTrigger: 'manual',
    rolloverSkipTags: ['no-rollover'],
  };

  beforeAll(async () => {
    await fs.mkdir(LIST_DIR, { recursive: true });
    // Create test files in nested structure
    const nestedDir = path.join(LIST_DIR, 'Daily', '2026', '05');
    await fs.mkdir(nestedDir, { recursive: true });
    await fs.writeFile(path.join(nestedDir, '2026-05-01.md'), 'content', 'utf-8');
    await fs.writeFile(path.join(nestedDir, '2026-05-02.md'), 'content', 'utf-8');
    await fs.writeFile(path.join(nestedDir, '2026-05-03.md'), 'content', 'utf-8');
    // Create non-date files that should be ignored
    await fs.writeFile(path.join(nestedDir, 'notes.md'), 'content', 'utf-8');
  });

  afterAll(async () => {
    await fs.rm(LIST_DIR, { recursive: true, force: true });
  });

  it('lists all date-formatted md files sorted newest first', async () => {
    const files = await listDailyNotes(LIST_CONFIG);
    expect(files).toHaveLength(3);
    expect(files[0]).toBe('2026-05-03');
    expect(files[1]).toBe('2026-05-02');
    expect(files[2]).toBe('2026-05-01');
  });
});
