import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import {
  eventsApi,
  dispatchDomainEvent,
  DOMAIN_EVENTS,
  mindmapsApi,
  type CompleteNodeTaskInput,
  type ConvertStandaloneToEventNodeTaskInput,
  type CreateTaskForNodeInput,
  type EditNodeTaskInput,
  type EventDetail,
  type EventNode,
  type EventSummary,
  type StandaloneTask,
  type TodayItem,
  type UndoCompleteNodeTaskInput,
  type UndoConvertStandaloneToEventNodeTaskInput,
} from '../../../api/client';
import { queryKeys } from '../../../queryKeys';
import { ulid } from 'ulid';
import { layoutEventTree } from '../events/nodePlacement';
import { MAP_WRITE_SCOPE, dropEventMap, readEventMap, writeEventMap } from './mindMapCache';
import { planChildPosition, planSiblingPlacement } from '../events/nodePlacement';

export interface CreateEventInput {
  title: string;
  context: 'work' | 'life';
}

export function useEvents(opts?: { from?: string; to?: string }): UseQueryResult<{ events: EventSummary[] }> {
  return useQuery({
    queryKey: queryKeys.events({ from: opts?.from ?? null, to: opts?.to ?? null }),
    queryFn: () => eventsApi.list(opts?.from, opts?.to),
    staleTime: 15_000,
    refetchOnMount: 'always',
    retry: 1,
  });
}

export function useEventById(id: string | null | undefined): UseQueryResult<{ event: EventDetail | null }> {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.event(id ?? ''),
    queryFn: () => eventsApi.getById(id as string),
    enabled: Boolean(id),
    staleTime: 10_000,
    refetchOnMount: 'always',
    retry: 1,
  });
  // When an event first loads for a *freshly opened* event, the underlying
  // MindMap may have been edited on disk in the meantime (e.g. in MindMap
  // view) since we last cached a full-map snapshot. Drop the snapshot so the
  // first mutation resyncs from the server instead of clobbering those edits.
  // We key on the eventId we've already seeded so refetches *during* an active
  // edit session don't drop the fresh snapshot the mutations just wrote. The
  // ref resets on remount, so each time the Events surface re-opens this
  // event it re-arms.
  const lastSeededEventIdRef = useRef<string | null>(null);
  const event = query.data?.event;
  useEffect(() => {
    const mindmapId = event?.mindmapId;
    if (!mindmapId) return;
    if (lastSeededEventIdRef.current !== event.id) {
      lastSeededEventIdRef.current = event.id;
      dropEventMap(qc, mindmapId);
    }
  }, [event, qc]);
  return query;
}

export function useTodayItems(date: string, context?: 'work' | 'life'): UseQueryResult<{ items: TodayItem[] }> {
  return useQuery({
    queryKey: [...queryKeys.todayItems(date, 'v2'), context ?? 'all'],
    queryFn: () => eventsApi.listTodayItems(date, context),
    staleTime: 10_000,
    retry: 1,
  });
}

export function useStandaloneTasks(opts?: { from?: string; to?: string }): UseQueryResult<{ tasks: StandaloneTask[] }> {
  return useQuery({
    queryKey: queryKeys.standaloneTasks({ from: opts?.from ?? null, to: opts?.to ?? null }),
    queryFn: () => eventsApi.listStandaloneTasks(opts?.from, opts?.to),
    staleTime: 15_000,
    retry: 1,
  });
}

/** Create the Event and its root canvas in one command. */
export function useCreateEvent(): UseMutationResult<
  { id: string },
  Error,
  CreateEventInput
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ title, context }) => {
      const event = await eventsApi.create({ title: title.trim(), context });
      return { id: event.id };
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.eventsRoot() }),
        qc.invalidateQueries({ queryKey: queryKeys.topicSpacesRoot(), exact: false }),
      ]);
    },
  });
}

export function useScheduleEventNode(): UseMutationResult<
  void,
  Error,
  { eventId: string; mindmapId: string; nodeId: string; date: string; taskId?: string; fromDate?: string }
