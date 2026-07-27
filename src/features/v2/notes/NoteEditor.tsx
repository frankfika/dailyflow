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
import { useEffect, useState } from 'react';
import { Maximize2, Minimize2, FileText, Lightbulb, Calendar, PenLine, ArrowRight } from 'lucide-react';
import { useNote, useNoteAutosave, useNoteBacklinks, useNotes, useUpdateNote, useArchiveNote, type AutosaveStatus } from '../hooks/useNotes';
import { Spinner, Badge } from '../components/States';
import type { NoteBacklinks, NoteKind } from '../api/client';
import { relativeTime } from './relativeTime';

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
  /** Create a new note from a starter template. Used by the empty-
   * state onboarding card so a user can pick a template instead of
   * staring at a wall of textarea whitespace. */
  onCreateFromTemplate?: (kind: NoteKind, body: string) => void | Promise<void>;
  /** Switch which note the editor is showing. Used by the recent-
   * notes list in the empty-state onboarding card. */
  onSelectNote?: (id: string) => void;
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
    showList: '显示列表',
    focusMode: '专注模式',
    words: '字',
    chars: '字符',
    minRead: '分钟阅读',
    bodyEmpty: '空白',
    onboardingTitle: '开始你的第一篇笔记',
    onboardingHint: '挑一个模板，或新建一篇空白笔记',
    templateDaily: '今日记录',
    templateIdea: '想法捕捉',
    templateMeeting: '会议纪要',
    templateBlank: '直接开始写',
    recentSection: '或继续编辑',
    tipsTitle: '小贴士',
    tipShortcut: '按 ⌘+\\ 切换专注模式',
    tipAutosave: '输入自动保存,800ms debounce',
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
    showList: 'Show list',
    focusMode: 'Focus mode',
    words: 'words',
    chars: 'chars',
    minRead: 'min read',
    bodyEmpty: 'Empty',
    onboardingTitle: 'Start your first note',
    onboardingHint: 'Pick a template, or start with a blank note',
    templateDaily: "Today's log",
    templateIdea: 'Idea capture',
    templateMeeting: 'Meeting notes',
    templateBlank: 'Just start typing',
    recentSection: 'Or pick up where you left off',
    tipsTitle: 'Tips',
    tipShortcut: 'Press ⌘+\\ to toggle focus mode',
    tipAutosave: 'Edits auto-save (800ms debounce)',
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

