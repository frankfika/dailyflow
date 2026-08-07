/**
 * TaskListView — component-level tests.
 *
 * Covers the four contracts Phase 2/4 promise:
 *   1. Renders the bound tasks as a list with the space title in the
 *      header.
 *   2. Empty space shows the "no tasks" empty state.
 *   3. Clicking the unlink button asks for confirmation, then fires
 *      `onUnlinkTask(taskId)`.
 *   4. The tag filter (when non-empty) hides non-matching tasks.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { TaskListView, type TaskListViewTask } from './TaskListView';

afterEach(() => cleanup());

const SAMPLE_TASKS: TaskListViewTask[] = [
  { id: 't1', title: '起草合同', status: 'todo', spaceId: 'sp1', tags: ['legal'] },
  { id: 't2', title: '准备投资人名单', status: 'done', spaceId: 'sp1', tags: ['investor'] },
  { id: 't3', title: '代码 review', status: 'todo', spaceId: 'sp1', tags: ['engineering'] },
  { id: 't4', title: '一个不属于此空间的任务', status: 'todo', spaceId: 'sp2', tags: [] },
];

function renderList(
  overrides: Partial<React.ComponentProps<typeof TaskListView>> = {},
) {
  const onUnlinkTask = vi.fn();
  const onSelectTask = vi.fn();
  const onToggleTask = vi.fn();
  const props: React.ComponentProps<typeof TaskListView> = {
    tasks: SAMPLE_TASKS.filter((t) => t.spaceId === 'sp1'),
    spaceId: 'sp1',
    spaceTitle: '投资人材料',
    language: 'zh',
    onUnlinkTask,
    onSelectTask,
    onToggleTask,
    ...overrides,
  };
  const result = render(<TaskListView {...props} />);
  return { ...result, onUnlinkTask, onSelectTask, onToggleTask };
}

describe('TaskListView', () => {
  it('renders the bound tasks with the space title in the header', () => {
    renderList();
    // Header has the space title.
    const header = screen.getByTestId('task-list-view');
    expect(header.getAttribute('data-space-id')).toBe('sp1');
    expect(within(header).getByText('投资人材料 · 任务列表')).toBeInTheDocument();
    // Three tasks render (t4 is filtered out — wrong spaceId).
    expect(within(header).getByTestId('task-list-view-item-t1')).toBeInTheDocument();
    expect(within(header).getByTestId('task-list-view-item-t2')).toBeInTheDocument();
    expect(within(header).getByTestId('task-list-view-item-t3')).toBeInTheDocument();
    expect(within(header).queryByTestId('task-list-view-item-t4')).not.toBeInTheDocument();
    // Stats: 1 done / 3 total.
    expect(within(header).getByTestId('task-list-view-stats').textContent).toBe('1/3');
  });

  it('shows the empty state when no tasks are bound to the space', () => {
    renderList({ tasks: [] });
    expect(screen.getByTestId('task-list-view-empty')).toBeInTheDocument();
  });

  it('unlink flow: click → confirm → fires onUnlinkTask(taskId)', () => {
    const { onUnlinkTask } = renderList();
    // Each bound task shows a binding indicator + unlink button.
    expect(screen.getByTestId('task-list-view-binding-t1')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('task-list-view-unlink-t1'));
    // After clicking, the confirm row appears; the parent has NOT been
    // notified yet.
    expect(onUnlinkTask).not.toHaveBeenCalled();
    expect(screen.getByTestId('task-list-view-unlink-confirm-t1')).toBeInTheDocument();
    // Clicking confirm fires the parent callback.
    fireEvent.click(screen.getByTestId('task-list-view-unlink-confirm-t1'));
    expect(onUnlinkTask).toHaveBeenCalledWith('t1');
  });

  it('filter selection hides non-matching tasks', () => {
    renderList({ selectedTagFilter: ['investor'] });
    expect(screen.getByTestId('task-list-view-item-t2')).toBeInTheDocument();
    expect(screen.queryByTestId('task-list-view-item-t1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('task-list-view-item-t3')).not.toBeInTheDocument();
  });

  it('clicking a task title calls onSelectTask', () => {
    const { onSelectTask } = renderList();
    // The title is a button inside the task row. Use the title text to
    // find it deterministically rather than indexing into the markup.
    const item = screen.getByTestId('task-list-view-item-t1');
    const titleBtn = within(item).getByText('起草合同').closest('button')!;
    fireEvent.click(titleBtn);
    expect(onSelectTask).toHaveBeenCalledTimes(1);
    expect(onSelectTask.mock.calls[0][0].id).toBe('t1');
  });
});
