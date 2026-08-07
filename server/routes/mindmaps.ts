/**
 * Mind map REST routes.
 *
 *   GET    /api/mindmaps                            — list maps (newest first)
 *   POST   /api/mindmaps                            — create a new map (optional body)
 *   GET    /api/mindmaps/:id                        — fetch one map
 *   PUT    /api/mindmaps/:id                        — partial update (auto-bumps to v2)
 *   DELETE /api/mindmaps/:id                        — delete
 *   POST   /api/mindmaps/:id/nodes/:nodeId/promote-to-task  — Phase 2 stub
 *   POST   /api/mindmaps/:id/nodes/:nodeId/link-task       — Phase 2 stub
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
    // Per SPEC §3.3: any PUT auto-bumps the schema version to v2 and
    // defaults `kind: 'branch'` on any node missing one. The service
    // does that work; here we just pass the patch through.
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

// TODO(topic-spaces/phase-2): implement node → task promotion. The
// stub returns 501 so the UI can wire its "转为待办" affordance ahead
// of the real backend.
router.post('/:id/nodes/:nodeId/promote-to-task', async (_req, res) => {
  res.status(501).json({
    error: 'Not implemented',
    code: 'PHASE_2_STUB',
    message: 'promote-to-task will be implemented in topic-spaces phase 2',
  });
});

// TODO(topic-spaces/phase-2): implement node ↔ existing task binding.
router.post('/:id/nodes/:nodeId/link-task', async (_req, res) => {
  res.status(501).json({
    error: 'Not implemented',
    code: 'PHASE_2_STUB',
    message: 'link-task will be implemented in topic-spaces phase 2',
  });
});

export default router;
