import { describe, expect, it } from 'vitest';
import { findReusableDraftSession } from '../../hooks/useAiSession';
import type { ChatSession, ContextItem } from '../../types/chat';

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
