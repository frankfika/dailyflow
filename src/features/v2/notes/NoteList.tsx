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
import { useNotes, useCreateNote, useArchiveNote, useDeleteNote } from '../hooks/useNotes';
import type { NoteDocument, NoteKind } from '../api/client';
import { Card, Button, Badge, EmptyState, Spinner } from '../components/States';

type ViewKey = 'all' | 'recent' | 'daily' | 'meeting' | 'project' | 'pinned' | 'archived';

const VIEW_LABELS: Record<ViewKey, { label: string; sub: string }> = {
  all: { label: 'All', sub: 'Every note in the workspace' },
  recent: { label: 'Recent', sub: 'Edited in the last 7 days' },
  daily: { label: 'Daily', sub: 'Notes bound to a date' },
  meeting: { label: 'Meetings', sub: 'Captured from meeting minutes' },
  project: { label: 'Projects', sub: 'Grouped by project' },
  pinned: { label: 'Pinned', sub: 'Stickied to the top' },
  archived: { label: 'Archived', sub: 'Soft-deleted, recoverable' },
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

function relativeTime(iso: string, lang: 'zh' | 'en' = 'en'): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  if (lang === 'zh') {
    if (diff < 60_000) return '刚刚';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
    if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`;
    return new Date(iso).toISOString().slice(0, 10);
  }
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(iso).toISOString().slice(0, 10);
}

export interface NoteListProps {
  /** Currently-selected note id; the list highlights it. */
  selectedId?: string | null;
  /** When the user picks a note, this is called. */
  onSelect: (id: string) => void;
  /** Layout mode from the parent. `note` collapses the list to a 56px icon strip. */
  layout?: 'split' | 'note';
  /** Toggle between `split` and `note`. The list shows a small button when not collapsed. */
  onToggleLayout?: () => void;
  /** UI language for relative-time copy. Defaults to English. */
  language?: 'zh' | 'en';
}

export function NoteList({ selectedId, onSelect, layout = 'split', onToggleLayout, language = 'en' }: NoteListProps) {
  const [view, setView] = useState<ViewKey>('all');
  const create = useCreateNote();
  const archive = useArchiveNote();
  const del = useDeleteNote();

  // Fetch all notes (cheap, in-memory). We then bucket client-side.
  const all = useNotes({ state: view === 'archived' ? 'archived' : 'active' });
  const items = all.data?.notes ?? [];

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
    return items.filter(byKind[view]);
  }, [items, view]);

  const createAndOpen = async (kind: NoteKind = 'general') => {
    const { note } = await create.mutateAsync({
      body: '',
      kind,
      state: 'draft',
    });
    onSelect(note.id);
  };

  // Collapsed: just an icon strip. Each note is a single character
  // avatar; the active one is highlighted. Click to switch.
  if (layout === 'note') {
    return (
      <FocusStrip
        notes={filtered}
        selectedId={selectedId ?? null}
        onSelect={onSelect}
        onCreate={() => createAndOpen('general')}
        onToggleLayout={onToggleLayout}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4 h-full overflow-hidden">
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-heading">Notes</h2>
        <div className="flex items-center gap-1.5">
          {onToggleLayout && (
            <button
              onClick={onToggleLayout}
              className="p-1.5 rounded-md text-text-muted hover:bg-black/5 dark:hover:bg-white/10"
              title="Hide list (focus on the editor)"
              data-testid="notes-hide-list"
              aria-label="Hide list"
            >
              ⇤
            </button>
          )}
          <Button
            variant="primary"
            disabled={create.isPending}
            onClick={() => createAndOpen('general')}
            data-testid="notes-new"
          >
            + New note
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Note view">
        {(Object.keys(VIEW_LABELS) as ViewKey[]).map((key) => (
          <button
            key={key}
            role="tab"
            aria-selected={view === key}
            onClick={() => setView(key)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
              view === key
                ? 'bg-accent text-white border-accent'
                : 'bg-surface text-text-muted border-border hover:text-text-heading'
            }`}
            data-testid={`notes-view-${key}`}
          >
            {VIEW_LABELS[key].label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto" data-testid="notes-list">
        {all.isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : all.error ? (
          <ErrorState onRetry={() => all.refetch()} />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No notes yet"
            body="Start with an untitled note — you can add a title, kind, and date later."
            action={
              <Button variant="primary" onClick={() => createAndOpen('general')}>
                + Untitled note
              </Button>
            }
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {filtered.map((n) => {
              const title = inferTitle(n);
              const preview = previewBody(n);
              const isSelected = n.id === selectedId;
              return (
                <li key={n.id}>
                  <Card
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'ring-1 ring-accent' : 'hover:bg-surface-elevated'
                    }`}
                  >
                    <button
                      onClick={() => onSelect(n.id)}
                      className="w-full text-left p-3"
                      data-testid={`notes-item-${n.id}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-text-heading truncate">{title}</span>
                        <span className="text-[11px] text-text-muted shrink-0">
                          {relativeTime(n.updatedAt, language)}
                        </span>
                      </div>
                      {preview && (
                        <p className="mt-1 text-xs text-text-muted line-clamp-2">{preview}</p>
                      )}
                      <div className="mt-2 flex items-center gap-1.5">
                        <Badge tone={n.state === 'draft' ? 'warning' : 'default'}>
                          {n.kind}
                        </Badge>
                        {n.state === 'draft' && <Badge tone="info">draft</Badge>}
                        {n.pinned && <Badge tone="success">pinned</Badge>}
                        {n.autoSaveVersion > 0 && (
                          <span className="text-[10px] text-text-muted">
                            v{n.autoSaveVersion}
                          </span>
                        )}
                        <span className="ml-auto flex gap-1">
                          {n.state !== 'archived' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                archive.mutate(n.id);
                              }}
                              className="text-[10px] text-text-muted hover:text-text-heading"
                              title="Archive"
                            >
                              archive
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm('Delete this note? This also removes its evidence.')) {
                                del.mutate(n.id);
                              }
                            }}
                            className="text-[10px] text-text-muted hover:text-danger"
                            title="Delete"
                          >
                            delete
                          </button>
                        </span>
                      </div>
                    </button>
                  </Card>
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

function FocusStrip({ notes, selectedId, onSelect, onCreate, onToggleLayout }: FocusStripProps) {
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
    <div className="flex flex-col h-full" data-testid="notes-strip">
      <button
        onClick={onToggleLayout}
        className="m-2 p-1.5 rounded-md text-text-muted hover:bg-black/5 dark:hover:bg-white/10 self-end"
        title="Show list"
        data-testid="notes-show-list"
        aria-label="Show list"
      >
        ⇆
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
          {activeHiddenCount > 0 && (
            <li
              ref={(el) => {
                lastNoteRef.current = el;
              }}
            >
              <button
                onClick={expandStrip}
                onMouseEnter={cancelHover}
                onMouseLeave={handleDotLeave}
                className="notes-strip-dot is-more"
                title={`${activeHiddenCount} more — ${expanded ? 'collapse' : 'reveal'} in the strip`}
                aria-label={`${activeHiddenCount} more — ${expanded ? 'collapse' : 'reveal'} in the strip`}
                aria-expanded={expanded}
                data-testid="notes-strip-more"
              >
                {expanded ? '−' : `${activeHiddenCount}+`}
              </button>
            </li>
          )}
          {expanded && activeHiddenCount === 0 && hiddenCount > 0 && (
            // While expanded, surface a "collapse" button at the bottom
            // so the user can return to the capped view without having
            // to scroll back up. Only shown when there was overflow
            // before expansion.
            <li>
              <button
                onClick={expandStrip}
                onMouseEnter={cancelHover}
                onMouseLeave={handleDotLeave}
                className="notes-strip-dot is-more"
                title="Collapse strip back to cap"
                aria-label="Collapse strip back to cap"
                aria-expanded={expanded}
                data-testid="notes-strip-more"
              >
                −
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
