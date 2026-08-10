import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TodayBacklog } from '../../components/TodayBacklog';

const noop = vi.fn();

function renderBacklog(tasks: Array<{
  id: string;
  title: string;
  status: 'todo' | 'done' | 'migrated';
  deadline?: string;
  host_date?: string;
  spaceId?: string;
  originMindmapId?: string;
}>, withPlanning = false) {
  return render(
    <TodayBacklog
      tasks={tasks}
      planningGroups={withPlanning ? [{
        id: 'event-1',
        mindmapId: 'map-1',
        spaceId: 'space-1',
        title: 'Launch event',
        taskIds: tasks.filter(task => task.spaceId || task.originMindmapId).map(task => task.id),
        completedTaskIds: tasks.filter(task => task.status === 'done' && (task.spaceId || task.originMindmapId)).map(task => task.id),
      }] : []}
      selectedDate="2026-07-28"
      categories={[]}
      focusTaskIds={[]}
      onFocusTaskIdsChange={noop}
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
    expect(screen.queryByTestId('today-focus-bar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('today-planning')).not.toBeInTheDocument();
    expect(screen.queryByText('Linked plans')).not.toBeInTheDocument();
  });

  it('shows an Event breadcrumb or Standalone directly on each task row', () => {
    renderBacklog([
      { id: 'planned', title: 'Write launch brief', status: 'todo', spaceId: 'space-1' },
      { id: 'standalone', title: 'Buy groceries', status: 'todo' },
    ], true);

    expect(screen.getByTestId('task-card-event-planned')).toHaveTextContent('Launch event');
    expect(screen.getByTestId('task-card-event-standalone')).toHaveTextContent('Standalone');
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
});