> {
  const qc = useQueryClient();
  return useMutation({
    scope: MAP_WRITE_SCOPE,
    mutationFn: async ({ mindmapId, nodeId, date, taskId, fromDate }) => {
      if (taskId && fromDate && fromDate !== date) {
        await eventsApi.rescheduleNodeTask({ taskId, fromDate, toDate: date, mindmapId, nodeId });
        return;
      }
      if (!taskId) {
        const updated = await mindmapsApi.promoteNodeToTask(mindmapId, nodeId, { date });
        writeEventMap(qc, updated);
      }
    },
    onSuccess: (_data, vars) => {
      invalidateCommonAfterWrite(qc, {
        eventId: vars.eventId,
        scheduledDate: vars.date,
        mindmapId: vars.mindmapId,
      });
      if (vars.fromDate && vars.fromDate !== vars.date) {
        qc.invalidateQueries({ queryKey: queryKeys.todayItems(vars.fromDate, 'v2') });
      }
    },
    // rescheduleNodeTask returns only a boolean; the map on disk changed, so
    // don't trust the snapshot after a failed reschedule either.
    onError: (_err, vars) => dropEventMap(qc, vars.mindmapId),
  });
}

export function useUnscheduleEventNode(): UseMutationResult<
  { unscheduled: boolean; alreadyUnscheduled: boolean },
  Error,
  { eventId: string; mindmapId: string; nodeId: string; taskId: string; scheduledDate: string }
> {
  const qc = useQueryClient();
  return useMutation({
    scope: MAP_WRITE_SCOPE,
    mutationFn: ({ mindmapId, nodeId, taskId, scheduledDate }) =>
      eventsApi.unscheduleNodeTask({ mindmapId, nodeId, taskId, scheduledDate }),
    onSuccess: (_data, vars) => invalidateCommonAfterWrite(qc, vars),
    onError: (_err, vars) => dropEventMap(qc, vars.mindmapId),
  });
}

// ---------------------------------------------------------------------------
// Mutations (§4.4 write contract + §5 cache invalidation rules)
// ---------------------------------------------------------------------------

function invalidateCommonAfterWrite(qc: ReturnType<typeof useQueryClient>, vars: { scheduledDate: string; eventId?: string; mindmapId?: string }) {
  qc.invalidateQueries({ queryKey: queryKeys.eventsRoot() });
  qc.invalidateQueries({ queryKey: queryKeys.todayItems(vars.scheduledDate, 'v2') });
  qc.invalidateQueries({ queryKey: queryKeys.tasksRoot() });
  qc.invalidateQueries({ queryKey: queryKeys.standaloneTasks() });
  if (vars.eventId) qc.invalidateQueries({ queryKey: queryKeys.event(vars.eventId) });
  // These paths mutate map nodes server-side (kind/taskId/status). We don't
  // know the exact post-state, so drop the snapshot rather than write a guess.
  if (vars.mindmapId) dropEventMap(qc, vars.mindmapId);
  dispatchDomainEvent(DOMAIN_EVENTS.tasksChanged, { date: vars.scheduledDate });
}

export function useCreateTaskForNode(): UseMutationResult<
  { taskId: string; appended: boolean; alreadyPresent: boolean },
  Error,
  CreateTaskForNodeInput
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input) => eventsApi.createTaskForNode(input),
    onSuccess: (_data, vars) => invalidateCommonAfterWrite(qc, vars),
  });
}

export function useEditNodeTask(): UseMutationResult<
  { updated: boolean; taskLine?: string },
  Error,
  EditNodeTaskInput
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input) => eventsApi.editNodeTask(input),
    onSuccess: (_data, vars) => invalidateCommonAfterWrite(qc, vars),
  });
}

export function useCompleteNodeTask(): UseMutationResult<
  { completed: boolean; alreadyDone: boolean },
  Error,
  CompleteNodeTaskInput & { eventId?: string; nodeId?: string }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input) => eventsApi.completeNodeTask({ taskId: input.taskId, scheduledDate: input.scheduledDate }),
    onMutate: async (vars) => {
      if (!vars.eventId || !vars.nodeId) return undefined;
      const key = queryKeys.event(vars.eventId);
      const prev = qc.getQueryData<{ event: EventDetail | null }>(key);
      if (!prev?.event) return undefined;
      const exists = prev.event.nodes.some((n) => n.id === vars.nodeId && n.execution?.taskId === vars.taskId);
      if (!exists) return undefined;
      qc.setQueryData<{ event: EventDetail | null }>(key, {
        event: {
          ...prev.event,
          nodes: prev.event.nodes.map((n) =>
            n.id === vars.nodeId && n.execution
              ? { ...n, execution: { ...n.execution, status: 'done' as const, completedAt: new Date().toISOString() } }
              : n,
          ),
        },
      });
      return { prev };
    },
    onError: (_err, vars, context) => {
      if (context?.prev && vars.eventId) qc.setQueryData(queryKeys.event(vars.eventId), context.prev);
    },
    onSuccess: (_data, vars) => invalidateCommonAfterWrite(qc, vars),
  });
}

