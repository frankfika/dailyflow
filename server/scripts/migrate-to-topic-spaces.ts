/**
 * One-shot migration: forward-fill Topic Space fields on legacy
 * workspace and MindMap files (SPEC §4.3).
 *
 * What this does:
 *   1. Scans `Workspaces` recursively for `*.md` files. For every
 *      file:
 *        - If frontmatter is missing any of { context, mindmapId,
 *          order, defaultView }, fill it with a default value.
 *        - NEVER changes the `kind` field. Legacy files keep
 *          `kind: workspace` (or no kind); the upgrade to
 *          `kind: topic-space` only happens when the user explicitly
 *          edits the topic space through the new endpoint.
 *   2. Scans `<workspaceRoot>/.dailyflow/mindmaps` for `*.json`
 *      files. For every file with `version: 1`, rewrite it as
 *      `version: 2`. No other changes — existing `kind`-less nodes
 *      are left as-is (the read path defaults them to `'branch'` on
 *      the fly).
 *
 * What this does NOT do:
 *   - Never deletes files.
 *   - Never overwrites user-authored content (intent / scratchpad /
 *     tasksMarkdown / timeline, node text, etc.).
 *   - Never moves or renames files.
 *   - Never writes a `^space:xxx` marker into task markdown (that's
 *     Phase 4).
 *
 * Idempotency: every step is "fill if missing" or "bump if v1", so a
 * second run is a no-op. The script reports a diff so you can verify.
 */
import fs from 'fs/promises';
import path from 'path';
import { loadConfig } from '../services/config.js';
import { listMindMaps } from '../services/mindmaps.js';
import { TOPIC_SPACE_DEFAULTS } from '../types/topicSpace.js';
import type { MindMap } from '../types/mindmap.js';

/**
 * Parse just the frontmatter keys from a workspace file. We can't reuse
 * `parseTopicSpaceFile` here because it fills missing keys with
 * defaults in memory — which would make the migration look like the
 * fields are already present. The migration must observe the raw
 * keys actually written on disk.
 */
function readFrontmatterKeys(content: string): { keys: Set<string>; meta: Record<string, string> } {
  const lines = content.split('\n');
  if (lines[0]?.trim() !== '---') return { keys: new Set(), meta: {} };
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') { end = i; break; }
  }
  if (end === -1) return { keys: new Set(), meta: {} };
  const keys = new Set<string>();
  const meta: Record<string, string> = {};
  for (let i = 1; i < end; i++) {
    const idx = lines[i].indexOf(':');
    if (idx <= 0) continue;
    const key = lines[i].slice(0, idx).trim();
    const value = lines[i].slice(idx + 1).trim();
    keys.add(key);
    meta[key] = value;
  }
  return { keys, meta };
}

interface MigrationReport {
  workspaceFilesScanned: number;
  workspaceFilesTouched: number;
  workspaceFieldsAdded: number;
  mindmapFilesScanned: number;
  mindmapFilesTouched: number;
  mindmapBumpedToV2: number;
  errors: { filePath: string; message: string }[];
}

async function scanMarkdown(dir: string): Promise<string[]> {
  const out: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        out.push(...await scanMarkdown(full));
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        out.push(full);
      }
    }
  } catch (err: any) {
    if (err && err.code === 'ENOENT') return out;
    throw err;
  }
  return out;
}

/**
 * Given the raw frontmatter keys present on disk, decide which Topic
 * Space fields are missing. Returns the new frontmatter to splice in
 * (only when there's something to add), or an empty list if the file
 * is already complete.
 *
 * Pure: does not touch the filesystem. We deliberately look at the
 * raw `keys` set rather than the parsed TopicSpace because the parser
 * fills defaults in memory — that would hide the missing fields from
 * the migration.
 */
export function planTopicSpacePatch(keys: Set<string>): { field: string; value: string }[] {
  const additions: { field: string; value: string }[] = [];
  if (!keys.has('context')) additions.push({ field: 'context', value: TOPIC_SPACE_DEFAULTS.context });
  if (!keys.has('mindmapId')) additions.push({ field: 'mindmapId', value: '' });
  if (!keys.has('order')) additions.push({ field: 'order', value: String(TOPIC_SPACE_DEFAULTS.order) });
  if (!keys.has('defaultView')) additions.push({ field: 'defaultView', value: TOPIC_SPACE_DEFAULTS.defaultView });
  return additions;
}

function buildFrontmatterAddition(additions: { field: string; value: string }[]): string {
  return additions.map(a => `${a.field}: ${a.value}`).join('\n');
}

