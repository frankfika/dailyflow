/**
 * AI Tool Executor — evaluates parsed tool calls without direct writes.
 * Mutations must become reviewable v2 Proposals or return a clear unavailable result.
 */

import { createProposalDraft } from '../features/v2/api/client';
import type { AIToolCall, AIToolResult } from '../types/ai-tools';
import { generateShortId } from './idGenerator';

export interface ToolContext {
  currentDate: string;
  activeContext: 'work' | 'life';
  language: 'en' | 'zh';
  tasks: any[];
  showToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

export async function executeToolCall(
  call: AIToolCall,
  ctx: ToolContext
): Promise<AIToolResult> {
  try {
    switch (call.name) {
      case 'create_note': {
        return {
          success: false,
          message: ctx.language === 'zh'
            ? 'AI 对话暂不支持创建笔记 Proposal；未写入任何数据。请使用“保存为笔记”预览并确认。'
            : 'Note proposals are not supported in AI Chat yet; no data was written. Use “Save as note” to preview and confirm.',
        };
      }

      case 'create_task': {
        const { title, tags = [], deadline, description } = call.arguments;
        if (!title) {
          return { success: false, message: 'Title is required' };
        }
        const cleanTitle = String(title).trim();
        await createProposalDraft({
          kind: 'extract_commitments',
          changes: [{
            op: 'create',
            entity: 'commitment',
            draft: {
              title: cleanTitle,
              outcome: String(description || cleanTitle).trim(),
              nextAction: cleanTitle,
              state: 'inbox',
              createdBy: 'ai',
              tags: Array.isArray(tags) ? tags : [],
              context: ctx.activeContext,
              dueAt: deadline ? `${String(deadline)}T09:00:00.000Z` : undefined,
            },
            evidenceIds: [],
            confidence: 0.8,
            reason: ctx.language === 'zh'
              ? '由 AI 对话生成，等待用户确认'
              : 'Generated in AI Chat; waiting for user confirmation',
            changeId: generateShortId('change'),
          }],
        });
        ctx.showToast(
          ctx.language === 'zh' ? `已生成「${cleanTitle}」的待确认建议` : `Proposal for "${cleanTitle}" is ready for review`,
          'success'
        );
        return {
          success: true,
          message: ctx.language === 'zh' ? '已生成待确认事项建议，尚未写入事项' : 'Created a pending proposal; the item has not been written yet',
        };
      }

      case 'mark_task_done': {
        return {
          success: false,
          message: ctx.language === 'zh'
            ? 'AI 对话暂不支持完成事项 Proposal；未修改任何事项。请在 Today 中确认完成。'
            : 'Completion proposals are not supported in AI Chat yet; no item was changed. Confirm completion in Today.',
        };
      }

      case 'search_tasks': {
        const { query } = call.arguments;
        if (!query) {
          return { success: false, message: 'Query is required' };
        }
        const q = String(query).toLowerCase();
        const matches = ctx.tasks.filter((t: any) =>
          t.title?.toLowerCase().includes(q) ||
          t.tags?.some((tag: string) => tag.toLowerCase().includes(q))
        );
        if (matches.length === 0) {
          return { success: true, message: ctx.language === 'zh' ? '未找到匹配的任务' : 'No matching tasks found', data: [] };
        }
        const list = matches.map((t: any) => `- [${t.status === 'done' ? 'x' : ' '}] ${t.title}${t.tags?.length ? ` (${t.tags.join(', ')})` : ''}`).join('\n');
        return { success: true, message: ctx.language === 'zh' ? `找到 ${matches.length} 个任务` : `Found ${matches.length} task(s)`, data: matches };
      }

      default:
        return { success: false, message: `Unknown tool: ${call.name}` };
    }
  } catch (err: any) {
    return { success: false, message: err.message || String(err) };
  }
}
