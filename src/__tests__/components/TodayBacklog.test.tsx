import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TodayBacklog } from '../../components/TodayBacklog';

const noop = vi.fn();

function renderBacklog(tasks: Array<{
  id: string;
  title: string;
  status: 'todo' | 'done' | 'migrated';
  deadline?: string;
}>, focusTaskIds: string[] = []) {
  return render(
    <TodayBacklog
      tasks={tasks}
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

describe('TodayBacklog completion flow', () => {
  it('keeps a completed focus task visible and advances focus progress', () => {
    renderBacklog(
      [{ id: 'focus-done', title: 'Ship the release', status: 'done' }],
      ['focus-done'],
    );

    expect(screen.getByText('Ship the release')).toBeInTheDocument();
    expect(screen.getByText('1/1')).toBeInTheDocument();
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

  it('adds a task to focus when it is dragged onto the focus area', () => {
    vi.clearAllMocks();
    renderBacklog([{ id: 'drag-me', title: 'Drag this task', status: 'todo' }]);
    const row = screen.getByText('Drag this task').closest('li');
    expect(row).not.toBeNull();
    const values: Record<string, string> = {};
    const dataTransfer = {
      effectAllowed: '',
      dropEffect: '',
      setData: (type: string, value: string) => { values[type] = value; },
      getData: (type: string) => values[type] ?? '',
    };

    fireEvent.dragStart(row!, { dataTransfer });
    fireEvent.dragOver(screen.getByTestId('today-focus-bar'), { dataTransfer });
    fireEvent.drop(screen.getByTestId('today-focus-bar'), { dataTransfer });

    expect(noop).toHaveBeenCalledWith(['drag-me']);
  });
});
