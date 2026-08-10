import { Router, json as expressJson } from 'express';
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
import { createTopicSpace } from '../services/topicSpaces.js';
import type { EventContext } from '../types/event.js';

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
    const result = await createTaskForNode({
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
    });
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
    const result = await editNodeTask({
      taskId: b.taskId,
      scheduledDate: b.scheduledDate,
      updates: {
        title: typeof u.title === 'string' ? u.title : undefined,
        description: typeof u.description === 'string' ? u.description : undefined,
        comment: typeof u.comment === 'string' ? u.comment : undefined,
        comments: Array.isArray(u.comments) ? u.comments : undefined,
        tags: Array.isArray(u.tags) ? u.tags.filter((x: any) => typeof x === 'string') as string[] : undefined,
        deadline: typeof u.deadline === 'string' ? u.deadline : undefined,
        priority: (u.priority === 'high' || u.priority === 'medium' || u.priority === 'low') ? u.priority : undefined,
        project: typeof u.project === 'string' ? u.project : undefined,
      },
    });
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
 * Returns: { completed, alreadyDone }
 */
router.post('/actions/complete-node-task', async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.taskId || !b.scheduledDate) {
      return res.status(400).json({ error: 'Required fields missing: taskId, scheduledDate' });
    }
    const result = await completeNodeTask({ taskId: b.taskId, scheduledDate: b.scheduledDate });
    res.json(result);
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
    const result = await undoCompleteNodeTask({ taskId: b.taskId, scheduledDate: b.scheduledDate });
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
router.post('/actions/convert-standalone-to-event-node-task', async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.taskId || !b.scheduledDate || !b.mindmapId || !b.nodeId) {
      return res.status(400).json({
        error: 'Required fields missing: taskId, scheduledDate, mindmapId, nodeId',
      });
    }
    const result = await convertStandaloneToEventNodeTask({
      taskId: b.taskId,
      scheduledDate: b.scheduledDate,
      mindmapId: b.mindmapId,
      nodeId: b.nodeId,
    });
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
    const result = await undoConvertStandaloneToEventNodeTask({
      taskId: b.taskId,
      scheduledDate: b.scheduledDate,
    });
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
    res.json(await unscheduleNodeTask({
      taskId: b.taskId,
      scheduledDate: b.scheduledDate,
      mindmapId: b.mindmapId,
      nodeId: b.nodeId,
    }));
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
    res.json(await rescheduleNodeTask({
      taskId: b.taskId,
      fromDate: b.fromDate,
      toDate: b.toDate,
      mindmapId: b.mindmapId,
      nodeId: b.nodeId,
    }));
  } catch (error: any) {
    console.error('[events] reschedule error:', error);
    res.status(error?.status ?? 500).json({ error: error.message });
  }
});

export default router;
