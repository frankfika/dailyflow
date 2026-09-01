/**
 * NoteDocument list — the Notes tab in the v2 main app.
 *
 * Spec §7.3: Notes is the only entry for the user's working surface.
 * The list groups by "view" (Inbox / Recent / Daily / Meetings /
 * Projects / Favorites) using a small pill row. F-02A forbids
 * forcing the user to pick a kind or date before they can write —
 * the empty state offers an "Untitled note" button that calls the
 * backend immediately and opens the editor.
 *
 * Focus mode (1.1.4): the list collapses to a 56px icon strip. The
 * strip caps the visible dots at 12 so the user isn't drowned in
 * vertical scroll when they have 16+ notes; the rest are folded
 * into a single "N+" placeholder that switches back to the list
 * view on click. A pair of top/bottom fade gradients plus an
 * IntersectionObserver cue scrollability, and a hover tooltip
 * (200ms delay, portaled to the right) reminds the user which dot
 * is which.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { useNotes, useCreateNote, useSetNoteArchived, useDeleteNote } from '../hooks/useNotes';
import type { NoteDocument, NoteKind } from '../api/client';
import { Button, EmptyState, Spinner } from '../components/States';
import { Archive, ArchiveRestore, ChevronLeft, FilePlus2, Mic, Minimize2, Search, Star, Trash2 } from 'lucide-react';
import { relativeTime } from './relativeTime';

type ViewKey = 'all' | 'recent' | 'daily' | 'meeting' | 'project' | 'pinned' | 'archived';

const VIEW_LABELS: Record<ViewKey, { en: string; zh: string }> = {
  all: { en: 'All', zh: '全部' },
  recent: { en: 'Recent', zh: '最近' },
  daily: { en: 'Daily', zh: '每日' },
  meeting: { en: 'Meetings', zh: '会议' },
  project: { en: 'Projects', zh: '项目' },
  pinned: { en: 'Pinned', zh: '置顶' },
  archived: { en: 'Archived', zh: '归档' },
};

/** Max notes shown in the focus-mode strip before the "N+" overflow. */
const STRIP_MAX_NOTES = 11;
/** Delay before the hover preview shows, in ms. Long enough to avoid flicker. */
const STRIP_HOVER_DELAY_MS = 200;

