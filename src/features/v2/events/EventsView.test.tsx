import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventsView } from './EventsView';
import { mindmapsApi, organizeApi } from '../../../api/client';
import * as mindMapCache from '../hooks/mindMapCache';

const mocks = vi.hoisted(() => ({
  events: [] as Array<Record<string, unknown>>,
  detail: null as Record<string, unknown> | null,
  create: vi.fn(async () => ({ id: 'event-new' })),
  applyOrganize: vi.fn(async () => ({ applied: true })),
  deleteEvent: vi.fn(async () => undefined),
  deletePending: false,
}));

vi.mock('../hooks/useEvents', () => ({
  useEvents: () => ({ data: { events: mocks.events }, isLoading: false, isError: false }),
  useEventById: () => ({ data: { event: mocks.detail }, isLoading: false }),
  useCreateEvent: () => ({ mutateAsync: mocks.create, isPending: false }),
  useAddEventChild: () => ({ mutateAsync: vi.fn() }),
  useAddEventSibling: () => ({ mutateAsync: vi.fn() }),
  useRenameEventNode: () => ({ mutateAsync: vi.fn() }),
  useDeleteEventNode: () => ({ mutateAsync: vi.fn() }),
  useDeleteEvent: () => ({ mutateAsync: mocks.deleteEvent, isPending: mocks.deletePending }),
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

function renderView(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('EventsView Event-first surface', () => {
  beforeEach(() => {
    mocks.events = [];
    mocks.detail = null;
    mocks.create.mockClear();
    mocks.applyOrganize.mockClear();
    mocks.deleteEvent.mockClear();
    mocks.deletePending = false;
    vi.restoreAllMocks();
    window.localStorage.removeItem('dailyflow:events:outlineWidth');
  });

  it('shows only the Events index and a single New Event action', () => {
    mocks.events = [EVENT];
    renderView(<EventsView language="en" context="work" />);
    expect(screen.getByRole('heading', { name: 'Events' })).toBeInTheDocument();
    expect(screen.getByTestId('new-event-button')).toBeInTheDocument();
    expect(screen.getByText('Ship DailyFlow')).toBeInTheDocument();
    expect(screen.getByText('#launch')).toBeInTheDocument();
    expect(screen.getByText('#product')).toBeInTheDocument();
    expect(screen.queryByText('#hidden')).not.toBeInTheDocument();
    expect(screen.queryByText('Today')).not.toBeInTheDocument();
    expect(screen.queryByText(/Mind Map|Topic|Unclassified/i)).not.toBeInTheDocument();
  });

  it('opens a delete menu on each event card and removes the event after confirmation', async () => {
    mocks.events = [EVENT];
    render(<EventsView language="en" context="work" />);
    const card = screen.getByTestId('event-card-event-1');
    expect(card).toBeInTheDocument();

    // The "more" trigger is hidden until the card is hovered; fire a
    // mousedown/keydown cycle so the menu's outside-click listener doesn't
    // immediately close it again.
    const more = screen.getByTestId('event-card-more-event-1');
    fireEvent.click(more);

    const deleteBtn = await screen.findByTestId('event-card-delete-event-1');
    expect(deleteBtn).toHaveTextContent('Delete event');
    fireEvent.click(deleteBtn);

    // The ConfirmDialog is shown and asks for explicit confirmation.
    const dialog = await screen.findByTestId('confirm-dialog-confirm');
    fireEvent.click(dialog);
    await waitFor(() => expect(mocks.deleteEvent).toHaveBeenCalledWith({ eventId: 'event-1' }));
  });

  it('creates from title and immediately opens the one-canvas detail', async () => {
    mocks.detail = {
      ...EVENT, id: 'event-new', title: 'Investor update', mindmapId: 'map-1', rootNodeId: 'root',
      nodes: [{ id: 'root', eventId: 'event-new', text: 'Investor update', position: { x: 0, y: 0 }, manualTags: [], aiTags: [] }],
      edges: [], manualTags: [], aiTags: [], integrity: { missingMap: false, sourceContextWasUnclassified: false, orphanTaskIds: [], duplicateNodeTaskIds: [] },
    };
    renderView(<EventsView language="en" context="life" />);
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
    renderView(<EventsView language="en" context="work" />);
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
    renderView(<EventsView language="en" context="work" />);
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

  it('⋯ menu shows stats, offers auto layout and copies the outline', async () => {
    const detail = {
      id: 'event-1', title: 'Menu event', context: 'work', status: 'active', progress: { done: 1, total: 2 },
      effectiveTags: [], createdAt: '2026-08-01', updatedAt: '2026-08-10',
      mindmapId: 'map-1', rootNodeId: 'root', manualTags: [], aiTags: [],
      nodes: [
        { id: 'root', eventId: 'event-1', text: 'Menu event', position: { x: 0, y: 0 }, manualTags: [], aiTags: [] },
        { id: 'child-1', eventId: 'event-1', parentId: 'root', text: 'First step', kind: 'task', position: { x: 1, y: 1 }, manualTags: [], aiTags: [] },
        { id: 'child-2', eventId: 'event-1', parentId: 'child-1', text: 'Nested step', position: { x: 2, y: 2 }, manualTags: [], aiTags: [] },
      ],
      edges: [], integrity: { missingMap: false, sourceContextWasUnclassified: false, orphanTaskIds: [], duplicateNodeTaskIds: [] },
    };
    mocks.events = [detail];
    mocks.detail = detail;
    const notice = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderView(<EventsView language="en" context="work" onNotice={notice} />);
    fireEvent.click(screen.getByTestId('event-card-event-1'));
    expect(await screen.findByTestId('event-detail')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('event-more-toggle'));
    const menu = screen.getByTestId('event-more-menu');
    expect(menu).toHaveTextContent('1 / 2');
    expect(menu).toHaveTextContent('3 nodes');
    expect(menu).toHaveTextContent('1 tasks');

    fireEvent.click(screen.getByTestId('event-more-copy-outline'));
    expect(writeText).toHaveBeenCalledTimes(1);
    const text = writeText.mock.calls[0][0] as string;
    expect(text).toContain('Menu event');
    expect(text).toContain('- First step');
    expect(text).toContain('  - Nested step');
    await vi.waitFor(() => expect(notice).toHaveBeenCalledWith('Outline copied', 'success'));
    expect(screen.queryByTestId('event-more-menu')).not.toBeInTheDocument();
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
    renderView(<EventsView language="en" context="work" onNotice={notice} />);
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

describe('EventsView canvas undo/redo + ⌘F (UX_DESIGN §4.3)', () => {
  const MAP = {
    id: 'map-1', title: 'Organize me', rootId: 'root', version: 2 as const,
    nodes: [
      { id: 'root', text: 'Organize me', position: { x: 0, y: 0 }, kind: 'root' as const },
      { id: 'loose-1', text: 'Loose one', position: { x: 300, y: 0 }, kind: 'branch' as const },
    ],
    edges: [],
    createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-10T00:00:00Z',
  };
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
  let updateSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mocks.events = [detail];
    mocks.detail = detail;
    vi.spyOn(mindMapCache, 'readEventMap').mockResolvedValue(MAP);
    updateSpy = vi.spyOn(mindmapsApi, 'update').mockResolvedValue(MAP);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function openDetail() {
    renderView(<EventsView language="en" context="work" />);
    fireEvent.click(screen.getByTestId('event-card-event-1'));
    await screen.findByTestId('event-detail');
  }

  function runOrganize() {
    vi.spyOn(organizeApi, 'organize').mockResolvedValue({
      strategy: 'by_topic',
      rationale: 'Group the loose nodes',
      groups: [{ parentText: 'Group A', parentKind: 'branch', nodeIds: ['loose-1'] }],
      suggestedEdges: [],
      groupRationale: {},
      stats: { looseNodes: 1, organizedNodes: 1, groupCount: 1 },
    });
    fireEvent.click(screen.getByTestId('event-organize-button'));
    fireEvent.click(screen.getByTestId('event-organize-by_topic'));
    return screen.findByTestId('organize-suggestion-modal');
  }

  it('⌘F opens the in-canvas node search', async () => {
    await openDetail();
    fireEvent.keyDown(window, { key: 'f', metaKey: true });
    expect(screen.getByPlaceholderText('Search nodes')).toBeInTheDocument();
  });

  it('⌘Z with an empty history is a no-op and undo starts disabled', async () => {
    await openDetail();
    expect(screen.getByTestId('event-undo')).toBeDisabled();
    expect(screen.getByTestId('event-redo')).toBeDisabled();
    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('⌘Z after an applied organize restores the pre-edit map, ⇧⌘Z redoes it', async () => {
    await openDetail();
    const modal = await runOrganize();
    fireEvent.click(within(modal).getByTestId('organize-suggestion-apply'));
    await waitFor(() => expect(mocks.applyOrganize).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('event-undo')).toBeEnabled());

    // Undo → one PUT restoring the pre-organize map.
    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
    expect(updateSpy).toHaveBeenCalledWith('map-1', expect.objectContaining({ rootId: 'root' }));

    // Redo → second PUT restoring the organized (current) map.
    fireEvent.keyDown(window, { key: 'Z', metaKey: true, shiftKey: true });
    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(2));
  });
});
