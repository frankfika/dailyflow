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
} from '../mindmaps.js';
import { DEFAULT_MINDMAP_NODE_KIND } from '../../types/mindmap.ts';

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
});
