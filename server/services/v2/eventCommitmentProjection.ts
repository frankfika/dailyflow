import type { V2Repository } from '../../repositories/v2/repository.js';
import type { EventDetail, TodayItem, EventContext } from '../../types/event.js';
import type { MindMap } from '../../types/mindmap.js';
import { buildNodePath } from '../eventAdapter.js';
import { transitionCommitment } from './commitmentService.js';

/** Commitment is authoritative whenever a node has a commitment entityRef. */
export async function projectCommitmentsIntoEventDetail(
  repo: V2Repository,
  event: EventDetail,
  map: MindMap,
  today = new Date().toISOString().slice(0, 10),
): Promise<EventDetail> {
  const commitments = new Map((await repo.listCommitments()).map((item) => [item.id, item]));
  const mapNodes = new Map(map.nodes.map((node) => [node.id, node]));
  const nodes = event.nodes.map((node) => {
    const ref = mapNodes.get(node.id)?.entityRefs?.find((item) => item.type === 'commitment');
    const commitment = ref ? commitments.get(ref.id) : undefined;
    if (!commitment) return node; // legacy taskId/execution remains the fallback
    return {
      ...node,
      execution: {
        taskId: commitment.id,
        status: commitment.state === 'completed' ? 'done' as const : 'todo' as const,
        // `today` is the date whose Event/Today projection is being built.
        // Keep that schedule stable after completion; `completedAt` records
        // when work finished, not which Today's list owns the task.
        scheduledDate: commitment.dueAt?.slice(0, 10) ?? today,
        deadline: commitment.dueAt?.slice(0, 10),
        priority: importanceToPriority(commitment.importance),
        completedAt: commitment.completedAt,
      },
    };
  });
  const executable = nodes.filter((node) => node.execution);
  const done = executable.filter((node) => node.execution?.status === 'done').length;
  return {
    ...event,
    nodes,
    progress: { done, total: executable.length },
    status: executable.length > 0 && done === executable.length ? 'completed' : 'active',
  };
}

export async function listCommitmentTodayItems(
  repo: V2Repository,
  date: string,
  events: Array<{ detail: EventDetail; map: MindMap }>,
  context?: EventContext,
): Promise<TodayItem[]> {
  const commitments = new Map((await repo.listCommitments()).map((item) => [item.id, item]));
  const seen = new Set<string>();
  const items: TodayItem[] = [];
  for (const { detail, map } of events) {
    if (context && detail.context !== context) continue;
    const nodeTexts = Object.fromEntries(map.nodes.map((node) => [node.id, node.text]));
    for (const node of map.nodes) {
      const ref = node.entityRefs?.find((item) => item.type === 'commitment');
      if (!ref || seen.has(ref.id)) continue;
      const commitment = commitments.get(ref.id);
      // The Event projection is the scheduling surface for a Commitment
      // without an explicit due date. Once it is completed, preserve that
      // projected date instead of replacing it with the wall-clock
      // completion date: a task completed late must remain visible in the
      // Today view where it was scheduled, marked done.
      const scheduledDate = detail.nodes.find((item) => item.id === node.id)?.execution?.scheduledDate;
      if (!commitment || !isCommitmentOnDate(commitment, date, scheduledDate)) continue;
      seen.add(ref.id);
      items.push({
        kind: 'event-node',
        id: `event-node:${detail.id}:${node.id}`,
        eventId: detail.id,
        mindmapId: map.id,
        spaceId: map.spaceId,
        nodeId: node.id,
        taskId: commitment.id,
        title: commitment.title,
        status: commitment.state === 'completed' ? 'done' : 'todo',
        scheduledDate: date,
        eventTitle: detail.title,
        path: buildNodePath(map.rootId, map.edges, node.id, nodeTexts),
        effectiveTags: detail.effectiveTags,
        deadline: commitment.dueAt?.slice(0, 10),
        priority: importanceToPriority(commitment.importance),
      });
    }
  }
  return items;
}

export async function completeCommitmentTodayItem(
  repo: V2Repository,
  commitmentId: string,
): Promise<{ completed: boolean; alreadyDone: boolean; completedAt?: string }> {
  const current = await repo.getCommitment(commitmentId);
  if (!current) throw Object.assign(new Error('Commitment not found.'), { code: 'not_found' });
  if (current.state === 'completed') return { completed: false, alreadyDone: true, completedAt: current.completedAt };
  const updated = await transitionCommitment(repo, commitmentId, 'completed', { reason: 'today_complete' });
  return { completed: true, alreadyDone: false, completedAt: updated.completedAt };
}

function isCommitmentOnDate(
  commitment: Awaited<ReturnType<V2Repository['listCommitments']>>[number],
  date: string,
  scheduledDate?: string,
): boolean {
  if (commitment.state === 'waiting' || commitment.state === 'cancelled' || commitment.state === 'archived' || commitment.state === 'someday') return false;
  if (commitment.state === 'completed') {
    return scheduledDate === date || (!scheduledDate && commitment.completedAt?.slice(0, 10) === date);
  }
  if (commitment.dueAt) return commitment.dueAt.slice(0, 10) <= date;
  // AI-accepted task nodes become active Commitments and are immediately
  // actionable; they enter Today until scheduled/completed.
  return commitment.state === 'active' || commitment.state === 'planned' || commitment.state === 'inbox';
}

function importanceToPriority(importance?: string): 'high' | 'medium' | 'low' | undefined {
  if (importance === 'critical' || importance === 'high') return 'high';
  if (importance === 'normal') return 'medium';
  if (importance === 'low') return 'low';
  return undefined;
}
