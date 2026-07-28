import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/client', () => ({
  aiApi: { summarize: vi.fn() },
  promptsApi: { getAll: vi.fn().mockResolvedValue([]) },
  loadSkillUsage: vi.fn().mockReturnValue({}),
  recordSkillUse: vi.fn(),
  sortSkillsByUsage: vi.fn((skills: unknown[]) => skills),
  DOMAIN_EVENTS: { aiProviderChanged: 'ai.providerChanged' },
}));

vi.mock('../../types/models', () => ({
  loadProviderConfigs: vi.fn().mockReturnValue({ configs: [], activeId: null }),
}));

import { aiApi } from '../../api/client';
import { useSendPipeline } from '../../hooks/useAiSessionSend';
import { getStore, setStore } from '../../hooks/useAiSessionStore';
import type { ChatMessage, ChatSession } from '../../types/chat';

const provider = {
  id: 'provider-1',
  name: 'Test Provider',
  apiKey: 'test-key',
  model: 'test-model',
  baseUrl: 'http://example.test',
};

function message(id: string, role: ChatMessage['role'], content: string, error?: string): ChatMessage {
  return {
    id,
    role,
    content,
    error,
    timestamp: '2026-07-28T00:00:00.000Z',
  };
}

function session(id: string, workspaceId: string, messages: ChatMessage[]): ChatSession {
  return {
    id,
    workspaceId,
    title: id,
    messages,
    contextItems: [],
    createdAt: '2026-07-28T00:00:00.000Z',
    updatedAt: '2026-07-28T00:00:00.000Z',
  };
}

function renderPipeline(workspaceId = 'ws-a') {
  return renderHook(() => useSendPipeline({
    workspaceId,
    language: 'en',
    tasks: [],
    notes: [],
    filesMap: {},
    showToast: vi.fn(),
  }));
}

describe('useAiSessionSend retry and workspace invariants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: vi.fn((key: string) => values.delete(key)),
      clear: vi.fn(() => values.clear()),
    });
    vi.mocked(aiApi.summarize).mockResolvedValue({ summary: 'replacement answer' } as any);
  });

  it('replaces only the latest failed assistant response without duplicating its user message', async () => {
    const original = session('session-a', 'ws-a', [
      message('u1', 'user', 'first'),
      message('a1', 'assistant', 'first answer'),
      message('u2', 'user', 'second'),
      message('a2', 'assistant', '', 'network failed'),
    ]);
    setStore({
      sessions: [original],
      activeSessionId: original.id,
      providers: [provider as any],
      activeProviderId: provider.id,
      skills: [],
      pendingSkillId: null,
    });
    const { result } = renderPipeline();

    act(() => result.current.retryMessage(3));

    await waitFor(() => {
      const updated = getStore().sessions.find(item => item.id === original.id)!;
      expect(updated.messages.at(-1)?.content).toBe('replacement answer');
      expect(updated.messages.filter(item => item.role === 'user')).toHaveLength(2);
      expect(updated.messages.map(item => item.id)).toContain('a1');
    });
  });

  it('forks an older retry and leaves the original session untouched', async () => {
    const originalMessages = [
      message('u1', 'user', 'first'),
      message('a1', 'assistant', 'first answer'),
      message('u2', 'user', 'second'),
      message('a2', 'assistant', 'second answer'),
    ];
    const original = session('session-a', 'ws-a', originalMessages);
    setStore({
      sessions: [original],
      activeSessionId: original.id,
      providers: [provider as any],
      activeProviderId: provider.id,
      skills: [],
      pendingSkillId: null,
    });
    const { result } = renderPipeline();

    act(() => result.current.retryMessage(1));

    await waitFor(() => {
      const sessions = getStore().sessions;
      expect(sessions).toHaveLength(2);
      expect(sessions.find(item => item.id === original.id)?.messages).toEqual(originalMessages);
      const fork = sessions.find(item => item.id !== original.id)!;
      expect(fork.workspaceId).toBe('ws-a');
      expect(fork.messages.map(item => item.content)).toEqual(['first', 'replacement answer']);
    });
  });

  it('never sends into the active session of another workspace', async () => {
    const workspaceA = session('session-a', 'ws-a', []);
    const workspaceB = session('session-b', 'ws-b', [message('b1', 'user', 'keep me')]);
    setStore({
      sessions: [workspaceB, workspaceA],
      activeSessionId: workspaceB.id,
      providers: [provider as any],
      activeProviderId: provider.id,
      skills: [],
      pendingSkillId: null,
    });
    const { result } = renderPipeline('ws-a');

    await act(async () => {
      await result.current.sendMessage('workspace A message');
    });

    expect(getStore().sessions.find(item => item.id === workspaceB.id)?.messages)
      .toEqual(workspaceB.messages);
    expect(getStore().sessions.find(item => item.id === workspaceA.id)?.messages.map(item => item.content))
      .toEqual(['workspace A message', 'replacement answer']);
  });
});
