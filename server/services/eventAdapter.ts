import { promises as fs } from 'fs';
import path from 'path';
import type {
  EventSummary,
  EventDetail,
  EventNode,
  EventExecution,
  EventContext,
  EventStatus,
  TodayItem,
  StandaloneTask,
  SuggestedTag,
} from '../types/event.js';
import type { TopicSpace, TopicSpaceContext } from '../types/topicSpace.js';
import type { MindMap } from '../types/mindmap.js';

function hashStr(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    const chr = s.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function md5Like(s: string): string {
  return hashStr(s);
}

function parseScalar(value: string): any {
  const trimmed = value.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map(v => v.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  }
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed.slice(1, -1);
  return trimmed;
}

function parseFrontmatter(content: string): { meta: Record<string, any>; body: string } {
  const lines = content.split('\n');
  if (lines[0]?.trim() !== '---') return { meta: {}, body: content };
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      end = i;
      break;
    }
  }
  if (end === -1) return { meta: {}, body: content };

  const meta: Record<string, any> = {};
  for (let i = 1; i < end; i++) {
    const line = lines[i];
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1);
    meta[key] = parseScalar(value);
  }
  return { meta, body: lines.slice(end + 1).join('\n').trim() };
}

function parseTopicSpaceFileLocal(content: string, filePath: string): TopicSpace {
  const { meta, body } = parseFrontmatter(content);
  const fileName = path.basename(filePath, '.md');
  const title = body.split('\n').find(line => line.startsWith('# '))?.replace(/^#\s+/, '').trim() || meta.title || fileName;
  const taskIds = Array.isArray(meta.taskIds) ? meta.taskIds : Array.isArray(meta.linkedTasks) ? meta.linkedTasks : [];
  const linkedNoteIds = Array.isArray(meta.linkedNoteIds) ? meta.linkedNoteIds : Array.isArray(meta.linkedNotes) ? meta.linkedNotes : [];

  const context = (meta.context as TopicSpaceContext) || 'unclassified';
  const defaultView = (meta.defaultView as 'mindmap' | 'list') || 'mindmap';
  const order = typeof meta.order === 'number' ? meta.order : Number(meta.order) || 0;

  return {
    id: meta.id || fileName,
    title,
    kind: meta.kind === 'topic-space' ? 'topic-space' : 'workspace',
    type: meta.type || 'general',
    status: meta.status || 'active',
    context,
    mindmapId: meta.mindmapId || '',
    order,
    defaultView,
    projectId: meta.projectId || meta.project,
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    intent: '',
    scratchpad: '',
    brief: '',
    journey: '',
    tasksMarkdown: '',
    mindmapMarkdown: '',
    timeline: [],
    taskIds,
    linkedNoteIds,
    createdAt: meta.createdAt || meta.created || new Date().toISOString(),
    updatedAt: meta.updatedAt || meta.updated || new Date().toISOString(),
    filePath,
  };
}

export function effectiveTagsForEvent(
  space: { tags?: string[]; context?: string | 'unclassified' },
  nodeTagsFromMarkdown?: string[],
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  const add = (raw: string) => {
    if (!raw) return;
    const v = raw.toLowerCase().trim();
    if (!v || v === 'unclassified') return;
    if (seen.has(v)) return;
    seen.add(v);
    result.push(v);
  };

  if (space.tags) {
    for (const t of space.tags) add(t);
  }

  if (nodeTagsFromMarkdown) {
    for (const t of nodeTagsFromMarkdown) add(t);
  }

  const ctx = space.context;
  if (ctx && ctx !== 'unclassified' && (ctx === 'work' || ctx === 'life')) {
    add(ctx);
  }

  return result;
}

export function resolveTaskStateFromMarkdown(line: string): {
  status: 'todo' | 'done';
  title: string;
  tags: string[];
  deadline?: string;
  priority?: 'high' | 'medium' | 'low';
} {
  const taskMatch = line.match(/^\s*[-*]\s+\[([xX >])\]\s+(.*)$/);
  const checkboxChar = taskMatch ? taskMatch[1].toLowerCase() : ' ';
  let content = taskMatch ? taskMatch[2] : line;

  const isDone = checkboxChar === 'x';

  content = content.replace(/\^id-[a-zA-Z0-9_-]+/g, '').trim();
  content = content.replace(/\^space:\S+/g, '').trim();
  content = content.replace(/\^mm:\S+/g, '').trim();
  content = content.replace(/\^node:\S+/g, '').trim();

  let deadline: string | undefined;
  const deadlineMatch = content.match(/#deadline:([^\s]+)/);
  if (deadlineMatch) {
    deadline = deadlineMatch[1];
    content = content.replace(/#deadline:[^\s]+/g, '').trim();
  }

  let priority: 'high' | 'medium' | 'low' | undefined;
  const priorityMatch = content.match(/#priority:(high|medium|low)/);
  if (priorityMatch) {
    priority = priorityMatch[1] as 'high' | 'medium' | 'low';
    content = content.replace(/#priority:(high|medium|low)/g, '').trim();
  }

  content = content.replace(/#project:[^\s]+/g, '').trim();
  content = content.replace(/↗\s*migrated:\S+/g, '').trim();

  const tagsMatches = content.match(/#([a-zA-Z0-9_\u4e00-\u9fa5-]+)/g) || [];
  const tags = tagsMatches.map(t => t.slice(1).toLowerCase());
  content = content.replace(/#([a-zA-Z0-9_\u4e00-\u9fa5-]+)/g, '').trim();

  return {
    status: isDone ? 'done' : 'todo',
    title: content,
    tags,
    deadline,
    priority,
  };
}

export function buildNodePath(
  rootId: string,
  edges: { source: string; target: string; id?: string }[],
  nodeId: string,
  nodeTexts: Record<string, string>,
): { id: string; text: string }[] {
  if (nodeId === rootId) return [];

  const parentOf = new Map<string, string>();
  for (const edge of edges) {
    if (!parentOf.has(edge.target)) {
      parentOf.set(edge.target, edge.source);
    }
  }

  const pathList: { id: string; text: string }[] = [];
  const seen = new Set<string>();
  let cur: string | undefined = nodeId;
  let safety = edges.length + 2;

  while (cur && safety-- > 0) {
    if (seen.has(cur)) return [];
    seen.add(cur);

    if (cur === rootId) break;
    const parent = parentOf.get(cur);
    if (!parent) return [];

    if (parent !== rootId) {
      pathList.push({
        id: parent,
        text: nodeTexts[parent] || '',
      });
    }
    cur = parent;
  }

  pathList.reverse();
  return pathList;
}

function getTopicSpaceEffectiveTags(space: TopicSpace): string[] {
  return effectiveTagsForEvent({ tags: space.tags, context: space.context });
}

async function readTopicSpaceFileSafe(workspaceRoot: string, spaceFilePath: string): Promise<TopicSpace | null> {
  try {
    const absolutePath = path.isAbsolute(spaceFilePath)
      ? spaceFilePath
      : path.join(workspaceRoot, spaceFilePath);
    const content = await fs.readFile(absolutePath, 'utf-8');
    return parseTopicSpaceFileLocal(content, absolutePath);
  } catch {
    return null;
  }
}

async function readMindMapSafe(workspaceRoot: string, mindmapId: string): Promise<MindMap | null> {
  if (!mindmapId) return null;
  const filePath = path.join(workspaceRoot, '.dailyflow', 'mindmaps', `${mindmapId}.json`);
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as MindMap;
  } catch {
    return null;
  }
}

async function readDailyNoteSafe(workspaceRoot: string, date: string): Promise<string | null> {
  const filePath = path.join(workspaceRoot, 'daily', `${date}.md`);
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function findTaskLineInContent(content: string, taskId: string): string | null {
  const lines = content.split('\n');
  const marker = `^id-${taskId}`;
  for (const line of lines) {
    if (line.includes(marker)) return line;
  }
  return null;
}

function computeTaskStatusFromDaily(
  content: string | null,
  taskId: string,
): { status: 'todo' | 'done'; line?: string } {
  if (!content) return { status: 'todo' };
  const line = findTaskLineInContent(content, taskId);
  if (!line) return { status: 'todo' };
  const resolved = resolveTaskStateFromMarkdown(line);
  return { status: resolved.status, line };
}

async function scanDailyForTask(
  workspaceRoot: string,
  taskId: string,
  taskDate: string | undefined,
  dateScanFrom: string,
  dateScanTo: string,
): Promise<{
  status: 'todo' | 'done';
  scheduledDate: string;
  deadline?: string;
  priority?: 'high' | 'medium' | 'low';
  completedAt?: string;
}> {
  const from = dateScanFrom || '2026-01-01';
  const to = dateScanTo || '2099-12-31';

  if (taskDate) {
    if (taskDate >= from && taskDate <= to) {
      const content = await readDailyNoteSafe(workspaceRoot, taskDate);
      if (content) {
        const result = computeTaskStatusFromDaily(content, taskId);
        if (result.line) {
          const resolved = resolveTaskStateFromMarkdown(result.line);
          return {
            status: resolved.status,
            scheduledDate: taskDate,
            deadline: resolved.deadline,
            priority: resolved.priority,
            completedAt: resolved.status === 'done' ? taskDate : undefined,
          };
        }
      }
    }
  }

  return {
    status: 'todo',
    scheduledDate: taskDate || from,
  };
}

async function computeProgressFromSpace(
  workspaceRoot: string,
  space: TopicSpace,
  map: MindMap | null,
): Promise<{ done: number; total: number; allDone: boolean }> {
  let total = 0;
  let done = 0;

  const taskNodes = map
    ? map.nodes.filter(n => {
        const kind = n.kind || 'branch';
        return kind !== 'root' && kind !== 'tag' && kind !== 'branch' && n.taskId;
      })
    : [];

  for (const node of taskNodes) {
    if (!node.taskId) continue;
    total++;
    const result = await scanDailyForTask(
      workspaceRoot,
      node.taskId,
      node.taskDate,
      '2026-01-01',
      '2099-12-31',
    );
    if (result.status === 'done') done++;
  }

  if (total === 0 && space.taskIds.length > 0) {
    for (const tid of space.taskIds) {
      total++;
      const result = await scanDailyForTask(
        workspaceRoot,
        tid,
        undefined,
        '2026-01-01',
        '2099-12-31',
      );
      if (result.status === 'done') done++;
    }
  }

  return { done, total, allDone: total > 0 && done === total };
}

export async function summarizeTopicSpaceAsEvent(
  workspaceRoot: string,
  spaceFilePath: string,
): Promise<EventSummary | null> {
  const space = await readTopicSpaceFileSafe(workspaceRoot, spaceFilePath);
  if (!space) return null;

  if (space.kind !== 'topic-space' && space.kind !== 'workspace') {
    return null;
  }

  const map = space.mindmapId ? await readMindMapSafe(workspaceRoot, space.mindmapId) : null;
  const progress = await computeProgressFromSpace(workspaceRoot, space, map);

  let context: EventContext;
  if (space.context === 'work' || space.context === 'life') {
    context = space.context;
  } else {
    context = 'work';
  }

  const status: EventStatus = progress.allDone ? 'completed' : 'active';

  return {
    id: space.id,
    title: space.title,
    context,
    status,
    progress: { done: progress.done, total: progress.total },
    effectiveTags: getTopicSpaceEffectiveTags(space),
    createdAt: space.createdAt,
    updatedAt: space.updatedAt,
  };
}

export async function buildEventDetail(
  workspaceRoot: string,
  spaceFilePath: string,
  dateScanFrom?: string,
  dateScanTo?: string,
): Promise<EventDetail | null> {
  const space = await readTopicSpaceFileSafe(workspaceRoot, spaceFilePath);
  if (!space) return null;

  if (space.kind !== 'topic-space' && space.kind !== 'workspace') {
    return null;
  }

  const from = dateScanFrom || '2026-01-01';
  const to = dateScanTo || '2099-12-31';

  let missingMap = false;
  let map: MindMap | null = null;
  if (space.mindmapId) {
    map = await readMindMapSafe(workspaceRoot, space.mindmapId);
    if (!map) missingMap = true;
  } else {
    missingMap = true;
  }

  const sourceContextWasUnclassified = !space.context || space.context === 'unclassified';

  const nodes: EventNode[] = [];
  const edgesOut: Array<{ id: string; source: string; target: string }> = [];
  const nodeTaskIdCounts = new Map<string, number>();

  let context: EventContext;
  if (space.context === 'work' || space.context === 'life') {
    context = space.context;
  } else {
    context = 'work';
  }

  const nodeTexts: Record<string, string> = {};

  if (map) {
    for (const edge of map.edges) {
      edgesOut.push({
        id: edge.id || `e_${edge.source}_${edge.target}`,
        source: edge.source,
        target: edge.target,
      });
    }

    for (const node of map.nodes) {
      nodeTexts[node.id] = node.text;
      const kind = node.kind || 'branch';

      let execution: EventExecution | undefined;
      const manualTags: string[] = Array.isArray(node.tags) ? [...node.tags] : [];
      const aiTags: SuggestedTag[] = [];

      if (kind === 'task' && node.taskId) {
        nodeTaskIdCounts.set(node.taskId, (nodeTaskIdCounts.get(node.taskId) || 0) + 1);

        const result = await scanDailyForTask(
          workspaceRoot,
          node.taskId,
          node.taskDate,
          from,
          to,
        );
        execution = {
          taskId: node.taskId,
          status: result.status,
          scheduledDate: result.scheduledDate,
          deadline: result.deadline,
          priority: result.priority,
          completedAt: result.completedAt,
        };
      }

      nodes.push({
        id: node.id,
        eventId: space.id,
        parentId: undefined,
        text: node.text,
        note: node.note,
        position: node.position,
        collapsed: node.collapsed,
        manualTags,
        aiTags,
        execution,
      });
    }

    const parentOf = new Map<string, string>();
    for (const edge of map.edges) {
      if (!parentOf.has(edge.target)) {
        parentOf.set(edge.target, edge.source);
      }
    }
    for (const n of nodes) {
      const p = parentOf.get(n.id);
      if (p) n.parentId = p;
    }
  }

  const duplicateNodeTaskIds: string[] = [];
  for (const [tid, count] of nodeTaskIdCounts) {
    if (count > 1) duplicateNodeTaskIds.push(tid);
  }

  const taskIdsMatched = new Set<string>([...nodeTaskIdCounts.keys()]);
  const orphanTaskIds: string[] = [];
  for (const tid of space.taskIds) {
    if (!taskIdsMatched.has(tid)) {
      orphanTaskIds.push(tid);
    }
  }

  let total = 0;
  let done = 0;
  for (const n of nodes) {
    if (n.execution) {
      total++;
      if (n.execution.status === 'done') done++;
    }
  }
  if (total === 0) {
    for (const tid of space.taskIds) {
      total++;
      const result = await scanDailyForTask(workspaceRoot, tid, undefined, from, to);
      if (result.status === 'done') done++;
    }
  }
  const allDone = total > 0 && done === total;
  const status: EventStatus = allDone ? 'completed' : 'active';

  const manualTags = Array.isArray(space.tags) ? [...space.tags] : [];
  const aiTags: SuggestedTag[] = [];
  const effectiveTags = getTopicSpaceEffectiveTags(space);

  return {
    id: space.id,
    title: space.title,
    context,
    status,
    progress: { done, total },
    effectiveTags,
    createdAt: space.createdAt,
    updatedAt: space.updatedAt,
    mindmapId: space.mindmapId,
    rootNodeId: map?.rootId || '',
    nodes,
    edges: edgesOut,
    manualTags,
    aiTags,
    integrity: {
      missingMap,
      sourceContextWasUnclassified,
      orphanTaskIds,
      duplicateNodeTaskIds,
    },
  };
}

async function scanWorkspacesDir(dir: string, out: string[]): Promise<void> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await scanWorkspacesDir(fullPath, out);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        out.push(fullPath);
      }
    }
  } catch {
    return;
  }
}

export async function listAllEvents(workspaceRoot: string): Promise<EventSummary[]> {
  const workspacesDir = path.join(workspaceRoot, 'Workspaces');
  const files: string[] = [];
  await scanWorkspacesDir(workspacesDir, files);

  const events: EventSummary[] = [];
  for (const fp of files) {
    const ev = await summarizeTopicSpaceAsEvent(workspaceRoot, fp);
    if (ev) events.push(ev);
  }

  events.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return events;
}

function parseRawTaskLines(content: string): Array<{
  line: string;
  index: number;
  category: string | null;
}> {
  const lines = content.split('\n');
  const result: Array<{ line: string; index: number; category: string | null }> = [];
  let currentCategory: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const categoryMatch = line.match(/^##\s+(.+)$/);
    if (categoryMatch) {
      currentCategory = categoryMatch[1].trim().toLowerCase();
      continue;
    }
    const taskMatch = line.match(/^\s*[-*]\s+\[([xX >])\]\s+(.*)$/);
    if (taskMatch) {
      result.push({ line, index: i, category: currentCategory });
    }
  }
  return result;
}

function extractIdFromLine(line: string): string | undefined {
  const m = line.match(/\^id-([a-zA-Z0-9_-]+)/);
  return m ? m[1] : undefined;
}
function extractMmFromLine(line: string): string | undefined {
  const m = line.match(/\^mm:(\S+)/);
  if (!m) return undefined;
  const slice = m[1];
  if (!slice || slice.startsWith('^') || slice.startsWith('#')) return undefined;
  return slice;
}
function extractNodeFromLine(line: string): string | undefined {
  const m = line.match(/\^node:(\S+)/);
  if (!m) return undefined;
  const slice = m[1];
  if (!slice || slice.startsWith('^') || slice.startsWith('#')) return undefined;
  return slice;
}

function matchesStandaloneContext(tags: string[], context: EventContext): boolean {
  if (context === 'life') {
    return tags.includes('life');
  }
  return !tags.includes('life') || tags.includes('work');
}

function matchesEventNodeContext(
  spaceContext: TopicSpaceContext | undefined,
  context: EventContext,
): boolean {
  if (context === 'life') {
    return spaceContext === 'life';
  }
  return spaceContext !== 'life';
}

async function findSpaceByMindmapId(
  workspaceRoot: string,
  mmId: string,
): Promise<TopicSpace | null> {
  const workspacesDir = path.join(workspaceRoot, 'Workspaces');
  const files: string[] = [];
  await scanWorkspacesDir(workspacesDir, files);

  for (const fp of files) {
    const space = await readTopicSpaceFileSafe(workspaceRoot, fp);
    if (space && space.mindmapId === mmId) {
      return space;
    }
  }
  return null;
}

export async function listTodayItems(
  workspaceRoot: string,
  date: string,
  context?: EventContext,
): Promise<TodayItem[]> {
  const content = await readDailyNoteSafe(workspaceRoot, date);
  if (!content) return [];

  const rawTasks = parseRawTaskLines(content);
  const items: TodayItem[] = [];

  for (let i = 0; i < rawTasks.length; i++) {
    const { line, category } = rawTasks[i];
    const resolved = resolveTaskStateFromMarkdown(line);

    let categoryTags: string[] = [];
    if (category && category !== 'tasks' && category !== 'inbox') {
      categoryTags = [category.toLowerCase()];
    }

    const allTags = new Set<string>([...resolved.tags, ...categoryTags]);
    const tagsArr = [...allTags];

    const mmId = extractMmFromLine(line);
    const nodeId = extractNodeFromLine(line);
    const taskId = extractIdFromLine(line) || md5Like(`${resolved.title}:${date}:${i}`);

    if (mmId && nodeId) {
      const map = await readMindMapSafe(workspaceRoot, mmId);
      const space = await findSpaceByMindmapId(workspaceRoot, mmId);

      const eventId = space?.id || mmId;
      const eventTitle = space?.title || (map && map.title) || mmId;

      const breadcrumb: Array<{ id: string; text: string }> = map
        ? buildNodePath(
            map.rootId,
            map.edges.map(e => ({ source: e.source, target: e.target, id: e.id })),
            nodeId,
            map.nodes.reduce<Record<string, string>>((acc, n) => {
              acc[n.id] = n.text;
              return acc;
            }, {}),
          )
        : [];

      const effectiveTags = effectiveTagsForEvent(
        { tags: space?.tags, context: space?.context },
        tagsArr,
      );

      if (context && space) {
        if (!matchesEventNodeContext(space.context, context)) continue;
      } else if (context && !space) {
        if (!matchesStandaloneContext(tagsArr, context)) continue;
      }

      items.push({
        kind: 'event-node',
        id: `event-node:${eventId}:${nodeId}`,
        eventId,
        nodeId,
        taskId,
        title: resolved.title || (map?.nodes.find(n => n.id === nodeId)?.text || ''),
        status: resolved.status,
        scheduledDate: date,
        eventTitle,
        path: breadcrumb,
        effectiveTags,
        deadline: resolved.deadline,
        priority: resolved.priority,
      });
    } else {
      const effectiveTags = [...tagsArr].filter((v, idx, arr) => arr.indexOf(v) === idx);

      if (context && !matchesStandaloneContext(tagsArr, context)) continue;

      const standaloneId = extractIdFromLine(line)
        ? `standalone:${extractIdFromLine(line)!}`
        : `standalone:${md5Like(`${resolved.title}:${date}:${i}`)}`;

      items.push({
        kind: 'standalone',
        id: standaloneId,
        taskId,
        title: resolved.title,
        status: resolved.status,
        scheduledDate: date,
        effectiveTags,
        deadline: resolved.deadline,
        priority: resolved.priority,
      });
    }
  }

  return items;
}

export async function listStandaloneTasks(
  workspaceRoot: string,
  date: string,
  context?: EventContext,
): Promise<StandaloneTask[]> {
  const content = await readDailyNoteSafe(workspaceRoot, date);
  if (!content) return [];

  const rawTasks = parseRawTaskLines(content);
  const tasks: StandaloneTask[] = [];

  for (let i = 0; i < rawTasks.length; i++) {
    const { line, category } = rawTasks[i];
    const mmId = extractMmFromLine(line);
    const nodeId = extractNodeFromLine(line);

    if (mmId || nodeId) continue;

    const resolved = resolveTaskStateFromMarkdown(line);

    let categoryTags: string[] = [];
    if (category && category !== 'tasks' && category !== 'inbox') {
      categoryTags = [category.toLowerCase()];
    }

    const allTagsSet = new Set<string>([...resolved.tags, ...categoryTags]);
    const manualTags = [...allTagsSet];

    if (context && !matchesStandaloneContext(manualTags, context)) continue;

    const explicitTaskId = extractIdFromLine(line);
    const id = explicitTaskId || md5Like(`${resolved.title}:${date}:${i}`);

    tasks.push({
      id,
      title: resolved.title,
      status: resolved.status,
      scheduledDate: date,
      deadline: resolved.deadline,
      note: undefined,
      manualTags,
      aiTags: [],
    });
  }

  return tasks;
}
