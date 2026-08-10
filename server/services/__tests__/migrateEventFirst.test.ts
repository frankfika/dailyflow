/**
 * EFP-501 migrateEventFirst service tests (Gate F §5 Migration).
 *
 * Covers:
 *   1. dry-run: snapshots before == after (zero writes)
 *   2. apply without --backup-dir → ApplyRequiresBackupDirError
 *   3. apply with backup-dir → writes manifest + files, post snapshot matches on verify
 *   4. apply twice → actions=0 (idempotent)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import * as config from '../config.js';
import { writeDailyNote } from '../fileSystem.js';
import { createTopicSpace } from '../topicSpaces.js';
import { createMindMap } from '../mindmaps.js';
import {
  dryRun,
  apply,
  verify,
  snapshotsEqual,
  fileSha256,
  ApplyRequiresBackupDirError,
} from '../migrateEventFirst.js';

describe.sequential('EFP-501 migrate:event-first (Gate F dry/apply/verify)', () => {
  let tmpRoot: string;
  let backupRoot: string;
  let cfg: any;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'df-efp501-'));
    backupRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'df-efp501-backup-'));
    cfg = {
      workspaceRoot: tmpRoot,
      dailyPathTemplate: 'Daily/{year}/{month}/{date}.md',
      rolloverTrigger: 'manual' as const,
      rolloverSkipTags: [] as string[],
    };
    vi.spyOn(config, 'loadConfig').mockResolvedValue(cfg);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (tmpRoot) await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
    if (backupRoot) await fs.rm(backupRoot, { recursive: true, force: true }).catch(() => {});
  });

  async function seedWorkspace() {
    await writeDailyNote('2026-09-09', `## Work\n- [ ] Ship release #release ^mm:tw_mapship ^node:n_ship ^id-t_ship1\n`, cfg);
    const sp = await createTopicSpace({ title: 'Release', context: 'work' });
    const mp = await createMindMap({ title: 'Release', spaceId: sp.id });
    return { sp, mp };
  }

  it('1. dry-run leaves snapshot identical (tree + sha)', async () => {
    await seedWorkspace();
    const r = await dryRun({ cfgOverride: cfg });
    expect(r.schemaVersion).toBe(1);
    expect(r.mode).toBe('dry-run');
    expect(r.actions.length).toBe(0);
    expect(r.preApplySnapshot && r.postApplySnapshot).toBeTruthy();
    if (r.preApplySnapshot && r.postApplySnapshot) {
      expect(snapshotsEqual(r.preApplySnapshot, r.postApplySnapshot)).toBe(true);
    }
  });

  it('2. apply without backupDir throws ApplyRequiresBackupDirError (gate F §157)', async () => {
    await expect(apply({ backupDir: '' as any, cfgOverride: cfg }))
      .rejects
      .toThrow(ApplyRequiresBackupDirError);
  });

  it('3. apply with backupDir writes manifest + files; verify ok', async () => {
    await seedWorkspace();
    const a = await apply({ backupDir: backupRoot, cfgOverride: cfg });
    expect(a.mode).toBe('apply');
    expect(a.actions.length).toBe(0);
    const manifestPath = path.join(backupRoot, 'manifest.json');
    const raw = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    expect(raw.backupOf).toBe(tmpRoot);
    expect(raw.snapshot.entries.length).toBeGreaterThan(0);
    for (const e of raw.snapshot.entries) {
      const expectedCopy = path.join(backupRoot, 'files', e.relPath);
      const buf = await fs.readFile(expectedCopy);
      expect(fileSha256(buf)).toBe(e.sha256);
    }
    const v = await verify({ cfgOverride: cfg });
    expect(v.mode).toBe('verify');
    expect(v.ok).toBe(true);
  });

  it('4. apply double-call is valid; still produces valid report (idempotency)', async () => {
    await seedWorkspace();
    const first = await apply({ backupDir: backupRoot, cfgOverride: cfg });
    const secondBackup = backupRoot + '-2nd';
    const second = await apply({ backupDir: secondBackup, cfgOverride: cfg });
    expect(first.schemaVersion).toBe(1);
    expect(second.schemaVersion).toBe(1);
    expect(second.actions.length).toBe(0);
  });
});
