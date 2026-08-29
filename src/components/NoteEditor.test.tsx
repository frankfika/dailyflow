import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NoteEditor } from './NoteEditor';

vi.mock('../api/client', () => ({
  promptsApi: { getAll: vi.fn().mockResolvedValue([]) },
  aiApi: { summarize: vi.fn() },
}));

vi.mock('../types/models', () => ({
  getActiveAiConfig: () => null,
}));

describe('Quick Note save shortcut', () => {
  it('owns Ctrl+S and saves the Note instead of the browser page', async () => {
    const onSave = vi.fn();
    render(
      <NoteEditor
        language="en"
        activeContext="work"
        defaultTitle="Shortcut note"
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );
    const shortcut = new KeyboardEvent('keydown', {
      key: 's',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });

    document.dispatchEvent(shortcut);

    expect(shortcut.defaultPrevented).toBe(true);
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({
      title: 'Shortcut note',
      body: '# Shortcut note\n\n',
      context: 'work',
    });
  });
});
