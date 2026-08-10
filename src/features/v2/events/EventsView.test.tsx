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
  useRenameEventNode: () => ({ mutateAsync: vi.fn() }),
  useDeleteEventNode: () => ({ mutateAsync: vi.fn() }),
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
});
