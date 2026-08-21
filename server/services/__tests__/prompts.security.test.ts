import { describe, expect, it } from 'vitest';
import { deletePrompt, getPromptById, updatePrompt } from '../prompts.js';

describe('prompt ID path safety', () => {
  it('rejects traversal IDs for read, update, and delete', async () => {
    await expect(getPromptById('../../../outside')).rejects.toThrow(/invalid prompt id/i);
    await expect(updatePrompt('../outside', { name: 'pwned' })).rejects.toThrow(/invalid prompt id/i);
    await expect(deletePrompt('nested/outside')).rejects.toThrow(/invalid prompt id/i);
  });
});
