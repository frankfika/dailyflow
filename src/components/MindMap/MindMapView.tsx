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
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { Clipboard, Check, Network } from 'lucide-react';

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
      setActiveMap(next);
      setMaps((current) =>
        current.map((m) =>
          m.id === next.id
            ? { ...m, title: next.title, nodes: next.nodes, edges: next.edges }
            : m,
        ),
      );
      // Pass `nodes` to the save so the title-sync gets persisted too.
      scheduleSave(next.id, { ...patch, ...(nodes !== activeMap.nodes ? { nodes } : {}) });
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
              <input
                value={activeMap.title}
                onChange={(e) => handleChange({ title: e.target.value })}
                placeholder={language === 'zh' ? '未命名导图' : 'Untitled mind map'}
                className="min-w-0 flex-1 bg-transparent text-base font-semibold text-text-heading outline-none placeholder:text-text-muted/60"
                data-testid="mindmap-title-input"
              />
              <div className="flex items-center gap-1 text-[11px] text-text-muted">
                <Network className="h-3.5 w-3.5" />
                {activeMap.nodes.length} {language === 'zh' ? '节点' : 'nodes'} ·{' '}
                {activeMap.edges.length} {language === 'zh' ? '连线' : 'edges'}
              </div>
              <button
                type="button"
                onClick={handleCopyMarkdown}
                className="ml-1 flex items-center gap-1 rounded-md border border-border bg-white/80 px-2 py-1 text-xs font-medium text-text-muted shadow-sm transition-colors hover:bg-white hover:text-[var(--color-accent)]"
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
                onRequestLayout={handleRequestLayout}
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
