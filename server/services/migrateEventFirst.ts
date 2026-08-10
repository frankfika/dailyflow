import { promises as fs } from 'fs';
import crypto from 'crypto';
import path from 'path';
import * as config from './config.js';
import * as topicSpaces from './topicSpaces.js';
import * as mindmaps from './mindmaps.js';
import * as eventQuery from './eventQueryService.js';
import type { Config } from '../types/task.js';

export interface MigrationIssue {
  kind: 'orphan' | 'duplicate' | 'missing_map' | 'source_unclassified' | 'duplicate_node_task';
  id: string;
  description?: string;
}

export interface MigrationCounts {
  topicSpaces: number;
  mindmaps: number;
  dailyNotesScanned: number;
  eventsLinked: number;
  standaloneTasks: number;
  orphanTaskIds: number;
  duplicateNodeTaskIds: number;
}

export interface MigrationReport {
  schemaVersion: 1;
  startedAt: string;
  finishedAt?: string;
  mode: 'dry-run' | 'apply' | 'verify';
  counts: MigrationCounts;
  actions: MigrationAction[];
  issues: MigrationIssue[];
  preApplySnapshot?: Snapshot;
  postApplySnapshot?: Snapshot;
  ok?: boolean;
}

export interface MigrationAction {
  id: string;
  kind: string;
  description: string;
  target: string;
  note?: string;
}

export interface SnapshotEntry {
  relPath: string;
  sha256: string;
  sizeBytes: number;
}

export interface Snapshot {
  at: string;
  entries: SnapshotEntry[];
}

