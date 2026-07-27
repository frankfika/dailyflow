import { render, screen, waitFor } from '@testing-library/react';
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
});
