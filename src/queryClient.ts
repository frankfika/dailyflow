import { QueryClient } from '@tanstack/react-query';

/**
 * Shared server-state policy for every DailyFlow entry point.
 *
 * Reads may be refreshed when stale, but failures must not create a request
 * storm. Mutations are never retried implicitly because most legacy write
 * endpoints do not yet accept an idempotency key.
 */
export function createDailyFlowQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error: unknown) => {
          const status = (error as { status?: number } | null)?.status;
          if (typeof status === 'number' && status >= 400 && status < 500) return false;
          return failureCount < 1;
        },
        refetchOnWindowFocus: true,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}
