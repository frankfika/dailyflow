/**
 * AiConfirmDialog — human gate UI (C1/C2).
 *
 * Verifies: renders on bus request with role="dialog"/aria-modal, confirm
 * resolves true, Esc/cancel resolves false.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => React.createElement('div', props, children),
  },
  AnimatePresence: ({ children }: any) => React.createElement(React.Fragment, null, children),
}));

import { AiConfirmDialog } from '../../components/AiConfirmDialog';
import {
  getPendingAiConfirm,
  requestAiConfirmation,
  resolveAiConfirmation,
} from '../../utils/aiConfirmBus';

beforeEach(() => {
  cleanup();
  // Make sure no request leaks between tests.
  const pending = getPendingAiConfirm();
  if (pending) resolveAiConfirmation(pending.id, false);
});

describe('AiConfirmDialog', () => {
  it('is hidden while no confirmation is pending', () => {
    render(<AiConfirmDialog />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows a delete request as a modal dialog and resolves true on confirm', async () => {
    render(<AiConfirmDialog />);
    const pending = requestAiConfirmation({
      kind: 'delete',
      tool: 'delete_task',
      targetSummary: 'Doomed task',
      language: 'en',
    });

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveTextContent('Doomed task');

    fireEvent.click(screen.getByTestId('ai-confirm-confirm'));
    await expect(pending).resolves.toBe(true);
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('Esc closes the dialog as a cancel', async () => {
    render(<AiConfirmDialog />);
    const pending = requestAiConfirmation({
      kind: 'delete',
      tool: 'delete_note',
      language: 'zh',
    });

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    await expect(pending).resolves.toBe(false);
  });

  it('batch_write requests list every queued item and resolve on confirm', async () => {
    render(<AiConfirmDialog />);
    const pending = requestAiConfirmation({
      kind: 'batch_write',
      items: ['create_task「A」', 'create_task「B」', 'update_task「C」'],
      language: 'en',
    });

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    expect(screen.getByText('create_task「A」')).toBeInTheDocument();
    expect(screen.getByText('update_task「C」')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('ai-confirm-cancel'));
    await expect(pending).resolves.toBe(false);
  });
});
