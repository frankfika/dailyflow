/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * useAiSessionSend — sendMessage / stopMessage / retryMessage 实现, 抽出来让 useAiSession 主文件
 * 保持在 400 行内. (R3 重构, 2026-07-12)
 */

import { useCallback, useRef, useState } from 'react';
import { aiApi, type PromptTemplateData, loadSkillUsage, recordSkillUse, sortSkillsByUsage } from '../api/client';
import { buildToolInstructions, parseToolCalls } from '../types/ai-tools';
import { executeToolCall } from '../utils/aiToolExecutor';
import { getFriendlyAiErrorMessage } from '../utils/aiErrorMessage';
import { getTodayStr } from '../utils/tagColors';
import { generateShortId } from '../utils/idGenerator';
import { deriveSessionTitle, type ChatMessage, type ContextItem } from '../types/chat';
import { getStore, setStore } from './useAiSessionStore';
import { buildContextText, buildAutoContextText } from './aiContextBuilders';

export interface UseSendPipelineOptions {
  language: 'en' | 'zh';
  tasks: any[];
  notes: any[];
  filesMap: Record<string, string>;
  activeContext?: 'work' | 'life';
  showToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
  focusedContext?: { type: 'note' | 'today'; id?: string; title?: string; content?: string } | null;
}

export function useSendPipeline(opts: UseSendPipelineOptions) {
  const { language, tasks, notes, filesMap, activeContext = 'work', showToast, focusedContext } = opts;

  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const ctxArgs = { language, tasks, notes, filesMap };

  const resolveSlashCommand = useCallback((text: string, skills: PromptTemplateData[]) => {
    if (!text.startsWith('/')) return { content: text, matchedSkill: null };
    const cmd = text.split(/\s/)[0];
    const matched = skills.find(s => s.commands?.some(c => c === cmd));
    if (matched) return { content: text.slice(cmd.length).trim(), matchedSkill: matched };
    return { content: text, matchedSkill: null };
  }, []);

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

  const appendMessageToSession = useCallback((sessionId: string, message: ChatMessage, opts?: { retitle?: boolean }) => {
    setStore({
      sessions: getStore().sessions.map(s => s.id === sessionId ? {
        ...s,
        messages: [...s.messages, message],
        title: opts?.retitle && s.messages.length === 0 ? deriveSessionTitle([...s.messages, message]) : s.title,
        updatedAt: new Date().toISOString(),
      } : s),
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

    const { content: cleanedContent, matchedSkill } = resolveSlashCommand(content, live.skills);
    const contentToSend = cleanedContent;
    if (matchedSkill) setStore({ pendingSkillId: matchedSkill.id });
    const skillForThisMessage = matchedSkill || activeSk;

    const userMessage: ChatMessage = {
      id: generateShortId('msg'),
      role: 'user',
      content: contentToSend,
      timestamp: new Date().toISOString(),
    };

    const contextSnapshot = [...session.contextItems];
    appendMessageToSession(session.id, userMessage, { retitle: true });

    setIsStreaming(true);
    if (!matchedSkill) setStore({ pendingSkillId: null });
    if (skillForThisMessage) recordSkillUsage(skillForThisMessage);

    // Build prompt
    const contextText = buildContextText(contextSnapshot, ctxArgs);
    const autoContextText = buildAutoContextText(focusedContext, ctxArgs);
    let userPrompt = contentToSend;
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
        const toolSummary = toolResults.map(({ call, result }) => `${result.success ? '✓' : '✗'} **${call.name}**: ${result.message}`).join('\n');
        finalContent = cleanedText ? `${cleanedText}\n\n---\n${toolSummary}` : toolSummary;
      }

      appendMessageToSession(session.id, {
        id: generateShortId('msg'),
        role: 'assistant',
        content: finalContent,
        timestamp: new Date().toISOString(),
        modelName: provider.name,
        skillName: skillForThisMessage?.name,
        contextSnapshot,
      });
    } catch (err: any) {
      const rawError = err.message || String(err);
      if (!(rawError.toLowerCase().includes('abort') || err.name === 'AbortError')) {
        const friendlyError = getFriendlyAiErrorMessage(rawError, language, provider.name);
        appendMessageToSession(session.id, {
          id: generateShortId('msg'),
          role: 'assistant',
          content: '',
          timestamp: new Date().toISOString(),
          modelName: provider.name,
          error: friendlyError,
        });
        showToast(friendlyError, 'error');
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [isStreaming, language, activeContext, tasks, focusedContext, showToast, ctxArgs, resolveSlashCommand, recordSkillUsage, appendMessageToSession]);

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

  return { isStreaming, sendMessage, stopMessage, retryMessage };
}
