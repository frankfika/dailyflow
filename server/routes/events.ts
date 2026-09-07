import { Router, json as expressJson } from 'express';
import { withDateLock, withDateLocks } from '../services/lock.js';
import {
  listEvents as svcListEvents,
  getEventById,
  listTodayItems as svcListToday,
  listStandaloneTasks as svcListStandalone,
} from '../services/eventQueryService.js';
import {
  createTaskForNode,
  editNodeTask,
  completeNodeTask,
  undoCompleteNodeTask,
  convertStandaloneToEventNodeTask,
  undoConvertStandaloneToEventNodeTask,
  unscheduleNodeTask,
  rescheduleNodeTask,
} from '../services/eventExecutionService.js';
import { createTopicSpace, deleteTopicSpace } from '../services/topicSpaces.js';
import { convertStandaloneTaskToEventNode } from '../services/taskEventConversion.js';
import { getMindMap, updateMindMap } from '../services/mindmaps.js';
import { randomUUID } from 'node:crypto';
import type { EventContext } from '../types/event.js';
// Sprint 1 Gap 7: mirror v1 task completion back to the linked mindmap node.
import { bootstrapV2 } from '../services/v2/workspaceContext.js';
import {
  mirrorTaskCompletionToMindmap,
  type MirrorResult,
} from '../services/v2/taskCompletionMirror.js';
import { completeCommitmentTodayItem } from '../services/v2/eventCommitmentProjection.js';

/**
 * Best-effort v1 mirror hook. The v1 events router has no V2Repository
 * bound to res.locals, so we bootstrap one lazily. Any failure is
 * swallowed and logged — task completion must NEVER be blocked by a
 * mirror failure (see ROADSHOW_VS_PRODUCT_GAP.md "缺口 7").
 */
