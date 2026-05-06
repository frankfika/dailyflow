import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { previewRollover, applyRollover } from '../rollover.js';
import type { Config } from '../../types/task.js';

const TEST_DIR = path.join(os.tmpdir(), 'dailyflow-rollover-test-' + Date.now());

const TEST_CONFIG: Config = {
  workspaceRoot: TEST_DIR,
  dailyPathTemplate: 'Daily/{year}/{month}/{date}.md',
  rolloverTrigger: 'manual',
  rolloverSkipTags: ['no-rollover'],
};

async function writeNote(date: string, content: string) {
  const [year, month] = date.split('-');
  const dir = path.join(TEST_DIR, 'Daily', year, month);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${date}.md`), content, 'utf-8');
}

async function readNote(date: string): Promise<string | null> {
  const [year, month] = date.split('-');
  const filePath = path.join(TEST_DIR, 'Daily', year, month, `${date}.md`);
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (e: any) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

describe('previewRollover', () => {
  beforeEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  it('returns null when no previous day file exists', async () => {
    const result = await previewRollover('1999-01-01', TEST_CONFIG);
    expect(result).toBeNull();
  });

  it('filters out completed tasks', async () => {
    await writeNote('2026-05-04', `
## Tasks
- [ ] Unfinished task 1
- [x] Completed task
- [ ] Unfinished task 2
`);
    const result = await previewRollover('2026-05-05', TEST_CONFIG);
    expect(result).not.toBeNull();
    expect(result!.tasksToMigrate).toHaveLength(2);
    expect(result!.tasksToMigrate.every(t => t.status === 'todo')).toBe(true);
  });

  it('filters out no-rollover tagged tasks', async () => {
    await writeNote('2026-05-04', `
## Tasks
- [ ] Normal task
- [ ] Skip me #no-rollover
`);
    const result = await previewRollover('2026-05-05', TEST_CONFIG);
    expect(result!.tasksToMigrate).toHaveLength(1);
    expect(result!.tasksToMigrate[0].title).toBe('Normal task');
  });

  it('includes migrated marker in targetContent', async () => {
    await writeNote('2026-05-04', '- [ ] Task to migrate\n');
    const result = await previewRollover('2026-05-05', TEST_CONFIG);
    expect(result!.targetContent).toContain('migrated:2026-05-04');
  });

  it('includes fromDate and toDate in preview', async () => {
    await writeNote('2026-05-04', '- [ ] Task\n');
    const result = await previewRollover('2026-05-05', TEST_CONFIG);
    expect(result!.fromDate).toBe('2026-05-04');
    expect(result!.toDate).toBe('2026-05-05');
  });

  it('collects tasks from all previous dates, not just yesterday', async () => {
    await writeNote('2026-05-02', '- [ ] Task from May 2\n');
    await writeNote('2026-05-03', '- [ ] Task from May 3\n');
    await writeNote('2026-05-04', '- [x] Done task\n');

    const result = await previewRollover('2026-05-05', TEST_CONFIG);
    expect(result).not.toBeNull();
    expect(result!.tasksToMigrate).toHaveLength(2);
    expect(result!.tasksToMigrate.some(t => t.title === 'Task from May 2')).toBe(true);
    expect(result!.tasksToMigrate.some(t => t.title === 'Task from May 3')).toBe(true);
  });
});

describe('applyRollover', () => {
  beforeEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  it('returns 0 migrated when no tasks to migrate', async () => {
    await writeNote('2026-05-04', '- [x] Already done\n');
    const result = await applyRollover('2026-05-05', TEST_CONFIG);
    expect(result.migratedCount).toBe(0);
    expect(result.success).toBe(true);
  });

  it('migrates tasks to target date file', async () => {
    await writeNote('2026-05-04', `
## Tasks
- [ ] Task from yesterday ^id-yest-001
`);
    const result = await applyRollover('2026-05-05', TEST_CONFIG);
    expect(result.migratedCount).toBe(1);

    // Verify target file was created
    const targetPath = path.join(TEST_DIR, 'Daily', '2026', '05', '2026-05-05.md');
    const content = await fs.readFile(targetPath, 'utf-8');
    expect(content).toContain('Task from yesterday');
    expect(content).toContain('migrated:2026-05-04');
  });

  it('merges with existing target file tasks', async () => {
    await writeNote('2026-05-06', `
## Tasks
- [ ] Existing task ^id-existing
`);
    await writeNote('2026-05-05', `
## Tasks
- [ ] Task to migrate ^id-migrate
`);
    await applyRollover('2026-05-06', TEST_CONFIG);

    const targetPath = path.join(TEST_DIR, 'Daily', '2026', '05', '2026-05-06.md');
    const content = await fs.readFile(targetPath, 'utf-8');
    expect(content).toContain('Existing task');
    expect(content).toContain('Task to migrate');
    expect(content).toContain('migrated:2026-05-05');
  });

  it('marks migrated tasks as done in source file', async () => {
    await writeNote('2026-05-04', `
## Tasks
- [ ] Task to migrate
`);
    const result = await applyRollover('2026-05-05', TEST_CONFIG);
    expect(result.migratedCount).toBe(1);

    // Verify source file has task marked as done
    const sourceContent = await readNote('2026-05-04');
    expect(sourceContent).toContain('- [x] Task to migrate');
  });

  it('migrates tasks from multiple previous dates', async () => {
    await writeNote('2026-05-02', '- [ ] Old task from May 2\n');
    await writeNote('2026-05-03', '- [ ] Task from May 3\n');

    const result = await applyRollover('2026-05-05', TEST_CONFIG);
    expect(result.migratedCount).toBe(2);

    // Verify target file has both tasks
    const targetContent = await readNote('2026-05-05');
    expect(targetContent).toContain('Old task from May 2');
    expect(targetContent).toContain('migrated:2026-05-02');
    expect(targetContent).toContain('Task from May 3');
    expect(targetContent).toContain('migrated:2026-05-03');

    // Verify source files have tasks marked as done
    const sourceMay2 = await readNote('2026-05-02');
    expect(sourceMay2).toContain('- [x] Old task from May 2');

    const sourceMay3 = await readNote('2026-05-03');
    expect(sourceMay3).toContain('- [x] Task from May 3');
  });

  it('does not remigrate already done tasks', async () => {
    await writeNote('2026-05-04', `
## Tasks
- [x] Already migrated
`);
    const result = await applyRollover('2026-05-05', TEST_CONFIG);
    expect(result.migratedCount).toBe(0);
  });

  it('adds delayed tag to tasks without deadline', async () => {
    await writeNote('2026-05-04', '- [ ] Task without deadline\n');
    const result = await applyRollover('2026-05-05', TEST_CONFIG);
    expect(result.migratedCount).toBe(1);

    const targetContent = await readNote('2026-05-05');
    expect(targetContent).toContain('#delayed');
  });

  it('adds delayed tag when deadline has passed', async () => {
    await writeNote('2026-05-04', '- [ ] Task with past deadline #deadline:2026-05-03\n');
    const result = await applyRollover('2026-05-05', TEST_CONFIG);
    expect(result.migratedCount).toBe(1);

    const targetContent = await readNote('2026-05-05');
    expect(targetContent).toContain('#delayed');
  });

  it('does not add delayed tag when deadline is in the future', async () => {
    await writeNote('2026-05-04', '- [ ] Task with future deadline #deadline:2026-05-10\n');
    const result = await applyRollover('2026-05-05', TEST_CONFIG);
    expect(result.migratedCount).toBe(1);

    const targetContent = await readNote('2026-05-05');
    expect(targetContent).not.toContain('#delayed');
    expect(targetContent).toContain('#deadline:2026-05-10');
  });
});
