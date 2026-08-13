/**
 * Topic Tabs — the per-context horizontal tab strip above the mind map
 * view. Renders a fixed All / Unclassified pair followed by the user's
 * topic spaces, with overflow (>6) collapsed into a "More" dropdown.
 *
 * Selection is owned by the parent: the component is fully controlled
 * and only emits `onSelect(id | null | '__unclassified__')`. Legacy
 * spaces (those with `kind === 'workspace'`) are tagged with a small
 * "（旧版）" subtitle so the user can tell which ones are pre-Phase 1.
 *
 * The "+ 新主题" button is optional; if `onCreate` is not provided the
 * button is hidden. The create flow is intentionally dumb: it just
 * relays the title string up. The parent owns the network call and the
 * post-create selection.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, MoreHorizontal, Tag as TagIcon } from 'lucide-react';
import type { TopicSpaceContext } from '../../api/client';

export type TopicTabValue = string | null | '__unclassified__';

/**
 * The shape TopicTabs actually needs. A new `TopicSpace` plus a thin
 * legacy shape for spaces that predate Phase 1 (read through the canonical
 * Topic Space API and tagged `kind: 'workspace'`). The
 * component itself doesn't care which is which — the discriminator is
 * only used for the "（旧版）" badge.
 */
export interface TopicTabItem {
  id: string;
  title: string;
  context: TopicSpaceContext;
  order: number;
  kind: 'topic-space' | 'workspace';
}

/** Pinned to spec: how many tabs are visible before overflow kicks in. */
const VISIBLE_LIMIT = 6;

/**
 * Derive a stable, human-friendly testid key from a TopicSpace id.
 *
 * The id format produced by `services/topicSpaces.ts#createTopicSpace`
 * is `tw_<YYYYMMDD>_<slug>_<6hex>`. We surface the middle slug portion
 * so that test selectors stay short and predictable
 * (`topic-tab-phase-1-smoke` rather than the full ULID-style id).
 *
 * If the id doesn't match the canonical shape (e.g. legacy or foreign
 * id), the whole id is used as a fallback so we never lose the tab.
 */
function testKeyForId(id: string): string {
  const m = id.match(/^tw_\d{8}_(.+)_[0-9a-f]{6}$/);
  return m ? m[1] : id;
}

interface TopicTabsProps {
  context: 'work' | 'life' | 'unclassified';
  spaces: ReadonlyArray<TopicTabItem>;
  activeSpaceId: TopicTabValue;
  onSelect: (id: TopicTabValue) => void;
  /** When provided, a "+ 新主题" button is rendered. The parent should
   *  create a space via the API and call `onSelect(newId)` to switch. */
  onCreate?: (title: string) => void | Promise<void>;
  /** Optional delete handler. When present, each space tab shows a small
   *  × on hover. */
  onDelete?: (id: string) => void;
  /** Localized labels. */
  labels?: {
    all?: string;
    unclassified?: string;
    more?: string;
    newTopic?: string;
    newTopicPlaceholder?: string;
    legacy?: string;
  };
  /** Disable interactions (used while the spaces list is loading). */
  isLoading?: boolean;
}