export function useUndoCompleteNodeTask(): UseMutationResult<
  { undone: boolean; alreadyTodo: boolean },
  Error,
  UndoCompleteNodeTaskInput & { eventId?: string; nodeId?: string }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input) => eventsApi.undoCompleteNodeTask({ taskId: input.taskId, scheduledDate: input.scheduledDate }),
    onMutate: async (vars) => {
      if (!vars.eventId || !vars.nodeId) return undefined;
      const key = queryKeys.event(vars.eventId);
      const prev = qc.getQueryData<{ event: EventDetail | null }>(key);
      if (!prev?.event) return undefined;
      const exists = prev.event.nodes.some((n) => n.id === vars.nodeId && n.execution?.taskId === vars.taskId);
      if (!exists) return undefined;
      qc.setQueryData<{ event: EventDetail | null }>(key, {
        event: {
          ...prev.event,
          nodes: prev.event.nodes.map((n) =>
            n.id === vars.nodeId && n.execution
              ? { ...n, execution: { ...n.execution, status: 'todo' as const, completedAt: undefined } }
              : n,
          ),
        },
      });
      return { prev };
    },
    onError: (_err, vars, context) => {
      if (context?.prev && vars.eventId) qc.setQueryData(queryKeys.event(vars.eventId), context.prev);
    },
    onSuccess: (_data, vars) => invalidateCommonAfterWrite(qc, vars),
  });
}

export function useConvertStandaloneToEventNodeTask(): UseMutationResult<
  { converted: boolean; alreadyConverted: boolean; spaceLinked: boolean },
  Error,
  ConvertStandaloneToEventNodeTaskInput
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input) => eventsApi.convertStandaloneToEventNodeTask(input),
    onSuccess: (_data, vars) => invalidateCommonAfterWrite(qc, vars),
  });
}

export function useUndoConvertStandaloneToEventNodeTask(): UseMutationResult<
  { reverted: boolean; alreadyStandalone: boolean; removedFromSpace: boolean },
  Error,
  UndoConvertStandaloneToEventNodeTaskInput
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input) => eventsApi.undoConvertStandaloneToEventNodeTask(input),
    onSuccess: (_data, vars) => invalidateCommonAfterWrite(qc, vars),
  });
}

type EventMapMutationContext = { eventId: string; mindmapId: string; nodeId?: string };

/**
 * Topology mutations (add child/sibling, rename, delete, move, outdent,
 * reorder, reposition) all `writeEventMap` the PUT response on success, so
 * the snapshot is the freshest full map the server just returned. KEEP it:
 * dropping it here forces the next mutation to re-GET the whole map, which
 * is exactly the "不丝滑" lag the snapshot cache exists to avoid. The
 * event/events queries are still invalidated so derived view state refreshes.
 */
function invalidateEventMap(qc: ReturnType<typeof useQueryClient>, vars: EventMapMutationContext) {
  qc.invalidateQueries({ queryKey: queryKeys.event(vars.eventId) });
  qc.invalidateQueries({ queryKey: queryKeys.eventsRoot() });
}

function getSubtreeIds(edges: { id: string; source: string; target: string }[], rootId: string): Set<string> {
  const ids = new Set<string>([rootId]);
  const queue = [rootId];
  while (queue.length) {
    const current = queue.shift()!;
    for (const edge of edges) {
      if (edge.source === current && !ids.has(edge.target)) {
        ids.add(edge.target);
        queue.push(edge.target);
      }
    }
  }
  return ids;
}

/** Add a plain child node without exposing legacy node kinds in Event UI. */
export function useAddEventChild(): UseMutationResult<
  { nodeId: string },
  Error,
  EventMapMutationContext & { parentId: string; text: string }
