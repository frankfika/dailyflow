import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PropsWithChildren } from 'react';
import { useNoteAutosave } from './useNotes';
import type { NoteDocument } from '../api/client';

const originalFetch = globalThis.fetch;

const note: NoteDocument = {
  id: 'note_01KAAAAAAAAAAAAAAAA',
  schemaVersion: 1,
  createdAt: '2026-07-29T00:00:00.000Z',
  updatedAt: '2026-07-29T00:00:00.000Z',
  createdBy: 'user',
  workspaceId: 'default',
  body: 'base',
  kind: 'general',
  state: 'draft',
  projectIds: [],
  personIds: [],
  sourceIds: [],
  pinned: false,
  autoSaveVersion: 0,
  contentHash: 'hash',
  commitmentIds: [],
};

function wrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('useNoteAutosave conflict safety', () => {
  it('does not let a queued save from the previous note pollute the next note', async () => {
    let resolveFirst!: (response: Response) => void;
    const firstResponse = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const noteB = { ...note, id: 'note_01KBBBBBBBBBBBBBBBB', body: 'note B' };
    const fetchMock = vi.fn()
      .mockReturnValueOnce(firstResponse)
      .mockResolvedValueOnce(new Response(JSON.stringify({
        note: { ...note, body: 'A queued', autoSaveVersion: 2 },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        note: { ...noteB, body: 'B latest', autoSaveVersion: 1 },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));
    globalThis.fetch = fetchMock as typeof fetch;
    const { result, rerender } = renderHook(
      ({ activeNote }) => useNoteAutosave(activeNote),
      { initialProps: { activeNote: note }, wrapper: wrapper() },
    );

    act(() => result.current.schedule({ body: 'A first' }));
    let firstFlush!: Promise<boolean>;
    act(() => {
      firstFlush = result.current.flush();
    });
    act(() => result.current.schedule({ body: 'A queued' }));
    let queuedAFlush!: Promise<boolean>;
    act(() => {
      queuedAFlush = result.current.flush();
    });

    rerender({ activeNote: noteB });
    act(() => result.current.schedule({ body: 'B latest' }));
    let noteBFlush!: Promise<boolean>;
    act(() => {
      noteBFlush = result.current.flush();
    });

    resolveFirst(new Response(JSON.stringify({
      note: { ...note, body: 'A first', autoSaveVersion: 1 },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    await act(async () => {
      await Promise.all([firstFlush, queuedAFlush, noteBFlush]);
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(note.id);
    const queuedARequest = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(JSON.parse(String(queuedARequest.body))).toMatchObject({
      expectedAutoSaveVersion: 1,
      body: 'A queued',
    });
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain(noteB.id);
    const noteBRequest = fetchMock.mock.calls[2]?.[1] as RequestInit;
    expect(JSON.parse(String(noteBRequest.body))).toMatchObject({
      expectedAutoSaveVersion: 0,
      body: 'B latest',
    });
  });

  it('keeps the newest edit when another save is already queued', async () => {
    let resolveFirst!: (response: Response) => void;
    const firstResponse = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const fetchMock = vi.fn()
      .mockReturnValueOnce(firstResponse)
      .mockResolvedValueOnce(new Response(JSON.stringify({
        note: { ...note, body: 'C', autoSaveVersion: 2 },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));
    globalThis.fetch = fetchMock as typeof fetch;
    const { result } = renderHook(() => useNoteAutosave(note), { wrapper: wrapper() });

    act(() => result.current.schedule({ body: 'A' }));
    let firstFlush!: Promise<boolean>;
    act(() => {
      firstFlush = result.current.flush();
    });

    act(() => result.current.schedule({ body: 'B' }));
    let secondFlush!: Promise<boolean>;
    act(() => {
      secondFlush = result.current.flush();
    });
    act(() => result.current.schedule({ body: 'C' }));

    resolveFirst(new Response(JSON.stringify({
      note: { ...note, body: 'A', autoSaveVersion: 1 },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    await act(async () => {
      await Promise.all([firstFlush, secondFlush]);
      await result.current.flush();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const queuedRequest = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(JSON.parse(String(queuedRequest.body))).toMatchObject({
      expectedAutoSaveVersion: 1,
      body: 'C',
    });
  });

  it('does not replay a conflicting body and retains it for a later explicit save', async () => {
    const remote = {
      ...note,
      body: 'remote edit',
      autoSaveVersion: 1,
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { code: 'concurrent_modification', message: 'stale version' },
      }), {
        status: 409,
        headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ note: remote }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { code: 'concurrent_modification', message: 'stale version' },
      }), {
        status: 409,
        headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        note: remote,
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));
    globalThis.fetch = fetchMock as typeof fetch;
    const { result } = renderHook(() => useNoteAutosave(note), { wrapper: wrapper() });

    act(() => result.current.schedule({ body: 'local edit' }));
    let firstSaved = true;
    await act(async () => {
      firstSaved = await result.current.flush();
    });

    expect(firstSaved).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(result.current.status).toBe('conflict'));

    act(() => result.current.schedule({ state: 'archived' }));
    let secondSaved = true;
    await act(async () => {
      secondSaved = await result.current.flush();
    });

    expect(secondSaved).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const secondRequest = fetchMock.mock.calls[2]?.[1] as RequestInit;
    expect(JSON.parse(String(secondRequest.body))).toMatchObject({
      expectedAutoSaveVersion: 0,
      body: 'local edit',
      state: 'archived',
    });
  });

  it('retries a state-only change when the remote edit touched a different field', async () => {
    const remote = {
      ...note,
      body: 'remote edit',
      autoSaveVersion: 1,
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { code: 'concurrent_modification', message: 'stale version' },
      }), {
        status: 409,
        headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ note: remote }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        note: {
          ...remote,
          state: 'archived',
          autoSaveVersion: 2,
        },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));
    globalThis.fetch = fetchMock as typeof fetch;
    const { result } = renderHook(() => useNoteAutosave(note), { wrapper: wrapper() });

    act(() => result.current.schedule({ state: 'archived' }));
    let saved = false;
    await act(async () => {
      saved = await result.current.flush();
    });

    expect(saved).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const retry = fetchMock.mock.calls[2]?.[1] as RequestInit;
    expect(JSON.parse(String(retry.body))).toEqual({
      expectedAutoSaveVersion: 1,
      state: 'archived',
    });
  });
});
