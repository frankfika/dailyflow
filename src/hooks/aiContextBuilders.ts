/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * AI 会话上下文文本构造器 — 从 useAiSession 抽出, 纯函数 (无 React 依赖).
 * 集中维护 today-tasks / date-tasks / note / project / custom-text 五种 context item
 * 的 Markdown 序列化逻辑，以及 focusedContext 自动注入文本.
 */

import type { ContextItem } from '../types/chat';

export interface BuildContextTextArgs {
  language: 'en' | 'zh';
  tasks: any[];
  notes: any[];
  filesMap: Record<string, string>;
}

export function buildContextText(items: ContextItem[], args: BuildContextTextArgs): string {
  const { language, tasks, notes, filesMap } = args;
  if (items.length === 0) return '';
  const parts: string[] = [];
  for (const item of items) {
    switch (item.type) {
      case 'today-tasks': {
        const taskId = item.data.taskId;
        if (taskId) {
          const task = tasks.find((t: any) => t.id === taskId);
          if (task) {
            parts.push(`## ${language === 'zh' ? '任务' : 'Task'}\n- ${task.title}${task.tags?.length ? ` [${task.tags.join(', ')}]` : ''}`);
          }
        } else {
          const todayTasks = tasks.filter(t => t.status !== 'done');
          parts.push(`## ${language === 'zh' ? '今日任务' : "Today's Tasks"}\n${
            todayTasks.length > 0
              ? todayTasks.map((t: any) => `- ${t.title}${t.tags?.length ? ` [${t.tags.join(', ')}]` : ''}`).join('\n')
              : (language === 'zh' ? '（无）' : '(none)')
          }`);
        }
        break;
      }
      case 'date-tasks': {
        const date = item.data.date!;
        const content = filesMap[date];
        if (content) parts.push(`## ${language === 'zh' ? '任务' : 'Tasks'} (${date})\n${content}`);
        break;
      }
      case 'note': {
        const note = notes.find((n: any) => n.id === item.data.noteId);
        if (note) parts.push(`## ${language === 'zh' ? '笔记' : 'Note'}: ${note.title}\n${note.body || note.content || ''}`);
        break;
      }
      case 'project': {
        const projectName = item.data.projectName!;
        const projectTasks = tasks.filter((t: any) => t.project === projectName || t.tags?.includes(projectName));
        parts.push(`## ${language === 'zh' ? '项目' : 'Project'}: ${projectName}\n${
          projectTasks.map((t: any) => `- [${t.status === 'done' ? 'x' : ' '}] ${t.title}`).join('\n') || (language === 'zh' ? '（空）' : '(empty)')
        }`);
        break;
      }
      case 'custom-text':
        parts.push(`## ${item.label}\n${item.data.text || ''}`);
        break;
    }
  }
  return parts.join('\n\n');
}

export function buildAutoContextText(
  focusedContext: { type: 'note' | 'today'; id?: string; title?: string; content?: string } | null | undefined,
  args: BuildContextTextArgs
): string {
  const { language, tasks, notes } = args;
  if (!focusedContext) return '';
  if (focusedContext.type === 'today') {
    const todayTasks = tasks.filter((t: any) => t.status !== 'done');
    if (todayTasks.length === 0) return '';
    return `## ${language === 'zh' ? '今日任务' : "Today's Tasks"}\n${todayTasks.map((t: any) => `- [${t.status === 'done' ? 'x' : ' '}] ${t.title}${t.tags?.length ? ` [${t.tags.join(', ')}]` : ''}`).join('\n')}`;
  }
  if (focusedContext.type === 'note') {
    if (focusedContext.content) {
      return `## ${language === 'zh' ? '当前笔记' : 'Current Note'}${focusedContext.title ? ': ' + focusedContext.title : ''}\n${focusedContext.content}`;
    }
    if (notes.length > 0) {
      const recentNotes = notes.slice(0, 5);
      return `## ${language === 'zh' ? '笔记列表' : 'Notes'}\n${recentNotes.map((n: any) => `- ${n.title || (language === 'zh' ? '（无标题）' : '(untitled)')}`).join('\n')}`;
    }
  }
  return '';
}

export function deriveAutoContextLabel(
  focusedContext: { type: 'note' | 'today'; id?: string; title?: string; content?: string } | null | undefined,
  tasks: any[],
  language: 'en' | 'zh'
): string | null {
  if (!focusedContext) return null;
  if (focusedContext.type === 'today') {
    const count = tasks.filter((t: any) => t.status !== 'done').length;
    return `${language === 'zh' ? '今日任务' : "Today's Tasks"} (${count})`;
  }
  if (focusedContext.type === 'note') {
    return focusedContext.title || (language === 'zh' ? '当前笔记' : 'Current Note');
  }
  return null;
}
