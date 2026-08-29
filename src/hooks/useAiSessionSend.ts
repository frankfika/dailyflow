/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * AI send pipeline.
 *
 * Invariants:
 * - a pipeline can only read/write sessions in its workspace;
 * - retrying the latest failed response replaces that response in place;
 * - retrying any older response forks a session and never truncates history;
 * - parsed write tools may create reviewable Proposals, never direct writes.
 */

import { useCallback, useRef, useState } from 'react';
import { aiApi, type PromptTemplateData, loadSkillUsage, recordSkillUse, sortSkillsByUsage } from '../api/client';
import { buildToolInstructions, parseToolCalls } from '../types/ai-tools';
import { getFriendlyAiErrorMessage } from '../utils/aiErrorMessage';
import { executeToolCall } from '../utils/aiToolExecutor';
import { getTodayStr } from '../utils/tagColors';
import { generateShortId } from '../utils/idGenerator';
import {
  createNewSession,
  deriveSessionTitle,
  type ChatMessage,
  type ContextItem,
} from '../types/chat';
import { getStore, setStore } from './useAiSessionStore';
import { buildContextText, buildAutoContextText } from './aiContextBuilders';

export interface UseSendPipelineOptions {
  workspaceId: string;
  language: 'en' | 'zh';
  tasks: any[];
  notes: any[];
  filesMap: Record<string, string>;
  activeContext?: 'work' | 'life';
  showToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
  focusedContext?: { type: 'note' | 'today'; id?: string; title?: string; content?: string } | null;
}

interface RunMessageOptions {
  rawContent: string;
  sessionId?: string;
  reuseUserMessage?: ChatMessage;
  contextSnapshot?: ContextItem[];
}

