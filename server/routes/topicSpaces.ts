/**
 * Topic Space REST routes.
 *
 *   GET    /api/topic-spaces                       — list (optional `?context=` filter)
 *   GET    /api/topic-spaces/:id                   — fetch one
 *   GET    /api/topic-spaces/:id/tasks             — cross-date task source (Phase 3)
 *   POST   /api/topic-spaces                       — create (auto-creates a MindMap)
 *   PUT    /api/topic-spaces/:id                   — partial update
 *   DELETE /api/topic-spaces/:id                   — delete (keeps the MindMap)
 *   POST   /api/topic-spaces/:id/reorder           — adjust order within a context
 *
 * See `docs/topic-spaces/SPEC.md` §3.1 for the contract.
 */
import { Router } from 'express';
import {
  createTopicSpace,
  deleteTopicSpace,
  getTopicSpace,
  listTopicSpaces,
  reorderTopicSpaces,
  updateTopicSpace,
} from '../services/topicSpaces.js';
import { resolveTasksWithDates } from '../services/taskIndex.js';
import { getMindMap } from '../services/mindmaps.js';
import type { TopicSpaceContext, TopicSpaceUpdate } from '../types/topicSpace.js';

const router = Router();

function isContext(value: unknown): value is TopicSpaceContext {
  return value === 'work' || value === 'life' || value === 'unclassified';
}

router.get('/', async (req, res) => {
  try {
    const contextParam = req.query.context;
    const context: TopicSpaceContext | undefined = isContext(contextParam) ? contextParam : undefined;
    const query = typeof req.query.query === 'string' ? req.query.query : undefined;
    const spaces = await listTopicSpaces({ context, query });
    res.json(spaces);
  } catch (error: any) {
    console.error('[topic-spaces] list error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const space = await getTopicSpace(req.params.id);
    if (!space) return res.status(404).json({ error: 'Topic space not found' });
    res.json(space);
  } catch (error: any) {
    console.error('[topic-spaces] get error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/topic-spaces/:id/tasks — cross-date task source.
 *
 * Returns the space's tasks across ALL daily notes (not just the
 * currently-selected date). Each entry is `{ task, date }` so the
 * client can navigate to the right day when the user opens a task.
 *
 * Orphan ids (in `space.taskIds` but missing from every daily note)
 * are dropped from the response — the caller can diff the count to
 * detect orphans and trigger reconciliation. This replaces the old
 * "filter today's tasks by spaceId" behavior that silently lost any
 * task not on the current date.
 */
router.get('/:id/tasks', async (req, res) => {
  try {
    const space = await getTopicSpace(req.params.id);
    if (!space) return res.status(404).json({ error: 'Topic space not found' });
    const items = await resolveTasksWithDates(space.taskIds);
    const map = space.mindmapId ? await getMindMap(space.mindmapId) : null;
    const nodeByTaskId = new Map(
      map?.nodes.filter(node => node.taskId).map(node => [node.taskId!, node]) ?? [],
    );
    const parentNodeByChild = new Map(map?.edges.map(edge => [edge.target, edge.source]) ?? []);
    const nodeById = new Map(map?.nodes.map(node => [node.id, node]) ?? []);
    const enriched = items.map((item) => {
      const node = nodeByTaskId.get(item.task.id);
      const parentNode = node ? nodeById.get(parentNodeByChild.get(node.id) ?? '') : undefined;
      return {
        ...item,
        task: {
          ...item.task,
          planOrder: node?.planOrder,
          parentTaskId: parentNode?.taskId,
        },
      };
    });
    enriched.sort((a, b) =>
      (a.task.planOrder ?? Number.MAX_SAFE_INTEGER) - (b.task.planOrder ?? Number.MAX_SAFE_INTEGER) ||
      a.date.localeCompare(b.date) ||
      a.task.title.localeCompare(b.task.title),
    );
    res.json({ spaceId: space.id, items: enriched });
  } catch (error: any) {
    console.error('[topic-spaces] get-tasks error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { title } = req.body ?? {};
    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: 'title is required' });
    }
    // Never allow the client to dictate the space id.
    delete req.body.id;
    const space = await createTopicSpace(req.body);
    res.status(201).json(space);
  } catch (error: any) {
    console.error('[topic-spaces] create error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updates: TopicSpaceUpdate = { ...(req.body ?? {}) };
    // id is path-owned, never client-controlled.
    delete (updates as any).id;
    const space = await updateTopicSpace(req.params.id, updates);
    if (!space) return res.status(404).json({ error: 'Topic space not found' });
    res.json(space);
  } catch (error: any) {
    console.error('[topic-spaces] update error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const ok = await deleteTopicSpace(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Topic space not found' });
    res.status(204).send();
  } catch (error: any) {
    console.error('[topic-spaces] delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/reorder', async (req, res) => {
  try {
    const { context, orderedIds } = req.body ?? {};
    if (!isContext(context)) {
      return res.status(400).json({ error: 'context must be one of work|life|unclassified' });
    }
    if (!Array.isArray(orderedIds) || !orderedIds.every((id) => typeof id === 'string')) {
      return res.status(400).json({ error: 'orderedIds must be a string array' });
    }
    const updated = await reorderTopicSpaces(context, orderedIds);
    res.json({ context, spaces: updated });
  } catch (error: any) {
    console.error('[topic-spaces] reorder error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
