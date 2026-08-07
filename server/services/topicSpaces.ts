/**
 * Topic Space storage and CRUD.
 *
 * Storage: reuses the same path as a ThinkingWorkspace
 * (`Workspaces/<year>/<month>/<id>.md`). New files get frontmatter
 * `kind: topic-space` plus the four new fields. Legacy files
 * (`kind: workspace` or no kind) are read tolerantly — defaults are
 * filled at parse time and the file is only rewritten when the user
 * explicitly updates it (which is the upgrade point per SPEC §2.1).
 *
 * MindMap binding: every TopicSpace owns exactly one dominant MindMap.
 * `createTopicSpace` auto-creates a blank MindMap and cross-wires the
 * two via `mindmapId` and `spaceId`. The two files are written in
 * sequence; if the second write fails the orphan is cleaned up.
 */
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { loadConfig } from './config.js';
import { createMindMap, updateMindMap } from './mindmaps.js';
import type { MindMap, MindMapNode } from '../types/mindmap.js';
import type {
  TopicSpace,
  TopicSpaceContext,
  TopicSpaceDefaultView,
  TopicSpaceFilters,
  TopicSpaceUpdate,
} from '../types/topicSpace.js';
import { TOPIC_SPACE_DEFAULTS } from '../types/topicSpace.js';
import type { WorkspaceTimelineEntry } from '../types/task.js';

// Reuse the slug helper shape from `thinkingWorkspaces` so ids look the
// same to anyone reading the filesystem; keep the implementation local
// so the two services can diverge in the future without breaking each
// other.
function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^\w一-龥-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
  return slug || `topic-space-${Date.now()}`;
}

async function getWorkspacesDir(): Promise<string> {
  const config = await loadConfig();
  const dir = path.join(config.workspaceRoot, 'Workspaces');
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function scanMarkdownFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        out.push(...await scanMarkdownFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        out.push(fullPath);
      }
    }
  } catch {
    // Empty workspace directory is fine.
  }
  return out;
}

// --- Frontmatter parsing -----------------------------------------------------

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

function extractSection(body: string, heading: string): string {
  const lines = body.split('\n');
  const start = lines.findIndex(line => line.trim().toLowerCase() === `## ${heading}`.toLowerCase());
  if (start === -1) return '';
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).join('\n').trim();
}

