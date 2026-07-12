/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * useAiSession — 抽离 AIChat + FloatingAIPanel 共有的 AI 会话状态机.
 *
 * 设计要点 (R3 重构, 2026-07-12):
 * - 状态共享: 走 `useAiSessionStore` 模块级 store, 跨 AIChat / FloatingAIPanel 实例同步
 *   (修两个 session 列表互不可见的 bug).
 * - localStorage key 保持 `df_ai_chat_store` 不变, 老用户 session 不丢.
 * - 把 buildContextText / handleSend / handleStop / handleRetryMessage / resolveSlashCommand
 *   / switchProvider / createSession / deleteSession / renameSession 全部下沉.
 * - send pipeline 抽到 `useAiSessionSend.ts`, 保持主 hook < 400 行.
 * - 暴露稳定的 callback (useCallback 包裹), React.memo 安全.
 * - isStreaming + abortRef 在 useAiSessionSend 内 (per-instance).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { promptsApi, type PromptTemplateData, loadSkillUsage, sortSkillsByUsage } from '../api/client';
import { saveProviderConfigs, loadProviderConfigs, type ProviderConfig } from '../types/models';
import { createNewSession as createNewSessionImpl, type ContextItem } from '../types/chat';
import { ensureInitialized, getStore, setStore, subscribe, type ChatSession, type SharedStore } from './useAiSessionStore';
import { useSendPipeline } from './useAiSessionSend';
import { buildContextText as buildContextTextImpl, buildAutoContextText as buildAutoContextTextImpl } from './aiContextBuilders';

export interface UseAiSessionOptions {
  language: 'en' | 'zh';
  tasks: any[];
  notes: any[];
  filesMap: Record<string, string>;
  activeContext?: 'work' | 'life';
  showToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
  /** FloatingAIPanel 专属: 从 NoteEditor / Today 自动注入上下文 */
  focusedContext?: { type: 'note' | 'today'; id?: string; title?: string; content?: string } | null;
}

export interface UseAiSessionReturn {
  // Sessions
  sessions: ChatSession[];
  activeSessionId: string | null;
  activeSession: ChatSession | null;
  setActiveSessionId: (id: string) => void;
  createSession: (prefill?: { contextItems?: ContextItem[] }) => ChatSession;
  deleteSession: (id: string) => void;
  renameSession: (id: string, title: string) => void;

  // Send pipeline
  isStreaming: boolean;
  sendMessage: (content: string) => Promise<void>;
  stopMessage: () => void;
  retryMessage: (msgIndex: number) => void;

  // Providers
  providers: ProviderConfig[];
  activeProviderId: string | null;
  activeProvider: ProviderConfig | null;
  switchProvider: (id: string) => ProviderConfig | null;
  reloadProvidersAndSkills: () => void;

  // Skills
  skills: PromptTemplateData[];
  pendingSkillId: string | null;
  setPendingSkillId: (id: string | null) => void;
  activeSkill: PromptTemplateData | null;

  // Context
  addContext: (item: ContextItem) => void;
  removeContext: (id: string) => void;
  buildContextText: (items: ContextItem[]) => string;
  buildAutoContextText: () => string;
  autoContextLabel: string | null;
  placeholderText: string;
}

function useSharedSnapshot(): SharedStore {
  // 第一次 useState 调用时 (per-instance) 触发 ensureInitialized, 保证 snapshot
  // 已经包含 localStorage 里的老数据, 不会闪一帧空.
  const [snapshot, setSnapshot] = useState<SharedStore>(() => {
    ensureInitialized();
    return getStore();
  });
  useEffect(() => subscribe(() => setSnapshot(getStore())), []);
  return snapshot;
}

