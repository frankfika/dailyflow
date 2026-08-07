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
      // created) — invalidate so a refetch picks it up.
      qc.invalidateQueries({ queryKey: queryKeys.tasksRoot() });
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
}

export function useUpdateTaskSpace(): UseMutationResult<
  TaskInput,
  Error,
  UpdateTaskSpaceVars
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, spaceId }) => tasksApi.updateSpace(taskId, spaceId),
    onSuccess: (_updated) => {
      // Whichever tasks list is currently mounted (today + future
      // dates) is now stale; the next render will refetch it.
      qc.invalidateQueries({ queryKey: queryKeys.tasksRoot() });
    },
  });
}
