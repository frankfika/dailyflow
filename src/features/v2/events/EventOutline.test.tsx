import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { EventDetail } from '../../../api/client';
import { EventOutline } from './EventOutline';

const EVENT: EventDetail = {
  id: 'event-1', title: 'Launch', context: 'work', status: 'active', progress: { done: 0, total: 1 }, effectiveTags: [],
  createdAt: '2026-08-01', updatedAt: '2026-08-10', mindmapId: 'map-1', rootNodeId: 'root', manualTags: [], aiTags: [],
  nodes: [
    { id: 'root', eventId: 'event-1', text: 'Launch', position: { x: 0, y: 0 }, manualTags: [], aiTags: [] },
    { id: 'step', eventId: 'event-1', parentId: 'root', text: 'Test release', position: { x: 300, y: 0 }, manualTags: [], aiTags: [] },
    { id: 'sub', eventId: 'event-1', parentId: 'step', text: 'Write tests', position: { x: 600, y: 0 }, manualTags: [], aiTags: [] },
  ],
  edges: [
    { id: 'edge-1', source: 'root', target: 'step' },
    { id: 'edge-2', source: 'step', target: 'sub' },
  ],
  integrity: { missingMap: false, sourceContextWasUnclassified: false, orphanTaskIds: [], duplicateNodeTaskIds: [] },
};

function renderOutline(overrides: Partial<React.ComponentProps<typeof EventOutline>> = {}) {
  const props: React.ComponentProps<typeof EventOutline> = {
    event: EVENT,
    language: 'en',
    selectedId: 'root',
    editingId: 'root',
    collapsedIds: new Set<string>(),
    onToggleCollapse: vi.fn(),
    onSelect: vi.fn(),
    onStartEdit: vi.fn(),
    onCommitEdit: vi.fn(),
    onRename: vi.fn(),
    onAddChild: vi.fn(async () => ''),
    onAddSibling: vi.fn(async () => ''),
    onDelete: vi.fn(),
    ...overrides,
  };
  render(<EventOutline {...props} />);
  return props;
}

describe('EventOutline rendering', () => {
  it('renders root and nested children', () => {
    renderOutline();
    expect(screen.getByTestId('outline-row-root')).toBeInTheDocument();
    expect(screen.getByTestId('outline-row-step')).toBeInTheDocument();
    expect(screen.getByTestId('outline-row-sub')).toBeInTheDocument();
  });

  it('selects and starts editing on row click', () => {
    const onSelect = vi.fn();
    const onStartEdit = vi.fn();
    renderOutline({ onSelect, onStartEdit });
    fireEvent.click(screen.getByTestId('outline-row-step'));
    expect(onSelect).toHaveBeenCalledWith('step');
    expect(onStartEdit).toHaveBeenCalledWith('step');
  });

  it('calls onAddSibling when Enter is pressed on a non-root row', async () => {
    const onAddSibling = vi.fn(async () => 'new-step');
    renderOutline({ selectedId: 'step', editingId: 'step', onAddSibling });
    const input = screen.getByTestId('outline-input-step');
    fireEvent.change(input, { target: { value: 'Updated step' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(onAddSibling).toHaveBeenCalledWith('step', ''));
  });

  it('calls onAddChild when Tab is pressed', async () => {
    const onAddChild = vi.fn(async () => 'new-child');
    renderOutline({ selectedId: 'step', editingId: 'step', onAddChild });
    const input = screen.getByTestId('outline-input-step');
    fireEvent.change(input, { target: { value: 'Updated step' } });
    fireEvent.keyDown(input, { key: 'Tab' });
    await waitFor(() => expect(onAddChild).toHaveBeenCalledWith('step', ''));
  });

  it('calls onDelete when Backspace is pressed on an empty non-root row', async () => {
    const onDelete = vi.fn();
    const onSelect = vi.fn();
    renderOutline({ selectedId: 'step', editingId: 'step', onDelete, onSelect });
    const input = screen.getByTestId('outline-input-step');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Backspace' });
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('step'));
    expect(onSelect).toHaveBeenCalledWith('root');
  });

  it('navigates rows with arrow keys', () => {
    const onSelect = vi.fn();
    renderOutline({ selectedId: 'step', editingId: 'step', onSelect });
    const input = screen.getByTestId('outline-input-step');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(onSelect).toHaveBeenCalledWith('sub');
    onSelect.mockClear();
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(onSelect).toHaveBeenCalledWith('root');
  });

  it('schedules a non-task row as a task from the row hover chip', async () => {
    // The outline is the home of "Add to Task" — chip on the right of the
    // row, date popover with presets, schedules only on confirm.
    const onScheduleTask = vi.fn(async () => undefined);
    renderOutline({ selectedId: 'root', editingId: null, onScheduleTask });
    fireEvent.click(screen.getByTestId('outline-add-task-step'));
    expect(await screen.findByTestId('outline-schedule-popover')).toBeInTheDocument();
    expect(screen.getByTestId('outline-schedule-popover-preset-1')).toHaveTextContent(/Tomorrow/);
    fireEvent.click(screen.getByTestId('outline-schedule-popover-preset-1'));
    await waitFor(() => expect(onScheduleTask).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'step' }),
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    ));
  });

  it('shows a persistent date chip on task rows', () => {
    const taskRow: EventDetail['nodes'][number] = {
      id: 'done', eventId: EVENT.id, parentId: 'root', text: 'Shipped',
      position: { x: 300, y: 40 }, manualTags: [], aiTags: [],
      execution: { taskId: 'task-9', status: 'todo', scheduledDate: '2026-09-03' },
    };
    renderOutline({
      selectedId: 'root', editingId: null,
      event: { ...EVENT, nodes: [...EVENT.nodes, taskRow], edges: [...EVENT.edges, { id: 'edge-done', source: 'root', target: 'done' }] },
    });
    expect(screen.getByTestId('outline-task-date-done')).toHaveTextContent('09-03');
  });
});
