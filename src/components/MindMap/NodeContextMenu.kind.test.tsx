/**
 * NodeContextMenu — Sprint 1 / Gap 1 kind coverage.
 *
 * Three dedicated cases for the new Phase-2 label-only kinds
 * (question / resource / risk):
 *
 *   1. Change-Type group is always rendered and shows three buttons
 *      for a `branch` node; the active-kind button is disabled.
 *   2. The root kind still hides the entire menu (including the new
 *      group), preserving the existing root-immutability guarantee.
 *   3. Clicking one of the buttons fires `onChangeKind` with the
 *      matching literal, then closes the menu.
 *
 * These tests intentionally duplicate the helper from
 * `NodeContextMenu.test.tsx` rather than share it, because the
 * existing helper already covers the four classic buttons — we want
 * to keep this file readable on its own as the spec for the new
 * group.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { NodeContextMenu } from './NodeContextMenu';
import type { MindMapNodeKind } from '../../api/client';

afterEach(() => cleanup());

function renderMenu(
  overrides: Partial<React.ComponentProps<typeof NodeContextMenu>> = {},
) {
  const onPromote = vi.fn();
  const onLink = vi.fn();
  const onSetTag = vi.fn();
  const onUnclassify = vi.fn();
  const onChangeKind = vi.fn();
  const onClose = vi.fn();
  const props: React.ComponentProps<typeof NodeContextMenu> = {
    open: true,
    position: { x: 100, y: 200 },
    kind: 'branch',
    language: 'zh',
    taskOptions: [],
    onPromote,
    onLink,
    onSetTag,
    onUnclassify,
    onChangeKind,
    onClose,
    ...overrides,
  };
  const result = render(<NodeContextMenu {...props} />);
  return {
    ...result,
    onPromote,
    onLink,
    onSetTag,
    onUnclassify,
    onChangeKind,
    onClose,
  };
}

describe('NodeContextMenu — Phase-2 Change-Type group', () => {
  it('renders Question / Resource / Risk buttons for a branch node and marks the active kind disabled', () => {
    // Case 1 — a plain branch node shows all three buttons as live.
    const branch = renderMenu({ kind: 'branch' });
    const ctx = within(branch.container);
    expect(ctx.getByTestId('node-context-menu-change-type')).toBeInTheDocument();
    const q = ctx.getByTestId('node-context-menu-change-question') as HTMLButtonElement;
    const r = ctx.getByTestId('node-context-menu-change-resource') as HTMLButtonElement;
    const k = ctx.getByTestId('node-context-menu-change-risk') as HTMLButtonElement;
    expect(q).toBeInTheDocument();
    expect(r).toBeInTheDocument();
    expect(k).toBeInTheDocument();
    expect(q.disabled).toBe(false);
    expect(r.disabled).toBe(false);
    expect(k.disabled).toBe(false);
    expect(q.dataset.kind).toBe('question');
    expect(r.dataset.kind).toBe('resource');
    expect(k.dataset.kind).toBe('risk');
    expect(q.dataset.active).toBe('false');
    // None of the four classic callbacks should have fired yet.
    expect(branch.onChangeKind).not.toHaveBeenCalled();
    expect(branch.onClose).not.toHaveBeenCalled();

    // Case 1 (continued) — when the node is already a `question`, only
    // that entry is disabled; the other two stay live so the user can
    // still re-classify.
    const qNode = renderMenu({ kind: 'question' });
    const qCtx = within(qNode.container);
    const qOnQ = qCtx.getByTestId('node-context-menu-change-question') as HTMLButtonElement;
    const rOnQ = qCtx.getByTestId('node-context-menu-change-resource') as HTMLButtonElement;
    const kOnQ = qCtx.getByTestId('node-context-menu-change-risk') as HTMLButtonElement;
    expect(qOnQ.disabled).toBe(true);
    expect(qOnQ.dataset.active).toBe('true');
    expect(rOnQ.disabled).toBe(false);
    expect(kOnQ.disabled).toBe(false);
  });

  it('does not render any menu — including the new Change-Type group — when the node is root', () => {
    // Root is the space anchor; no menu, no Change-Type buttons.
    const view = renderMenu({ kind: 'root' });
    const ctx = within(view.container);
    expect(ctx.queryByTestId('node-context-menu')).not.toBeInTheDocument();
    expect(ctx.queryByTestId('node-context-menu-change-type')).not.toBeInTheDocument();
    expect(ctx.queryByTestId('node-context-menu-change-question')).not.toBeInTheDocument();
    expect(ctx.queryByTestId('node-context-menu-change-resource')).not.toBeInTheDocument();
    expect(ctx.queryByTestId('node-context-menu-change-risk')).not.toBeInTheDocument();
  });

  it('clicking a Change-Type button fires onChangeKind with the matching literal and closes the menu', () => {
    const a = renderMenu({ kind: 'branch' });
    fireEvent.click(within(a.container).getByTestId('node-context-menu-change-question'));
    expect(a.onChangeKind).toHaveBeenCalledTimes(1);
    expect(a.onChangeKind).toHaveBeenCalledWith('question');
    expect(a.onClose).toHaveBeenCalledTimes(1);

    const b = renderMenu({ kind: 'branch' });
    fireEvent.click(within(b.container).getByTestId('node-context-menu-change-resource'));
    expect(b.onChangeKind).toHaveBeenCalledTimes(1);
    expect(b.onChangeKind).toHaveBeenCalledWith('resource');
    expect(b.onClose).toHaveBeenCalledTimes(1);

    const c = renderMenu({ kind: 'branch' });
    fireEvent.click(within(c.container).getByTestId('node-context-menu-change-risk'));
    expect(c.onChangeKind).toHaveBeenCalledTimes(1);
    expect(c.onChangeKind).toHaveBeenCalledWith('risk');
    expect(c.onClose).toHaveBeenCalledTimes(1);

    // Clicking the already-active button is a no-op: the menu handler
    // short-circuits before calling onChangeKind, and onClose is also
    // not fired (same behavior as the existing disabled SetTag button).
    const d = renderMenu({ kind: 'risk' });
    fireEvent.click(within(d.container).getByTestId('node-context-menu-change-risk'));
    expect(d.onChangeKind).not.toHaveBeenCalled();
    expect(d.onClose).not.toHaveBeenCalled();
  });

  // Bonus assertion (still within the 3-case spirit): the English
  // copy uses the documented labels so the new buttons read correctly
  // for an `en` workspace. This stays in this file because the case
  // is specifically about Gap-1 i18n, not the classic menu items.
  it('renders English labels on the Change-Type group', () => {
    const view = renderMenu({ kind: 'branch', language: 'en' });
    const ctx = within(view.container);
    expect(ctx.getByTestId('node-context-menu-change-question').textContent).toContain('Mark as Question');
    expect(ctx.getByTestId('node-context-menu-change-resource').textContent).toContain('Mark as Resource');
    expect(ctx.getByTestId('node-context-menu-change-risk').textContent).toContain('Mark as Risk');
  });
});
