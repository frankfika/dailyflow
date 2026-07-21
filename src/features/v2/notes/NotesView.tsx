/**
 * NotesView — the v2 Notes tab shell. Pairs a list of notes with the
 * document-first editor. Used by the main App's Notes tab.
 *
 * Layout modes:
 *   - `split` (default) — 280px list + 1fr editor, two-column. The
 *     list shows real empty-state when there are no notes instead of
 *     a 56px strip of dead air. Frank's 1.1.9 default was `note` and
 *     the 56px column was an unusable dead column the user couldn't
 *     get rid of without explicit action.
 *   - `note` — list collapses to a 56px icon strip so the editor gets
 *     the full pane width for long-form writing. Toggle with `mod+\`
 *     (Cmd+\ on macOS, Ctrl+\ on Windows/Linux) or the button in the
 *     list header.
 *
 * The mode is persisted to localStorage so the user's choice sticks
 * across sessions. We key on the workspace id when available so two
 * workspaces don't fight over the setting.
 */
import { useCallback, useEffect, useState } from 'react';
import { NoteList } from './NoteList';
import { NoteEditor } from './NoteEditor';
import { useCreateNote } from '../hooks/useNotes';
import type { NoteKind } from '../api/client';

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
    // Preserve an explicit user choice (including 'note') for the
    // active workspace — only fall through to the new default when no
    // value is stored. Returning 'split' as the default means an empty
    // notes list fills the 280px column with its real empty-state
    // (no notes yet) rather than 56px of focus-strip dead air.
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
  const create = useCreateNote();
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

  // Open a new note with a starter body (used by the editor's empty-
  // state onboarding card). The card is rendered when the editor is
  // mounted with an empty body — instead of staring at a tiny
  // "Start writing..." placeholder floating in a wall of textarea
  // whitespace, the user gets three starter templates to pick from.
  const createAndOpen = useCallback(
    async (kind: NoteKind, body: string) => {
      const { note } = await create.mutateAsync({
        body,
        kind,
        state: 'draft',
      });
      setSelectedId(note.id);
    },
    [create],
  );

  // Keyboard shortcut: `mod+\` toggles between split and focus layouts.
  // `mod` is Cmd on macOS, Ctrl on Windows/Linux. We swallow the event
  // only when the user isn't typing into a text control, so editing
  // notes still works as expected.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key !== '\\') return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (target.isContentEditable) return;
      }
      e.preventDefault();
      setLayout((l) => (l === 'split' ? 'note' : 'split'));
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const asideWidth = layout === 'split' ? '280px' : '56px';
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
          language={language}
        />
      </aside>
      <main className="overflow-hidden">
        <NoteEditor
          noteId={selectedId}
          language={language}
          layout={layout}
          onToggleLayout={toggleLayout}
          onCreateFromTemplate={createAndOpen}
        />
      </main>
    </div>
  );
}
