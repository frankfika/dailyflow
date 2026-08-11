import { useEffect, useMemo, useState } from 'react';
import { GripVertical, Network, Tags, X } from 'lucide-react';
import { STANDALONE_MINDMAP_FILTER, type TodayPlanningGroup } from './TodayBacklog';

export function reconcileMindmapOrder(
  groups: ReadonlyArray<TodayPlanningGroup>,
  storedIds: ReadonlyArray<string>,
): TodayPlanningGroup[] {
  const byId = new Map(groups.map((group) => [group.mindmapId, group]));
  const ordered = storedIds.flatMap((id) => byId.has(id) ? [byId.get(id)!] : []);
  const seen = new Set(ordered.map((group) => group.mindmapId));
  return [...ordered, ...groups.filter((group) => !seen.has(group.mindmapId))];
}

interface TodayScopeTabsProps {
  groups: TodayPlanningGroup[];
  hasStandalone: boolean;
  selectedMindmapId: string | null;
  onMindmapChange: (id: string | null) => void;
  tags: string[];
  selectedTag: string | null;
  onTagChange: (tag: string | null) => void;
  language: 'en' | 'zh';
  storageKey: string;
}

export function TodayScopeTabs({
  groups,
  hasStandalone,
  selectedMindmapId,
  onMindmapChange,
  tags,
  selectedTag,
  onTagChange,
  language,
  storageKey,
}: TodayScopeTabsProps) {
  const groupSignature = useMemo(() => groups.map((group) => `${group.mindmapId}:${group.title}:${group.taskIds.length}`).join('\u0000'), [groups]);
  const [orderedGroups, setOrderedGroups] = useState<TodayPlanningGroup[]>(groups);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  useEffect(() => {
    let storedIds: string[] = [];
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
      if (Array.isArray(parsed)) storedIds = parsed.filter((item): item is string => typeof item === 'string');
    } catch { /* ignore corrupt preferences */ }
    setOrderedGroups(reconcileMindmapOrder(groups, storedIds));
  }, [groupSignature, storageKey]); // The signature represents the relevant group identity and visible metadata.

  const persist = (next: TodayPlanningGroup[]) => {
    setOrderedGroups(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next.map((group) => group.mindmapId))); } catch { /* ignore storage errors */ }
  };

  const moveBefore = (targetId: string) => {
    if (!draggedId || draggedId === targetId) return;
    const next = [...orderedGroups];
    const from = next.findIndex((group) => group.mindmapId === draggedId);
    const to = next.findIndex((group) => group.mindmapId === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    persist(next);
  };

  const tabClass = (active: boolean) => `inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors sm:h-8 sm:min-h-0 sm:px-2.5 ${active
    ? 'bg-text-heading text-white shadow-sm'
    : 'text-text-muted hover:bg-black/[0.04] hover:text-text-heading'}`;

  if (groups.length === 0 && !hasStandalone && tags.length === 0) return null;

  return (
    <section className="mb-5 rounded-xl border border-border/60 bg-white/55 px-3 py-2.5" aria-label={language === 'zh' ? 'Today 任务筛选' : 'Today task filters'} data-testid="today-scope-tabs">
      <div className="flex min-w-0 items-center gap-2">
        <Network className="h-3.5 w-3.5 shrink-0 text-text-muted/70" aria-hidden="true" />
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto pb-0.5" role="tablist" aria-label={language === 'zh' ? '按脑图查看' : 'Filter by mind map'}>
          <button type="button" role="tab" aria-selected={!selectedMindmapId} onClick={() => onMindmapChange(null)} className={tabClass(!selectedMindmapId)}>
            {language === 'zh' ? '全部任务' : 'All tasks'}
          </button>
          {hasStandalone && (
            <button type="button" role="tab" aria-selected={selectedMindmapId === STANDALONE_MINDMAP_FILTER} onClick={() => onMindmapChange(STANDALONE_MINDMAP_FILTER)} className={tabClass(selectedMindmapId === STANDALONE_MINDMAP_FILTER)}>
              {language === 'zh' ? '独立任务' : 'Standalone'}
            </button>
          )}
          {orderedGroups.map((group) => (
            <button
              key={group.mindmapId}
              type="button"
              role="tab"
              aria-selected={selectedMindmapId === group.mindmapId}
              draggable
              onDragStart={(event) => {
                setDraggedId(group.mindmapId);
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', group.mindmapId);
              }}
              onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }}
              onDrop={(event) => { event.preventDefault(); moveBefore(group.mindmapId); setDraggedId(null); }}
              onDragEnd={() => setDraggedId(null)}
              onClick={() => onMindmapChange(group.mindmapId)}
              className={`${tabClass(selectedMindmapId === group.mindmapId)} group/tab ${draggedId === group.mindmapId ? 'opacity-45' : ''}`}
              title={language === 'zh' ? '点击筛选，拖动调整顺序' : 'Click to filter; drag to reorder'}
            >
              <GripVertical className="h-3 w-3 opacity-35 group-hover/tab:opacity-70" aria-hidden="true" />
              <span className="max-w-36 truncate">{group.title}</span>
              <span className={`tabular-nums ${selectedMindmapId === group.mindmapId ? 'text-white/65' : 'text-text-muted/55'}`}>{group.taskIds.length}</span>
            </button>
          ))}
        </div>
        {orderedGroups.length > 1 && <span className="hidden shrink-0 text-[10px] text-text-muted/55 lg:inline">{language === 'zh' ? '拖动排序' : 'Drag to reorder'}</span>}
      </div>

      {tags.length > 0 && (
        <div className="mt-2 flex items-start gap-2 border-t border-border/50 pt-2" data-testid="today-tag-chips">
          <Tags className="mt-1.5 h-3.5 w-3.5 shrink-0 text-text-muted/55" aria-hidden="true" />
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => onTagChange(null)} className={`min-h-[44px] rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors sm:min-h-0 sm:px-2 ${!selectedTag ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)]' : 'text-text-muted hover:bg-black/[0.035] hover:text-text-heading'}`} aria-pressed={!selectedTag}>
              {language === 'zh' ? '全部标签' : 'All tags'}
            </button>
            {tags.map((tag) => (
              <button key={tag} type="button" onClick={() => onTagChange(selectedTag === tag ? null : tag)} className={`min-h-[44px] rounded-md border px-2.5 py-1 text-[11px] transition-colors sm:min-h-0 sm:px-2 ${selectedTag === tag ? 'border-[var(--color-accent)]/25 bg-[var(--color-accent-light)] font-medium text-[var(--color-accent)]' : 'border-border/60 bg-white/55 text-text-muted hover:border-border hover:text-text-heading'}`} aria-pressed={selectedTag === tag}>
                #{tag}
              </button>
            ))}
          </div>
          {(selectedTag || selectedMindmapId) && (
            <button type="button" onClick={() => { onTagChange(null); onMindmapChange(null); }} className="ml-auto flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-black/[0.04] hover:text-text-heading sm:min-h-0 sm:min-w-0 sm:p-1.5" aria-label={language === 'zh' ? '清除全部筛选' : 'Clear all filters'} title={language === 'zh' ? '清除全部筛选' : 'Clear all filters'}><X className="h-3.5 w-3.5" /></button>
          )}
        </div>
      )}
    </section>
  );
}