> {
  const qc = useQueryClient();
  return useMutation({
    scope: MAP_WRITE_SCOPE,
    mutationFn: async ({ mindmapId, parentId, text, nodeId }) => {
      const map = await readEventMap(qc, mindmapId, [parentId]);
      const parent = map.nodes.find((node) => node.id === parentId);
      if (!parent) throw new Error('Parent node no longer exists');
      const childNodeId = nodeId ?? `node_${ulid()}`;
      const node = {
        id: childNodeId,
        text: text.trim() || 'New step',
        position: planChildPosition(map.nodes, map.edges, parent),
        kind: 'branch' as const,
      };
      const updated = await mindmapsApi.update(mindmapId, {
        nodes: [...map.nodes, node],
        edges: [...map.edges, { id: `edge_${ulid()}`, source: parentId, target: childNodeId }],
      });
      writeEventMap(qc, updated);
      return { nodeId: childNodeId };
    },
    onMutate: async (vars) => {
      const nodeId = vars.nodeId ?? '';
      if (!nodeId) return undefined;
      const key = queryKeys.event(vars.eventId);
      const prev = qc.getQueryData<{ event: EventDetail | null }>(key);
      if (!prev?.event) return undefined;
      const parent = prev.event.nodes.find((n) => n.id === vars.parentId);
      if (!parent) return undefined;
      const newNode: EventNode = {
        id: nodeId,
        eventId: vars.eventId,
        parentId: vars.parentId,
        text: vars.text.trim() || 'New step',
        position: planChildPosition(prev.event.nodes, prev.event.edges, parent),
        manualTags: [],
        aiTags: [],
      };
      qc.setQueryData<{ event: EventDetail | null }>(key, {
        event: {
          ...prev.event,
          nodes: [...prev.event.nodes, newNode],
          edges: [...prev.event.edges, { id: `edge_${ulid()}`, source: vars.parentId, target: nodeId }],
        },
      });
      return { prev };
    },
    onError: (_err, vars, context) => {
      if (context?.prev) qc.setQueryData(queryKeys.event(vars.eventId), context.prev);
      dropEventMap(qc, vars.mindmapId);
    },
    onSuccess: (_data, vars) => invalidateEventMap(qc, vars),
  });
}

/** Add a sibling node right after the reference node, shifting later siblings down. */
export function useAddEventSibling(): UseMutationResult<
  { nodeId: string },
  Error,
  EventMapMutationContext & { referenceId: string; text: string }
> {
  const qc = useQueryClient();
  return useMutation({
    scope: MAP_WRITE_SCOPE,
    mutationFn: async ({ mindmapId, referenceId, text, nodeId }) => {
      const map = await readEventMap(qc, mindmapId, [referenceId]);
      const refNode = map.nodes.find((node) => node.id === referenceId);
      if (!refNode) throw new Error('Reference node no longer exists');
      const parentEdge = map.edges.find((edge) => edge.target === referenceId);
      if (!parentEdge) throw new Error('Cannot add a sibling to the root node');
      const parentId = parentEdge.source;

      const childEdges = map.edges.filter((edge) => edge.source === parentId);
      void childEdges;
      const siblingNodeId = nodeId ?? `node_${ulid()}`;
      const placement = planSiblingPlacement(map.nodes, map.edges, referenceId);
      const newNode = {
        id: siblingNodeId,
        text: text.trim() || 'New step',
        position: placement.position,
        kind: 'branch' as const,
      };

      const nextNodes = map.nodes.map((node) => {
        const shift = placement.shifts.get(node.id);
        return shift ? { ...node, position: shift } : node;
      });
      nextNodes.push(newNode);

      const updated = await mindmapsApi.update(mindmapId, {
        nodes: nextNodes,
        edges: [...map.edges, { id: `edge_${ulid()}`, source: parentId, target: siblingNodeId }],
      });
      writeEventMap(qc, updated);
      return { nodeId: siblingNodeId };
    },
    onMutate: async (vars) => {
      const nodeId = vars.nodeId ?? '';
      if (!nodeId) return undefined;
      const key = queryKeys.event(vars.eventId);
      const prev = qc.getQueryData<{ event: EventDetail | null }>(key);
      if (!prev?.event) return undefined;
      const refNode = prev.event.nodes.find((n) => n.id === vars.referenceId);
      const parentEdge = prev.event.edges.find((edge) => edge.target === vars.referenceId);
      if (!refNode || !parentEdge) return undefined;
      const parentId = parentEdge.source;

      const placement = planSiblingPlacement(prev.event.nodes, prev.event.edges, vars.referenceId);
      const newNode: EventNode = {
        id: nodeId,
        eventId: vars.eventId,
        parentId,
        text: vars.text.trim() || 'New step',
        position: placement.position,
        manualTags: [],
        aiTags: [],
      };

      const nextNodes = prev.event.nodes.map((n) => {
        const shift = placement.shifts.get(n.id);
        return shift ? { ...n, position: shift } : n;
      });
      nextNodes.push(newNode);

      qc.setQueryData<{ event: EventDetail | null }>(key, {
        event: {
          ...prev.event,
          nodes: nextNodes,
          edges: [...prev.event.edges, { id: `edge_${ulid()}`, source: parentId, target: nodeId }],
        },
      });
      return { prev };
    },
    onError: (_err, vars, context) => {
      if (context?.prev) qc.setQueryData(queryKeys.event(vars.eventId), context.prev);
      dropEventMap(qc, vars.mindmapId);
    },
    onSuccess: (_data, vars) => invalidateEventMap(qc, vars),
  });
}

