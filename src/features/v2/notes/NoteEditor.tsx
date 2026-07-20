/**
 * NoteDocument editor — document-first, autosave, no title required.
 *
 * Spec F-02A constraints implemented here:
 *   - Open-and-write: the body is the first thing the user sees; the
 *     title is optional and may be added or removed at any time without
 *     changing the note's id.
 *   - Autosave: every keystroke schedules an 800ms-debounced PATCH;
 *     status indicator shows "saving" / "saved" / "conflict".
 *   - Conflict resolution: useNoteAutosave transparently retries once
 *     on 409 by re-reading the note and patching again.
 *   - No AI in the body: AI suggestions (when added) will only appear
 *     in a side rail; they cannot rewrite the body without an explicit
 *     diff accept. (Out of scope for 1.1.2; reserved for 1.1.3.)
 *   - flush() on unmount prevents the "edited → navigated → lost"
 *     race that the spec calls out.
 */
import { useEffect, useRef, useState } from 'react';
import { useNote, useNoteAutosave, useNoteBacklinks } from '../hooks/useNotes';
import { useUpdateNote, useArchiveNote } from '../hooks/useNotes';
import type { AutosaveStatus } from '../hooks/useNotes';
import { Spinner, Button, Badge } from '../components/States';

export interface NoteEditorProps {
  /** The note id to edit. Pass `null` for an empty editor placeholder. */
  noteId: string | null;
  /** Optional language for i18n copy (zh / en). */
  language?: 'zh' | 'en';
  /** Optional className for layout. */
  className?: string;
}

const COPY = {
  zh: {
    placeholder: '开始写点什么…',
    untitled: '（无标题）',
    saving: '保存中…',
    saved: '已保存',
    conflict: '有冲突，刷新中…',
    error: '保存失败',
    empty: '选左边一篇笔记，或者新建一篇。',
    backlinks: '关联',
    kind: '类型',
    date: '日期',
    pinned: '置顶',
    archive: '归档',
    unarchive: '取消归档',
  },
  en: {
    placeholder: 'Start writing…',
    untitled: '(untitled)',
    saving: 'Saving…',
    saved: 'Saved',
    conflict: 'Resolving conflict…',
    error: 'Save failed',
    empty: 'Pick a note from the left, or start a new one.',
    backlinks: 'Backlinks',
    kind: 'Kind',
    date: 'Date',
    pinned: 'Pinned',
    archive: 'Archive',
    unarchive: 'Unarchive',
  },
};

function statusCopy(s: AutosaveStatus, lang: 'zh' | 'en'): string {
  const c = COPY[lang];
  switch (s) {
    case 'saving': return c.saving;
    case 'saved': return c.saved;
    case 'conflict': return c.conflict;
    case 'error': return c.error;
    case 'idle':
    default: return '';
  }
}

function statusTone(s: AutosaveStatus): 'default' | 'success' | 'warning' | 'danger' | 'info' {
  switch (s) {
    case 'saving': return 'info';
    case 'saved': return 'success';
    case 'conflict': return 'warning';
    case 'error': return 'danger';
    default: return 'default';
  }
}

