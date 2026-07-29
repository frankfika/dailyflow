import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NoteEditor } from './NoteEditor';

const mocks = vi.hoisted(() => ({
  schedule: vi.fn(),
  flush: vi.fn(async () => undefined),
  listCommitments: vi.fn(async () => ({
    items: [{
      id: 'com_01KAAAAAAAAAAAAAAAA',
      title: 'Ship the release',
      state: 'active',
    }],
    total: 1,
  })),
}));

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return { ...actual, listCommitments: mocks.listCommitments };
});

vi.mock('../hooks/useNotes', () => ({
  useNote: () => ({
    data: {
      note: {
        id: 'note_01KAAAAAAAAAAAAAAAA',
        schemaVersion: 1,
        createdAt: '2026-07-29T00:00:00.000Z',
        updatedAt: '2026-07-29T00:00:00.000Z',
        createdBy: 'user',
        workspaceId: 'default',
        title: 'Markdown note',
        body: '# Heading\n\n- [x] Done\n\n| A | B |\n| - | - |\n| 1 | 2 |',
        kind: 'general',
        state: 'draft',
        projectIds: [],
        personIds: [],
        sourceIds: [],
        pinned: false,
        autoSaveVersion: 0,
        contentHash: '12345678',
        tagIds: [],
        commitmentIds: [],
      },
    },
    isLoading: false,
    error: null,
  }),
  useNoteAutosave: () => ({
    status: 'idle',
    lastSavedVersion: 0,
    schedule: mocks.schedule,
    flush: mocks.flush,
  }),
  useNoteBacklinks: () => ({ data: undefined }),
  useNotes: () => ({ data: { notes: [] } }),
  useArchiveNote: () => ({ mutate: vi.fn() }),
  useDeleteNote: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

function renderEditor() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <NoteEditor noteId="note_01KAAAAAAAAAAAAAAAA" language="en" />
    </QueryClientProvider>,
  );
}

describe('NoteEditor Markdown and metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('switches from source editing to rendered GFM preview', () => {
    renderEditor();
    expect(screen.getByTestId('note-body')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('note-mode-preview'));

    const preview = screen.getByTestId('note-markdown-preview');
    expect(preview).toHaveTextContent('Heading');
    expect(preview.querySelector('h1')).toHaveTextContent('Heading');
    expect(preview.querySelector('input[type="checkbox"]')).toBeChecked();
    expect(preview.querySelector('table')).toBeInTheDocument();
    expect(screen.queryByTestId('note-body')).not.toBeInTheDocument();
  });

  it('saves tags and linked tasks through the versioned autosave queue', async () => {
    renderEditor();

    fireEvent.change(screen.getByTestId('note-tag-input'), { target: { value: '#planning' } });
    fireEvent.keyDown(screen.getByTestId('note-tag-input'), { key: 'Enter' });
    expect(mocks.schedule).toHaveBeenCalledWith({ tagIds: ['planning'] });
    expect(mocks.flush).toHaveBeenCalled();

    await waitFor(() => expect(screen.getByRole('option', { name: 'Ship the release' })).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('note-task-picker'), {
      target: { value: 'com_01KAAAAAAAAAAAAAAAA' },
    });
    expect(mocks.schedule).toHaveBeenCalledWith({
      commitmentIds: ['com_01KAAAAAAAAAAAAAAAA'],
    });
  });
});
