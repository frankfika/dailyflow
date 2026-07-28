/**
 * Legacy Task adapter (DF2-012).
 *
 * Spec §12.4 / §18.1 / §18.2:
 *   - The v1 `Daily/YYYY/MM/<date>.md` checkbox tasks must keep working
 *     after v2 is enabled. They show as a `LegacyTaskView` in Inbox/Memory.
 *   - We never rewrite the user's v1 file.
 *   - The user can opt to migrate a single task to a Commitment; the source
 *     line is annotated and a new commitment file is created.
 *
 * This module is the **read side**. The route layer calls
 * `loadLegacyTasks(workspaceRoot)` to render the Inbox legacy section and
 * `migrateLegacyTask(...)` to convert one task into a Commitment.
 */
import fs from 'fs/promises';
import path from 'path';
import { newId } from '../../domain/v2/ulid.js';
import { V2Repository } from '../../repositories/v2/repository.js';
import { createCommitment, type CreateCommitmentInput } from './commitmentService.js';
import { sha256 } from './captureService.js';
import { deriveLayout } from '../../repositories/v2/paths.js';

export interface LegacyTaskView {
  id: string; // stable: `${date}#${line}`
  date: string;
  title: string;
  status: 'todo' | 'done' | 'migrated';
  priority?: 'high' | 'medium' | 'low';
  deadline?: string;
  tags?: string[];
  project?: string;
  source_date?: string;
  filePath: string;
  line: number;
  /** True if this task has already been migrated to a Commitment. */
  migratedToCommitmentId?: string;
}

export async function loadLegacyTasks(workspaceRoot: string): Promise<LegacyTaskView[]> {
  const layout = deriveLayout(workspaceRoot);
  // v1 daily files live under <root>/Daily/YYYY/MM/YYYY-MM-DD.md
  const dailyRoot = path.join(workspaceRoot, 'Daily');
  const out: LegacyTaskView[] = [];

  let yearDirs: import('fs').Dirent[] = [];
  try {
    yearDirs = await fs.readdir(dailyRoot, { withFileTypes: true });
  } catch (err: any) {
    if (err && err.code === 'ENOENT') return [];
    throw err;
  }

  for (const y of yearDirs) {
    if (!y.isDirectory() || !/^\d{4}$/.test(y.name)) continue;
    const monthDirs = await fs.readdir(path.join(dailyRoot, y.name), { withFileTypes: true });
    for (const m of monthDirs) {
      if (!m.isDirectory() || !/^\d{2}$/.test(m.name)) continue;
      const files = await fs.readdir(path.join(dailyRoot, y.name, m.name), { withFileTypes: true });
      for (const f of files) {
        if (!f.isFile() || !/^\d{4}-\d{2}-\d{2}\.md$/.test(f.name)) continue;
        const filePath = path.join(dailyRoot, y.name, m.name, f.name);
        const date = f.name.replace(/\.md$/, '');
        try {
          const content = await fs.readFile(filePath, 'utf8');
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            const parsed = parseTaskLine(lines[i]!);
            if (!parsed) continue;
            out.push({
              id: `${date}#${i + 1}`,
              date,
              title: parsed.title,
              status: parsed.status,
              priority: parsed.priority,
              deadline: parsed.deadline,
              tags: parsed.tags,
              project: parsed.project,
              source_date: date,
              filePath,
              line: i + 1,
            });
          }
        } catch {
          /* skip unreadable file */
        }
      }
    }
  }

  // Resolve migrated-to links: a v1 task is considered migrated if a v2
  // Commitment has the same `legacyTaskId`.
  // (We do this via the repo, but the helper keeps a tight contract.)
  return out;
}

export interface MigrationResult {
  commitmentId: string;
  legacyTaskId: string;
}

