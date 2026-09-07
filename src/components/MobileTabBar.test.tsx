import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MobileTabBar } from './MobileTabBar';

describe('MobileTabBar', () => {
  it('renders nothing when not visible', () => {
    const { container } = render(
      <MobileTabBar
        language="en"
        activeTab="today"
        setActiveTab={vi.fn()}
        visible={false}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders all four primary tabs when visible', () => {
    render(
      <MobileTabBar
        language="en"
        activeTab="today"
        setActiveTab={vi.fn()}
        visible
      />,
    );
    expect(screen.getByTestId('mobile-tab-today')).toBeTruthy();
    expect(screen.getByTestId('mobile-tab-events')).toBeTruthy();
    expect(screen.getByTestId('mobile-tab-notes')).toBeTruthy();
    expect(screen.getByTestId('mobile-tab-ai-chat')).toBeTruthy();
  });

  it('switches to a different tab on click', () => {
    const setActiveTab = vi.fn();
    render(
      <MobileTabBar
        language="en"
        activeTab="today"
        setActiveTab={setActiveTab}
        visible
      />,
    );
    fireEvent.click(screen.getByTestId('mobile-tab-notes'));
    expect(setActiveTab).toHaveBeenCalledWith('notes');
  });

  it('marks the active tab with aria-current=page', () => {
    render(
      <MobileTabBar
        language="en"
        activeTab="events"
        setActiveTab={vi.fn()}
        visible
      />,
    );
    expect(screen.getByTestId('mobile-tab-events').getAttribute('aria-current')).toBe('page');
    expect(screen.getByTestId('mobile-tab-today').getAttribute('aria-current')).toBeNull();
  });

  it('renders Chinese labels when language=zh', () => {
    render(
      <MobileTabBar
        language="zh"
        activeTab="today"
        setActiveTab={vi.fn()}
        visible
      />,
    );
    expect(screen.getByText('今天')).toBeTruthy();
    expect(screen.getByText('问 AI')).toBeTruthy();
  });

  it('shows the add-task affordance when onAddTask is provided', () => {
    const onAddTask = vi.fn();
    render(
      <MobileTabBar
        language="en"
        activeTab="today"
        setActiveTab={vi.fn()}
        visible
        onAddTask={onAddTask}
      />,
    );
    const addBtn = screen.getByTestId('mobile-tab-add-task');
    expect(addBtn).toBeTruthy();
    fireEvent.click(addBtn);
    expect(onAddTask).toHaveBeenCalledOnce();
  });
});
