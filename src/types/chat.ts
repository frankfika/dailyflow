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
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error('Failed to load chat store:', e);
  }
  return { sessions: [], activeSessionId: null };
}

export function saveChatStore(store: ChatStore): void {
  // Cap sessions to avoid localStorage bloat
  const trimmed: ChatStore = {
    ...store,
    sessions: store.sessions.slice(0, MAX_SESSIONS),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

export function createNewSession(): ChatSession {
  const now = new Date().toISOString();
  return {
    id: `chat_${Date.now()}`,
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