export function useSendPipeline(opts: UseSendPipelineOptions) {
  const {
    workspaceId,
    language,
    tasks,
    notes,
    filesMap,
    activeContext = 'work',
    showToast,
    focusedContext,
  } = opts;

  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  // React state is not a synchronous lock: two clicks in the same render can
  // both observe `isStreaming === false`. Keep a ref gate for the full request
  // lifetime so one pipeline can never append/send twice concurrently.
  const inFlightRef = useRef(false);

  const resolveSlashCommand = useCallback((text: string, skills: PromptTemplateData[]) => {
    if (!text.startsWith('/')) return { content: text, matchedSkill: null };
    const cmd = text.split(/\s/)[0];
    const matched = skills.find(s => s.commands?.some(c => c === cmd));
    if (matched) return { content: text.slice(cmd.length).trim(), matchedSkill: matched };
    return { content: text, matchedSkill: null };
  }, []);

  const updateSkillUsage = useCallback((skill: PromptTemplateData) => {
    recordSkillUse(skill.id);
    const live = getStore();
    setStore({
      skills: sortSkillsByUsage(
        live.skills.some(s => s.id === skill.id) ? live.skills : [...live.skills, skill],
        loadSkillUsage()
      ),
    });
  }, []);

  const appendMessageToSession = useCallback((
    sessionId: string,
    message: ChatMessage,
    options?: { retitle?: boolean }
  ) => {
    setStore(prev => ({
      sessions: prev.sessions.map(session => session.id === sessionId ? {
        ...session,
        messages: [...session.messages, message],
        title: options?.retitle && session.messages.length === 0
          ? deriveSessionTitle([...session.messages, message])
          : session.title,
        updatedAt: new Date().toISOString(),
      } : session),
    }));
  }, []);

  const runMessage = useCallback(async ({
    rawContent,
    sessionId,
    reuseUserMessage,
    contextSnapshot: suppliedContext,
  }: RunMessageOptions) => {
    const content = rawContent.trim();
    if (!content || inFlightRef.current) return;

    const live = getStore();
    const scopedSessions = live.sessions.filter(
      session => (session.workspaceId || 'default') === workspaceId
    );
    const session = sessionId
      ? scopedSessions.find(candidate => candidate.id === sessionId) || null
      : scopedSessions.find(candidate => candidate.id === live.activeSessionId) || scopedSessions[0] || null;
    if (!session) return;

    const provider = live.providers.find(candidate => candidate.id === live.activeProviderId) || null;
    if (!provider) {
      showToast(language === 'zh' ? '请先添加一个模型供应商' : 'Please add a model provider first', 'error');
      return;
    }

    inFlightRef.current = true;
    setIsStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const contextSnapshot = suppliedContext || [...session.contextItems];
    try {
      const activeSkill = live.pendingSkillId
        ? live.skills.find(candidate => candidate.id === live.pendingSkillId) || null
        : null;
      const resolved = reuseUserMessage
        ? { content, matchedSkill: null }
        : resolveSlashCommand(content, live.skills);
      const skillForThisMessage = resolved.matchedSkill || activeSkill;
      if (resolved.matchedSkill) setStore({ pendingSkillId: resolved.matchedSkill.id });

      const userMessage: ChatMessage = reuseUserMessage || {
        id: generateShortId('msg'),
        role: 'user',
        content: resolved.content,
        timestamp: new Date().toISOString(),
      };
      if (!reuseUserMessage) {
        appendMessageToSession(session.id, userMessage, { retitle: true });
      }

      if (!resolved.matchedSkill) setStore({ pendingSkillId: null });
      if (skillForThisMessage) updateSkillUsage(skillForThisMessage);

      const contextArgs = { language, tasks, notes, filesMap };
      const contexts: string[] = [];
      const autoContextText = buildAutoContextText(focusedContext, contextArgs);
      const selectedContextText = buildContextText(contextSnapshot, contextArgs);
      if (autoContextText) contexts.push(autoContextText);
      if (selectedContextText) contexts.push(selectedContextText);
      if (skillForThisMessage?.type === 'agent') {
        contexts.push(
          `${language === 'zh' ? '参考以下知识库：' : 'Reference knowledge base:'}\n\n${
            skillForThisMessage.systemPrompt || skillForThisMessage.prompt || ''
          }`
        );
      }

      let userPrompt = resolved.content;
      if (contexts.length > 0) {
        userPrompt = `${userPrompt}\n\n---\n${
          language === 'zh' ? '参考以下上下文：' : 'Reference context:'
        }\n\n${contexts.join('\n\n---\n')}`;
      }

      const defaultSystemPrompt = language === 'zh'
        ? '你是一位专业、友好的 AI 助手，帮助用户管理日常工作和任务。回复简洁清晰，使用 Markdown 格式。'
        : 'You are a professional, friendly AI assistant helping with daily work and tasks. Reply concisely and clearly using Markdown.';
      const baseSystemPrompt = skillForThisMessage && skillForThisMessage.type !== 'agent'
        ? skillForThisMessage.systemPrompt || skillForThisMessage.prompt || ''
        : defaultSystemPrompt;
      const systemPrompt = baseSystemPrompt + buildToolInstructions(language);

      const { summary } = await aiApi.summarize({
        apiKey: provider.apiKey,
        model: provider.model,
        baseUrl: provider.baseUrl,
        systemPrompt,
        userPrompt,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;

      const { text, calls } = parseToolCalls(summary);
      const toolResults = [];
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

      const toolSummary = toolResults
        .map(({ call, result }) => `${result.success ? '✓' : '✗'} **${call.name}**: ${result.message}`)
        .join('\n');
      const finalContent = toolSummary
        ? (text ? `${text}\n\n---\n${toolSummary}` : toolSummary)
        : text;

      appendMessageToSession(session.id, {
        id: generateShortId('msg'),
        role: 'assistant',
        content: finalContent,
        timestamp: new Date().toISOString(),
        modelName: provider.name,
        skillName: skillForThisMessage?.name,
        contextSnapshot,
      });
    } catch (error: any) {
      const rawError = error.message || String(error);
      if (!(rawError.toLowerCase().includes('abort') || error.name === 'AbortError')) {
        const friendlyError = getFriendlyAiErrorMessage(rawError, language, provider.name);
        appendMessageToSession(session.id, {
          id: generateShortId('msg'),
          role: 'assistant',
          content: '',
          timestamp: new Date().toISOString(),
          modelName: provider.name,
          error: friendlyError,
          contextSnapshot,
        });
        showToast(friendlyError, 'error');
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      inFlightRef.current = false;
      setIsStreaming(false);
    }
  }, [
    activeContext,
    filesMap,
    focusedContext,
    language,
    notes,
    resolveSlashCommand,
    showToast,
    tasks,
    updateSkillUsage,
    appendMessageToSession,
    workspaceId,
  ]);

  const sendMessage = useCallback(
    (content: string) => runMessage({ rawContent: content }),
    [runMessage]
  );

  const stopMessage = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  const retryMessage = useCallback((messageIndex: number) => {
    if (inFlightRef.current) return;
    const live = getStore();
    const scopedSessions = live.sessions.filter(
      session => (session.workspaceId || 'default') === workspaceId
    );
    const session = scopedSessions.find(candidate => candidate.id === live.activeSessionId) || scopedSessions[0] || null;
    const target = session?.messages[messageIndex];
    if (!session || !target || target.role !== 'assistant') return;

    let userIndex = messageIndex - 1;
    while (userIndex >= 0 && session.messages[userIndex].role !== 'user') userIndex--;
    if (userIndex < 0) return;
    const userMessage = session.messages[userIndex];

    const latestFailure = messageIndex === session.messages.length - 1 && Boolean(target.error);
    if (latestFailure) {
      setStore(prev => ({
        sessions: prev.sessions.map(candidate => candidate.id === session.id ? {
          ...candidate,
          messages: candidate.messages.filter(message => message.id !== target.id),
          updatedAt: new Date().toISOString(),
        } : candidate),
      }));
      void runMessage({
        rawContent: userMessage.content,
        sessionId: session.id,
        reuseUserMessage: userMessage,
        contextSnapshot: target.contextSnapshot,
      });
      return;
    }

    const fork = createNewSession(session.workspaceId || workspaceId);
    fork.title = `${session.title} · ${language === 'zh' ? '重试' : 'Retry'}`;
    fork.messages = session.messages.slice(0, userIndex + 1);
    fork.contextItems = target.contextSnapshot || [...session.contextItems];
    setStore(prev => ({
      sessions: [fork, ...prev.sessions],
      activeSessionId: fork.id,
      pendingSkillId: null,
    }));
    void runMessage({
      rawContent: userMessage.content,
      sessionId: fork.id,
      reuseUserMessage: userMessage,
      contextSnapshot: target.contextSnapshot,
    });
  }, [language, runMessage, workspaceId]);

  return { isStreaming, sendMessage, stopMessage, retryMessage };
}
