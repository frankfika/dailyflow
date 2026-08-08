/**
 * Cross-date task index (Topic Spaces Phase 3).
 *
 * The list view and the mindmap mirror both need to resolve "which daily
 * note holds this task?" without scanning every file on every click.
 * We build a `taskId → date` index by walking all daily notes once and
 * reading their tasks via the shared parser.
 *
 * The index is process-local and lazily built. It is NOT a persistent
 * cache — we rebuild from disk on demand. For a workspace with a few
 * hundred daily notes the scan is tens of milliseconds; if it ever
 * becomes hot we can add an mtime-based invalidation layer.
 *
 * Concurrency: the build is single-flighted with a memoized promise so
 * two simultaneous requests share one scan. Callers that mutate the
 * underlying files (task create / delete / space binding) call
 * `invalidateTaskIndex()` to drop the memo; the next caller rebuilds.
 */
import { loadConfig } from './config.js';
import { listDailyNotes, readDailyNote } from './fileSystem.js';
import { parseMarkdown } from './parser.js';
import type { Config } from '../types/task.js';
import type { Task } from '../types/task.js';

export interface TaskWithDate {
  task: Task;
  /** The daily-note date that hosts this task (YYYY-MM-DD). */
  date: string;
}

/**
 * Lookup result for a single taskId: the date that hosts it (or
 * undefined if the task was not found in any daily note).
 */
export type TaskDateIndex = Map<string, string>;

let indexPromise: Promise<TaskDateIndex> | null = null;

/**
 * Build (or return the cached) `taskId → date` index for the active
 * workspace. The scan reads every daily note listed by
 * `listDailyNotes` and records each task's host date.
 *
 * Tasks with duplicated ids across files (a rare corruption) resolve
 * to the most recently-modified file's date — we log a warning and
 * keep the last one so the index stays consistent.
 */
export async function getTaskDateIndex(): Promise<TaskDateIndex> {
  if (indexPromise) return indexPromise;
  indexPromise = buildTaskDateIndex();
  return indexPromise;
}

async function buildTaskDateIndex(): Promise<TaskDateIndex> {
  const config = await loadConfig();
  const dates = await listDailyNotes(config);
  const index: TaskDateIndex = new Map();
  // Iterate oldest → newest so that if the same id appears in two
  // files, the newest file wins (matches "most recent occurrence"
  // semantics users expect).
  for (const date of dates.slice().reverse()) {
    try {
      const note = await readDailyNote(date, config);
      if (!note) continue;
      for (const task of note.tasks) {
        if (task && task.id) {
          index.set(task.id, date);
        }
      }
    } catch (err) {
      // A corrupt file should not break the whole index.
      console.error(`[taskIndex] skipping unreadable note for ${date}:`, err);
    }
  }
  return index;
}

/**
 * Drop the cached index. The next `getTaskDateIndex()` call rebuilds
 * from disk. Cheap to call; only triggers work on the next read.
 */
export function invalidateTaskIndex(): void {
  indexPromise = null;
}

/**
 * Resolve a single taskId to its host date, or `undefined` if it is
 * not found in any daily note. Convenience wrapper around the index.
 */
export async function resolveTaskDate(taskId: string): Promise<string | undefined> {
  const index = await getTaskDateIndex();
  return index.get(taskId);
}

/**
 * Resolve many taskIds to `{ task, date }` records in one pass. Tasks
 * that cannot be found (orphan ids in the space's `taskIds` list) are
 * dropped from the result — the caller can compare the input length
 * with the output length to detect orphans and reconcile.
 *
 * This is the cross-date data source that powers the Topic Space list
 * view and the mindmap mirror.
 */
export async function resolveTasksWithDates(
  taskIds: ReadonlyArray<string>,
  config?: Config,
): Promise<TaskWithDate[]> {
  const cfg = config ?? (await loadConfig());
  const index = await getTaskDateIndex();
  // Group the requested ids by their host date so we read each daily
  // note at most once.
  const idsByDate = new Map<string, Set<string>>();
  for (const id of taskIds) {
    const date = index.get(id);
    if (!date) continue; // orphan — caller will see it missing
    if (!idsByDate.has(date)) idsByDate.set(date, new Set());
    idsByDate.get(date)!.add(id);
  }
  const out: TaskWithDate[] = [];
  for (const [date, ids] of idsByDate) {
    try {
      const note = await readDailyNote(date, cfg);
      if (!note) continue;
      for (const task of note.tasks) {
        if (task && task.id && ids.has(task.id)) {
          out.push({ task, date });
        }
      }
    } catch (err) {
      console.error(`[taskIndex] failed to read ${date} for resolveTasksWithDates:`, err);
    }
  }
  return out;
}

/**
 * Test-only escape hatch: inject a prebuilt index so unit tests can
 * skip the filesystem scan. Not exported through the route layer.
 */
export function __setIndexForTests(index: TaskDateIndex | null): void {
  indexPromise = index ? Promise.resolve(index) : null;
}
