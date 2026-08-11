import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotesView } from './NotesView';

vi.mock('../hooks/useNotes', () => ({
  useCreateNote: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock('./NoteList', () => ({
  NoteList: ({ onSelect }: { onSelect: (id: string) => void }) => (
    <button type="button" onClick={() => onSelect('note-1')}>Open note</button>
  ),
}));

vi.mock('./NoteEditor', () => ({
  NoteEditor: ({ noteId }: { noteId: string | null }) => (
    <div data-testid="mock-note-editor">{noteId}</div>
  ),
}));

describe('NotesView mobile navigation', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('max-width'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it('uses a list-to-editor flow instead of stacking the editor below the list', () => {
    render(<NotesView language="en" />);

    expect(screen.getByRole('button', { name: 'Open note' })).toBeInTheDocument();
    expect(screen.queryByTestId('mock-note-editor')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open note' }));

    expect(screen.getByTestId('mock-note-editor')).toHaveTextContent('note-1');
    const backButton = screen.getByRole('button', { name: 'Back to notes' });
    expect(backButton).toBeInTheDocument();
    expect(backButton).not.toHaveClass('absolute');
    expect(backButton.parentElement).toHaveClass('shrink-0');

    fireEvent.click(backButton);
    expect(screen.getByRole('button', { name: 'Open note' })).toBeInTheDocument();
  });

  it('opens a meeting note requested by a global capture entry point', () => {
    render(<NotesView language="en" requestedNoteId="meeting-note-1" />);

    expect(screen.getByTestId('mock-note-editor')).toHaveTextContent('meeting-note-1');
    expect(screen.getByRole('button', { name: 'Back to notes' })).toBeInTheDocument();
  });
});
