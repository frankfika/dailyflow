/**
 * NotesView — the v2 Notes tab shell. Pairs a list of notes with the
 * document-first editor. Used by the main App's Notes tab.
 */
import { useState } from 'react';
import { NoteList } from './NoteList';
import { NoteEditor } from './NoteEditor';

export interface NotesViewProps {
  /** Optional initial note id (deep link). */
  initialNoteId?: string | null;
  /** Optional language for editor copy. */
  language?: 'zh' | 'en';
}

export function NotesView({ initialNoteId = null, language = 'en' }: NotesViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(initialNoteId);
  return (
    <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] h-full overflow-hidden" data-testid="v2-notes-view">
      <aside className="border-r border-border overflow-y-auto">
        <NoteList selectedId={selectedId} onSelect={setSelectedId} />
      </aside>
      <main className="overflow-hidden">
        <NoteEditor noteId={selectedId} language={language} />
      </main>
    </div>
  );
}
