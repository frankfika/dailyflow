/**
 * TagFilterRow — component-level tests.
 *
 * Covers the four contracts Phase 3 promises:
 *   1. Empty tag list shows the "no tags yet" placeholder.
 *   2. Each chip click toggles the tag in `selected`.
 *   3. The "clear" pill resets the selection.
 *   4. The component is fully controlled (parent owns the state).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TagFilterRow } from './TagFilterRow';

afterEach(() => cleanup());

describe('TagFilterRow', () => {
  it('shows the "no tags" placeholder when there are no tags', () => {
    render(
      <TagFilterRow
        tags={[]}
        selected={[]}
        onChange={() => {}}
        language="en"
      />,
    );
    expect(screen.getByTestId('tag-filter-row-empty')).toBeInTheDocument();
    expect(screen.getByTestId('tag-filter-row-empty').textContent).toContain('No tags');
  });

  it('renders a chip per tag and toggles selection on click', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <TagFilterRow
        tags={['investor', 'product', 'fundraise']}
        selected={[]}
        onChange={onChange}
        language="zh"
      />,
    );
    // All three chips render.
    expect(screen.getByTestId('tag-filter-row-chip-investor')).toBeInTheDocument();
    expect(screen.getByTestId('tag-filter-row-chip-product')).toBeInTheDocument();
    expect(screen.getByTestId('tag-filter-row-chip-fundraise')).toBeInTheDocument();
    // The clear pill is hidden when nothing is selected.
    expect(screen.queryByTestId('tag-filter-row-clear')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('tag-filter-row-chip-investor'));
    expect(onChange).toHaveBeenLastCalledWith(['investor']);

    // Re-render with the new selection to confirm the clear pill appears.
    rerender(
      <TagFilterRow
        tags={['investor', 'product', 'fundraise']}
        selected={['investor']}
        onChange={onChange}
        language="zh"
      />,
    );
    expect(screen.getByTestId('tag-filter-row-chip-investor').getAttribute('data-active')).toBe('true');
    expect(screen.getByTestId('tag-filter-row-chip-product').getAttribute('data-active')).toBe('false');
    expect(screen.getByTestId('tag-filter-row-clear')).toBeInTheDocument();
    // Toggling an active chip removes it.
    fireEvent.click(screen.getByTestId('tag-filter-row-chip-investor'));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('dedupes the input tag list', () => {
    const onChange = vi.fn();
    render(
      <TagFilterRow
        tags={['investor', 'investor', 'product']}
        selected={[]}
        onChange={onChange}
        language="en"
      />,
    );
    expect(screen.getByTestId('tag-filter-row-chip-investor')).toBeInTheDocument();
    expect(screen.getByTestId('tag-filter-row-chip-product')).toBeInTheDocument();
  });

  it('clear pill resets the selection to []', () => {
    const onChange = vi.fn();
    render(
      <TagFilterRow
        tags={['investor', 'product']}
        selected={['investor', 'product']}
        onChange={onChange}
        language="en"
      />,
    );
    fireEvent.click(screen.getByTestId('tag-filter-row-clear'));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});
