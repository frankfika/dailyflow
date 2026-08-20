/**
 * OrganizeSuggestionModal — Sprint 1 Gap 2 component test.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  OrganizeSuggestionModal,
} from './OrganizeSuggestionModal';
import type { OrganizeSuggestion } from '../../api/client';

afterEach(() => cleanup());

const SAMPLE: OrganizeSuggestion = {
  groups: [
    { parentText: '任务', parentKind: 'branch', nodeIds: ['n1', 'n2'] },
    { parentText: '疑问', parentKind: 'question', nodeIds: ['n3'] },
  ],
  suggestedEdges: [
    { source: 'root', target: '__proposed_by_topic_0' },
    { source: 'root', target: '__proposed_by_topic_1' },
  ],
  rationale: '将 3 个节点按类型分为 2 组',
};

describe('OrganizeSuggestionModal', () => {
  it('renders groups and rationale', () => {
    render(
      <OrganizeSuggestionModal
        open
        strategy="by_topic"
        suggestion={SAMPLE}
        language="zh"
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('organize-suggestion-modal')).toBeInTheDocument();
    expect(screen.getByTestId("organize-rationale")).toHaveTextContent(SAMPLE.rationale);
    expect(screen.getByTestId('organize-groups').children.length).toBe(2);
  });

  it('calls onApply when apply clicked', () => {
    const onApply = vi.fn();
    render(
      <OrganizeSuggestionModal
        open
        strategy="by_topic"
        suggestion={SAMPLE}
        language="zh"
        onApply={onApply}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('organize-suggestion-apply'));
    expect(onApply).toHaveBeenCalledWith(SAMPLE);
  });

  it('calls onClose when reject clicked', () => {
    const onClose = vi.fn();
    render(
      <OrganizeSuggestionModal
        open
        strategy="by_topic"
        suggestion={SAMPLE}
        language="zh"
        onApply={vi.fn()}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByTestId('organize-suggestion-reject'));
    expect(onClose).toHaveBeenCalled();
  });

  it('does not render when closed', () => {
    render(
      <OrganizeSuggestionModal
        open={false}
        strategy="by_topic"
        suggestion={SAMPLE}
        language="zh"
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('organize-suggestion-modal')).not.toBeInTheDocument();
  });

  it('falls back to empty-state when suggestion is null', () => {
    render(
      <OrganizeSuggestionModal
        open
        strategy={null}
        suggestion={null}
        language="zh"
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/AI 没有给出建议/)).toBeInTheDocument();
  });
});
