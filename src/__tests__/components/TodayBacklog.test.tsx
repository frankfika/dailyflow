import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TodayBacklog, type TodayPlanningGroup } from '../../components/TodayBacklog';

const noop = vi.fn();

function renderBacklog(tasks: Array<{
  id: string;
  title: string;
  status: 'todo' | 'done' | 'migrated';
  deadline?: string;
  host_date?: string;
  spaceId?: string;
  originMindmapId?: string;
  originNodeId?: string;
  sourcePath?: string[];
}>, withPlanning = false, planningGroups?: TodayPlanningGroup[], extraProps?: Record<string, unknown>) {
  const groups: TodayPlanningGroup[] = planningGroups ?? (withPlanning ? [{
    id: 'event-1',
    mindmapId: 'map-1',
    spaceId: 'space-1',
    title: 'Launch event',
    taskIds: tasks.filter(task => task.spaceId || task.originMindmapId).map(task => task.id),
    completedTaskIds: tasks.filter(task => task.status === 'done' && (task.spaceId || task.originMindmapId)).map(task => task.id),
  }] : []);
  return render(
    <TodayBacklog
      tasks={tasks}
      planningGroups={groups}
      selectedDate="2026-07-28"
      categories={[]}
      onToggleTask={noop}
      onEditTask={noop}
      onAddTask={noop}
      language="en"
      isToday
      {...(extraProps ?? {})}
    />,
  );
}

