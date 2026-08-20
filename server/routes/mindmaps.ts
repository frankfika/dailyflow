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
 *   PUT    /api/mindmaps/:id/nodes/:nodeId/kind                — classify a node as tag/branch
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
  addTaskIdToTopicSpace,
  findTopicSpaceByTaskId,
  removeTaskIdFromTopicSpace,
} from '../services/topicSpaces.js';
import { readDailyNote, writeDailyNote } from '../services/fileSystem.js';
import { appendTaskToMarkdown, parseMarkdown, removeTaskFromMarkdown } from '../services/parser.js';
import { setOriginMarkers, setSpaceMarker } from '../services/taskMetadata.js';
import { withDateLock } from '../services/lock.js';
import { loadConfig } from '../services/config.js';
import { invalidateTaskIndex, resolveTaskDate } from '../services/taskIndex.js';
import type { Task } from '../types/task.js';
import type { MindMap, MindMapNodeKind } from '../types/mindmap.js';

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
 * Kind values the right-click menu may write via `PUT .../kind`.
 *
 * Root and branch are excluded by design:
 *   - `root`  — the map's anchor; never re-classified (NodeContextMenu
 *               hides the menu for it, this set is the second line of
 *               defense).
 *   - `branch`— the implicit default; writing it back is a no-op so
 *               the menu doesn't offer a duplicate "unclassify" entry
 *               (Unclassify is reserved for nodes coming from task/tag).
 *
 * Sprint 1 / Gap 1: `question`, `resource`, `risk` join `tag` as
 * label-only roles with no linked task; they share the same write
 * semantics (no taskId/taskDate side-effects), only differ in color
 * and the dedicated menu entry.
 */
const MUTABLE_NODE_KINDS = new Set<MindMapNodeKind>([
  'branch',
  'tag',
  'question',
  'resource',
  'risk',
]);

router.put('/:id/nodes/:nodeId/kind', async (req, res) => {
  try {
    const { id: mindmapId, nodeId } = req.params;
    const body = (req.body ?? {}) as { kind?: MindMapNodeKind; tag?: string };
    if (!body.kind || !MUTABLE_NODE_KINDS.has(body.kind)) {
      return res.status(400).json({
        error: "kind must be one of 'branch' | 'tag' | 'question' | 'resource' | 'risk'",
      });
    }

    const map = await getMindMap(mindmapId);
    if (!map) return res.status(404).json({ error: 'Mind map not found' });
    const node = map.nodes.find(n => n.id === nodeId);
    if (!node) return res.status(404).json({ error: 'Node not found' });
    if (node.id === map.rootId || node.kind === 'root') {
      return res.status(400).json({ error: 'Root node cannot be reclassified' });
    }

    // Only `kind: 'tag'` carries a label payload. The new Phase-2
    // kinds (question / resource / risk) are visually distinguished
    // but still carry the node's text as their content, so no extra
    // body field is needed for them.
    const tag = body.kind === 'tag'
      ? (typeof body.tag === 'string' ? body.tag.trim() : '') || node.text.trim()
      : undefined;
    if (body.kind === 'tag' && !tag) {
      return res.status(400).json({ error: 'Tag label cannot be empty' });
    }

    const updated = await updateNodeInMindMap(mindmapId, nodeId, {
      kind: body.kind,
      tag,
      // Switching to a label-only kind always severs the task back-link;
      // switching from task to task on the same node never reaches this
      // path (the `link-task` route handles that).
      taskId: undefined,
      taskDate: undefined,
    });
    if (!updated) return res.status(404).json({ error: 'Mind map or node not found' });
    res.json(updated);
  } catch (error: any) {
    console.error('[mindmaps] update node kind error:', error);
    res.status(error?.status ?? 500).json({ error: error.message });
  }
});

/**
 * Delete a node subtree while applying an explicit policy to linked Tasks.
 * `keep-tasks` detaches every Task and removes it from the Topic Space;
 * `delete-tasks` removes the Task markdown rows as well.
 */
