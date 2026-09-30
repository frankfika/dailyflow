import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

import { findReusableDraftSession, useAiSession } from '../../hooks/useAiSession';
import type { ChatSession, ContextItem } from '../../types/chat';

// The hook composes useSendPipeline. Mocking that collaborator lets us
// pin the option-forwarding contract without standing up a real
// provider / session store.
vi.mock('../../hooks/useAiSessionSend', () => ({
  useSendPipeline: vi.fn(() => ({
    isStreaming: false,
    sendMessage: vi.fn(),
    stopMessage: vi.fn(),
    retryMessage: vi.fn(),
  })),
}));

// Stub the chat store so useAiSession can boot without localStorage.
vi.mock('../../hooks/useAiSessionStore', () => ({
  ensureInitialized: () => {},
  getStore: () => ({
    sessions: [{
      id: 's-default',
      workspaceId: 'ws-a',
      title: 'Default',
      messages: [],
      contextItems: [],
      createdAt: '2026-07-28T00:00:00.000Z',
      updatedAt: '2026-07-28T00:00:00.000Z',
    }],
    activeSessionId: 's-default',
    providers: [{
      id: 'p1', name: 'P1', apiKey: 'k', baseUrl: 'https://example.test/v1',
      model: 'm', createdAt: '2026-07-28T00:00:00.000Z', updatedAt: '2026-07-28T00:00:00.000Z',
    }],
    activeProviderId: 'p1',
    skills: [],
    pendingSkillId: null,
  }),
  setStore: () => {},
  subscribe: () => () => {},
}));

vi.mock('../../hooks/aiContextBuilders', () => ({
  buildContextText: () => '',
  buildAutoContextText: () => '',
}));

function makeSession(
  id: string,
  updatedAt: string,
  noteId?: string,
  hasMessages = true
): ChatSession {
  return {
    id,
    workspaceId: 'ws-a',
    title: id,
    messages: hasMessages ? [{
      id: `${id}-message`,
      role: 'user',
      content: id,
      timestamp: updatedAt,
    }] : [],
    contextItems: noteId ? [{
      id: `${id}-context`,
      type: 'note',
      label: noteId,
      data: { noteId },
    }] : [],
    createdAt: updatedAt,
    updatedAt,
  };
}

const noteContext: ContextItem[] = [{
  id: 'incoming',
  type: 'note',
  label: 'Note A',
  data: { noteId: 'note-a' },
}];

describe('findReusableDraftSession', () => {
  it('reuses the most recent session linked to the same entity', () => {
    const older = makeSession('older', '2026-07-27T00:00:00.000Z', 'note-a');
    const recent = makeSession('recent', '2026-07-28T00:00:00.000Z', 'note-a');
    const active = makeSession('active', '2026-07-29T00:00:00.000Z', 'note-b');

    expect(findReusableDraftSession([older, active, recent], active.id, noteContext)?.id)
      .toBe(recent.id);
  });

  it('reuses the current empty session when no entity session exists', () => {
    const current = makeSession('empty', '2026-07-28T00:00:00.000Z', undefined, false);
    expect(findReusableDraftSession([current], current.id, noteContext)?.id).toBe(current.id);
  });

  it('requires a new session when the current session has history and no entity matches', () => {
    const current = makeSession('busy', '2026-07-28T00:00:00.000Z', 'note-b');
    expect(findReusableDraftSession([current], current.id, noteContext)).toBeNull();
  });
});

describe('useAiSession — option forwarding', () => {
  it('forwards events and onDataChanged to the send pipeline', async () => {
    const { useSendPipeline } = await import('../../hooks/useAiSessionSend');
    const events = [{ id: 'evt_1', title: 'Launch v3' }];
    const onDataChanged = vi.fn();
    renderHook(() => useAiSession({
      language: 'en',
      tasks: [],
      notes: [],
      filesMap: {},
      showToast: vi.fn(),
      events,
      onDataChanged,
    }));

    expect(vi.mocked(useSendPipeline)).toHaveBeenCalledWith(expect.objectContaining({
      events,
      onDataChanged,
    }));
  });

  it('defaults events and onDataChanged to undefined when not supplied', async () => {
    const { useSendPipeline } = await import('../../hooks/useAiSessionSend');
    renderHook(() => useAiSession({
      language: 'en',
      tasks: [],
      notes: [],
      filesMap: {},
      showToast: vi.fn(),
    }));

    expect(vi.mocked(useSendPipeline)).toHaveBeenCalledWith(expect.objectContaining({
      events: undefined,
      onDataChanged: undefined,
    }));
  });
});
