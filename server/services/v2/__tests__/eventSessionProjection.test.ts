import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { V2Repository } from '../../../repositories/v2/repository';
import { buildEventSessionProjection } from '../eventSessionProjection';
import type { EventDetail } from '../../../types/event';
import type { MindMap } from '../../../types/mindmap';

let root: string;
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'dailyflow-projection-')); });
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

const event: EventDetail = {
  id: 'event_01K3AAAAAAAAAAAAAAAAAAAAA', mindmapId: 'mindmap_01K3AAAAAAAAAAAAAAAAAAA', title: '融资推进', context: 'work', status: 'active',
  progress: { done: 0, total: 1 }, effectiveTags: ['fundraising'], createdAt: '2026-08-25T00:00:00.000Z', updatedAt: '2026-08-26T00:00:00.000Z',
  rootNodeId: 'node_root_01K3AAAAAAAAAAAAAAAAA', nodes: [], edges: [], manualTags: [], aiTags: [],
  integrity: { missingMap: false, sourceContextWasUnclassified: false, orphanTaskIds: [], duplicateNodeTaskIds: [] },
};
const map: MindMap = {
  id: event.mindmapId, title: event.title, rootId: event.rootNodeId, version: 2,
  nodes: [{ id: event.rootNodeId, text: '融资推进', kind: 'root', position: { x: 0, y: 0 } }], edges: [],
  createdAt: event.createdAt, updatedAt: event.updatedAt,
};

describe('Event Session Projection', () => {
  it('is deterministic, bounded to the Run workspace/event, and contains no full Note body', async () => {
    const repo = new V2Repository({ root, workspaceId: 'ws_projection' });
    await repo.saveNoteDocument({
      id: 'note_01K3AAAAAAAAAAAAAAAAAAAAAA', schemaVersion: 1, workspaceId: 'ws_projection', createdBy: 'user',
      createdAt: event.createdAt, updatedAt: event.updatedAt, title: '投资人会议', body: 'TOP SECRET FULL TRANSCRIPT',
      kind: 'meeting', contentHash: '12345678abcdef', state: 'active', tagIds: [], projectIds: [], personIds: [], sourceIds: [],
      pinned: false, autoSaveVersion: 1, commitmentIds: [],
    });
    const scope = { workspaceId: 'ws_projection', eventId: event.id, mindmapId: map.id, trigger: 'event_canvas' as const,
      selectedContextRefs: [{ type: 'note', id: 'note_01K3AAAAAAAAAAAAAAAAAAAAAA' }], contextBudgetBytes: 64 * 1024 };
    const first = await buildEventSessionProjection(repo, scope, { event, mindmap: map });
    const second = await buildEventSessionProjection(repo, scope, { event, mindmap: map });
    expect(first.manifestHash).toBe(second.manifestHash);
    expect(JSON.stringify(first)).not.toContain('TOP SECRET FULL TRANSCRIPT');
    expect(first.selectedContext[0]).toMatchObject({ title: '投资人会议' });
    await expect(buildEventSessionProjection(repo, { ...scope, workspaceId: 'ws_other' }, { event, mindmap: map }))
      .rejects.toMatchObject({ code: 'TOOL_SCOPE_VIOLATION' });
  });
});