export function NoteEditor({ noteId, language = 'en', className = '', layout = 'split', onToggleLayout, onCreateFromTemplate, onSelectNote }: NoteEditorProps) {
  const t = COPY[language];
  const q = useNote(noteId);
  const note = q.data?.note;
  const update = useUpdateNote();
  const archive = useArchiveNote();
  const backlinks = useNoteBacklinks(noteId);
  // Pull a small slice of recent notes so the empty-state card
  // can offer a "pick up where you left off" section — without it
  // the right pane is just the 4 template buttons floating in
  // ~700px of viewport whitespace on a 1080p screen.
  const recent = useNotes();
  const recentItems = (recent.data?.notes ?? [])
    .filter((n) => n.state !== 'archived' && n.id !== noteId && (n.body?.trim() || n.title))
    .slice(0, 3);

  // Local mirror of body and title. The hook drives persistence; this
  // is what the textarea reads/writes. We seed from the server fetch
  // and only re-seed on noteId change.
  const [body, setBody] = useState<string>(note?.body ?? '');
  const [title, setTitle] = useState<string>(note?.title ?? '');
  useEffect(() => {
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
    // No note selected — render a full-bleed onboarding composition
    // (headline, templates, recent notes, and tips) so the right pane
    // is useful without putting another step in front of an existing note.
    return (
      <div className={`flex flex-col h-full ${className}`} data-testid="note-editor-no-selection">
        <div className="flex-1 min-h-0 overflow-y-auto">
          <OnboardingPanel
            t={t}
            language={language}
            onCreateFromTemplate={onCreateFromTemplate}
            onSelectNote={onSelectNote}
            recentItems={recentItems}
            onJustStartTyping={() => onCreateFromTemplate?.('general', '')}
          />
        </div>
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
      {/* Title is optional — F-02A forbids blocking on a title.
          Header is two rows: (1) the title input, (2) the metadata /
          actions strip. Both rows fill the editor column left-aligned
          so the body below has the same writing footprint — no
          centered max-width island surrounded by dead space. */}
      <header className="pl-6 pr-8 pt-5 pb-2 flex flex-col gap-2 border-b border-border">
        <input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder={t.untitled}
          className="w-full bg-transparent text-2xl font-semibold text-text-heading outline-none placeholder:text-text-muted"
          data-testid="note-title"
        />
        <div className="w-full flex items-center justify-between gap-2 text-xs text-text-muted">
          <div className="flex items-center gap-2">
            {autosave.status !== 'idle' && (
              <Badge tone={statusTone(autosave.status)}>
                {statusCopy(autosave.status, language)}
              </Badge>
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
          </div>
          <div className="flex items-center gap-1">
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
            {onToggleLayout && (
              <button
                onClick={onToggleLayout}
                className={`px-2 py-1 border rounded inline-flex items-center justify-center transition-colors ${
                  layout === 'note'
                    ? 'border-accent text-accent bg-accent/5'
                    : 'border-border text-text-muted hover:text-text-heading hover:border-text-muted'
                }`}
                data-testid="note-toggle-layout"
                title={layout === 'note' ? t.showList : t.focusMode}
                aria-label={layout === 'note' ? t.showList : t.focusMode}
              >
                {layout === 'note' ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Once a note exists, always show the editor. Previously an empty
          newly-created note rendered the onboarding panel again, so
          "+ New note" appeared to do nothing and the user had to click
          a second "Just start typing" action. Templates belong to the
          no-selection state; a created note should be immediately writable. */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <textarea
          autoFocus
          value={body}
          onChange={(e) => onBodyChange(e.target.value)}
          placeholder={t.placeholder}
          className="w-full min-h-full pl-6 pr-8 py-6 bg-transparent text-lg text-text-heading placeholder:text-text-muted outline-none resize-none font-sans leading-loose"
          data-testid="note-body"
        />
      </div>

      {/* Statusbar — word/char/read stats, right-aligned to the
          editor column edge. The 'Last updated' cue used to live
          here but duplicated the header timestamp that we removed,
          so the strip now only carries live writing stats. */}
      <footer
        className="pl-6 pr-8 py-1.5 border-t border-border flex items-center justify-end gap-4 text-[11px] text-text-muted"
        data-testid="note-editor-statusbar"
      >
        <span data-testid="note-editor-words">
          {words === 0 ? t.bodyEmpty : `${words} ${t.words}`}
        </span>
        <span data-testid="note-editor-chars">
          {body.length} {t.chars}
        </span>
        <span data-testid="note-editor-read">
          ~{Math.max(1, Math.ceil(words / 200))} {t.minRead}
        </span>
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

/**
 * OnboardingPanel — the full-bleed empty state shown when no note is
 * selected (the first thing the user sees when they open the Notes tab).
 *
 * Once a note has been created, the real textarea replaces this panel
 * immediately—even if the note is blank.
 */
function OnboardingPanel({
  t,
  language,
  onCreateFromTemplate,
  onSelectNote,
  recentItems,
  onJustStartTyping,
}: {
  t: (typeof COPY)['en'];
  language: 'zh' | 'en';
  onCreateFromTemplate?: (kind: NoteKind, body: string) => void | Promise<void>;
  onSelectNote?: (id: string) => void;
  recentItems: { id: string; title?: string | null; body?: string | null; updatedAt: string }[];
  onJustStartTyping?: () => void;
}) {
  return (
    <div
      className="h-full flex flex-col gap-8 px-10 py-10"
      data-testid="note-onboarding"
    >
      <div className="flex flex-col items-start gap-5 w-full">
        <p className="text-5xl font-semibold text-text-heading leading-tight tracking-tight">
          {t.onboardingTitle}
        </p>
        <p className="text-lg text-text-muted">{t.onboardingHint}</p>
        {onCreateFromTemplate && (
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
            <button
              type="button"
              onClick={() => onCreateFromTemplate('daily', `# ${t.templateDaily}\n\n- \n- \n- \n`)}
              className="inline-flex items-center gap-2.5 px-4 py-3 rounded-lg border border-border bg-surface text-base text-text-heading hover:border-accent hover:text-accent transition-colors"
              data-testid="note-onboarding-template-daily"
            >
              <Calendar size={20} />
              <span className="font-medium">{t.templateDaily}</span>
            </button>
            <button
              type="button"
              onClick={() => onCreateFromTemplate('quick', `# ${t.templateIdea}\n\n`)}
              className="inline-flex items-center gap-2.5 px-4 py-3 rounded-lg border border-border bg-surface text-base text-text-heading hover:border-accent hover:text-accent transition-colors"
              data-testid="note-onboarding-template-idea"
            >
              <Lightbulb size={20} />
              <span className="font-medium">{t.templateIdea}</span>
            </button>
            <button
              type="button"
              onClick={() => onCreateFromTemplate('meeting', `# ${t.templateMeeting}\n\n**Date:**\n**Attendees:**\n\n## Agenda\n- \n\n## Notes\n\n## Action items\n- [ ] \n`)}
              className="inline-flex items-center gap-2.5 px-4 py-3 rounded-lg border border-border bg-surface text-base text-text-heading hover:border-accent hover:text-accent transition-colors"
              data-testid="note-onboarding-template-meeting"
            >
              <FileText size={20} />
              <span className="font-medium">{t.templateMeeting}</span>
            </button>
            <button
              type="button"
              onClick={onJustStartTyping}
              className="inline-flex items-center gap-2.5 px-4 py-3 rounded-lg border border-dashed border-border text-base text-text-muted hover:text-text-heading hover:border-text-muted transition-colors"
              data-testid="note-onboarding-blank"
            >
              <PenLine size={20} />
              <span className="font-medium">{t.templateBlank}</span>
            </button>
          </div>
        )}
      </div>

      {/* Recent notes — natural height, capped at 3 items. Hidden
          when there's nothing real to show (e.g. fresh workspace). */}
      {recentItems.length > 0 && (
        <div className="flex flex-col items-start gap-3 w-full">
          <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            {t.recentSection}
          </p>
          <ul className="w-full flex flex-col gap-1">
            {recentItems.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => onSelectNote?.(n.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left text-text-heading hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                  data-testid={`note-onboarding-recent-${n.id}`}
                >
                  <FileText size={16} className="shrink-0 text-text-muted" />
                  <span className="flex-1 truncate font-medium">
                    {n.title || (n.body?.split('\n')[0]?.slice(0, 60) || t.untitled)}
                  </span>
                  <span className="text-xs text-text-muted shrink-0">
                    {relativeTime(n.updatedAt, language)}
                  </span>
                  <ArrowRight size={14} className="text-text-muted shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Tips row — anchored at the bottom of the pane by the
          recent-notes flex-1 spacer above. Cards have a solid
          surface background so they're visible. */}
      <div className="flex flex-col items-start gap-3 w-full">
        <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          {t.tipsTitle}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
          <div className="px-4 py-3 rounded-lg border border-border bg-surface text-sm text-text-muted">
            <kbd className="font-mono text-xs px-1.5 py-0.5 rounded bg-background border border-border text-text-heading">
              {language === 'zh' ? '⌘+\\' : 'mod+\\'}
            </kbd>{' '}
            {t.tipShortcut}
          </div>
          <div className="px-4 py-3 rounded-lg border border-border bg-surface text-sm text-text-muted">
            {t.tipAutosave}
          </div>
        </div>
      </div>
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