async function mirrorV1TaskCompletion(taskId: string, taskDate: string): Promise<MirrorResult | null> {
  let b;
  try {
    b = await bootstrapV2({
      workspaceRoot: process.env.DAILYFLOW_V2_WORKSPACE_ROOT || undefined,
      workspaceId: process.env.DAILYFLOW_V2_WORKSPACE_ID || undefined,
    });
  } catch (err) {
    console.warn('[events/complete-node-task] v2 bootstrap for mirror failed (non-blocking):', err);
    return null;
  }
  try {
    return await mirrorTaskCompletionToMindmap(b.repo, {
      taskId,
      taskDate,
      completedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[events/complete-node-task] mindmap mirror failed (non-blocking):', err);
    return null;
  }
}

const router = Router();

// Body parsing for all POST/PUT/PATCH routes mounted under /api/events.
router.use(expressJson({ limit: '4mb' }));

function isEventContext(v: unknown): v is EventContext {
  return v === 'work' || v === 'life';
}

/**
 * GET /api/events
 * Query params (all optional): none yet. Future: ?context=work|life
 * Returns: EventSummary[]
 */
router.get('/', async (req, res) => {
  try {
    const events = await svcListEvents();
    res.json(events);
  } catch (error: any) {
    console.error('[events] list error:', error);
    const status = error?.status ?? 500;
    res.status(status).json({ error: error.message });
  }
});

/**
 * GET /api/events/today-items
 * Query params: date (YYYY-MM-DD, required), context (work|life, optional)
 * Returns TodayItem[]
 */
router.get('/today-items', async (req, res) => {
  try {
    const date = typeof req.query.date === 'string' ? req.query.date : undefined;
    if (!date) {
      return res.status(400).json({ error: 'date query param is required (YYYY-MM-DD)' });
    }
    const contextRaw = req.query.context;
    const context = isEventContext(contextRaw) ? contextRaw : undefined;
    const items = await svcListToday(date, context);
    res.json(items);
  } catch (error: any) {
    console.error('[events] today-items error:', error);
    const status = error?.status ?? 500;
    res.status(status).json({ error: error.message });
  }
});

/**
 * GET /api/events/standalone-tasks
 * Query params: date (required), context (optional)
 * Returns StandaloneTask[]
 */
router.get('/standalone-tasks', async (req, res) => {
  try {
    const date = typeof req.query.date === 'string' ? req.query.date : undefined;
    if (!date) {
      return res.status(400).json({ error: 'date query param is required (YYYY-MM-DD)' });
    }
    const contextRaw = req.query.context;
    const context = isEventContext(contextRaw) ? contextRaw : undefined;
    const tasks = await svcListStandalone(date, context);
    res.json(tasks);
  } catch (error: any) {
    console.error('[events] standalone-tasks error:', error);
    const status = error?.status ?? 500;
    res.status(status).json({ error: error.message });
  }
});

/** Create the compatibility TopicSpace + dominant map, exposed as one Event. */
router.post('/', async (req, res) => {
  try {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    if (!title) return res.status(400).json({ error: 'title is required' });
    const context = isEventContext(req.body?.context) ? req.body.context : 'work';
    const space = await createTopicSpace({ title, context });
    const detail = await getEventById(space.id);
    if (!detail) return res.status(500).json({ error: 'Event was created but could not be read' });
    res.status(201).json(detail);
  } catch (error: any) {
    console.error('[events] create error:', error);
    res.status(error?.status ?? 500).json({ error: error.message });
  }
});

/**
 * GET /api/events/:id
 *
 * EFP-005 public eventId lookup. Resolves via:
 *   spaceId → space file, or mindmapId → related space file, or 404.
 * Query params: ?scanFrom=&scanTo=
 */
router.get('/:id', async (req, res) => {
  try {
    const scanFrom = typeof req.query.scanFrom === 'string' ? req.query.scanFrom : undefined;
    const scanTo = typeof req.query.scanTo === 'string' ? req.query.scanTo : undefined;
    const detail = await getEventById(req.params.id, undefined, scanFrom, scanTo);
    if (!detail) {
      return res.status(404).json({ error: 'Event not found' });
    }
    res.json(detail);
  } catch (error: any) {
    console.error('[events] detail-by-id error:', error);
    const status = error?.status ?? 500;
    res.status(status).json({ error: error.message });
  }
});

/**
 * POST /api/events/actions/create-task-for-node
 *
 * Body: { mindmapId, nodeId, title, scheduledDate, description?, manualTags?,
 *          deadline?, priority?, project?, existingTaskId?, workspaceRoot? }
 * Returns: { taskId, appended, alreadyPresent }
 */
router.post('/actions/create-task-for-node', async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.mindmapId || !b.nodeId || !b.title || !b.scheduledDate) {
      return res.status(400).json({
        error: 'Required fields missing: mindmapId, nodeId, title, scheduledDate',
      });
    }
    const result = await withDateLock(b.scheduledDate, () => createTaskForNode({
      workspaceRoot: typeof b.workspaceRoot === 'string' ? b.workspaceRoot : undefined,
      mindmapId: b.mindmapId,
      nodeId: b.nodeId,
      title: b.title,
      scheduledDate: b.scheduledDate,
      description: typeof b.description === 'string' ? b.description : undefined,
      manualTags: Array.isArray(b.manualTags) ? b.manualTags.filter((x: any) => typeof x === 'string') as string[] : undefined,
      deadline: typeof b.deadline === 'string' ? b.deadline : undefined,
      priority: (b.priority === 'high' || b.priority === 'medium' || b.priority === 'low') ? b.priority : undefined,
      project: typeof b.project === 'string' ? b.project : undefined,
      existingTaskId: typeof b.existingTaskId === 'string' ? b.existingTaskId : undefined,
    }));
    res.json(result);
  } catch (error: any) {
    console.error('[events] create-task-for-node error:', error);
    const status = error?.status ?? 500;
    res.status(status).json({ error: error.message });
  }
});

/**
 * POST /api/events/actions/edit-node-task
 *
 * Body: { taskId, scheduledDate, updates: { title?, description?, comment?,
 *       comments?, tags?, deadline?, priority?, project? } }
 * Returns: { updated, taskLine? }
 */
router.post('/actions/edit-node-task', async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.taskId || !b.scheduledDate || typeof b.updates !== 'object' || !b.updates) {
      return res.status(400).json({
        error: 'Required fields missing: taskId, scheduledDate, updates (object)',
      });
    }
    const u = b.updates;
    const result = await withDateLock(b.scheduledDate, () => editNodeTask({
      taskId: b.taskId,
      scheduledDate: b.scheduledDate,
      updates: {
        title: typeof u.title === 'string' ? u.title : undefined,
        description: typeof u.description === 'string' ? u.description : undefined,
        comment: typeof u.comment === 'string' ? u.comment : undefined,
        comments: Array.isArray(u.comments) ? u.comments : undefined,
        tags: Array.isArray(u.tags) ? u.tags.filter((x: any) => typeof x === 'string') as string[] : undefined,
        deadline: typeof u.deadline === 'string' ? u.deadline : undefined,
        priority: (u.priority === '' || u.priority === 'high' || u.priority === 'medium' || u.priority === 'low') ? u.priority : undefined,
        project: typeof u.project === 'string' ? u.project : undefined,
      },
    }));
    res.json(result);
  } catch (error: any) {
    console.error('[events] edit-node-task error:', error);
    const status = error?.status ?? 500;
    res.status(status).json({ error: error.message });
  }
});