export function useRenameEventNode(): UseMutationResult<
  void,
  Error,
  EventMapMutationContext & { nodeId: string; text: string }
> {
  const qc = useQueryClient();
  return useMutation({
    scope: MAP_WRITE_SCOPE,
    mutationFn: async ({ mindmapId, nodeId, text }) => {
      const map = await readEventMap(qc, mindmapId, [nodeId]);
      const nodes = map.nodes.map((node) => node.id === nodeId ? { ...node, text: text.trim() || node.text } : node);
      const updated = await mindmapsApi.update(mindmapId, { nodes });
      writeEventMap(qc, updated);
    },
    onMutate: async (vars) => {
      const key = queryKeys.event(vars.eventId);
      const prev = qc.getQueryData<{ event: EventDetail | null }>(key);
      if (!prev?.event) return undefined;
      const exists = prev.event.nodes.some((n) => n.id === vars.nodeId);
      if (!exists) return undefined;
      qc.setQueryData<{ event: EventDetail | null }>(key, {
        event: {
          ...prev.event,
          nodes: prev.event.nodes.map((n) => (n.id === vars.nodeId ? { ...n, text: vars.text.trim() || n.text } : n)),
        },
      });
      return { prev };
    },
    onError: (_err, vars, context) => {
      if (context?.prev) qc.setQueryData(queryKeys.event(vars.eventId), context.prev);
      dropEventMap(qc, vars.mindmapId);
    },
    onSuccess: (_data, vars) => invalidateEventMap(qc, vars),
  });
}

export function useDeleteEventNode(): UseMutationResult<
  void,
  Error,
  EventMapMutationContext & { nodeId: string }
> {
  const qc = useQueryClient();
  return useMutation({
    scope: MAP_WRITE_SCOPE,
    mutationFn: async ({ mindmapId, nodeId }) => {
      const updated = await mindmapsApi.deleteNodeSubtree(mindmapId, nodeId, 'keep-tasks');
      writeEventMap(qc, updated);
    },
    onMutate: async (vars) => {
      const key = queryKeys.event(vars.eventId);
      const prev = qc.getQueryData<{ event: EventDetail | null }>(key);
      if (!prev?.event) return undefined;
      const removeIds = new Set<string>([vars.nodeId]);
      for (const id of getSubtreeIds(prev.event.edges, vars.nodeId)) removeIds.add(id);
      qc.setQueryData<{ event: EventDetail | null }>(key, {
        event: {
          ...prev.event,
          nodes: prev.event.nodes.filter((n) => !removeIds.has(n.id)),
          edges: prev.event.edges.filter((e) => !removeIds.has(e.source) && !removeIds.has(e.target)),
        },
      });
      return { prev };
    },
    onError: (_err, vars, context) => {
      if (context?.prev) qc.setQueryData(queryKeys.event(vars.eventId), context.prev);
      dropEventMap(qc, vars.mindmapId);
    },
    onSuccess: (_data, vars) => invalidateEventMap(qc, vars),
  });
}

/**
 * Outdent: move `nodeId` up one level so it becomes a sibling of its current
 * parent (right after the parent). The subtree moves with it. Root and
 * top-level nodes cannot be outdented further.
 */
export function useOutdentEventNode(): UseMutationResult<
  { outdented: boolean },
  Error,
  EventMapMutationContext & { nodeId: string }
