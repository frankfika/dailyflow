import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventsView } from './EventsView';
import { organizeApi } from '../../../api/client';

const mocks = vi.hoisted(() => ({
  events: [] as Array<Record<string, unknown>>,
  detail: null as Record<string, unknown> | null,
  create: vi.fn(async () => ({ id: 'event-new' })),
  applyOrganize: vi.fn(async () => ({ applied: true })),
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
  useUpdateNodePosition: () => ({ mutateAsync: vi.fn() }),
  useLayoutEventTree: () => ({ mutateAsync: vi.fn() }),
  useScheduleEventNode: () => ({ mutateAsync: vi.fn() }),
  useUnscheduleEventNode: () => ({ mutateAsync: vi.fn() }),
  useCompleteNodeTask: () => ({ mutateAsync: vi.fn() }),
  useUndoCompleteNodeTask: () => ({ mutateAsync: vi.fn() }),
  useApplyOrganizeSuggestion: () => ({ mutateAsync: mocks.applyOrganize, isPending: false }),
  useSeedEventTemplate: () => ({ mutateAsync: vi.fn(async () => ({ seeded: true })), isPending: false }),
}));

const EVENT = {
  id: 'event-1', title: 'Ship DailyFlow', context: 'work', status: 'active',
  progress: { done: 1, total: 3 }, effectiveTags: ['launch', 'product', 'hidden'],
  createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-10T00:00:00Z',
};

describe('EventsView Event-first surface', () => {
  beforeEach(() => {
    mocks.events = [];
    mocks.detail = null;
    mocks.create.mockClear();
    mocks.applyOrganize.mockClear();
    vi.restoreAllMocks();
    window.localStorage.removeItem('dailyflow:events:outlineWidth');
  });

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

  it('resizes the outline with the accessible separator and remembers it', async () => {
    const detail = {
      id: 'event-1', title: 'Resize me', context: 'work', status: 'active', progress: { done: 0, total: 0 },
      effectiveTags: [], createdAt: '2026-08-01', updatedAt: '2026-08-10',
      mindmapId: 'map-1', rootNodeId: 'root', manualTags: [], aiTags: [],
      nodes: [{ id: 'root', eventId: 'event-1', text: 'Resize me', position: { x: 0, y: 0 }, manualTags: [], aiTags: [] }],
      edges: [], integrity: { missingMap: false, sourceContextWasUnclassified: false, orphanTaskIds: [], duplicateNodeTaskIds: [] },
    };
    mocks.events = [detail];
    mocks.detail = detail;
    render(<EventsView language="en" context="work" />);
    fireEvent.click(screen.getByTestId('event-card-event-1'));

    const pane = await screen.findByTestId('event-outline-pane');
    // The resize separator is always available (not hidden on small screens).
    const handle = screen.getByRole('separator', { name: 'Resize outline' });
    expect(handle).toBeVisible();
    expect(pane).toHaveStyle({ width: '300px' });
    expect(handle).toHaveAttribute('aria-valuenow', '300');

    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(pane).toHaveStyle({ width: '308px' });
    expect(window.localStorage.getItem('dailyflow:events:outlineWidth')).toBe('308');

    // Narrowing stays above the configured minimum (200).
    for (let i = 0; i < 20; i++) fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(pane).toHaveStyle({ width: '200px' });
    expect(handle).toHaveAttribute('aria-valuenow', '200');
  });

  it('UX S9: runs AI organize and applies the suggestion through the modal', async () => {
    const detail = {
      id: 'event-1', title: 'Organize me', context: 'work', status: 'active', progress: { done: 0, total: 0 },
      effectiveTags: [], createdAt: '2026-08-01', updatedAt: '2026-08-10',
      mindmapId: 'map-1', rootNodeId: 'root', manualTags: [], aiTags: [],
      nodes: [
        { id: 'root', eventId: 'event-1', text: 'Organize me', position: { x: 0, y: 0 }, manualTags: [], aiTags: [] },
        { id: 'loose-1', eventId: 'event-1', text: 'Loose one', position: { x: 300, y: 0 }, manualTags: [], aiTags: [] },
      ],
      edges: [], integrity: { missingMap: false, sourceContextWasUnclassified: false, orphanTaskIds: [], duplicateNodeTaskIds: [] },
    };
    mocks.events = [detail];
    mocks.detail = detail;
    const notice = vi.fn();
    const organizeSpy = vi.spyOn(organizeApi, 'organize').mockResolvedValue({
      strategy: 'by_topic',
      rationale: 'Group the loose nodes',
      groups: [{ parentText: 'Group A', parentKind: 'branch', nodeIds: ['loose-1'] }],
      suggestedEdges: [],
      groupRationale: {},
      stats: { looseNodes: 1, organizedNodes: 1, groupCount: 1 },
    });
    render(<EventsView language="en" context="work" onNotice={notice} />);
    fireEvent.click(screen.getByTestId('event-card-event-1'));
    expect(await screen.findByTestId('event-detail')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('event-organize-button'));
    fireEvent.click(screen.getByTestId('event-organize-by_topic'));
    await waitFor(() => expect(organizeSpy).toHaveBeenCalledWith('map-1', 'by_topic'));
    const modal = await screen.findByTestId('organize-suggestion-modal');
    expect(within(modal).getByText('Group A')).toBeInTheDocument();

    fireEvent.click(within(modal).getByTestId('organize-suggestion-apply'));
    await waitFor(() => expect(mocks.applyOrganize).toHaveBeenCalledWith(expect.objectContaining({ eventId: 'event-1', mindmapId: 'map-1' })));
    await waitFor(() => expect(notice).toHaveBeenCalledWith(expect.stringContaining('AI organize applied'), 'success'));
    expect(screen.queryByTestId('organize-suggestion-modal')).not.toBeInTheDocument();
  });
});
