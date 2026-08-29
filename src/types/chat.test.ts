import { beforeEach, describe, expect, it } from 'vitest';
import { createNewSession, loadChatStore } from './chat';

describe('chat session identity', () => {
  beforeEach(() => localStorage.clear());

  it('creates collision-resistant ids for sessions created back-to-back', () => {
    const first = createNewSession('workspace-a');
    const second = createNewSession('workspace-a');

    expect(first.id).toMatch(/^chat_/);
    expect(second.id).toMatch(/^chat_/);
    expect(second.id).not.toBe(first.id);
  });

  it('repairs duplicate ids left by timestamp-only legacy sessions', () => {
    const duplicate = {
      id: 'chat_1700000000000',
      workspaceId: 'workspace-a',
      title: 'One session',
      messages: [],
      contextItems: [],
      createdAt: '2026-08-26T00:00:00.000Z',
      updatedAt: '2026-08-26T00:00:00.000Z',
    };
    localStorage.setItem('df_ai_chat_store', JSON.stringify({
      sessions: [duplicate, { ...duplicate, title: 'Duplicate row' }],
      activeSessionId: duplicate.id,
    }));

    const loaded = loadChatStore();

    expect(loaded.sessions).toHaveLength(1);
    expect(loaded.sessions[0].title).toBe('One session');
    expect(loaded.activeSessionId).toBe(duplicate.id);
  });
});