/**
 * POST /api/events/actions/complete-node-task
 * Body: { taskId, scheduledDate }
 * Returns: { completed, alreadyDone, mirror? }
 */
router.post('/actions/complete-node-task', async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.taskId || !b.scheduledDate) {
      return res.status(400).json({ error: 'Required fields missing: taskId, scheduledDate' });
    }
    if (typeof b.taskId === 'string' && b.taskId.startsWith('com_')) {
      const { repo } = await bootstrapV2();
      const result = await completeCommitmentTodayItem(repo, b.taskId);
      const mirror = result.completed
        ? await mirrorTaskCompletionToMindmap(repo, { taskId: b.taskId, taskDate: b.scheduledDate, completedAt: result.completedAt ?? new Date().toISOString() })
        : null;
      res.json({ ...result, mirror });
      return;
    }
    const result = await withDateLock(b.scheduledDate, () => completeNodeTask({ taskId: b.taskId, scheduledDate: b.scheduledDate }));

    // Sprint 1 Gap 7: mirror the completion back to the linked mindmap
    // node. We only mirror when the checkbox actually flipped — a
    // double-call that returns alreadyDone=true should not re-stamp
    // the node, which is exactly the same idempotency the v2 hook
    // gets for free via the commit state machine.
    let mirror: MirrorResult | null = null;
    if (result.completed) {
      mirror = await mirrorV1TaskCompletion(b.taskId, b.scheduledDate);
    }

    res.json({ ...result, mirror });
  } catch (error: any) {
    console.error('[events] complete-node-task error:', error);
    const status = error?.status ?? 500;
    res.status(status).json({ error: error.message });
  }
});

/**
 * POST /api/events/actions/undo-complete-node-task
 * Body: { taskId, scheduledDate }
 * Returns: { undone, alreadyTodo }
 */
router.post('/actions/undo-complete-node-task', async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.taskId || !b.scheduledDate) {
      return res.status(400).json({ error: 'Required fields missing: taskId, scheduledDate' });
    }
    const result = await withDateLock(b.scheduledDate, () => undoCompleteNodeTask({ taskId: b.taskId, scheduledDate: b.scheduledDate }));
    res.json(result);
  } catch (error: any) {
    console.error('[events] undo-complete-node-task error:', error);
    const status = error?.status ?? 500;
    res.status(status).json({ error: error.message });
  }
});

/**
 * POST /api/events/actions/convert-standalone-to-event-node-task
 * Body: { taskId, scheduledDate, mindmapId, nodeId }
 * Returns: { converted, alreadyConverted, spaceLinked }
 */
/**
 * POST /api/events/actions/convert-task-to-event  (UX S7: 任务 → 转成项目)
 *
 * Body: { taskId, scheduledDate, title, context?, extraNodes?: string[] }
 * Creates a brand-new Event (TopicSpace + dominant mindmap), seeds child
 * nodes — the first carrying the converted task — then runs the audited
 * standalone→node-task conversion (with its 10-minute undo record).
 * Returns: { eventId, mindmapId, nodeId, conversionId, converted }
 */