> {
  const qc = useQueryClient();
  return useMutation({
    scope: MAP_WRITE_SCOPE,
    mutationFn: async ({ mindmapId, nodeId }) => {
      const map = await readEventMap(qc, mindmapId, [nodeId]);
      const parentEdge = map.edges.find((edge) => edge.target === nodeId);
      if (!parentEdge) return { outdented: false };
      const parentId = parentEdge.source;
      const grandEdge = map.edges.find((edge) => edge.target === parentId);
      if (!grandEdge) return { outdented: false };
      const grandId = grandEdge.source;

      const subtreeIds = getSubtreeIds(map.edges, nodeId);
      const refNode = map.nodes.find((n) => n.id === parentId);

      const movedPositions = new Map<string, { x: number; y: number }>();
      const refX = refNode?.position.x ?? 0;
      const refY = (refNode?.position.y ?? 0) + 104;
      const baseY = map.nodes.find((n) => n.id === nodeId)?.position.y ?? 0;
      for (const id of subtreeIds) {
        const node = map.nodes.find((n) => n.id === id);
        if (!node) continue;
        const offsetY = node.position.y - baseY;
        movedPositions.set(id, { x: id === nodeId ? refX : node.position.x, y: refY + offsetY });
      }

      const nextNodes = map.nodes.map((node) => {
        const moved = movedPositions.get(node.id);
        return moved ? { ...node, position: moved } : node;
      });

      const nextEdges = map.edges
        .filter((edge) => !(edge.source === parentId && edge.target === nodeId))
        .concat([{ id: `edge_${ulid()}`, source: grandId, target: nodeId }]);

      const updated = await mindmapsApi.update(mindmapId, { nodes: nextNodes, edges: nextEdges });
      writeEventMap(qc, updated);
      return { outdented: true };
    },
    onMutate: async (vars) => {
      const key = queryKeys.event(vars.eventId);
      const prev = qc.getQueryData<{ event: EventDetail | null }>(key);
      if (!prev?.event) return undefined;
      const parentEdge = prev.event.edges.find((edge) => edge.target === vars.nodeId);
      if (!parentEdge) return undefined;
      const parentId = parentEdge.source;
      const grandEdge = prev.event.edges.find((edge) => edge.target === parentId);
      if (!grandEdge) return undefined;
      const grandId = grandEdge.source;
      const subtreeIds = getSubtreeIds(prev.event.edges, vars.nodeId);
      const refNode = prev.event.nodes.find((n) => n.id === parentId);
      const refX = refNode?.position.x ?? 0;
      const refY = (refNode?.position.y ?? 0) + 104;
      const baseY = prev.event.nodes.find((n) => n.id === vars.nodeId)?.position.y ?? 0;
      const movedPositions = new Map<string, { x: number; y: number }>();
      for (const id of subtreeIds) {
        const node = prev.event.nodes.find((n) => n.id === id);
        if (!node) continue;
        const offsetY = node.position.y - baseY;
        movedPositions.set(id, { x: id === vars.nodeId ? refX : node.position.x, y: refY + offsetY });
      }
      qc.setQueryData<{ event: EventDetail | null }>(key, {
        event: {
          ...prev.event,
          nodes: prev.event.nodes.map((n) => {
            const moved = movedPositions.get(n.id);
            return moved ? { ...n, position: moved, parentId: n.id === vars.nodeId ? grandId : n.parentId } : n;
          }),
          edges: prev.event.edges
            .filter((e) => !(e.source === parentId && e.target === vars.nodeId))
            .concat([{ id: `edge_${ulid()}`, source: grandId, target: vars.nodeId }]),
        },
      });
      return { prev };
    },
    onError: (_err, vars, context) => {
      if (context?.prev) qc.setQueryData(queryKeys.event(vars.eventId), context.prev);
      dropEventMap(qc, vars.mindmapId);
    },
    onSuccess: (_data, vars) => invalidateEventMap(qc, vars),
  });
}

/**
 * Move (reparent) `nodeId` under `newParentId`. Prevents moving a node
 * into its own descendant subtree or onto itself.
 */
export function useMoveEventNode(): UseMutationResult<
  { moved: boolean },
  Error,
  EventMapMutationContext & { nodeId: string; newParentId: string }