function parseTimeline(raw: string): WorkspaceTimelineEntry[] {
  if (!raw.trim()) return [];
  const lines = raw.split('\n');
  const entries: WorkspaceTimelineEntry[] = [];
  let current: WorkspaceTimelineEntry | null = null;
  for (const line of lines) {
    const heading = line.match(/^###\s+(\d{4}-\d{2}-\d{2})(?:\s+\[(\w+)\])?/);
    if (heading) {
      if (current) entries.push(current);
      current = {
        id: `tl_${heading[1]}_${entries.length}`,
        date: heading[1],
        type: (heading[2] as WorkspaceTimelineEntry['type']) || 'log',
        body: '',
      };
      continue;
    }
    if (current) {
      current.body += `${line}\n`;
    }
  }
  if (current) entries.push(current);
  return entries.map(entry => ({ ...entry, body: entry.body.trim().replace(/^-\s*/, '') }));
}

function generateTimeline(entries: WorkspaceTimelineEntry[]): string {
  if (!entries.length) return '';
  return entries.map(entry => {
    const type = entry.type && entry.type !== 'log' ? ` [${entry.type}]` : '';
    return `### ${entry.date}${type}\n\n- ${entry.body.trim()}`;
  }).join('\n\n');
}

// --- File <-> TopicSpace -----------------------------------------------------

/**
 * Parse a workspace file and return a TopicSpace with all the new fields
 * filled. Does NOT mutate the file on disk.
 *
 *   - If frontmatter `kind` is missing or `workspace`, the returned
 *     `kind` is `'workspace'`. The file is not rewritten.
 *   - If frontmatter `kind` is `topic-space`, return it as-is.
 *   - The four new fields (context / mindmapId / order / defaultView)
 *     are filled with defaults if missing — but they live only in
 *     memory until the user explicitly updates the topic space.
 */
export function parseTopicSpaceFile(content: string, filePath: string): TopicSpace {
  const { meta, body } = parseFrontmatter(content);
  const fileName = path.basename(filePath, '.md');
  const title = body.split('\n').find(line => line.startsWith('# '))?.replace(/^#\s+/, '').trim() || meta.title || fileName;
  const taskIds = Array.isArray(meta.taskIds) ? meta.taskIds : Array.isArray(meta.linkedTasks) ? meta.linkedTasks : [];
  const linkedNoteIds = Array.isArray(meta.linkedNoteIds) ? meta.linkedNoteIds : Array.isArray(meta.linkedNotes) ? meta.linkedNotes : [];

  const context = (meta.context as TopicSpaceContext) || TOPIC_SPACE_DEFAULTS.context;
  const defaultView = (meta.defaultView as TopicSpaceDefaultView) || TOPIC_SPACE_DEFAULTS.defaultView;
  const order = typeof meta.order === 'number' ? meta.order : Number(meta.order) || TOPIC_SPACE_DEFAULTS.order;

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
    intent: extractSection(body, 'Intent'),
    scratchpad: extractSection(body, 'Scratchpad'),
    brief: extractSection(body, 'Brief'),
    journey: extractSection(body, 'Journey') || extractSection(body, 'Plan'),
    tasksMarkdown: extractSection(body, 'Tasks'),
    mindmapMarkdown: extractSection(body, 'Mind Map'),
    timeline: parseTimeline(extractSection(body, 'Timeline')),
    taskIds,
    linkedNoteIds,
    createdAt: meta.createdAt || meta.created || new Date().toISOString(),
    updatedAt: meta.updatedAt || meta.updated || new Date().toISOString(),
    filePath,
  };
}

function formatArray(values?: string[]): string {
  if (!values || values.length === 0) return '[]';
  return `[${values.map(v => String(v).replace(/,/g, '')).join(', ')}]`;
}

/**
 * Write a TopicSpace to disk. Always uses `kind: topic-space` in
 * frontmatter (this is the explicit upgrade point per SPEC §2.1 — we
 * only ever set the new discriminator on a write).
 *
 * The body layout mirrors `generateWorkspaceFile` so the two share
 * section order; this keeps diffs small if a legacy workspace is later
 * edited through the new endpoint.
 */
export function generateTopicSpaceFile(space: TopicSpace): string {
  const lines: string[] = [
    '---',
    `id: ${space.id}`,
    'kind: topic-space',
    `type: ${space.type || 'general'}`,
    `status: ${space.status}`,
    `context: ${space.context}`,
    `mindmapId: ${space.mindmapId}`,
    `order: ${space.order}`,
    `defaultView: ${space.defaultView}`,
  ];
  if (space.projectId) lines.push(`projectId: ${space.projectId}`);
  if (space.tags?.length) lines.push(`tags: ${formatArray(space.tags)}`);
  if (space.taskIds?.length) lines.push(`taskIds: ${formatArray(space.taskIds)}`);
  if (space.linkedNoteIds?.length) lines.push(`linkedNoteIds: ${formatArray(space.linkedNoteIds)}`);
  lines.push(`createdAt: ${space.createdAt}`);
  lines.push(`updatedAt: ${space.updatedAt}`);
  lines.push('---');
  lines.push('');
  lines.push(`# ${space.title}`);
  lines.push('');
  lines.push('## Intent');
  lines.push('');
  lines.push(space.intent || '');
  lines.push('');
  lines.push('## Scratchpad');
  lines.push('');
  lines.push(space.scratchpad || '');
  lines.push('');
  lines.push('## Brief');
  lines.push('');
  lines.push(space.brief || '');
  lines.push('');
  lines.push('## Journey');
  lines.push('');
  lines.push(space.journey || '');
  lines.push('');
  lines.push('## Tasks');
  lines.push('');
  lines.push(space.tasksMarkdown || '');
  lines.push('');
  lines.push('## Mind Map');
  lines.push('');
  lines.push(space.mindmapMarkdown || '');
  lines.push('');
  lines.push('## Timeline');
  lines.push('');
  lines.push(generateTimeline(space.timeline || []));
  lines.push('');
  return lines.join('\n');
}

// --- CRUD --------------------------------------------------------------------

export async function listTopicSpaces(filters?: TopicSpaceFilters): Promise<TopicSpace[]> {
  const dir = await getWorkspacesDir();
  const files = await scanMarkdownFiles(dir);
  let spaces: TopicSpace[] = [];
  for (const filePath of files) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      spaces.push(parseTopicSpaceFile(content, filePath));
    } catch (err) {
      console.error(`[topic-spaces] skipping unreadable workspace file ${filePath}:`, err);
    }
  }
  if (filters) {
    if (filters.context) {
      spaces = spaces.filter(s => s.context === filters.context);
    }
    if (filters.query) {
      const q = filters.query.toLowerCase();
      spaces = spaces.filter(s =>
        [s.title, s.intent, s.scratchpad, s.brief, s.journey].some(v => (v || '').toLowerCase().includes(q)),
      );
    }
  }
  // Within a context, order by `order` then by createdAt for stability.
  return spaces.sort((a, b) => {
    if (a.context !== b.context) return a.context.localeCompare(b.context);
    if (a.order !== b.order) return a.order - b.order;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export async function getTopicSpace(id: string): Promise<TopicSpace | null> {
  const all = await listTopicSpaces();
  return all.find(s => s.id === id) || null;
}

function nextOrderFor(spaces: TopicSpace[], context: TopicSpaceContext): number {
  const inContext = spaces.filter(s => s.context === context);
  if (inContext.length === 0) return 0;
  return Math.max(...inContext.map(s => s.order)) + 1;
}

export interface CreateTopicSpaceInput {
  title: string;
  context?: TopicSpaceContext;
  defaultView?: TopicSpaceDefaultView;
  intent?: string;
  scratchpad?: string;
  brief?: string;
  journey?: string;
  tasksMarkdown?: string;
  mindmapMarkdown?: string;
  tags?: string[];
  status?: TopicSpace['status'];
  type?: TopicSpace['type'];
  projectId?: string;
}

/**
 * Create a new TopicSpace and auto-create its dominant MindMap.
 *
 * Cross-binding: a blank MindMap is created first; the resulting
 * `mindmapId` is stored on the TopicSpace, and the TopicSpace `id` is
 * written back as the MindMap's `spaceId` (via the v2 update path).
 *
 * If the MindMap↔Space write-back fails, the orphan MindMap file is
 * deleted so the filesystem stays clean.
 */
export async function createTopicSpace(data: CreateTopicSpaceInput): Promise<TopicSpace> {
  const title = (data.title || '').trim();
  if (!title) throw new Error('Title is required');

  const dir = await getWorkspacesDir();
  const now = new Date().toISOString();
  const id = `tw_${now.slice(0, 10).replace(/-/g, '')}_${slugify(title)}_${crypto.randomBytes(3).toString('hex')}`;
  const [year, month] = now.slice(0, 10).split('-');
  const targetDir = path.join(dir, year, month);
  await fs.mkdir(targetDir, { recursive: true });

  const context: TopicSpaceContext = data.context || TOPIC_SPACE_DEFAULTS.context;

  // 1. Create the dominant MindMap first so we have a real `mindmapId`.
  const map: MindMap = await createMindMap({ title });

  // 2. Determine the order before we have the space written.
  const existing = await listTopicSpaces({ context });
  const order = nextOrderFor(existing, context);

  const space: TopicSpace = {
    id,
    title,
    kind: 'topic-space',
    type: data.type || 'general',
    status: data.status || 'active',
    context,
    mindmapId: map.id,
    order,
    defaultView: data.defaultView || TOPIC_SPACE_DEFAULTS.defaultView,
    projectId: data.projectId,
    tags: data.tags || [],
    intent: data.intent || '',
    scratchpad: data.scratchpad || '',
    brief: data.brief || '',
    journey: data.journey || '',
    tasksMarkdown: data.tasksMarkdown || '',
    mindmapMarkdown: data.mindmapMarkdown || '',
    taskIds: [],
    linkedNoteIds: [],
    timeline: [
      { id: `tl_${Date.now()}`, date: now.slice(0, 10), type: 'log', body: 'Topic space created.' },
    ],
    createdAt: now,
    updatedAt: now,
  };

  const filePath = path.join(targetDir, `${id}.md`);

  try {
    // 3. Cross-bind: write the space → reverse-link on the map.
    await updateMindMap(map.id, { spaceId: id });
    // 4. Persist the TopicSpace.
    await fs.writeFile(filePath, generateTopicSpaceFile(space), 'utf-8');
  } catch (err) {
    // Best-effort cleanup so we don't leave a half-bound mindmap.
    try {
      const { deleteMindMap } = await import('./mindmaps.js');
      await deleteMindMap(map.id);
    } catch (cleanupErr) {
      console.error('[topic-spaces] failed to clean up orphan mindmap:', cleanupErr);
    }
    throw err;
  }

  space.filePath = filePath;
  return space;
}

export async function updateTopicSpace(
  id: string,
  updates: TopicSpaceUpdate,
): Promise<TopicSpace | null> {
  const existing = await getTopicSpace(id);
  if (!existing || !existing.filePath) return null;

  const now = new Date().toISOString();

  // Handle projectId: null clears the field, undefined leaves it alone.
  const projectId =
    updates.projectId === null
      ? undefined
      : updates.projectId === undefined
        ? existing.projectId
        : updates.projectId;

  const next: TopicSpace = {
    ...existing,
    ...updates,
    projectId,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: now,
    filePath: existing.filePath,
    // The kind upgrade happens on any write per SPEC §2.1.
    kind: 'topic-space',
  };

  await fs.writeFile(existing.filePath, generateTopicSpaceFile(next), 'utf-8');

  // If the user pointed us at a different mindmap, propagate the link.
  if (updates.mindmapId && updates.mindmapId !== existing.mindmapId) {
    try {
      await updateMindMap(updates.mindmapId, { spaceId: existing.id });
    } catch (err) {
      // MindMap file may not exist yet (e.g. detached mode). Don't fail
      // the topic-space write — the next create will backfill.
      console.warn(`[topic-spaces] could not bind mindmap ${updates.mindmapId} to space ${existing.id}:`, err);
    }
  }

  return next;
}

export async function deleteTopicSpace(id: string): Promise<boolean> {
  const existing = await getTopicSpace(id);
  if (!existing?.filePath) return false;
  await fs.unlink(existing.filePath);
  // The associated MindMap is intentionally NOT deleted — SPEC §3.1
  // specifies "mindmap 标 archived 不删". The MindMap type doesn't yet
  // carry an `archived` flag; until it does, the map sits orphaned.
  // TODO(topic-spaces/phase-2): set `archived: true` on the linked
  // MindMap when that field is added to the type.
  return true;
}

/**
 * Reorder TopicSpaces within a single context.
 *
 * `orderedIds` is the complete new ordering for `context`; any ids not
 * in the list are kept in their current relative order and appended at
 * the end. Spaces belonging to other contexts are not touched.
 */
export async function reorderTopicSpaces(
  context: TopicSpaceContext,
  orderedIds: string[],
): Promise<TopicSpace[]> {
  const all = await listTopicSpaces();
  const byId = new Map(all.map(s => [s.id, s]));
  const inContext = all.filter(s => s.context === context);
  const idSet = new Set(orderedIds);

  // Build the new full ordering for this context: requested first,
  // missing ids appended in their existing order.
  const reordered: TopicSpace[] = [];
  const seen = new Set<string>();
  for (const id of orderedIds) {
    const s = byId.get(id);
    if (s && s.context === context && !seen.has(id)) {
      reordered.push(s);
      seen.add(id);
    }
  }
  for (const s of inContext) {
    if (!seen.has(s.id)) {
      reordered.push(s);
      seen.add(s.id);
    }
  }

  // Persist each with a fresh `order` value.
  for (let i = 0; i < reordered.length; i++) {
    const target = reordered[i];
    if (target.order === i && idSet.has(target.id)) continue; // no-op
    const updated = await updateTopicSpace(target.id, { order: i });
    if (updated) reordered[i] = updated;
  }

  return reordered;
}

// --- Helpers used by migration ----------------------------------------------

/**
 * Read a workspace file path and return the parsed TopicSpace, or null
 * if the file is unreadable. Exposed for the migration script.
 */
export async function readTopicSpaceFile(filePath: string): Promise<TopicSpace | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return parseTopicSpaceFile(content, filePath);
  } catch (err) {
    console.error(`[topic-spaces] cannot read ${filePath}:`, err);
    return null;
  }
}

