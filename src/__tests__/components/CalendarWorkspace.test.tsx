import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarWorkspace } from '../../components/CalendarWorkspace';

const getWorkspace = vi.fn();

vi.mock('../../api/client', () => ({
  calendarApi: {
    getWorkspace: (...args: unknown[]) => getWorkspace(...args),
  },
  feishuApi: {
    createCalendarEvent: vi.fn(),
    syncTasks: vi.fn(),
  },
  DOMAIN_EVENTS: {
    calendarConnectionChanged: 'calendar.connection.changed',
    calendarEventsChanged: 'calendar.events.changed',
  },
  dispatchDomainEvent: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
  open: vi.fn(),
}));

describe('CalendarWorkspace scrolling', () => {
  beforeEach(() => {
    getWorkspace.mockResolvedValue({ items: [], connectors: [] });
  });

  it('keeps the calendar body as the single bounded scroll region', async () => {
    render(
      <div className="h-[600px]">
        <CalendarWorkspace
          date="2026-07-28"
          setDate={vi.fn()}
          language="en"
          onOpenLocalDate={vi.fn()}
          onManageConnections={vi.fn()}
        />
      </div>,
    );

    await waitFor(() => expect(getWorkspace).toHaveBeenCalled());
    const region = screen.getByTestId('calendar-scroll-region');
    expect(region).toHaveClass('min-h-0', 'flex-1', 'overflow-auto', 'overscroll-contain');
  });
});
