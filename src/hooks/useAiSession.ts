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
 * - 暴露稳定的 callback (useCallback 包裹), React.memo 安全.
 * - isStreaming + abortRef 保留在 hook 内 (per-instance, 跟原行为一致).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { aiApi, promptsApi, type PromptTemplateData, loadSkillUsage, recordSkillUse, sortSkillsByUsage } from '../api/client';
import { saveProviderConfigs, loadProviderConfigs, type ProviderConfig } from '../types/models';
import { createNewSession as createNewSessionImpl, deriveSessionTitle, type ChatMessage, type ContextItem } from '../types/chat';
import { buildToolInstructions, parseToolCalls } from '../types/ai-tools';
import { executeToolCall } from '../utils/aiToolExecutor';
import { getFriendlyAiErrorMessage } from '../utils/aiErrorMessage';
import { getTodayStr } from '../utils/tagColors';
import { generateShortId } from '../utils/idGenerator';
import { ensureInitialized, getStore, setStore, subscribe, type ChatSession, type SharedStore } from './useAiSessionStore';
import { buildContextText, buildAutoContextText, deriveAutoContextLabel } from './aiContextBuilders';

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
  buildAutoContextText: () => string;  // focusedContext 派生
  autoContextLabel: string | null;     // UI 展示
  placeholderText: string;             // textarea placeholder
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

  // per-instance transient state (跟原行为一致)
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

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

  // ── helpers ──
  const ctxArgs = useMemo(() => ({ language, tasks, notes, filesMap }), [language, tasks, notes, filesMap]);
  const buildContextTextCb = useCallback((items: ContextItem[]) => buildContextText(items, ctxArgs), [ctxArgs]);
  const buildAutoContextTextCb = useCallback(
    () => buildAutoContextText(focusedContext, ctxArgs),
    [focusedContext, ctxArgs]
  );

  const autoContextLabel = useMemo(
    () => deriveAutoContextLabel(focusedContext, tasks, language),
    [focusedContext, tasks, language]
  );

  const placeholderText = useMemo(() => {
    if (focusedContext) {
      return language === 'zh' ? '关于当前内容问点什么…' : 'Ask about the current content…';
    }
    return language === 'zh' ? '问点什么…' : 'Ask anything…';
  }, [focusedContext, language]);

  // ── send pipeline ──
  const resolveSlashCommand = useCallback((text: string): { content: string; matchedSkill: PromptTemplateData | null } => {
    if (!text.startsWith('/')) return { content: text, matchedSkill: null };
    const cmd = text.split(/\s/)[0];
    const matched = snapshot.skills.find(s => s.commands?.some(c => c === cmd));
    if (matched) return { content: text.slice(cmd.length).trim(), matchedSkill: matched };
    return { content: text, matchedSkill: null };
  }, [snapshot.skills]);

  const recordSkillUsage = useCallback((skill: PromptTemplateData) => {
    recordSkillUse(skill.id);
    const live = getStore();
    setStore({
      skills: sortSkillsByUsage(
        live.skills.some(s => s.id === skill.id) ? live.skills : [...live.skills, skill],
        loadSkillUsage()
      ),
    });
  }, []);

  const sendMessage = useCallback(async (rawContent: string) => {
    const content = rawContent.trim();
    if (!content || isStreaming) return;
    const live = getStore();
    const session = live.sessions.find(s => s.id === live.activeSessionId) || null;
    if (!session) return;
    const provider = live.providers.find(p => p.id === live.activeProviderId) || null;
    const activeSk = live.pendingSkillId ? live.skills.find(s => s.id === live.pendingSkillId) || null : null;

    if (!provider) {
      showToast(language === 'zh' ? '请先添加一个模型供应商' : 'Please add a model provider first', 'error');
      return;
    }

    const { content: cleanedContent, matchedSkill } = resolveSlashCommand(content);
    let contentToSend = cleanedContent;
    if (matchedSkill) setStore({ pendingSkillId: matchedSkill.id });
    const skillForThisMessage = matchedSkill || activeSk;

    const userMessage: ChatMessage = {
      id: generateShortId('msg'),
      role: 'user',
      content: contentToSend,
      timestamp: new Date().toISOString(),
    };

    const contextSnapshot = [...session.contextItems];
    const userInputCopy = contentToSend;

    setStore({
      sessions: getStore().sessions.map(s => s.id === session.id ? (() => {
        const newMessages = [...s.messages, userMessage];
        return {
          ...s,
          messages: newMessages,
          title: s.messages.length === 0 ? deriveSessionTitle(newMessages) : s.title,
          updatedAt: new Date().toISOString(),
        };
      })() : s),
    });

    setIsStreaming(true);
    if (!matchedSkill) setStore({ pendingSkillId: null });
    if (skillForThisMessage) recordSkillUsage(skillForThisMessage);

    // Build prompt
    const contextText = buildContextTextCb(contextSnapshot);
    const autoContextText = buildAutoContextTextCb();
    let userPrompt = userInputCopy;
    const contexts: string[] = [];
    if (autoContextText) contexts.push(autoContextText);
    if (contextText) contexts.push(contextText);
    if (skillForThisMessage && skillForThisMessage.type === 'agent') {
      contexts.push(`${language === 'zh' ? '参考以下知识库：' : 'Reference knowledge base:'}\n\n${skillForThisMessage.systemPrompt || skillForThisMessage.prompt || ''}`);
    }
    if (contexts.length > 0) {
      userPrompt = `${userPrompt}\n\n---\n${language === 'zh' ? '参考以下上下文：' : 'Reference context:'}\n\n${contexts.join('\n\n---\n')}`;
    }

    const defaultSystemPrompt = language === 'zh'
      ? '你是一位专业、友好的 AI 助手，帮助用户管理日常工作和任务。回复简洁清晰，使用 Markdown 格式。'
      : 'You are a professional, friendly AI assistant helping with daily work and tasks. Reply concisely and clearly using Markdown.';
    const baseSystemPrompt = (skillForThisMessage && skillForThisMessage.type !== 'agent')
      ? (skillForThisMessage.systemPrompt || skillForThisMessage.prompt || '')
      : defaultSystemPrompt;
    const systemPrompt = baseSystemPrompt + buildToolInstructions(language);

    abortRef.current = new AbortController();

    try {
      const { summary } = await aiApi.summarize({
        apiKey: provider.apiKey,
        model: provider.model,
        baseUrl: provider.baseUrl,
        systemPrompt,
        userPrompt,
        signal: abortRef.current?.signal,
      });

      if (abortRef.current?.signal.aborted) {
        setIsStreaming(false);
        abortRef.current = null;
        return;
      }

      const { text: cleanedText, calls } = parseToolCalls(summary);
      const toolResults: { call: any; result: any }[] = [];
      for (const call of calls) {
        const result = await executeToolCall(call, {
          currentDate: getTodayStr(),
          activeContext,
          language,
          tasks,
          showToast,
        });
        toolResults.push({ call, result });
      }

      let finalContent = cleanedText;
      if (toolResults.length > 0) {
        const toolSummary = toolResults.map(({ call, result }) => {
          const icon = result.success ? '✓' : '✗';
          return `${icon} **${call.name}**: ${result.message}`;
        }).join('\n');
        finalContent = cleanedText ? `${cleanedText}\n\n---\n${toolSummary}` : toolSummary;
      }

      const aiMessage: ChatMessage = {
        id: generateShortId('msg'),
        role: 'assistant',
        content: finalContent,
        timestamp: new Date().toISOString(),
        modelName: provider.name,
        skillName: skillForThisMessage?.name,
        contextSnapshot,
      };

      setStore({
        sessions: getStore().sessions.map(s => s.id === session.id ? {
          ...s,
          messages: [...s.messages, aiMessage],
          updatedAt: new Date().toISOString(),
        } : s),
      });
    } catch (err: any) {
      const rawError = err.message || String(err);
      if (rawError.toLowerCase().includes('abort') || err.name === 'AbortError') {
        // user-initiated stop
      } else {
        const friendlyError = getFriendlyAiErrorMessage(rawError, language, provider.name);
        const errorMessage: ChatMessage = {
          id: generateShortId('msg'),
          role: 'assistant',
          content: '',
          timestamp: new Date().toISOString(),
          modelName: provider.name,
          error: friendlyError,
        };
        setStore({
          sessions: getStore().sessions.map(s => s.id === session.id ? {
            ...s,
            messages: [...s.messages, errorMessage],
            updatedAt: new Date().toISOString(),
          } : s),
        });
        showToast(friendlyError, 'error');
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [isStreaming, language, activeContext, tasks, showToast, buildContextTextCb, buildAutoContextTextCb, resolveSlashCommand, recordSkillUsage]);

  const stopMessage = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  const retryMessage = useCallback((msgIndex: number) => {
    const live = getStore();
    const session = live.sessions.find(s => s.id === live.activeSessionId) || null;
    if (!session || msgIndex < 1) return;
    let userIdx = msgIndex - 1;
    while (userIdx >= 0 && session.messages[userIdx].role !== 'user') userIdx--;
    if (userIdx < 0) return;
    const userMsg = session.messages[userIdx];
    setStore({
      sessions: live.sessions.map(s => s.id === session.id ? {
        ...s,
        messages: s.messages.slice(0, userIdx),
        updatedAt: new Date().toISOString(),
      } : s),
    });
    void sendMessage(userMsg.content);
  }, [sendMessage]);

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
    buildContextText: buildContextTextCb,
    buildAutoContextText: buildAutoContextTextCb,
    autoContextLabel,
    placeholderText,
  };
}
