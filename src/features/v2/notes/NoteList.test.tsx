import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NoteList } from './NoteList';

const hooks = vi.hoisted(() => ({
  notes: vi.fn(),
  create: vi.fn(),
  archive: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('../hooks/useNotes', () => ({
  useNotes: hooks.notes,
  useCreateNote: () => ({ isPending: false, mutateAsync: hooks.create }),
  useUpdateNote: () => ({ isPending: false, mutate: vi.fn() }),
  useArchiveNote: () => ({ mutate: hooks.archive }),
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
});