// Re-export the MindMapNode type for callers that want a single import.
export type { MindMap, MindMapNode };

// --- taskIds maintenance -----------------------------------------------------

/**
 * Add a taskId to a topic space if not already present. Idempotent.
 * Returns the updated TopicSpace, or `null` if the space does not exist.
 *
 * Used by:
 *   - `POST /api/mindmaps/:id/nodes/:nodeId/promote-to-task` (newly created task)
 *   - `POST /api/mindmaps/:id/nodes/:nodeId/link-task`     (existing task)
 *
 * Note: the function only appends; it never re-orders existing entries
 * because callers do not depend on order and stable diffs are nicer
 * in git history.
 */
export async function addTaskIdToTopicSpace(
  spaceId: string,
  taskId: string,
): Promise<TopicSpace | null> {
  const space = await getTopicSpace(spaceId);
  if (!space) return null;
  if (space.taskIds.includes(taskId)) return space;
  return updateTopicSpace(spaceId, {
    taskIds: [...space.taskIds, taskId],
  });
}

/**
 * Remove a taskId from a topic space. Idempotent: returns the space
 * unchanged (or with the id gone) whether or not the id was present.
 *
 * Used by `PUT /api/tasks/:taskId/space` when the caller sets
 * `spaceId: null` to detach a task from its current topic space.
 */
export async function removeTaskIdFromTopicSpace(
  spaceId: string,
  taskId: string,
): Promise<TopicSpace | null> {
  const space = await getTopicSpace(spaceId);
  if (!space) return null;
  if (!space.taskIds.includes(taskId)) return space;
  return updateTopicSpace(spaceId, {
    taskIds: space.taskIds.filter(id => id !== taskId),
  });
}

/**
 * Find the topic space that currently owns a given taskId, or null if
 * the task is unowned. Used by `PUT /api/tasks/:taskId/space` to
 * detect re-bindings (task moving from space A to space B).
 */
export async function findTopicSpaceByTaskId(taskId: string): Promise<TopicSpace | null> {
  const all = await listTopicSpaces();
  return all.find(s => s.taskIds.includes(taskId)) || null;
}
