import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TodayBacklog, type TodayPlanningGroup } from '../../components/TodayBacklog';
import type { EventSummary } from '../../api/client';

const noop = vi.fn();

function renderBacklog(tasks: Array<{
  id: string;
  title: string;
  status: 'todo' | 'done' | 'migrated';
  tags?: string[];
  deadline?: string;
  host_date?: string;
  spaceId?: string;
  originMindmapId?: string;
  originNodeId?: string;
  sourcePath?: string[];
}>, opts: {
  withPlanning?: boolean;
  planningGroups?: TodayPlanningGroup[];
  events?: EventSummary[];
  extraProps?: Record<string, unknown>;
} = {}) {
  const { withPlanning = false, planningGroups, events = [], extraProps } = opts;
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
      events={events}
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

function eventSummary(partial: Partial<EventSummary>): EventSummary {
  return {
    id: 'event-1',
    mindmapId: 'map-1',
    title: 'Launch event',
    context: 'work',
    status: 'active',
    progress: { done: 0, total: 1 },
    effectiveTags: [],
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-28T00:00:00.000Z',
    ...partial,
  };
}

describe('TodayBacklog horizontal tab bar', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders an All tab plus one tab per event (including empty events)', () => {
    renderBacklog([
      { id: 'planned', title: 'Write launch brief', status: 'todo', spaceId: 'space-1', originMindmapId: 'map-1' },
    ], {
      events: [
        eventSummary({ id: 'event-1', mindmapId: 'map-1' }),
        eventSummary({ id: 'event-2', mindmapId: 'map-2', title: 'Q4 planning' }),
      ],
    });

    const tabbar = screen.getByTestId('today-tabbar');
    expect(within(tabbar).getByTestId('today-tab-all')).toBeInTheDocument();
    expect(within(tabbar).getByTestId('today-tab-event-1')).toHaveTextContent('Launch event');
    // Empty events still get a tab.
    expect(within(tabbar).getByTestId('today-tab-event-2')).toHaveTextContent('Q4 planning');
    // All is the default tab; the event's open task renders in the flat list.
    const list = screen.getByTestId('today-execution-list');
    expect(within(list).getAllByRole('article')).toHaveLength(1);
  });

  it('shows an Event breadcrumb or Standalone directly on each task row in All', () => {
    renderBacklog([
      { id: 'planned', title: 'Write launch brief', status: 'todo', spaceId: 'space-1', sourcePath: ['Launch', 'Marketing'] },
      { id: 'standalone', title: 'Buy groceries', status: 'todo' },
    ], { withPlanning: true });

    expect(screen.getByTestId('task-card-event-planned')).toHaveTextContent('Launch event');
    expect(screen.getByTestId('task-card-path-planned')).toHaveTextContent('Launch');
    expect(screen.getByTestId('task-card-path-planned')).toHaveTextContent('Marketing');
    expect(screen.getByTestId('task-card-event-standalone')).toHaveTextContent('Standalone');
  });

  it('S8: clicking the event chip jumps to the canvas with the origin node id', () => {
    const onOpenPlanningGroup = vi.fn();
    renderBacklog([
      { id: 'planned', title: 'Write launch brief', status: 'todo', spaceId: 'space-1', originMindmapId: 'map-1', originNodeId: 'node-9' },
    ], { withPlanning: true, extraProps: { onOpenPlanningGroup } });

    fireEvent.click(screen.getByTestId('task-card-event-planned'));
    expect(onOpenPlanningGroup).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'event-1' }),
      'node-9',
    );
  });

  it('switches to an event tab and shows only that event\'s tasks', () => {
    renderBacklog([
      { id: 'planned', title: 'Write launch brief', status: 'todo', spaceId: 'space-1', originMindmapId: 'map-1' },
      { id: 'other', title: 'Q4 budget', status: 'todo', spaceId: 'space-2', originMindmapId: 'map-2' },
    ], {
      events: [
        eventSummary({ id: 'event-1', mindmapId: 'map-1' }),
        eventSummary({ id: 'event-2', mindmapId: 'map-2', title: 'Q4 planning' }),
      ],
      planningGroups: [
        { id: 'event-1', mindmapId: 'map-1', spaceId: 'space-1', title: 'Launch event', taskIds: ['planned'], completedTaskIds: [] },
        { id: 'event-2', mindmapId: 'map-2', spaceId: 'space-2', title: 'Q4 planning', taskIds: ['other'], completedTaskIds: [] },
      ],
    });

    expect(screen.getByText('Write launch brief')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('today-tab-event-1'));
    expect(screen.getByText('Write launch brief')).toBeInTheDocument();
    expect(screen.queryByText('Q4 budget')).not.toBeInTheDocument();
    // Clicking the active tab returns to All.
    fireEvent.click(screen.getByTestId('today-tab-event-1'));
    expect(screen.getByText('Q4 budget')).toBeInTheDocument();
  });

  it('shows an empty state with an add trigger on an event tab with no tasks', () => {
    const onAddToEvent = vi.fn();
    renderBacklog([], {
      events: [eventSummary({ id: 'event-1', mindmapId: 'map-1' })],
      extraProps: { onAddToEvent },
    });

    fireEvent.click(screen.getByTestId('today-tab-event-1'));
    expect(screen.getByText('No tasks for this event today.')).toBeInTheDocument();
    expect(screen.getByTestId('today-event-add-trigger-map-1')).toBeInTheDocument();
  });

  it('filters the All list via a tag chip and toggles it off', () => {
    renderBacklog([
      { id: 'a', title: 'Tagged task', status: 'todo', tags: ['urgent'] },
      { id: 'b', title: 'Plain task', status: 'todo' },
    ], { extraProps: { categories: ['urgent', 'client'] } });

    expect(screen.getByText('Tagged task')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('today-tag-urgent'));
    expect(screen.getByText('Tagged task')).toBeInTheDocument();
    expect(screen.queryByText('Plain task')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('today-tag-urgent'));
    expect(screen.getByText('Plain task')).toBeInTheDocument();
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

  describe('inline + Add to event (on the event tab)', () => {
    it('opens an input under the section header when the trigger is clicked', () => {
      const onAddToEvent = vi.fn();
      renderBacklog(
        [{ id: 'planned', title: 'Write launch brief', status: 'todo', spaceId: 'space-1', originMindmapId: 'map-1' }],
        { events: [eventSummary({ id: 'event-1', mindmapId: 'map-1' })], extraProps: { onAddToEvent } },
      );

      fireEvent.click(screen.getByTestId('today-tab-event-1'));
      expect(screen.queryByTestId('today-event-add-input-map-1')).not.toBeInTheDocument();
      fireEvent.click(screen.getByTestId('today-event-add-trigger-map-1'));
      expect(screen.getByTestId('today-event-add-input-map-1')).toBeInTheDocument();
    });

    it('submits via Enter and calls onAddToEvent with the trimmed title', () => {
      const onAddToEvent = vi.fn();
      renderBacklog(
        [{ id: 'planned', title: 'Write launch brief', status: 'todo', spaceId: 'space-1', originMindmapId: 'map-1' }],
        { events: [eventSummary({ id: 'event-1', mindmapId: 'map-1' })], extraProps: { onAddToEvent } },
      );

      fireEvent.click(screen.getByTestId('today-tab-event-1'));
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
        { events: [eventSummary({ id: 'event-1', mindmapId: 'map-1' })], extraProps: { onAddToEvent } },
      );

      fireEvent.click(screen.getByTestId('today-tab-event-1'));
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
        { events: [eventSummary({ id: 'event-1', mindmapId: 'map-1' })], extraProps: { onAddToEvent } },
      );

      fireEvent.click(screen.getByTestId('today-tab-event-1'));
      fireEvent.click(screen.getByTestId('today-event-add-trigger-map-1'));
      const input = screen.getByTestId('today-event-add-input-map-1');
      fireEvent.change(input, { target: { value: 'draft' } });
      fireEvent.keyDown(input, { key: 'Escape' });
      expect(screen.queryByTestId('today-event-add-input-map-1')).not.toBeInTheDocument();
    });
  });
});
