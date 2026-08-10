import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
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
  type EventSummary,
  type StandaloneTask,
  type TodayItem,
  type UndoCompleteNodeTaskInput,
  type UndoConvertStandaloneToEventNodeTaskInput,
} from '../../../api/client';
import { queryKeys } from '../../../queryKeys';
import { ulid } from 'ulid';

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
  return useQuery({
    queryKey: queryKeys.event(id ?? ''),
    queryFn: () => eventsApi.getById(id as string),
    enabled: Boolean(id),
    staleTime: 10_000,
    refetchOnMount: 'always',
    retry: 1,
  });
}

export function useTodayItems(date: string): UseQueryResult<{ items: TodayItem[] }> {
  return useQuery({
    queryKey: queryKeys.todayItems(date, 'v2'),
    queryFn: () => eventsApi.listTodayItems(date),
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
    mutationFn: async ({ mindmapId, nodeId, date, taskId, fromDate }) => {
      if (taskId && fromDate && fromDate !== date) {
        await eventsApi.rescheduleNodeTask({ taskId, fromDate, toDate: date, mindmapId, nodeId });
        return;
      }
      if (!taskId) await mindmapsApi.promoteNodeToTask(mindmapId, nodeId, { date });
    },
    onSuccess: (_data, vars) => {
      invalidateCommonAfterWrite(qc, { eventId: vars.eventId, scheduledDate: vars.date });
      if (vars.fromDate && vars.fromDate !== vars.date) {
        qc.invalidateQueries({ queryKey: queryKeys.todayItems(vars.fromDate, 'v2') });
      }
    },
  });
}

export function useUnscheduleEventNode(): UseMutationResult<
  { unscheduled: boolean; alreadyUnscheduled: boolean },
  Error,
  { eventId: string; mindmapId: string; nodeId: string; taskId: string; scheduledDate: string }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ mindmapId, nodeId, taskId, scheduledDate }) =>
      eventsApi.unscheduleNodeTask({ mindmapId, nodeId, taskId, scheduledDate }),
    onSuccess: (_data, vars) => invalidateCommonAfterWrite(qc, vars),
  });
}

// ---------------------------------------------------------------------------
// Mutations (§4.4 write contract + §5 cache invalidation rules)
// ---------------------------------------------------------------------------

function invalidateCommonAfterWrite(qc: ReturnType<typeof useQueryClient>, vars: { scheduledDate: string; eventId?: string }) {
  qc.invalidateQueries({ queryKey: queryKeys.eventsRoot() });
  qc.invalidateQueries({ queryKey: queryKeys.todayItems(vars.scheduledDate, 'v2') });
  qc.invalidateQueries({ queryKey: queryKeys.tasksRoot() });
  qc.invalidateQueries({ queryKey: queryKeys.standaloneTasks() });
  if (vars.eventId) qc.invalidateQueries({ queryKey: queryKeys.event(vars.eventId) });
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
  CompleteNodeTaskInput
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input) => eventsApi.completeNodeTask(input),
    onSuccess: (_data, vars) => invalidateCommonAfterWrite(qc, vars),
  });
}

export function useUndoCompleteNodeTask(): UseMutationResult<
  { undone: boolean; alreadyTodo: boolean },
  Error,
  UndoCompleteNodeTaskInput
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input) => eventsApi.undoCompleteNodeTask(input),
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

type EventMapMutationContext = { eventId: string; mindmapId: string };

function invalidateEventMap(qc: ReturnType<typeof useQueryClient>, eventId: string) {
  qc.invalidateQueries({ queryKey: queryKeys.event(eventId) });
  qc.invalidateQueries({ queryKey: queryKeys.eventsRoot() });
}

/** Add a plain child node without exposing legacy node kinds in Event UI. */
export function useAddEventChild(): UseMutationResult<
  { nodeId: string },
  Error,
  EventMapMutationContext & { parentId: string; text: string }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ mindmapId, parentId, text }) => {
      const map = await mindmapsApi.get(mindmapId);
      const parent = map.nodes.find((node) => node.id === parentId);
      if (!parent) throw new Error('Parent node no longer exists');
      const siblings = map.edges
        .filter((edge) => edge.source === parentId)
        .map((edge) => map.nodes.find((node) => node.id === edge.target))
        .filter((node): node is NonNullable<typeof node> => Boolean(node));
      const nodeId = `node_${ulid()}`;
      const node = {
        id: nodeId,
        text: text.trim() || 'New step',
        position: {
          x: parent.position.x + 300,
          y: siblings.length
            ? Math.max(...siblings.map((sibling) => sibling.position.y)) + 104
            : parent.position.y,
        },
        kind: 'branch' as const,
      };
      await mindmapsApi.update(mindmapId, {
        nodes: [...map.nodes, node],
        edges: [...map.edges, { id: `edge_${ulid()}`, source: parentId, target: nodeId }],
      });
      return { nodeId };
    },
    onSuccess: (_data, vars) => invalidateEventMap(qc, vars.eventId),
  });
}

export function useRenameEventNode(): UseMutationResult<
  void,
  Error,
  EventMapMutationContext & { nodeId: string; text: string }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ mindmapId, nodeId, text }) => {
      const map = await mindmapsApi.get(mindmapId);
      const nodes = map.nodes.map((node) => node.id === nodeId ? { ...node, text: text.trim() || node.text } : node);
      await mindmapsApi.update(mindmapId, { nodes });
    },
    onSuccess: (_data, vars) => invalidateEventMap(qc, vars.eventId),
  });
}

export function useDeleteEventNode(): UseMutationResult<
  void,
  Error,
  EventMapMutationContext & { nodeId: string }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ mindmapId, nodeId }) => {
      await mindmapsApi.deleteNodeSubtree(mindmapId, nodeId, 'keep-tasks');
    },
    onSuccess: (_data, vars) => invalidateEventMap(qc, vars.eventId),
  });
}
