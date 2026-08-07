/**
 * Topic Spaces diagnostics — detect and report data-integrity issues
 * caused by partial deletions, orphaned cross-references, or schema
 * drift. The output is what the admin / "repair" UI shows to the
 * user (Topic Spaces Phase 4).
 *
 * Detection is read-only and intentionally cheap: a single sweep over
 * every TopicSpace and every MindMap in the workspace. Each issue is
 * returned as a plain object so the route can serialize it.
 *
 * Issue taxonomy (kept stable so the UI can color-code):
 *   - `task_not_found`   — a kind: 'task' node references a taskId that
 *                          does not exist in any daily note on disk.
 *   - `space_not_found`  — a MindMap's `spaceId` points at a space that
 *                          has been deleted (orphan MindMap).
 *   - `space_mindmap_mismatch` — a TopicSpace's `mindmapId` doesn't
 *                          match the inverse `spaceId` of that mindmap.
 */
import { listTopicSpaces } from './topicSpaces.js';
import { listMindMaps, getMindMap } from './mindmaps.js';
import { listDailyNotes, readDailyNote } from './fileSystem.js';
import { loadConfig } from './config.js';

export interface BrokenLinkIssue {
  spaceId?: string;
  mindmapId?: string;
  nodeId?: string;
  taskId?: string;
  reason: 'task_not_found' | 'space_not_found' | 'space_mindmap_mismatch';
  /** Human-readable hint, useful for debugging but not stable for UI. */
  message: string;
}

/**
 * Scan all Topic Spaces and their linked MindMaps for broken links.
 *
 * A broken link is reported once per concrete (mindmap, node, task)
 * triple. The scan is `O(spaces * maps * nodes * dates)` in the worst
 * case because we read each daily note to build a set of live taskIds;
 * in practice this is bounded by the size of a single workspace
 * (hundreds of nodes, tens of daily notes) and runs in a few ms.
 */
export async function findBrokenLinks(): Promise<BrokenLinkIssue[]> {
  const issues: BrokenLinkIssue[] = [];
  const [spaces, maps] = await Promise.all([listTopicSpaces(), listMindMaps()]);

  // Build a set of every task id that exists in any daily note on disk.
  const liveTaskIds = await collectAllTaskIds();
  const liveTaskIdSet = new Set(liveTaskIds);

  // 1. For every kind: 'task' node, check that its taskId still exists.
  for (const map of maps) {
    for (const node of map.nodes) {
      if (node.kind !== 'task') continue;
      if (!node.taskId) continue;
      if (!liveTaskIdSet.has(node.taskId)) {
        issues.push({
          spaceId: map.spaceId,
          mindmapId: map.id,
          nodeId: node.id,
          taskId: node.taskId,
          reason: 'task_not_found',
          message: `Node ${node.id} in map ${map.id} links to missing task ${node.taskId}`,
        });
      }
    }
  }

  // 2. For every MindMap that claims a `spaceId`, check that the
  //    space still exists. The reverse check is implicit — we read
  //    each space's `mindmapId` below.
  const spaceById = new Map(spaces.map(s => [s.id, s] as const));
  for (const map of maps) {
    if (!map.spaceId) continue;
    if (!spaceById.has(map.spaceId)) {
      issues.push({
        mindmapId: map.id,
        spaceId: map.spaceId,
        reason: 'space_not_found',
        message: `MindMap ${map.id} points at missing topic space ${map.spaceId}`,
      });
    }
  }

  // 3. For every Topic Space, verify the reverse link: the linked
  //    MindMap should carry this space's id as its own `spaceId`.
  for (const space of spaces) {
    if (!space.mindmapId) continue;
    const map = await getMindMap(space.mindmapId);
    if (!map) {
      issues.push({
        spaceId: space.id,
        mindmapId: space.mindmapId,
        reason: 'space_mindmap_mismatch',
        message: `Topic space ${space.id} references missing mindmap ${space.mindmapId}`,
      });
      continue;
    }
    if (map.spaceId !== space.id) {
      issues.push({
        spaceId: space.id,
        mindmapId: space.mindmapId,
        reason: 'space_mindmap_mismatch',
        message: `Topic space ${space.id} ↔ mindmap ${map.id} link is asymmetric`,
      });
    }
  }

  return issues;
}

/**
 * High-level counts for the diagnostics summary endpoint. Includes
 * the broken-link count so the UI can show a single badge.
 */
export interface DiagnosticsSummary {
  topicSpaces: number;
  mindmaps: number;
  tasks: number;
  brokenLinks: number;
  orphanMindmaps: number;
}

export async function getDiagnosticsSummary(): Promise<DiagnosticsSummary> {
  const [spaces, maps, taskCount, issues] = await Promise.all([
    listTopicSpaces(),
    listMindMaps(),
    countAllTasks(),
    findBrokenLinks(),
  ]);
  return {
    topicSpaces: spaces.length,
    mindmaps: maps.length,
    tasks: taskCount,
    brokenLinks: issues.length,
    // Orphan mindmaps are a strict subset of issues (those whose
    // `spaceId` doesn't resolve). Counted separately so the UI can
    // show a more useful number than the raw issues array length.
    orphanMindmaps: issues.filter(i => i.reason === 'space_not_found').length,
  };
}

// --- Internal helpers --------------------------------------------------------

async function collectAllTaskIds(): Promise<string[]> {
  const config = await loadConfig();
  const dates = await listDailyNotes(config);
  const out: string[] = [];
  for (const date of dates) {
    const note = await readDailyNote(date, config);
    if (!note) continue;
    for (const t of note.tasks) {
      if (t.id) out.push(t.id);
    }
  }
  return out;
}

async function countAllTasks(): Promise<number> {
  const ids = await collectAllTaskIds();
  return ids.length;
}
