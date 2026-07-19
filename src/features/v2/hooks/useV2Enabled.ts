/**
 * Hooks to read v2 feature flags at runtime.
 */
import { useQuery } from '@tanstack/react-query';
import { getStatus, type V2Status } from '../api/client';

export function useV2Status() {
  return useQuery({
    queryKey: ['v2-status'],
    queryFn: () => getStatus(),
    staleTime: 30_000,
    retry: 1,
  });
}

export function useV2Enabled(): { enabled: boolean; loading: boolean; reason?: string; status?: V2Status } {
  const q = useV2Status();
  if (q.isLoading) return { enabled: false, loading: true };
  if (q.error) {
    return { enabled: false, loading: false, reason: 'v2_unreachable' };
  }
  if (!q.data?.flags.enabled) {
    return { enabled: false, loading: false, reason: 'v2_disabled', status: q.data };
  }
  return { enabled: true, loading: false, status: q.data };
}
