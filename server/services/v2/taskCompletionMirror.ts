/**
 * Task-Completion → MindMap mirror (Sprint 1 Gap 7).
 *
 * Spec intent: "思考过程永远留在原地". When a Task completes, the linked
 * mindmap node is NOT deleted; instead we keep the node alive and write
 * the completion signal back into it (status='done' + a trailing
 * `## 完成` block on the note). The node remains a permanent place
 * where the user can later re-read the reasoning, the outcome, and
 * the timestamp.
 *
 * Storage note: mindmaps live in v1's JSON files
 * (`<workspaceRoot>/.dailyflow/mindmaps/<id>.json`) via
 * `server/services/mindmaps.ts`. The mirror therefore calls into those
 * v1 helpers even though this file lives under `services/v2/`. The
 * `repo` parameter is accepted (and required by the route layer's
 * `getV2(res)` wiring) so the call site reads naturally, but the
 * underlying IO is delegated to the mindmap service.
 *
 * Failure mode: the function never throws on a per-node / per-map
 * failure. Errors are logged and the offending map/node is skipped so
 * the rest of the mirror can proceed. The route layer still wraps the
 * call in try/catch — task completion must NEVER be blocked by a
 * mirror failure (see ROADSHOW_VS_PRODUCT_GAP.md "缺口 7").
 */
import type { V2Repository } from '../../repositories/v2/repository.js';
import {
  getMindMap,
  listMindMaps,
  updateNodeInMindMap,
} from '../mindmaps.js';
import type { MindMapNode } from '../../types/mindmap.js';

export interface CompletionMirrorInput {
  /** The v1 Task id (`t_…`). Mindmap nodes are linked via `taskId`. */
  taskId: string;
  /** YYYY-MM-DD; recorded on the node so the completion is dated. */
  taskDate?: string;
  /** ISO timestamp at which the task completed. */
  completedAt: string;
  /** Free-form outcome summary from `Outcome.summary`. */
  outcomeSummary?: string;
}

export interface MirrorResult {
  /** Every mindmap node id that received the completion back-write. */
  mirroredNodeIds: string[];
  /** Every mindmap id that contained at least one linked node. */
  mindmapIds: string[];
}

/**
 * Walk every mindmap in the workspace and, for each node whose
 * `kind === 'task'` AND `taskId === input.taskId`, persist:
 *
 *   - `status: 'done'`
 *   - `note`: existing note + a fresh `## 完成` block (timestamp + summary)
 *   - `taskDate`: re-stamped (only if the caller passed a date)
 *
 * The function is idempotent: calling it twice produces the same end
 * state (status stays `done`; the note block is appended twice, which
 * is intentional — the user can see re-synced completions over time
 * without losing history).
 */
export async function mirrorTaskCompletionToMindmap(
  _repo: V2Repository,
  input: CompletionMirrorInput,
): Promise<MirrorResult> {
  const { taskId, taskDate, completedAt, outcomeSummary } = input;
  if (!taskId) {
    // Defensive: an empty taskId would silently flip every task-kind
    // node in every map. Bail early.
    console.warn('[task-mirror] mirrorTaskCompletionToMindmap called with empty taskId; skipping');
    return { mirroredNodeIds: [], mindmapIds: [] };
  }

  const summaryList = await listMindMaps();
  const mirroredNodeIds: string[] = [];
  const mindmapIds: string[] = [];
  const completionBlock = formatCompletionBlock(completedAt, outcomeSummary);

  for (const summary of summaryList) {
    let map;
    try {
      map = await getMindMap(summary.id);
    } catch (err) {
      console.warn(`[task-mirror] failed to read mindmap ${summary.id}:`, err);
      continue;
    }
    if (!map) continue;

    const matches = map.nodes.filter(
      (n) => n.kind === 'task' && (
        n.taskId === taskId
        || n.entityRefs?.some((ref) => ref.type === 'commitment' && ref.id === taskId)
      ),
    );
    if (matches.length === 0) continue;

    let touchedThisMap = false;
    for (const node of matches) {
      try {
        const patch = buildNodePatch(node, completionBlock, taskDate);
        const updated = await updateNodeInMindMap(map.id, node.id, patch);
        if (updated) {
          mirroredNodeIds.push(node.id);
          touchedThisMap = true;
        } else {
          // Map or node vanished between listMindMaps() and the
          // update — benign race, just skip.
          console.warn(`[task-mirror] updateNodeInMindMap returned null for ${map.id}/${node.id}`);
        }
      } catch (err) {
        console.warn(
          `[task-mirror] failed to update node ${node.id} in mindmap ${map.id}:`,
          err,
        );
      }
    }

    if (touchedThisMap && !mindmapIds.includes(map.id)) {
      mindmapIds.push(map.id);
    }
  }

  return { mirroredNodeIds, mindmapIds };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * Build the human-readable completion block that gets appended to the
 * node note. Two blank lines so it stands out from any prior content
 * (existing notes end with a newline in most cases; the leading blank
 * lines also defend against notes that don't).
 *
 * Example:
 *
 *     ## 完成 · 2026-08-20
 *     _完成时间：2026-08-20T09:15:00.000Z_
 *
 *     用户已确认 v2 路线图并归档
 */
export function formatCompletionBlock(
  completedAt: string,
  outcomeSummary?: string,
): string {
  const date = extractDateOnly(completedAt);
  const lines: string[] = [];
  lines.push(`## 完成 · ${date}`);
  lines.push(`_完成时间：${completedAt}_`);
  if (outcomeSummary && outcomeSummary.trim().length > 0) {
    lines.push('');
    lines.push(outcomeSummary.trim());
  }
  return lines.join('\n');
}

/**
 * Append the completion block to an existing note. We always append
 * (never overwrite) — the node's prior reasoning / links / drafts are
 * preserved. If the existing note lacks a trailing newline, we add
 * one so the appended block reads as a clean paragraph.
 */
export function appendCompletionNote(
  existingNote: string | undefined,
  block: string,
): string {
  if (!existingNote) return block;
  const trimmed = existingNote.endsWith('\n') ? existingNote : `${existingNote}\n`;
  return `${trimmed}\n${block}\n`;
}

/**
 * Build the patch we hand to `updateNodeInMindMap`. We only override
 * keys that should change; `kind`, `tags`, `position`, etc. are left
 * alone so the canvas keeps rendering exactly the same shape.
 */
function buildNodePatch(
  node: MindMapNode,
  completionBlock: string,
  taskDate?: string,
): Partial<MindMapNode> {
  const patch: Partial<MindMapNode> = {
    status: 'done',
    note: appendCompletionNote(node.note, completionBlock),
  };
  if (taskDate) patch.taskDate = taskDate;
  return patch;
}

function extractDateOnly(iso: string): string {
  // We tolerate either an ISO datetime or a plain YYYY-MM-DD; the
  // fallback uses the original string so the user still sees something
  // sensible in the note.
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso);
  return m ? m[1] : iso;
}
