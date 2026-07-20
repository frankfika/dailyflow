/**
 * NotesView — the v2 Notes tab shell. Pairs a list of notes with the
 * document-first editor. Used by the main App's Notes tab.
 *
 * Layout modes (spec F-02A asks for plenty of writing room):
 *   - `split` (default) — 320px list + 1fr editor, two-column
 *   - `note` — list collapses to a 56px icon strip so the editor
 *     gets the full pane width for long-form writing. The strip keeps
 *     every note reachable with a single click; the active note is
 *     highlighted.
 *
 * The mode is persisted to localStorage so the user's choice sticks
 * across sessions. We key on the workspace id when available so two
 * workspaces don't fight over the setting.
 */
import { useEffect, useState } from 'react';
import { NoteList } from './NoteList';
import { NoteEditor } from './NoteEditor';

export type NotesLayout = 'split' | 'note';

export interface NotesViewProps {
  /** Optional initial note id (deep link). */
  initialNoteId?: string | null;
  /** Optional language for editor copy. */
  language?: 'zh' | 'en';
  /** Optional workspace id for namespacing the layout preference. */
  workspaceId?: string;
}

const STORAGE_KEY = 'df_notes_layout';

function loadLayout(workspaceId?: string): NotesLayout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return 'split';
    const parsed = JSON.parse(raw) as Record<string, NotesLayout>;
    if (workspaceId && parsed[workspaceId]) return parsed[workspaceId];
    if (parsed.__default) return parsed.__default;
    return 'split';
  } catch {
    return 'split';
  }
}

function saveLayout(layout: NotesLayout, workspaceId?: string) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: Record<string, NotesLayout> = raw ? JSON.parse(raw) : {};
    if (workspaceId) parsed[workspaceId] = layout;
    parsed.__default = layout;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // localStorage may be unavailable (private mode) — non-fatal.
  }
}

export function NotesView({ initialNoteId = null, language = 'en', workspaceId }: NotesViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(initialNoteId);
  const [layout, setLayout] = useState<NotesLayout>(() => loadLayout(workspaceId));
  // Defer reading from localStorage until after mount to avoid a
  // hydration mismatch on first paint. The `useState(() => load...)`
  // already does this synchronously, but a subsequent effect lets us
  // react to workspace changes.
  useEffect(() => {
    setLayout(loadLayout(workspaceId));
  }, [workspaceId]);
  useEffect(() => {
    saveLayout(layout, workspaceId);
  }, [layout, workspaceId]);

  const toggleLayout = () => setLayout((l) => (l === 'split' ? 'note' : 'split'));

  const asideWidth = layout === 'split' ? '320px' : '56px';
  const gridTemplate =
    typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
      ? `${asideWidth} 1fr`
      : '1fr';

  return (
    <div
      className="grid h-full overflow-hidden transition-[grid-template-columns] duration-200"
      data-testid="v2-notes-view"
      data-layout={layout}
      style={{ gridTemplateColumns: gridTemplate }}
    >
      <aside
        className="border-r border-border overflow-y-auto"
        style={{ width: asideWidth }}
        data-testid="notes-aside"
      >
        <NoteList
          selectedId={selectedId}
          onSelect={setSelectedId}
          layout={layout}
          onToggleLayout={toggleLayout}
        />
      </aside>
      <main className="overflow-hidden">
        <NoteEditor
          noteId={selectedId}
          language={language}
          layout={layout}
          onToggleLayout={toggleLayout}
        />
      </main>
    </div>
  );
}
