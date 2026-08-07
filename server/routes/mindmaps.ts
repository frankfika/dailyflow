/**
 * Mind map REST routes.
 *
 *   GET    /api/mindmaps                                       — list maps (newest first)
 *   POST   /api/mindmaps                                       — create a new map (optional body)
 *   GET    /api/mindmaps/:id                                   — fetch one map
 *   PUT    /api/mindmaps/:id                                   — partial update (auto-bumps to v2)
 *   DELETE /api/mindmaps/:id                                   — delete
 *   POST   /api/mindmaps/:id/nodes/:nodeId/promote-to-task    — turn a branch node into a new Task
 *   POST   /api/mindmaps/:id/nodes/:nodeId/link-task           — bind a branch node to an existing Task
 */
import { Router } from 'express';
import { ulid } from 'ulid';
import {
  listMindMaps,
  getMindMap,
  createMindMap,
  updateMindMap,
  deleteMindMap,
  updateNodeInMindMap,
  getInheritedTagsFromMap,
} from '../services/mindmaps.js';
import {
  getTopicSpace,
  addTaskIdToTopicSpace,
} from '../services/topicSpaces.js';
import { readDailyNote, writeDailyNote } from '../services/fileSystem.js';
import { appendTaskToMarkdown, parseMarkdown } from '../services/parser.js';
import { withDateLock } from '../services/lock.js';
import { loadConfig } from '../services/config.js';
import type { Task } from '../types/task.js';

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

/**
 * Helper: extract `#tag` tokens from a node's free-text label so the
 * newly-created task can carry them as user tags.
 *
 *   extractUserTags('准备BP #投资人 #waic') -> ['投资人', 'waic']
 *
 * We don't try to be clever about CJK ranges; the parser does the
 * heavy lifting on read. Here we just match `#<word>` greedily enough
 * to capture Chinese characters and hyphens.
 */
