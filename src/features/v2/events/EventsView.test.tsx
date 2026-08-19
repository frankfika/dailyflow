import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventsView } from './EventsView';

const mocks = vi.hoisted(() => ({
  events: [] as Array<Record<string, unknown>>,
  detail: null as Record<string, unknown> | null,
  create: vi.fn(async () => ({ id: 'event-new' })),
}));

vi.mock('../hooks/useEvents', () => ({
  useEvents: () => ({ data: { events: mocks.events }, isLoading: false, isError: false }),
  useEventById: () => ({ data: { event: mocks.detail }, isLoading: false }),
  useCreateEvent: () => ({ mutateAsync: mocks.create, isPending: false }),
  useAddEventChild: () => ({ mutateAsync: vi.fn() }),
  useAddEventSibling: () => ({ mutateAsync: vi.fn() }),
  useRenameEventNode: () => ({ mutateAsync: vi.fn() }),
  useDeleteEventNode: () => ({ mutateAsync: vi.fn() }),
  useOutdentEventNode: () => ({ mutateAsync: vi.fn() }),
  useMoveEventNode: () => ({ mutateAsync: vi.fn() }),
  useReorderEventNode: () => ({ mutateAsync: vi.fn() }),
  useScheduleEventNode: () => ({ mutateAsync: vi.fn() }),
  useUnscheduleEventNode: () => ({ mutateAsync: vi.fn() }),
  useCompleteNodeTask: () => ({ mutateAsync: vi.fn() }),
  useUndoCompleteNodeTask: () => ({ mutateAsync: vi.fn() }),
}));

const EVENT = {
  id: 'event-1', title: 'Ship DailyFlow', context: 'work', status: 'active',
  progress: { done: 1, total: 3 }, effectiveTags: ['launch', 'product', 'hidden'],
  createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-10T00:00:00Z',
};

describe('EventsView Event-first surface', () => {
  beforeEach(() => { mocks.events = []; mocks.detail = null; mocks.create.mockClear(); });

  it('shows only the Events index and a single New Event action', () => {
    mocks.events = [EVENT];
    render(<EventsView language="en" context="work" />);
    expect(screen.getByRole('heading', { name: 'Events' })).toBeInTheDocument();
    expect(screen.getByTestId('new-event-button')).toBeInTheDocument();
    expect(screen.getByText('Ship DailyFlow')).toBeInTheDocument();
    expect(screen.getByText('#launch')).toBeInTheDocument();
    expect(screen.getByText('#product')).toBeInTheDocument();
    expect(screen.queryByText('#hidden')).not.toBeInTheDocument();
    expect(screen.queryByText('Today')).not.toBeInTheDocument();
    expect(screen.queryByText(/Mind Map|Topic|Unclassified/i)).not.toBeInTheDocument();
  });

  it('creates from title and immediately opens the one-canvas detail', async () => {
    mocks.detail = {
      ...EVENT, id: 'event-new', title: 'Investor update', mindmapId: 'map-1', rootNodeId: 'root',
      nodes: [{ id: 'root', eventId: 'event-new', text: 'Investor update', position: { x: 0, y: 0 }, manualTags: [], aiTags: [] }],
      edges: [], manualTags: [], aiTags: [], integrity: { missingMap: false, sourceContextWasUnclassified: false, orphanTaskIds: [], duplicateNodeTaskIds: [] },
    };
    render(<EventsView language="en" context="life" />);
    fireEvent.click(screen.getByTestId('new-event-button'));
    fireEvent.change(screen.getByLabelText('What are you moving forward?'), { target: { value: 'Investor update' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith({ title: 'Investor update', context: 'life' }));
    expect(await screen.findByTestId('event-detail')).toBeInTheDocument();
    expect(screen.getAllByTestId('event-canvas')).toHaveLength(1);
    expect(screen.queryByText('Active')).not.toBeInTheDocument();
  });

  it('toggles the outline pane when the header button is clicked', async () => {
    const detail = {
      id: 'event-1', title: 'Toggle me', context: 'work', status: 'active', progress: { done: 0, total: 0 },
      effectiveTags: [], createdAt: '2026-08-01', updatedAt: '2026-08-10',
      mindmapId: 'map-1', rootNodeId: 'root', manualTags: [], aiTags: [],
      nodes: [{ id: 'root', eventId: 'event-1', text: 'Toggle me', position: { x: 0, y: 0 }, manualTags: [], aiTags: [] }],
      edges: [], integrity: { missingMap: false, sourceContextWasUnclassified: false, orphanTaskIds: [], duplicateNodeTaskIds: [] },
    };
    mocks.events = [detail];
    mocks.detail = detail;
    window.localStorage.removeItem('dailyflow:events:outlineVisible');
    render(<EventsView language="en" context="work" />);
    fireEvent.click(screen.getByTestId('event-card-event-1'));
    expect(await screen.findByTestId('event-detail')).toBeInTheDocument();
    const pane = screen.getByTestId('event-outline-pane');
    expect(pane).toHaveAttribute('data-visible', 'true');

    fireEvent.click(screen.getByTestId('event-outline-toggle'));
    expect(pane).toHaveAttribute('data-visible', 'false');
    expect(window.localStorage.getItem('dailyflow:events:outlineVisible')).toBe('false');

    fireEvent.click(screen.getByTestId('event-outline-toggle'));
    expect(pane).toHaveAttribute('data-visible', 'true');
    expect(window.localStorage.getItem('dailyflow:events:outlineVisible')).toBe('true');
  });
});