describe('TodayBacklog Event-first execution flow', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders each event and standalone as a section, not as tabs', () => {
    renderBacklog([
      { id: 'planned', title: 'Write launch brief', status: 'todo', spaceId: 'space-1', originMindmapId: 'map-1' },
      { id: 'standalone', title: 'Buy groceries', status: 'todo' },
    ], true);

    const list = screen.getByTestId('today-execution-list');
    expect(screen.getByTestId('today-section-map-1')).toBeInTheDocument();
    expect(screen.getByTestId('today-section-standalone')).toBeInTheDocument();
    // All open tasks render at once (no tab gating).
    expect(within(list).getAllByRole('article')).toHaveLength(2);
    // Legacy "All" tab must be gone.
    expect(screen.queryByTestId('today-event-group-all')).not.toBeInTheDocument();
    expect(screen.queryByTestId('today-planning')).not.toBeInTheDocument();
    expect(screen.queryByText('Linked plans')).not.toBeInTheDocument();
  });

  it('shows an Event breadcrumb or Standalone directly on each task row', () => {
    renderBacklog([
      { id: 'planned', title: 'Write launch brief', status: 'todo', spaceId: 'space-1', sourcePath: ['Launch', 'Marketing'] },
      { id: 'standalone', title: 'Buy groceries', status: 'todo' },
    ], true);

    expect(screen.getByTestId('task-card-event-planned')).toHaveTextContent('Launch event');
    expect(screen.getByTestId('task-card-path-planned')).toHaveTextContent('Launch');
    expect(screen.getByTestId('task-card-path-planned')).toHaveTextContent('Marketing');
    expect(screen.getByTestId('task-card-event-standalone')).toHaveTextContent('Standalone');
  });

  it('S8: clicking the event chip jumps to the canvas with the origin node id', () => {
    const onOpenPlanningGroup = vi.fn();
    renderBacklog([
      { id: 'planned', title: 'Write launch brief', status: 'todo', spaceId: 'space-1', originMindmapId: 'map-1', originNodeId: 'node-9' },
    ], true, undefined, { onOpenPlanningGroup });

    fireEvent.click(screen.getByTestId('task-card-event-planned'));
    expect(onOpenPlanningGroup).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'event-1' }),
      'node-9',
    );
  });

  it('section header click opens the event canvas', () => {
    const onOpenPlanningGroup = vi.fn();
    renderBacklog([
      { id: 'planned', title: 'Write launch brief', status: 'todo', spaceId: 'space-1', originMindmapId: 'map-1' },
    ], true, undefined, { onOpenPlanningGroup });

    fireEvent.click(screen.getByTestId('today-section-title-map-1'));
    expect(onOpenPlanningGroup).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'event-1', mindmapId: 'map-1' }),
    );
  });

  it('renders the empty-day fallback CTA', () => {
    renderBacklog([]);
    expect(screen.getByText('Nothing here yet. Add one thing to get started.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add one thing' }));
    expect(noop).toHaveBeenCalledTimes(1);
  });

  it('keeps completed tasks out of the execution list until explicitly expanded', () => {
    renderBacklog([
      { id: 'done', title: 'Reviewed notes', status: 'done' },
      { id: 'open', title: 'Plan tomorrow', status: 'todo' },
    ]);

    expect(within(screen.getByTestId('today-execution-list')).queryByText('Reviewed notes')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Completed 1/i }));
    expect(screen.getByText('Reviewed notes')).toBeInTheDocument();
  });

  it('routes an earlier task action back to the Daily note that owns it', () => {
    renderBacklog([
      { id: 'earlier', title: 'Carry this forward', status: 'todo', host_date: '2026-07-26' },
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Mark as done' }));

    expect(noop).toHaveBeenCalledWith('earlier', '2026-07-26');
  });

  it('collapses and re-expands a section when its chevron is clicked', () => {
    renderBacklog([
      { id: 'planned', title: 'Write launch brief', status: 'todo', spaceId: 'space-1', originMindmapId: 'map-1' },
    ], true);

    expect(screen.getByText('Write launch brief')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Collapse Launch event/i }));
    expect(screen.queryByText('Write launch brief')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Expand Launch event/i }));
    expect(screen.getByText('Write launch brief')).toBeInTheDocument();
  });

  it('omits an event section when all its tasks are completed (no empty box)', () => {
    const groups: TodayPlanningGroup[] = [{
      id: 'event-1', mindmapId: 'map-1', spaceId: 'space-1', title: 'Launch event',
      taskIds: ['planned'], completedTaskIds: ['planned'],
    }];
    render(
      <TodayBacklog
        tasks={[{ id: 'planned', title: 'Write launch brief', status: 'done' as const, spaceId: 'space-1', originMindmapId: 'map-1' }]}
        planningGroups={groups}
        selectedDate="2026-07-28"
        categories={[]}
        onToggleTask={noop}
        onEditTask={noop}
        onAddTask={noop}
        language="en"
        isToday
      />,
    );
    expect(screen.queryByTestId('today-section-map-1')).not.toBeInTheDocument();
  });

  describe('inline + Add to event', () => {
    it('opens an input under the section header when the trigger is clicked', () => {
      const onAddToEvent = vi.fn();
      renderBacklog(
        [{ id: 'planned', title: 'Write launch brief', status: 'todo', spaceId: 'space-1', originMindmapId: 'map-1' }],
        true,
        undefined,
        { onAddToEvent },
      );

      expect(screen.queryByTestId('today-event-add-input-map-1')).not.toBeInTheDocument();
      fireEvent.click(screen.getByTestId('today-event-add-trigger-map-1'));
      expect(screen.getByTestId('today-event-add-input-map-1')).toBeInTheDocument();
    });

    it('submits via Enter and calls onAddToEvent with the trimmed title', () => {
      const onAddToEvent = vi.fn();
      renderBacklog(
        [{ id: 'planned', title: 'Write launch brief', status: 'todo', spaceId: 'space-1', originMindmapId: 'map-1' }],
        true,
        undefined,
        { onAddToEvent },
      );

      fireEvent.click(screen.getByTestId('today-event-add-trigger-map-1'));
      const input = screen.getByTestId('today-event-add-input-map-1');
      fireEvent.change(input, { target: { value: '  Draft Q4 brief  ' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(onAddToEvent).toHaveBeenCalledTimes(1);
      const [group, title] = onAddToEvent.mock.calls[0];
      expect(group.mindmapId).toBe('map-1');
      expect(title).toBe('Draft Q4 brief');
    });

    it('does not call onAddToEvent for an empty draft', () => {
      const onAddToEvent = vi.fn();
      renderBacklog(
        [{ id: 'planned', title: 'Write launch brief', status: 'todo', spaceId: 'space-1', originMindmapId: 'map-1' }],
        true,
        undefined,
        { onAddToEvent },
      );

      fireEvent.click(screen.getByTestId('today-event-add-trigger-map-1'));
      const input = screen.getByTestId('today-event-add-input-map-1');
      fireEvent.change(input, { target: { value: '   ' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(onAddToEvent).not.toHaveBeenCalled();
    });

    it('cancels with Escape and closes the input', () => {
      const onAddToEvent = vi.fn();
      renderBacklog(
        [{ id: 'planned', title: 'Write launch brief', status: 'todo', spaceId: 'space-1', originMindmapId: 'map-1' }],
        true,
        undefined,
        { onAddToEvent },
      );

      fireEvent.click(screen.getByTestId('today-event-add-trigger-map-1'));
      const input = screen.getByTestId('today-event-add-input-map-1');
      fireEvent.change(input, { target: { value: 'draft' } });
      fireEvent.keyDown(input, { key: 'Escape' });
      expect(screen.queryByTestId('today-event-add-input-map-1')).not.toBeInTheDocument();
    });
  });
});
