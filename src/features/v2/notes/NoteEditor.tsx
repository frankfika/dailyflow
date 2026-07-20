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
import type { NoteBacklinks } from '../api/client';

export interface NoteEditorProps {
  /** The note id to edit. Pass `null` for an empty editor placeholder. */
  noteId: string | null;
  /** Optional language for i18n copy (zh / en). */
  language?: 'zh' | 'en';
  /** Optional className for layout. */
  className?: string;
  /** Layout mode from the parent. `note` means the list is hidden so
   * the editor gets the full pane width. */
  layout?: 'split' | 'note';
  /** Toggle between `split` and `note`. The editor shows a small
   * button when the list is hidden. */
  onToggleLayout?: () => void;
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
    showList: '显示列表',
    focusMode: '专注模式',
    words: '字',
    chars: '字符',
    minRead: '分钟阅读',
    lastUpdated: '最后更新',
    bodyEmpty: '空白',
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
    showList: 'Show list',
    focusMode: 'Focus mode',
    words: 'words',
    chars: 'chars',
    minRead: 'min read',
    lastUpdated: 'Last updated',
    bodyEmpty: 'Empty',
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

/**
 * Local copy of NoteList's relativeTime helper. Mirrors the same
 * buckets (just now / Nm / Nh / Nd / ISO date) so the statusbar
 * reads the same as the list cells. We don't import it from
 * NoteList because it's a file-private helper; promoting it to
 * a shared util is out of scope for this change.
 */
function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(iso).toISOString().slice(0, 10);
}

export function NoteEditor({ noteId, language = 'en', className = '', layout = 'split', onToggleLayout }: NoteEditorProps) {
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

  // Word count for the statusbar. Mirrors the spec: trim, split on
  // any whitespace, drop empties, count. Pure string math — no
  // markdown stripping — so a 200-word doc with frontmatter shows
  // the same count the user sees in their editor.
  const words = body.trim().split(/\s+/).filter(Boolean).length;

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
            {onToggleLayout && (
              <button
                onClick={onToggleLayout}
                className={`px-1.5 py-0.5 border rounded ${
                  layout === 'note'
                    ? 'border-accent text-accent'
                    : 'border-border text-text-muted'
                }`}
                data-testid="note-toggle-layout"
                title={layout === 'note' ? t.showList : t.focusMode}
                aria-label={layout === 'note' ? t.showList : t.focusMode}
              >
                {layout === 'note' ? '⇆' : '⛶'}
              </button>
            )}
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

      {/* Body — document-first, fills the rest of the pane.
          min-h-[60vh] guarantees a writing area even on empty notes
          so the statusbar / backlinks below it never crowd into a
          collapsed header. */}
      <textarea
        value={body}
        onChange={(e) => onBodyChange(e.target.value)}
        placeholder={t.placeholder}
        className="flex-1 min-h-[60vh] w-full p-4 bg-transparent text-base text-text-heading placeholder:text-text-muted outline-none resize-none font-sans leading-relaxed"
        data-testid="note-body"
      />

      {/* Statusbar — word/char/read stats. When there are no
          backlinks we also surface "Last updated Xm ago" on the
          left so the strip carries a recency cue that would
          otherwise only be visible in the list cells. */}
      <footer
        className="px-4 py-1.5 border-t border-border flex items-center justify-between text-[11px] text-text-muted"
        data-testid="note-editor-statusbar"
      >
        <span data-testid="note-editor-last-updated">
          {!(backlinks.data && hasAnyBacklink(backlinks.data.backlinks))
            ? `${t.lastUpdated} ${relativeTime(note.updatedAt)}`
            : ''}
        </span>
        <div className="flex items-center gap-4">
          <span data-testid="note-editor-words">
            {words === 0 ? t.bodyEmpty : `${words} ${t.words}`}
          </span>
          <span data-testid="note-editor-chars">
            {body.length} {t.chars}
          </span>
          <span data-testid="note-editor-read">
            ~{Math.max(1, Math.ceil(words / 200))} {t.minRead}
          </span>
        </div>
      </footer>

      {/* Backlinks panel — full reverse-relationship view. Spec §26
          step 19: "用户一个月后询问当时为什么这样决定, 系统用
          Decision 和 Evidence 回答." We surface the entities that
          reference this note via shared evidence so the user can jump
          from a note to the commitment / decision / outcome that
          cites it. */}
      {backlinks.data && hasAnyBacklink(backlinks.data.backlinks) && (
        <BacklinksPanel
          backlinks={backlinks.data.backlinks}
          labels={{
            title: t.backlinks,
            evidence: language === 'zh' ? '证据' : 'evidence',
            commitments: language === 'zh' ? '承诺' : 'commitments',
            decisions: language === 'zh' ? '决定' : 'decisions',
            outcomes: language === 'zh' ? '结果' : 'outcomes',
          }}
        />
      )}
    </div>
  );
}

function hasAnyBacklink(b: NoteBacklinks): boolean {
  return (
    b.evidenceIds.length > 0 ||
    b.commitmentIds.length > 0 ||
    b.decisionIds.length > 0 ||
    b.outcomeIds.length > 0
  );
}

function BacklinksPanel({
  backlinks,
  labels,
}: {
  backlinks: NoteBacklinks;
  labels: {
    title: string;
    evidence: string;
    commitments: string;
    decisions: string;
    outcomes: string;
  };
}) {
  return (
    <footer
      className="px-4 py-3 border-t border-border bg-surface-elevated/50"
      data-testid="note-backlinks"
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted mb-2">
        {labels.title}
      </p>
      <ul className="flex flex-col gap-1.5 text-xs">
        {backlinks.commitmentIds.length > 0 && (
          <BacklinkRow
            kind="commitment"
            label={labels.commitments}
            ids={backlinks.commitmentIds}
          />
        )}
        {backlinks.decisionIds.length > 0 && (
          <BacklinkRow
            kind="decision"
            label={labels.decisions}
            ids={backlinks.decisionIds}
          />
        )}
        {backlinks.outcomeIds.length > 0 && (
          <BacklinkRow
            kind="outcome"
            label={labels.outcomes}
            ids={backlinks.outcomeIds}
          />
        )}
        {backlinks.evidenceIds.length > 0 && (
          <BacklinkRow
            kind="evidence"
            label={labels.evidence}
            ids={backlinks.evidenceIds}
          />
        )}
      </ul>
    </footer>
  );
}

function BacklinkRow({
  kind,
  label,
  ids,
}: {
  kind: 'commitment' | 'decision' | 'outcome' | 'evidence';
  label: string;
  ids: string[];
}) {
  return (
    <li className="flex items-baseline gap-2" data-testid={`note-backlinks-${kind}`}>
      <span className="text-text-muted shrink-0 w-24">{label}</span>
      <span className="flex flex-wrap gap-1">
        {ids.map((id) => (
          <code
            key={id}
            className="px-1.5 py-0.5 rounded bg-surface border border-border text-[10px] text-text-muted font-mono"
            title={id}
          >
            {id.slice(0, 16)}…
          </code>
        ))}
      </span>
    </li>
  );
}
