/**
 * Phase 2 (Topic Spaces) — React Query mutations for mind map node-kind
 * actions and task-space binding.
 *
 * Three node-kind mutations, all returning the updated `MindMap`:
 *   - `usePromoteNodeToTask` — create a real task and bind it to a node
 *   - `useLinkNodeToTask`    — bind a node to an existing task
 *   - `useUpdateNodeKind`    — re-classify a node (tag / branch / etc.)
 *
 * Plus `useUpdateTaskSpace` for the list-view unlink button.
 *
 * The cache updates are intentionally narrow: each mutation only patches
 * the active mind map and the relevant `tasks` query. Anything outside
 * the touched surface (other maps, other spaces) is left alone, so two
 * users editing different maps in different tabs don't fight each
 * other's cache.
 */
import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import {
  mindmapsApi,
  tasksApi,
  type MindMap,
  type MindMapNodeKind,
  type TaskInput,
} from '../api/client';
import { queryKeys } from '../queryKeys';
// ---------------------------------------------------------------------------
// Promote
// ---------------------------------------------------------------------------

export interface PromoteNodeToTaskVars {
  mapId: string;
  nodeId: string;
  date: string;
  context?: string;
}

export function usePromoteNodeToTask(): UseMutationResult<
  MindMap,
  Error,
  PromoteNodeToTaskVars
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ mapId, nodeId, date, context }) =>
      mindmapsApi.promoteNodeToTask(mapId, nodeId, { date, context }),
    onSuccess: (updated) => {
      // The single-map cache is the only authoritative copy of the
      // mind map. Update it in place; the MindMapView resyncs from
      // the response (it already has it via setActiveMap).
      qc.setQueryData(queryKeys.mindmap(updated.id), updated);
      // Tasks for the promote-date are now stale (a new task was
      // created) — invalidate so a refetch picks it up. Also drop
      // the cross-date task source for any topic space so the list
      // view and the mindmap mirror see the new task.
      qc.invalidateQueries({ queryKey: queryKeys.tasksRoot() });
      qc.invalidateQueries({ queryKey: queryKeys.todayItemsRoot() });
      qc.invalidateQueries({ queryKey: queryKeys.eventsRoot() });
      qc.invalidateQueries({ queryKey: queryKeys.topicSpacesRoot(), exact: false });
    },
  });
}

// ---------------------------------------------------------------------------
// Link
// ---------------------------------------------------------------------------

export interface LinkNodeToTaskVars {
  mapId: string;
  nodeId: string;
  taskId: string;
  date: string;
}

export function useLinkNodeToTask(): UseMutationResult<
  MindMap,
  Error,
  LinkNodeToTaskVars
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ mapId, nodeId, taskId, date }) =>
      mindmapsApi.linkNodeToTask(mapId, nodeId, taskId, date),
    onSuccess: (updated) => {
      qc.setQueryData(queryKeys.mindmap(updated.id), updated);
      // The linked task may now appear in a different space's
      // cross-date list and changes from a standalone Today item into an
      // Event-backed item. Refresh both projections immediately.
      qc.invalidateQueries({ queryKey: queryKeys.todayItemsRoot() });
      qc.invalidateQueries({ queryKey: queryKeys.eventsRoot() });
      qc.invalidateQueries({ queryKey: queryKeys.topicSpacesRoot(), exact: false });
    },
  });
}

// ---------------------------------------------------------------------------
// Re-classify (tag / branch / etc.)
// ---------------------------------------------------------------------------

export interface UpdateNodeKindVars {
  mapId: string;
  nodeId: string;
  kind: MindMapNodeKind;
  /** Tag label when `kind === 'tag'`. Ignored otherwise. */
  tag?: string;
}

export function useUpdateNodeKind(): UseMutationResult<
  MindMap,
  Error,
  UpdateNodeKindVars
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ mapId, nodeId, kind, tag }) =>
      mindmapsApi.updateNodeKind(mapId, nodeId, kind, { tag }),
    onSuccess: (updated) => {
      qc.setQueryData(queryKeys.mindmap(updated.id), updated);
    },
  });
}

// ---------------------------------------------------------------------------
// Task ↔ space binding
// ---------------------------------------------------------------------------

export interface UpdateTaskSpaceVars {
  taskId: string;
  spaceId: string | null;
  /**
   * Daily-note date that hosts the task. Required by the server to
   * read-modify-write the `^space:` marker on the task line. Falls
   * back to the task's `source_date` when the caller knows it.
   */
  date: string;
}

export function useUpdateTaskSpace(): UseMutationResult<
  TaskInput,
  Error,
  UpdateTaskSpaceVars
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, spaceId, date }) => tasksApi.updateSpace(taskId, spaceId, date),
    onSuccess: (_updated) => {
      // Whichever tasks list is currently mounted (today + future
      // dates) is now stale; the next render will refetch it. Also
      // drop the cross-date source for every space — the task may
      // have moved between spaces or been detached entirely.
      qc.invalidateQueries({ queryKey: queryKeys.tasksRoot() });
      qc.invalidateQueries({ queryKey: queryKeys.todayItemsRoot() });
      qc.invalidateQueries({ queryKey: queryKeys.eventsRoot() });
      qc.invalidateQueries({ queryKey: queryKeys.topicSpacesRoot(), exact: false });
    },
  });
}
