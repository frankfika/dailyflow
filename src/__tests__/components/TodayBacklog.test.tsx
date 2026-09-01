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
      onDeleteTask={noop}
      onCreateLinkedNote={noop}
      onShowLinkedNotes={noop}
      linkedNotesCount={() => 0}
      onAddTask={noop}
      language="en"
      isToday
      {...(extraProps ?? {})}
    />,
  );
}

describe('TodayBacklog Event-first execution flow', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders one execution list without focus or linked-plan surfaces', () => {
    renderBacklog([
      { id: 'planned', title: 'Write launch brief', status: 'todo', spaceId: 'space-1', originMindmapId: 'map-1' },
      { id: 'standalone', title: 'Buy groceries', status: 'todo' },
    ], true);

    const list = screen.getByTestId('today-execution-list');
    expect(within(list).getAllByRole('article')).toHaveLength(2);
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

  it('preserves the quick standalone task action', () => {
    renderBacklog([]);
    fireEvent.click(screen.getByRole('button', { name: 'Add task' }));
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

  it('groups open tasks under their source event with the event head as canvas entry', () => {
    const onOpenPlanningGroup = vi.fn();
    const groups: TodayPlanningGroup[] = [{
      id: 'event-1',
      mindmapId: 'map-1',
      spaceId: 'space-1',
      title: 'Launch event',
      taskIds: ['planned-a', 'planned-b'],
      completedTaskIds: [],
    }];
    const tasks = [
      { id: 'planned-a', title: 'Write launch brief', status: 'todo' as const, spaceId: 'space-1', originMindmapId: 'map-1' },
      { id: 'planned-b', title: 'Deploy integration env', status: 'todo' as const, spaceId: 'space-1', originMindmapId: 'map-1' },
      { id: 'standalone', title: 'Buy groceries', status: 'todo' as const },
    ];
    render(
      <TodayBacklog
        tasks={tasks}
        planningGroups={groups}
        onOpenPlanningGroup={onOpenPlanningGroup}
        selectedDate="2026-07-28"
        categories={[]}
        onToggleTask={noop}
        onEditTask={noop}
        onDeleteTask={noop}
        onCreateLinkedNote={noop}
        onShowLinkedNotes={noop}
        linkedNotesCount={() => 0}
        onAddTask={noop}
        language="en"
        isToday
      />,
    );

    const head = screen.getByTestId('today-event-head-map-1');
    expect(head).toHaveTextContent('Launch event');
    expect(head).toHaveTextContent('2 open');
    expect(screen.getByTestId('today-event-group-standalone')).toHaveTextContent('Standalone');

    fireEvent.click(head);
    expect(onOpenPlanningGroup).toHaveBeenCalledWith(groups[0]);
  });

  it('collapses and re-expands an event group without leaving the page', () => {
    const groups: TodayPlanningGroup[] = [{
      id: 'event-1',
      mindmapId: 'map-1',
      spaceId: 'space-1',
      title: 'Launch event',
      taskIds: ['planned-a'],
      completedTaskIds: [],
    }];
    const tasks = [
      { id: 'planned-a', title: 'Write launch brief', status: 'todo' as const, spaceId: 'space-1' },
      { id: 'standalone', title: 'Buy groceries', status: 'todo' as const },
    ];
    render(
      <TodayBacklog
        tasks={tasks}
        planningGroups={groups}
        selectedDate="2026-07-28"
        categories={[]}
        onToggleTask={noop}
        onEditTask={noop}
        onDeleteTask={noop}
        onCreateLinkedNote={noop}
        onShowLinkedNotes={noop}
        linkedNotesCount={() => 0}
        onAddTask={noop}
        language="en"
        isToday
      />,
    );

    const group = screen.getByTestId('today-event-group-map-1');
    expect(group).toHaveTextContent('Write launch brief');
    fireEvent.click(within(group).getByRole('button', { name: 'Collapse Launch event' }));
    expect(group).not.toHaveTextContent('Write launch brief');
    fireEvent.click(within(group).getByRole('button', { name: 'Expand Launch event' }));
    expect(group).toHaveTextContent('Write launch brief');
  });

  it('explains an empty day and offers the add action', () => {
    renderBacklog([]);

    expect(screen.getByText('Nothing here yet. Add one thing to get started.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add one thing' }));
    expect(noop).toHaveBeenCalledTimes(1);
  });
});