export function NoteEditor({ noteId, language = 'en', className = '' }: NoteEditorProps) {
  const t = COPY[language];
  const q = useNote(noteId);
  const note = q.data?.note;
  const update = useUpdateNote();
  const archive = useArchiveNote();
  const backlinks = useNoteBacklinks(noteId);

  // Local mirror of body and title. The hook drives persistence; this
  // is what the textarea reads/writes. We seed from the server fetch
  // and only re-seed on noteId change.
  const [body, setBody] = useState<string>(note?.body ?? '');
  const [title, setTitle] = useState<string>(note?.title ?? '');
  const seedRef = useRef<string | null>(null);

  useEffect(() => {
    seedRef.current = noteId;
    setBody(note?.body ?? '');
    setTitle(note?.title ?? '');
  }, [noteId, note?.body, note?.title]);

  const autosave = useNoteAutosave(note ?? null);

  // schedule(autosave) every keystroke. The hook debounces and
  // persists via PATCH.
  const onBodyChange = (v: string) => {
    setBody(v);
    autosave.schedule({ body: v });
  };
  const onTitleChange = (v: string) => {
    setTitle(v);
    autosave.schedule({ title: v === '' ? null : v });
  };

  // Flush on unmount or before navigation.
  useEffect(() => {
    return () => {
      // Fire-and-forget; the editor is going away and we want the
      // server to receive the last keystroke.
      autosave.flush().catch(() => undefined);
    };
    // We intentionally only re-subscribe when noteId changes — a
    // flush on every render would be wasteful.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  if (!noteId) {
    return (
      <div className={`flex items-center justify-center h-full text-text-muted ${className}`}>
        <p className="text-sm">{t.empty}</p>
      </div>
    );
  }

  if (q.isLoading) {
    return (
      <div className={`flex items-center justify-center h-full ${className}`}>
        <Spinner />
      </div>
    );
  }

  if (q.error || !note) {
    return (
      <div className={`flex items-center justify-center h-full ${className}`}>
        <p className="text-sm text-text-muted">Note not found.</p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full ${className}`} data-testid="note-editor">
      {/* Title is optional — F-02A forbids blocking on a title. */}
      <header className="px-4 pt-4 pb-2 flex flex-col gap-1 border-b border-border">
        <input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder={t.untitled}
          className="w-full bg-transparent text-2xl font-semibold text-text-heading outline-none placeholder:text-text-muted"
          data-testid="note-title"
        />
        <div className="flex items-center gap-2 text-xs text-text-muted">
          {autosave.status !== 'idle' && (
            <Badge tone={statusTone(autosave.status)}>
              {statusCopy(autosave.status, language)}
            </Badge>
          )}
          <span>v{autosave.lastSavedVersion}</span>
          <span>·</span>
          <span>{new Date(note.updatedAt).toLocaleString()}</span>
          <span className="ml-auto flex items-center gap-1">
            <select
              value={note.kind}
              onChange={(e) =>
                update.mutate({
                  id: note.id,
                  input: {
                    expectedAutoSaveVersion: note.autoSaveVersion,
                    kind: e.target.value as typeof note.kind,
                  },
                })
              }
              className="bg-transparent border border-border rounded px-1.5 py-0.5"
              data-testid="note-kind"
            >
              <option value="quick">quick</option>
              <option value="daily">daily</option>
              <option value="meeting">meeting</option>
              <option value="project">project</option>
              <option value="reference">reference</option>
              <option value="general">general</option>
            </select>
            <input
              type="date"
              value={note.date ?? ''}
              onChange={(e) =>
                update.mutate({
                  id: note.id,
                  input: {
                    expectedAutoSaveVersion: note.autoSaveVersion,
                    date: e.target.value || null,
                  },
                })
              }
              className="bg-transparent border border-border rounded px-1.5 py-0.5"
              data-testid="note-date"
            />
            <button
              onClick={() =>
                update.mutate({
                  id: note.id,
                  input: {
                    expectedAutoSaveVersion: note.autoSaveVersion,
                    pinned: !note.pinned,
                  },
                })
              }
              className={`px-1.5 py-0.5 border rounded ${
                note.pinned
                  ? 'border-accent text-accent'
                  : 'border-border text-text-muted'
              }`}
              data-testid="note-pin"
              title={t.pinned}
            >
              ★
            </button>
            <button
              onClick={() => archive.mutate(note.id)}
              className="px-1.5 py-0.5 border border-border rounded text-text-muted"
              data-testid="note-archive"
            >
              {t.archive}
            </button>
          </span>
        </div>
      </header>

      {/* Body — document-first, fills the rest of the pane. */}
      <textarea
        value={body}
        onChange={(e) => onBodyChange(e.target.value)}
        placeholder={t.placeholder}
        className="flex-1 w-full p-4 bg-transparent text-base text-text-heading placeholder:text-text-muted outline-none resize-none font-sans leading-relaxed"
        data-testid="note-body"
      />

      {/* Backlinks panel — minimal v1; full panel in 1.1.3. */}
      {backlinks.data && backlinks.data.backlinks.evidenceIds.length > 0 && (
        <footer className="px-4 py-2 border-t border-border text-xs text-text-muted">
          {t.backlinks}: {backlinks.data.backlinks.evidenceIds.length} evidence anchor(s)
        </footer>
      )}
    </div>
  );
}
