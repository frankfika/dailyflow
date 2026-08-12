import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { filterTodayTasks, STANDALONE_MINDMAP_FILTER, TodayBacklog } from '../../components/TodayBacklog';

const noop = vi.fn();

function renderBacklog(tasks: Array<{
  id: string;
  title: string;
  status: 'todo' | 'done' | 'migrated';
  deadline?: string;
  host_date?: string;
  spaceId?: string;
  originMindmapId?: string;
  sourcePath?: string[];
}>, withPlanning = false, options: { hasActiveFilters?: boolean; onClearFilters?: () => void } = {}) {
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
      hasActiveFilters={options.hasActiveFilters}
      onClearFilters={options.onClearFilters}
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
      { id: 'planned', title: 'Write launch brief', status: 'todo', spaceId: 'space-1', sourcePath: ['Launch', 'Marketing'] },
      { id: 'standalone', title: 'Buy groceries', status: 'todo' },
    ], true);

    expect(screen.getByTestId('task-card-event-planned')).toHaveTextContent('Launch event');
    expect(screen.getByTestId('task-card-path-planned')).toHaveTextContent('Launch');
    expect(screen.getByTestId('task-card-path-planned')).toHaveTextContent('Marketing');
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

  it('groups open work by urgency instead of presenting one undifferentiated wall', () => {
    renderBacklog([
      { id: 'late', title: 'Late', status: 'todo', deadline: '2026-07-20' },
      { id: 'today', title: 'Today', status: 'todo', deadline: '2026-07-28' },
      { id: 'next', title: 'Next', status: 'todo', deadline: '2026-07-29' },
      { id: 'someday', title: 'Someday', status: 'todo' },
    ]);

    expect(screen.getByRole('heading', { name: 'Overdue' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Due today' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Upcoming' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No due date' })).toBeInTheDocument();
  });

  it('explains a filtered empty state and clears filters instead of offering a hidden new task', () => {
    const onClearFilters = vi.fn();
    renderBacklog([], false, { hasActiveFilters: true, onClearFilters });

    expect(screen.getByText('No tasks match the current filters.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add one thing' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });
});

describe('Today task filters', () => {
  const tasks = [
    { id: 'map-work', title: '发布官网', status: 'todo' as const, tags: ['work', 'launch'], originMindmapId: 'map-1' },
    { id: 'map-life', title: '制定旅行路线', status: 'todo' as const, tags: ['life'], originMindmapId: 'map-2' },
    { id: 'standalone', title: '买牛奶', status: 'todo' as const, tags: ['life'] },
  ];
  const groups = [
    { id: 'map-1', mindmapId: 'map-1', title: '发布计划', taskIds: ['map-work'], completedTaskIds: [] },
    { id: 'map-2', mindmapId: 'map-2', title: '旅行计划', taskIds: ['map-life'], completedTaskIds: [] },
  ];

  it('filters by tag and mind map together', () => {
    expect(filterTodayTasks(tasks, 'launch', 'map-1', groups).map(task => task.id)).toEqual(['map-work']);
    expect(filterTodayTasks(tasks, 'life', 'map-1', groups)).toEqual([]);
  });

  it('can show only tasks that do not belong to a mind map', () => {
    expect(filterTodayTasks(tasks, null, STANDALONE_MINDMAP_FILTER, groups).map(task => task.id)).toEqual(['standalone']);
  });
});
