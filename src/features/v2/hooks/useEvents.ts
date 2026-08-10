import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import {
  eventsApi,
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

export function useEvents(opts?: { from?: string; to?: string }): UseQueryResult<{ events: EventSummary[] }> {
  return useQuery({
    queryKey: queryKeys.events({ from: opts?.from ?? null, to: opts?.to ?? null }),
    queryFn: () => eventsApi.list(opts?.from, opts?.to),
    staleTime: 15_000,
    retry: 1,
  });
}

export function useEventById(id: string | null | undefined): UseQueryResult<{ event: EventDetail | null }> {
  return useQuery({
    queryKey: queryKeys.event(id ?? ''),
    queryFn: () => eventsApi.getById(id as string),
    enabled: Boolean(id),
    staleTime: 10_000,
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

// ---------------------------------------------------------------------------
// Mutations (§4.4 write contract + §5 cache invalidation rules)
// ---------------------------------------------------------------------------

function invalidateCommonAfterWrite(qc: ReturnType<typeof useQueryClient>, vars: { scheduledDate: string; eventId?: string }) {
  qc.invalidateQueries({ queryKey: queryKeys.eventsRoot() });
  qc.invalidateQueries({ queryKey: queryKeys.todayItems(vars.scheduledDate, 'v2') });
  qc.invalidateQueries({ queryKey: queryKeys.tasksRoot() });
  qc.invalidateQueries({ queryKey: queryKeys.standaloneTasks() });
  if (vars.eventId) qc.invalidateQueries({ queryKey: queryKeys.event(vars.eventId) });
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
