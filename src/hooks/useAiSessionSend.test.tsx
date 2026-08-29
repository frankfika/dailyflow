import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createNewSession } from '../types/chat';
import { getStore, setStore } from './useAiSessionStore';
import { useSendPipeline } from './useAiSessionSend';

const mocks = vi.hoisted(() => ({
  summarize: vi.fn(),
  recordSkillUse: vi.fn(),
}));

vi.mock('../api/client', () => ({
  aiApi: { summarize: mocks.summarize },
  loadSkillUsage: () => ({}),
  recordSkillUse: mocks.recordSkillUse,
  sortSkillsByUsage: (skills: unknown[]) => skills,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function seedStore(workspaceId = 'workspace-a') {
  const session = createNewSession(workspaceId);
  const now = new Date().toISOString();
  setStore({
    sessions: [session],
    activeSessionId: session.id,
    providers: [{
      id: 'provider-a',
      name: 'Test Provider',
      apiKey: 'test-key',
      baseUrl: 'https://example.test/v1',
      model: 'test-model',
      createdAt: now,
      updatedAt: now,
    }],
    activeProviderId: 'provider-a',
    skills: [],
    pendingSkillId: null,
  });
  return session;
}

function renderPipeline(workspaceId = 'workspace-a') {
  const showToast = vi.fn();
  const rendered = renderHook(() => useSendPipeline({
    workspaceId,
    language: 'en',
    tasks: [],
    notes: [],
    filesMap: {},
    showToast,
  }));
  return { ...rendered, showToast };
}

describe('useSendPipeline', () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.summarize.mockReset();
    mocks.recordSkillUse.mockReset();
  });

  it('synchronously rejects a duplicate send while the first request is in flight', async () => {
    const session = seedStore();
    const request = deferred<{ summary: string }>();
    mocks.summarize.mockReturnValue(request.promise);
    const { result } = renderPipeline();

    let first!: Promise<void>;
    let duplicate!: Promise<void>;
    await act(async () => {
      first = result.current.sendMessage('hello') as Promise<void>;
      duplicate = result.current.sendMessage('hello') as Promise<void>;
    });

    expect(mocks.summarize).toHaveBeenCalledTimes(1);
    expect(getStore().sessions.find(item => item.id === session.id)?.messages).toHaveLength(1);

    request.resolve({ summary: 'answer' });
    await act(async () => {
      await Promise.all([first, duplicate]);
    });

    const messages = getStore().sessions.find(item => item.id === session.id)?.messages || [];
    expect(messages.map(message => [message.role, message.content])).toEqual([
      ['user', 'hello'],
      ['assistant', 'answer'],
    ]);
  });

  it('aborts a request without appending an error response', async () => {
    const session = seedStore();
    let capturedSignal: AbortSignal | undefined;
    mocks.summarize.mockImplementation(({ signal }: { signal: AbortSignal }) => {
      capturedSignal = signal;
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    });
    const { result, showToast } = renderPipeline();

    let send!: Promise<void>;
    await act(async () => {
      send = result.current.sendMessage('stop me') as Promise<void>;
    });
    act(() => result.current.stopMessage());
    await act(async () => { await send; });

    expect(capturedSignal?.aborted).toBe(true);
    expect(getStore().sessions.find(item => item.id === session.id)?.messages).toHaveLength(1);
    expect(showToast).not.toHaveBeenCalled();
  });

  it('replaces the latest failed response when retry succeeds', async () => {
    const session = seedStore();
    mocks.summarize
      .mockRejectedValueOnce(new Error('401 invalid_api_key'))
      .mockResolvedValueOnce({ summary: 'recovered' });
    const { result } = renderPipeline();

    await act(async () => {
      await result.current.sendMessage('retry this');
    });
    let messages = getStore().sessions.find(item => item.id === session.id)?.messages || [];
    expect(messages).toHaveLength(2);
    expect(messages[1].error).toContain('invalid or expired');

    act(() => result.current.retryMessage(1));
    await waitFor(() => expect(mocks.summarize).toHaveBeenCalledTimes(2));
    await waitFor(() => {
      const current = getStore().sessions.find(item => item.id === session.id)?.messages || [];
      expect(current.at(-1)?.content).toBe('recovered');
    });

    messages = getStore().sessions.find(item => item.id === session.id)?.messages || [];
    expect(messages).toHaveLength(2);
    expect(messages[1].error).toBeUndefined();
  });

  it('never writes into a session from another workspace', async () => {
    const own = seedStore('workspace-a');
    const foreign = createNewSession('workspace-b');
    setStore(prev => ({
      sessions: [own, foreign],
      activeSessionId: foreign.id,
    }));
    mocks.summarize.mockResolvedValue({ summary: 'scoped answer' });
    const { result } = renderPipeline('workspace-a');

    await act(async () => {
      await result.current.sendMessage('scoped question');
    });

    expect(getStore().sessions.find(item => item.id === own.id)?.messages).toHaveLength(2);
    expect(getStore().sessions.find(item => item.id === foreign.id)?.messages).toHaveLength(0);
  });
});
