/**
 * Tests for ProactiveSuggestionsCard (Gap 3 — Sprint 1).
 *
 * Coverage required by the task spec:
 *   - 0 proposals    → render null
 *   - 1 proposal     → render a single card
 *   - 3+ proposals   → collapsed to a single card with "show more"
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ProactiveSuggestionsCard } from './ProactiveSuggestionsCard';
import type { ProactiveProposal } from '../api/client';

const sample = (id: string, title = 'Send weekly plan'): ProactiveProposal => ({
  id,
  kind: 'overdue_task',
  title,
  body: '关联任务的截止日是 2026-08-12，已逾期 7 天。要不要把它排进今天？',
  entityId: `com_${id}`,
  entityType: 'commitment',
  severity: 'warning',
  createdAt: '2026-08-19T12:00:00.000Z',
  cooldown: { channel: 'today_load' },
  suggestions: [
    { label: '排进今天', action: 'move_to_today' },
    { label: '标记完成', action: 'mark_done' },
    { label: '关闭建议', action: 'dismiss' },
  ],
});

describe('ProactiveSuggestionsCard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when there are no proposals', () => {
    const { container } = render(
      <ProactiveSuggestionsCard language="zh" proposals={[]} />,
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId('proactive-suggestions-card')).toBeNull();
  });

  it('renders one card when there is exactly one proposal', () => {
    render(
      <ProactiveSuggestionsCard language="zh" proposals={[sample('1')]} />,
    );
    const items = screen.getAllByTestId('proposal-item');
    expect(items).toHaveLength(1);
    expect(screen.getByText('Send weekly plan')).toBeInTheDocument();
    expect(screen.getAllByTestId('proposal-action').some(b => b.getAttribute('data-action') === 'move_to_today')).toBe(true);
    expect(screen.queryByTestId('proactive-expand')).toBeNull();
  });

  it('collapses when there are 3+ proposals and expands on click', () => {
    const proposals = [sample('1'), sample('2'), sample('3'), sample('4')];
    render(
      <ProactiveSuggestionsCard language="zh" proposals={proposals} />,
    );
    // Collapsed: only the first card is visible.
    expect(screen.getAllByTestId('proposal-item')).toHaveLength(1);
    const expand = screen.getByTestId('proactive-expand');
    expect(expand).toBeInTheDocument();
    fireEvent.click(expand);
    expect(screen.getAllByTestId('proposal-item')).toHaveLength(4);
  });
});
