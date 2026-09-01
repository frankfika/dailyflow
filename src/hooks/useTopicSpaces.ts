/**
 * React Query hook for listing topic spaces.
 *
 * Mirrors the existing `useNotes` pattern (see
 * `src/features/v2/hooks/useNotes.ts`): TanStack Query for the list.
 *
 * Topic spaces are NOT workspace-scoped — the same endpoint serves every
 * workspace, and the context discriminator (work / life / unclassified)
 * is the only filter we send.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { queryKeys } from '../queryKeys';
import {
  topicSpacesApi,
  type TopicSpace,
  type TopicSpaceContext,
  type TopicSpaceFilters,
} from '../api/client';

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
