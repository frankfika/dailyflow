/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import { formatTaskDeadline, TaskCard } from '../../components/TaskCard';

// Mock motion/react — strip animation props so they don't leak to DOM
vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, layout, initial, animate, exit, transition, ...props }: any) =>
      React.createElement('div', props, children),
    article: ({ children, layout, initial, animate, exit, transition, ...props }: any) =>
      React.createElement('article', props, children),
  },
}));

// Mock lucide-react icons as simple spans
vi.mock('lucide-react', () => ({
  Briefcase: () => React.createElement('span', { 'data-testid': 'icon-briefcase' }),
  Calendar: () => React.createElement('span', { 'data-testid': 'icon-calendar' }),
  Check: () => React.createElement('span', { 'data-testid': 'icon-check' }),
  ChevronRight: () => React.createElement('span', { 'data-testid': 'icon-chevron-right' }),
  CornerUpRight: () => React.createElement('span', { 'data-testid': 'icon-corner' }),
  Edit2: () => React.createElement('span', { 'data-testid': 'icon-edit' }),
  FileText: () => React.createElement('span', { 'data-testid': 'icon-file' }),
  MessageSquare: () => React.createElement('span', { 'data-testid': 'icon-msg' }),
  MoreHorizontal: () => React.createElement('span', { 'data-testid': 'icon-more' }),
  Network: () => React.createElement('span', { 'data-testid': 'icon-network' }),
  Repeat: () => React.createElement('span', { 'data-testid': 'icon-repeat' }),
  Trash2: () => React.createElement('span', { 'data-testid': 'icon-trash' }),
  X: () => React.createElement('span', { 'data-testid': 'icon-x' }),
  BellOff: () => React.createElement('span', { 'data-testid': 'icon-bell-off' }),
}));

vi.mock('../../utils/tagColors', () => ({
  getTagColor: () => 'bg-gray-100 text-gray-700',
  getTodayStr: () => '2024-01-01',
}));

vi.mock('../../components/TagInput', () => ({
  TagInput: ({ value, onChange }: any) =>
    React.createElement('input', {
      'data-testid': 'taginput-field',
      value: value?.join(',') || '',
      onChange: (e: any) => onChange(e.target.value.split(',')),
    }),
}));

const baseTask = {
  id: 'task-1',
  title: 'Test task',
  description: '',
  status: 'pending' as const,
  tags: [],
  deadline: '',
  priority: 'medium' as const,
  project: '',
  comment: '',
};

const createProps = (overrides: any = {}) => ({
  task: { ...baseTask, ...overrides.task },
  language: 'en' as const,
  categories: [],
  currentFileDate: '2024-01-01',
  onToggle: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  showCompletionPrompt: false,
  onCompletionPromptClosed: vi.fn(),
  ...overrides,
});

