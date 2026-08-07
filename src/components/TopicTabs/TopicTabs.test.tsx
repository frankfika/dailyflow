/**
 * TopicTabs — component-level tests.
 *
 * Covers the four contracts that App.tsx relies on:
 *   1. Always renders "全部" + "未分类" + the supplied spaces.
 *   2. Clicking a tab fires onSelect with the right value type
 *      (null for "全部", '__unclassified__' for "未分类", id otherwise).
 *   3. > VISIBLE_LIMIT spaces overflow into a "更多" dropdown that the
 *      user can open and pick from.
 *   4. Creating a new topic surfaces a small input, and pressing Enter
 *      fires onCreate with the trimmed title.
 *
 * The component is otherwise presentational, so we render with @testing-
 * library/react and assert on the `data-testid` hooks it emits.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TopicTabs } from './TopicTabs';
import type { TopicTabItem } from './TopicTabs';

afterEach(() => cleanup());

function makeSpace(
  id: string,
  title: string,
  order = 0,
  overrides: Partial<TopicTabItem> = {},
): TopicTabItem {
  return {
    id,
    title,
    kind: 'topic-space',
    context: 'work',
    order,
    ...overrides,
  };
}

describe('TopicTabs', () => {
  it('renders 全部 / 未分类 / spaces and reflects active state', () => {
    const onSelect = vi.fn();
    render(
      <TopicTabs
        context="work"
        spaces={[makeSpace('s1', 'Alpha'), makeSpace('s2', 'Beta', 1)]}
        activeSpaceId="s1"
        onSelect={onSelect}
      />,
    );

    const all = screen.getByTestId('topic-tab-all');
    const unclassified = screen.getByTestId('topic-tab-unclassified');
    const s1 = screen.getByTestId('topic-tab-s1');
    const s2 = screen.getByTestId('topic-tab-s2');

    expect(all).toBeInTheDocument();
    expect(unclassified).toBeInTheDocument();
    expect(s1).toBeInTheDocument();
    expect(s2).toBeInTheDocument();

    // active state mirrors the prop
    expect(s1.getAttribute('data-active')).toBe('true');
    expect(s2.getAttribute('data-active')).toBe('false');
    expect(all.getAttribute('data-active')).toBe('false');
    expect(unclassified.getAttribute('data-active')).toBe('false');
  });

  it('emits null when 全部 is clicked, "__unclassified__" when 未分类 is clicked', () => {
    const onSelect = vi.fn();
    render(
      <TopicTabs
        context="work"
        spaces={[]}
        activeSpaceId={null}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByTestId('topic-tab-all'));
    expect(onSelect).toHaveBeenLastCalledWith(null);

    fireEvent.click(screen.getByTestId('topic-tab-unclassified'));
    expect(onSelect).toHaveBeenLastCalledWith('__unclassified__');
  });

  it('emits the space id when a space tab is clicked', () => {
    const onSelect = vi.fn();
    render(
      <TopicTabs
        context="work"
        spaces={[makeSpace('s1', 'Alpha'), makeSpace('s2', 'Beta', 1)]}
        activeSpaceId={null}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByTestId('topic-tab-s2'));
    expect(onSelect).toHaveBeenLastCalledWith('s2');
  });

  it('tags legacy spaces (kind: workspace) with a 旧版 subtitle', () => {
    render(
      <TopicTabs
        context="work"
        spaces={[
          makeSpace('s1', 'Alpha'),
          makeSpace('s2', 'OldWork', 1, { kind: 'workspace' }),
        ]}
        activeSpaceId="s2"
        onSelect={() => {}}
      />,
    );

    const legacyBadge = screen.getByTestId('topic-tab-legacy-s2');
    expect(legacyBadge).toBeInTheDocument();
    expect(legacyBadge.textContent).toContain('（旧版）');
  });

  it('overflows >6 spaces into a 更多 dropdown', () => {
    const spaces: TopicTabItem[] = [];
    for (let i = 0; i < 8; i += 1) {
      spaces.push(makeSpace(`s${i}`, `Space ${i}`, i));
    }
    const onSelect = vi.fn();
    render(
      <TopicTabs
        context="work"
        spaces={spaces}
        activeSpaceId="s0"
        onSelect={onSelect}
      />,
    );

    // Only the first 6 spaces are visible as direct tabs.
    expect(screen.queryByTestId('topic-tab-s0')).toBeInTheDocument();
    expect(screen.queryByTestId('topic-tab-s5')).toBeInTheDocument();
    expect(screen.queryByTestId('topic-tab-s6')).not.toBeInTheDocument();
    expect(screen.queryByTestId('topic-tab-s7')).not.toBeInTheDocument();

    // The overflow menu is closed by default.
    expect(screen.queryByTestId('topic-tab-overflow-menu')).not.toBeInTheDocument();

    // Open it and verify the rest of the spaces live inside.
    fireEvent.click(screen.getByTestId('topic-tab-more'));
    const menu = screen.getByTestId('topic-tab-overflow-menu');
    expect(menu).toBeInTheDocument();
    expect(screen.getByTestId('topic-tab-overflow-s6')).toBeInTheDocument();
    expect(screen.getByTestId('topic-tab-overflow-s7')).toBeInTheDocument();

    // Picking an overflow item fires onSelect and closes the menu.
    fireEvent.click(screen.getByTestId('topic-tab-overflow-s7'));
    expect(onSelect).toHaveBeenLastCalledWith('s7');
    expect(screen.queryByTestId('topic-tab-overflow-menu')).not.toBeInTheDocument();
  });

  it('create flow: shows input, Enter fires onCreate, Escape cancels', async () => {
    const onCreate = vi.fn(async () => {});
    const onSelect = vi.fn();
    render(
      <TopicTabs
        context="work"
        spaces={[]}
        activeSpaceId={null}
        onSelect={onSelect}
        onCreate={onCreate}
      />,
    );

    fireEvent.click(screen.getByTestId('topic-tab-create'));
    const input = screen.getByTestId('topic-tab-create-input') as HTMLInputElement;
    expect(input).toBeInTheDocument();

    fireEvent.change(input, { target: { value: '   投资人名单   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCreate).toHaveBeenCalledWith('投资人名单');

    // After a successful create the input collapses (we don't render it
    // again until the user clicks "+ 新主题" again).
    expect(screen.queryByTestId('topic-tab-create-input')).not.toBeInTheDocument();

    // Open again, type, press Escape — should not fire onCreate.
    fireEvent.click(screen.getByTestId('topic-tab-create'));
    const input2 = screen.getByTestId('topic-tab-create-input') as HTMLInputElement;
    fireEvent.change(input2, { target: { value: 'should not be created' } });
    fireEvent.keyDown(input2, { key: 'Escape' });
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('topic-tab-create-input')).not.toBeInTheDocument();
  });

  it('hides the create button when onCreate is not provided', () => {
    render(
      <TopicTabs
        context="work"
        spaces={[]}
        activeSpaceId={null}
        onSelect={() => {}}
      />,
    );
    expect(screen.queryByTestId('topic-tab-create')).not.toBeInTheDocument();
  });

  it('filters spaces by context', () => {
    const onSelect = vi.fn();
    render(
      <TopicTabs
        context="life"
        spaces={[
          makeSpace('w1', 'WorkSpace', 0, { context: 'work' }),
          makeSpace('l1', 'LifeSpace', 0, { context: 'life' }),
        ]}
        activeSpaceId="l1"
        onSelect={onSelect}
      />,
    );
    expect(screen.queryByTestId('topic-tab-w1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('topic-tab-l1')).toBeInTheDocument();
  });

  it('onDelete fires only for the active space and stops propagation', () => {
    const onDelete = vi.fn();
    const onSelect = vi.fn();
    render(
      <TopicTabs
        context="work"
        spaces={[makeSpace('s1', 'Alpha'), makeSpace('s2', 'Beta', 1)]}
        activeSpaceId="s1"
        onSelect={onSelect}
        onDelete={onDelete}
      />,
    );

    // Delete affordance only renders for the active space.
    const deleteBtn = screen.getByTestId('topic-tab-delete-s1');
    expect(deleteBtn).toBeInTheDocument();
    expect(screen.queryByTestId('topic-tab-delete-s2')).not.toBeInTheDocument();

    fireEvent.click(deleteBtn);
    expect(onDelete).toHaveBeenCalledWith('s1');
    // The parent should NOT also see a select for the same click.
    expect(onSelect).not.toHaveBeenCalled();
  });
});
