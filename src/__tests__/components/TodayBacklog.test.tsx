import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TodayBacklog } from '../../components/TodayBacklog';

const noop = vi.fn();

function renderBacklog(tasks: Array<{
  id: string;
  title: string;
  status: 'todo' | 'done' | 'migrated';
  deadline?: string;
  spaceId?: string;
  originMindmapId?: string;
}>, focusTaskIds: string[] = [], withPlanning = false) {
  return render(
    <TodayBacklog
      tasks={tasks}
      planningGroups={withPlanning ? [{ id: 'mm-1', mindmapId: 'mm-1', spaceId: 'space-1', title: 'Launch plan', taskIds: tasks.map(task => task.id), completedTaskIds: tasks.filter(task => task.status === 'done').map(task => task.id) }] : []}
      selectedDate="2026-07-28"
      categories={[]}
      focusTaskIds={focusTaskIds}
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

describe('TodayBacklog simplified flow', () => {
  it('keeps linked plans available without putting them above the task path', () => {
    renderBacklog([{ id: 'planned', title: 'Write launch brief', status: 'todo', spaceId: 'space-1', originMindmapId: 'mm-1' }], [], true);

    expect(screen.getByTestId('today-planning')).toBeInTheDocument();
    expect(screen.getByText('Linked plans')).toBeInTheDocument();
    expect(screen.getAllByText('Launch plan')).toHaveLength(2);
    expect(screen.getByTestId('today-planning-task-planned')).toHaveTextContent('Write launch brief');
    expect(screen.getByTestId('today-planning-task-planned')).toHaveTextContent('2026-07-28');
    expect(screen.getByRole('button', { name: 'Complete task' })).toBeInTheDocument();
    expect(screen.getByTestId('task-card-space-binding-planned')).toHaveTextContent('Launch plan');
  });
  it('keeps a completed focus task visible and advances focus progress', () => {
    renderBacklog(
      [{ id: 'focus-done', title: 'Ship the release', status: 'done' }],
      ['focus-done'],
    );

    expect(screen.getByText('Ship the release')).toBeInTheDocument();
    expect(screen.getByText('1/3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark incomplete' })).toBeInTheDocument();
  });

  it('shows non-focus completed tasks in a reopenable completed section', () => {
    renderBacklog([
      { id: 'done', title: 'Reviewed notes', status: 'done' },
      { id: 'open', title: 'Plan tomorrow', status: 'todo' },
    ]);

    expect(screen.getByTestId('today-group-completed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Completed 1/i }));
    expect(screen.getByText('Reviewed notes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark as todo' })).toBeInTheDocument();
  });

  it('adds a task to focus from the task row', () => {
    vi.clearAllMocks();
    renderBacklog([{ id: 'drag-me', title: 'Drag this task', status: 'todo' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Make a focus task' }));

    expect(noop).toHaveBeenCalledWith(['drag-me']);
  });
});
