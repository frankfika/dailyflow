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
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Maximize2, Minimize2, FileText, Lightbulb, Calendar, ArrowRight, Trash2, Pencil, BookOpen, Tag, Link2, X } from 'lucide-react';
import { useNote, useNoteAutosave, useNoteBacklinks, useNotes, useDeleteNote, type AutosaveStatus } from '../hooks/useNotes';
import { Spinner, Badge } from '../components/States';
import { listCommitments, type Commitment, type NoteBacklinks, type NoteKind } from '../api/client';
import { relativeTime } from './relativeTime';
import { useWorkspaceScope } from '../../../workspaceScope';
import { queryKeys } from '../../../queryKeys';
import { MeetingNotePanel } from './MeetingNotePanel';

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
  /** Called after the active note is deleted or moved out of the current view. */
  onDeleted?: (id: string) => void;
  /** Optional app-level feedback for actions that navigate away. */
  onNotice?: (message: string, type?: 'success' | 'info' | 'error') => void;
}

const COPY = {
  zh: {
    placeholder: '开始写点什么…',
    untitled: '（无标题）',
    saving: '保存中…',
    saved: '已保存',
    conflict: '有冲突，刷新中…',
    error: '保存失败',
    localEditsKept: '本地修改仍保留在编辑器中。',
    empty: '选左边一篇笔记，或者新建一篇。',
    backlinks: '关联',
    kind: '类型',
    date: '日期',
    pinned: '置顶',
    archive: '归档',
    restore: '恢复',
    delete: '删除笔记',
    deleteConfirm: '确定永久删除这篇笔记吗？相关证据引用也会一并移除。',
    showList: '显示列表',
    focusMode: '专注模式',
    words: '字',
    chars: '字符',
    minRead: '分钟阅读',
    bodyEmpty: '空白',
    onboardingTitle: '开始你的第一篇笔记',
    onboardingHint: '挑一个模板，或用左侧“新建笔记”打开空白页',
    templateDaily: '今日记录',
    templateIdea: '想法捕捉',
    templateMeeting: '会议纪要',
    templateBlank: '直接开始写',
    recentSection: '或继续编辑',
    tipsTitle: '小贴士',
    tipShortcut: '按 ⌘+\\ 切换专注模式',
    tipAutosave: '输入自动保存,800ms debounce',
    edit: '编辑',
    preview: '预览',
    tags: '标签',
    addTag: '输入标签后回车',
    linkedTasks: '关联任务',
    linkTask: '关联一个任务…',
    noTasks: '暂无可关联任务',
    removeTag: '移除标签',
    unlinkTask: '取消关联任务',
    emptyPreview: '还没有可预览的 Markdown 内容。',
  },
  en: {
    placeholder: 'Start writing…',
    untitled: '(untitled)',
    saving: 'Saving…',
    saved: 'Saved',
    conflict: 'Resolving conflict…',
    error: 'Save failed',
    localEditsKept: 'Your local edits remain in the editor.',
    empty: 'Pick a note from the left, or start a new one.',
    backlinks: 'Backlinks',
    kind: 'Kind',
    date: 'Date',
    pinned: 'Pinned',
    archive: 'Archive',
    restore: 'Restore',
    delete: 'Delete note',
    deleteConfirm: 'Permanently delete this note? Its evidence references will also be removed.',
    showList: 'Show list',
    focusMode: 'Focus mode',
    words: 'words',
    chars: 'chars',
    minRead: 'min read',
    bodyEmpty: 'Empty',
    onboardingTitle: 'Start your first note',
    onboardingHint: 'Pick a template, or use “Add note” for a blank page',
    templateDaily: "Today's log",
    templateIdea: 'Idea capture',
    templateMeeting: 'Meeting notes',
    templateBlank: 'Just start typing',
    recentSection: 'Or pick up where you left off',
    tipsTitle: 'Tips',
    tipShortcut: 'Press ⌘+\\ to toggle focus mode',
    tipAutosave: 'Edits auto-save (800ms debounce)',
    edit: 'Edit',
    preview: 'Preview',
    tags: 'Tags',
    addTag: 'Type a tag and press Enter',
    linkedTasks: 'Linked tasks',
    linkTask: 'Link a task…',
    noTasks: 'No tasks available',
    removeTag: 'Remove tag',
    unlinkTask: 'Unlink task',
    emptyPreview: 'There is no Markdown content to preview yet.',
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

export function NoteEditor({ noteId, language = 'en', className = '', layout = 'split', onToggleLayout, onCreateFromTemplate, onSelectNote, onDeleted, onNotice }: NoteEditorProps) {
  const t = COPY[language];
  const workspaceId = useWorkspaceScope();
  const queryClient = useQueryClient();
  const q = useNote(noteId);
  const note = q.data?.note;
  const del = useDeleteNote();
  const backlinks = useNoteBacklinks(noteId);
  // Pull a small slice of recent notes so the empty-state card
  // can offer a "pick up where you left off" section — without it
  // the right pane is just the 4 template buttons floating in
  // ~700px of viewport whitespace on a 1080p screen.
  const recent = useNotes();
  const commitments = useQuery({
    queryKey: queryKeys.commitments(workspaceId),
    queryFn: () => listCommitments(),
    staleTime: 30_000,
    enabled: Boolean(noteId),
  });
  const commitmentById = useMemo(
    () => new Map((commitments.data?.items ?? []).map((item) => [item.id, item])),
    [commitments.data?.items],
  );
  const recentItems = (recent.data?.notes ?? [])
    .filter((n) => n.state !== 'archived' && n.id !== noteId && (n.body?.trim() || n.title))
    .slice(0, 3);

  // Local mirror of body and title. The hook drives persistence; this
  // is what the textarea reads/writes. We seed from the server fetch
  // and only re-seed on noteId change.
  const [body, setBody] = useState<string>(note?.body ?? '');
  const [title, setTitle] = useState<string>(note?.title ?? '');
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');
  const [tagDraft, setTagDraft] = useState('');
  const seededNoteIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!note) {
      if (!noteId) seededNoteIdRef.current = null;
      return;
    }
    if (seededNoteIdRef.current === note.id) return;
    seededNoteIdRef.current = note.id;
    setBody(note.body ?? '');
    setTitle(note.title ?? '');
    setViewMode('edit');
    setTagDraft('');
  }, [note, noteId]);

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
  const latestFlushRef = useRef(autosave.flush);
  useEffect(() => {
    latestFlushRef.current = autosave.flush;
  }, [autosave.flush]);
  useEffect(() => {
    return () => {
      // Fire-and-forget; the editor is going away and we want the
      // server to receive the last keystroke.
      latestFlushRef.current().catch(() => undefined);
    };
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
  const deleteCurrentNote = async () => {
    if (!confirm(t.deleteConfirm)) return;
    const saved = await autosave.flush();
    if (!saved) return;
    await del.mutateAsync(note.id);
    onDeleted?.(note.id);
  };
  const saveMetadata = async (patch: Parameters<typeof autosave.schedule>[0]) => {
    autosave.schedule(patch);
    return autosave.flush();
  };
  const toggleArchived = async () => {
    // Queue the state change with any unsaved title/body edits. A single
    // versioned PATCH then persists the complete latest note before the
    // current view releases its selection.
    const saved = await saveMetadata({
      state: note.state === 'archived' ? 'active' : 'archived',
    });
    if (saved) {
      onNotice?.(
        note.state === 'archived'
          ? (language === 'zh' ? '笔记已恢复' : 'Note restored')
          : (language === 'zh' ? '笔记已归档，可在“归档”中找回' : 'Note archived — find it in Archived'),
        'success',
      );
      onDeleted?.(note.id);
    }
  };
  const tags = note.tagIds ?? [];
  const linkedCommitmentIds = note.commitmentIds ?? [];
  const availableCommitments = (commitments.data?.items ?? []).filter(
    (item) => !linkedCommitmentIds.includes(item.id),
  );
  const addTag = async () => {
    const value = tagDraft.trim().replace(/^#/, '');
    if (!value || tags.includes(value)) {
      setTagDraft('');
      return;
    }
    setTagDraft('');
    await saveMetadata({ tagIds: [...tags, value] });
  };
  const onTagKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' && event.key !== ',') return;
    event.preventDefault();
    void addTag();
  };
  const insertTranscriptIntoNote = async (text: string) => {
    const transcript = text.trim();
    if (!transcript) return;
    setViewMode('edit');
    if (body.includes(transcript)) return;
    const heading = language === 'zh' ? '## 录音转写' : '## Recording transcript';
    const nextBody = body.trim()
      ? `${body.trimEnd()}\n\n${heading}\n\n${transcript}\n`
      : `${heading}\n\n${transcript}\n`;
    setBody(nextBody);
    autosave.schedule({ body: nextBody });
    await autosave.flush();
  };

  return (
    <div className={`flex flex-col h-full ${className}`} data-testid="note-editor">
      {/* Title is optional — F-02A forbids blocking on a title.
          Header is two rows: (1) the title input, (2) the metadata /
          actions strip. Both rows fill the editor column left-aligned
          so the body below has the same writing footprint — no
          centered max-width island surrounded by dead space. */}
      <header className="flex flex-col gap-2 border-b border-border px-4 pb-2 pt-4 sm:pl-6 sm:pr-8 sm:pt-5">
        <input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder={t.untitled}
          className="w-full bg-transparent text-xl font-semibold text-text-heading outline-none placeholder:text-text-muted sm:text-2xl"
          data-testid="note-title"
        />
        <div className="w-full flex flex-wrap items-center justify-between gap-2 text-xs text-text-muted">
          <div className="flex flex-wrap items-center gap-2">
            {autosave.status !== 'idle' && (
              <Badge tone={statusTone(autosave.status)}>
                {statusCopy(autosave.status, language)}
              </Badge>
            )}
            {autosave.lastError && (
              <span
                className="text-xs text-danger"
                role="alert"
                title={autosave.lastError}
              >
                {language === 'zh'
                  ? `${autosave.status === 'conflict' ? t.conflict : t.error}，${t.localEditsKept}`
                  : autosave.lastError}
              </span>
            )}
            <select
              aria-label={language === 'zh' ? '笔记类型' : 'Note type'}
              value={note.kind}
              onChange={(e) => void saveMetadata({ kind: e.target.value as typeof note.kind })}
              className="min-h-[44px] rounded border border-border bg-transparent px-2 text-base sm:min-h-0 sm:px-1.5 sm:py-0.5 sm:text-xs"
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
              aria-label={language === 'zh' ? '笔记日期' : 'Note date'}
              value={note.date ?? ''}
              onChange={(e) => void saveMetadata({ date: e.target.value || null })}
              className="min-h-[44px] rounded border border-border bg-transparent px-2 text-base sm:min-h-0 sm:px-1.5 sm:py-0.5 sm:text-xs"
              data-testid="note-date"
            />
          </div>
          <div className="flex items-center gap-1">
            <div
              className="inline-flex items-center rounded-md border border-border bg-background/60 p-0.5"
              role="group"
              aria-label={language === 'zh' ? '笔记显示方式' : 'Note display mode'}
            >
              <button
                type="button"
                onClick={() => setViewMode('edit')}
                className={`inline-flex min-h-[44px] items-center gap-1 rounded px-3 py-1 transition-colors sm:min-h-0 sm:px-2 ${
                  viewMode === 'edit' ? 'bg-surface-elevated text-text-heading shadow-sm' : 'text-text-muted'
                }`}
                data-testid="note-mode-edit"
                aria-pressed={viewMode === 'edit'}
              >
                <Pencil size={12} />
                {t.edit}
              </button>
              <button
                type="button"
                onClick={() => setViewMode('preview')}
                className={`inline-flex min-h-[44px] items-center gap-1 rounded px-3 py-1 transition-colors sm:min-h-0 sm:px-2 ${
                  viewMode === 'preview' ? 'bg-surface-elevated text-text-heading shadow-sm' : 'text-text-muted'
                }`}
                data-testid="note-mode-preview"
                aria-pressed={viewMode === 'preview'}
              >
                <BookOpen size={12} />
                {t.preview}
              </button>
            </div>
            <button
              onClick={() => void saveMetadata({ pinned: !note.pinned })}
              className={`min-h-[44px] min-w-[44px] rounded border px-2 py-0.5 sm:min-h-0 sm:min-w-0 sm:px-1.5 ${
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
              onClick={() => void toggleArchived()}
              disabled={autosave.status === 'saving'}
              className="min-h-[44px] rounded border border-border px-3 py-0.5 text-text-muted sm:min-h-0 sm:px-1.5"
              data-testid={note.state === 'archived' ? 'note-restore' : 'note-archive'}
              aria-label={note.state === 'archived' ? t.restore : t.archive}
              title={note.state === 'archived' ? t.restore : t.archive}
            >
              {note.state === 'archived' ? t.restore : t.archive}
            </button>
            <button
              onClick={deleteCurrentNote}
              disabled={del.isPending}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded border border-border p-1 text-text-muted transition-colors hover:border-red-200 hover:bg-red-50 hover:text-danger disabled:opacity-40 sm:min-h-0 sm:min-w-0"
              data-testid="note-delete"
              title={t.delete}
              aria-label={t.delete}
            >
              <Trash2 size={14} />
            </button>
            {onToggleLayout && (
              <button
                onClick={onToggleLayout}
                className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded border px-2 py-1 transition-colors sm:min-h-0 sm:min-w-0 ${
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
        <div className="flex flex-col gap-2 border-t border-border/70 pt-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5" data-testid="note-tags">
            <span className="mr-1 inline-flex items-center gap-1 text-[11px] font-medium text-text-muted">
              <Tag size={12} />
              {t.tags}
            </span>
            {tags.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-1 rounded-full border border-accent/15 bg-accent/5 px-2 py-0.5 text-[11px] text-accent">
                #{tag}
                <button
                  type="button"
                  onClick={() => void saveMetadata({ tagIds: tags.filter((item) => item !== tag) })}
                  className="rounded-full p-0.5 hover:bg-accent/10"
                  aria-label={`${t.removeTag} ${tag}`}
                >
                  <X size={10} />
                </button>
              </span>
            ))}
            <input
              value={tagDraft}
              onChange={(event) => setTagDraft(event.target.value)}
              onKeyDown={onTagKeyDown}
              onBlur={() => void addTag()}
              placeholder={tags.length === 0 ? t.addTag : '+ tag'}
              className="min-w-32 flex-1 bg-transparent py-0.5 text-[11px] text-text-heading outline-none placeholder:text-text-muted"
              data-testid="note-tag-input"
            />
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5" data-testid="note-linked-tasks">
            <span className="mr-1 inline-flex items-center gap-1 text-[11px] font-medium text-text-muted">
              <Link2 size={12} />
              {t.linkedTasks}
            </span>
            {linkedCommitmentIds.map((id) => {
              const task = commitmentById.get(id);
              return (
                <LinkedTaskChip
                  key={id}
                  id={id}
                  task={task}
                  unlinkLabel={t.unlinkTask}
                  onRemove={() => void saveMetadata({
                    commitmentIds: linkedCommitmentIds.filter((item) => item !== id),
                  })}
                />
              );
            })}
            <select
              value=""
              onChange={(event) => {
                const id = event.target.value;
                if (id) void saveMetadata({ commitmentIds: [...linkedCommitmentIds, id] });
              }}
              className="min-w-36 flex-1 bg-transparent py-0.5 text-[11px] text-text-muted outline-none"
              aria-label={t.linkTask}
              data-testid="note-task-picker"
            >
              <option value="">{commitments.isLoading ? '…' : availableCommitments.length ? t.linkTask : t.noTasks}</option>
              {availableCommitments.map((item) => (
                <option key={item.id} value={item.id}>{item.title}</option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {note.kind === 'meeting' && (
        <div className="shrink-0 border-b border-border px-4 py-3 sm:px-6">
          <MeetingNotePanel
            key={note.id}
            note={note}
            language={language}
            onNoteUpdated={(updated) => {
              queryClient.setQueryData(
                queryKeys.note(workspaceId, updated.id),
                { note: updated },
              );
              void queryClient.invalidateQueries({ queryKey: queryKeys.notesRoot(workspaceId) });
              void queryClient.invalidateQueries({ queryKey: queryKeys.inbox(workspaceId) });
            }}
            onInsertTranscript={insertTranscriptIntoNote}
          />
        </div>
      )}

      {/* Once a note exists, always show the editor. Previously an empty
          newly-created note rendered the onboarding panel again, so
          "+ New note" appeared to do nothing and the user had to click
          a second "Just start typing" action. Templates belong to the
          no-selection state; a created note should be immediately writable. */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {viewMode === 'edit' ? (
          <div className="grid min-h-full grid-cols-1 gap-0 xl:grid-cols-2">
            <textarea
              autoFocus
              value={body}
              onChange={(e) => onBodyChange(e.target.value)}
              placeholder={t.placeholder}
              className="min-h-[22rem] w-full resize-none border-b border-border/70 bg-transparent px-4 py-6 text-base leading-loose text-text-heading outline-none placeholder:text-text-muted sm:pl-6 sm:pr-8 sm:text-lg xl:min-h-full xl:border-b-0 xl:border-r"
              data-testid="note-body"
            />
            <article className="note-markdown min-h-[14rem] overflow-y-auto px-4 py-6 text-text-heading sm:pl-6 sm:pr-8" data-testid="note-live-preview">
              {body.trim() ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
              ) : (
                <p className="text-sm text-text-muted">{t.emptyPreview}</p>
              )}
            </article>
          </div>
        ) : (
          <article className="note-markdown min-h-full pl-6 pr-8 py-6 text-text-heading" data-testid="note-markdown-preview">
            {body.trim() ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
            ) : (
              <p className="text-sm text-text-muted">{t.emptyPreview}</p>
            )}
          </article>
        )}
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

function LinkedTaskChip({
  id,
  task,
  unlinkLabel,
  onRemove,
}: {
  id: string;
  task?: Commitment;
  unlinkLabel: string;
  onRemove: () => void;
}) {
  return (
    <span
      className="inline-flex max-w-64 items-center gap-1 rounded-full border border-border bg-surface-elevated px-2 py-0.5 text-[11px] text-text-heading"
      title={task?.title ?? id}
    >
      <span className="truncate">{task?.title ?? id}</span>
      {task?.state && (
        <span className="shrink-0 text-[9px] uppercase tracking-wide text-text-muted">
          {task.state}
        </span>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 rounded-full p-0.5 text-text-muted hover:bg-black/5 hover:text-text-heading dark:hover:bg-white/10"
        aria-label={`${unlinkLabel}: ${task?.title ?? id}`}
      >
        <X size={10} />
      </button>
    </span>
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
}: {
  t: (typeof COPY)['en'];
  language: 'zh' | 'en';
  onCreateFromTemplate?: (kind: NoteKind, body: string) => void | Promise<void>;
  onSelectNote?: (id: string) => void;
  recentItems: { id: string; title?: string | null; body?: string | null; updatedAt: string }[];
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
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-3 w-full">
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
