import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../features/v2/api/client', () => ({
  createProposalDraft: vi.fn().mockResolvedValue({ proposal: { id: 'proposal-1' } }),
}));

import { createProposalDraft } from '../../features/v2/api/client';
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

  it('turns create_task into a pending Proposal instead of a direct write', async () => {
    const result = await executeToolCall({
      name: 'create_task',
      arguments: { title: 'Prepare review', deadline: '2026-07-30' },
    }, context);

    expect(result.success).toBe(true);
    expect(result.message).toContain('not been written');
    expect(createProposalDraft).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'extract_commitments',
      changes: [expect.objectContaining({
        op: 'create',
        entity: 'commitment',
        draft: expect.objectContaining({ title: 'Prepare review', state: 'inbox' }),
      })],
    }));
  });

  it.each(['create_note', 'mark_task_done'])(
    'blocks unsupported write tool %s and performs no mutation',
    async name => {
      const result = await executeToolCall({ name, arguments: {} }, context);
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/no (data was written|item was changed)/);
      expect(createProposalDraft).not.toHaveBeenCalled();
    }
  );
});