> {
  const qc = useQueryClient();
  return useMutation({
    scope: MAP_WRITE_SCOPE,
    mutationFn: async ({ mindmapId, nodeId, newParentId }) => {
      if (nodeId === newParentId) return { moved: false };
      const map = await readEventMap(qc, mindmapId, [nodeId, newParentId]);
      const subtreeIds = getSubtreeIds(map.edges, nodeId);
      if (subtreeIds.has(newParentId)) return { moved: false };

      const oldEdge = map.edges.find((e) => e.target === nodeId);
      if (oldEdge?.source === newParentId) return { moved: false };

      const newParent = map.nodes.find((n) => n.id === newParentId);
      if (!newParent) throw new Error('Target parent not found');

      const siblings = map.edges
        .filter((e) => e.source === newParentId)
        .map((e) => map.nodes.find((n) => n.id === e.target))
        .filter((n): n is NonNullable<typeof n> => Boolean(n));
      const newY = siblings.length
        ? Math.max(...siblings.map((s) => s.position.y)) + 104
        : newParent.position.y;

      const nextNodes = map.nodes.map((n) =>
        n.id === nodeId
          ? { ...n, position: { x: newParent.position.x + 300, y: newY } }
          : n,
      );
      const nextEdges = map.edges
        .filter((e) => e.target !== nodeId)
        .concat([{ id: `edge_${ulid()}`, source: newParentId, target: nodeId }]);

      const updated = await mindmapsApi.update(mindmapId, { nodes: nextNodes, edges: nextEdges });
      writeEventMap(qc, updated);
      return { moved: true };
    },
    onMutate: async (vars) => {
      const key = queryKeys.event(vars.eventId);
      const prev = qc.getQueryData<{ event: EventDetail | null }>(key);
      if (!prev?.event) return undefined;
      if (vars.nodeId === vars.newParentId) return undefined;

      const subtreeIds = getSubtreeIds(prev.event.edges, vars.nodeId);
      if (subtreeIds.has(vars.newParentId)) return undefined;

      const oldEdge = prev.event.edges.find((e) => e.target === vars.nodeId);
      if (oldEdge?.source === vars.newParentId) return undefined;

      const newParent = prev.event.nodes.find((n) => n.id === vars.newParentId);
      if (!newParent) return undefined;

      const siblings = prev.event.edges
        .filter((e) => e.source === vars.newParentId)
        .map((e) => prev.event!.nodes.find((n) => n.id === e.target))
        .filter((n): n is EventNode => Boolean(n));
      const newY = siblings.length
        ? Math.max(...siblings.map((s) => s.position.y)) + 104
        : newParent.position.y;

      qc.setQueryData<{ event: EventDetail | null }>(key, {
        event: {
          ...prev.event,
          nodes: prev.event.nodes.map((n) =>
            n.id === vars.nodeId
              ? { ...n, parentId: vars.newParentId, position: { x: newParent.position.x + 300, y: newY } }
              : n,
          ),
          edges: prev.event.edges
            .filter((e) => e.target !== vars.nodeId)
            .concat([{ id: `edge_${ulid()}`, source: vars.newParentId, target: vars.nodeId }]),
        },
      });
      return { prev };
    },
    onError: (_err, vars, context) => {
      if (context?.prev) qc.setQueryData(queryKeys.event(vars.eventId), context.prev);
      dropEventMap(qc, vars.mindmapId);
    },
    onSuccess: (_data, vars) => invalidateEventMap(qc, vars),
  });
}

/**
 * Free-position a single node on the canvas. Used by the drag-to-move gesture
 * in EventCanvas; persisted positions are the source of truth so the canvas
 * can be panned / zoomed without losing the layout the user arranged.
 */
export function useUpdateNodePosition(): UseMutationResult<
  { moved: boolean },
  Error,
  EventMapMutationContext & { nodeId: string; x: number; y: number }
> {
  const qc = useQueryClient();
  return useMutation({
    scope: MAP_WRITE_SCOPE,
    mutationFn: async ({ mindmapId, nodeId, x, y }) => {
      const map = await readEventMap(qc, mindmapId, [nodeId]);
      const exists = map.nodes.some((n) => n.id === nodeId);
      if (!exists) return { moved: false };
      const nextNodes = map.nodes.map((n) =>
        n.id === nodeId ? { ...n, position: { x, y } } : n,
      );
      const updated = await mindmapsApi.update(mindmapId, { nodes: nextNodes, edges: map.edges });
      writeEventMap(qc, updated);
      return { moved: true };
    },
    onMutate: async (vars) => {
      const key = queryKeys.event(vars.eventId);
      const prev = qc.getQueryData<{ event: EventDetail | null }>(key);
      if (!prev?.event) return undefined;
      qc.setQueryData<{ event: EventDetail | null }>(key, {
        event: {
          ...prev.event,
          nodes: prev.event.nodes.map((n) =>
            n.id === vars.nodeId ? { ...n, position: { x: vars.x, y: vars.y } } : n,
          ),
        },
      });
      return { prev };
    },
    onError: (_err, vars, context) => {
      if (context?.prev) qc.setQueryData(queryKeys.event(vars.eventId), context.prev);
      dropEventMap(qc, vars.mindmapId);
    },
    onSuccess: (_data, vars) => invalidateEventMap(qc, vars),
  });
}

/**
 * Reorder `nodeId` among its siblings — swap y-positions with the adjacent
 * sibling in the given direction. The entire subtree moves with the node.
 */
export function useReorderEventNode(): UseMutationResult<
  { reordered: boolean },
  Error,
  EventMapMutationContext & { nodeId: string; direction: 'up' | 'down' }
