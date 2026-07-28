/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * useAiSession — AI Chat 会话状态机.
 *
 * 设计要点 (R3 重构, 2026-07-12):
 * - 状态共享: 走 `useAiSessionStore` 模块级 store.
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
  workspaceId?: string;
  language: 'en' | 'zh';
  tasks: any[];
  notes: any[];
  filesMap: Record<string, string>;
  activeContext?: 'work' | 'life';
  showToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
  /** 从 NoteEditor / Today 自动注入的上下文 */
  focusedContext?: { type: 'note' | 'today'; id?: string; title?: string; content?: string } | null;
}

export interface UseAiSessionReturn {
  // Sessions
  sessions: ChatSession[];
  activeSessionId: string | null;
  activeSession: ChatSession | null;
  setActiveSessionId: (id: string) => void;
  createSession: (prefill?: { contextItems?: ContextItem[] }) => ChatSession;
  prepareSessionForDraft: (contextItems: ContextItem[]) => ChatSession;
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

export function findReusableDraftSession(
  sessions: ChatSession[],
  activeSessionId: string | null,
  contextItems: ContextItem[]
): ChatSession | null {
  const current = sessions.find(session => session.id === activeSessionId) || sessions[0] || null;
  const noteIds = new Set(
    contextItems.map(item => item.data.noteId).filter((id): id is string => Boolean(id))
  );
  if (noteIds.size > 0) {
    const matching = [...sessions]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .find(session =>
        session.contextItems.some(item => item.data.noteId && noteIds.has(item.data.noteId))
      );
    if (matching) return matching;
  }
  return current?.messages.length === 0 ? current : null;
}

export function useAiSession(opts: UseAiSessionOptions): UseAiSessionReturn {
  const { language, tasks, notes, filesMap, activeContext = 'work', showToast, focusedContext, workspaceId = 'default' } = opts;
  const snapshot = useSharedSnapshot();
  const scopedSessions = useMemo(
    () => snapshot.sessions.filter(s => (s.workspaceId || 'default') === workspaceId),
    [snapshot.sessions, workspaceId]
  );

  // Send pipeline (per-instance, 跟原行为一致)
  const { isStreaming, sendMessage, stopMessage, retryMessage } = useSendPipeline({
    workspaceId, language, tasks, notes, filesMap, activeContext, showToast, focusedContext,
  });

  const activeSession = useMemo(
    () => scopedSessions.find(s => s.id === snapshot.activeSessionId) || scopedSessions[0] || null,
    [scopedSessions, snapshot.activeSessionId]
  );
  useEffect(() => {
    if (activeSession && snapshot.activeSessionId !== activeSession.id) {
      setStore({ activeSessionId: activeSession.id });
    }
  }, [activeSession, snapshot.activeSessionId]);
  useEffect(() => {
    if (scopedSessions.length > 0) return;
    const newSession = createNewSessionImpl(workspaceId);
    setStore(prev => ({
      sessions: [newSession, ...prev.sessions],
      activeSessionId: newSession.id,
    }));
  }, [scopedSessions.length, workspaceId]);
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
    const newSession = createNewSessionImpl(workspaceId);
    if (prefill?.contextItems) newSession.contextItems = prefill.contextItems;
    setStore({
      sessions: [newSession, ...getStore().sessions],
      activeSessionId: newSession.id,
      pendingSkillId: null,
    });
    return newSession;
  }, [workspaceId]);

  const prepareSessionForDraft = useCallback((contextItems: ContextItem[]): ChatSession => {
    const live = getStore();
    const workspaceSessions = live.sessions.filter(
      s => (s.workspaceId || 'default') === workspaceId
    );
    const target = findReusableDraftSession(workspaceSessions, live.activeSessionId, contextItems);

    if (!target) return createSession({ contextItems });

    const mergedContext = [
      ...target.contextItems.filter(existing =>
        !contextItems.some(item =>
          item.id === existing.id ||
          (item.data.noteId && item.data.noteId === existing.data.noteId)
        )
      ),
      ...contextItems,
    ];
    const updated = {
      ...target,
      contextItems: mergedContext,
      updatedAt: new Date().toISOString(),
    };
    setStore({
      sessions: live.sessions.map(s => s.id === target.id ? updated : s),
      activeSessionId: target.id,
      pendingSkillId: null,
    });
    return updated;
  }, [createSession, workspaceId]);

  const deleteSession = useCallback((id: string) => {
    setStore(prev => {
      const filtered = prev.sessions.filter(s => s.id !== id);
      const remainingInWorkspace = filtered.filter(
        s => (s.workspaceId || 'default') === workspaceId
      );
      if (remainingInWorkspace.length === 0) {
        const newSession = createNewSessionImpl(workspaceId);
        return { sessions: [newSession, ...filtered], activeSessionId: newSession.id };
      }
      return {
        sessions: filtered,
        activeSessionId: prev.activeSessionId === id ? remainingInWorkspace[0].id : prev.activeSessionId,
      };
    });
  }, [workspaceId]);

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
    saveProviderConfigs(ps); // 持久化并发布 ai.providerChanged
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
    sessions: scopedSessions,
    activeSessionId: activeSession?.id || null,
    activeSession,
    setActiveSessionId,
    createSession,
    prepareSessionForDraft,
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