export function fileSha256(content: Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

export async function walkDir(dir: string, root: string, out: SnapshotEntry[] = []): Promise<SnapshotEntry[]> {
  let entries: import('fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full);
    if (entry.isDirectory()) {
      await walkDir(full, root, out);
    } else if (entry.isFile()) {
      const buf = await fs.readFile(full);
      out.push({ relPath: rel, sha256: fileSha256(buf), sizeBytes: buf.length });
    }
  }
  return out;
}

export async function takeSnapshot(root: string, subDirs: string[] = ['.dailyflow', 'Workspaces', 'Daily']): Promise<Snapshot> {
  const entries: SnapshotEntry[] = [];
  for (const sub of subDirs) {
    const subp = path.join(root, sub);
    let exists = false;
    try { await fs.access(subp); exists = true; } catch { exists = false; }
    if (exists) await walkDir(subp, root, entries);
  }
  return { at: new Date().toISOString(), entries };
}

export function snapshotsEqual(a: Snapshot, b: Snapshot): boolean {
  const ignoreRe = /(^|\/)\.dailyflow\/migrations\/event-first\/apply-\d+\.json$/;
  const clean = (entries: SnapshotEntry[]) => entries.filter(e => !ignoreRe.test(e.relPath));
  const ea = clean(a.entries).sort((x, y) => x.relPath.localeCompare(y.relPath));
  const eb = clean(b.entries).sort((x, y) => x.relPath.localeCompare(y.relPath));
  if (ea.length !== eb.length) return false;
  for (let i = 0; i < ea.length; i++) {
    if (ea[i].relPath !== eb[i].relPath) return false;
    if (`${ea[i].sha256}:${ea[i].sizeBytes}` !== `${eb[i].sha256}:${eb[i].sizeBytes}`) return false;
  }
  return true;
}

export interface DryRunOptions {
  cfgOverride?: Config;
  scanFrom?: string;
  scanTo?: string;
}

export async function dryRun(opts: DryRunOptions = {}): Promise<MigrationReport> {
  const startedAt = new Date().toISOString();
  const cfg = opts.cfgOverride ?? await config.loadConfig();
  const root = cfg.workspaceRoot;
  const before = await takeSnapshot(root);
  const issues: MigrationIssue[] = [];
  const spaces = await topicSpaces.listTopicSpaces();
  const mmaps = await mindmaps.listMindMaps();
  const events = await eventQuery.listEvents(cfg.workspaceRoot);
  const standalone: any[] = [];
  const today = new Date();
  for (let i = -30; i <= 30; i++) {
    const d = new Date(today); d.setDate(d.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const tasksDay = await eventQuery.listStandaloneTasks(iso, undefined, cfg.workspaceRoot);
    standalone.push(...tasksDay);
  }
  const counts: MigrationCounts = {
    topicSpaces: spaces.length,
    mindmaps: mmaps.length,
    dailyNotesScanned: 0,
    eventsLinked: events.length,
    standaloneTasks: standalone.length,
    orphanTaskIds: 0,
    duplicateNodeTaskIds: 0,
  };
  for (const e of events) {
    // EventSummary type does not carry integrity; only EventDetail does.
    // Migration issues are collected via per-event detail reads when
    // EFP-501 drill-down is implemented. Current shape keeps counts=0.
    void e;
  }
  const after = await takeSnapshot(root);
  const report: MigrationReport = {
    schemaVersion: 1,
    startedAt,
    finishedAt: new Date().toISOString(),
    mode: 'dry-run',
    counts,
    actions: [],
    issues,
  };
  report.preApplySnapshot = before;
  report.postApplySnapshot = after;
  return report;
}

export interface ApplyOptions {
  backupDir: string;
  cfgOverride?: Config;
  scanFrom?: string;
  scanTo?: string;
}

export class ApplyRequiresBackupDirError extends Error {
  code = 'MIGRATION_BACKUP_DIR_REQUIRED';
  constructor() { super('--backup-dir is required for apply mode'); }
}

export async function apply(opts: ApplyOptions): Promise<MigrationReport> {
  if (!opts.backupDir) throw new ApplyRequiresBackupDirError();
  const startedAt = new Date().toISOString();
  const cfg = opts.cfgOverride ?? await config.loadConfig();
  const root = cfg.workspaceRoot;
  const backupDir = path.resolve(opts.backupDir);
  await fs.mkdir(backupDir, { recursive: true });

  const before = await takeSnapshot(root);
  for (const e of before.entries) {
    const dest = path.join(backupDir, 'files', e.relPath);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(path.join(root, e.relPath), dest);
  }
  const manifestPath = path.join(backupDir, 'manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify({ backupOf: root, createdAt: new Date().toISOString(), snapshot: before }, null, 2));

  const dr = await dryRun({ cfgOverride: cfg, scanFrom: opts.scanFrom, scanTo: opts.scanTo });
  const actions: MigrationAction[] = [];
  const issues = dr.issues;
  const counts = dr.counts;

  const migrationsDir = path.join(root, '.dailyflow', 'migrations', 'event-first');
  await fs.mkdir(migrationsDir, { recursive: true });
  const rep: MigrationReport = {
    schemaVersion: 1,
    startedAt,
    finishedAt: new Date().toISOString(),
    mode: 'apply',
    counts,
    actions,
    issues,
    preApplySnapshot: before,
  };
  const reportPath = path.join(migrationsDir, `apply-${Date.now()}.json`);
  await fs.writeFile(reportPath, JSON.stringify(rep, null, 2), 'utf8');
  rep.postApplySnapshot = await takeSnapshot(root);
  await fs.writeFile(reportPath, JSON.stringify(rep, null, 2), 'utf8');
  return rep;
}

export interface VerifyOptions {
  applyReportPath?: string;
  cfgOverride?: Config;
  scanFrom?: string;
  scanTo?: string;
}

export async function verify(opts: VerifyOptions = {}): Promise<MigrationReport & { ok: boolean }> {
  const startedAt = new Date().toISOString();
  const cfg = opts.cfgOverride ?? await config.loadConfig();
  const root = cfg.workspaceRoot;
  const current = await takeSnapshot(root);
  const dr = await dryRun({ cfgOverride: cfg, scanFrom: opts.scanFrom, scanTo: opts.scanTo });
  let ok = true;
  const issues = [...dr.issues];
  const migrationsDir = path.join(root, '.dailyflow', 'migrations', 'event-first');
  let files: string[] = [];
  try { files = (await fs.readdir(migrationsDir)).filter(f => f.endsWith('.json')); } catch { files = []; }
  files.sort().reverse();
  if (files[0]) {
    try {
      const p = opts.applyReportPath ?? path.join(migrationsDir, files[0]);
      const applyReport = JSON.parse(await fs.readFile(p, 'utf8')) as MigrationReport;
      if (applyReport.postApplySnapshot) {
        ok = ok && snapshotsEqual(current, applyReport.postApplySnapshot);
      }
    } catch {
      ok = false;
    }
  }
  return {
    schemaVersion: 1,
    startedAt,
    finishedAt: new Date().toISOString(),
    mode: 'verify',
    counts: dr.counts,
    actions: [],
    issues,
    preApplySnapshot: dr.preApplySnapshot,
    postApplySnapshot: current,
    ok,
  };
}
