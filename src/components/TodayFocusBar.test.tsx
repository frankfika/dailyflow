import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TodayFocusBar } from './TodayFocusBar';

const noop = vi.fn();

function renderBar(
  focusTaskIds: string[] = [],
  tasks = [
    { id: 'a', title: 'Task A', status: 'todo' as const },
    { id: 'b', title: 'Task B', status: 'todo' as const },
    { id: 'c', title: 'Task C', status: 'todo' as const },
    { id: 'd', title: 'Task D', status: 'todo' as const },
    { id: 'done-1', title: 'Done thing', status: 'done' as const },
  ],
) {
  return render(
    <TodayFocusBar
      tasks={tasks}
      focusTaskIds={focusTaskIds}
      onChange={noop}
      language="en"
      isToday
    />,
  );
}

describe('TodayFocusBar', () => {
  it('renders nothing on non-today dates', () => {
    render(
      <TodayFocusBar
        tasks={[{ id: 'a', title: 'Task A', status: 'todo' }]}
        focusTaskIds={[]}
        onChange={noop}
        language="en"
        isToday={false}
      />,
    );
    expect(screen.queryByTestId('today-focus-bar')).not.toBeInTheDocument();
  });

  it('renders nothing when the day has no open tasks', () => {
    render(
      <TodayFocusBar
        tasks={[{ id: 'a', title: 'Task A', status: 'done' }]}
        focusTaskIds={[]}
        onChange={noop}
        language="en"
        isToday
      />,
    );
    expect(screen.queryByTestId('today-focus-bar')).not.toBeInTheDocument();
  });

  it('shows a collapsed row with count and selected titles', () => {
    renderBar(['a', 'b']);
    const bar = screen.getByTestId('today-focus-bar');
    expect(bar).toHaveTextContent('2/3');
    expect(bar).toHaveTextContent('Task A');
    expect(bar).toHaveTextContent('Task B');
    expect(screen.queryByText('Save')).not.toBeInTheDocument();
  });

  it('expands into an inline picker and reports each pick upward', () => {
    renderBar([]);
    fireEvent.click(screen.getByRole('button', { name: /Pick 3/i }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Task A/ }));
    fireEvent.click(screen.getByRole('button', { name: /Task B/ }));
    expect(noop).toHaveBeenNthCalledWith(1, ['a']);
    expect(noop).toHaveBeenNthCalledWith(2, ['b']);
  });

  it('marks the third pick with an ordinal and caps further picks', () => {
    renderBar(['a', 'b']);
    fireEvent.click(screen.getByRole('button', { name: /Pick 3/i }));
    fireEvent.click(screen.getByRole('button', { name: /Task C/ }));
    expect(noop).toHaveBeenCalledWith(['a', 'b', 'c']);

    // A controlled parent re-renders with the new ids; the fourth pick is
    // then capped. Covered end-to-end by the stateful test below.
  });

  it('keeps selection state like a controlled parent would', () => {
    function StatefulBar() {
      const [ids, setIds] = useState(['a', 'b']);
      return (
        <TodayFocusBar
          tasks={[
            { id: 'a', title: 'Task A', status: 'todo' },
            { id: 'b', title: 'Task B', status: 'todo' },
            { id: 'c', title: 'Task C', status: 'todo' },
            { id: 'd', title: 'Task D', status: 'todo' },
          ]}
          focusTaskIds={ids}
          onChange={setIds}
          language="en"
          isToday
        />
      );
    }
    render(<StatefulBar />);
    fireEvent.click(screen.getByRole('button', { name: /Pick 3/i }));

    fireEvent.click(screen.getByRole('button', { name: /Task C/ }));
    expect(screen.getByRole('button', { name: /Task C/ })).toHaveTextContent('3');

    // Fourth pick is capped while 3 are chosen.
    fireEvent.click(screen.getByRole('button', { name: /Task D/ }));
    expect(screen.getByRole('button', { name: /Task D/ })).not.toHaveTextContent('4');

    // Saving collapses back to the single row.
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.getByTestId('today-focus-bar')).toHaveTextContent('3/3');
  });

  it('lets a selected task be deselected', () => {
    renderBar(['b']);
    fireEvent.click(screen.getByRole('button', { name: /Pick 3/i }));
    fireEvent.click(screen.getByRole('button', { name: /Task B/ }));
    expect(noop).toHaveBeenCalledWith([]);
  });
});
