/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * useAiSessionStore — AI Chat 的模块级共享会话状态.
 *
 * 设计要点 (R3 重构, 2026-07-12):
 * - 模块级 store + pub/sub, 不依赖 zustand, React 19 + Vite 现有依赖足够.
 * - 跨 AI Chat 组件实例同步 session 列表.
 * - localStorage key 保持 `df_ai_chat_store` 不变, 老用户 session 不丢.
 */

import {
  loadChatStore,
  saveChatStore,
  createNewSession as createNewSessionImpl,
  type ChatSession,
  type ChatMessage,
  type ContextItem,
} from '../types/chat';
import { loadProviderConfigs, type ProviderConfig } from '../types/models';
import { DOMAIN_EVENTS, promptsApi, type PromptTemplateData, loadSkillUsage, sortSkillsByUsage } from '../api/client';

export interface SharedStore {
  sessions: ChatSession[];
  activeSessionId: string | null;
  providers: ProviderConfig[];
  activeProviderId: string | null;
  skills: PromptTemplateData[];
  pendingSkillId: string | null;
}

let store: SharedStore = {
  sessions: [],
  activeSessionId: null,
  providers: [],
  activeProviderId: null,
  skills: [],
  pendingSkillId: null,
};

let initialized = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach(l => l());
}

function persistSessions() {
  saveChatStore({ sessions: store.sessions, activeSessionId: store.activeSessionId });
}

export type SetStoreInput = Partial<SharedStore> | ((prev: SharedStore) => Partial<SharedStore>);

export function setStore(patch: SetStoreInput) {
  const resolved = typeof patch === 'function' ? patch(store) : patch;
  const changed = 'sessions' in resolved || 'activeSessionId' in resolved;
  store = { ...store, ...resolved };
  emit();
  // 仅在 session 字段变化时持久化; providers / skills / pendingSkillId 走各自的存储
  if (changed) persistSessions();
}

export function getStore(): SharedStore {
  return store;
}

export function ensureInitialized(): SharedStore {
  if (initialized) return store;
  initialized = true;

  // Providers
  const ps = loadProviderConfigs();
  store = { ...store, providers: ps.configs, activeProviderId: ps.activeId };

  // Sessions (兼容老 localStorage, key 不变)
  const chatStore = loadChatStore();
  if (chatStore.sessions.length === 0) {
    const newSession = createNewSessionImpl();
    store = { ...store, sessions: [newSession], activeSessionId: newSession.id };
  } else {
    store = {
      ...store,
      sessions: chatStore.sessions,
      activeSessionId: chatStore.activeSessionId || chatStore.sessions[0].id,
    };
  }

  // Skills (async; 不阻塞首屏)
  promptsApi.getAll()
    .then(loaded => setStore({ skills: sortSkillsByUsage(loaded, loadSkillUsage()) }))
    .catch(err => console.error('Load skills failed:', err));

  // 监听 provider 变化 (其他组件, e.g. ChatSettingsPanel save)
  if (typeof window !== 'undefined') {
    window.addEventListener(DOMAIN_EVENTS.aiProviderChanged, () => {
      const fresh = loadProviderConfigs();
      setStore({ providers: fresh.configs, activeProviderId: fresh.activeId });
    });
  }

  return store;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

// ── 类型 re-export, 集中来源 ──
export type { ChatSession, ChatMessage, ContextItem, PromptTemplateData, ProviderConfig };
