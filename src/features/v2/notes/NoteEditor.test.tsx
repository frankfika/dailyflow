import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NoteEditor } from './NoteEditor';

const mocks = vi.hoisted(() => ({
  noteState: 'draft' as 'draft' | 'active' | 'archived',
  schedule: vi.fn(),
  flush: vi.fn(async () => true),
  lastError: undefined as string | undefined,
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
        state: mocks.noteState,
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
    lastError: mocks.lastError,
    schedule: mocks.schedule,
    flush: mocks.flush,
  }),
  useNoteBacklinks: () => ({ data: undefined }),
  useNotes: () => ({ data: { notes: [] } }),
  useDeleteNote: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

function renderEditor(onDeleted?: (id: string) => void) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <NoteEditor
        noteId="note_01KAAAAAAAAAAAAAAAA"
        language="en"
        onDeleted={onDeleted}
      />
    </QueryClientProvider>,
  );
}

describe('NoteEditor Markdown and metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.noteState = 'draft';
    mocks.flush.mockResolvedValue(true);
    mocks.lastError = undefined;
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

  it('keeps typing responsive while previewing the latest unsaved draft', () => {
    renderEditor();
    const editor = screen.getByTestId('note-body');

    fireEvent.change(editor, { target: { value: 'A newly typed **draft**' } });
    expect(mocks.schedule).toHaveBeenLastCalledWith({ body: 'A newly typed **draft**' });

    fireEvent.click(screen.getByTestId('note-mode-preview'));
    expect(screen.getByTestId('note-markdown-preview')).toHaveTextContent('A newly typed draft');
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

  it('queues archive and restore with pending autosaves', async () => {
    const onDeleted = vi.fn();
    const { rerender } = renderEditor(onDeleted);

    fireEvent.click(screen.getByTestId('note-archive'));
    expect(mocks.schedule).toHaveBeenCalledWith({ state: 'archived' });
    expect(mocks.flush).toHaveBeenCalled();
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));

    mocks.noteState = 'archived';
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <NoteEditor noteId="note_01KAAAAAAAAAAAAAAAA" language="en" />
      </QueryClientProvider>,
    );

    expect(screen.queryByTestId('note-archive')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('note-restore'));
    expect(mocks.schedule).toHaveBeenLastCalledWith({ state: 'active' });
    expect(mocks.flush).toHaveBeenCalledTimes(2);
  });

  it('keeps the editor open and shows the error when archive persistence fails', async () => {
    const onDeleted = vi.fn();
    mocks.flush.mockResolvedValue(false);
    mocks.lastError = 'Network unavailable';
    renderEditor(onDeleted);

    fireEvent.click(screen.getByTestId('note-archive'));

    await waitFor(() => expect(mocks.flush).toHaveBeenCalled());
    expect(onDeleted).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Network unavailable');
    expect(screen.getByTestId('note-editor')).toBeInTheDocument();
  });
});
