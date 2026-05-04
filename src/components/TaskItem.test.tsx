import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TaskItem } from './TaskItem';
import type { Task } from '../types/task';

describe('TaskItem', () => {
  const mockTask: Task = {
    id: 't1',
    title: 'Test Task',
    status: 'todo',
    tags: ['work', 'urgent'],
    priority: 'high',
  };

  const defaultProps = {
    task: mockTask,
    onToggle: vi.fn(),
    onDelete: vi.fn(),
    onEdit: vi.fn(),
    currentDate: '2026-05-04',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders task title', () => {
    render(<TaskItem {...defaultProps} />);
    expect(screen.getByText('Test Task')).toBeInTheDocument();
  });

  it('renders task tags', () => {
    render(<TaskItem {...defaultProps} />);
    expect(screen.getByText('work')).toBeInTheDocument();
    expect(screen.getByText('urgent')).toBeInTheDocument();
  });

  it('renders priority badge', () => {
    render(<TaskItem {...defaultProps} />);
    expect(screen.getByText('high')).toBeInTheDocument();
  });

  it('calls onToggle when checkbox is clicked', () => {
    render(<TaskItem {...defaultProps} />);
    // Find the first button (checkbox)
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]);
    expect(defaultProps.onToggle).toHaveBeenCalledWith('t1', '2026-05-04', 'done');
  });

  it('calls onDelete when delete button is clicked', () => {
    render(<TaskItem {...defaultProps} />);
    const deleteButton = screen.getByTitle('Delete');
    fireEvent.click(deleteButton);
    expect(defaultProps.onDelete).toHaveBeenCalledWith('t1', '2026-05-04');
  });

  it('shows line-through for done tasks', () => {
    const doneTask = { ...mockTask, status: 'done' as const };
    render(<TaskItem {...defaultProps} task={doneTask} />);
    const title = screen.getByText('Test Task');
    expect(title).toHaveClass('line-through');
  });
});
