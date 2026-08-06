/**
 * Mind map REST routes.
 *
 *   GET    /api/mindmaps          — list maps (newest first)
 *   POST   /api/mindmaps          — create a new map (optional body)
 *   GET    /api/mindmaps/:id      — fetch one map
 *   PUT    /api/mindmaps/:id      — partial update
 *   DELETE /api/mindmaps/:id      — delete
 */
import { Router } from 'express';
import {
  listMindMaps,
  getMindMap,
  createMindMap,
  updateMindMap,
  deleteMindMap,
} from '../services/mindmaps.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const maps = await listMindMaps();
    res.json(maps);
  } catch (error: any) {
    console.error('[mindmaps] list error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const map = await createMindMap(req.body ?? {});
    res.status(201).json(map);
  } catch (error: any) {
    console.error('[mindmaps] create error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const map = await getMindMap(req.params.id);
    if (!map) return res.status(404).json({ error: 'Mind map not found' });
    res.json(map);
  } catch (error: any) {
    console.error('[mindmaps] get error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const map = await updateMindMap(req.params.id, req.body ?? {});
    if (!map) return res.status(404).json({ error: 'Mind map not found' });
    res.json(map);
  } catch (error: any) {
    console.error('[mindmaps] update error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const ok = await deleteMindMap(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Mind map not found' });
    res.status(204).send();
  } catch (error: any) {
    console.error('[mindmaps] delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
