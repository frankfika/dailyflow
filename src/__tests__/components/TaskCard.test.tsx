/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import { TaskCard } from '../../components/TaskCard';

// Mock motion/react — strip animation props so they don't leak to DOM
vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, layout, initial, animate, exit, transition, ...props }: any) =>
      React.createElement('div', props, children),
  },
}));

// Mock lucide-react icons as simple spans
vi.mock('lucide-react', () => ({
  Briefcase: () => React.createElement('span', { 'data-testid': 'icon-briefcase' }),
  Calendar: () => React.createElement('span', { 'data-testid': 'icon-calendar' }),
  Check: () => React.createElement('span', { 'data-testid': 'icon-check' }),
  CornerUpRight: () => React.createElement('span', { 'data-testid': 'icon-corner' }),
  Edit2: () => React.createElement('span', { 'data-testid': 'icon-edit' }),
  FileText: () => React.createElement('span', { 'data-testid': 'icon-file' }),
  MessageSquare: () => React.createElement('span', { 'data-testid': 'icon-msg' }),
  Trash2: () => React.createElement('span', { 'data-testid': 'icon-trash' }),
  X: () => React.createElement('span', { 'data-testid': 'icon-x' }),
  BellOff: () => React.createElement('span', { 'data-testid': 'icon-bell-off' }),
}));

vi.mock('../../utils/tagColors', () => ({
  getTagColor: () => 'bg-gray-100 text-gray-700',
}));

