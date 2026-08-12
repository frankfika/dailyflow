import type { EventSummary, EventDetail, TodayItem, StandaloneTask, EventContext } from '../types/event.js';
import { buildEventDetail, buildIndependentMindMapEventDetail, listAllEvents, listTodayItems as adapterListToday, listStandaloneTasks as adapterListStandalone } from './eventAdapter.js';
import { loadConfig } from './config.js';
import { getMindMap, listMindMaps } from './mindmaps.js';
import { getTopicSpace, listTopicSpaces, findTopicSpaceByTaskId } from './topicSpaces.js';
import * as path from 'path';
import fsBase from 'fs';
import { promises as fs } from 'fs';

async function resolveWorkspaceRoot(workspaceRoot?: string): Promise<string> {
  if (workspaceRoot !== undefined) {
    return workspaceRoot;
  }
  const cfg = await loadConfig();
  if (!cfg.workspaceRoot) {
    throw new Error('workspaceRoot not configured');
  }
  return cfg.workspaceRoot;
}

function normalizeContext(context?: EventContext): EventContext | undefined {
  if (context === undefined || context === 'work' || context === 'life') {
    return context;
  }
  return undefined;
}

async function scanWorkspacesDirLocal(dir: string, out: string[]): Promise<void> {
  let entries: fsBase.Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch { return; }
  for (const e of entries) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) {
      await scanWorkspacesDirLocal(fp, out);
    } else if (e.isFile() && e.name.endsWith('.md')) {
      out.push(fp);
    }
  }
}

/**
 * EFP-005 — Resolve a public `eventId` string to a TopicSpace markdown file
 * absolute path. Rules (first match wins; idempotent):
 *   1. If eventId matches a TopicSpace.id (via a full Workspaces scan of
 *      frontmatter `id:` fields) → return the matching .md file path.
 *   2. Else if eventId matches a MindMap id (JSON exists at
 *      `.dailyflow/mindmaps/<id>.json`) AND that map has a `spaceId` that
 *      itself matches a TopicSpace → return that space's .md file path.
 *   3. Else if eventId matches a MindMap id but no spaceId linkage:
 *      try to find any TopicSpace whose frontmatter `mindmapId:` equals
 *      the eventId (scanning Workspaces). If found → that path.
 *   4. Else return null. Case 2 exists because some older TopicSpace.md
 *      files reference mindmapId without being written in the map.spaceId.
 *
 * This is intentionally a small, single-purpose resolver. Future EFP-006+
 * MUST NOT grow it into a general join/filter service — push that
 * complexity down into adapter or a dedicated index service.
 */
export async function resolveEventIdToSpaceFile(
  eventId: string,
  workspaceRoot?: string,
): Promise<string | null> {
  if (!eventId) return null;
  const root = await resolveWorkspaceRoot(workspaceRoot);

  // Step 1: Linear scan Workspaces/*.md for frontmatter id === eventId (or
  // mindmapId === eventId, step 3 later). Build one index.
  const workspacesDir = path.join(root, 'Workspaces');
  const allFiles: string[] = [];
  try { await scanWorkspacesDirLocal(workspacesDir, allFiles); } catch { return null; }

  let byId: string | null = null;
  let byMindmapId: string | null = null;
  for (const fp of allFiles) {
    try {
      const raw = await fs.readFile(fp, 'utf-8');
      const idMatch = raw.match(/^id:\s*(\S+)/m);
      const mmMatch = raw.match(/^mindmapId:\s*(\S+)/m);
      if (idMatch && idMatch[1] === eventId) { byId = fp; break; }
      if (mmMatch && mmMatch[1] === eventId && !byMindmapId) { byMindmapId = fp; }
    } catch { /* skip unreadable files */ }
  }
  if (byId) return byId;

  // Step 2: eventId is a MindMap JSON id → use map.spaceId to find TopicSpace.id
  // via listTopicSpaces lookup.
  const map = await (async () => { try { return await getMindMap(eventId); } catch { return null; } })();
  if (map?.spaceId) {
    const space = await (async () => { try { return await getTopicSpace(map.spaceId); } catch { return null; } })();
    if (space?.filePath) return space.filePath;
  }

  // Step 3: MindmapId back-reference (step 3)
  if (map || byMindmapId) return byMindmapId;

  return null;
}

/**
 * EFP-005 — new public surface: getEventById(eventId, workspaceRoot?, scan?)
 * Resolves eventId → spaceFile → buildEventDetail.
 */
export async function getEventById(
  eventId: string,
  workspaceRoot?: string,
  scanFrom?: string,
  scanTo?: string,
): Promise<EventDetail | null> {
  const root = await resolveWorkspaceRoot(workspaceRoot);
  const spaceFile = await resolveEventIdToSpaceFile(eventId, root);
  if (spaceFile) return getEventDetail(spaceFile, root, scanFrom, scanTo);
  return buildIndependentMindMapEventDetail(root, eventId, scanFrom, scanTo);
}

export async function listEvents(workspaceRoot?: string): Promise<EventSummary[]> {
  const root = await resolveWorkspaceRoot(workspaceRoot);
  const result = await listAllEvents(root);
  return result || [];
}

export async function getEventDetail(
  spaceFilePath: string,
  workspaceRoot?: string,
  scanFrom?: string,
  scanTo?: string,
): Promise<EventDetail | null> {
  const root = await resolveWorkspaceRoot(workspaceRoot);
  const result = await buildEventDetail(root, spaceFilePath, scanFrom, scanTo);
  return result || null;
}

export async function listTodayItems(
  date: string,
  context?: EventContext,
  workspaceRoot?: string,
): Promise<TodayItem[]> {
  const root = await resolveWorkspaceRoot(workspaceRoot);
  const safeContext = normalizeContext(context);
  const result = await adapterListToday(root, date, safeContext);
  return result || [];
}

export async function listStandaloneTasks(
  date: string,
  context?: EventContext,
  workspaceRoot?: string,
): Promise<StandaloneTask[]> {
  const root = await resolveWorkspaceRoot(workspaceRoot);
  const safeContext = normalizeContext(context);
  const result = await adapterListStandalone(root, date, safeContext);
  return result || [];
}