function inferTitle(n: NoteDocument): string {
  if (n.title) return n.title;
  const first = n.body?.split('\n').find((l) => l.trim().length > 0) ?? '';
  return first.replace(/^#+\s*/, '').slice(0, 80) || '(untitled)';
}

function inferGlyph(n: NoteDocument): string {
  // First non-empty, non-heading character of the title or body. Used
  // as a one-character avatar when the list is collapsed to a strip
  // (so the user can still tell notes apart at a glance).
  const text = inferTitle(n);
  const ch = text.trim().charAt(0).toUpperCase();
  return ch || '·';
}

function previewBody(n: NoteDocument): string {
  const lines = n.body?.split('\n').filter((l) => l.trim().length > 0) ?? [];
  return lines.slice(0, 2).join(' ').slice(0, 140);
}

export interface NoteListProps {
  /** Currently-selected note id; the list highlights it. */
  selectedId?: string | null;
  /** When the user picks a note, this is called. */
  onSelect: (id: string | null) => void;
  /** Layout mode from the parent. `note` collapses the list to a 56px icon strip. */
  layout?: 'split' | 'note';
  /** Toggle between `split` and `note`. The list shows a small button when not collapsed. */
  onToggleLayout?: () => void;
  /** UI language for relative-time copy. Defaults to English. */
  language?: 'zh' | 'en';
  /** Keeps the app-level sidebar reveal button clear of Notes controls. */
  sidebarOpen?: boolean;
  /** Desktop opens the newest note automatically; mobile keeps the list visible until tapped. */
  autoSelectFirst?: boolean;
  /** App-level feedback for archive/restore actions. */
  onNotice?: (message: string, type?: 'success' | 'info' | 'error') => void;
}

export function NoteList({
  selectedId,
  onSelect,
  layout = 'split',
  onToggleLayout,
  language = 'en',
  sidebarOpen = true,
  autoSelectFirst = true,
  onNotice,
}: NoteListProps) {
  const [view, setView] = useState<ViewKey>('all');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const create = useCreateNote();
  const setArchived = useSetNoteArchived();
  const del = useDeleteNote();
  const lastArchiveNoticeRef = useRef<string | null>(null);

  useEffect(() => {
    const result = setArchived.data?.note;
    if (!setArchived.isSuccess || !result) return;
    const key = `${result.id}:${result.state}:${result.autoSaveVersion}`;
    if (lastArchiveNoticeRef.current === key) return;
    lastArchiveNoticeRef.current = key;
    onNotice?.(
      result.state === 'archived'
        ? (language === 'zh' ? '笔记已归档，可在“归档”中找回' : 'Note archived — find it in Archived')
        : (language === 'zh' ? '笔记已恢复' : 'Note restored'),
      'success',
    );
  }, [language, onNotice, setArchived.data, setArchived.isSuccess]);

  // Fetch all working notes (active + draft) and bucket client-side.
  // New notes intentionally start as drafts; querying only `active` made a
  // freshly-created note vanish from the list immediately and after reload.
  const all = useNotes(view === 'archived' ? { state: 'archived' } : {});
  const items = (all.data?.notes ?? []).filter(
    (note) => view === 'archived' || note.state !== 'archived',
  );

  const availableTags = useMemo(
    () =>
      Array.from(
        new Set(
          items.flatMap((note) =>
            (note.tagIds ?? []).map((tag) => tag.trim()).filter(Boolean),
          ),
        ),
      ).sort((a, b) => a.localeCompare(b, language)),
    [items, language],
  );

  const filtered = useMemo(() => {
    const cutoff = Date.now() - 7 * 86_400_000;
    const byKind: Record<ViewKey, (n: NoteDocument) => boolean> = {
      all: () => true,
      recent: (n) => new Date(n.updatedAt).getTime() >= cutoff,
      daily: (n) => n.kind === 'daily',
      meeting: (n) => n.kind === 'meeting',
      project: (n) => n.kind === 'project',
      pinned: (n) => n.pinned,
      archived: () => true,
    };
    const needle = query.trim().toLocaleLowerCase(language);
    return items.filter((note) => {
      const searchable = `${inferTitle(note)}\n${note.body ?? ''}\n${(note.tagIds ?? []).join(' ')}`
        .toLocaleLowerCase(language);
      return byKind[view](note)
        && (tagFilter === null || (note.tagIds ?? []).includes(tagFilter))
        && (!needle || searchable.includes(needle));
    });
  }, [items, language, query, tagFilter, view]);

  // Archived and active notes come from separate queries. If switching
  // between those views removes the selected tag from the available
  // choices, return to the unfiltered list rather than keeping an
  // invisible stale filter active.
  useEffect(() => {
    if (tagFilter !== null && !availableTags.includes(tagFilter)) {
      setTagFilter(null);
    }
  }, [availableTags, tagFilter]);

  // A notes app should open directly into the most relevant document.
  // Keep the selection valid as data/views change instead of leaving a
  // populated list beside an onboarding panel that requires another click.
  useEffect(() => {
    if (filtered.length === 0) {
      if (selectedId) onSelect(null);
      return;
    }
    // Do not replace a fresh selection merely because the list query has
    // not incorporated a newly-created note yet.
    if (!selectedId && !autoSelectFirst) return;
    if (!selectedId || !filtered.some(note => note.id === selectedId)) {
      onSelect(filtered[0].id);
    }
  }, [autoSelectFirst, filtered, onSelect, selectedId]);

  const createAndOpen = async (kind: NoteKind = 'general') => {
    const { note } = await create.mutateAsync({
      body: '',
      kind,
      state: 'draft',
    });
    onSelect(note.id);
  };

  const createMeetingAndOpen = async () => {
    const { note } = await create.mutateAsync({
      body: '',
      kind: 'meeting',
      state: 'draft',
    });
    onSelect(note.id);
    onNotice?.(language === 'zh' ? '会议笔记已创建，下面可以开始录音' : 'Meeting note ready — start recording below', 'info');
  };

  // Collapsed: just an icon strip. Each note is a single character
  // avatar; the active one is highlighted. Click to switch.
  if (layout === 'note') {
    return (
      <FocusStrip
        notes={filtered}
        selectedId={selectedId ?? null}
        onSelect={(id) => onSelect(id)}
        onCreate={() => createAndOpen('general')}
        onToggleLayout={onToggleLayout}
        reserveSidebarToggleSpace={!sidebarOpen}
      />
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface/30">
      <header className={`flex items-center justify-between px-4 pb-3 pt-4 ${sidebarOpen ? '' : 'pl-12'}`}>
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight text-text-heading">
            {language === 'zh' ? '笔记' : 'Notes'}
          </h2>
          <p className="mt-0.5 text-[12px] text-text-muted">
            {items.length} {language === 'zh' ? '篇' : items.length === 1 ? 'note' : 'notes'}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {onToggleLayout && (
            <button
              onClick={onToggleLayout}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-black/5 hover:text-text-heading dark:hover:bg-white/10"
              title="Hide list (focus on the editor)"
              data-testid="notes-hide-list"
              aria-label="Hide list"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            disabled={create.isPending}
            onClick={() => createAndOpen('general')}
            data-testid="notes-new"
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-accent px-2.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            aria-label={language === 'zh' ? '+ 新建笔记' : '+ Add note'}
            title={language === 'zh' ? '新建笔记' : 'New note'}
          >
            <FilePlus2 className="h-4 w-4" />
            <span>{language === 'zh' ? '新建' : 'New'}</span>
          </button>
        </div>
      </header>

      <div className="px-3 pb-2">
        <label className="flex h-9 items-center gap-2 rounded-lg border border-border bg-background/70 px-2.5 text-text-muted shadow-[0_1px_2px_rgba(0,0,0,0.02)] focus-within:border-border-strong focus-within:text-text-secondary">
          <Search className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={language === 'zh' ? '搜索笔记…' : 'Search notes…'}
            aria-label={language === 'zh' ? '搜索笔记' : 'Search notes'}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-text-heading outline-none placeholder:text-text-muted"
            data-testid="notes-search"
          />
        </label>
      </div>

      <div className="flex items-center gap-1 px-3 pb-2" role="tablist" aria-label="Note view">
        {(['all', 'recent', 'meeting', 'pinned'] as ViewKey[]).map((key) => (
          <button key={key} role="tab" aria-selected={view === key} onClick={() => setView(key)}
            className={`rounded-md px-2 py-1 text-[12px] font-medium transition-colors ${view === key ? 'bg-black/[0.06] text-text-heading dark:bg-white/10' : 'text-text-muted hover:text-text-heading'}`}
            data-testid={`notes-view-${key}`}>
            {key === 'pinned' ? <Star className="h-3 w-3" aria-label={VIEW_LABELS[key][language]} /> : VIEW_LABELS[key][language]}
          </button>
        ))}
        <select
          value={['daily', 'project', 'archived'].includes(view) ? view : ''}
          onChange={(event) => event.target.value && setView(event.target.value as ViewKey)}
          aria-label={language === 'zh' ? '更多笔记视图' : 'More note views'}
          className="ml-auto max-w-20 bg-transparent text-[12px] text-text-muted outline-none"
          data-testid="notes-view-more"
        >
          <option value="">{language === 'zh' ? '更多' : 'More'}</option>
          <option value="daily">{VIEW_LABELS.daily[language]}</option>
          <option value="project">{VIEW_LABELS.project[language]}</option>
          <option value="archived">{VIEW_LABELS.archived[language]}</option>
        </select>
      </div>

      <div className="px-3 pb-3">
        <button type="button" onClick={() => void createMeetingAndOpen()} disabled={create.isPending}
          data-testid="notes-new-meeting"
          className="flex w-full items-center gap-2 rounded-lg border border-border bg-background/60 px-2.5 py-2 text-left text-xs font-medium text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-heading disabled:opacity-40">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-red-50 text-red-600 dark:bg-red-950/30">
            <Mic className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block">{language === 'zh' ? '会议笔记' : 'Meeting note'}</span>
            <span className="block truncate text-[11px] font-normal text-text-muted">
              {language === 'zh' ? '录音无需 AI · 自动转写需先配置' : 'record without AI · set up auto-transcription first'}
            </span>
          </span>
        </button>
      </div>

      {availableTags.length > 0 && (
        <div
          className="flex shrink-0 items-center gap-1 overflow-x-auto pb-0.5"
          role="group"
          aria-label={language === 'zh' ? '按标签筛选' : 'Filter by tag'}
          data-testid="notes-tag-filter"
        >
          <button
            type="button"
            aria-pressed={tagFilter === null}
            onClick={() => setTagFilter(null)}
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[12px] transition-colors ${
              tagFilter === null
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border text-text-muted hover:text-text-heading'
            }`}
          >
            {language === 'zh' ? '全部标签' : 'All tags'}
          </button>
          {availableTags.map((tag) => (
            <button
              key={tag}
              type="button"
              aria-pressed={tagFilter === tag}
              onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
              className={`shrink-0 rounded-full border px-2 py-0.5 text-[12px] transition-colors ${
                tagFilter === tag
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border text-text-muted hover:text-text-heading'
              }`}
              data-testid={`notes-tag-filter-${tag}`}
            >
              #{tag}
            </button>
          ))}
        </div>
      )}

      {setArchived.error && (
        <p className="text-xs text-danger" role="alert">
          {language === 'zh'
            ? '笔记状态更新失败，请重试。'
            : 'Could not update the note. Please try again.'}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-border/70 px-2 py-2" data-testid="notes-list">
        {all.isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : all.error ? (
          <ErrorState onRetry={() => all.refetch()} />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={language === 'zh' ? '还没有笔记' : 'No notes yet'}
            body={
              language === 'zh'
                ? '使用右上角“新建笔记”，或者从右侧选择一个模板。'
                : 'Use “Add note” above, or choose a template on the right.'
            }
          />
        ) : (
          <ul className="flex flex-col gap-0.5">
            {filtered.map((n) => {
              const title = inferTitle(n);
              const preview = previewBody(n);
              const isSelected = n.id === selectedId;
              return (
                <li key={n.id}>
                  <div className={`group relative overflow-hidden rounded-lg transition-colors ${isSelected ? 'bg-black/[0.055] dark:bg-white/10' : 'bg-transparent hover:bg-black/[0.03] dark:hover:bg-white/5'}`}>
                    {isSelected && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent" aria-hidden="true" />}
                    <button
                      onClick={() => onSelect(n.id)}
                      className="w-full cursor-pointer px-3 py-2.5 pr-14 text-left"
                      data-testid={`notes-item-${n.id}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-text-heading truncate">{title}</span>
                        <span className="text-[12px] text-text-muted shrink-0">
                          {relativeTime(n.updatedAt, language)}
                        </span>
                      </div>
                      {preview && (
                        <p className="mt-1 text-xs text-text-muted line-clamp-2">{preview}</p>
                      )}
                      {(n.tagIds?.length ?? 0) > 0 && (
                        <div
                          className="mt-2 flex flex-wrap gap-1"
                          data-testid={`notes-item-tags-${n.id}`}
                        >
                          {n.tagIds?.map((tag) => (
                            <span
                              key={tag}
                              className="max-w-full truncate rounded-full bg-accent/10 px-1.5 py-0.5 text-[11px] text-accent"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-text-muted">
                        <span>{VIEW_LABELS[n.kind === 'meeting' ? 'meeting' : n.kind === 'daily' ? 'daily' : n.kind === 'project' ? 'project' : 'all'][language]}</span>
                        {n.pinned && <span>· ★</span>}
                      </div>
                    </button>
                    <div className={`absolute bottom-2.5 right-2 flex items-center gap-0.5 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}>
                      {n.state === 'archived' ? (
                        <button
                          onClick={() => setArchived.mutate({
                            id: n.id,
                            archived: false,
                            expectedAutoSaveVersion: n.autoSaveVersion,
                          })}
                          disabled={setArchived.isPending}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-black/5 hover:text-text-heading disabled:opacity-40"
                          title={language === 'zh' ? '恢复' : 'Restore'}
                          aria-label={`${language === 'zh' ? '恢复' : 'Restore'} ${title}`}
                        >
                          <ArchiveRestore className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      ) : (
                        <button
                          onClick={() => setArchived.mutate({
                            id: n.id,
                            archived: true,
                            expectedAutoSaveVersion: n.autoSaveVersion,
                          })}
                          disabled={setArchived.isPending}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-black/5 hover:text-text-heading disabled:opacity-40"
                          title={language === 'zh' ? '归档' : 'Archive'}
                          aria-label={`${language === 'zh' ? '归档' : 'Archive'} ${title}`}
                        >
                          <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      )}
                      {!isSelected && (
                        <button
                          onClick={() => {
                            if (confirm('Delete this note? This also removes its evidence.')) {
                              del.mutate(n.id);
                            }
                          }}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-red-50 hover:text-danger"
                          title="Delete"
                          aria-label={`Delete ${title}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="text-center py-8">
      <p className="text-sm text-text-muted">Couldn't load notes.</p>
      <Button className="mt-3" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

/* -----------------------------------------------------------------------
   FocusStrip — the 1.1.4 redesigned focus-mode icon strip.

   Visual rules:
   - "+" new note at top of the scrollable area (always reachable).
   - Up to STRIP_MAX_NOTES (11) dots, single-character glyphs.
   - If the selected note is past the visible window, swap it in for
     the last visible dot so the user always sees their current note.
   - If there are still hidden notes, render a single "N+" placeholder
     that opens the list view on click.
   - Top/bottom fade gradients appear when the list scrolls; the IO
     hides them once the first/last dot is fully visible.
   - Hover a dot for 200ms to see the title + first body line in a
     portaled tooltip.
   - Selected dot scales up + gets a stronger ring.

   Server contract is unchanged — FocusStrip is pure presentation.
   ----------------------------------------------------------------------- */

interface FocusStripProps {
  notes: NoteDocument[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onToggleLayout?: () => void;
  reserveSidebarToggleSpace?: boolean;
}

interface VisibleSlice {
  /** Notes to render as dots, in display order. */
  shown: NoteDocument[];
  /** Number of notes folded into the "N+" placeholder. */
  hiddenCount: number;
}

function useVisibleStrip(notes: NoteDocument[], selectedId: string | null, max: number): VisibleSlice {
  return useMemo(() => {
    if (notes.length <= max) {
      return { shown: notes, hiddenCount: 0 };
    }
    const top = notes.slice(0, max);
    const topIds = new Set(top.map((n) => n.id));
    if (selectedId && !topIds.has(selectedId)) {
      const sel = notes.find((n) => n.id === selectedId);
      if (sel) {
        // Drop the last of the top window and slot the selected in
        // so the user can always see what they're editing.
        return { shown: [...top.slice(0, max - 1), sel], hiddenCount: notes.length - max };
      }
    }
    return { shown: top, hiddenCount: notes.length - max };
  }, [notes, selectedId, max]);
}

function FocusStrip({
  notes,
  selectedId,
  onSelect,
  onCreate,
  onToggleLayout,
  reserveSidebarToggleSpace = false,
}: FocusStripProps) {
  const { shown: cappedShown, hiddenCount } = useVisibleStrip(notes, selectedId, STRIP_MAX_NOTES);

  // Expanded view (1.1.8 polish): when the user clicks the "N+"
  // indicator we drop the cap and render every note as a dot, letting
  // them scroll within the strip to find the one they want. The cap
  // snaps back the moment the selected note changes so we never render
  // more than the cap "at rest".
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? notes : cappedShown;
  const activeHiddenCount = expanded ? 0 : hiddenCount;

  // Refs for scroll-into-view + IntersectionObserver.
  const scrollerRef = useRef<HTMLUListElement | null>(null);
  const firstNoteRef = useRef<HTMLLIElement | null>(null);
  const lastNoteRef = useRef<HTMLLIElement | null>(null);
  const itemRefs = useRef<Map<string, HTMLLIElement | null>>(new Map());

  // Fade visibility — true means "there's something to scroll to in
  // that direction", which makes the fade appear.
  const [fadeTop, setFadeTop] = useState(false);
  const [fadeBottom, setFadeBottom] = useState(false);

  // Tooltip state — one tooltip at a time, portaled to <body>.
  const [hovered, setHovered] = useState<{
    note: NoteDocument;
    x: number;
    y: number;
  } | null>(null);
  const hoverTimerRef = useRef<number | null>(null);

  const cancelHover = useCallback(() => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHovered(null);
  }, []);

  // Track scroll position to flip the fades when the user scrolls
  // past the IO-detected state (programmatic scrolls + drag).
  const recomputeFades = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    setFadeTop(scrollTop > 1);
    setFadeBottom(scrollTop + clientHeight < scrollHeight - 1);
  }, []);

  // IntersectionObserver: when the first/last dot is fully visible,
  // there's no more to scroll in that direction → fade off.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || shown.length === 0) return;
    const targets: Element[] = [];
    if (firstNoteRef.current) targets.push(firstNoteRef.current);
    if (lastNoteRef.current && lastNoteRef.current !== firstNoteRef.current) {
      targets.push(lastNoteRef.current);
    }
    if (targets.length === 0) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.target === firstNoteRef.current) {
            setFadeTop(!e.isIntersecting);
          }
          if (e.target === lastNoteRef.current) {
            setFadeBottom(!e.isIntersecting);
          }
        }
      },
      { root: scroller, threshold: 1 },
    );
    targets.forEach((t) => io.observe(t));
    // Also recompute from raw scroll metrics — IO can miss edge cases
    // (e.g. when the list fits without overflow, both targets are
    // "intersecting" but the list isn't actually scrollable).
    recomputeFades();
    scroller.addEventListener('scroll', recomputeFades, { passive: true });
    return () => {
      io.disconnect();
      scroller.removeEventListener('scroll', recomputeFades);
    };
  }, [shown, recomputeFades]);

  // Auto-scroll the selected dot into view whenever it changes — so a
  // user deep-linking or jumping to a hidden note can still see the
  // highlight. We use 'nearest' to avoid unnecessary scroll if it's
  // already on screen.
  useEffect(() => {
    if (!selectedId) return;
    const li = itemRefs.current.get(selectedId);
    if (!li) return;
    // Defer to next frame so layout/IO have settled.
    const raf = window.requestAnimationFrame(() => {
      li.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      recomputeFades();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [selectedId, shown.length, recomputeFades]);

  // Clean up the hover timer on unmount.
  useEffect(() => () => cancelHover(), [cancelHover]);

  const handleDotEnter = useCallback(
    (e: ReactMouseEvent<HTMLButtonElement>, n: NoteDocument) => {
      if (hoverTimerRef.current !== null) {
        window.clearTimeout(hoverTimerRef.current);
      }
      const target = e.currentTarget;
      const rect = target.getBoundingClientRect();
      // Anchor the tooltip's right edge ~6px to the right of the dot's
      // left edge, vertically centered on the dot.
      const x = rect.right + 8;
      const y = rect.top + rect.height / 2;
      hoverTimerRef.current = window.setTimeout(() => {
        setHovered({ note: n, x, y });
        hoverTimerRef.current = null;
      }, STRIP_HOVER_DELAY_MS);
    },
    [],
  );

  const handleDotMove = useCallback((e: ReactMouseEvent<HTMLButtonElement>, n: NoteDocument) => {
    // Keep the tooltip pinned to the cursor's vertical position so it
    // doesn't drift if the user moves within the dot.
    setHovered((prev) => {
      if (!prev || prev.note.id !== n.id) return prev;
      const rect = e.currentTarget.getBoundingClientRect();
      return { ...prev, x: rect.right + 8, y: rect.top + rect.height / 2 };
    });
  }, []);

  const handleDotLeave = useCallback(() => {
    cancelHover();
  }, [cancelHover]);

  // Toggle the strip's expanded view. When the strip overflows the
  // 11-dot cap, clicking "N+" reveals every hidden note as a dot in
  // place; clicking it again collapses back to the cap. We deliberately
  // do NOT switch to the split layout here — the user is in focus mode
  // because they want to keep their place, and forcing them out of
  // focus every time the strip overflows is the exact thing audit
  // #5 / 1.1.8 polish flagged.
  const expandStrip = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  return (
    <div
      className={`flex flex-col h-full ${reserveSidebarToggleSpace ? 'pt-12' : ''}`}
      data-testid="notes-strip"
    >
      <button
        onClick={onToggleLayout}
        className="m-2 p-1.5 rounded-md text-text-muted hover:bg-black/5 dark:hover:bg-white/10 self-end"
        title="Show list"
        data-testid="notes-strip-show-list"
        aria-label="Show list"
      >
        <Minimize2 size={14} />
      </button>
      <div className="notes-strip-scroll relative flex-1 min-h-0">
        <div
          className={`notes-strip-fade notes-strip-fade-top ${fadeTop ? 'is-visible' : ''}`}
          aria-hidden="true"
        />
        <ul
          ref={scrollerRef}
          className="notes-strip-list"
          data-testid="notes-strip-list"
          onMouseLeave={cancelHover}
        >
          <li>
            <button
              onClick={onCreate}
              className="notes-strip-dot is-new"
              title="New note"
              data-testid="notes-strip-new"
            >
              +
            </button>
          </li>
          {shown.map((n, idx) => {
            const isSelected = n.id === selectedId;
            return (
              <li
                key={n.id}
                ref={(el) => {
                  if (el) {
                    itemRefs.current.set(n.id, el);
                    if (idx === 0) firstNoteRef.current = el;
                    if (idx === shown.length - 1) lastNoteRef.current = el;
                  } else {
                    itemRefs.current.delete(n.id);
                    if (idx === 0) firstNoteRef.current = null;
                    if (idx === shown.length - 1) lastNoteRef.current = null;
                  }
                }}
              >
                <button
                  onClick={() => {
                    // Collapse the expanded view on selection so the
                    // user gets a stable "where I am" view of the
                    // strip after picking a note.
                    setExpanded(false);
                    onSelect(n.id);
                  }}
                  onMouseEnter={(e) => handleDotEnter(e, n)}
                  onMouseMove={(e) => handleDotMove(e, n)}
                  onMouseLeave={handleDotLeave}
                  onFocus={() => cancelHover()}
                  className={`notes-strip-dot ${isSelected ? 'is-selected' : ''}`}
                  title={inferTitle(n)}
                  aria-label={inferTitle(n)}
                  aria-current={isSelected ? 'true' : undefined}
                  data-testid={`notes-strip-${n.id}`}
                >
                  {inferGlyph(n)}
                </button>
              </li>
            );
          })}
          {/* Single "more" toggle: shows N+ when capped, − when
              expanded. The previous code had two parallel branches
              with the same data-testid — one fired while
              activeHiddenCount > 0, the other fired post-expansion
              with hiddenCount > 0. They were mutually exclusive
              (expansion forces activeHiddenCount = 0) so we collapse
              to a single condition: there's something to expand OR
              we're expanded and have overflow to collapse back. */}
          {(activeHiddenCount > 0 || (expanded && hiddenCount > 0)) && (
            <li
              ref={(el) => {
                if (activeHiddenCount > 0) lastNoteRef.current = el;
              }}
            >
              <button
                onClick={expandStrip}
                onMouseEnter={cancelHover}
                onMouseLeave={handleDotLeave}
                className="notes-strip-dot is-more"
                title={
                  expanded
                    ? 'Collapse strip back to cap'
                    : `${activeHiddenCount} more — reveal in the strip`
                }
                aria-label={
                  expanded
                    ? 'Collapse strip back to cap'
                    : `${activeHiddenCount} more — reveal in the strip`
                }
                aria-expanded={expanded}
                data-testid="notes-strip-more"
              >
                {expanded ? '−' : `${activeHiddenCount}+`}
              </button>
            </li>
          )}
        </ul>
        <div
          className={`notes-strip-fade notes-strip-fade-bottom ${fadeBottom ? 'is-visible' : ''}`}
          aria-hidden="true"
        />
      </div>
      {hovered &&
        createPortal(
          <FocusTooltip note={hovered.note} x={hovered.x} y={hovered.y} />,
          document.body,
        )}
    </div>
  );
}

function FocusTooltip({ note, x, y }: { note: NoteDocument; x: number; y: number }) {
  const title = inferTitle(note);
  const preview = previewBody(note);
  return (
    <div
      className="notes-strip-tooltip is-visible"
      role="tooltip"
      style={{ left: x, top: y, transform: 'translateY(-50%)' }}
      data-testid={`notes-strip-tooltip-${note.id}`}
    >
      <span className="notes-strip-tooltip-title">{title}</span>
      {preview && <span className="notes-strip-tooltip-body">{preview}</span>}
    </div>
  );
}
