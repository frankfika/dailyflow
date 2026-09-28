import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NoteList } from './NoteList';

const hooks = vi.hoisted(() => ({
  notes: vi.fn(),
  create: vi.fn(),
  setArchived: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('../hooks/useNotes', () => ({
  useNotes: hooks.notes,
  useCreateNote: () => ({ isPending: false, mutateAsync: hooks.create }),
  useSetNoteArchived: () => ({ isPending: false, mutate: hooks.setArchived, error: null }),
  useDeleteNote: () => ({ mutate: hooks.remove }),
}));

const note = {
  id: 'note-1',
  title: 'Existing note',
  body: 'A body',
  kind: 'general',
  state: 'draft',
  pinned: false,
  autoSaveVersion: 0,
  createdAt: '2026-07-28T00:00:00.000Z',
  updatedAt: '2026-07-28T00:00:00.000Z',
  tagIds: [],
};

describe('NoteList creation and selection flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows one blank-note creation entry in an empty list', () => {
    hooks.notes.mockReturnValue({
      data: { notes: [], total: 0 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<NoteList selectedId={null} onSelect={vi.fn()} language="en" />);

    expect(screen.getByRole('button', { name: '+ Add note' })).toBeInTheDocument();
    expect(screen.queryByText('+ Untitled note')).not.toBeInTheDocument();
    expect(screen.getByText('No notes yet')).toBeInTheDocument();
  });

  it('opens the first note when the list has content and nothing is selected', async () => {
    hooks.notes.mockReturnValue({
      data: { notes: [note], total: 1 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    const onSelect = vi.fn();

    const { container } = render(
      <NoteList selectedId={null} onSelect={onSelect} language="en" />,
    );

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith('note-1'));
    expect(container.querySelector('button button')).toBeNull();
  });

  it('keeps the mobile list visible until the user selects a note', async () => {
    hooks.notes.mockReturnValue({
      data: { notes: [note], total: 1 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    const onSelect = vi.fn();

    render(
      <NoteList
        selectedId={null}
        onSelect={onSelect}
        language="en"
        autoSelectFirst={false}
      />,
    );

    await waitFor(() => expect(screen.getByText('Existing note')).toBeInTheDocument());
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('shows tag chips and filters notes without replacing the current view filter', async () => {
    const meeting = {
      ...note,
      id: 'meeting-1',
      title: 'Product sync',
      kind: 'meeting',
      state: 'active',
      tagIds: ['product', 'weekly'],
    };
    const project = {
      ...note,
      id: 'project-1',
      title: 'Launch plan',
      kind: 'project',
      state: 'active',
      tagIds: ['product'],
    };
    const untagged = {
      ...note,
      id: 'meeting-2',
      title: 'Untagged sync',
      kind: 'meeting',
      state: 'active',
    };
    hooks.notes.mockReturnValue({
      data: { notes: [meeting, project, untagged], total: 3 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<NoteList selectedId="meeting-1" onSelect={vi.fn()} language="en" />);

    expect(within(screen.getByTestId('notes-item-tags-meeting-1')).getByText('#product'))
      .toBeInTheDocument();
    expect(screen.queryByTestId('notes-item-tags-meeting-2')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('notes-view-meeting'));
    fireEvent.click(screen.getByTestId('notes-tag-filter-product'));

    expect(screen.getByText('Product sync')).toBeInTheDocument();
    expect(screen.queryByText('Launch plan')).not.toBeInTheDocument();
    expect(screen.queryByText('Untagged sync')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'All tags' }));
    expect(screen.getByText('Untagged sync')).toBeInTheDocument();
  });

  it('uses Chinese filter copy and hides tag UI when no note has tags', () => {
    hooks.notes.mockReturnValue({
      data: { notes: [note], total: 1 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    const { rerender } = render(
      <NoteList selectedId="note-1" onSelect={vi.fn()} language="zh" />,
    );

    expect(screen.getByTestId('notes-view-all')).toHaveTextContent('全部');
    expect(screen.queryByTestId('notes-tag-filter')).not.toBeInTheDocument();

    hooks.notes.mockReturnValue({
      data: { notes: [{ ...note, tagIds: ['会议'] }], total: 1 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    rerender(<NoteList selectedId="note-1" onSelect={vi.fn()} language="zh" />);

    expect(screen.getByRole('group', { name: '按标签筛选' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '全部标签' })).toBeInTheDocument();
  });

  it('surfaces meeting-note status at a glance and counts pending meetings', () => {
    const untouchedMeeting = { ...note, id: 'm-fresh', kind: 'meeting', state: 'active', body: '' };
    const audioOnlyMeeting = {
      ...note,
      id: 'm-audio',
      kind: 'meeting',
      state: 'active',
      body: '',
      sourceIds: ['src_a'],
    };
    const transcribedMeeting = {
      ...note,
      id: 'm-transcribed',
      kind: 'meeting',
      state: 'active',
      sourceIds: ['src_a'],
      body: '今天讨论了发布计划，下周一上线。',
    };
    hooks.notes.mockReturnValue({
      data: { notes: [untouchedMeeting, audioOnlyMeeting, transcribedMeeting], total: 3 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<NoteList selectedId={null} onSelect={vi.fn()} language="en" />);

    expect(screen.getByTestId('notes-item-meeting-status-m-fresh')).toHaveAttribute('data-status', 'none');
    expect(screen.getByTestId('notes-item-meeting-status-m-audio')).toHaveAttribute('data-status', 'audio');
    expect(screen.getByTestId('notes-item-meeting-status-m-transcribed')).toHaveAttribute('data-status', 'both');
    // Two meetings still need work (untouched + audio-only), but the badge
    // must lead with the urgent one: a recording waiting to be transcribed.
    const badge = screen.getByTestId('notes-meeting-pending');
    expect(badge).toHaveAttribute('data-kind', 'needs-transcript');
    expect(badge).toHaveTextContent('1');
    expect(badge).toHaveAccessibleName(/1 recording/i);
  });

  it('falls back to a non-urgent badge when only untouched meetings remain', () => {
    const untouchedMeeting = { ...note, id: 'm-fresh', kind: 'meeting', state: 'active', body: '' };
    hooks.notes.mockReturnValue({
      data: { notes: [untouchedMeeting], total: 1 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<NoteList selectedId={null} onSelect={vi.fn()} language="en" />);

    const badge = screen.getByTestId('notes-meeting-pending');
    expect(badge).toHaveAttribute('data-kind', 'untouched');
    expect(badge).toHaveTextContent('1');
  });

  it('archives and restores through the same versioned state transition', () => {
    hooks.notes.mockReturnValue({
      data: { notes: [note], total: 1 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    const { rerender } = render(
      <NoteList selectedId="note-1" onSelect={vi.fn()} language="en" />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Archive Existing note' }));
    expect(hooks.setArchived).toHaveBeenCalledWith({
      id: 'note-1',
      archived: true,
      expectedAutoSaveVersion: 0,
    });

    hooks.notes.mockReturnValue({
      data: { notes: [{ ...note, state: 'archived' }], total: 1 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    rerender(<NoteList selectedId="note-1" onSelect={vi.fn()} language="en" />);
    fireEvent.change(screen.getByTestId('notes-view-more'), { target: { value: 'archived' } });
    fireEvent.click(screen.getByRole('button', { name: 'Restore Existing note' }));
    expect(hooks.setArchived).toHaveBeenLastCalledWith({
      id: 'note-1',
      archived: false,
      expectedAutoSaveVersion: 0,
    });
  });

  it('uses Chinese copy for the meeting entry button and status badges', () => {
    const meeting = {
      ...note,
      id: 'meeting-zh',
      kind: 'meeting',
      state: 'active',
      sourceIds: ['src_a'],
      body: '今天的会议结论：下周一上线。',
    };
    hooks.notes.mockReturnValue({
      data: { notes: [meeting], total: 1 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<NoteList selectedId="meeting-zh" onSelect={vi.fn()} language="zh" />);

    expect(screen.getByTestId('notes-new-meeting')).toHaveTextContent('开始会议');
    expect(screen.getByTestId('notes-new-meeting')).toHaveTextContent('一键新建会议笔记，立刻开始录音');
    // "已转写" = both audio + body
    expect(screen.getByTestId('notes-item-meeting-status-meeting-zh')).toHaveTextContent('已转写');
  });

  it('does not show the meeting status badge on non-meeting notes', () => {
    const project = { ...note, id: 'project-1', kind: 'project', state: 'active', sourceIds: ['src_a'], body: '' };
    hooks.notes.mockReturnValue({
      data: { notes: [project], total: 1 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<NoteList selectedId="project-1" onSelect={vi.fn()} language="en" />);

    expect(screen.queryByTestId('notes-item-meeting-status-project-1')).not.toBeInTheDocument();
    // Pending count is purely meeting-scoped, so it must be absent here too.
    expect(screen.queryByTestId('notes-meeting-pending')).not.toBeInTheDocument();
  });

  it('omits the pending chip once every meeting note is fully transcribed', () => {
    const done = {
      ...note,
      id: 'm-done',
      kind: 'meeting',
      state: 'active',
      sourceIds: ['src_a'],
      body: '今天的会议结论：下周一上线。',
    };
    hooks.notes.mockReturnValue({
      data: { notes: [done], total: 1 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<NoteList selectedId="m-done" onSelect={vi.fn()} language="en" />);

    expect(screen.getByTestId('notes-item-meeting-status-m-done')).toHaveAttribute('data-status', 'both');
    expect(screen.queryByTestId('notes-meeting-pending')).not.toBeInTheDocument();
  });
});