router.post('/actions/convert-task-to-event', async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.taskId || !b.scheduledDate) {
      return res.status(400).json({ error: 'Required fields missing: taskId, scheduledDate' });
    }
    const title = typeof b.title === 'string' ? b.title.trim() : '';
    if (!title) return res.status(400).json({ error: 'title is required' });
    const context = isEventContext(b.context) ? b.context : 'work';
    const extraNodes: string[] = Array.isArray(b.extraNodes)
      ? b.extraNodes.filter((n: unknown) => typeof n === 'string' && n.trim()).map((n: string) => n.trim()).slice(0, 8)
      : [];

    const space = await createTopicSpace({ title, context });
    const detail = await getEventById(space.id);
    if (!detail) return res.status(500).json({ error: 'Event was created but could not be read' });

    const map = await getMindMap(detail.mindmapId);
    if (!map) return res.status(500).json({ error: 'Mindmap missing after event creation' });
    const root = map.nodes.find((node) => node.id === detail.rootNodeId) ?? map.nodes[0];
    if (!root) return res.status(500).json({ error: 'Mindmap has no root node' });

    const newNodeIds: string[] = [];
    const nodes = [...map.nodes];
    const edges = [...map.edges];
    const seedTexts = [title, ...extraNodes];
    seedTexts.forEach((text, index) => {
      const nodeId = `node_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
      newNodeIds.push(nodeId);
      nodes.push({
        id: nodeId,
        text,
        position: { x: root.position.x + 40 + index * 60, y: root.position.y + 140 + index * 90 },
        kind: 'branch',
      });
      edges.push({ id: `edge_${randomUUID().replace(/-/g, '').slice(0, 20)}`, source: root.id, target: nodeId });
    });
    const updated = await updateMindMap(map.id, { nodes, edges });
    if (!updated) return res.status(500).json({ error: 'Failed to seed project nodes' });

    // The first seeded node carries the original task via the audited
    // conversion pipeline (marker injection + undo record).
    const scheduledDate = String(b.scheduledDate);
    const conversion = await withDateLock(scheduledDate, () => convertStandaloneTaskToEventNode({
      taskId: String(b.taskId),
      scheduledDate,
      mindmapId: map.id,
      nodeId: newNodeIds[0],
    }));

    res.status(201).json({
      eventId: space.id,
      mindmapId: map.id,
      nodeId: newNodeIds[0],
      conversionId: conversion.conversionId,
      converted: conversion.converted || conversion.alreadyConverted,
    });
  } catch (error: any) {
    console.error('[events] convert-task-to-event error:', error);
    const status = error?.status ?? 500;
    res.status(status).json({ error: error.message });
  }
});

router.post('/actions/convert-standalone-to-event-node-task', async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.taskId || !b.scheduledDate || !b.mindmapId || !b.nodeId) {
      return res.status(400).json({
        error: 'Required fields missing: taskId, scheduledDate, mindmapId, nodeId',
      });
    }
    const result = await withDateLock(b.scheduledDate, () => convertStandaloneToEventNodeTask({
      taskId: b.taskId,
      scheduledDate: b.scheduledDate,
      mindmapId: b.mindmapId,
      nodeId: b.nodeId,
    }));
    res.json(result);
  } catch (error: any) {
    console.error('[events] convert-standalone error:', error);
    const status = error?.status ?? 500;
    res.status(status).json({ error: error.message });
  }
});

/**
 * POST /api/events/actions/undo-convert-standalone-to-event-node-task
 * Body: { taskId, scheduledDate }
 * Returns: { reverted, alreadyStandalone, removedFromSpace }
 */
router.post('/actions/undo-convert-standalone-to-event-node-task', async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.taskId || !b.scheduledDate) {
      return res.status(400).json({ error: 'Required fields missing: taskId, scheduledDate' });
    }
    const result = await withDateLock(b.scheduledDate, () => undoConvertStandaloneToEventNodeTask({
      taskId: b.taskId,
      scheduledDate: b.scheduledDate,
    }));
    res.json(result);
  } catch (error: any) {
    console.error('[events] undo-convert-standalone error:', error);
    const status = error?.status ?? 500;
    res.status(status).json({ error: error.message });
  }
});

router.post('/actions/unschedule-node-task', async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.taskId || !b.scheduledDate || !b.mindmapId || !b.nodeId) {
      return res.status(400).json({ error: 'Required fields missing: taskId, scheduledDate, mindmapId, nodeId' });
    }
    res.json(await withDateLock(b.scheduledDate, () => unscheduleNodeTask({
      taskId: b.taskId,
      scheduledDate: b.scheduledDate,
      mindmapId: b.mindmapId,
      nodeId: b.nodeId,
    })));
  } catch (error: any) {
    console.error('[events] unschedule error:', error);
    res.status(error?.status ?? 500).json({ error: error.message });
  }
});

router.post('/actions/reschedule-node-task', async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.taskId || !b.fromDate || !b.toDate || !b.mindmapId || !b.nodeId) {
      return res.status(400).json({ error: 'Required fields missing: taskId, fromDate, toDate, mindmapId, nodeId' });
    }
    res.json(await withDateLocks([b.fromDate, b.toDate], () => rescheduleNodeTask({
      taskId: b.taskId,
      fromDate: b.fromDate,
      toDate: b.toDate,
      mindmapId: b.mindmapId,
      nodeId: b.nodeId,
    })));
  } catch (error: any) {
    console.error('[events] reschedule error:', error);
    res.status(error?.status ?? 500).json({ error: error.message });
  }
});

/**
 * DELETE /api/events/:id
 *
 * EFP-005 delete counterpart. The event is stored as a TopicSpace
 * (work/life context) plus a dominant MindMap; deleting the event
 * removes the TopicSpace file and orphans the MindMap on disk for
 * now (SPEC §3.1: "mindmap 标 archived 不删"). Once the
 * MindMap type grows an `archived` flag we will also flip that here
 * so the orphan stops being discoverable.
 */
router.delete('/:id', async (req, res) => {
  try {
    const ok = await deleteTopicSpace(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Event not found' });
    res.status(204).send();
  } catch (error: any) {
    console.error('[events] delete error:', error);
    res.status(error?.status ?? 500).json({ error: error.message });
  }
});

export default router;