describe('TaskCard inline keyboard shortcuts (UX_DESIGN §12)', () => {
  const detailsProps = (overrides: any = {}) => createProps({ onSetRecurrence: vi.fn(), ...overrides });

  function openDetails() {
    fireEvent.click(screen.getByRole('button', { name: 'Task details and actions' }));
  }

  function keyOnCard(key: string, init: Record<string, unknown> = {}) {
    fireEvent.keyDown(screen.getByTestId('task-card-task-1'), { key, ...init });
  }

  it('⌘⏎ toggles completion even with details closed', () => {
    const onToggle = vi.fn();
    render(<TaskCard {...detailsProps({ onToggle })} />);
    keyOnCard('Enter', { metaKey: true });
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('E opens the inline editor, D focuses the deadline input', () => {
    render(<TaskCard {...detailsProps()} />);
    openDetails();
    keyOnCard('e');
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    keyOnCard('d');
    expect(document.activeElement?.getAttribute('type')).toBe('date');
  });

  it('T focuses the tag input, R opens the recurrence popover and saves a rule', () => {
    const onSetRecurrence = vi.fn();
    render(<TaskCard {...detailsProps({ onSetRecurrence })} />);
    openDetails();
    keyOnCard('t');
    expect(document.activeElement?.getAttribute('data-testid')).toBe('taginput-field');
    keyOnCard('r');
    expect(screen.getByTestId('task-recurrence-pop-task-1')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('task-recurrence-weekly-task-1'));
    fireEvent.click(screen.getByTestId('task-recurrence-save-task-1'));
    expect(onSetRecurrence).toHaveBeenCalledWith(expect.objectContaining({ id: 'task-1' }), { type: 'weekly', weekdays: [1, 2, 3, 4, 5] });
  });

  it('keys typed inside inputs are ignored', () => {
    const onToggle = vi.fn();
    render(<TaskCard {...detailsProps({ onToggle })} />);
    openDetails();
    const dateInput = document.querySelector('input[type="date"]');
    expect(dateInput).not.toBeNull();
    fireEvent.keyDown(dateInput as HTMLElement, { key: 'e' });
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    keyOnCard('Enter', { metaKey: true });
    // ⌘⏎ still completes when fired from the card itself
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

describe('TaskCard progressive disclosure', () => {
  it('keeps the default row limited to title, source, deadline, checkbox, and details', () => {
    render(<TaskCard {...createProps({
      task: {
        ...baseTask,
        deadline: '2024-01-03',
        description: 'Hidden detail',
        tags: ['planning'],
        comment: 'Hidden note',
      },
      spaceTitle: 'Launch event',
    })} />);

    expect(screen.getByText('Test task')).toBeInTheDocument();
    expect(screen.getByTestId('task-card-event-task-1')).toHaveTextContent('Launch event');
    expect(screen.getByText('Due in 2d')).toHaveAttribute('title', '2024-01-03');
    expect(screen.queryByText('Hidden detail')).not.toBeInTheDocument();
    expect(screen.queryByText('Hidden note')).not.toBeInTheDocument();
    expect(screen.queryByText('#planning')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Task details and actions' }));
    expect(screen.getByText('Hidden detail')).toBeInTheDocument();
    expect(screen.getByText('Hidden note')).toBeInTheDocument();
    expect(screen.getByText('#planning')).toBeInTheDocument();
  });

  it('labels tasks without an Event as Standalone', () => {
    render(<TaskCard {...createProps()} />);
    expect(screen.getByTestId('task-card-event-task-1')).toHaveTextContent('Standalone');
  });
});

describe('TaskCard completion comment', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens comment textarea when showCompletionPrompt becomes true', async () => {
    const props = createProps();
    const { rerender } = render(<TaskCard {...props} />);

    expect(screen.queryByPlaceholderText(/How did you resolve/i)).not.toBeInTheDocument();

    rerender(<TaskCard {...createProps({ showCompletionPrompt: true, task: { ...baseTask, status: 'done' as const } })} />);

    await act(async () => {
      vi.advanceTimersByTime(10);
    });

    expect(screen.getByPlaceholderText(/How did you resolve/i)).toBeInTheDocument();
  });

  it('does NOT open comment textarea when task already has a comment even if prop is true', async () => {
    const props = createProps({
      task: { ...baseTask, status: 'done' as const, comment: 'Already noted' },
      showCompletionPrompt: true,
    });
    render(<TaskCard {...props} />);

    // Existing notes stay behind task details and do not trigger a new prompt.
    expect(screen.queryByPlaceholderText(/How did you resolve/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Task details and actions' }));
    expect(screen.getByText('Already noted')).toBeInTheDocument();
  });

  it('renders resolution badge for done task with comment', () => {
    const props = createProps({
      task: { ...baseTask, status: 'done' as const, comment: 'Fixed by upgrading lib' },
    });
    render(<TaskCard {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Task details and actions' }));
    expect(screen.getByText('Resolution')).toBeInTheDocument();
    expect(screen.getByText('Fixed by upgrading lib')).toBeInTheDocument();
  });

  it('renders plain comment for undone task with comment', () => {
    const props = createProps({
      task: { ...baseTask, status: 'pending' as const, comment: 'Need to review' },
    });
    render(<TaskCard {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Task details and actions' }));
    expect(screen.queryByText('Resolution')).not.toBeInTheDocument();
    expect(screen.getByText('Need to review')).toBeInTheDocument();
  });

  it('allows editing and saving a completion comment', async () => {
    const onEdit = vi.fn();
    const onCompletionPromptClosed = vi.fn();
    const props = createProps({
      task: { ...baseTask, status: 'done' as const },
      showCompletionPrompt: true,
      onEdit,
      onCompletionPromptClosed,
    });
    render(<TaskCard {...props} />);

    await act(async () => {
      vi.advanceTimersByTime(10);
    });

    const textarea = screen.getByPlaceholderText(/How did you resolve/i);
    fireEvent.change(textarea, { target: { value: 'Resolved via patch' } });

    const saveBtn = screen.getByText('Save');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      // New payload shape: comments is a timestamped array, not a single string.
      expect(onEdit).toHaveBeenCalledWith(
        expect.objectContaining({
          comments: expect.arrayContaining([
            expect.objectContaining({ text: 'Resolved via patch' }),
          ]),
        }),
      );
    });
    expect(onCompletionPromptClosed).toHaveBeenCalled();
  });

  it('cancels comment editing without saving', async () => {
    const onEdit = vi.fn();
    const onCompletionPromptClosed = vi.fn();
    const props = createProps({
      task: { ...baseTask, status: 'done' as const },
      showCompletionPrompt: true,
      onEdit,
      onCompletionPromptClosed,
    });
    render(<TaskCard {...props} />);

    await act(async () => {
      vi.advanceTimersByTime(10);
    });

    const textarea = screen.getByPlaceholderText(/How did you resolve/i);
    fireEvent.change(textarea, { target: { value: 'Draft comment' } });

    const cancelBtn = screen.getByText('Cancel');
    fireEvent.click(cancelBtn);

    expect(screen.queryByPlaceholderText(/How did you resolve/i)).not.toBeInTheDocument();
    expect(onEdit).not.toHaveBeenCalled();
    expect(onCompletionPromptClosed).toHaveBeenCalled();
  });

  it('closes prompt and calls onCompletionPromptClosed when "Don\'t ask again" is clicked', async () => {
    const onCompletionPromptClosed = vi.fn();
    const props = createProps({
      task: { ...baseTask, status: 'done' as const },
      showCompletionPrompt: true,
      onCompletionPromptClosed,
    });
    render(<TaskCard {...props} />);

    await act(async () => {
      vi.advanceTimersByTime(10);
    });

    const suppressBtn = screen.getByText(/Don't ask again/i);
    fireEvent.click(suppressBtn);

    expect(screen.queryByPlaceholderText(/How did you resolve/i)).not.toBeInTheDocument();
    expect(onCompletionPromptClosed).toHaveBeenCalled();
  });
});

describe('TaskCard editing', () => {
  it('enters edit mode and saves changes', async () => {
    const onEdit = vi.fn();
    const props = createProps({ onEdit });
    render(<TaskCard {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Task details and actions' }));
    const editBtn = screen.getByTestId('icon-edit').parentElement;
    fireEvent.click(editBtn!);

    // Should show textarea with current title
    const textarea = screen.getByDisplayValue('Test task');
    expect(textarea).toBeInTheDocument();

    // Modify content
    fireEvent.change(textarea, { target: { value: 'Updated task\nNew description' } });

    // Click Save button to submit
    const saveBtn = screen.getByText('Save');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(onEdit).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Updated task', description: 'New description' }),
      );
    });
  });

  it('cancels edit with Escape', () => {
    const onEdit = vi.fn();
    const props = createProps({ onEdit });
    render(<TaskCard {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Task details and actions' }));
    const editBtn = screen.getByTestId('icon-edit').parentElement;
    fireEvent.click(editBtn!);

    const textarea = screen.getByDisplayValue('Test task');
    fireEvent.change(textarea, { target: { value: 'Modified' } });
    fireEvent.keyDown(textarea, { key: 'Escape' });

    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.getByText('Test task')).toBeInTheDocument();
  });
});

describe('TaskCard delete', () => {
  it('confirms before deleting', async () => {
    const onDelete = vi.fn();

    const props = createProps({ onDelete });
    render(<TaskCard {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Task details and actions' }));
    const deleteBtn = screen.getByTestId('icon-trash').parentElement;
    fireEvent.click(deleteBtn!);

    // Confirm state shows "Delete" and "Cancel" buttons
    const confirmBtn = screen.getByText(/Delete/i);
    fireEvent.click(confirmBtn!);

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledTimes(1);
    });
  });

  it('cancels delete when confirm is declined', async () => {
    const onDelete = vi.fn();

    const props = createProps({ onDelete });
    render(<TaskCard {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Task details and actions' }));
    const deleteBtn = screen.getByTestId('icon-trash').parentElement;
    fireEvent.click(deleteBtn!);

    // Click cancel to abort
    const cancelBtn = screen.getByText(/Cancel/i);
    fireEvent.click(cancelBtn!);

    await waitFor(() => {
      expect(onDelete).not.toHaveBeenCalled();
    });
  });
});

describe('formatTaskDeadline', () => {
  it('turns raw dates into actionable relative deadline copy', () => {
    expect(formatTaskDeadline('2026-08-09', 'en', '2026-08-11')).toBe('2d overdue');
    expect(formatTaskDeadline('2026-08-11', 'en', '2026-08-11')).toBe('Due today');
    expect(formatTaskDeadline('2026-08-12', 'zh', '2026-08-11')).toBe('明天截止');
    expect(formatTaskDeadline('2026-08-15', 'en', '2026-08-11')).toBe('Due in 4d');
  });
});

describe('TaskCard inline attribute bar (UX S3)', () => {
  it('commits a deadline change immediately without an edit mode', async () => {
    const onEdit = vi.fn();
    render(<TaskCard {...createProps({ onEdit })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Task details and actions' }));

    fireEvent.change(screen.getByLabelText('Deadline'), { target: { value: '2024-01-05' } });

    await waitFor(() => {
      expect(onEdit).toHaveBeenCalledWith({ deadline: '2024-01-05' });
    });
  });

  it('marks a task done from the expanded panel', async () => {
    const onToggle = vi.fn();
    render(<TaskCard {...createProps({ onToggle })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Task details and actions' }));

    fireEvent.click(screen.getByTestId('task-card-complete-task-1'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

describe('TaskCard convert to project (UX S7)', () => {
  const baseTask = {
    id: 't_conv',
    title: 'Finish DSH integration',
    status: 'todo',
    source_date: '2026-09-01',
  };

  function renderCard(overrides: Partial<Parameters<typeof TaskCard>[0]> = {}) {
    return render(
      <TaskCard
        task={baseTask as never}
        language="en"
        categories={[]}
        currentFileDate="2026-09-01"
        onToggle={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        {...overrides}
      />,
    );
  }

  it('hides the convert button for tasks that already live on a canvas', () => {
    renderCard({ task: { ...baseTask, originMindmapId: 'mm_1' } as never, onConvertToProject: vi.fn() });
    fireEvent.click(screen.getByTestId('task-details-toggle-t_conv'));
    expect(screen.queryByTestId('task-convert-project-t_conv')).not.toBeInTheDocument();
  });

  it('opens the confirm dialog and submits title plus extra nodes', async () => {
    const onConvertToProject = vi.fn(async () => {});
    renderCard({ onConvertToProject });
    fireEvent.click(screen.getByTestId('task-details-toggle-t_conv'));
    fireEvent.click(screen.getByTestId('task-convert-project-t_conv'));

    const dialog = screen.getByTestId('task-convert-dialog-t_conv');
    expect(dialog).toHaveTextContent(/Convert this task into a project/i);
    expect((screen.getByTestId('task-convert-title-t_conv') as HTMLInputElement).value).toBe('Finish DSH integration');

    fireEvent.change(screen.getByTestId('task-convert-nodes-t_conv'), { target: { value: 'Write tests\nReview\n' } });
    fireEvent.click(screen.getByTestId('task-convert-confirm-t_conv'));

    await vi.waitFor(() => expect(onConvertToProject).toHaveBeenCalledWith(expect.objectContaining({ id: 't_conv' }), {
      title: 'Finish DSH integration',
      extraNodes: ['Write tests', 'Review'],
    }));
    await vi.waitFor(() => expect(screen.queryByTestId('task-convert-dialog-t_conv')).not.toBeInTheDocument());
  });
});
