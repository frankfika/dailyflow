/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ContextItemType = 'today-tasks' | 'date-tasks' | 'note' | 'project' | 'custom-text';

export interface ContextItem {
  id: string;
  type: ContextItemType;
  label: string;
  data: {
    date?: string;
    noteId?: string;
    projectName?: string;
    text?: string;
    taskId?: string;
  };
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  // Metadata for assistant messages
  modelName?: string;
  skillName?: string;
  contextSnapshot?: ContextItem[]; // captured at send time
  error?: string;
}

export interface ChatSession {
  id: string;
  /** Workspace scope. Legacy sessions without this field are treated as default. */
  workspaceId?: string;
  title: string;
  messages: ChatMessage[];
  contextItems: ContextItem[]; // current attached context
  activeProviderId?: string;
  activeSkillId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatStore {
  sessions: ChatSession[];
  activeSessionId: string | null;
}

const STORAGE_KEY = 'df_ai_chat_store';
const MAX_SESSIONS = 50;

export function loadChatStore(): ChatStore {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<ChatStore>;
      const sessions = Array.isArray(parsed.sessions)
        ? parsed.sessions
            .filter((session): session is ChatSession =>
              Boolean(session && typeof session.id === 'string' && Array.isArray(session.messages))
            )
            .map(session => ({
              ...session,
              workspaceId: session.workspaceId || 'default',
              contextItems: Array.isArray(session.contextItems) ? session.contextItems : [],
            }))
            .slice(0, MAX_SESSIONS)
        : [];
      const activeSessionId = sessions.some(session => session.id === parsed.activeSessionId)
        ? parsed.activeSessionId as string
        : sessions[0]?.id || null;
      return { sessions, activeSessionId };
    }
  } catch (e) {
    console.error('Failed to load chat store:', e);
  }
  return { sessions: [], activeSessionId: null };
}

export function saveChatStore(store: ChatStore): void {
  // Cap sessions to avoid localStorage bloat
  const trimmed: ChatStore = {
    ...store,
    // Empty drafts are runtime-only. Persisting them creates abandoned chats
    // every time a Note opens the composer.
    sessions: [...store.sessions]
      .filter(s => s.messages.length > 0)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, MAX_SESSIONS),
  };
  if (!trimmed.sessions.some(session => session.id === trimmed.activeSessionId)) {
    trimmed.activeSessionId = trimmed.sessions[0]?.id || null;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

export function createNewSession(workspaceId = 'default'): ChatSession {
  const now = new Date().toISOString();
  return {
    id: `chat_${Date.now()}`,
    workspaceId,
    title: 'New Chat',
    messages: [],
    contextItems: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function deriveSessionTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find(m => m.role === 'user');
  if (!firstUser) return 'New Chat';
  const text = firstUser.content.trim();
  if (text.length <= 30) return text;
  return text.slice(0, 30) + '…';
}
