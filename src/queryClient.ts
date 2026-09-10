import { QueryClient } from '@tanstack/react-query';

/**
 * Buster for the persisted query cache. Bump when persisted query payloads
 * change shape (query keys, response types) so a stale localStorage cache is
 * discarded instead of breaking hydration.
 */
export const QUERY_CACHE_BUSTER = 'v2.5.2';

/**
 * Shared server-state policy for every DailyFlow entry point.
 *
 * The backend is a local SQLite sidecar, so reads are cheap and the cache is
 * the source the UI renders from: a long global staleTime keeps view switches
 * from flashing a refetch. Hot queries (events, today-items, notes) pin their
 * own longer staleTime and rely on the explicit invalidations every mutation
 * already performs. Failures must not create a request storm. Mutations are
 * never retried implicitly because most legacy write endpoints do not yet
 * accept an idempotency key.
 *
 * staleTime only gates *opportunistic* refetches. Mount and window-focus
 * revalidate unconditionally ('always'): the query cache is persisted to
 * localStorage across restarts, and workspace markdown files can be edited
 * outside the app, so a fresh-looking snapshot can still be wrong. Refetches
 * render stale data in the meantime — no spinner — and all of this is
 * localhost traffic.
 */
export function createDailyFlowQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60_000,
        refetchOnMount: 'always',
        refetchOnWindowFocus: 'always',
        retry: (failureCount, error: unknown) => {
          const status = (error as { status?: number } | null)?.status;
          if (typeof status === 'number' && status >= 400 && status < 500) return false;
          return failureCount < 1;
        },
      },
      mutations: {
        retry: 0,
      },
    },
  });
}
