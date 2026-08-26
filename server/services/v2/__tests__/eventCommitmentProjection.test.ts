import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { V2Repository } from '../../../repositories/v2/repository';
import { createCommitment } from '../commitmentService';
import { completeCommitmentTodayItem, listCommitmentTodayItems, projectCommitmentsIntoEventDetail } from '../eventCommitmentProjection';
import type { EventDetail } from '../../../types/event';
import type { MindMap } from '../../../types/mindmap';
import { getEventById, listTodayItems as listProjectedTodayItems } from '../../eventQueryService';

let root: string;
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'dailyflow-event-commitment-')); });
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

describe('Commitment-first Event/Today projection', () => {
  it('projects entityRef over legacy execution, enters Today once, and reflects completion', async () => {
    const repo = new V2Repository({ root, workspaceId: 'ws_v2_default' });
    const commitment = await createCommitment(repo, repo.workspaceId, { title: 'Send investor update', outcome: 'Update sent', state: 'active', createdBy: 'ai' });
    const now = '2026-08-26T00:00:00.000Z';
    const map: MindMap = { id: 'map_commitment_projection', title: 'Fundraise', rootId: 'node_root', version: 2, createdAt: now, updatedAt: now,
      nodes: [
        { id: 'node_root', text: 'Fundraise', kind: 'root', position: { x: 0, y: 0 } },
        { id: 'node_task', text: 'Legacy stale text', kind: 'task', taskId: 'legacy_task', entityRefs: [{ type: 'commitment', id: commitment.id }], position: { x: 1, y: 1 } },
      ], edges: [{ id: 'edge_1', source: 'node_root', target: 'node_task' }] };
    await fs.mkdir(path.join(root, '.dailyflow', 'mindmaps'), { recursive: true });
    await fs.writeFile(path.join(root, '.dailyflow', 'mindmaps', `${map.id}.json`), JSON.stringify(map));
    const detail: EventDetail = { id: 'event_fundraise', mindmapId: map.id, title: map.title, context: 'work', status: 'active', progress: { done: 0, total: 1 }, effectiveTags: ['work'],
      createdAt: now, updatedAt: now, rootNodeId: map.rootId, edges: map.edges, manualTags: [], aiTags: [], integrity: { missingMap: false, sourceContextWasUnclassified: false, orphanTaskIds: [], duplicateNodeTaskIds: [] },
      nodes: [{ id: 'node_root', eventId: 'event_fundraise', text: 'Fundraise', position: { x: 0, y: 0 }, manualTags: [], aiTags: [] },
        { id: 'node_task', eventId: 'event_fundraise', text: 'Legacy stale text', position: { x: 1, y: 1 }, manualTags: [], aiTags: [], execution: { taskId: 'legacy_task', status: 'done', scheduledDate: '2020-01-01' } }] };

    const projected = await projectCommitmentsIntoEventDetail(repo, detail, map, '2026-08-26');
    expect(projected.nodes[1].execution).toMatchObject({ taskId: commitment.id, status: 'todo', scheduledDate: '2026-08-26' });
    const today = await listCommitmentTodayItems(repo, '2026-08-26', [{ detail: projected, map }], 'work');
    expect(today).toHaveLength(1);
    expect(today[0]).toMatchObject({ taskId: commitment.id, title: 'Send investor update', status: 'todo' });
    const queriedEvent = await getEventById(map.id, root);
    expect(queriedEvent?.nodes.find((node) => node.id === 'node_task')?.execution?.taskId).toBe(commitment.id);
    const queriedToday = await listProjectedTodayItems('2026-08-26', undefined, root);
    expect(queriedToday.filter((item) => item.taskId === commitment.id)).toHaveLength(1);

    expect(await completeCommitmentTodayItem(repo, commitment.id)).toMatchObject({ completed: true, alreadyDone: false });
    expect(await completeCommitmentTodayItem(repo, commitment.id)).toMatchObject({ completed: false, alreadyDone: true });
    const completed = await projectCommitmentsIntoEventDetail(repo, detail, map, '2026-08-26');
    expect(completed).toMatchObject({ status: 'completed', progress: { done: 1, total: 1 } });
    expect(completed.nodes[1].execution?.status).toBe('done');
    const completedToday = await listCommitmentTodayItems(repo, '2026-08-26', [{ detail: completed, map }]);
    expect(completedToday).toHaveLength(1);
    expect(completedToday[0].status).toBe('done');
  });
});