function extractUserTags(text: string): string[] {
  const matches = text.match(/#[A-Za-z0-9_\u4e00-\u9fa5-]+/g) || [];
  // Strip the leading '#' and de-dup (case-insensitive) while keeping
  // first-occurrence order.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of matches) {
    const tag = m.slice(1);
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

/**
 * POST /api/mindmaps/:id/nodes/:nodeId/promote-to-task
 *
 * Body: `{ date?: string, context?: 'work' | 'life' }`
 *
 * Creates a new Task in the requested (default = today) daily note
 * using the node's text as the title, attaches the node to the new
 * task (`kind: 'task'`, `taskId`), and records the task id on the
 * owning TopicSpace. `^id-` is the stable identifier; everything
 * else (tags from the node text, inherited tags from ancestor
 * `kind: 'tag'` nodes) is written by `appendTaskToMarkdown`.
 *
 * Status codes:
 *   201 — task created, node updated, space updated
 *   400 — body invalid / node not a branch / root
 *   404 — mindmap or node not found
 *   500 — unexpected
 */
router.post('/:id/nodes/:nodeId/promote-to-task', async (req, res) => {
  try {
    const { id: mindmapId, nodeId } = req.params;
    const body = (req.body ?? {}) as { date?: string; context?: 'work' | 'life' };
    const date = body.date || todayIso();

    if (body.context && body.context !== 'work' && body.context !== 'life') {
      return res.status(400).json({ error: "context must be 'work' or 'life'" });
    }

    const config = await loadConfig();
    const map = await getMindMap(mindmapId);
    if (!map) return res.status(404).json({ error: 'Mind map not found' });
    const node = map.nodes.find(n => n.id === nodeId);
    if (!node) return res.status(404).json({ error: 'Node not found' });
    if (node.kind === 'task') {
      return res.status(400).json({ error: 'Node is already a task' });
    }
    if (node.kind === 'tag') {
      return res.status(400).json({ error: 'Tag nodes cannot be promoted; create a child branch first' });
    }
    // root is `kind: 'root'`, branch is the default. We allow either
    // of those, but we never want a 'root' node to be promoted to a
    // task — the root is the topic's center of gravity. Reject that
    // case explicitly so the UI gets a clear signal.
    if (node.kind === 'root') {
      return res.status(400).json({ error: 'Root node cannot be promoted to a task' });
    }

    // 1. Pre-compute inherited tags (Topic Spaces Phase 3). If the
    //    node sits under any ancestor `kind: 'tag'` node, those
    //    labels flow down into the task's tag list.
    const inheritedTags = getInheritedTagsFromMap(map, node.id);
    const userTags = extractUserTags(node.text);
    // De-dup inherited vs user tags (case-insensitive, first wins).
    const seen = new Set<string>();
    const mergedTags: string[] = [];
    for (const t of [...userTags, ...inheritedTags]) {
      const key = t.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      mergedTags.push(t);
    }

    // 2. Build the Task. The id is generated up-front so we can
    //    write it into the node atomically with the markdown.
    const newTask: Task = {
      id: `t_${ulid()}`,
      title: node.text,
      status: 'todo',
      tags: mergedTags,
      spaceId: map.spaceId,
      originMindmapId: mindmapId,
      originNodeId: nodeId,
    };
    if (body.context) {
      // Surface the context on the task so the daily-note list view
      // can group it correctly. We don't write it to the markdown
      // line (it lives only in memory for now).
      (newTask as any).context = body.context;
    }

    // 3. Append the task to the daily note under the date lock.
    await withDateLock(date, async () => {
      const note = await readDailyNote(date, config);
      const original = note ? note.content : '';
      const next = appendTaskToMarkdown(original, newTask, date, { inheritedTags });
      await writeDailyNote(date, next, config);
    });

    // 4. Bind the node to the new task. This also writes the file.
    const updatedMap = await updateNodeInMindMap(mindmapId, nodeId, {
      kind: 'task',
      taskId: newTask.id,
    });
    if (!updatedMap) {
      return res.status(500).json({ error: 'Failed to update node after task creation' });
    }

    // 5. Record the taskId on the owning TopicSpace (if any). A map
    //    without a spaceId is allowed — the task is just unowned.
    let topicSpace = null;
    if (updatedMap.spaceId) {
      topicSpace = await addTaskIdToTopicSpace(updatedMap.spaceId, newTask.id);
    }

    res.status(201).json({
      task: newTask,
      node: updatedMap.nodes.find(n => n.id === nodeId) ?? null,
      mindmap: updatedMap,
      topicSpace,
    });
  } catch (error: any) {
    console.error('[mindmaps] promote-to-task error:', error);
    const status = error?.status ?? 500;
    res.status(status).json({ error: error.message });
  }
});

/**
 * POST /api/mindmaps/:id/nodes/:nodeId/link-task
 *
 * Body: `{ taskId: string, date: string }`
 *
 * Binds an existing task (identified by `taskId` and the `date` whose
 * daily note hosts it) to the node. The node's `kind` flips to
 * `'task'`, its `taskId` is set, and the node's `text` is synced to
 * the live task title (so a rename on the daily-note side is
 * reflected in the mindmap next time it's read).
 *
 * The `date` is required: the parser needs to know which file to
 * scan to find the task. (We deliberately don't scan every daily
 * note on disk — that would be O(dates) per click.)
 *
 * Status codes:
 *   200 — node updated, space updated
 *   400 — body missing required fields
 *   404 — mindmap, node, or task not found
 */
router.post('/:id/nodes/:nodeId/link-task', async (req, res) => {
  try {
    const { id: mindmapId, nodeId } = req.params;
    const body = (req.body ?? {}) as { taskId?: string; date?: string };

    if (typeof body.taskId !== 'string' || !body.taskId) {
      return res.status(400).json({ error: 'taskId is required' });
    }
    if (typeof body.date !== 'string' || !body.date) {
      return res.status(400).json({ error: 'date is required' });
    }

    const config = await loadConfig();
    const map = await getMindMap(mindmapId);
    if (!map) return res.status(404).json({ error: 'Mind map not found' });
    const node = map.nodes.find(n => n.id === nodeId);
    if (!node) return res.status(404).json({ error: 'Node not found' });

    // Verify the task exists on the named date.
    const note = await readDailyNote(body.date, config);
    if (!note) {
      return res.status(404).json({ error: `Daily note for ${body.date} not found` });
    }
    const tasks = parseMarkdown(note.content);
    const task = tasks.find(t => t.id === body.taskId);
    if (!task) {
      return res.status(404).json({ error: `Task ${body.taskId} not found on ${body.date}` });
    }

    // Sync the node text from the live task title so a rename on
    // the daily-note side is picked up on the next paint.
    const updatedMap = await updateNodeInMindMap(mindmapId, nodeId, {
      kind: 'task',
      taskId: task.id,
      text: task.title,
    });
    if (!updatedMap) {
      return res.status(500).json({ error: 'Failed to update node' });
    }

    // Register the taskId on the owning TopicSpace (idempotent).
    let topicSpace = null;
    if (updatedMap.spaceId) {
      topicSpace = await addTaskIdToTopicSpace(updatedMap.spaceId, task.id);
    }

    res.json({
      node: updatedMap.nodes.find(n => n.id === nodeId) ?? null,
      mindmap: updatedMap,
      topicSpace,
    });
  } catch (error: any) {
    console.error('[mindmaps] link-task error:', error);
    const status = error?.status ?? 500;
    res.status(status).json({ error: error.message });
  }
});

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default router;
