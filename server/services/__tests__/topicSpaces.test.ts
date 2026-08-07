/**
 * Topic Space service tests.
 *
 * Covers SPEC §2.1 / §2.4 / §3.1 / §4.1:
 *   - create → auto-creates a blank MindMap and cross-binds both
 *   - list with `?context=` filter
 *   - update / delete
 *   - reorder within a context
 *   - read-tolerance for legacy `kind: workspace` files
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import * as config from '../config.ts';
import {
  createTopicSpace,
  deleteTopicSpace,
  getTopicSpace,
  listTopicSpaces,
  parseTopicSpaceFile,
  reorderTopicSpaces,
  updateTopicSpace,
  addTaskIdToTopicSpace,
  removeTaskIdFromTopicSpace,
  findTopicSpaceByTaskId,
} from '../topicSpaces.js';
import { getMindMap } from '../mindmaps.js';

describe.sequential('topicSpaces service', () => {
  let tmpRoot: string;
  let loadConfigSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'df-topic-spaces-'));
    loadConfigSpy = vi.spyOn(config, 'loadConfig').mockResolvedValue({ workspaceRoot: tmpRoot } as any);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (tmpRoot) {
      await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('creates a topic space, auto-creates a blank MindMap, and cross-binds both', async () => {
    const space = await createTopicSpace({ title: 'Investor outreach' });

    expect(space.id.startsWith('tw_')).toBe(true);
    expect(space.title).toBe('Investor outreach');
    expect(space.kind).toBe('topic-space');
    expect(space.context).toBe('unclassified');
    expect(space.mindmapId).toBeTruthy();
    expect(space.filePath).toBeTruthy();

    // The MindMap must exist on disk and the reverse link must point back.
    const map = await getMindMap(space.mindmapId);
    expect(map).not.toBeNull();
    expect(map!.spaceId).toBe(space.id);
    expect(map!.version).toBe(2);
    // The auto-created root node carries `kind: 'root'`.
    const root = map!.nodes.find(n => n.id === map!.rootId);
    expect(root?.kind).toBe('root');
  });

  it('assigns order 0 to the first space in a context, incrementing per context', async () => {
    const work1 = await createTopicSpace({ title: 'Work A', context: 'work' });
    const work2 = await createTopicSpace({ title: 'Work B', context: 'work' });
    const life1 = await createTopicSpace({ title: 'Life A', context: 'life' });

    expect(work1.order).toBe(0);
    expect(work2.order).toBeGreaterThan(work1.order);
    // Each context is its own counter — life should start at 0 again.
    expect(life1.order).toBe(0);
  });

  it('filters list by context', async () => {
    await createTopicSpace({ title: 'Work 1', context: 'work' });
    await createTopicSpace({ title: 'Work 2', context: 'work' });
    await createTopicSpace({ title: 'Life 1', context: 'life' });
    await createTopicSpace({ title: 'Unclassified' });

    const work = await listTopicSpaces({ context: 'work' });
    expect(work.length).toBe(2);
    expect(work.every(s => s.context === 'work')).toBe(true);

    const life = await listTopicSpaces({ context: 'life' });
    expect(life.length).toBe(1);

    const unclassified = await listTopicSpaces({ context: 'unclassified' });
    expect(unclassified.length).toBe(1);
  });

  it('updates a topic space and keeps the new kind in frontmatter', async () => {
    const created = await createTopicSpace({ title: 'Original' });
    const updated = await updateTopicSpace(created.id, {
      title: 'Renamed',
      context: 'work',
      order: 7,
    });

    expect(updated).not.toBeNull();
    expect(updated!.title).toBe('Renamed');
    expect(updated!.context).toBe('work');
    expect(updated!.order).toBe(7);
    expect(updated!.kind).toBe('topic-space');

    // The file on disk should now reflect the upgrade (kind: topic-space
    // is the upgrade point per SPEC §2.1).
    const content = await fs.readFile(created.filePath!, 'utf-8');
    expect(content).toContain('kind: topic-space');
  });

  it('deletes a topic space and leaves the MindMap in place (per SPEC §3.1)', async () => {
    const created = await createTopicSpace({ title: 'Doomed' });
    const mindmapId = created.mindmapId;

    const ok = await deleteTopicSpace(created.id);
    expect(ok).toBe(true);
    expect(await getTopicSpace(created.id)).toBeNull();
    // The MindMap is intentionally NOT deleted (SPEC §3.1). The
    // `archived` flag is a TODO for phase 2; until then the file just
    // sits orphaned.
    const map = await getMindMap(mindmapId);
    expect(map).not.toBeNull();
  });

  it('reorders spaces within a context, leaving other contexts alone', async () => {
    const a = await createTopicSpace({ title: 'A', context: 'work' });
    const b = await createTopicSpace({ title: 'B', context: 'work' });
    const c = await createTopicSpace({ title: 'C', context: 'work' });
    const life = await createTopicSpace({ title: 'Life', context: 'life' });

    const reordered = await reorderTopicSpaces('work', [c.id, a.id, b.id]);
    const orderByTitle = reordered.map(s => s.title);
    expect(orderByTitle).toEqual(['C', 'A', 'B']);

    // The life-context space is untouched.
    const after = await listTopicSpaces();
    const lifeAfter = after.find(s => s.id === life.id);
    expect(lifeAfter!.order).toBe(life.order);
  });

  it('reads legacy `kind: workspace` files tolerantly, filling defaults in memory', async () => {
    // Simulate a pre-existing file written by the old `thinkingWorkspaces`
    // service. We write the file directly to mimic legacy on-disk state.
    const dir = path.join(tmpRoot, 'Workspaces', '2025', '01');
    await fs.mkdir(dir, { recursive: true });
    const legacyPath = path.join(dir, 'tw_legacy_workspace.md');
    const legacyContent = [
      '---',
      'id: tw_legacy_workspace',
      'kind: workspace',
      'type: general',
      'status: active',
      'createdAt: 2025-01-01T00:00:00.000Z',
      'updatedAt: 2025-01-02T00:00:00.000Z',
      '---',
      '',
      '# Legacy workspace',
      '',
      '## Intent',
      '',
      'legacy intent',
      '',
    ].join('\n');
    await fs.writeFile(legacyPath, legacyContent, 'utf-8');

    const parsed = parseTopicSpaceFile(legacyContent, legacyPath);
    expect(parsed.kind).toBe('workspace'); // kind is preserved, NOT upgraded
    expect(parsed.context).toBe('unclassified');
    expect(parsed.mindmapId).toBe('');
    expect(parsed.defaultView).toBe('mindmap');
    expect(parsed.order).toBe(0);

    // Reading via the service path also works.
    const listed = await listTopicSpaces();
    const found = listed.find(s => s.id === 'tw_legacy_workspace');
    expect(found).not.toBeUndefined();
    expect(found!.title).toBe('Legacy workspace');

    // The on-disk file should be untouched (no auto-rewrite on read).
    const after = await fs.readFile(legacyPath, 'utf-8');
    expect(after).toBe(legacyContent);
  });

  it('throws when title is empty', async () => {
    await expect(createTopicSpace({ title: '   ' })).rejects.toThrow(/title/i);
  });
});

describe.sequential('topicSpaces taskIds helpers', () => {
  let tmpRoot: string;
  let loadConfigSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'df-topic-spaces-taskids-'));
    loadConfigSpy = vi.spyOn(config, 'loadConfig').mockResolvedValue({ workspaceRoot: tmpRoot } as any);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (tmpRoot) {
      await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('addTaskIdToTopicSpace appends a new id and is idempotent', async () => {
    const space = await createTopicSpace({ title: 'Add once' });
    const first = await addTaskIdToTopicSpace(space.id, 't_first');
    expect(first).not.toBeNull();
    expect(first!.taskIds).toContain('t_first');

    // Re-adding the same id is a no-op (no duplicate entry, no error).
    const second = await addTaskIdToTopicSpace(space.id, 't_first');
    expect(second!.taskIds.filter(id => id === 't_first')).toHaveLength(1);
  });

  it('addTaskIdToTopicSpace returns null when the space is missing', async () => {
    const result = await addTaskIdToTopicSpace('tw_no_such_space', 't_x');
    expect(result).toBeNull();
  });

  it('removeTaskIdFromTopicSpace drops the id; missing id is a no-op', async () => {
    const space = await createTopicSpace({ title: 'Remove me' });
    await addTaskIdToTopicSpace(space.id, 't_target');
    await addTaskIdToTopicSpace(space.id, 't_other');

    const after = await removeTaskIdFromTopicSpace(space.id, 't_target');
    expect(after).not.toBeNull();
    expect(after!.taskIds).toContain('t_other');
    expect(after!.taskIds).not.toContain('t_target');

    // Removing a non-existent id is a no-op (not an error).
    const still = await removeTaskIdFromTopicSpace(space.id, 't_target');
    expect(still!.taskIds).toEqual(after!.taskIds);
  });

  it('findTopicSpaceByTaskId returns the owning space or null', async () => {
    const a = await createTopicSpace({ title: 'Space A' });
    const b = await createTopicSpace({ title: 'Space B' });
    await addTaskIdToTopicSpace(a.id, 't_shared');
    await addTaskIdToTopicSpace(b.id, 't_b_only');

    const found = await findTopicSpaceByTaskId('t_shared');
    expect(found?.id).toBe(a.id);
    const other = await findTopicSpaceByTaskId('t_b_only');
    expect(other?.id).toBe(b.id);
    const orphan = await findTopicSpaceByTaskId('t_orphan');
    expect(orphan).toBeNull();
  });
});
