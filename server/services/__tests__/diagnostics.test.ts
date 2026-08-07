/**
 * Diagnostics service tests (Topic Spaces Phase 4).
 *
 * Covers `findBrokenLinks` and `getDiagnosticsSummary`. Tests the
 * detection logic end-to-end on a real (temp) workspace: each
 * scenario seeds a known data shape and asserts the issues that
 * should be reported.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import * as config from '../config.ts';
import { findBrokenLinks, getDiagnosticsSummary } from '../diagnostics.js';
import { createTopicSpace, deleteTopicSpace } from '../topicSpaces.js';
import { createMindMap, updateMindMap, updateNodeInMindMap } from '../mindmaps.js';
import { writeDailyNote } from '../fileSystem.js';

describe.sequential('diagnostics service', () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'df-diag-svc-'));
    vi.spyOn(config, 'loadConfig').mockResolvedValue({ workspaceRoot: tmpRoot, dailyPathTemplate: 'Daily/{year}/{month}/{date}.md', rolloverTrigger: 'manual', rolloverSkipTags: [] } as any);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (tmpRoot) {
      await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('findBrokenLinks returns no issues for an empty workspace', async () => {
    const issues = await findBrokenLinks();
    expect(issues).toEqual([]);
  });

  it('flags a kind: task node pointing at a deleted task', async () => {
    // No daily note for this task — the only thing that should make
    // the parser find it is on-disk content.
    const map = await createMindMap({ title: 'Pointer' });
    await updateMindMap(map.id, {
      nodes: [
        ...map.nodes,
        { id: 'n_x', text: 'x', position: { x: 1, y: 0 }, kind: 'task', taskId: 't_ghost' },
      ],
    });
    const issues = await findBrokenLinks();
    expect(issues).toHaveLength(1);
    expect(issues[0].reason).toBe('task_not_found');
    expect(issues[0].taskId).toBe('t_ghost');
  });

  it('does not flag a kind: task node pointing at a live task', async () => {
    const taskId = 't_alive_2';
    await writeDailyNote('2026-08-13', `- [ ] live ^id-${taskId}\n`, {
      workspaceRoot: tmpRoot,
      dailyPathTemplate: 'Daily/{year}/{month}/{date}.md',
      rolloverTrigger: 'manual',
      rolloverSkipTags: [],
    } as any);
    const map = await createMindMap({ title: 'Pointer' });
    await updateMindMap(map.id, {
      nodes: [
        ...map.nodes,
        { id: 'n_x', text: 'x', position: { x: 1, y: 0 }, kind: 'task', taskId },
      ],
    });
    const issues = await findBrokenLinks();
    expect(issues).toEqual([]);
  });

  it('flags a MindMap whose spaceId points at a deleted topic space', async () => {
    // Create a space, then delete it. The MindMap still references
    // the (now-missing) space.
    const space = await createTopicSpace({ title: 'Doomed' });
    const mapId = space.mindmapId;
    // Detach the map's spaceId first so the delete doesn't affect us.
    await updateMindMap(mapId, { spaceId: null });
    // Re-link to the soon-to-be-deleted space, then delete the space.
    await updateMindMap(mapId, { spaceId: space.id });
    await deleteTopicSpace(space.id);

    const issues = await findBrokenLinks();
    const orphan = issues.find((i) => i.mindmapId === mapId && i.reason === 'space_not_found');
    expect(orphan).toBeDefined();
  });

  it('getDiagnosticsSummary reports the right counts', async () => {
    const a = await createTopicSpace({ title: 'A' });
    const b = await createTopicSpace({ title: 'B' });
    await writeDailyNote('2026-08-14', '- [ ] a ^id-t_a\n- [ ] b ^id-t_b\n', {
      workspaceRoot: tmpRoot,
      dailyPathTemplate: 'Daily/{year}/{month}/{date}.md',
      rolloverTrigger: 'manual',
      rolloverSkipTags: [],
    } as any);

    const summary = await getDiagnosticsSummary();
    expect(summary.topicSpaces).toBeGreaterThanOrEqual(2);
    expect(summary.tasks).toBeGreaterThanOrEqual(2);
    // No broken links in this scenario.
    expect(summary.brokenLinks).toBe(0);
    expect(summary.orphanMindmaps).toBe(0);
    expect(a.id).toBeTruthy();
    expect(b.id).toBeTruthy();
  });
});
