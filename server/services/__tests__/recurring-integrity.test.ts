import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRecurringTasks } from '../recurring.js';

let root = '';

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dailyflow-recurring-test-'));
  process.env.DAILYFLOW_RECURRING_FILE = join(root, 'recurring.json');
});

afterEach(async () => {
  delete process.env.DAILYFLOW_RECURRING_FILE;
  await rm(root, { recursive: true, force: true });
});

describe('recurring task storage integrity', () => {
  it('returns an empty list only when the file does not exist', async () => {
    await expect(loadRecurringTasks()).resolves.toEqual([]);
  });

  it('surfaces malformed JSON instead of pretending the list is empty', async () => {
    await writeFile(process.env.DAILYFLOW_RECURRING_FILE!, '{broken');
    await expect(loadRecurringTasks()).rejects.toThrow();
  });
});
