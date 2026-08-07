/**
 * Topic Spaces diagnostics routes (Topic Spaces Phase 4).
 *
 *   GET    /api/diagnostics/broken-links    — list of every broken
 *                                            cross-reference in the
 *                                            workspace.
 *   GET    /api/diagnostics/summary         — top-line counts for the
 *                                            admin badge.
 *   POST   /api/diagnostics/repair-task-link — surgically fix a single
 *                                            broken link.
 *
 * The "repair-task-link" endpoint currently supports `action: 'unlink'`
 * which clears `kind` / `taskId` on the offending node. `action:
 * 'recreate'` returns 501 — recreating a deleted task is left to a
 * later phase.
 */
import { Router } from 'express';
import { findBrokenLinks, getDiagnosticsSummary } from '../services/diagnostics.js';
import {
  updateNodeInMindMap,
  getMindMap,
} from '../services/mindmaps.js';

const router = Router();

/**
 * GET /api/diagnostics/broken-links
 *
 * Response: `{ issues: BrokenLinkIssue[] }` (see `services/diagnostics.ts`).
 * The endpoint is safe to call repeatedly; it does not mutate state.
 */
router.get('/broken-links', async (_req, res) => {
  try {
    const issues = await findBrokenLinks();
    res.json({ issues });
  } catch (error: any) {
    console.error('[diagnostics] broken-links error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/diagnostics/summary
 *
 * Response: `{ topicSpaces, mindmaps, tasks, brokenLinks, orphanMindmaps }`.
 * All counts are non-negative integers.
 */
router.get('/summary', async (_req, res) => {
  try {
    const summary = await getDiagnosticsSummary();
    res.json(summary);
  } catch (error: any) {
    console.error('[diagnostics] summary error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/diagnostics/repair-task-link
 *
 * Body: `{ mindmapId, nodeId, action: 'unlink' | 'recreate' }`
 *
 *   - `unlink` clears `kind` and `taskId` on the node, demoting it
 *     back to a plain branch. Use this when a task was deleted but
 *     the mindmap node still claims a link.
 *   - `recreate` is reserved for a future phase and currently returns
 *     501.
 */
router.post('/repair-task-link', async (req, res) => {
  try {
    const { mindmapId, nodeId, action } = req.body ?? {};
    if (typeof mindmapId !== 'string' || !mindmapId) {
      return res.status(400).json({ error: 'mindmapId is required' });
    }
    if (typeof nodeId !== 'string' || !nodeId) {
      return res.status(400).json({ error: 'nodeId is required' });
    }
    if (action !== 'unlink' && action !== 'recreate') {
      return res.status(400).json({ error: "action must be 'unlink' or 'recreate'" });
    }

    if (action === 'recreate') {
      return res.status(501).json({
        error: 'Not implemented',
        code: 'REPAIR_RECREATE_TODO',
        message: 'recreate will be implemented in a later phase; use unlink for now',
      });
    }

    // Verify the map and node exist before we touch anything. This
    // gives a clean 404 instead of a silent no-op.
    const before = await getMindMap(mindmapId);
    if (!before) {
      return res.status(404).json({ error: 'Mind map not found' });
    }
    const target = before.nodes.find(n => n.id === nodeId);
    if (!target) {
      return res.status(404).json({ error: 'Node not found' });
    }

    const updated = await updateNodeInMindMap(mindmapId, nodeId, {
      kind: 'branch',
      taskId: undefined,
    });
    if (!updated) {
      return res.status(500).json({ error: 'Failed to update mind map' });
    }
    res.json({
      success: true,
      action,
      mindmap: updated,
    });
  } catch (error: any) {
    console.error('[diagnostics] repair error:', error);
    const status = error?.status ?? 500;
    res.status(status).json({ error: error.message });
  }
});

export default router;
