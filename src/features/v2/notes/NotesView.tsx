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
 * across sessions.
 */
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { NoteList } from './NoteList';
import { NoteEditor } from './NoteEditor';
import { useCreateNote } from '../hooks/useNotes';
import type { NoteKind } from '../api/client';

export type NotesLayout = 'split' | 'note';

export interface NotesViewProps {
  /** Optional language for editor copy. */
  language?: 'zh' | 'en';
  /** Whether the app navigation sidebar is currently visible. */
  sidebarOpen?: boolean;
  /** App-level toast for saves and actions that change selection. */
  onNotice?: (message: string, type?: 'success' | 'info' | 'error') => void;
}

const STORAGE_KEY = 'df_notes_layout';

function loadLayout(): NotesLayout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return 'split';
    const parsed = JSON.parse(raw) as { __default?: NotesLayout };
    // Preserve an explicit user choice (including 'note') — only fall
    // through to the new default when no value is stored. Returning
    // 'split' as the default means an empty notes list fills the
    // 280px column with its real empty-state (no notes yet) rather
    // than 56px of focus-strip dead air.
    return parsed.__default ?? 'split';
  } catch {
    return 'split';
  }
}

function saveLayout(layout: NotesLayout) {
  try {
    const parsed: Record<string, NotesLayout> = { __default: layout };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // localStorage may be unavailable (private mode) — non-fatal.
  }
}

export function NotesView({ language = 'en', sidebarOpen = true, onNotice }: NotesViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [layout, setLayout] = useState<NotesLayout>(() => loadLayout());
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
  );
  const create = useCreateNote();
  useEffect(() => {
    saveLayout(layout);
  }, [layout]);

  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const select = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (id) setSelectedId(id);
    };
    window.addEventListener('df:select-note', select);
    return () => window.removeEventListener('df:select-note', select);
  }, []);

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

  if (isMobile) {
    return (
      <div
        className="relative h-full min-h-0 overflow-hidden"
        data-testid="v2-notes-view"
        data-layout="mobile"
      >
        {selectedId ? (
          <main className="h-full min-h-0 overflow-hidden">
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="absolute left-3 top-3 z-20 inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border bg-surface-elevated px-3 text-sm font-medium text-text-heading shadow-sm"
              aria-label={language === 'zh' ? '返回笔记列表' : 'Back to notes'}
              data-testid="notes-mobile-back"
            >
              <ArrowLeft className="h-4 w-4" />
              {language === 'zh' ? '笔记' : 'Notes'}
            </button>
            <NoteEditor
              noteId={selectedId}
              language={language}
              layout="note"
              onCreateFromTemplate={createAndOpen}
              onSelectNote={setSelectedId}
              onDeleted={() => setSelectedId(null)}
              onNotice={onNotice}
            />
          </main>
        ) : (
          <aside className="h-full min-w-0 overflow-hidden" data-testid="notes-aside">
            <NoteList
              selectedId={selectedId}
              onSelect={setSelectedId}
              layout="split"
              language={language}
              sidebarOpen={sidebarOpen}
              autoSelectFirst={false}
              onNotice={onNotice}
            />
          </aside>
        )}
      </div>
    );
  }

  return (
    <div
      className="h-full grid overflow-hidden transition-[grid-template-columns] duration-200"
      data-testid="v2-notes-view"
      data-layout={layout}
      style={{ gridTemplateColumns: `${asideWidth} 1fr`, minHeight: 0 }}
    >
      <aside
        className="min-w-0 overflow-hidden border-r border-border"
        style={{ width: asideWidth }}
        data-testid="notes-aside"
      >
        <NoteList
          selectedId={selectedId}
          onSelect={setSelectedId}
          layout={layout}
          onToggleLayout={toggleLayout}
          language={language}
          sidebarOpen={sidebarOpen}
          onNotice={onNotice}
        />
      </aside>
      <main className="overflow-hidden">
        <NoteEditor
          noteId={selectedId}
          language={language}
          layout={layout}
          onToggleLayout={toggleLayout}
          onCreateFromTemplate={createAndOpen}
          onSelectNote={setSelectedId}
          onDeleted={() => setSelectedId(null)}
          onNotice={onNotice}
        />
      </main>
    </div>
  );
}