router.post('/:id/nodes/delete', async (req, res) => {
  try {
    const map = await getMindMap(req.params.id);
    if (!map) return res.status(404).json({ error: 'Mind map not found' });
    const { nodeId, taskPolicy } = (req.body ?? {}) as {
      nodeId?: string;
      taskPolicy?: 'keep-tasks' | 'delete-tasks';
    };
    if (!nodeId || !map.nodes.some(node => node.id === nodeId)) {
      return res.status(404).json({ error: 'Node not found' });
    }
    if (nodeId === map.rootId) return res.status(400).json({ error: 'Root node cannot be deleted' });
    if (taskPolicy !== 'keep-tasks' && taskPolicy !== 'delete-tasks') {
      return res.status(400).json({ error: 'taskPolicy is required' });
    }

    const removeIds = new Set<string>([nodeId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const edge of map.edges) {
        if (removeIds.has(edge.source) && !removeIds.has(edge.target)) {
          removeIds.add(edge.target);
          changed = true;
        }
      }
    }
    const linkedNodes = map.nodes.filter(node => removeIds.has(node.id) && node.taskId);
    const config = await loadConfig();
    for (const node of linkedNodes) {
      const taskId = node.taskId!;
      const date = node.taskDate ?? await resolveTaskDate(taskId);
      if (date) {
        await withDateLock(date, async () => {
          const note = await readDailyNote(date, config);
          if (!note) return;
          const task = note.tasks.find(item => item.id === taskId);
          if (!task || task.line === undefined) return;
          if (taskPolicy === 'delete-tasks') {
            await writeDailyNote(date, removeTaskFromMarkdown(note.content, task.line), config);
          } else {
            const lines = note.content.split('\n');
            lines[task.line] = setSpaceMarker(setOriginMarkers(lines[task.line], null), null);
            await writeDailyNote(date, lines.join('\n'), config);
          }
        });
      }
      const owningSpace = await findTopicSpaceByTaskId(taskId);
      if (owningSpace) await removeTaskIdFromTopicSpace(owningSpace.id, taskId);
    }

    const updated = await updateMindMap(map.id, {
      nodes: map.nodes.filter(node => !removeIds.has(node.id)),
      edges: map.edges.filter(edge => !removeIds.has(edge.source) && !removeIds.has(edge.target)),
    });
    invalidateTaskIndex();
    res.json({ mindmap: updated, affectedTaskIds: linkedNodes.map(node => node.taskId) });
  } catch (error: any) {
    console.error('[mindmaps] delete node subtree error:', error);
    res.status(error?.status ?? 500).json({ error: error.message });
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

function planOrderForNode(map: MindMap, nodeId: string): number {
  const parentId = map.edges.find(edge => edge.target === nodeId)?.source;
  if (!parentId) return 0;
  const childIds = new Set(map.edges.filter(edge => edge.source === parentId).map(edge => edge.target));
  const siblings = map.nodes
    .filter(node => childIds.has(node.id))
    .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
  return Math.max(0, siblings.findIndex(node => node.id === nodeId));
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
    const userTags = [...(node.tags ?? []), ...extractUserTags(node.text)];
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
      taskDate: date,
      planOrder: planOrderForNode(map, nodeId),
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

    // A new task joined the workspace (and the daily-note line was
    // written) — the cross-date index must drop its memo so the next
    // lookup picks up the new id.
    invalidateTaskIndex();

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
    if (node.id === map.rootId || node.kind === 'root') {
      return res.status(400).json({ error: 'Root node cannot be linked to a task' });
    }

    // Verify the task exists on the named date.
    const task = await withDateLock(body.date, async () => {
      const note = await readDailyNote(body.date!, config);
      if (!note) {
        throw Object.assign(new Error(`Daily note for ${body.date} not found`), { status: 404 });
      }
      const tasks = parseMarkdown(note.content);
      const found = tasks.find(t => t.id === body.taskId);
      if (!found || found.line === undefined) {
        throw Object.assign(new Error(`Task ${body.taskId} not found on ${body.date}`), { status: 404 });
      }
      if (
        found.originMindmapId &&
        found.originNodeId &&
        (found.originMindmapId !== mindmapId || found.originNodeId !== nodeId)
      ) {
        throw Object.assign(new Error('Task is already linked to another mind-map node'), { status: 409 });
      }
      const lines = note.content.split('\n');
      const originalLine = lines[found.line];
      const withOrigin = setOriginMarkers(originalLine, mindmapId, nodeId);
      const nextLine = setSpaceMarker(withOrigin, map.spaceId ?? null);
      if (nextLine !== originalLine) {
        lines[found.line] = nextLine;
        await writeDailyNote(body.date!, lines.join('\n'), config);
      }
      return { ...found, originMindmapId: mindmapId, originNodeId: nodeId };
    });

    // Sync the node text from the live task title so a rename on
    // the daily-note side is picked up on the next paint.
    const updatedMap = await updateNodeInMindMap(mindmapId, nodeId, {
      kind: 'task',
      taskId: task.id,
      taskDate: body.date,
      planOrder: planOrderForNode(map, nodeId),
      text: task.title,
    });
    if (!updatedMap) {
      return res.status(500).json({ error: 'Failed to update node' });
    }

    // Register the taskId on the owning TopicSpace (idempotent), and
    // remove a stale ownership entry if this task is moving between
    // spaces as part of the link.
    const previousSpace = await findTopicSpaceByTaskId(task.id);
    let topicSpace = null;
    if (updatedMap.spaceId) {
      topicSpace = await addTaskIdToTopicSpace(updatedMap.spaceId, task.id);
    }
    if (previousSpace && previousSpace.id !== updatedMap.spaceId) {
      await removeTaskIdFromTopicSpace(previousSpace.id, task.id);
    }

    // The task line was rewritten (title synced); drop the memoized
    // index so the next read reflects the new title.
    invalidateTaskIndex();

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
