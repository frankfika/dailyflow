/**
 * AI Tool Executor — runs parsed tool calls against the DailyFlow API.
 */

import { notesApi, tasksApi, filesApi } from '../api/client';
import type { AIToolCall, AIToolResult } from '../types/ai-tools';
import { getTodayStr } from './tagColors';
import { generateTaskId } from './idGenerator';

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
        const { title, body, type = 'note', tags = [] } = call.arguments;
        if (!title || !body) {
          return { success: false, message: 'Title and body are required' };
        }
        await notesApi.create({
          title: String(title).trim(),
          body: String(body).trim(),
          type: ['note', 'meeting_note', 'summary'].includes(type) ? type : 'note',
          date: ctx.currentDate,
          context: ctx.activeContext,
          tags: Array.isArray(tags) ? tags : [],
          linkedTaskIds: [],
          linkedProjectIds: [],
        });
        ctx.showToast(ctx.language === 'zh' ? `笔记「${title}」已创建` : `Note "${title}" created`, 'success');
        return { success: true, message: ctx.language === 'zh' ? '笔记已创建' : 'Note created' };
      }

      case 'create_task': {
        const { title, tags = [], deadline, description } = call.arguments;
        if (!title) {
          return { success: false, message: 'Title is required' };
        }
        const taskTags = Array.isArray(tags) ? [...tags] : [];
        if (!taskTags.some((t: string) => ['work', 'life'].includes(t))) {
          taskTags.push(ctx.activeContext);
        }
        const newTask = {
          id: generateTaskId(),
          title: String(title).trim(),
          description: description ? String(description).trim() : undefined,
          status: 'todo' as const,
          tags: taskTags,
          deadline: deadline ? String(deadline) : undefined,
          source_date: ctx.currentDate,
        };
        await tasksApi.create(ctx.currentDate, newTask);
        ctx.showToast(ctx.language === 'zh' ? `任务「${title}」已创建` : `Task "${title}" created`, 'success');
        return { success: true, message: ctx.language === 'zh' ? '任务已创建' : 'Task created' };
      }

      case 'mark_task_done': {
        const { taskId, title } = call.arguments;
        let target = ctx.tasks.find((t: any) => t.id === taskId);
        if (!target && title) {
          target = ctx.tasks.find((t: any) => t.title === title);
        }
        if (!target) {
          return { success: false, message: ctx.language === 'zh' ? '未找到任务' : 'Task not found' };
        }
        await tasksApi.updateStatus(target.id, ctx.currentDate, 'done');
        ctx.showToast(ctx.language === 'zh' ? `「${target.title}」已完成` : `"${target.title}" marked done`, 'success');
        return { success: true, message: ctx.language === 'zh' ? '任务已标记完成' : 'Task marked done' };
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
