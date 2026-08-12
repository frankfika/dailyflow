/**
 * EFP-004 EventExecutionService — the ONLY write path for Event-derived
 * tasks. Any downstream route, hook, or UI handler that mutates a task
 * linked to an Event (or converts Standalone ↔ Event) MUST route through
 * the 6 functions exported below.
 *
 * Write guarantees (per Runbook §4.4 frozen contract):
 *   1. `createTaskForNode` appends to daily note with stable `^mm + ^node + ^id-`
 *      markers and calls addTaskIdToTopicSpace() — atomically.
 *   2. `editNodeTask` uses editTaskFullInMarkdown on the correct line and
 *      NEVER wipes existing markers.
 *   3. `completeNodeTask / undoCompleteNodeTask` use updateTaskInMarkdown
 *      (toggle [ ] ↔ [x]) on the matching line.
 *   4. `convertStandaloneToEventNodeTask` injects ^mm + ^node markers into an
 *      existing standalone task line and records the space.taskIds linkage.
 *   5. `undoConvertStandaloneToEventNodeTask` strips ^mm + ^node + ^space,
 *      keeps the stable ^id-, detaches the map node, and removes space.taskIds.
 *   6. All functions are idempotent. Calling them twice with identical args
 *      produces the same on-disk content as the first call.
 *
 * The 6 exported functions intentionally have LONG, readable names so future
 * code can grep them easily. No short aliases.
 */
import { randomUUID } from 'crypto';
import { loadConfig } from './config.js';
import { readDailyNote, writeDailyNote } from './fileSystem.js';
import type { Task } from '../types/task.js';
import {
  parseMarkdown,
  appendTaskToMarkdown,
  editTaskFullInMarkdown,
  updateTaskInMarkdown,
  removeTaskFromMarkdown,
} from './parser.js';
import {
  addTaskIdToTopicSpace,
  removeTaskIdFromTopicSpace,
  findTopicSpaceByTaskId,
  getTopicSpace,
} from './topicSpaces.js';
import { getMindMap, getInheritedTagsFromMap, updateMindMap } from './mindmaps.js';
import type { MindMapNode } from '../types/mindmap.js';
import { setOriginMarkers, setSpaceMarker, stripAllOriginMarkers } from './taskMetadata.js';
import type { Config } from '../types/task.js';
import { invalidateTaskIndex } from './taskIndex.js';

async function resolveConfig(configOverride?: Config): Promise<Config> {
  return configOverride ?? await loadConfig();
}