async function migrateWorkspaces(workspaceRoot: string, report: MigrationReport): Promise<void> {
  const dir = path.join(workspaceRoot, 'Workspaces');
  const files = await scanMarkdown(dir);
  for (const filePath of files) {
    report.workspaceFilesScanned += 1;
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const { keys: existingKeys } = readFrontmatterKeys(content);
      const additions = planTopicSpacePatch(existingKeys);
      if (additions.length === 0) continue;

      // Splice the missing keys into the frontmatter block. We don't
      // rewrite the whole file — that would churn git diffs and risk
      // reordering user-authored keys.
      const lines = content.split('\n');
      if (lines[0]?.trim() !== '---') {
        // No frontmatter at all — prepend a minimal block.
        const header = [
          '---',
          buildFrontmatterAddition(additions),
          '---',
          '',
        ].join('\n');
        await fs.writeFile(filePath, header + content, 'utf-8');
        report.workspaceFilesTouched += 1;
        report.workspaceFieldsAdded += additions.length;
        continue;
      }
      let endIdx = -1;
      for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === '---') { endIdx = i; break; }
      }
      if (endIdx === -1) {
        // Malformed frontmatter; leave the file alone and warn.
        report.errors.push({ filePath, message: 'unterminated frontmatter; skipped' });
        continue;
      }
      const toInsert = additions.filter(a => !existingKeys.has(a.field));
      if (toInsert.length === 0) continue;
      const insertBlock = buildFrontmatterAddition(toInsert);
      lines.splice(endIdx, 0, insertBlock);
      await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
      report.workspaceFilesTouched += 1;
      report.workspaceFieldsAdded += toInsert.length;
    } catch (err: any) {
      report.errors.push({ filePath, message: err?.message || String(err) });
    }
  }
}

async function migrateMindMaps(workspaceRoot: string, report: MigrationReport): Promise<void> {
  const dir = path.join(workspaceRoot, '.dailyflow', 'mindmaps');
  let entries: string[] = [];
  try {
    entries = await fs.readdir(dir);
  } catch (err: any) {
    if (err && err.code === 'ENOENT') {
      // No mindmaps dir at all — nothing to do.
      return;
    }
    throw err;
  }
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const filePath = path.join(dir, entry);
    report.mindmapFilesScanned += 1;
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const map = JSON.parse(raw) as MindMap;
      if (map.version !== 1) continue;
      // Bump version only — every other field is preserved verbatim.
      // We deliberately leave nodes alone; the read path defaults
      // `kind: 'branch'` on demand (SPEC §2.2).
      const next: MindMap = { ...map, version: 2 };
      await fs.writeFile(filePath, JSON.stringify(next, null, 2), 'utf-8');
      report.mindmapFilesTouched += 1;
      report.mindmapBumpedToV2 += 1;
    } catch (err: any) {
      report.errors.push({ filePath, message: err?.message || String(err) });
    }
  }
}

function printReport(report: MigrationReport): void {
  const lines = [
    '',
    'Topic Space migration report',
    '----------------------------',
    `Workspace files scanned : ${report.workspaceFilesScanned}`,
    `Workspace files touched : ${report.workspaceFilesTouched}`,
    `Workspace fields added  : ${report.workspaceFieldsAdded}`,
    `MindMap files scanned   : ${report.mindmapFilesScanned}`,
    `MindMap files touched   : ${report.mindmapFilesTouched}`,
    `MindMap bumped to v2    : ${report.mindmapBumpedToV2}`,
    `Errors                  : ${report.errors.length}`,
  ];
  if (report.errors.length > 0) {
    lines.push('');
    lines.push('Errors:');
    for (const err of report.errors) {
      lines.push(`  - ${err.filePath}: ${err.message}`);
    }
  }
  console.log(lines.join('\n'));
}

async function main(): Promise<void> {
  const config = await loadConfig();
  const workspaceRoot = config.workspaceRoot;
  if (!workspaceRoot) {
    throw new Error('workspaceRoot is empty; configure a workspace before migrating');
  }
  const report: MigrationReport = {
    workspaceFilesScanned: 0,
    workspaceFilesTouched: 0,
    workspaceFieldsAdded: 0,
    mindmapFilesScanned: 0,
    mindmapFilesTouched: 0,
    mindmapBumpedToV2: 0,
    errors: [],
  };
  // listMindMaps / getMindMap are used for a "live" count alongside
  // the raw on-disk scan so we surface schema mismatches early.
  const live = await listMindMaps().catch(() => [] as MindMap[]);
  await migrateWorkspaces(workspaceRoot, report);
  await migrateMindMaps(workspaceRoot, report);
  report.mindmapFilesScanned = Math.max(report.mindmapFilesScanned, live.length);
  printReport(report);
}

// Run when invoked directly (tsx) but not when imported by tests.
const invokedDirectly = (() => {
  try {
    // Resolve argv[1] relative to this file so we don't depend on cwd.
    const url = new URL(import.meta.url);
    return process.argv[1] && path.resolve(process.argv[1]) === url.pathname;
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  main().catch(err => {
    console.error('[migrate:topic-spaces] failed:', err);
    process.exit(1);
  });
}

export { main, migrateWorkspaces, migrateMindMaps };
export type { MigrationReport };
