/**
 * MindMap v2 tests.
 *
 * Covers SPEC §2.2 / §3.3:
 *   - v1 files are read tolerantly
 *   - PUT auto-bumps to v2
 *   - missing `kind` defaults to 'branch'
 *   - createMindMap now writes v2 with `kind: 'root'` on the auto root
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import * as config from '../config.ts';
import {
  createMindMap,
  defaultNodeKind,
  getMindMap,
  listMindMaps,
  updateMindMap,
  updateNodeInMindMap,
  getInheritedTagsFromMap,
} from '../mindmaps.js';
import { DEFAULT_MINDMAP_NODE_KIND } from '../../types/mindmap.ts';
import type { MindMap, MindMapNode } from '../../types/mindmap.ts';

describe.sequential('mindmap v2', () => {
  let tmpRoot: string;
  let loadConfigSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'df-mindmap-v2-'));
    loadConfigSpy = vi.spyOn(config, 'loadConfig').mockResolvedValue({ workspaceRoot: tmpRoot } as any);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (tmpRoot) {
      await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('defaultNodeKind fills missing kind with the documented default', () => {
    expect(defaultNodeKind({ id: 'a', text: 'a', position: { x: 0, y: 0 } }).kind).toBe(DEFAULT_MINDMAP_NODE_KIND);
    expect(defaultNodeKind({ id: 'b', text: 'b', position: { x: 0, y: 0 }, kind: 'task' }).kind).toBe('task');
    // We do not mutate the input.
    const original = { id: 'c', text: 'c', position: { x: 0, y: 0 } } as any;
    defaultNodeKind(original);
    expect(original.kind).toBeUndefined();
  });

  it('createMindMap writes a v2 map with `kind: "root"` on the auto root', async () => {
    const map = await createMindMap({ title: 'New map' });
    expect(map.version).toBe(2);
    const root = map.nodes.find(n => n.id === map.rootId);
    expect(root?.kind).toBe('root');
  });

  it('reads a v1 file on disk without rewriting it', async () => {
    const dir = path.join(tmpRoot, '.dailyflow', 'mindmaps');
    await fs.mkdir(dir, { recursive: true });
    const id = '01HV0LEGACYMAPV100000000';
    const filePath = path.join(dir, `${id}.json`);
    const v1 = {
      id,
      title: 'Legacy',
      rootId: 'root1',
      nodes: [
        { id: 'root1', text: 'center', position: { x: 0, y: 0 } },
        { id: 'n2', text: 'child', position: { x: 1, y: 0 } },
      ],
      edges: [{ id: 'e1', source: 'root1', target: 'n2' }],
      version: 1,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    };
    await fs.writeFile(filePath, JSON.stringify(v1), 'utf-8');

    const listed = await listMindMaps();
    expect(listed.find(m => m.id === id)).toBeTruthy();
    const got = await getMindMap(id);
    expect(got?.version).toBe(1);

    // Reading must not touch the file (no auto-bump on read).
    const onDisk = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    expect(onDisk.version).toBe(1);
  });

  it('PUT auto-bumps v1 → v2 and defaults `kind: "branch"` on nodes missing it', async () => {
    const created = await createMindMap({ title: 'Pre' });
    // Manually write a v1 shape on disk to simulate a legacy file.
    const dir = path.join(tmpRoot, '.dailyflow', 'mindmaps');
    const filePath = path.join(dir, `${created.id}.json`);
    const v1 = {
      ...created,
      version: 1,
      nodes: [
        { id: created.rootId, text: created.title, position: { x: 0, y: 0 } }, // no kind
        { id: 'n_branch', text: 'Branch', position: { x: 1, y: 0 } },          // no kind
        { id: 'n_tag', text: 'Tag', position: { x: 2, y: 0 }, kind: 'tag' }, // explicit kind
      ],
    };
    await fs.writeFile(filePath, JSON.stringify(v1, null, 2), 'utf-8');

    const updated = await updateMindMap(created.id, { title: 'Bumped' });
    expect(updated).not.toBeNull();
    expect(updated!.version).toBe(2);
    expect(updated!.title).toBe('Bumped');

    // Nodes that lacked `kind` get defaulted to 'branch' on write.
    const root = updated!.nodes.find(n => n.id === created.rootId);
    const branch = updated!.nodes.find(n => n.id === 'n_branch');
    const tag = updated!.nodes.find(n => n.id === 'n_tag');
    expect(root?.kind).toBe('branch');
    expect(branch?.kind).toBe('branch');
    expect(tag?.kind).toBe('tag');
  });

  it('createMindMap accepts a spaceId and writes it into the v2 map', async () => {
    const map = await createMindMap({ title: 'Bound', spaceId: 'tw_some_space' });
    expect(map.version).toBe(2);
    expect(map.spaceId).toBe('tw_some_space');
  });

  it('updateMindMap with `spaceId: null` strips the link, undefined preserves it', async () => {
    const created = await createMindMap({ title: 'Linked', spaceId: 'tw_outer' });
    expect(created.spaceId).toBe('tw_outer');

    const stripped = await updateMindMap(created.id, { spaceId: null });
    expect(stripped?.spaceId).toBeUndefined();

    // Re-bind and verify a regular PUT preserves the link.
    await updateMindMap(created.id, { spaceId: 'tw_outer_again' });
    const preserved = await updateMindMap(created.id, { title: 'Renamed' });
    expect(preserved?.spaceId).toBe('tw_outer_again');
  });

  // Topic Spaces Phase 2/3: the per-node helpers the routes use for
  // promote-to-task / link-task / repair. These tests pin the
  // behavior of `updateNodeInMindMap` and `getInheritedTagsFromMap` so
  // the route layer can rely on them.
  it('updateNodeInMindMap flips a node to kind: task with a new taskId', async () => {
    const created = await createMindMap({ title: 'Promote me' });
    const branch = {
      id: 'n_branch',
      text: '子任务',
      position: { x: 1, y: 0 },
      kind: 'branch' as const,
    };
    // Inject the branch + edge.
    await updateMindMap(created.id, {
      nodes: [...created.nodes, branch],
      edges: [{ id: 'e1', source: created.rootId, target: branch.id }],
    });

    const updated = await updateNodeInMindMap(created.id, branch.id, {
      kind: 'task',
      taskId: 't_new',
    });
    expect(updated).not.toBeNull();
    const next = updated!.nodes.find(n => n.id === branch.id);
    expect(next?.kind).toBe('task');
    expect(next?.taskId).toBe('t_new');
    // The other nodes (root) are untouched.
    const root = updated!.nodes.find(n => n.id === created.rootId);
    expect(root?.kind).toBe('root');
  });

  it('updateNodeInMindMap returns null when the map does not exist', async () => {
    const result = await updateNodeInMindMap('mm_does_not_exist', 'n1', { kind: 'task' });
    expect(result).toBeNull();
  });

  it('updateNodeInMindMap returns null when the node does not exist', async () => {
    const created = await createMindMap({ title: 'No node' });
    const result = await updateNodeInMindMap(created.id, 'n_missing', { kind: 'task' });
    expect(result).toBeNull();
  });

  it('updateNodeInMindMap can clear a field by setting it to undefined', async () => {
    const created = await createMindMap({ title: 'Clear me' });
    const branch = {
      id: 'n_branch',
      text: 'task-y',
      position: { x: 1, y: 0 },
      kind: 'task' as const,
      taskId: 't_old',
    };
    await updateMindMap(created.id, {
      nodes: [...created.nodes, branch],
      edges: [{ id: 'e1', source: created.rootId, target: branch.id }],
    });

    // Demote back to a branch.
    const updated = await updateNodeInMindMap(created.id, branch.id, {
      kind: 'branch',
      taskId: undefined,
    });
    const next = updated!.nodes.find(n => n.id === branch.id);
    expect(next?.kind).toBe('branch');
    expect(next?.taskId).toBeUndefined();
  });
});

describe('getInheritedTagsFromMap', () => {
  // Helper: build a tiny map inline without going through the file
  // system, since `getInheritedTagsFromMap` is a pure function.
  function buildMap(
    nodes: MindMapNode[],
    edges: { source: string; target: string }[],
    rootId: string,
  ): MindMap {
    return {
      id: 'mm_inline',
      title: 'inline',
      rootId,
      nodes,
      edges: edges.map((e, i) => ({ id: `e${i}`, source: e.source, target: e.target })),
      version: 2,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
  }

  it('returns tags from a single ancestor tag node, root-to-leaf order', () => {
    const map = buildMap(
      [
        { id: 'root', text: 'r', position: { x: 0, y: 0 }, kind: 'root' },
        { id: 'tag1', text: '主题', position: { x: 0, y: 1 }, kind: 'tag', tag: 'waic' },
        { id: 'sub', text: '子', position: { x: 0, y: 2 }, kind: 'branch' },
        { id: 'leaf', text: '叶子', position: { x: 0, y: 3 }, kind: 'branch' },
      ],
      [
        { source: 'root', target: 'tag1' },
        { source: 'tag1', target: 'sub' },
        { source: 'sub', target: 'leaf' },
      ],
      'root',
    );
    const tags = getInheritedTagsFromMap(map, 'leaf');
    expect(tags).toEqual(['waic']);
  });

  it('collects multiple tag ancestors in root-to-leaf order', () => {
    const map = buildMap(
      [
        { id: 'root', text: 'r', position: { x: 0, y: 0 }, kind: 'root' },
        { id: 'tag_a', text: 'A', position: { x: 0, y: 1 }, kind: 'tag', tag: 'a' },
        { id: 'tag_b', text: 'B', position: { x: 0, y: 2 }, kind: 'tag', tag: 'b' },
        { id: 'leaf', text: 'leaf', position: { x: 0, y: 3 }, kind: 'branch' },
      ],
      [
        { source: 'root', target: 'tag_a' },
        { source: 'tag_a', target: 'tag_b' },
        { source: 'tag_b', target: 'leaf' },
      ],
      'root',
    );
    const tags = getInheritedTagsFromMap(map, 'leaf');
    expect(tags).toEqual(['a', 'b']);
  });

  it('deduplicates tag ancestors (case-insensitive)', () => {
    const map = buildMap(
      [
        { id: 'root', text: 'r', position: { x: 0, y: 0 }, kind: 'root' },
        { id: 'tag_a', text: 'A', position: { x: 0, y: 1 }, kind: 'tag', tag: 'waic' },
        { id: 'tag_b', text: 'B', position: { x: 0, y: 2 }, kind: 'tag', tag: 'WAIC' },
        { id: 'leaf', text: 'leaf', position: { x: 0, y: 3 }, kind: 'branch' },
      ],
      [
        { source: 'root', target: 'tag_a' },
        { source: 'tag_a', target: 'tag_b' },
        { source: 'tag_b', target: 'leaf' },
      ],
      'root',
    );
    const tags = getInheritedTagsFromMap(map, 'leaf');
    // The leaf-most tag is encountered first; case-insensitive dedup
    // drops the duplicate at the higher level.
    expect(tags).toEqual(['WAIC']);
  });

  it('returns an empty array when no ancestor is a tag', () => {
    const map = buildMap(
      [
        { id: 'root', text: 'r', position: { x: 0, y: 0 }, kind: 'root' },
        { id: 'a', text: 'a', position: { x: 0, y: 1 }, kind: 'branch' },
        { id: 'b', text: 'b', position: { x: 0, y: 2 }, kind: 'branch' },
      ],
      [
        { source: 'root', target: 'a' },
        { source: 'a', target: 'b' },
      ],
      'root',
    );
    expect(getInheritedTagsFromMap(map, 'b')).toEqual([]);
  });

  it('skips ancestors whose kind is "tag" but no `tag` value is set', () => {
    const map = buildMap(
      [
        { id: 'root', text: 'r', position: { x: 0, y: 0 }, kind: 'root' },
        { id: 'tag_empty', text: 'no label', position: { x: 0, y: 1 }, kind: 'tag' },
        { id: 'leaf', text: 'l', position: { x: 0, y: 2 }, kind: 'branch' },
      ],
      [
        { source: 'root', target: 'tag_empty' },
        { source: 'tag_empty', target: 'leaf' },
      ],
      'root',
    );
    expect(getInheritedTagsFromMap(map, 'leaf')).toEqual([]);
  });

  it('returns [] for a node that does not exist', () => {
    const map = buildMap(
      [
        { id: 'root', text: 'r', position: { x: 0, y: 0 }, kind: 'root' },
      ],
      [],
      'root',
    );
    expect(getInheritedTagsFromMap(map, 'missing')).toEqual([]);
  });
});