vi.mock('../../components/TagInput', () => ({
  TagInput: ({ value, onChange }: any) =>
    React.createElement('input', {
      'data-testid': 'tag-input',
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
  ...overrides,
});

describe('TaskCard completion comment', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens comment textarea when completing a task without existing comment', async () => {
    const props = createProps();
    const { rerender } = render(<TaskCard {...props} />);

    const toggleBtn = screen.getAllByRole('button')[0];
    fireEvent.click(toggleBtn);
    expect(props.onToggle).toHaveBeenCalledTimes(1);

    // Simulate parent re-rendering with done status
    rerender(<TaskCard {...createProps({ task: { ...baseTask, status: 'done' as const } })} />);

    await act(async () => {
      vi.advanceTimersByTime(700);
    });

    // After completion, the done-style placeholder should appear
    expect(screen.getByPlaceholderText(/How did you resolve/i)).toBeInTheDocument();
  });

  it('does NOT open comment textarea when task already has a comment', async () => {
    const props = createProps({
      task: { ...baseTask, comment: 'Already noted' },
    });
    const { rerender } = render(<TaskCard {...props} />);

    const toggleBtn = screen.getAllByRole('button')[0];
    fireEvent.click(toggleBtn);

    rerender(<TaskCard {...createProps({ task: { ...baseTask, status: 'done' as const, comment: 'Already noted' } })} />);

    await act(async () => {
      vi.advanceTimersByTime(700);
    });

    // Should not show the completion prompt because comment already exists
    expect(screen.queryByPlaceholderText(/How did you resolve/i)).not.toBeInTheDocument();
    // Existing comment should still be visible
    expect(screen.getByText('Already noted')).toBeInTheDocument();
  });

  it('does NOT open comment textarea when unchecking a done task', async () => {
    const props = createProps({
      task: { ...baseTask, status: 'done' as const },
    });
    const { rerender } = render(<TaskCard {...props} />);

    const toggleBtn = screen.getAllByRole('button')[0];
    fireEvent.click(toggleBtn);

    // Simulate parent re-rendering with pending status (unchecking)
    rerender(<TaskCard {...createProps({ task: { ...baseTask, status: 'pending' as const } })} />);

    await act(async () => {
      vi.advanceTimersByTime(700);
    });

    // Unchecking (done -> undone) should not trigger comment prompt
    expect(screen.queryByPlaceholderText(/Add a note/i)).not.toBeInTheDocument();
  });

  it('renders resolution badge for done task with comment', () => {
    const props = createProps({
      task: { ...baseTask, status: 'done' as const, comment: 'Fixed by upgrading lib' },
    });
    render(<TaskCard {...props} />);

    expect(screen.getByText('Resolution')).toBeInTheDocument();
    expect(screen.getByText('Fixed by upgrading lib')).toBeInTheDocument();
  });

  it('renders plain comment for undone task with comment', () => {
    const props = createProps({
      task: { ...baseTask, status: 'pending' as const, comment: 'Need to review' },
    });
    render(<TaskCard {...props} />);

    expect(screen.queryByText('Resolution')).not.toBeInTheDocument();
    expect(screen.getByText('Need to review')).toBeInTheDocument();
  });

  it('allows editing and saving a completion comment', async () => {
    const onEdit = vi.fn();
    const props = createProps({
      task: { ...baseTask, status: 'pending' as const },
      onEdit,
    });
    const { rerender } = render(<TaskCard {...props} />);

    // Complete the task
    const toggleBtn = screen.getAllByRole('button')[0];
    fireEvent.click(toggleBtn);

    rerender(<TaskCard {...createProps({ task: { ...baseTask, status: 'done' as const }, onEdit })} />);

    await act(async () => {
      vi.advanceTimersByTime(700);
    });

    const textarea = screen.getByPlaceholderText(/How did you resolve/i);
    fireEvent.change(textarea, { target: { value: 'Resolved via patch' } });

    const saveBtn = screen.getByText('Save');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(onEdit).toHaveBeenCalledWith(
        expect.objectContaining({ comment: 'Resolved via patch' }),
      );
    });
  });

  it('cancels comment editing without saving', async () => {
    const onEdit = vi.fn();
    const props = createProps({
      task: { ...baseTask, status: 'pending' as const },
      onEdit,
    });
    const { rerender } = render(<TaskCard {...props} />);

    const toggleBtn = screen.getAllByRole('button')[0];
    fireEvent.click(toggleBtn);

    rerender(<TaskCard {...createProps({ task: { ...baseTask, status: 'done' as const }, onEdit })} />);

    await act(async () => {
      vi.advanceTimersByTime(700);
    });

    const textarea = screen.getByPlaceholderText(/How did you resolve/i);
    fireEvent.change(textarea, { target: { value: 'Draft comment' } });

    const cancelBtn = screen.getByText('Cancel');
    fireEvent.click(cancelBtn);

    expect(screen.queryByPlaceholderText(/How did you resolve/i)).not.toBeInTheDocument();
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('suppresses future prompts when "Don\'t ask again" is clicked', async () => {
    const onEdit = vi.fn();
    const props = createProps({
      task: { ...baseTask, status: 'pending' as const },
      onEdit,
    });
    const { rerender } = render(<TaskCard {...props} />);

    // Complete the task
    const toggleBtn = screen.getAllByRole('button')[0];
    fireEvent.click(toggleBtn);
    rerender(<TaskCard {...createProps({ task: { ...baseTask, status: 'done' as const }, onEdit })} />);

    await act(async () => {
      vi.advanceTimersByTime(700);
    });

    // Click "Don't ask again"
    const suppressBtn = screen.getByText(/Don't ask again/i);
    fireEvent.click(suppressBtn);

    expect(screen.queryByPlaceholderText(/How did you resolve/i)).not.toBeInTheDocument();

    // Complete another task — should NOT prompt again
    const props2 = createProps({
      task: { ...baseTask, id: 'task-2', status: 'pending' as const },
      onEdit,
    });
    const { rerender: rerender2 } = render(<TaskCard {...props2} />);
    const toggleBtn2 = screen.getAllByRole('button')[0];
    fireEvent.click(toggleBtn2);
    rerender2(<TaskCard {...createProps({ task: { ...baseTask, id: 'task-2', status: 'done' as const }, onEdit })} />);

    await act(async () => {
      vi.advanceTimersByTime(700);
    });

    expect(screen.queryByPlaceholderText(/How did you resolve/i)).not.toBeInTheDocument();
  });
});

describe('TaskCard editing', () => {
  it('enters edit mode and saves changes', async () => {
    const onEdit = vi.fn();
    const props = createProps({ onEdit });
    render(<TaskCard {...props} />);

    // Click edit button (3rd action button: comment, edit, delete)
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

    // Click delete button — enters confirm state
    const deleteBtn = screen.getByTestId('icon-trash').parentElement;
    fireEvent.click(deleteBtn!);

    // Confirm state shows "Confirm?" button
    const confirmBtn = screen.getByText(/Confirm/i);
    fireEvent.click(confirmBtn!);

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledTimes(1);
    });
  });

  it('cancels delete when confirm is declined', async () => {
    const onDelete = vi.fn();

    const props = createProps({ onDelete });
    render(<TaskCard {...props} />);

    const deleteBtn = screen.getByTestId('icon-trash').parentElement;
    fireEvent.click(deleteBtn!);

    // Blur the confirm button to cancel
    const confirmBtn = screen.getByText(/Confirm/i);
    fireEvent.blur(confirmBtn!);

    await waitFor(() => {
      expect(onDelete).not.toHaveBeenCalled();
    });
  });
});
