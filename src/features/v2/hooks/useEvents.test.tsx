import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PropsWithChildren } from 'react';
import { useScheduleEventNode, useUnscheduleEventNode } from './useEvents';
import { queryKeys } from '../../../queryKeys';
import type { EventDetail } from '../../../api/client';

const originalFetch = globalThis.fetch;

const event: EventDetail = {
  id: 'event_01',
  mindmapId: 'map_01',
  rootNodeId: 'node_root',
  title: 'Launch',
  context: 'work',
  status: 'active',
  progress: { done: 0, total: 1 },
  effectiveTags: [],
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  nodes: [
    {
      id: 'node_1',
      eventId: 'event_01',
      text: 'Ship it',
      position: { x: 0, y: 0 },
      manualTags: [],
      aiTags: [],
      execution: { taskId: 'task_1', status: 'todo', scheduledDate: '2026-09-03' },
    },
  ],
  edges: [],
  manualTags: [],
  aiTags: [],
  integrity: { missingMap: false, sourceContextWasUnclassified: false, orphanTaskIds: [], duplicateNodeTaskIds: [] },
};

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function setup() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  // Seed the detail cache the optimistic updates target.
  client.setQueryData(queryKeys.event(event.id), { event });
  return client;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('event node schedule mutations (optimistic cache writes)', () => {
  it('applies a reschedule to the cached event detail immediately', async () => {
    const client = setup();
    const { result } = renderHook(() => useScheduleEventNode(), { wrapper: makeWrapper(client) });

    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ rescheduled: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch;

    await act(async () => {
      await result.current.mutateAsync({
        eventId: event.id,
        mindmapId: event.mindmapId,
        nodeId: 'node_1',
        date: '2026-09-10',
        taskId: 'task_1',
        fromDate: '2026-09-03',
      });
    });

    const cached = client.getQueryData<{ event: EventDetail | null }>(queryKeys.event(event.id));
    expect(cached?.event?.nodes[0]?.execution?.scheduledDate).toBe('2026-09-10');
  });

  it('rolls the cached event detail back when the reschedule fails', async () => {
    const client = setup();
    const { result } = renderHook(() => useScheduleEventNode(), { wrapper: makeWrapper(client) });

    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'nope' }), {
      status: 500,
    })) as typeof fetch;

    await act(async () => {
      await expect(result.current.mutateAsync({
        eventId: event.id,
        mindmapId: event.mindmapId,
        nodeId: 'node_1',
        date: '2026-09-10',
        taskId: 'task_1',
        fromDate: '2026-09-03',
      })).rejects.toThrow();
    });

    const cached = client.getQueryData<{ event: EventDetail | null }>(queryKeys.event(event.id));
    expect(cached?.event?.nodes[0]?.execution?.scheduledDate).toBe('2026-09-03');
  });

  it('removes the execution optimistically when a node is unscheduled', async () => {
    const client = setup();
    const { result } = renderHook(() => useUnscheduleEventNode(), { wrapper: makeWrapper(client) });

    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ unscheduled: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch;

    await act(async () => {
      await result.current.mutateAsync({
        eventId: event.id,
        mindmapId: event.mindmapId,
        nodeId: 'node_1',
        taskId: 'task_1',
        scheduledDate: '2026-09-03',
      });
    });

    const cached = client.getQueryData<{ event: EventDetail | null }>(queryKeys.event(event.id));
    expect(cached?.event?.nodes[0]?.execution).toBeUndefined();
  });
});
