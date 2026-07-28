/**
 * Shared AI Chat action utilities.
 */

import { createProposalDraft } from '../features/v2/api/client';
import { generateShortId } from './idGenerator';

export interface CreateTasksOptions {
  activeContext: 'work' | 'life';
  language: 'en' | 'zh';
  showToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

/**
 * Extract todo items from a message and create tasks.
 * Reports both successes and failures to the user.
 */
export async function createTaskProposalsFromMessage(
  content: string,
  options: CreateTasksOptions
): Promise<void> {
  const { activeContext, language, showToast } = options;

  const lines = content.split('\n');
  const todoLines = lines.filter(l => /^\s*[-*]\s*\[\s*\]\s+/.test(l));
  const titles = todoLines.length > 0
    ? todoLines.map(l => l.replace(/^\s*[-*]\s*\[\s*\]\s+/, '').trim())
    : [];

  if (titles.length === 0) {
    showToast(language === 'zh' ? '未找到可创建的任务（需要 - [ ] 格式）' : 'No tasks found to create (need - [ ] format)', 'info');
    return;
  }

  const proposals = titles.slice(0, 10).filter(Boolean);
  try {
    await createProposalDraft({
      kind: 'extract_commitments',
      changes: proposals.map(title => ({
        op: 'create',
        entity: 'commitment',
        draft: {
          title,
          outcome: title,
          nextAction: title,
          state: 'inbox',
          createdBy: 'ai',
          context: activeContext,
        },
        evidenceIds: [],
        confidence: 0.75,
        reason: language === 'zh' ? '从 AI 回复提取，等待用户确认' : 'Extracted from an AI response; waiting for confirmation',
        changeId: generateShortId('change'),
      })),
    });
    showToast(
      language === 'zh'
        ? `已生成 ${proposals.length} 个待确认事项建议`
        : `Created ${proposals.length} item proposal(s) for review`,
      'success'
    );
  } catch (err) {
    console.error('Task proposal creation failed:', err);
    showToast(
      language === 'zh' ? '事项建议生成失败，未写入任何数据' : 'Could not create proposals; no data was written',
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
