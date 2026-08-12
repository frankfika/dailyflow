/**
 * AI Tool Executor — evaluates parsed tool calls without direct writes.
 * Mutations must become reviewable v2 Proposals or return a clear unavailable result.
 */

import type { AIToolCall, AIToolResult } from '../types/ai-tools';

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
        return {
          success: false,
          message: ctx.language === 'zh'
            ? 'AI 对话暂不支持创建事项；未写入任何数据。请使用 Today 的事项输入框。'
            : 'Task creation is not available in AI Chat; no data was written. Use the task input in Today.',
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
        return {
          success: true,
          message: `${ctx.language === 'zh' ? `找到 ${matches.length} 个任务` : `Found ${matches.length} task(s)`}:\n${list}`,
          data: matches,
        };
      }

      default:
        return { success: false, message: `Unknown tool: ${call.name}` };
    }
  } catch (err: any) {
    return { success: false, message: err.message || String(err) };
  }
}
