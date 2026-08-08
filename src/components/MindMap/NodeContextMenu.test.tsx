/**
 * NodeContextMenu — component-level tests.
 *
 * Covers the four contracts Phase 2 promises:
 *   1. Promote / Link / SetTag / Unclassify each fire the matching
 *      callback.
 *   2. Root kind has no mutation menu.
 *   3. The Link picker shows tasks and clicking one fires onLink with
 *      the right id + date.
 *   4. Outside click / Escape closes the menu.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { NodeContextMenu } from './NodeContextMenu';
import type { MindMapNodeKind } from '../../api/client';

afterEach(() => cleanup());

const SAMPLE_TASKS = [
  { id: 't1', title: '起草合同', status: 'todo' as const, date: '2026-08-07' },
  { id: 't2', title: '准备投资人名单', status: 'done' as const, date: '2026-08-06' },
  { id: 't3', title: '代码 review', status: 'todo' as const, date: '2026-08-05' },
];

function renderMenu(
  overrides: Partial<React.ComponentProps<typeof NodeContextMenu>> = {},
) {
  const onPromote = vi.fn();
  const onLink = vi.fn();
  const onSetTag = vi.fn();
  const onUnclassify = vi.fn();
  const onClose = vi.fn();
  const props: React.ComponentProps<typeof NodeContextMenu> = {
    open: true,
    position: { x: 100, y: 200 },
    kind: 'branch',
    language: 'zh',
    taskOptions: SAMPLE_TASKS,
    onPromote,
    onLink,
    onSetTag,
    onUnclassify,
    onClose,
    ...overrides,
  };
  const result = render(<NodeContextMenu {...props} />);
  return { ...result, onPromote, onLink, onSetTag, onUnclassify, onClose };
}

describe('NodeContextMenu', () => {
  it('renders all four actions for a branch kind and fires the right callback', () => {
    // One render per action keeps each callback ref scoped to its own
    // spy set. The renderMenu helper returns a fresh spy set every
    // time so the assertions stay clean.
    const a = renderMenu({ kind: 'branch' });
    fireEvent.click(within(a.container).getByTestId('node-context-menu-promote'));
    expect(a.onPromote).toHaveBeenCalledTimes(1);
    expect(a.onClose).toHaveBeenCalledTimes(1);

    const b = renderMenu({ kind: 'branch' });
    fireEvent.click(within(b.container).getByTestId('node-context-menu-link'));
    // Link flips into picker mode; the next click is on a task.
    fireEvent.click(within(b.container).getByTestId('node-context-menu-link-option-t1'));
    expect(b.onLink).toHaveBeenCalledWith('t1', '2026-08-07');
    expect(b.onClose).toHaveBeenCalled();

    const c = renderMenu({ kind: 'branch' });
    fireEvent.click(within(c.container).getByTestId('node-context-menu-set-tag'));
    expect(c.onSetTag).toHaveBeenCalledTimes(1);
    expect(c.onUnclassify).not.toHaveBeenCalled();
    expect(c.onClose).toHaveBeenCalled();

    const d = renderMenu({ kind: 'branch' });
    fireEvent.click(within(d.container).getByTestId('node-context-menu-unclassify'));
    expect(d.onUnclassify).toHaveBeenCalledTimes(1);
    expect(d.onClose).toHaveBeenCalled();
  });

  it('does not render mutation actions for the root kind', () => {
    renderMenu({ kind: 'root' });
    expect(screen.queryByTestId('node-context-menu')).not.toBeInTheDocument();
  });

  it('disables SetTag when the node is already a tag (no-op)', () => {
    const { onSetTag } = renderMenu({ kind: 'tag' });
    const setTagBtn = screen.getByTestId('node-context-menu-set-tag') as HTMLButtonElement;
    expect(setTagBtn.disabled).toBe(true);
    // Even when we click a disabled button, the callback is not invoked
    // because the browser already cancels the synthetic event before it
    // reaches our handler.
    fireEvent.click(setTagBtn);
    expect(onSetTag).not.toHaveBeenCalled();
    expect(screen.queryByTestId('node-context-menu-promote')).not.toBeInTheDocument();
  });

  it('does not offer duplicate promotion for an existing task node', () => {
    renderMenu({ kind: 'task' });
    expect(screen.queryByTestId('node-context-menu-promote')).not.toBeInTheDocument();
    expect(screen.getByTestId('node-context-menu-link')).toBeInTheDocument();
  });

  it('shows tasks in the link picker and forwards id+date on click', () => {
    const { onLink } = renderMenu({ kind: 'branch' });
    // Open the link picker.
    fireEvent.click(screen.getByTestId('node-context-menu-link'));
    const input = screen.getByTestId('node-context-menu-link-input') as HTMLInputElement;
    expect(input).toBeInTheDocument();

    // All sample tasks render as options.
    for (const t of SAMPLE_TASKS) {
      expect(screen.getByTestId(`node-context-menu-link-option-${t.id}`)).toBeInTheDocument();
    }

    // Filter by query.
    fireEvent.change(input, { target: { value: '投资人' } });
    // Only the matching task remains.
    expect(screen.queryByTestId('node-context-menu-link-option-t1')).not.toBeInTheDocument();
    expect(screen.getByTestId('node-context-menu-link-option-t2')).toBeInTheDocument();

    // Click an option; the parent gets the right id and date.
    fireEvent.click(screen.getByTestId('node-context-menu-link-option-t2'));
    expect(onLink).toHaveBeenCalledWith('t2', '2026-08-06');
  });

  it('Escape inside the link picker goes back to the main menu (does not close)', () => {
    const { onClose } = renderMenu({ kind: 'branch' });
    fireEvent.click(screen.getByTestId('node-context-menu-link'));
    const input = screen.getByTestId('node-context-menu-link-input') as HTMLInputElement;
    fireEvent.keyDown(input, { key: 'Escape' });
    // We should be back in the main menu (link option buttons are gone).
    expect(screen.queryByTestId('node-context-menu-link-input')).not.toBeInTheDocument();
    expect(screen.getByTestId('node-context-menu-promote')).toBeInTheDocument();
    // The menu itself is still open (parent's onClose not called).
    expect(onClose).not.toHaveBeenCalled();
  });

  it('outside click closes the menu (via onClose)', () => {
    const { onClose } = renderMenu({ kind: 'branch' });
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('window Escape closes the menu', () => {
    const { onClose } = renderMenu({ kind: 'branch' });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not render when open is false', () => {
    renderMenu({ open: false });
    expect(screen.queryByTestId('node-context-menu')).not.toBeInTheDocument();
  });

  it('English labels render the English copy', () => {
    renderMenu({ kind: 'branch', language: 'en' });
    const promoteBtn = screen.getByTestId('node-context-menu-promote');
    expect(promoteBtn.textContent).toContain('Convert to Task');
  });
});
