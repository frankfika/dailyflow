import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TodayReflectionBar, isReflectionPromptOptedOut } from './TodayReflectionBar';

function renderBar(overrides: Partial<Parameters<typeof TodayReflectionBar>[0]> = {}) {
  const props: Parameters<typeof TodayReflectionBar>[0] = {
    date: '2026-08-31',
    completedCount: 9,
    language: 'zh',
    onWrite: vi.fn(),
    onDismiss: vi.fn(),
    onOptOut: vi.fn(),
    ...overrides,
  };
  render(<TodayReflectionBar {...props} />);
  return props;
}

describe('TodayReflectionBar (UX S12 quiet prompt)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('shows the completed count with quiet actions instead of a modal', () => {
    const props = renderBar();
    const bar = screen.getByTestId('today-reflection-bar');
    expect(bar).toHaveAttribute('data-date', '2026-08-31');
    expect(screen.getByText(/昨天完成 9 件事/)).toBeInTheDocument();
    expect(screen.getByTestId('today-reflection-write')).toBeInTheDocument();
    expect(screen.getByTestId('today-reflection-later')).toBeInTheDocument();
    expect(screen.getByTestId('today-reflection-optout')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('today-reflection-write'));
    expect(props.onWrite).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('today-reflection-later'));
    expect(props.onDismiss).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('today-reflection-optout'));
    expect(props.onOptOut).toHaveBeenCalledTimes(1);
  });

  it('uses English copy in English mode and handles the zero case without confetti', () => {
    renderBar({ language: 'en', completedCount: 0 });
    expect(screen.getByText(/You finished 0 things yesterday/)).not.toHaveTextContent('🎉');
  });

  it('persists the opt-out flag used by App to suppress future prompts', () => {
    const props = renderBar();
    expect(isReflectionPromptOptedOut()).toBe(false);
    fireEvent.click(screen.getByTestId('today-reflection-optout'));
    expect(props.onOptOut).toHaveBeenCalledTimes(1);
    // App writes the flag in onOptOut; verify the helper reads it back.
    window.localStorage.setItem('dailyflow:reflection:promptOptOut', '1');
    expect(isReflectionPromptOptedOut()).toBe(true);
  });
});
