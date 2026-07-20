/**
 * NoteDocument list — the Notes tab in the v2 main app.
 *
 * Spec §7.3: Notes is the only entry for the user's working surface.
 * The list groups by "view" (Inbox / Recent / Daily / Meetings /
 * Projects / Favorites) using a small pill row. F-02A forbids
 * forcing the user to pick a kind or date before they can write —
 * the empty state offers an "Untitled note" button that calls the
 * backend immediately and opens the editor.
 */
import { useState, useMemo } from 'react';
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

function inferTitle(n: NoteDocument): string {
  if (n.title) return n.title;
  const first = n.body?.split('\n').find((l) => l.trim().length > 0) ?? '';
  return first.replace(/^#+\s*/, '').slice(0, 80) || '(untitled)';
}

function previewBody(n: NoteDocument): string {
  const lines = n.body?.split('\n').filter((l) => l.trim().length > 0) ?? [];
  return lines.slice(0, 2).join(' ').slice(0, 140);
}

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
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
}

export function NoteList({ selectedId, onSelect }: NoteListProps) {
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

  return (
    <div className="flex flex-col gap-3 p-4 h-full overflow-hidden">
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-heading">Notes</h2>
        <Button
          variant="primary"
          disabled={create.isPending}
          onClick={() => createAndOpen('general')}
          data-testid="notes-new"
        >
          + New note
        </Button>
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
                          {relativeTime(n.updatedAt)}
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
