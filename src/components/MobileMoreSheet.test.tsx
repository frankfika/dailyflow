import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MobileMoreSheet } from './MobileMoreSheet';

describe('MobileMoreSheet', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <MobileMoreSheet
        open={false}
        onClose={vi.fn()}
        language="en"
        activeTab="today"
        onSelectTab={vi.fn()}
      />,
    );
    expect(container.querySelector('[data-testid="mobile-more-sheet"]')).toBeNull();
  });

  it('renders all four items when open in English', () => {
    render(
      <MobileMoreSheet
        open
        onClose={vi.fn()}
        language="en"
        activeTab="today"
        onSelectTab={vi.fn()}
      />,
    );
    expect(screen.getByTestId('mobile-more-calendar')).toBeTruthy();
    expect(screen.getByTestId('mobile-more-memory')).toBeTruthy();
    expect(screen.getByTestId('mobile-more-team')).toBeTruthy();
    expect(screen.getByTestId('mobile-more-settings')).toBeTruthy();
    expect(screen.getByText('Calendar')).toBeTruthy();
    expect(screen.getByText('Memory')).toBeTruthy();
    expect(screen.getByText('Team')).toBeTruthy();
    expect(screen.getByText('Settings')).toBeTruthy();
  });

  it('renders Chinese labels when language=zh', () => {
    render(
      <MobileMoreSheet
        open
        onClose={vi.fn()}
        language="zh"
        activeTab="today"
        onSelectTab={vi.fn()}
      />,
    );
    expect(screen.getByText('日历')).toBeTruthy();
    expect(screen.getByText('记忆')).toBeTruthy();
    expect(screen.getByText('团队')).toBeTruthy();
    expect(screen.getByText('设置')).toBeTruthy();
  });

  it('calls onSelectTab with the picked tab and closes on item click', () => {
    const onSelectTab = vi.fn();
    const onClose = vi.fn();
    render(
      <MobileMoreSheet
        open
        onClose={onClose}
        language="en"
        activeTab="today"
        onSelectTab={onSelectTab}
      />,
    );
    fireEvent.click(screen.getByTestId('mobile-more-calendar'));
    expect(onSelectTab).toHaveBeenCalledWith('calendar');
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onOpenSettings and closes when the Settings row is clicked', () => {
    const onOpenSettings = vi.fn();
    const onClose = vi.fn();
    render(
      <MobileMoreSheet
        open
        onClose={onClose}
        language="en"
        activeTab="today"
        onSelectTab={vi.fn()}
        onOpenSettings={onOpenSettings}
      />,
    );
    fireEvent.click(screen.getByTestId('mobile-more-settings'));
    expect(onOpenSettings).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalled();
  });

  it('marks the row whose tab matches the active tab as data-active', () => {
    render(
      <MobileMoreSheet
        open
        onClose={vi.fn()}
        language="en"
        activeTab="memory"
        onSelectTab={vi.fn()}
      />,
    );
    expect(screen.getByTestId('mobile-more-memory').getAttribute('data-active')).toBe('true');
    expect(screen.getByTestId('mobile-more-calendar').getAttribute('data-active')).toBe('false');
    expect(screen.getByTestId('mobile-more-team').getAttribute('data-active')).toBe('false');
    expect(screen.getByTestId('mobile-more-settings').getAttribute('data-active')).toBe('false');
  });

  it('highlights nothing on sheet items when activeTab is a primary tab', () => {
    render(
      <MobileMoreSheet
        open
        onClose={vi.fn()}
        language="en"
        activeTab="events"
        onSelectTab={vi.fn()}
      />,
    );
    expect(screen.getByTestId('mobile-more-calendar').getAttribute('data-active')).toBe('false');
    expect(screen.getByTestId('mobile-more-memory').getAttribute('data-active')).toBe('false');
    expect(screen.getByTestId('mobile-more-team').getAttribute('data-active')).toBe('false');
  });

  it('closes when the backdrop is clicked', () => {
    const onClose = vi.fn();
    render(
      <MobileMoreSheet
        open
        onClose={onClose}
        language="en"
        activeTab="today"
        onSelectTab={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('mobile-more-backdrop'));
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on Escape key', () => {
    const onClose = vi.fn();
    render(
      <MobileMoreSheet
        open
        onClose={onClose}
        language="en"
        activeTab="today"
        onSelectTab={vi.fn()}
      />,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('does not crash when Settings is clicked without an onOpenSettings handler', () => {
    const onClose = vi.fn();
    render(
      <MobileMoreSheet
        open
        onClose={onClose}
        language="en"
        activeTab="today"
        onSelectTab={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('mobile-more-settings'));
    expect(onClose).toHaveBeenCalled();
  });
});