export function useAiSession(opts: UseAiSessionOptions): UseAiSessionReturn {
  const { language, tasks, notes, filesMap, activeContext = 'work', showToast, focusedContext } = opts;
  const snapshot = useSharedSnapshot();

  // Send pipeline (per-instance, 跟原行为一致)
  const { isStreaming, sendMessage, stopMessage, retryMessage } = useSendPipeline({
    language, tasks, notes, filesMap, activeContext, showToast, focusedContext,
  });

  const activeSession = useMemo(
    () => snapshot.sessions.find(s => s.id === snapshot.activeSessionId) || null,
    [snapshot.sessions, snapshot.activeSessionId]
  );
  const activeProvider = useMemo(
    () => snapshot.providers.find(p => p.id === snapshot.activeProviderId) || null,
    [snapshot.providers, snapshot.activeProviderId]
  );
  const activeSkill = useMemo(
    () => snapshot.pendingSkillId ? snapshot.skills.find(s => s.id === snapshot.pendingSkillId) || null : null,
    [snapshot.skills, snapshot.pendingSkillId]
  );

  // ── session mutations ──
  const setActiveSessionId = useCallback((id: string) => setStore({ activeSessionId: id }), []);

  const createSession = useCallback((prefill?: { contextItems?: ContextItem[] }): ChatSession => {
    const newSession = createNewSessionImpl();
    if (prefill?.contextItems) newSession.contextItems = prefill.contextItems;
    setStore({
      sessions: [newSession, ...snapshot.sessions],
      activeSessionId: newSession.id,
      pendingSkillId: null,
    });
    return newSession;
  }, [snapshot.sessions]);

  const deleteSession = useCallback((id: string) => {
    setStore(prev => {
      const filtered = prev.sessions.filter(s => s.id !== id);
      if (filtered.length === 0) {
        const newSession = createNewSessionImpl();
        return { sessions: [newSession], activeSessionId: newSession.id };
      }
      return {
        sessions: filtered,
        activeSessionId: prev.activeSessionId === id ? filtered[0].id : prev.activeSessionId,
      };
    });
  }, []);

  const renameSession = useCallback((id: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setStore({ sessions: getStore().sessions.map(s => s.id === id ? { ...s, title: trimmed } : s) });
  }, []);

  // ── context mutations ──
  const updateActiveSession = useCallback((updater: (s: ChatSession) => ChatSession) => {
    setStore({
      sessions: getStore().sessions.map(s => s.id === getStore().activeSessionId ? updater(s) : s),
    });
  }, []);

  const addContext = useCallback((item: ContextItem) => {
    updateActiveSession(s => ({
      ...s,
      contextItems: [...s.contextItems.filter(c => c.id !== item.id), item],
      updatedAt: new Date().toISOString(),
    }));
  }, [updateActiveSession]);

  const removeContext = useCallback((id: string) => {
    updateActiveSession(s => ({
      ...s,
      contextItems: s.contextItems.filter(c => c.id !== id),
      updatedAt: new Date().toISOString(),
    }));
  }, [updateActiveSession]);

  // ── provider mutations ──
  const switchProvider = useCallback((id: string): ProviderConfig | null => {
    setStore({ activeProviderId: id });
    const ps = loadProviderConfigs();
    ps.activeId = id;
    saveProviderConfigs(ps); // 持久化 + emit df:provider-changed
    return getStore().providers.find(p => p.id === id) || null;
  }, []);

  const reloadProvidersAndSkills = useCallback(() => {
    const ps = loadProviderConfigs();
    setStore({ providers: ps.configs, activeProviderId: ps.activeId });
    promptsApi.getAll()
      .then(loaded => setStore({ skills: sortSkillsByUsage(loaded, loadSkillUsage()) }))
      .catch(() => {});
  }, []);

  // ── skill mutations ──
  const setPendingSkillId = useCallback((id: string | null) => setStore({ pendingSkillId: id }), []);

  // ── context builders (走 aiContextBuilders) ──
  const ctxArgs = useMemo(() => ({ language, tasks, notes, filesMap }), [language, tasks, notes, filesMap]);
  const buildContextText = useCallback((items: ContextItem[]) => buildContextTextImpl(items, ctxArgs), [ctxArgs]);
  const buildAutoContextText = useCallback(() => buildAutoContextTextImpl(focusedContext, ctxArgs), [focusedContext, ctxArgs]);

  const autoContextLabel = useMemo(() => {
    if (!focusedContext) return null;
    if (focusedContext.type === 'today') {
      const count = tasks.filter((t: any) => t.status !== 'done').length;
      return `${language === 'zh' ? '今日任务' : "Today's Tasks"} (${count})`;
    }
    if (focusedContext.type === 'note') {
      return focusedContext.title || (language === 'zh' ? '当前笔记' : 'Current Note');
    }
    return null;
  }, [focusedContext, tasks, language]);

  const placeholderText = useMemo(() => {
    if (focusedContext) return language === 'zh' ? '关于当前内容问点什么…' : 'Ask about the current content…';
    return language === 'zh' ? '问点什么…' : 'Ask anything…';
  }, [focusedContext, language]);

  return {
    // Sessions
    sessions: snapshot.sessions,
    activeSessionId: snapshot.activeSessionId,
    activeSession,
    setActiveSessionId,
    createSession,
    deleteSession,
    renameSession,

    // Send pipeline
    isStreaming,
    sendMessage,
    stopMessage,
    retryMessage,

    // Providers
    providers: snapshot.providers,
    activeProviderId: snapshot.activeProviderId,
    activeProvider,
    switchProvider,
    reloadProvidersAndSkills,

    // Skills
    skills: snapshot.skills,
    pendingSkillId: snapshot.pendingSkillId,
    setPendingSkillId,
    activeSkill,

    // Context
    addContext,
    removeContext,
    buildContextText,
    buildAutoContextText,
    autoContextLabel,
    placeholderText,
  };
}
