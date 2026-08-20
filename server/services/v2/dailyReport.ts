/**
 * Daily Report + Reflection service (Sprint 1 Gap 5 — Daily 闭环).
 *
 * Spec promise: after the day rolls over, the user can hit "今日复盘" to
 * reflect on the day and have a structured report written to
 * `Journal/YYYY-MM-DD.md` next to the existing v1 data. The file is plain
 * Markdown and stays under the user's full control — no AI call is made
 * server-side (we delegate generation to the AI Chat consumer that
 * imports the matching built-in skill).
 *
 * The module is intentionally small and side-effect-free:
 *
 *   - `renderDailyReport(input)` is pure — same input always produces the
 *     same Markdown. Tests can assert on it without touching the disk.
 *   - `writeDailyReport(root, report)` is the only IO entry point.
 *   - `readDailyReport(root, date)` lets the UI re-open a saved journal.
 *   - `listDailyReports(root, year, month)` powers the month picker.
 *   - `generateAndSaveDailyReport(repo, root, date, reflection)`
 *     composes everything: snapshot today's commitments from the v2 repo,
 *     call `renderDailyReport`, then write the file under `Journal/`.
 *
 * The `Journal/` directory is intentionally separate from the v2 tree
 * (which lives under `.dailyflow/`) so the user can browse their daily
 * reflections in any plain Markdown editor and `git diff` them as
 * ordinary workspace files.
 */
import fs from 'fs/promises';
import path from 'path';
import type { V2Repository } from '../../repositories/v2/repository.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DailyReportTaskSummary {
  id: string;
  title: string;
  tags?: string[];
}

export interface DailyReportInProgressTask {
  id: string;
  title: string;
  progress?: string;
}

export interface DailyReportPostponedTask {
  id: string;
  title: string;
  reason?: string;
}

export interface DailyReportInput {
  /** ISO date (YYYY-MM-DD). */
  date: string;
  completedTasks: DailyReportTaskSummary[];
  inProgressTasks: DailyReportInProgressTask[];
  postponedTasks: DailyReportPostponedTask[];
  /** User-authored reflection text. */
  reflection: string;
  /** When the report was generated; defaults to `new Date()`. */
  generatedAt?: Date;
}

export interface DailyReportResult {
  markdown: string;
  /** Absolute path on disk (where the report was written). */
  filePath: string;
  byteSize: number;
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  return ISO_DATE.test(value);
}

export function assertIsoDate(value: string, field: string): void {
  if (!ISO_DATE.test(value)) {
    throw new Error(`${field} must be a YYYY-MM-DD date string, got: ${value}`);
  }
}

