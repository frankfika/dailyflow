/**
 * useMindMapActions — hook-level tests.
 *
 * We use @tanstack/react-query's test wrapper to drive the mutations
 * and assert on the cache updates. The tests cover:
 *   1. usePromoteNodeToTask caches the returned MindMap under its id.
 *   2. useLinkNodeToTask does the same.
 *   3. useUpdateTaskSpace invalidates the tasks query.
 *   4. useUpdateNodeKind caches the new state.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { type ReactNode } from 'react';
import { mindmapsApi, tasksApi } from '../api/client';
import {
  usePromoteNodeToTask,
  useLinkNodeToTask,
  useUpdateNodeKind,
  useUpdateTaskSpace,
} from './useMindMapActions';
import { queryKeys } from '../queryKeys';

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof import('../api/client')>('../api/client');
  return {
    ...actual,
    mindmapsApi: {
      ...actual.mindmapsApi,
      promoteNodeToTask: vi.fn(),
      linkNodeToTask: vi.fn(),
      updateNodeKind: vi.fn(),
    },
    tasksApi: {
      ...actual.tasksApi,
      updateSpace: vi.fn(),
    },
  };
});

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { wrapper, qc };
}

const SAMPLE_MAP = {
  id: 'mm_1',
  title: 'Sample',
  rootId: 'r1',
  nodes: [
    { id: 'r1', text: 'Root', position: { x: 0, y: 0 }, kind: 'root' as const },
    { id: 'n1', text: '子主题', position: { x: 100, y: 0 }, kind: 'task' as const, taskId: 't_1' },
  ],
  edges: [{ id: 'e1', source: 'r1', target: 'n1' }],
  version: 2 as const,
  createdAt: '2026-08-07T00:00:00Z',
  updatedAt: '2026-08-07T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useMindMapActions', () => {
  it('usePromoteNodeToTask caches the map and invalidates Today projections', async () => {
    (mindmapsApi.promoteNodeToTask as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(SAMPLE_MAP);
    const { wrapper, qc } = makeWrapper();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    const { result } = renderHook(() => usePromoteNodeToTask(), { wrapper });

    act(() => {
      result.current.mutate({ mapId: 'mm_1', nodeId: 'r1', date: '2026-08-07' });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(qc.getQueryData(queryKeys.mindmap('mm_1'))).toEqual(SAMPLE_MAP);
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: queryKeys.todayItemsRoot() }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: queryKeys.eventsRoot() }),
    );
    expect(qc.isMutating()).toBe(0);
  });

  it('useLinkNodeToTask caches the returned map and refreshes Today grouping', async () => {
    (mindmapsApi.linkNodeToTask as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(SAMPLE_MAP);
    const { wrapper, qc } = makeWrapper();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    const { result } = renderHook(() => useLinkNodeToTask(), { wrapper });

    act(() => {
      result.current.mutate({ mapId: 'mm_1', nodeId: 'r1', taskId: 't_99', date: '2026-08-07' });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(qc.getQueryData(queryKeys.mindmap('mm_1'))).toEqual(SAMPLE_MAP);
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: queryKeys.todayItemsRoot() }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: queryKeys.eventsRoot() }),
    );
  });

  it('useUpdateNodeKind caches the new state and passes the tag extra', async () => {
    (mindmapsApi.updateNodeKind as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(SAMPLE_MAP);
    const { wrapper, qc } = makeWrapper();
    const { result } = renderHook(() => useUpdateNodeKind(), { wrapper });

    act(() => {
      result.current.mutate({ mapId: 'mm_1', nodeId: 'r1', kind: 'tag', tag: 'priority' });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mindmapsApi.updateNodeKind).toHaveBeenCalledWith('mm_1', 'r1', 'tag', { tag: 'priority' });
    expect(qc.getQueryData(queryKeys.mindmap('mm_1'))).toEqual(SAMPLE_MAP);
  });

  it('useUpdateTaskSpace calls the API and invalidates the tasks root query', async () => {
    (tasksApi.updateSpace as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 't_1',
      title: 'foo',
      status: 'todo',
    });
    const { wrapper, qc } = makeWrapper();
    // Seed the tasks root so we can verify it's invalidated.
    qc.setQueryData(queryKeys.tasksRoot(), { '2026-08-07': [] });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    const { result } = renderHook(() => useUpdateTaskSpace(), { wrapper });

    act(() => {
      result.current.mutate({ taskId: 't_1', spaceId: 'sp_1', date: '2026-08-07' });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(tasksApi.updateSpace).toHaveBeenCalledWith('t_1', 'sp_1', '2026-08-07');
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: queryKeys.tasksRoot() }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: queryKeys.todayItemsRoot() }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: queryKeys.eventsRoot() }),
    );
  });
});
