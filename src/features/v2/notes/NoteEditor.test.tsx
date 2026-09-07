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
  listLegacyTasks: vi.fn(async () => ({
    items: [{
      id: '2026-07-29#3',
      date: '2026-07-29',
      title: 'Daily checklist task',
      status: 'todo' as const,
      filePath: '/tmp/2026-07-29.md',
      line: 3,
    }],
  })),
  createCommitment: vi.fn(async () => ({
    commitment: {
      id: 'com_01KBBBBBBBBBBBBBBBB',
      title: 'Draft launch email',
      state: 'active',
    },
  })),
  migrateLegacyTask: vi.fn(async () => ({
    commitmentId: 'com_01KCCCCCCCCCCCCCCCC',
    legacyTaskId: '2026-07-29#3',
  })),
  completeCommitment: vi.fn(async () => ({
    commitment: {
      id: 'com_01KAAAAAAAAAAAAAAAA',
      state: 'completed',
    },
  })),
}));

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    listCommitments: mocks.listCommitments,
    listLegacyTasks: mocks.listLegacyTasks,
    createCommitment: mocks.createCommitment,
    migrateLegacyTask: mocks.migrateLegacyTask,
    completeCommitment: mocks.completeCommitment,
  };
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

function renderEditor(onDeleted?: (id: string) => void, onNotice?: (message: string, type?: 'success' | 'info' | 'error') => void) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <NoteEditor
        noteId="note_01KAAAAAAAAAAAAAAAA"
        language="en"
        onDeleted={onDeleted}
        onNotice={onNotice}
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

  it('renders Markdown as editable semantic content in one continuous surface', async () => {
    renderEditor();
    const editor = await screen.findByTestId('note-body');
    expect(editor).toHaveAttribute('contenteditable', 'true');
    expect(editor.querySelector('h1')).toHaveTextContent('Heading');
    expect(editor.querySelector('input[type="checkbox"]')).toBeChecked();
    expect(editor.querySelector('table')).toBeInTheDocument();
    expect(screen.queryByTestId('note-mode-preview')).not.toBeInTheDocument();
    expect(screen.queryByTestId('note-mode-edit')).not.toBeInTheDocument();
  });

  it('keeps the live Markdown canvas mounted without a detached preview', async () => {
    renderEditor();
    const editor = await screen.findByTestId('note-body');
    expect(editor).toBeVisible();
    expect(screen.getByTestId('note-live-markdown-editor')).toContainElement(editor);
    expect(screen.queryByTestId('note-markdown-preview')).not.toBeInTheDocument();
  });

  it('owns Ctrl+S and flushes the current Note instead of saving the web page', async () => {
    const onNotice = vi.fn();
    renderEditor(undefined, onNotice);
    const shortcut = new KeyboardEvent('keydown', {
      key: 's',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });

    document.dispatchEvent(shortcut);

    expect(shortcut.defaultPrevented).toBe(true);
    await waitFor(() => expect(mocks.flush).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onNotice).toHaveBeenCalledWith('Note saved', 'success'));
  });

  it('owns Cmd+S and reports a failed flush without losing the local draft', async () => {
    const onNotice = vi.fn();
    mocks.flush.mockResolvedValue(false);
    renderEditor(undefined, onNotice);
    const shortcut = new KeyboardEvent('keydown', {
      key: 'S',
      metaKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });

    document.dispatchEvent(shortcut);

    expect(shortcut.defaultPrevented).toBe(true);
    await waitFor(() => expect(onNotice).toHaveBeenCalledWith(
      'Save failed. Local edits remain in the editor.',
      'error',
    ));
  });

  it('saves tags and linked tasks through the versioned autosave queue', async () => {
    renderEditor();

    expect(screen.getByTestId('note-primary-properties')).toBeVisible();
    expect(screen.getByTestId('note-tags').closest('details')).toBeNull();
    expect(screen.getByTestId('note-linked-tasks').closest('details')).toBeNull();

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

  it('fires a success toast when a task is created and linked to the note', async () => {
    const onNotice = vi.fn();
    renderEditor(undefined, onNotice);

    const input = screen.getByTestId('note-create-task-input');
    fireEvent.change(input, { target: { value: 'Draft launch email' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(mocks.createCommitment).toHaveBeenCalledWith({
      title: 'Draft launch email',
      outcome: 'Draft launch email',
      state: 'active',
      createdBy: 'user',
    }));
    await waitFor(() => expect(mocks.schedule).toHaveBeenCalledWith({
      commitmentIds: ['com_01KBBBBBBBBBBBBBBBB'],
    }));
    await waitFor(() =>
      expect(onNotice).toHaveBeenCalledWith(
        expect.stringContaining('Draft launch email'),
        'success',
      ),
    );
  });

  it('fires a toast when an existing commitment is linked via the picker', async () => {
    const onNotice = vi.fn();
    renderEditor(undefined, onNotice);

    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Ship the release' })).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByTestId('note-task-picker'), {
      target: { value: 'com_01KAAAAAAAAAAAAAAAA' },
    });

    await waitFor(() => expect(mocks.schedule).toHaveBeenCalledWith({
      commitmentIds: ['com_01KAAAAAAAAAAAAAAAA'],
    }));
    await waitFor(() =>
      expect(onNotice).toHaveBeenCalledWith(expect.stringContaining('Ship the release'), 'success'),
    );
  });

  it('offers Today tasks and migrates the selected task before linking it', async () => {
    renderEditor();

    await waitFor(() => expect(screen.getByRole('option', { name: 'Daily checklist task · 2026-07-29' })).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('note-task-picker'), {
      target: { value: 'legacy:2026-07-29#3' },
    });

    await waitFor(() => expect(mocks.migrateLegacyTask).toHaveBeenCalledWith(
      '2026-07-29',
      3,
      {
        title: 'Daily checklist task',
        outcome: 'Daily checklist task',
        state: 'active',
      },
    ));
    await waitFor(() => expect(mocks.schedule).toHaveBeenCalledWith({
      commitmentIds: ['com_01KCCCCCCCCCCCCCCCC'],
    }));
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
