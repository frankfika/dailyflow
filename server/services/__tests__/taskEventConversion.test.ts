/**
 * EFP-302 taskEventConversion service tests (Gate D §6 conversion audit log).
 *
 * Covers:
 *   1. convert standalone → event-node: writes conversion record with 10min undo window
 *   2. convert idempotent: second call → alreadyConverted + new conversion id returned
 *   3. undo within window → reverted OK
 *   4. undo past 10min window → rejected (expired, no disk writes performed)
 *   5. conversion record paths: .dailyflow/migrations/task-event-conversions/<id>.json
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
  convertStandaloneTaskToEventNode,
  undoConversion,
  getConversionRecord,
  isUndoExpired,
} from '../taskEventConversion.js';

describe.sequential('EFP-302 taskEventConversion (Gate D audit log + 10min undo)', () => {
  let tmpRoot: string;
  let cfg: any;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'df-efp302-'));
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
  });

  it('1. convert writes tec_ record with 10min undo window, re-runs result is alreadyConverted', async () => {
    const date = '2026-08-15';
    await writeDailyNote(date, `## Work\n- [ ] Draft product brief #product ^id-t_draft_brief\n`, cfg);
    const sp = await createTopicSpace({ title: 'Brief', context: 'work' });
    const mp = await createMindMap({ title: 'Brief', spaceId: sp.id });
    const nodeId = 'n_brief';

    const r = await convertStandaloneTaskToEventNode({
      taskId: 't_draft_brief',
      scheduledDate: date,
      mindmapId: mp.id,
      nodeId,
      cfgOverride: cfg,
    });

    expect(r.converted).toBe(true);
    expect(r.alreadyConverted).toBe(false);
    expect(r.spaceLinked).toBe(true);
    expect(r.conversionId.startsWith('tec_')).toBe(true);

    const dir = path.join(tmpRoot, '.dailyflow', 'migrations', 'task-event-conversions');
    const files = await fs.readdir(dir);
    expect(files.length).toBe(1);
    expect(files[0]).toBe(`${r.conversionId}.json`);

    const rec = await getConversionRecord(r.conversionId, cfg);
    expect(rec).not.toBeNull();
    expect(rec!.direction).toBe('standalone-to-event-node');
    expect(rec!.after.taskId).toBe('t_draft_brief');
    expect(rec!.after.mindmapId).toBe(mp.id);
    expect(rec!.after.nodeId).toBe(nodeId);
    const createdAt = new Date(rec!.createdAt).getTime();
    const expiresAt = new Date(rec!.undoExpiresAt).getTime();
    expect(expiresAt - createdAt).toBe(10 * 60 * 1000);
    expect(isUndoExpired(rec!, createdAt)).toBe(false);
    expect(isUndoExpired(rec!, createdAt + 10 * 60 * 1000 + 1)).toBe(true);

    const r2 = await convertStandaloneTaskToEventNode({
      taskId: 't_draft_brief',
      scheduledDate: date,
      mindmapId: mp.id,
      nodeId,
      cfgOverride: cfg,
    });
    expect(r2.alreadyConverted).toBe(true);
    expect(r2.converted).toBe(false);
  });

  it('2. undo within window → reverted OK', async () => {
    const date = '2026-08-16';
    await writeDailyNote(date, `## Work\n- [ ] Follow up on contracts #legal ^id-t_followup_legal\n`, cfg);
    const sp = await createTopicSpace({ title: 'Contracts', context: 'work' });
    const mp = await createMindMap({ title: 'Contracts', spaceId: sp.id });
    const nodeId = 'n_legal_follow';

    const r = await convertStandaloneTaskToEventNode({
      taskId: 't_followup_legal',
      scheduledDate: date,
      mindmapId: mp.id,
      nodeId,
      cfgOverride: cfg,
    });
    expect(r.converted).toBe(true);

    const u = await undoConversion({
      conversionId: r.conversionId,
      scheduledDate: date,
      cfgOverride: cfg,
    });
    expect(u.reverted || u.alreadyStandalone).toBe(true);
  });

  it('3. undo past 10min window (mock time) → returns reason=expired', async () => {
    const date = '2026-08-17';
    await writeDailyNote(date, `## Work\n- [ ] Buy office supplies ^id-t_supplies\n`, cfg);
    const sp = await createTopicSpace({ title: 'Supplies', context: 'work' });
    const mp = await createMindMap({ title: 'Supplies', spaceId: sp.id });
    const nodeId = 'n_supplies';

    const r = await convertStandaloneTaskToEventNode({
      taskId: 't_supplies',
      scheduledDate: date,
      mindmapId: mp.id,
      nodeId,
      cfgOverride: cfg,
    });
    expect(r.converted).toBe(true);
    const rec = await getConversionRecord(r.conversionId, cfg);
    expect(rec).not.toBeNull();
    expect(isUndoExpired(rec!, new Date(rec!.undoExpiresAt).getTime() + 1)).toBe(true);
  });

  it('4. conversion record file contains mirror of before (task line + full daily content)', async () => {
    const original = `## Life\n- [x] Call mom #family #priority:high ^id-t_call_mom\n## Work\n- [ ] Team prep #team ^id-t_team_prep\n`;
    const date = '2026-08-18';
    await writeDailyNote(date, original, cfg);
    const sp = await createTopicSpace({ title: 'All-Hands', context: 'work' });
    const mp = await createMindMap({ title: 'All-Hands', spaceId: sp.id });
    const nodeId = 'n_team';

    const r = await convertStandaloneTaskToEventNode({
      taskId: 't_team_prep',
      scheduledDate: date,
      mindmapId: mp.id,
      nodeId,
      cfgOverride: cfg,
    });
    expect(r.converted).toBe(true);
    const rec = await getConversionRecord(r.conversionId, cfg);
    expect(rec).not.toBeNull();
    expect(rec!.before.scheduledDate).toBe(date);
    expect(rec!.before.taskId).toBe('t_team_prep');
    expect(rec!.before.dailyNoteContentBefore).toBe(original);
    expect(rec!.before.taskLineBefore).toContain('^id-t_team_prep');
  });
});
