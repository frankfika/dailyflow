import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { simpleGit } from 'simple-git';
import {
  readMemberDailyNote,
  listMemberDates,
  listMemberTasks,
  buildTaskTimeline,
} from '../teamService.js';
import type { Config } from '../../types/task.js';

async function createMemberWorkspace(root: string, memberId: string) {
  const memberRoot = path.join(root, 'members', memberId);
  await fs.mkdir(memberRoot, { recursive: true });
  const dailyDir = path.join(memberRoot, 'Daily', '2026', '08');
  await fs.mkdir(dailyDir, { recursive: true });
  const notePath = path.join(dailyDir, '2026-08-18.md');
  await fs.writeFile(
    notePath,
    `- [ ] Review quarterly plan ^id-review-123`,
    'utf-8'
  );
  return memberRoot;
}

function baseConfig(root: string): Config {
  return {
    workspaceRoot: root,
    dailyPathTemplate: 'Daily/{year}/{month}/{date}.md',
    rolloverTrigger: 'manual',
    rolloverSkipTags: [],
  } as Config;
}

describe('teamService', () => {
  let root: string;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'df-team-'));
    const git = simpleGit(root);
    await git.init();
    await git.addConfig('user.name', 'Test');
    await git.addConfig('user.email', 'test@example.com');
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('reads a member daily note without rewriting', async () => {
    await createMemberWorkspace(root, 'alice');
    const note = await readMemberDailyNote(baseConfig(root), 'alice', '2026-08-18');
    expect(note).not.toBeNull();
    expect(note?.tasks).toHaveLength(1);
    expect(note?.tasks[0].title).toBe('Review quarterly plan');
  });

  it('lists member dates', async () => {
    await createMemberWorkspace(root, 'alice');
    const dates = await listMemberDates(baseConfig(root), 'alice');
    expect(dates).toContain('2026-08-18');
  });

  it('lists member tasks for a date', async () => {
    await createMemberWorkspace(root, 'alice');
    const tasks = await listMemberTasks(baseConfig(root), 'alice', '2026-08-18');
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe('review-123');
  });

  it('builds task timeline from git history', async () => {
    await createMemberWorkspace(root, 'alice');
    const git = simpleGit(root);
    await git.add('.');
    await git.commit('add daily note');

    const timeline = await buildTaskTimeline(baseConfig(root), 'alice', '2026-08-18', 'review-123');
    expect(timeline.length).toBeGreaterThan(0);
    expect(timeline[0].change).toBe('created');
    expect(timeline[0].message).toBe('add daily note');
  });
});
