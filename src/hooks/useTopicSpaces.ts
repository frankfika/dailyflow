/**
 * React Query hooks for Topic Space (Phase 1).
 *
 * Mirrors the existing `useNotes` pattern (see
 * `src/features/v2/hooks/useNotes.ts`): TanStack Query for list / detail,
 * `useMutation` for create / update / delete, and `qc.invalidateQueries`
 * scoped to the `topicSpacesRoot` key so a single mutation evicts every
 * topic-space list without touching unrelated query namespaces.
 *
 * Topic spaces are NOT workspace-scoped — the same endpoint serves every
 * workspace, and the context discriminator (work / life / unclassified)
 * is the only filter we send.
 */
import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import { queryKeys } from '../queryKeys';
import {
  topicSpacesApi,
  type TopicSpace,
  type TopicSpaceContext,
  type TopicSpaceCreateInput,
  type TopicSpaceFilters,
  type TopicSpaceTaskItem,
  type TopicSpaceUpdate,
} from '../api/client';

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export interface UseTopicSpacesOpts {
  context?: TopicSpaceContext;
  status?: TopicSpaceFilters['status'];
  query?: string;
}

export function useTopicSpaces(
  opts: UseTopicSpacesOpts = {},
): UseQueryResult<TopicSpace[]> {
  return useQuery({
    queryKey: queryKeys.topicSpaces({
      context: opts.context ?? null,
      status: opts.status ?? null,
      query: opts.query ?? null,
    }),
    queryFn: () => topicSpacesApi.list(opts),
    staleTime: 15_000,
    retry: 1,
  });
}

// ---------------------------------------------------------------------------
// Single space
// ---------------------------------------------------------------------------

export function useTopicSpace(id: string | null | undefined): UseQueryResult<TopicSpace> {
  return useQuery({
    queryKey: queryKeys.topicSpace(id ?? ''),
    queryFn: () => topicSpacesApi.get(id as string),
    enabled: Boolean(id),
    staleTime: 10_000,
    retry: 1,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Create a new topic space. The server auto-creates a blank mind map and
 * binds it. On success we seed the detail cache and prepend the new
 * space into any active list so the UI doesn't have to refetch.
 */
export function useCreateTopicSpace(): UseMutationResult<TopicSpace, Error, TopicSpaceCreateInput> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input) => topicSpacesApi.create(input),
    onSuccess: (created) => {
      qc.setQueryData(queryKeys.topicSpace(created.id), created);
      qc.setQueriesData<TopicSpace[]>(
        { queryKey: queryKeys.topicSpacesRoot(), exact: false },
        (current) => {
          // `setQueriesData` matches every cache entry that has the root
          // key as a prefix, including single-space detail caches. The
          // detail cache holds a `TopicSpace` object, not an array, so
          // we must skip anything that isn't a list before calling
          // array methods.
          if (!Array.isArray(current)) return current;
          if (current.some((s) => s.id === created.id)) return current;
          return [created, ...current];
        },
      );
      qc.invalidateQueries({ queryKey: queryKeys.topicSpacesRoot(), exact: false });
    },
  });
}

export interface UpdateTopicSpaceVars {
  id: string;
  patch: TopicSpaceUpdate;
}

export function useUpdateTopicSpace(): UseMutationResult<TopicSpace, Error, UpdateTopicSpaceVars> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }) => topicSpacesApi.update(id, patch),
    onSuccess: (updated, { id }) => {
      qc.setQueryData(queryKeys.topicSpace(id), updated);
      qc.setQueriesData<TopicSpace[]>(
        { queryKey: queryKeys.topicSpacesRoot(), exact: false },
        (current) => {
          // Skip detail caches — they store a single TopicSpace, not a list.
          if (!Array.isArray(current)) return current;
          return current.map((s) => (s.id === updated.id ? updated : s));
        },
      );
      // Reorder-style fields (status, order, defaultView) need a refetch
      // to keep sibling lists consistent. We invalidate every active
      // topic-spaces list to be safe.
      qc.invalidateQueries({ queryKey: queryKeys.topicSpacesRoot(), exact: false });
    },
  });
}

export function useDeleteTopicSpace(): UseMutationResult<void, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => topicSpacesApi.delete(id),
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: queryKeys.topicSpace(id) });
      qc.setQueriesData<TopicSpace[]>(
        { queryKey: queryKeys.topicSpacesRoot(), exact: false },
        (current) => {
          if (!Array.isArray(current)) return current;
          const next = current.filter((s) => s.id !== id);
          return next.length === current.length ? current : next;
        },
      );
      qc.invalidateQueries({ queryKey: queryKeys.topicSpacesRoot(), exact: false });
    },
  });
}

// ---------------------------------------------------------------------------
// Cross-date task source (Phase 3)
// ---------------------------------------------------------------------------

/**
 * Fetch a topic space's tasks across ALL daily notes (not just the
 * currently-selected date). Use this for the Topic Space list view
 * and for the mindmap node↔task mirror — the old "filter today's
 * tasks by spaceId" approach silently dropped any task that wasn't
 * on the open date.
 *
 * Pass `null` to disable the query (e.g. when no space is selected).
 */
export function useTopicSpaceTasks(
  spaceId: string | null | undefined,
): UseQueryResult<TopicSpaceTaskItem[]> {
  return useQuery({
    queryKey: queryKeys.topicSpaceTasks(spaceId ?? ''),
    queryFn: () => topicSpacesApi.getTasks(spaceId as string),
    enabled: Boolean(spaceId),
    staleTime: 10_000,
    retry: 1,
  });
}