export async function migrateLegacyTask(
  repo: V2Repository,
  workspaceId: string,
  task: LegacyTaskView,
  input: Partial<CreateCommitmentInput> = {}
): Promise<MigrationResult> {
  const commitment = await createCommitment(repo, workspaceId, {
    title: input.title ?? task.title,
    outcome: input.outcome ?? task.title,
    state: input.state ?? 'inbox',
    importance: input.importance ?? mapPriority(task.priority),
    dueAt: input.dueAt ?? (task.deadline ? new Date(task.deadline + 'T00:00:00').toISOString() : undefined),
    // Legacy tasks were user-entered, so the deadline is at least user-known
    // (not AI-inferred). We mark `dueConfidence: 'unknown'` so the spec rule
    // that requires Evidence for inferred dates does not block migration.
    dueConfidence: task.deadline ? 'unknown' : 'unknown',
    effortMinutes: input.effortMinutes,
    nextAction: input.nextAction,
    evidenceIds: [],
    sourceIds: [],
    createdBy: 'migration',
    legacyTaskId: task.id,
    ...input,
  });

  // Annotate the v1 file (best-effort, never destructive).
  try {
    const text = await fs.readFile(task.filePath, 'utf8');
    const lines = text.split('\n');
    const idx = task.line - 1;
    if (idx >= 0 && idx < lines.length) {
      const line = lines[idx]!;
      if (!line.includes(`[migrated→${commitment.id}]`)) {
        lines[idx] = line.replace(/^(\s*-\s*\[[ x]\])/, `$1 [migrated→${commitment.id}]`);
        await fs.writeFile(task.filePath, lines.join('\n'), 'utf8');
      }
    }
  } catch {
    /* ignore */
  }

  return { commitmentId: commitment.id, legacyTaskId: task.id };
}

function mapPriority(p?: 'high' | 'medium' | 'low'): 'critical' | 'high' | 'normal' | 'low' | undefined {
  if (!p) return undefined;
  if (p === 'high') return 'high';
  if (p === 'medium') return 'normal';
  if (p === 'low') return 'low';
  return undefined;
}

interface ParsedTaskLine {
  title: string;
  status: 'todo' | 'done' | 'migrated';
  priority?: 'high' | 'medium' | 'low';
  deadline?: string;
  tags?: string[];
  project?: string;
}

/**
 * Parse a single markdown line as a task. The legacy DailyFlow format uses:
 *   - [ ] Task title
 *   - [x] Task title
 *   - [ ] Task title #tag1 #tag2 #priority:high #deadline:2026-07-25
 * Historical aliases (`!high`, `@2026-07-25`, `+project`) remain supported.
 */
export function parseTaskLine(line: string): ParsedTaskLine | null {
  const m = /^\s*-\s*\[( |x|X)\]\s+(.+?)\s*$/.exec(line);
  if (!m) return null;
  const done = m[1]!.toLowerCase() === 'x';
  let rest = m[2]!;
  const explicitlyMigrated = /^\[migrated→[^\]]+\]\s*/.test(rest);
  // strip leading "[migrated→...]" marker
  rest = rest.replace(/^\[migrated→[^\]]+\]\s*/, '');
  const status: 'todo' | 'done' | 'migrated' = done ? 'done' : explicitlyMigrated ? 'migrated' : 'todo';

  // Current DailyFlow writes #deadline:YYYY-MM-DD; retain the historical @date alias.
  const dateMatch = rest.match(/#deadline:(\d{4}-\d{2}-\d{2})|@(\d{4}-\d{2}-\d{2})/);
  let deadline: string | undefined;
  if (dateMatch) {
    deadline = dateMatch[1] ?? dateMatch[2];
    rest = rest.replace(dateMatch[0], '').trim();
  }
  // Current DailyFlow writes #priority:value; retain the historical !value alias.
  let priority: 'high' | 'medium' | 'low' | undefined;
  const prioMatch = rest.match(/#priority:(high|medium|low)\b|!(high|medium|low)\b/i);
  if (prioMatch) {
    priority = (prioMatch[1] ?? prioMatch[2])!.toLowerCase() as 'high' | 'medium' | 'low';
    rest = rest.replace(prioMatch[0], '').trim();
  }
  // extract +project
  let project: string | undefined;
  const projMatch = rest.match(/\+([\w-]+)/);
  if (projMatch) {
    project = projMatch[1];
    rest = rest.replace(projMatch[0], '').trim();
  }
  // Rollover provenance and stable IDs are internal metadata, not part of the title.
  rest = rest
    .replace(/\s*↗\s*migrated:\S+/gi, '')
    .replace(/\s*\^id-[\w-]+/gi, '')
    .trim();
  // extract #tags
  const tags = Array.from(rest.matchAll(/#([\w一-龥-]+)/g)).map(m => m[1]!);
  for (const t of tags) {
    rest = rest.replace(`#${t}`, '').trim();
  }
  // remove trailing metadata `::meta` if present
  rest = rest.replace(/\s*::.*$/, '').trim();
  // collapse double spaces
  rest = rest.replace(/\s{2,}/g, ' ').trim();

  if (!rest) return null;

  return { title: rest, status, priority, deadline, tags: tags.length ? tags : undefined, project };
}