export function TopicTabs({
  context,
  spaces,
  activeSpaceId,
  onSelect,
  onCreate,
  onDelete,
  labels,
  isLoading = false,
}: TopicTabsProps) {
  const L = {
    all: labels?.all ?? '全部',
    unclassified: labels?.unclassified ?? '未分类',
    more: labels?.more ?? '更多',
    newTopic: labels?.newTopic ?? '新主题',
    newTopicPlaceholder: labels?.newTopicPlaceholder ?? '给主题起个名字…',
    legacy: labels?.legacy ?? '（旧版）',
  };

  // Filter to the active context, sort by `order`. Legacy spaces
  // (kind === 'workspace') mix in too — they get the "（旧版）" badge.
  const ordered = useMemo(() => {
    return [...spaces]
      .filter((s) => s.context === context)
      .sort((a, b) => a.order - b.order);
  }, [spaces, context]);

  const visible = ordered.slice(0, VISIBLE_LIMIT);
  const overflow = ordered.slice(VISIBLE_LIMIT);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const createInputRef = useRef<HTMLInputElement | null>(null);
  const overflowWrapRef = useRef<HTMLDivElement | null>(null);

  // Auto-focus the create input when the user clicks "+ 新主题".
  useEffect(() => {
    if (creating) {
      requestAnimationFrame(() => createInputRef.current?.focus());
    }
  }, [creating]);

  // Click outside / Esc closes the overflow menu.
  useEffect(() => {
    if (!overflowOpen) return;
    const onDown = (e: MouseEvent) => {
      if (overflowWrapRef.current && !overflowWrapRef.current.contains(e.target as Node)) {
        setOverflowOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOverflowOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [overflowOpen]);

  const handleCreateSubmit = async () => {
    const title = draftTitle.trim();
    if (!title || !onCreate) return;
    setCreating(false);
    setDraftTitle('');
    try {
      await onCreate(title);
    } catch (err) {
      // Parent owns the toast. Re-open the input on failure so the user
      // doesn't lose their typing.
      setCreating(true);
      setDraftTitle(title);
      console.error('[topic-tabs] create failed:', err);
    }
  };

  const renderTab = (id: TopicTabValue, label: string, options?: { isLegacy?: boolean; dataKey?: string }) => {
    const isActive = activeSpaceId === id;
    const dataKey = options?.dataKey ?? (typeof id === 'string' ? testKeyForId(id) : String(id));
    return (
      <button
        type="button"
        key={dataKey}
        onClick={() => onSelect(id)}
        data-testid={`topic-tab-${dataKey}`}
        data-active={isActive}
        className={`group inline-flex min-h-8 shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all ${
          isActive
            ? 'bg-[var(--color-accent)] text-white shadow-[0_1px_3px_rgba(15,23,42,0.14)]'
            : 'text-text-muted hover:bg-black/[0.045] hover:text-text-heading'
        }`}
      >
        <span className="truncate">{label}</span>
        {options?.isLegacy && (
          <span
            className={`shrink-0 text-[10px] font-normal ${
              isActive ? 'text-white/70' : 'text-text-muted/70'
            }`}
            title="旧版主题空间（迁移前）"
            data-testid={`topic-tab-legacy-${dataKey}`}
          >
            {L.legacy}
          </span>
        )}
        {onDelete && typeof id === 'string' && id !== '__unclassified__' && id !== null && isActive && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(id);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onDelete(id);
              }
            }}
            className="ml-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-white/70 hover:bg-white/20 hover:text-white"
            title="删除主题"
            data-testid={`topic-tab-delete-${dataKey}`}
          >
            ×
          </span>
        )}
      </button>
    );
  };

  return (
    <div
      className="flex min-h-11 w-full shrink-0 items-center gap-1.5 overflow-x-auto border-b border-border/80 bg-white px-3 py-1.5 shadow-[0_1px_0_rgba(15,23,42,0.025)]"
      data-testid="topic-tabs"
      data-context={context}
      aria-label="Topic Tabs"
    >
      {renderTab(null, L.all, { dataKey: 'all' })}
      {renderTab('__unclassified__', L.unclassified, { dataKey: 'unclassified' })}

      {visible.map((s) =>
        renderTab(s.id, s.title, {
          dataKey: testKeyForId(s.id),
          isLegacy: s.kind === 'workspace',
        }),
      )}

      {overflow.length > 0 && (
        <div ref={overflowWrapRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setOverflowOpen((v) => !v)}
            data-testid="topic-tab-more"
            aria-haspopup="menu"
            aria-expanded={overflowOpen}
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors ${
              overflowOpen
                ? 'bg-black/[0.06] text-text-heading'
                : 'text-text-muted hover:bg-black/[0.04] hover:text-text-heading'
            }`}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
            {L.more}
            <span className="ml-0.5 rounded-full bg-black/[0.08] px-1.5 text-[10px] tabular-nums text-text-muted">
              {overflow.length}
            </span>
          </button>
          {overflowOpen && (
            <div
              role="menu"
              data-testid="topic-tab-overflow-menu"
              className="absolute right-0 top-full z-30 mt-1 min-w-[180px] rounded-md border border-border bg-white/95 p-1 shadow-lg"
            >
              {overflow.map((s) => {
                const isActive = activeSpaceId === s.id;
                const overflowKey = testKeyForId(s.id);
                return (
                  <button
                    type="button"
                    role="menuitem"
                    key={overflowKey}
                    onClick={() => {
                      onSelect(s.id);
                      setOverflowOpen(false);
                    }}
                    data-testid={`topic-tab-overflow-${overflowKey}`}
                    className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-[12px] transition-colors ${
                      isActive
                        ? 'bg-[var(--color-accent-light)] text-text-heading'
                        : 'text-text-main hover:bg-black/[0.04]'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <TagIcon className="h-3 w-3 shrink-0 text-text-muted" />
                      <span className="truncate">{s.title}</span>
                    </span>
                    {s.kind === 'workspace' && (
                      <span className="shrink-0 text-[10px] text-text-muted/70">{L.legacy}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-1">
        {isLoading && (
          <span className="px-2 text-[10px] text-text-muted" data-testid="topic-tabs-loading">
            …
          </span>
        )}
        {onCreate &&
          (creating ? (
            <div
              className="flex items-center gap-1 rounded-full border border-[var(--color-accent)]/40 bg-white/95 px-1 py-0.5"
              data-testid="topic-tab-create-form"
            >
              <input
                ref={createInputRef}
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleCreateSubmit();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setCreating(false);
                    setDraftTitle('');
                  }
                }}
                placeholder={L.newTopicPlaceholder}
                className="w-40 bg-transparent px-1 text-[12px] text-text-main outline-none placeholder:text-text-muted/60"
                data-testid="topic-tab-create-input"
              />
              <button
                type="button"
                onClick={() => void handleCreateSubmit()}
                disabled={!draftTitle.trim()}
                className="rounded-full bg-[var(--color-accent)] px-2 py-0.5 text-[11px] font-medium text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                data-testid="topic-tab-create-confirm"
              >
                OK
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-lg border border-dashed border-border-strong/70 px-2.5 py-1 text-[12px] font-medium text-text-muted transition-colors hover:border-[var(--color-accent)]/45 hover:bg-[var(--color-accent-light)] hover:text-[var(--color-accent)]"
              data-testid="topic-tab-create"
            >
              <Plus className="h-3.5 w-3.5" />
              {L.newTopic}
            </button>
          ))}
      </div>
    </div>
  );
}
