import { beforeEach, describe, expect, it, vi } from 'vitest';

import { executeToolCall, type ToolContext } from '../../utils/aiToolExecutor';

const context: ToolContext = {
  currentDate: '2026-07-28',
  activeContext: 'work',
  language: 'en',
  tasks: [],
  showToast: vi.fn(),
};

describe('executeToolCall mutation safety', () => {
  beforeEach(() => vi.clearAllMocks());

  it('blocks create_task until AI Chat has a visible review flow', async () => {
    const result = await executeToolCall({
      name: 'create_task',
      arguments: { title: 'Prepare review', deadline: '2026-07-30' },
    }, context);

    expect(result.success).toBe(false);
    expect(result.message).toContain('no data was written');
  });

  it.each(['create_note', 'mark_task_done'])(
    'blocks unsupported write tool %s and performs no mutation',
    async name => {
      const result = await executeToolCall({ name, arguments: {} }, context);
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/no (data was written|item was changed)/);
    }
  );

  it('includes matching tasks in search output', async () => {
    const result = await executeToolCall({ name: 'search_tasks', arguments: { query: 'review' } }, {
      ...context,
      tasks: [{ title: 'Prepare review', status: 'todo', tags: ['work'] }],
    });
    expect(result.success).toBe(true);
    expect(result.message).toContain('- [ ] Prepare review (work)');
  });
});
