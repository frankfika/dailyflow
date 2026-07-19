import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DailyFocus } from '../../components/DailyFocus';

const tasks = [
  { id: 'one', title: 'Ship the prototype', status: 'todo' as const, priority: 'high' as const },
  { id: 'two', title: 'Interview one user', status: 'todo' as const },
  { id: 'three', title: 'Write launch note', status: 'todo' as const },
  { id: 'four', title: 'Polish settings', status: 'todo' as const },
];

describe('DailyFocus', () => {
  it('opens the planner and adds a focus task', () => {
    const onChange = vi.fn();
    render(
      <DailyFocus
        tasks={tasks}
        focusTaskIds={[]}
        onFocusTaskIdsChange={onChange}
        onToggleTask={vi.fn()}
        onAddTask={vi.fn()}
        language="en"
        isToday
        aiAvailable
        onGenerateAIPlan={vi.fn()}
        onConfigureAI={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /plan my day with ai/i }));
    fireEvent.click(screen.getByTestId('switch-to-manual'));
    fireEvent.click(screen.getByRole('button', { name: /ship the prototype/i }));

    expect(onChange).toHaveBeenCalledWith(['one']);
  });

  it('shows progress and toggles a selected task', () => {
    const onToggle = vi.fn();
    render(
      <DailyFocus
        tasks={[{ ...tasks[0], status: 'done' as const }, tasks[1]]}
        focusTaskIds={['one', 'two']}
        onFocusTaskIdsChange={vi.fn()}
        onToggleTask={onToggle}
        onAddTask={vi.fn()}
        language="en"
        isToday
        aiAvailable
        onGenerateAIPlan={vi.fn()}
        onConfigureAI={vi.fn()}
      />,
    );

    expect(screen.getByText('1/2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /mark incomplete/i }));
    expect(onToggle).toHaveBeenCalledWith('one');
  });

  it('asks AI to build the plan from a natural-language constraint', async () => {
    const onChange = vi.fn();
    const onGenerate = vi.fn().mockResolvedValue({
      taskIds: ['two', 'one'],
      summary: 'One user conversation first, then ship what it teaches us.',
    });
    render(
      <DailyFocus
        tasks={tasks}
        focusTaskIds={[]}
        onFocusTaskIdsChange={onChange}
        onToggleTask={vi.fn()}
        onAddTask={vi.fn()}
        language="en"
        isToday
        aiAvailable
        onGenerateAIPlan={onGenerate}
        onConfigureAI={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /plan my day with ai/i }));
    fireEvent.change(screen.getByPlaceholderText(/meetings all morning/i), {
      target: { value: 'Only two hours after lunch.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /build my day/i }));

    expect(onGenerate).toHaveBeenCalledWith('Only two hours after lunch.');
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith(['two', 'one']));
  });
});
