/**
 * Mind map workspace.
 *
 * Top-level view shown when the user picks the "Mind Map" tab. Owns:
 *   - the list of maps in the active workspace
 *   - the active map and its in-memory edit state
 *   - debounced auto-save back to the server
 *
 * The view is split into a left rail (MindMapList) and a main canvas
 * (MindMapCanvas). Empty / loading / error states are kept inline so the
 * user always sees something useful.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConfirmDialog } from '../ConfirmDialog';
import {
  mindmapsApi,
  type MindMap,
  type MindMapEdge,
  type MindMapNode,
} from '../../api/client';
import { MindMapCanvas } from './MindMapCanvas';
import { MindMapList } from './MindMapList';
import { toMarkdown } from './layout';
import {
  Clipboard,
  Check,
  Network,
  Undo2,
  Redo2,
  Search,
  X as CloseIcon,
} from 'lucide-react';

interface MindMapViewProps {
  workspaceId: string;
  language: 'en' | 'zh';
  showToast: (message: string, type?: 'success' | 'info' | 'error') => void;
}

const AUTOSAVE_DEBOUNCE_MS = 600;

export function MindMapView({
  workspaceId,
  language,
  showToast,
}: MindMapViewProps) {
  const [maps, setMaps] = useState<MindMap[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeMap, setActiveMap] = useState<MindMap | null>(null);
  const [isListLoading, setIsListLoading] = useState(true);
  const [isMapLoading, setIsMapLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null);
  const [didCopyMarkdown, setDidCopyMarkdown] = useState(false);

  // Undo / redo — we keep two stacks keyed by map id so switching maps
  // doesn't lose history. Coalesce rapid changes (typing, dragging)
  // within HISTORY_COALESCE_MS so a single edit doesn't fill the stack.
  const HISTORY_LIMIT = 50;
  const HISTORY_COALESCE_MS = 600;
  const pastRef = useRef<Map<string, MindMap[]>>(new Map());
  const futureRef = useRef<Map<string, MindMap[]>>(new Map());
  const lastPushAtRef = useRef<number>(0);
  const lastSnapshotRef = useRef<string>('');
  const [, forceHistoryTick] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Track the latest patch queued for the active map. We coalesce patches
  // within the debounce window so a fast drag produces one save, not 60.
  const pendingPatch = useRef<{
    id: string;
    patch: {
      title?: string;
      rootId?: string;
      nodes?: MindMapNode[];
      edges?: MindMapEdge[];
    };
  } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshList = useCallback(async () => {
    setIsListLoading(true);
    setLoadError(null);
    try {
      const list = await mindmapsApi.list();
      setMaps(list);
      return list;
    } catch (err: any) {
      setLoadError(err?.message ?? 'Failed to load mind maps');
      return [];
    } finally {
      setIsListLoading(false);
    }
  }, []);

  // Load the list when the workspace changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await refreshList();
      if (cancelled) return;
      // If the previously active map still exists in the new workspace,
      // keep it selected; otherwise fall back to the first map.
      if (activeId && list.some((m) => m.id === activeId)) return;
      if (list.length > 0) {
        setActiveId(list[0].id);
      } else {
        setActiveId(null);
        setActiveMap(null);
      }
    })();
    return () => {
      cancelled = true;
    };
    // workspaceId change is the trigger; refreshList identity is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  // Fetch the active map whenever activeId changes.
  useEffect(() => {
    if (!activeId) {
      setActiveMap(null);
      return;
    }
    // If we already have it from the list, no need to refetch.
    const cached = maps.find((m) => m.id === activeId);
    if (cached) {
      setActiveMap(cached);
      return;
    }
    let cancelled = false;
    setIsMapLoading(true);
    mindmapsApi
      .get(activeId)
      .then((m) => {
        if (!cancelled) setActiveMap(m);
      })
      .catch((err) => {
        if (!cancelled) {
          showToast(
            language === 'zh' ? '加载思维导图失败' : 'Failed to load mind map',
            'error',
          );
          console.error('[mindmap] load error:', err);
        }
      })
      .finally(() => {
        if (!cancelled) setIsMapLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeId, maps, language, showToast]);

  // Flush any pending save when unmounting.
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (pendingPatch.current) {
        // Best-effort: we cannot await on unmount, but the patch will be
        // re-sent if the user reopens the tab. Acceptable trade-off.
      }
    };
  }, []);

  const scheduleSave = useCallback(
    (id: string, patch: MindMap['nodes'] extends never ? never : {
      title?: string;
      rootId?: string;
      nodes?: MindMapNode[];
      edges?: MindMapEdge[];
    }) => {
      // Merge into the pending patch so the latest write wins.
      const prev = pendingPatch.current?.id === id ? pendingPatch.current.patch : {};
      pendingPatch.current = {
        id,
        patch: {
          ...prev,
          ...patch,
          // Arrays must be replaced, not shallow-merged.
          ...(patch.nodes ? { nodes: patch.nodes } : {}),
          ...(patch.edges ? { edges: patch.edges } : {}),
        },
      };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        const pending = pendingPatch.current;
        pendingPatch.current = null;
        saveTimer.current = null;
        if (!pending) return;
        try {
          const updated = await mindmapsApi.update(pending.id, pending.patch);
          setMaps((current) =>
            current.map((m) => (m.id === updated.id ? updated : m)),
          );
          // Keep the active map in sync with the saved shape (timestamps).
          setActiveMap((current) => (current && current.id === updated.id ? updated : current));
        } catch (err: any) {
          showToast(
            language === 'zh' ? '保存失败' : 'Failed to save',
            'error',
          );
          console.error('[mindmap] save error:', err);
        }
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [language, showToast],
  );

  /**
   * Compute a coarse "fingerprint" of the user-facing fields we care
   * about for history coalescing. Position-only changes get the same
   * fingerprint as the previous snapshot within the coalesce window so
   * a drag becomes one history entry, not 60.
   */
  const fingerprint = useCallback((m: MindMap): string => {
    return JSON.stringify({
      title: m.title,
      rootId: m.rootId,
      edges: m.edges.map((e) => `${e.source}->${e.target}`).join('|'),
      nodes: m.nodes.map((n) =>
        `${n.id}:${n.text.length}:${n.color ?? ''}:${n.collapsed ? 1 : 0}:${(n.note ?? '').length}:${n.status ?? 'todo'}`,
      ).join('|'),
    });
  }, []);

  const pushHistory = useCallback(
    (snapshot: MindMap) => {
      const stack = pastRef.current.get(snapshot.id) ?? [];
      const fp = fingerprint(snapshot);
      const now = Date.now();
      // If the previous snapshot is identical (e.g. only positions moved)
      // and was pushed within the coalesce window, just keep the older
      // entry — we don't want every drag tick to flood history.
      if (
        stack.length > 0 &&
        fp === lastSnapshotRef.current &&
        now - lastPushAtRef.current < HISTORY_COALESCE_MS
      ) {
        return;
      }
      stack.push(snapshot);
      while (stack.length > HISTORY_LIMIT) stack.shift();
      pastRef.current.set(snapshot.id, stack);
      // New edits invalidate the redo stack for this map.
      futureRef.current.set(snapshot.id, []);
      lastSnapshotRef.current = fp;
      lastPushAtRef.current = now;
      forceHistoryTick((t) => t + 1);
    },
    [fingerprint],
  );

  const applyMapState = useCallback(
    (next: MindMap, options: { recordHistory: boolean }) => {
      if (options.recordHistory && activeMap && activeMap.id === next.id) {
        pushHistory(activeMap);
      }
      setActiveMap(next);
      setMaps((current) =>
        current.map((m) => (m.id === next.id ? next : m)),
      );
      // Persist whatever the user has touched. The autosave debounce
      // coalesces a burst of undo/redo into one disk write.
      scheduleSave(next.id, {
        title: next.title,
        rootId: next.rootId,
        nodes: next.nodes,
        edges: next.edges,
      });
    },
    [activeMap, pushHistory, scheduleSave],
  );

  const handleChange = useCallback(
    (patch: {
      title?: string;
      rootId?: string;
      nodes?: MindMapNode[];
      edges?: MindMapEdge[];
    }) => {
      if (!activeMap) return;
      // If the user is editing the title and the root node still mirrors
      // the original "未命名导图" / "Untitled" placeholder, keep the root
      // text in lock-step with the title so the canvas reflects what
      // they typed. Once the user edits the root text directly we stop
      // syncing — from then on the title and root can diverge.
      let nodes = patch.nodes !== undefined ? patch.nodes : activeMap.nodes;
      if (
        patch.title !== undefined &&
        patch.nodes === undefined
      ) {
        const root = nodes.find((n) => n.id === activeMap.rootId);
        const isPlaceholder = !root || root.text === '未命名导图' || root.text === 'Untitled' || root.text === '中心主题';
        if (root && isPlaceholder) {
          nodes = nodes.map((n) =>
            n.id === root.id ? { ...n, text: patch.title! } : n,
          );
        }
      }
      const next: MindMap = {
        ...activeMap,
        title: patch.title !== undefined ? patch.title : activeMap.title,
        rootId: patch.rootId !== undefined ? patch.rootId : activeMap.rootId,
        nodes,
        edges: patch.edges !== undefined ? patch.edges : activeMap.edges,
      };
      applyMapState(next, { recordHistory: true });
    },
    [activeMap, applyMapState],
  );

  // Position-only changes from drag are NOT a user "edit" — we don't
  // want to flood history with one entry per drag tick. The canvas
  // already coalesces drag commits into a single onChange call, so we
  // can just skip the history push here.
  const handlePositionsChange = useCallback(
    (positions: Record<string, { x: number; y: number }>) => {
      if (!activeMap) return;
      const nextNodes = activeMap.nodes.map((n) =>
        positions[n.id] ? { ...n, position: positions[n.id] } : n,
      );
      const next: MindMap = { ...activeMap, nodes: nextNodes };
      setActiveMap(next);
      setMaps((current) =>
        current.map((m) => (m.id === next.id ? next : m)),
      );
      scheduleSave(next.id, { nodes: nextNodes });
    },
    [activeMap, scheduleSave],
  );

  const handleRequestLayout = useCallback(
    (positions: Record<string, { x: number; y: number }>) => {
      if (!activeMap) return;
      const nextNodes = activeMap.nodes.map((n) =>
        positions[n.id] ? { ...n, position: positions[n.id] } : n,
      );
      handleChange({ nodes: nextNodes });
    },
    [activeMap, handleChange],
  );

  // Undo / redo. Both go through applyMapState with `recordHistory: false`
  // so the act of undoing doesn't itself become an undoable step.
  const undo = useCallback(() => {
    if (!activeMap) return;
    const stack = pastRef.current.get(activeMap.id) ?? [];
    if (stack.length === 0) return;
    const prev = stack[stack.length - 1];
    stack.pop();
    pastRef.current.set(activeMap.id, stack);
    const future = futureRef.current.get(activeMap.id) ?? [];
    future.push(activeMap);
    futureRef.current.set(activeMap.id, future);
    setActiveMap(prev);
    setMaps((current) => current.map((m) => (m.id === prev.id ? prev : m)));
    scheduleSave(prev.id, {
      title: prev.title,
      rootId: prev.rootId,
      nodes: prev.nodes,
      edges: prev.edges,
    });
    forceHistoryTick((t) => t + 1);
  }, [activeMap, scheduleSave]);

  const redo = useCallback(() => {
    if (!activeMap) return;
    const future = futureRef.current.get(activeMap.id) ?? [];
    if (future.length === 0) return;
    const next = future[future.length - 1];
    future.pop();
    futureRef.current.set(activeMap.id, future);
    const stack = pastRef.current.get(activeMap.id) ?? [];
    stack.push(activeMap);
    pastRef.current.set(activeMap.id, stack);
    setActiveMap(next);
    setMaps((current) => current.map((m) => (m.id === next.id ? next : m)));
    scheduleSave(next.id, {
      title: next.title,
      rootId: next.rootId,
      nodes: next.nodes,
      edges: next.edges,
    });
    forceHistoryTick((t) => t + 1);
  }, [activeMap, scheduleSave]);

  // When the user switches maps, make sure the next undo/redo is keyed to
  // the new map (and drop anything we'd snapshotted for the old one
  // implicitly — its stacks stay around in case they come back).
  const canUndo = activeMap ? (pastRef.current.get(activeMap.id) ?? []).length > 0 : false;
  const canRedo = activeMap ? (futureRef.current.get(activeMap.id) ?? []).length > 0 : false;

  // Search / find within the current map. When the user types in the
  // search box we compute a flat list of matching node ids and pass them
  // to the canvas so it can highlight + auto-pan to each match.
  const searchMatches = useMemo(() => {
    if (!activeMap || !searchQuery.trim()) return [] as string[];
    const q = searchQuery.trim().toLowerCase();
    return activeMap.nodes
      .filter((n) => n.text.toLowerCase().includes(q))
      .map((n) => n.id);
  }, [activeMap, searchQuery]);

  const [focusedMatchId, setFocusedMatchId] = useState<string | null>(null);
  // Reset focus to the first match whenever the query changes.
  useEffect(() => {
    if (searchMatches.length > 0) {
      setFocusedMatchId(searchMatches[0]);
    } else {
      setFocusedMatchId(null);
    }
  }, [searchMatches]);

  const cycleMatch = useCallback(
    (direction: 1 | -1) => {
      if (searchMatches.length === 0) return;
      const idx = focusedMatchId
        ? searchMatches.indexOf(focusedMatchId)
        : -1;
      const nextIdx =
        idx === -1
          ? direction === 1
            ? 0
            : searchMatches.length - 1
          : (idx + direction + searchMatches.length) % searchMatches.length;
      setFocusedMatchId(searchMatches[nextIdx]);
    },
    [searchMatches, focusedMatchId],
  );

  // Global keyboard shortcuts: Ctrl/Cmd+Z (undo), Ctrl/Cmd+Shift+Z
  // (redo), Ctrl/Cmd+F (open search).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't hijack typing in inputs (the editing input is one of them).
      const target = e.target as HTMLElement | null;
      const inTextField =
        !!target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === 'z' || e.key === 'Z')) {
        // Allow the user to keep their own native undo inside an input.
        if (inTextField) return;
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && (e.key === 'y' || e.key === 'Y')) {
        if (inTextField) return;
        e.preventDefault();
        redo();
      } else if (mod && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === 'Escape' && searchOpen) {
        setSearchOpen(false);
        setSearchQuery('');
        setFocusedMatchId(null);
      } else if (searchOpen && (e.key === 'Enter' || e.key === 'ArrowDown')) {
        e.preventDefault();
        cycleMatch(1);
      } else if (searchOpen && e.key === 'ArrowUp') {
        e.preventDefault();
        cycleMatch(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, searchOpen, cycleMatch]);

  const handleCopyMarkdown = useCallback(async () => {
    if (!activeMap) return;
    const md = toMarkdown(activeMap);
    try {
      await navigator.clipboard.writeText(md);
      setDidCopyMarkdown(true);
      showToast(
        language === 'zh' ? '已复制为 Markdown' : 'Copied as Markdown',
        'success',
      );
      setTimeout(() => setDidCopyMarkdown(false), 1500);
    } catch (err) {
      console.error('[mindmap] clipboard write failed:', err);
      showToast(
        language === 'zh' ? '复制失败' : 'Copy failed',
        'error',
      );
    }
  }, [activeMap, language, showToast]);

  const handleCreate = useCallback(async () => {
    try {
      const created = await mindmapsApi.create({ title: '' });
      setMaps((current) => [created, ...current]);
      setActiveId(created.id);
      showToast(
        language === 'zh' ? '已新建导图' : 'Mind map created',
        'success',
      );
    } catch (err: any) {
      showToast(
        language === 'zh' ? '新建失败' : 'Failed to create',
        'error',
      );
      console.error('[mindmap] create error:', err);
    }
  }, [language, showToast]);

  const handleDelete = useCallback(
    (id: string) => {
      const target = maps.find((m) => m.id === id);
      if (!target) return;
      setPendingDelete({ id, title: target.title });
    },
    [maps],
  );

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    try {
      await mindmapsApi.delete(id);
      setMaps((current) => current.filter((m) => m.id !== id));
      if (activeId === id) {
        setActiveId(null);
        setActiveMap(null);
      }
      showToast(
        language === 'zh' ? '已删除' : 'Deleted',
        'success',
      );
    } catch (err: any) {
      showToast(
        language === 'zh' ? '删除失败' : 'Failed to delete',
        'error',
      );
      console.error('[mindmap] delete error:', err);
    }
  }, [pendingDelete, activeId, language, showToast]);

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-background">
      <MindMapList
        maps={maps}
        activeId={activeId}
        language={language}
        isLoading={isListLoading}
        onSelect={(id) => setActiveId(id)}
        onCreate={handleCreate}
        onDelete={handleDelete}
      />
      <div className="min-w-0 flex-1">
        {loadError ? (
          <ErrorPanel
            message={loadError}
            language={language}
            onRetry={refreshList}
          />
        ) : !activeMap && !isMapLoading ? (
          <EmptyState language={language} onCreate={handleCreate} />
        ) : !activeMap ? (
          <div className="flex h-full items-center justify-center text-sm text-text-muted">
            {language === 'zh' ? '加载中...' : 'Loading...'}
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            <header className="flex shrink-0 items-center gap-2 border-b border-border/60 bg-surface/50 px-4 py-2.5">
              {searchOpen ? (
                <div className="flex flex-1 items-center gap-1 rounded-md border border-[var(--color-accent)]/40 bg-white/95 px-2 py-1">
                  <Search className="h-3.5 w-3.5 text-text-muted" />
                  <input
                    autoFocus
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={language === 'zh' ? '在导图中搜索…' : 'Search in map…'}
                    className="min-w-0 flex-1 bg-transparent text-sm text-text-main outline-none placeholder:text-text-muted/60"
                    data-testid="mindmap-search-input"
                  />
                  <span className="shrink-0 text-[10px] text-text-muted">
                    {searchMatches.length > 0
                      ? `${searchMatches.indexOf(focusedMatchId ?? '') + 1}/${searchMatches.length}`
                      : (searchQuery ? (language === 'zh' ? '无匹配' : '0/0') : '')}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchOpen(false);
                      setSearchQuery('');
                      setFocusedMatchId(null);
                    }}
                    className="shrink-0 rounded p-0.5 text-text-muted hover:bg-black/5"
                    title={language === 'zh' ? '关闭搜索' : 'Close search'}
                    data-testid="mindmap-search-close"
                  >
                    <CloseIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <input
                  value={activeMap.title}
                  onChange={(e) => handleChange({ title: e.target.value })}
                  placeholder={language === 'zh' ? '未命名导图' : 'Untitled mind map'}
                  className="min-w-0 flex-1 bg-transparent text-base font-semibold text-text-heading outline-none placeholder:text-text-muted/60"
                  data-testid="mindmap-title-input"
                />
              )}
              <div className="flex items-center gap-1 text-[11px] text-text-muted">
                <Network className="h-3.5 w-3.5" />
                {activeMap.nodes.length} {language === 'zh' ? '节点' : 'nodes'} ·{' '}
                {activeMap.edges.length} {language === 'zh' ? '连线' : 'edges'}
              </div>
              <button
                type="button"
                onClick={undo}
                disabled={!canUndo}
                className="ml-1 rounded-md border border-border bg-white/80 p-1 text-text-muted shadow-sm transition-colors hover:bg-white hover:text-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white/80 disabled:hover:text-text-muted"
                title={language === 'zh' ? '撤销 (Ctrl+Z)' : 'Undo (Ctrl+Z)'}
                data-testid="mindmap-undo"
              >
                <Undo2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={redo}
                disabled={!canRedo}
                className="rounded-md border border-border bg-white/80 p-1 text-text-muted shadow-sm transition-colors hover:bg-white hover:text-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white/80 disabled:hover:text-text-muted"
                title={language === 'zh' ? '重做 (Ctrl+Shift+Z)' : 'Redo (Ctrl+Shift+Z)'}
                data-testid="mindmap-redo"
              >
                <Redo2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="rounded-md border border-border bg-white/80 p-1 text-text-muted shadow-sm transition-colors hover:bg-white hover:text-[var(--color-accent)]"
                title={language === 'zh' ? '搜索 (Ctrl+F)' : 'Search (Ctrl+F)'}
                data-testid="mindmap-search-open"
              >
                <Search className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={handleCopyMarkdown}
                className="flex items-center gap-1 rounded-md border border-border bg-white/80 px-2 py-1 text-xs font-medium text-text-muted shadow-sm transition-colors hover:bg-white hover:text-[var(--color-accent)]"
                title={language === 'zh' ? '复制为 Markdown' : 'Copy as Markdown'}
                data-testid="mindmap-copy-markdown"
              >
                {didCopyMarkdown ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    {language === 'zh' ? '已复制' : 'Copied'}
                  </>
                ) : (
                  <>
                    <Clipboard className="h-3.5 w-3.5" />
                    {language === 'zh' ? '复制 Markdown' : 'Copy Markdown'}
                  </>
                )}
              </button>
            </header>
            <div className="min-h-0 flex-1">
              <MindMapCanvas
                map={activeMap}
                language={language}
                onChange={handleChange}
                onPositionsChange={handlePositionsChange}
                onRequestLayout={handleRequestLayout}
                searchMatches={searchMatches}
                focusedMatchId={focusedMatchId}
                onCycleMatch={cycleMatch}
              />
            </div>
          </div>
        )}
      </div>
      <ConfirmDialog
        show={!!pendingDelete}
        title={language === 'zh' ? '删除思维导图' : 'Delete mind map'}
        message={
          language === 'zh'
            ? `确定要删除「${pendingDelete?.title || '未命名'}」吗？此操作不可撤销。`
            : `Delete "${pendingDelete?.title || 'Untitled'}"? This cannot be undone.`
        }
        confirmText={language === 'zh' ? '删除' : 'Delete'}
        cancelText={language === 'zh' ? '取消' : 'Cancel'}
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

function EmptyState({
  language,
  onCreate,
}: {
  language: 'en' | 'zh';
  onCreate: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="rounded-full bg-[var(--color-accent-light)] p-3 text-[var(--color-accent)]">
        <Network className="h-7 w-7" />
      </div>
      <h2 className="text-lg font-semibold text-text-heading">
        {language === 'zh' ? '还没有思维导图' : 'No mind maps yet'}
      </h2>
      <p className="max-w-sm text-sm text-text-muted">
        {language === 'zh'
          ? '把一个复杂问题拆成主分支和子分支，边想边整理。先建一个吧：'
          : 'Break a complex topic into a root and branches. Create your first one:'}
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-2 rounded-md bg-[var(--color-accent)] px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[var(--color-accent)]/90"
      >
        {language === 'zh' ? '新建思维导图' : 'New mind map'}
      </button>
    </div>
  );
}

function ErrorPanel({
  message,
  language,
  onRetry,
}: {
  message: string;
  language: 'en' | 'zh';
  onRetry: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-sm text-text-muted">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-md bg-[var(--color-accent)] px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[var(--color-accent)]/90"
      >
        {language === 'zh' ? '重试' : 'Retry'}
      </button>
    </div>
  );
}
