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

// The executor is controlled per-test: the confirmation-gate tests decide
// what a delete call returns with and without `userConfirmed`.
vi.mock('../../utils/aiToolExecutor', async () => {
  const actual = await vi.importActual<typeof import('../../utils/aiToolExecutor')>('../../utils/aiToolExecutor');
  return { ...actual, executeToolCall: vi.fn() };
});

import { aiApi } from '../../api/client';
import { executeToolCall } from '../../utils/aiToolExecutor';
import { getPendingAiConfirm, resolveAiConfirmation } from '../../utils/aiConfirmBus';
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

function resetStore(messages: ChatMessage[] = []) {
  const original = session('session-a', 'ws-a', messages);
  setStore({
    sessions: [original],
    activeSessionId: original.id,
    providers: [provider as any],
    activeProviderId: provider.id,
    skills: [],
    pendingSkillId: null,
  });
  return original;
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
    vi.mocked(executeToolCall).mockImplementation(passThroughExecute);
  });

  it('replaces only the latest failed assistant response without duplicating its user message', async () => {
    const original = resetStore([
      message('u1', 'user', 'first'),
      message('a1', 'assistant', 'first answer'),
      message('u2', 'user', 'second'),
      message('a2', 'assistant', '', 'network failed'),
    ]);
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
    const original = resetStore(originalMessages);
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

// Pass-through used as the default executor mock: only tests that need a
// scripted tool result override it.
function passThroughExecute(): Promise<Awaited<ReturnType<typeof executeToolCall>>> {
  return Promise.resolve({ success: true, message: 'ok', mutated: 'tasks' });
}

describe('useAiSessionSend — C1 delete confirmation gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: vi.fn((key: string) => values.delete(key)),
      clear: vi.fn(() => values.clear()),
    });
  });

  it('blocks a delete until the user confirms in the dialog, then re-runs it with userConfirmed', async () => {
    // The model tries to self-confirm with confirm:true — ignored by design.
    vi.mocked(aiApi.summarize).mockResolvedValue({
      summary: '<tool_call>{"name":"delete_task","arguments":{"title_query":"Doomed","confirm":true}}</tool_call>',
    } as any);
    const executorCalls: Array<{ args: Record<string, any>; userConfirmed: unknown }> = [];
    vi.mocked(executeToolCall).mockImplementation(async (call, ctx) => {
      executorCalls.push({ args: call.arguments, userConfirmed: ctx.userConfirmed });
      if (!ctx.userConfirmed) {
        return {
          success: false,
          message: 'Waiting for user confirmation',
          pendingConfirmation: { tool: 'delete_task', targetSummary: 'Doomed', args: call.arguments },
        };
      }
      return { success: true, mutated: 'tasks', message: 'Deleted "Doomed"' };
    });

    resetStore();
    const { result } = renderPipeline();

    act(() => { void result.current.sendMessage('please delete Doomed'); });

    // Nothing executes until the human answers: the bus holds a pending
    // delete request and the executor only saw the unconfirmed attempt.
    await waitFor(() => {
      expect(getPendingAiConfirm()).toMatchObject({ kind: 'delete', tool: 'delete_task', targetSummary: 'Doomed' });
    });
    expect(executorCalls).toHaveLength(1);
    expect(executorCalls[0].userConfirmed).toBeFalsy();
    const attempted = getStore().sessions[0].messages.at(-1);
    expect(attempted?.role).toBe('user');

    act(() => resolveAiConfirmation(getPendingAiConfirm()!.id, true));

    await waitFor(() => {
      const assistant = getStore().sessions[0].messages.at(-1);
      expect(assistant?.role).toBe('assistant');
      expect(assistant?.toolCalls?.[0]).toMatchObject({ name: 'delete_task', success: true });
    });
    expect(executorCalls).toHaveLength(2);
    expect(executorCalls[1].userConfirmed).toBe(true);
    expect(getPendingAiConfirm()).toBeNull();
  });

  it('records a declined delete without ever re-running the tool', async () => {
    vi.mocked(aiApi.summarize).mockResolvedValue({
      summary: '<tool_call>{"name":"delete_task","arguments":{"title_query":"Doomed"}}</tool_call>',
    } as any);
    vi.mocked(executeToolCall).mockImplementation(async () => ({
      success: false,
      message: 'Waiting for user confirmation',
      pendingConfirmation: { tool: 'delete_task', targetSummary: 'Doomed', args: {} },
    }));

    resetStore();
    const { result } = renderPipeline();

    act(() => { void result.current.sendMessage('delete it'); });
    await waitFor(() => expect(getPendingAiConfirm()).not.toBeNull());

    act(() => resolveAiConfirmation(getPendingAiConfirm()!.id, false));

    await waitFor(() => {
      const assistant = getStore().sessions[0].messages.at(-1);
      expect(assistant?.role).toBe('assistant');
    });
    expect(executeToolCall).toHaveBeenCalledTimes(1);
    expect(getStore().sessions[0].messages.at(-1)?.toolCalls?.[0]?.success).toBe(false);
  });

  it('leaves a "stopped" system bubble when abort happens after real mutations (C5)', async () => {
    let abortFollowup: () => void = () => {};
    vi.mocked(aiApi.summarize).mockImplementation(async (req: any) => {
      const prompt = String(req?.userPrompt ?? '');
      if (prompt.includes('Tool execution results')) {
        // Second round hangs until the test aborts, like a real fetch would.
        return new Promise((_resolve, reject) => {
          abortFollowup = () => reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }));
        });
      }
      return { summary: '<tool_call>{"name":"create_task","arguments":{"title":"A"}}</tool_call>' } as any;
    });
    vi.mocked(executeToolCall).mockImplementation(async () => ({
      success: true,
      mutated: 'tasks',
      message: 'Created task "A"',
    }));

    resetStore();
    const { result } = renderPipeline();

    act(() => { void result.current.sendMessage('create A'); });
    // Wait until the pipeline entered the second summarize round (round 1
    // answered with the create tool call, the tool already executed).
    await waitFor(() => {
      expect(vi.mocked(aiApi.summarize)).toHaveBeenCalledTimes(2);
    });
    act(() => result.current.stopMessage());
    act(() => abortFollowup());

    await waitFor(() => {
      const last = getStore().sessions[0].messages.at(-1);
      expect(last?.role).toBe('system');
      expect(last?.content).toContain('Stopped · 1 action(s) executed');
    });
  });

  it('restores the matched skill on retry instead of forcing null (C7)', async () => {
    // Earlier tests in this describe install a persistent `mockImplementation`
    // on `aiApi.summarize`; `beforeEach` only clears calls/results, so reset
    // the mock explicitly so the default `mockResolvedValue` actually takes
    // effect for this test.
    vi.mocked(aiApi.summarize).mockReset();
    vi.mocked(aiApi.summarize).mockResolvedValue({ summary: 'replacement answer' } as any);
    const skill = { id: 'skill-1', name: 'My Skill', type: 'prompt', prompt: '', systemPrompt: 'SKILL SYSTEM PROMPT' } as any;
    const original = session('session-a', 'ws-a', [
      message('u1', 'user', 'first'),
      { ...message('a1', 'assistant', '', 'boom'), matchedSkillId: 'skill-1' },
    ]);
    setStore({
      sessions: [original],
      activeSessionId: original.id,
      providers: [provider as any],
      activeProviderId: provider.id,
      skills: [skill],
      pendingSkillId: null,
    });
    const { result } = renderPipeline();

    act(() => result.current.retryMessage(1));

    await waitFor(() => {
      const updated = getStore().sessions.find(item => item.id === original.id)!;
      const replacement = updated.messages.at(-1);
      expect(replacement?.content).toBe('replacement answer');
      expect(replacement?.matchedSkillId).toBe('skill-1');
      expect(replacement?.skillName).toBe('My Skill');
    });
    // The skill's knowledge reached the model as the system prompt.
    const systemPrompt = vi.mocked(aiApi.summarize).mock.calls[0][0]?.systemPrompt ?? '';
    expect(String(systemPrompt)).toContain('SKILL SYSTEM PROMPT');
  });
});
