/**
 * Shared chat action utilities for AIChat and FloatingAIPanel.
 */

import { tasksApi } from '../api/client';
import { generateTaskId } from './idGenerator';
import { getTodayStr } from './tagColors';

export interface CreateTasksOptions {
  activeContext: 'work' | 'life';
  language: 'en' | 'zh';
  showToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

/**
 * Extract todo items from a message and create tasks.
 * Reports both successes and failures to the user.
 */
export async function createTasksFromMessage(
  content: string,
  options: CreateTasksOptions
): Promise<void> {
  const { activeContext, language, showToast } = options;

  const lines = content.split('\n');
  const todoLines = lines.filter(l => /^\s*[-*]\s*\[\s*\]\s+/.test(l));
  const titles = todoLines.length > 0
    ? todoLines.map(l => l.replace(/^\s*[-*]\s*\[\s*\]\s+/, '').trim())
    : [content.trim().slice(0, 120)];

  const today = getTodayStr();
  let created = 0;
  let failed = 0;
  const failures: string[] = [];

  for (const title of titles.slice(0, 10)) {
    if (!title) continue;
    try {
      await tasksApi.create(today, {
        id: generateTaskId(),
        title,
        status: 'todo',
        tags: [activeContext],
        source_date: today,
      });
      created++;
    } catch (err: any) {
      failed++;
      failures.push(title);
      console.error('Task creation failed:', title, err);
    }
  }

  if (created > 0 && failed === 0) {
    showToast(
      language === 'zh' ? `已创建 ${created} 个任务` : `Created ${created} task(s)`,
      'success'
    );
  } else if (created > 0 && failed > 0) {
    showToast(
      language === 'zh'
        ? `已创建 ${created} 个任务，${failed} 个失败`
        : `Created ${created}, ${failed} failed`,
      'info'
    );
  } else if (failed > 0) {
    showToast(
      language === 'zh'
        ? `${failed} 个任务创建失败`
        : `Failed to create ${failed} task(s)`,
      'error'
    );
  }
}

/**
 * Copy message content to clipboard with toast feedback.
 */
export function copyMessageContent(
  content: string,
  options: { language: 'en' | 'zh'; showToast: (msg: string, type?: 'success' | 'info' | 'error') => void }
): void {
  navigator.clipboard.writeText(content);
  options.showToast(options.language === 'zh' ? '已复制' : 'Copied', 'success');
}