> {
  const qc = useQueryClient();
  return useMutation({
    scope: MAP_WRITE_SCOPE,
    mutationFn: async ({ mindmapId, nodeId, direction }) => {
      const map = await readEventMap(qc, mindmapId, [nodeId]);
      const parentEdge = map.edges.find((e) => e.target === nodeId);
      if (!parentEdge) return { reordered: false };
      const parentId = parentEdge.source;

      const children = map.edges
        .filter((e) => e.source === parentId)
        .map((e) => map.nodes.find((n) => n.id === e.target))
        .filter((n): n is NonNullable<typeof n> => Boolean(n))
        .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);

      const idx = children.findIndex((n) => n.id === nodeId);
      if (idx < 0) return { reordered: false };
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= children.length) return { reordered: false };

      const nodeA = children[idx];
      const nodeB = children[swapIdx];
      const delta = nodeB.position.y - nodeA.position.y;

      const subtreeA = getSubtreeIds(map.edges, nodeA.id);
      const subtreeB = getSubtreeIds(map.edges, nodeB.id);

      const nextNodes = map.nodes.map((n) => {
        if (subtreeA.has(n.id)) return { ...n, position: { x: n.position.x, y: n.position.y + delta } };
        if (subtreeB.has(n.id)) return { ...n, position: { x: n.position.x, y: n.position.y - delta } };
        return n;
      });

      const updated = await mindmapsApi.update(mindmapId, { nodes: nextNodes, edges: map.edges });
      writeEventMap(qc, updated);
      return { reordered: true };
    },
    onMutate: async (vars) => {
      const key = queryKeys.event(vars.eventId);
      const prev = qc.getQueryData<{ event: EventDetail | null }>(key);
      if (!prev?.event) return undefined;
      const parentEdge = prev.event.edges.find((e) => e.target === vars.nodeId);
      if (!parentEdge) return undefined;
      const parentId = parentEdge.source;

      const children = prev.event.edges
        .filter((e) => e.source === parentId)
        .map((e) => prev.event!.nodes.find((n) => n.id === e.target))
        .filter((n): n is EventNode => Boolean(n))
        .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);

      const idx = children.findIndex((n) => n.id === vars.nodeId);
      if (idx < 0) return undefined;
      const swapIdx = vars.direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= children.length) return undefined;

      const nodeA = children[idx];
      const nodeB = children[swapIdx];
      const delta = nodeB.position.y - nodeA.position.y;

      const subtreeA = getSubtreeIds(prev.event.edges, nodeA.id);
      const subtreeB = getSubtreeIds(prev.event.edges, nodeB.id);

      qc.setQueryData<{ event: EventDetail | null }>(key, {
        event: {
          ...prev.event,
          nodes: prev.event.nodes.map((n) => {
            if (subtreeA.has(n.id)) return { ...n, position: { x: n.position.x, y: n.position.y + delta } };
            if (subtreeB.has(n.id)) return { ...n, position: { x: n.position.x, y: n.position.y - delta } };
            return n;
          }),
        },
      });
      return { prev };
    },
    onError: (_err, vars, context) => {
      if (context?.prev) qc.setQueryData(queryKeys.event(vars.eventId), context.prev);
      dropEventMap(qc, vars.mindmapId);
    },
    onSuccess: (_data, vars) => invalidateEventMap(qc, vars),
  });
}

/**
 * Recompute a tidy tree layout for the whole event map. Every node's position
 * is re-zeroed: root at (0,0), each level one step right, siblings stacked
 * vertically. Useful after the user drags nodes into a pile, or to re-zero a
 * map seeded without layout. Applies to all nodes in one PUT.
 */
export function useLayoutEventTree(): UseMutationResult<
  { laidOut: boolean },
  Error,
  Pick<EventMapMutationContext, 'eventId' | 'mindmapId'>
> {
  const qc = useQueryClient();
  return useMutation({
    scope: MAP_WRITE_SCOPE,
    mutationFn: async ({ mindmapId }) => {
      const map = await readEventMap(qc, mindmapId);
      if (map.nodes.length === 0) return { laidOut: false };
      const layout = layoutEventTree(map.nodes, map.edges, map.rootId);
      const nextNodes = map.nodes.map((node) => {
        const pos = layout.get(node.id);
        return pos ? { ...node, position: pos } : node;
      });
      const updated = await mindmapsApi.update(mindmapId, { nodes: nextNodes });
      writeEventMap(qc, updated);
      return { laidOut: true };
    },
    onSuccess: (_data, vars) => invalidateEventMap(qc, vars),
  });
}
