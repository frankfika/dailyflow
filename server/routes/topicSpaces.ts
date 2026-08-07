/**
 * Topic Space REST routes.
 *
 *   GET    /api/topic-spaces                       — list (optional `?context=` filter)
 *   GET    /api/topic-spaces/:id                   — fetch one
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

router.post('/:id/reorder', async (req, res) => {
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