// ---------------------------------------------------------------------------
// Pure renderer
// ---------------------------------------------------------------------------

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function formatClock(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function groupByTagOrProject(
  tasks: DailyReportTaskSummary[],
  pickTag: (task: DailyReportTaskSummary) => string | undefined,
): string {
  if (tasks.length === 0) return '_（无）_\n';
  const buckets = new Map<string, DailyReportTaskSummary[]>();
  for (const task of tasks) {
    const tag = pickTag(task) ?? '_未分组';
    const bucket = buckets.get(tag) ?? [];
    bucket.push(task);
    buckets.set(tag, bucket);
  }
  const sortedKeys = [...buckets.keys()].sort((a, b) => a.localeCompare(b));
  const lines: string[] = [];
  for (const key of sortedKeys) {
    lines.push(`### ${key}`);
    for (const task of buckets.get(key)!) {
      const tagList = (task.tags ?? []).length > 0 ? ` ${task.tags!.map((t) => `#${t}`).join(' ')}` : '';
      lines.push(`- **${task.title}**${tagList}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function renderInProgress(tasks: DailyReportInProgressTask[]): string {
  if (tasks.length === 0) return '_（无）_\n';
  return tasks
    .map((t) => {
      const progress = t.progress ? ` — ${t.progress}` : '';
      return `- **${t.title}**${progress}`;
    })
    .join('\n') + '\n';
}

function renderPostponed(tasks: DailyReportPostponedTask[]): string {
  if (tasks.length === 0) return '_（无）_\n';
  return tasks
    .map((t) => {
      const reason = t.reason ? ` — 原因：${t.reason}` : '';
      return `- **${t.title}**${reason}`;
    })
    .join('\n') + '\n';
}

function renderReflection(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '_（未填写）_\n';
  // Escape stray list markers that would otherwise be mis-parsed.
  return trimmed
    .split('\n')
    .map((line) => (line.startsWith('-') || line.startsWith('*') ? `- ${line.replace(/^[-*]\s*/, '')}` : line))
    .join('\n') + '\n';
}

function computeCompletionRate(completed: number, total: number): string {
  if (total === 0) return '0%';
  const pct = Math.round((completed / total) * 100);
  return `${pct}% (${completed}/${total})`;
}

/**
 * Build the Markdown body for a daily report. Pure: same input => same
 * output, no IO. The renderer deliberately avoids the LLM — it is meant
 * to be deterministic, testable, and zero-cost.
 */
export function renderDailyReport(input: DailyReportInput): string {
  assertIsoDate(input.date, 'date');
  const generatedAt = input.generatedAt ?? new Date();
  const total = input.completedTasks.length + input.inProgressTasks.length + input.postponedTasks.length;
  const completionRate = computeCompletionRate(input.completedTasks.length, total);

  const lines: string[] = [];
  lines.push(`# 日报 · ${input.date}`);
  lines.push('');
  lines.push('## 元信息');
  lines.push(`- 日期：${input.date}`);
  lines.push(`- 生成时间：${formatClock(generatedAt)}`);
  lines.push(`- 完成率：${completionRate}`);
  lines.push(`- 完成 / 进行中 / 推迟：${input.completedTasks.length} / ${input.inProgressTasks.length} / ${input.postponedTasks.length}`);
  lines.push('');
  lines.push('## ✅ 今日完成');
  lines.push(groupByTagOrProject(input.completedTasks, (task) => task.tags?.[0]));
  lines.push('## ⏰ 进行中');
  lines.push(renderInProgress(input.inProgressTasks));
  lines.push('## ⛔ 推迟 / 取消');
  lines.push(renderPostponed(input.postponedTasks));
  lines.push('## 💭 今日复盘');
  lines.push(renderReflection(input.reflection));
  lines.push('## 🎯 明日聚焦');
  lines.push('_（请基于以上复盘填写明日 Top 3）_');
  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// IO helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the absolute path for the daily journal entry of `date`.
 * Lives at `Journal/YYYY-MM-DD.md` at the workspace root, mirroring the
 * daily-note convention (one file per day, stable filenames for git diff).
 */
export function resolveJournalPath(workspaceRoot: string, date: string): string {
  assertIsoDate(date, 'date');
  if (!workspaceRoot) throw new Error('workspaceRoot is required');
  return path.join(workspaceRoot, 'Journal', `${date}.md`);
}

/**
 * Write the rendered Markdown to `Journal/YYYY-MM-DD.md`, creating the
 * `Journal/` directory if needed. Returns the resulting file metadata.
 */
export async function writeDailyReport(
  workspaceRoot: string,
  report: { markdown: string; date: string },
): Promise<DailyReportResult> {
  const { markdown, date } = report;
  assertIsoDate(date, 'date');
  const filePath = resolveJournalPath(workspaceRoot, date);
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, markdown, 'utf8');
  const stat = await fs.stat(filePath);
  return { markdown, filePath, byteSize: stat.size };
}

/**
 * Read the daily journal for a given date, returning the raw Markdown
 * (or `null` when the file does not exist yet).
 */
export async function readDailyReport(workspaceRoot: string, date: string): Promise<string | null> {
  const filePath = resolveJournalPath(workspaceRoot, date);
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

/**
 * List existing daily journal files for a given year / month. When
 * `month` is omitted, returns every report inside that year's
 * `Journal/` directory.
 */
export async function listDailyReports(
  workspaceRoot: string,
  year: number,
  month?: number,
): Promise<Array<{ date: string; filePath: string; byteSize: number }>> {
  const journalRoot = path.join(workspaceRoot, 'Journal');
  const out: Array<{ date: string; filePath: string; byteSize: number }> = [];
  let entries: import('fs').Dirent[] = [];
  try {
    entries = await fs.readdir(journalRoot, { withFileTypes: true });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'ENOENT') {
      return [];
    }
    throw err;
  }
  const yearStr = String(year);
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const date = entry.name.replace(/\.md$/, '');
    if (!ISO_DATE.test(date)) continue;
    const [yStr, mStr] = date.split('-');
    if (yStr !== yearStr) continue;
    if (month !== undefined) {
      const expectedMonth = pad(month);
      if (mStr !== expectedMonth) continue;
    }
    const filePath = path.join(journalRoot, entry.name);
    const stat = await fs.stat(filePath);
    out.push({ date, filePath, byteSize: stat.size });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

// ---------------------------------------------------------------------------
// High-level orchestrator
// ---------------------------------------------------------------------------

export interface GenerateAndSaveOptions {
  /**
   * Override the "snapshot source" — defaults to reading today's v2
   * commitments. Tests inject a synthetic source.
   */
  snapshot?: Omit<DailyReportInput, 'reflection' | 'generatedAt'>;
}

/**
 * Compose the daily report: snapshot today's commitments, render the
 * Markdown, persist to `Journal/YYYY-MM-DD.md`. Designed to be the
 * single entry point used by both the `POST /api/v2/reports/daily`
 * route and the post-rollover auto-trigger in `App.tsx`.
 */
export async function generateAndSaveDailyReport(
  repo: V2Repository,
  workspaceRoot: string,
  date: string,
  reflection: string,
  options: GenerateAndSaveOptions = {},
): Promise<DailyReportResult> {
  assertIsoDate(date, 'date');
  const snapshot = options.snapshot ?? (await snapshotTodayFromRepo(repo, date));
  const markdown = renderDailyReport({ ...snapshot, date, reflection });
  const result = await writeDailyReport(workspaceRoot, { markdown, date });
  // Audit through the repo so the action shows up in the v2 timeline.
  // AuditLog.append auto-fills workspaceId from the layout — passing it
  // again would conflict with the Omit<AuditEvent, 'workspaceId'> input.
  await repo.audit.append({
    kind: 'daily_report.create',
    actor: 'user',
    entity: { type: 'daily_report', id: date },
    data: {
      date,
      completed: snapshot.completedTasks.length,
      inProgress: snapshot.inProgressTasks.length,
      postponed: snapshot.postponedTasks.length,
      byteSize: result.byteSize,
      filePath: result.filePath,
    },
  });
  return result;
}

/**
 * Build a default snapshot of today's commitments from the v2 repository.
 *   - `state: 'completed'`            => `completedTasks`
 *   - `state: 'active' | 'waiting'`  => `inProgressTasks`
 *   - `state: 'someday' | 'cancelled'` => `postponedTasks`
 *
 * The function intentionally keeps the snapshot small — the reflection
 * text is the user's job, not ours.
 */
export async function snapshotTodayFromRepo(
  repo: V2Repository,
  date: string,
): Promise<Omit<DailyReportInput, 'reflection' | 'generatedAt'>> {
  assertIsoDate(date, 'date');
  const all = await repo.listCommitments();
  const completed: DailyReportTaskSummary[] = [];
  const inProgress: DailyReportInProgressTask[] = [];
  const postponed: DailyReportPostponedTask[] = [];
  for (const c of all) {
    const title = c.title;
    if (!title) continue;
    if (c.state === 'completed') {
      completed.push({ id: c.id, title });
    } else if (c.state === 'active' || c.state === 'waiting') {
      const progress = c.lastProgressAt ? `最后进展：${c.lastProgressAt.slice(0, 10)}` : '未开始';
      inProgress.push({ id: c.id, title, progress });
    } else if (c.state === 'someday' || c.state === 'cancelled') {
      postponed.push({ id: c.id, title });
    }
  }
  return {
    date,
    completedTasks: completed,
    inProgressTasks: inProgress,
    postponedTasks: postponed,
  };
}
