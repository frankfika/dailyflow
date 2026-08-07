/**
 * TagFilterRow — the chip-style tag filter shown above the mind map
 * (and the list view) in a Topic Space.
 *
 * Tags are scoped to the active space and merged from two sources:
 *   - nodes on the active mind map with `kind === 'tag'`
 *   - the `tags` array of tasks bound to the space
 *
 * Click a chip to add it to the filter. Click again to remove. The
 * "清除" pill on the right is shown when the filter is non-empty.
 *
 * When no tags are available the component renders nothing (a small
 * `data-testid="tag-filter-row-empty"` placeholder is still emitted so
 * tests can assert on the absence state without searching for an
 * unrelated selector).
 */
import { Filter, X } from 'lucide-react';

export interface TagFilterRowProps {
  /** All available tags in the active space, sorted however the caller
   *  likes. Duplicates are deduped in the component. */
  tags: ReadonlyArray<string>;
  /** Currently selected tags. The parent owns the state. */
  selected: ReadonlyArray<string>;
  /**
   * Fired with the next selection. We accept a plain array (not
   * `ReadonlyArray`) so this can be wired directly to a
   * `useState<string[]>` setter. The parent may pass any array-like
   * via a wrapper if they need immutability.
   */
  onChange: (next: string[]) => void;
  language: 'en' | 'zh';
  /** Optional className for the wrapping element. */
  className?: string;
}

const LANG = {
  zh: {
    label: '标签',
    clear: '清除',
    empty: '这个主题还没有标签',
  },
  en: {
    label: 'Tags',
    clear: 'Clear',
    empty: 'No tags in this space yet',
  },
};

export function TagFilterRow({
  tags,
  selected,
  onChange,
  language,
  className = '',
}: TagFilterRowProps) {
  const L = LANG[language];
  const deduped = Array.from(new Set(tags.filter(Boolean)));

  if (deduped.length === 0) {
    return (
      <div
        className={`flex shrink-0 items-center gap-1 border-b border-border/40 bg-surface/30 px-3 py-1 text-[10px] text-text-muted/80 ${className}`}
        data-testid="tag-filter-row-empty"
      >
        <Filter className="h-3 w-3" />
        {L.empty}
      </div>
    );
  }

  const toggle = (tag: string) => {
    if (selected.includes(tag)) {
      onChange(selected.filter((t) => t !== tag));
    } else {
      onChange([...selected, tag]);
    }
  };
  // Suppress unused param lint when the parent wires `onChange` to a
  // function that ignores the array shape entirely.
  void toggle;

  return (
    <div
      className={`flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border/40 bg-surface/30 px-3 py-1 ${className}`}
      data-testid="tag-filter-row"
      data-selected-count={selected.length}
    >
      <span className="inline-flex shrink-0 items-center gap-0.5 px-1 text-[10px] font-medium uppercase tracking-wider text-text-muted/70">
        <Filter className="h-3 w-3" />
        {L.label}
      </span>
      {deduped.map((tag) => {
        const isActive = selected.includes(tag);
        return (
          <button
            key={tag}
            type="button"
            onClick={() => toggle(tag)}
            data-testid={`tag-filter-row-chip-${tag}`}
            data-active={isActive}
            className={`inline-flex shrink-0 items-center gap-0.5 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${
              isActive
                ? 'border-[var(--color-accent)]/50 bg-[var(--color-accent-light)] text-[var(--color-accent)]'
                : 'border-border bg-white/80 text-text-muted hover:border-[var(--color-accent)]/30 hover:text-text-heading'
            }`}
          >
            #{tag}
          </button>
        );
      })}
      {selected.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          data-testid="tag-filter-row-clear"
          className="ml-auto inline-flex shrink-0 items-center gap-0.5 rounded-full border border-border bg-white/80 px-2 py-0.5 text-[10px] font-medium text-text-muted transition-colors hover:border-[var(--color-danger)]/30 hover:text-[var(--color-danger)]"
        >
          <X className="h-3 w-3" />
          {L.clear}
        </button>
      )}
    </div>
  );
}