function genId(prefix: 't' | 'ev_node' = 't'): string {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

function findTaskByTaskId(tasks: Task[], id: string): Task | undefined {
  return tasks.find(t => t.id === id);
}

/**
 * Older Event APIs accepted a client-generated node id before the node was
 * persisted. Preserve that contract by materialising the missing node under
 * the root, so a Task marker can never point at a non-existent canvas node.
 */
async function getOrCreateLinkableNode(mindmapId: string, nodeId: string, title: string) {
  const map = await getMindMap(mindmapId);
  if (!map) throw Object.assign(new Error('Mind map not found'), { status: 404 });
  const existing = map.nodes.find(item => item.id === nodeId);
  if (existing) return { map, node: existing };

  const root = map.nodes.find(item => item.id === map.rootId);
  const siblingCount = map.edges.filter(edge => edge.source === map.rootId).length;
  const createdNode: MindMapNode = {
    id: nodeId,
    text: title,
    position: {
      x: (root?.position.x ?? 0) + 300,
      y: (root?.position.y ?? 0) + siblingCount * 104,
    },
    kind: 'branch' as const,
  };
  const updated = await updateMindMap(map.id, {
    nodes: [...map.nodes, createdNode],
    edges: [
      ...map.edges,
      {
        id: `edge_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
        source: map.rootId,
        target: nodeId,
      },
    ],
  });
  if (!updated) throw new Error('Mind map disappeared while creating node');
  return { map: updated, node: createdNode };
}

/**
 * 1. createTaskForNode — create a new task in daily/<date>.md for a
 *    mindmap node and register it in the owning topic-space's taskIds.
 */
export async function createTaskForNode(params: {
  workspaceRoot?: string;
  mindmapId: string;
  nodeId: string;
  title: string;
  scheduledDate: string;
  description?: string;
  manualTags?: string[];
  deadline?: string;
  priority?: 'high' | 'medium' | 'low';
  project?: string;
  existingTaskId?: string;
  config?: Config;
}): Promise<{ taskId: string; appended: boolean; alreadyPresent: boolean }> {
  const cfg = await resolveConfig(params.config);
  const taskId = params.existingTaskId || genId('t');
  const { map, node } = await getOrCreateLinkableNode(params.mindmapId, params.nodeId, params.title);
  if (node.taskId && node.taskId !== taskId) {
    throw Object.assign(new Error('Mind map node is already linked to another task'), { status: 409 });
  }

  const note = await readDailyNote(params.scheduledDate, cfg);
  const md = note?.content ?? '';

  const bindNodeAndSpace = async () => {
    const updatedMap = await updateMindMap(map.id, {
      nodes: map.nodes.map(item => item.id === params.nodeId
        ? {
            ...item,
            text: params.title,
            kind: 'task' as const,
            taskId,
            taskDate: params.scheduledDate,
            status: 'todo' as const,
          }
        : item),
    });
    if (!updatedMap) throw new Error('Mind map disappeared while linking task');
    if (map.spaceId) await addTaskIdToTopicSpace(map.spaceId, taskId);
  };

  // Idempotency also repairs either half of a partially-written association.
  const tasks = parseMarkdown(md);
  const existing = findTaskByTaskId(tasks, taskId);
  if (existing && existing.originMindmapId === params.mindmapId && existing.originNodeId === params.nodeId) {
    await bindNodeAndSpace();
    invalidateTaskIndex();
    return { taskId, appended: false, alreadyPresent: true };
  }

  const inheritedTags = getInheritedTagsFromMap(map, params.nodeId);

  const manualTags = Array.from(new Set([...(params.manualTags || []), ...inheritedTags]));

  const newTask: Task = {
    id: taskId,
    title: params.title,
    status: 'todo',
    description: params.description,
    tags: manualTags.length ? manualTags : undefined,
    deadline: params.deadline,
    priority: params.priority,
    project: params.project,
    spaceId: map.spaceId,
    originMindmapId: params.mindmapId,
    originNodeId: params.nodeId,
  };

  const updated = appendTaskToMarkdown(md, newTask, params.scheduledDate, { inheritedTags });
  await writeDailyNote(params.scheduledDate, updated, cfg);
  try {
    await bindNodeAndSpace();
  } catch (error) {
    await writeDailyNote(params.scheduledDate, md, cfg).catch(() => undefined);
    await updateMindMap(map.id, { nodes: map.nodes }).catch(() => undefined);
    throw error;
  }

  invalidateTaskIndex();

  return { taskId, appended: true, alreadyPresent: false };
}

/**
 * 2. editNodeTask — edit title, description, tags, deadline, priority on the
 *    EXISTING linked task line. NEVER strips ^mm/^node/^id-/^space markers.
 */
export async function editNodeTask(params: {
  taskId: string;
  scheduledDate: string;
  updates: {
    title?: string;
    description?: string;
    comment?: string;
    comments?: { text: string; timestamp: string }[];
    tags?: string[];
    deadline?: string;
    priority?: 'high' | 'medium' | 'low' | '';
    project?: string;
  };
  config?: Config;
}): Promise<{ updated: boolean; taskLine?: number }> {
  const cfg = await resolveConfig(params.config);
  const note = await readDailyNote(params.scheduledDate, cfg);
  if (!note) return { updated: false };

  const tasks = parseMarkdown(note.content);
  const t = findTaskByTaskId(tasks, params.taskId);
  if (!t || typeof t.line !== 'number') return { updated: false };

  const updated = editTaskFullInMarkdown(note.content, t.line, params.updates, params.scheduledDate);
  await writeDailyNote(params.scheduledDate, updated, cfg);
  invalidateTaskIndex();
  return { updated: true, taskLine: t.line };
}

/**
 * 3. completeNodeTask — set checkbox [x] on the task line at scheduledDate.
 *    Idempotent: completing twice is a no-op.
 */
export async function completeNodeTask(params: {
  taskId: string;
  scheduledDate: string;
  config?: Config;
}): Promise<{ completed: boolean; alreadyDone: boolean }> {
  const cfg = await resolveConfig(params.config);
  const note = await readDailyNote(params.scheduledDate, cfg);
  if (!note) return { completed: false, alreadyDone: false };

  const tasks = parseMarkdown(note.content);
  const t = findTaskByTaskId(tasks, params.taskId);
  if (!t || typeof t.line !== 'number') return { completed: false, alreadyDone: false };

  if (t.status === 'done') return { completed: false, alreadyDone: true };

  const updated = updateTaskInMarkdown(note.content, t.line, 'done');
  await writeDailyNote(params.scheduledDate, updated, cfg);
  return { completed: true, alreadyDone: false };
}

/**
 * 4. undoCompleteNodeTask — revert [x] → [ ]. Idempotent.
 */
export async function undoCompleteNodeTask(params: {
  taskId: string;
  scheduledDate: string;
  config?: Config;
}): Promise<{ undone: boolean; alreadyTodo: boolean }> {
  const cfg = await resolveConfig(params.config);
  const note = await readDailyNote(params.scheduledDate, cfg);
  if (!note) return { undone: false, alreadyTodo: false };

  const tasks = parseMarkdown(note.content);
  const t = findTaskByTaskId(tasks, params.taskId);
  if (!t || typeof t.line !== 'number') return { undone: false, alreadyTodo: false };

  if (t.status !== 'done') return { undone: false, alreadyTodo: true };

  const updated = updateTaskInMarkdown(note.content, t.line, 'todo');
  await writeDailyNote(params.scheduledDate, updated, cfg);
  return { undone: true, alreadyTodo: false };
}

/**
 * 5. convertStandaloneToEventNodeTask — inject ^mm:<mid> ^node:<nid> on the
 *    standalone line; append taskId to the space.taskIds list.
 *    Idempotent.
 */
export async function convertStandaloneToEventNodeTask(params: {
  taskId: string;
  scheduledDate: string;
  mindmapId: string;
  nodeId: string;
  config?: Config;
}): Promise<{
  converted: boolean;
  alreadyConverted: boolean;
  spaceLinked: boolean;
}> {
  const cfg = await resolveConfig(params.config);
  const note = await readDailyNote(params.scheduledDate, cfg);
  if (!note) return { converted: false, alreadyConverted: false, spaceLinked: false };

  const tasks = parseMarkdown(note.content);
  const t = findTaskByTaskId(tasks, params.taskId);
  if (!t || typeof t.line !== 'number') return { converted: false, alreadyConverted: false, spaceLinked: false };
  const { map, node } = await getOrCreateLinkableNode(params.mindmapId, params.nodeId, t.title);
  if (node.taskId && node.taskId !== params.taskId) {
    throw Object.assign(new Error('Mind map node is already linked to another task'), { status: 409 });
  }

  const bindNode = async () => {
    const updated = await updateMindMap(map.id, {
      nodes: map.nodes.map(item => item.id === params.nodeId
        ? {
            ...item,
            text: t.title,
            kind: 'task' as const,
            taskId: params.taskId,
            taskDate: params.scheduledDate,
            status: t.status === 'done' ? 'done' as const : 'todo' as const,
          }
        : item),
    });
    if (!updated) throw new Error('Mind map disappeared while linking task');
  };

  // Already converted? Repair the map/space side if an older write only
  // persisted markers in the daily note.
  if (t.originMindmapId === params.mindmapId && t.originNodeId === params.nodeId) {
    await bindNode();
    const spaceLinked = await ensureSpaceHasTaskId(params.mindmapId, params.taskId);
    return { converted: false, alreadyConverted: true, spaceLinked };
  }

  // Rewrite the line by splicing markers in via setOriginMarkers on raw line.
  const lines = note.content.split('\n');
  const raw = lines[t.line] ?? '';
  lines[t.line] = setSpaceMarker(
    setOriginMarkers(raw, params.mindmapId, params.nodeId),
    map.spaceId ?? null,
  );
  const newContent = lines.join('\n');
  await writeDailyNote(params.scheduledDate, newContent, cfg);
  try {
    await bindNode();
    const spaceLinked = await ensureSpaceHasTaskId(params.mindmapId, params.taskId);
    invalidateTaskIndex();
    return { converted: true, alreadyConverted: false, spaceLinked };
  } catch (error) {
    await writeDailyNote(params.scheduledDate, note.content, cfg).catch(() => undefined);
    await updateMindMap(map.id, { nodes: map.nodes }).catch(() => undefined);
    throw error;
  }
}

async function ensureSpaceHasTaskId(mindmapId: string, taskId: string): Promise<boolean> {
  try {
    const map = await getMindMap(mindmapId);
    if (map?.spaceId) {
      const r = await addTaskIdToTopicSpace(map.spaceId, taskId);
      return !!r;
    }
  } catch { /* ignore */ }
  return false;
}

/**
 * 6. undoConvertStandaloneToEventNodeTask — strip Event ownership markers
 *    (^mm, ^node, ^space), keep the stable ^id-, and detach the map node.
 */
export async function undoConvertStandaloneToEventNodeTask(params: {
  taskId: string;
  scheduledDate: string;
  config?: Config;
}): Promise<{ reverted: boolean; alreadyStandalone: boolean; removedFromSpace: boolean }> {
  const cfg = await resolveConfig(params.config);
  const note = await readDailyNote(params.scheduledDate, cfg);
  if (!note) return { reverted: false, alreadyStandalone: false, removedFromSpace: false };

  const tasks = parseMarkdown(note.content);
  const t = findTaskByTaskId(tasks, params.taskId);
  if (!t || typeof t.line !== 'number') return { reverted: false, alreadyStandalone: false, removedFromSpace: false };

  if (!t.originMindmapId && !t.originNodeId) {
    return { reverted: false, alreadyStandalone: true, removedFromSpace: false };
  }

  const lines = note.content.split('\n');
  const raw = lines[t.line] ?? '';
  lines[t.line] = setSpaceMarker(stripAllOriginMarkers(raw), null);
  const newContent = lines.join('\n');
  await writeDailyNote(params.scheduledDate, newContent, cfg);

  // Remove from space linkage
  let removed = false;
  try {
    const space = await findTopicSpaceByTaskId(params.taskId);
    if (space) {
      const r = await removeTaskIdFromTopicSpace(space.id, params.taskId);
      removed = !!r;
    }
  } catch { /* ignore */ }

  if (t.originMindmapId && t.originNodeId) {
    try {
      const map = await getMindMap(t.originMindmapId);
      if (map) {
        await updateMindMap(map.id, {
          nodes: map.nodes.map(node => node.id === t.originNodeId && node.taskId === params.taskId
            ? { ...node, kind: 'branch' as const, taskId: undefined, taskDate: undefined, status: 'todo' as const }
            : node),
        });
      }
    } catch { /* the task is safely standalone even if a legacy map is missing */ }
  }

  invalidateTaskIndex();

  return { reverted: true, alreadyStandalone: false, removedFromSpace: removed };
}

/**
 * Remove a scheduled projection while preserving the Event node itself.
 * Both files are restored if updating the map fails, so callers never see a
 * deleted daily task that is still marked as scheduled on the canvas.
 */
export async function unscheduleNodeTask(params: {
  taskId: string;
  scheduledDate: string;
  mindmapId: string;
  nodeId: string;
  config?: Config;
}): Promise<{ unscheduled: boolean; alreadyUnscheduled: boolean }> {
  const cfg = await resolveConfig(params.config);
  const map = await getMindMap(params.mindmapId);
  if (!map) return { unscheduled: false, alreadyUnscheduled: false };
  const node = map.nodes.find(item => item.id === params.nodeId);
  if (!node) return { unscheduled: false, alreadyUnscheduled: false };

  const note = await readDailyNote(params.scheduledDate, cfg);
  const task = note ? findTaskByTaskId(parseMarkdown(note.content), params.taskId) : undefined;
  if (!task && !node.taskId) return { unscheduled: false, alreadyUnscheduled: true };

  const previousContent = note?.content ?? '';
  if (note && task && typeof task.line === 'number') {
    await writeDailyNote(params.scheduledDate, removeTaskFromMarkdown(note.content, task.line), cfg);
  }

  try {
    const nodes = map.nodes.map(item => item.id === params.nodeId
      ? { ...item, kind: 'branch' as const, taskId: undefined, taskDate: undefined, status: 'todo' as const }
      : item);
    const updated = await updateMindMap(map.id, { nodes });
    if (!updated) throw new Error('Mind map disappeared while unscheduling');
    if (map.spaceId) await removeTaskIdFromTopicSpace(map.spaceId, params.taskId).catch(() => null);
    return { unscheduled: true, alreadyUnscheduled: false };
  } catch (error) {
    if (note) await writeDailyNote(params.scheduledDate, previousContent, cfg).catch(() => null);
    throw error;
  }
}

/** Move the same stable task projection to another day without duplication. */
export async function rescheduleNodeTask(params: {
  taskId: string;
  fromDate: string;
  toDate: string;
  mindmapId: string;
  nodeId: string;
  config?: Config;
}): Promise<{ rescheduled: boolean; alreadyScheduled: boolean }> {
  if (params.fromDate === params.toDate) return { rescheduled: false, alreadyScheduled: true };
  const cfg = await resolveConfig(params.config);
  const map = await getMindMap(params.mindmapId);
  if (!map) return { rescheduled: false, alreadyScheduled: false };
  const node = map.nodes.find(item => item.id === params.nodeId);
  if (!node) return { rescheduled: false, alreadyScheduled: false };

  const fromNote = await readDailyNote(params.fromDate, cfg);
  if (!fromNote) return { rescheduled: false, alreadyScheduled: false };
  const sourceTask = findTaskByTaskId(parseMarkdown(fromNote.content), params.taskId);
  if (!sourceTask || typeof sourceTask.line !== 'number') return { rescheduled: false, alreadyScheduled: false };

  const toNote = await readDailyNote(params.toDate, cfg);
  const toBefore = toNote?.content ?? '';
  const fromBefore = fromNote.content;
  const targetHasTask = Boolean(findTaskByTaskId(parseMarkdown(toBefore), params.taskId));
  const toAfter = targetHasTask ? toBefore : appendTaskToMarkdown(toBefore, { ...sourceTask, source_date: sourceTask.source_date ?? params.fromDate }, params.toDate);

  await writeDailyNote(params.toDate, toAfter, cfg);
  try {
    await writeDailyNote(params.fromDate, removeTaskFromMarkdown(fromBefore, sourceTask.line), cfg);
    const nodes = map.nodes.map(item => item.id === params.nodeId
      ? { ...item, kind: 'task' as const, taskId: params.taskId, taskDate: params.toDate }
      : item);
    const updated = await updateMindMap(map.id, { nodes });
    if (!updated) throw new Error('Mind map disappeared while rescheduling');
    invalidateTaskIndex();
    return { rescheduled: true, alreadyScheduled: false };
  } catch (error) {
    await writeDailyNote(params.fromDate, fromBefore, cfg).catch(() => null);
    await writeDailyNote(params.toDate, toBefore, cfg).catch(() => null);
    throw error;
  }
}
