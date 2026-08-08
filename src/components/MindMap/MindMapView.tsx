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
  type MindMapNodeKind,
} from '../../api/client';
import { MindMapCanvas } from './MindMapCanvas';
import { MindMapList } from './MindMapList';
import { layoutMindMap, toMarkdown } from './layout';
import { MINDMAP_TEMPLATES } from './templates';
import { NodeContextMenu, type NodeContextMenuTaskOption } from './NodeContextMenu';
import {
  useLinkNodeToTask,
  usePromoteNodeToTask,
  useUpdateNodeKind,
} from '../../hooks/useMindMapActions';
import {
  Clipboard,
  Check,
  Network,
  Undo2,
  Redo2,
  Search,
  X as CloseIcon,
  Download,
  Upload,
  CheckCircle2,
  ListChecks,
} from 'lucide-react';

interface MindMapViewProps {
  workspaceId: string;
  language: 'en' | 'zh';
  showToast: (message: string, type?: 'success' | 'info' | 'error') => void;
  // Topic Space v2 (Phase 1): the parent owns the active space selection.
  //  - null → "全部" — aggregate all maps in the workspace.
  //  - '__unclassified__' — only maps with no `spaceId` (legacy / orphan).
  //  - any other id — try to scope to that space's `mindmapId`; if the
  //    space's mindmap isn't in the loaded list yet, fetch it.
  activeSpaceId?: string | null | '__unclassified__';
  /**
   * Optional: the loaded topic spaces, used to resolve
   * `activeSpaceId === '<space id>'` to a `mindmapId`. When omitted we
   * still honor the `'__unclassified__'` filter; the `null` filter always
   * works without any extra data.
   */
  topicSpaces?: ReadonlyArray<{ id: string; mindmapId?: string }>;
  /**
   * Phase 2: the currently active context (work / life). Used as the
   * default for newly-promoted tasks and to scope the "link" picker.
   * Falls back to 'work' when the parent doesn't provide one.
   */
  activeContext?: 'work' | 'life';
  /**
   * Phase 2: today's date (YYYY-MM-DD) in the user's local time. Used
   * as the default `source_date` when promoting a node. The parent owns
   * the clock; we never read `new Date()` inside this view.
   */
  todayDate?: string;
  /**
   * Phase 2: tasks the user can link to from the context menu. Usually
   * the same set TodayView uses, but the parent decides what to show
   * (e.g. "all tasks" vs "tasks in this space"). Pass an empty array
   * to disable the link picker.
   */
  linkableTasks?: ReadonlyArray<{
    id: string;
    title: string;
    status: 'todo' | 'done' | 'migrated';
    date: string;
  }>;
  /**
   * Phase 2: open a task in TodayView. The canvas forwards the click
   * via this callback; the parent decides how to navigate (Today tab +
   * date). Required to enable the "Open task" link on kind: 'task' nodes.
   */
  onOpenTask?: (taskId: string, date: string) => void;
}

const AUTOSAVE_DEBOUNCE_MS = 600;

type MindMapPatch = {
  title?: string;
  rootId?: string;
  nodes?: MindMapNode[];
  edges?: MindMapEdge[];
};

export function buildTaskSourceDateByNodeId(
  nodes: ReadonlyArray<Pick<MindMapNode, 'id' | 'taskId'>>,
  tasks: ReadonlyArray<{ id: string; date: string }>,
): Record<string, string> {
  const dateByTaskId = new Map(tasks.map((task) => [task.id, task.date]));
  const result: Record<string, string> = {};
  for (const node of nodes) {
    if (!node.taskId) continue;
    const date = dateByTaskId.get(node.taskId);
    if (date) result[node.id] = date;
  }
  return result;
}

export function rebaseSemanticNodeFields(
  pendingNodes: MindMapNode[],
  authoritativeNodes: ReadonlyArray<MindMapNode>,
): MindMapNode[] {
  const authoritative = new Map(authoritativeNodes.map((node) => [node.id, node]));
  return pendingNodes.map((node) => {
    const serverNode = authoritative.get(node.id);
    if (!serverNode) return node;
    const next = { ...node, kind: serverNode.kind };
    if (serverNode.tag === undefined) delete next.tag;
    else next.tag = serverNode.tag;
    if (serverNode.taskId === undefined) delete next.taskId;
    else next.taskId = serverNode.taskId;
    return next;
  });
}

export function MindMapView({
  workspaceId,
  language,
  showToast,
  activeSpaceId = null,
  topicSpaces,
  activeContext = 'work',
  todayDate,
  linkableTasks = [],
  onOpenTask,
}: MindMapViewProps) {
  const [maps, setMaps] = useState<MindMap[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeMap, setActiveMap] = useState<MindMap | null>(null);
  const [isListLoading, setIsListLoading] = useState(true);
  const [isMapLoading, setIsMapLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null);
  const [didCopyMarkdown, setDidCopyMarkdown] = useState(false);
  const flushSaveRef = useRef<(id: string) => Promise<MindMap | null>>(async () => null);
  const rebasePendingSaveRef = useRef<(map: MindMap) => MindMap>((map) => map);

  // Phase 2: right-click context menu state. We keep the node id and
  // cursor coords here so the menu can position itself outside the
  // canvas. The menu handles its own close on outside click / Escape.
  const [contextMenu, setContextMenu] = useState<{
    nodeId: string;
    kind: MindMapNodeKind;
    position: { x: number; y: number };
  } | null>(null);

  // Phase 2: the date the active mind map was "born" on. We use it as
  // the default `source_date` when promoting a node to a task. Falls
  // back to `todayDate` (also a parent prop) and then to whatever the
  // server accepts as "today".
  const activeMapSourceDate = useMemo(() => {
    if (!activeMap) return todayDate;
    // Maps created from the topic-space flow have a fresh `createdAt`;
    // the server's `promote-to-task` endpoint accepts an explicit
    // `date` and we send the local clock when the parent didn't pass
    // one in.
    return todayDate;
  }, [activeMap, todayDate]);

  // Phase 2: tanstack-query mutations for the right-click actions. We
  // keep them inside the view so the onSuccess handlers can update
  // local map state (no extra round-trip).
  const promoteMut = usePromoteNodeToTask();
  const linkMut = useLinkNodeToTask();
  const setKindMut = useUpdateNodeKind();

  const handleContextMenu = useCallback(
    (nodeId: string, position: { x: number; y: number }) => {
      if (!activeMap) return;
      const target = activeMap.nodes.find((n) => n.id === nodeId);
      if (!target) return;
      const kind = target.kind ?? (target.id === activeMap.rootId ? 'root' : 'branch');
      if (kind === 'root') return;
      setContextMenu({
        nodeId,
        kind,
        position,
      });
    },
    [activeMap],
  );

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const handlePromoteNode = useCallback(async () => {
    if (!activeMap || !contextMenu) return;
    if (!activeMapSourceDate) {
      showToast(
        language === 'zh'
          ? '需要先知道今天的日期才能转为待办'
          : 'Need today\'s date to promote a node',
        'error',
      );
      return;
    }
    try {
      await flushSaveRef.current(activeMap.id);
      const updated = await promoteMut.mutateAsync({
        mapId: activeMap.id,
        nodeId: contextMenu.nodeId,
        date: activeMapSourceDate,
        context: activeContext,
      });
      const rebased = rebasePendingSaveRef.current(updated);
      setActiveMap(rebased);
      setMaps((cur) => cur.map((m) => (m.id === rebased.id ? rebased : m)));
      showToast(language === 'zh' ? '已转为待办' : 'Promoted to task', 'success');
    } catch {
      showToast(language === 'zh' ? '转为待办失败' : 'Failed to promote', 'error');
    }
  }, [
    activeMap,
    contextMenu,
    activeMapSourceDate,
    activeContext,
    promoteMut,
    showToast,
    language,
  ]);

  const handleLinkNodeToTask = useCallback(
    async (taskId: string, date: string) => {
      if (!activeMap || !contextMenu) return;
      try {
        await flushSaveRef.current(activeMap.id);
        const updated = await linkMut.mutateAsync({
          mapId: activeMap.id,
          nodeId: contextMenu.nodeId,
          taskId,
          date,
        });
        const rebased = rebasePendingSaveRef.current(updated);
        setActiveMap(rebased);
        setMaps((cur) => cur.map((m) => (m.id === rebased.id ? rebased : m)));
        showToast(language === 'zh' ? '已关联到 Task' : 'Linked to task', 'success');
      } catch {
        showToast(language === 'zh' ? '关联失败' : 'Failed to link', 'error');
      }
    },
    [activeMap, contextMenu, linkMut, showToast, language],
  );

  const handleSetNodeTag = useCallback(async () => {
    if (!activeMap || !contextMenu) return;
    const target = activeMap.nodes.find((n) => n.id === contextMenu.nodeId);
    if (!target) return;
    try {
      await flushSaveRef.current(activeMap.id);
      const updated = await setKindMut.mutateAsync({
        mapId: activeMap.id,
        nodeId: contextMenu.nodeId,
        kind: 'tag',
        tag: target.text,
      });
      const rebased = rebasePendingSaveRef.current(updated);
      setActiveMap(rebased);
      setMaps((cur) => cur.map((m) => (m.id === rebased.id ? rebased : m)));
    } catch {
      showToast(language === 'zh' ? '标记 Tag 失败' : 'Failed to mark as tag', 'error');
    }
  }, [activeMap, contextMenu, setKindMut, showToast, language]);

  const handleUnclassifyNode = useCallback(async () => {
    if (!activeMap || !contextMenu) return;
    try {
      await flushSaveRef.current(activeMap.id);
      const updated = await setKindMut.mutateAsync({
        mapId: activeMap.id,
        nodeId: contextMenu.nodeId,
        kind: 'branch',
      });
      const rebased = rebasePendingSaveRef.current(updated);
      setActiveMap(rebased);
      setMaps((cur) => cur.map((m) => (m.id === rebased.id ? rebased : m)));
    } catch {
      showToast(language === 'zh' ? '取消分类失败' : 'Failed to unclassify', 'error');
    }
  }, [activeMap, contextMenu, setKindMut, showToast, language]);

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-layout and the manual "Re-layout" button both call fitView()
  // once the new positions land in the canvas. We bump this counter as
  // the signal so the canvas can distinguish a layout pass (re-fit) from
  // a position drag (don't re-fit, the user is already looking at the
  // result of their drag).
  const [reLayoutVersion, setReLayoutVersion] = useState(0);

  // Each map owns an independent pending patch and network chain. Switching
  // maps can no longer overwrite the previous map's debounce slot.
  const pendingSaves = useRef(new Map<string, {
    patch: MindMapPatch;
    timer: ReturnType<typeof setTimeout> | null;
  }>());
  const saveChains = useRef(new Map<string, Promise<MindMap | null>>());
  const mountedRef = useRef(true);

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

  // Topic Space v2 (Phase 1): filter the visible map list based on the
  // parent's `activeSpaceId`. We keep the full list loaded so the user
  // can hop back to "全部" without a refetch.
  const visibleMaps = useMemo(() => {
    if (activeSpaceId === null || activeSpaceId === undefined) {
      return maps;
    }
    if (activeSpaceId === '__unclassified__') {
      // Legacy / orphan: no `spaceId` means the map predates the
      // topic-space world, or it was created without a space.
      return maps.filter((m) => !m.spaceId);
    }
    // A specific space: scope to that space's `mindmapId`. If the
    // parent passed in `topicSpaces`, look it up; otherwise show all
    // maps that match by id (best-effort) and let the user click.
    const space = topicSpaces?.find((s) => s.id === activeSpaceId);
    if (space?.mindmapId) {
      return maps.filter((m) => m.id === space.mindmapId);
    }
    // Fall back: filter to maps whose `spaceId` matches even without
    // a topicSpaces reference. This lets the legacy / standalone
    // MindMap view still work when a parent doesn't pass spaces.
    return maps.filter((m) => m.spaceId === activeSpaceId);
  }, [maps, activeSpaceId, topicSpaces]);

  // Topic Space v2: when the active space changes, switch the active
  // mind map to match. We only do this for "concrete" space selections
  // (not null, not the unclassified bucket) so the user keeps manual
  // control over the aggregate / legacy views.
  useEffect(() => {
    if (!activeSpaceId || activeSpaceId === '__unclassified__') return;
    const space = topicSpaces?.find((s) => s.id === activeSpaceId);
    if (space?.mindmapId && space.mindmapId !== activeId) {
      setActiveId(space.mindmapId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSpaceId, topicSpaces]);

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

  const flushSave = useCallback((id: string): Promise<MindMap | null> => {
    const pending = pendingSaves.current.get(id);
    const previous = saveChains.current.get(id) ?? Promise.resolve(null);
    if (!pending) return previous;

    if (pending.timer) clearTimeout(pending.timer);
    pendingSaves.current.delete(id);
    const current = previous
      .catch(() => null)
      .then(() => mindmapsApi.update(id, pending.patch))
      .then((updated) => {
        if (mountedRef.current) {
          // Only merge server-owned metadata. Replacing the whole map here
          // would roll back edits made while this request was in flight.
          const mergeSavedMetadata = (map: MindMap): MindMap => map.id === updated.id
            ? { ...map, version: updated.version, updatedAt: updated.updatedAt }
            : map;
          setMaps((mapsNow) => mapsNow.map(mergeSavedMetadata));
          setActiveMap((mapNow) => mapNow ? mergeSavedMetadata(mapNow) : mapNow);
        }
        return updated;
      })
      .catch((err: any) => {
        if (mountedRef.current) {
          showToast(language === 'zh' ? '保存失败' : 'Failed to save', 'error');
        }
        console.error('[mindmap] save error:', err);
        throw err;
      })
      .finally(() => {
        if (saveChains.current.get(id) === current) saveChains.current.delete(id);
      });
    saveChains.current.set(id, current);
    return current;
  }, [language, showToast]);
  flushSaveRef.current = flushSave;

  const scheduleSave = useCallback((id: string, patch: MindMapPatch) => {
    const previous = pendingSaves.current.get(id);
    if (previous?.timer) clearTimeout(previous.timer);
    const merged: MindMapPatch = {
      ...(previous?.patch ?? {}),
      ...patch,
      ...(patch.nodes !== undefined ? { nodes: patch.nodes } : {}),
      ...(patch.edges !== undefined ? { edges: patch.edges } : {}),
    };
    const entry = { patch: merged, timer: null as ReturnType<typeof setTimeout> | null };
    entry.timer = setTimeout(() => {
      void flushSaveRef.current(id).catch(() => undefined);
    }, AUTOSAVE_DEBOUNCE_MS);
    pendingSaves.current.set(id, entry);
  }, []);

  // If edits arrive while a semantic node mutation is in flight, preserve
  // the authoritative classification fields in the later full-node save.
  rebasePendingSaveRef.current = (updated) => {
    const pending = pendingSaves.current.get(updated.id);
    if (!pending?.patch.nodes) return updated;
    pending.patch.nodes = rebaseSemanticNodeFields(pending.patch.nodes, updated.nodes);
    return { ...updated, nodes: pending.patch.nodes };
  };

  // Start every mount as live (StrictMode runs setup/cleanup twice), then
  // flush all map-specific debounce slots during the real unmount.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      for (const id of pendingSaves.current.keys()) {
        void flushSaveRef.current(id).catch(() => undefined);
      }
    };
  }, []);

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

  // When a new map is created (e.g. from a template) the nodes often
  // share the same default position (0, 0), which means they all stack
  // on top of each other in the canvas. Run the auto-layout once to
  // spread them out, then persist. We only do this when the map looks
  // "fresh" (root + at least one child, but every node still at the
  // origin), so a deliberately positioned map (e.g. one the user has
  // dragged into shape) is never silently re-laid-out.
  const lastAutoLaidMapId = useRef<string>('');
  useEffect(() => {
    if (!activeMap) return;
    if (lastAutoLaidMapId.current === activeMap.id) return;
    if (activeMap.nodes.length < 2) return;
    const allAtOrigin = activeMap.nodes.every(
      (n) => n.position.x === 0 && n.position.y === 0,
    );
    if (!allAtOrigin) return;
    lastAutoLaidMapId.current = activeMap.id;
    // Defer the layout one frame so the canvas mounts first; otherwise
    // React Flow's bounds computation can be off by a few pixels.
    const t = setTimeout(() => {
      const m = activeMap;
      const { positions } = layoutMindMap(m.rootId, m.nodes, m.edges);
      const nextNodes = m.nodes.map((n) =>
        positions[n.id] ? { ...n, position: positions[n.id] } : n,
      );
      setActiveMap({ ...m, nodes: nextNodes });
      setMaps((current) =>
        current.map((mm) => (mm.id === m.id ? { ...mm, nodes: nextNodes } : mm)),
      );
      scheduleSave(m.id, { nodes: nextNodes });
      // Tell the canvas a re-fit is coming once the resync effect lands.
      setReLayoutVersion((v) => v + 1);
    }, 30);
    return () => clearTimeout(t);
  }, [activeMap, scheduleSave]);

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
      setReLayoutVersion((v) => v + 1);
    },
    [activeMap, handleChange],
  );

  // Progress stats: how many leaf-task nodes (i.e. everything except the
  // root) are completed. We show this in the header so the user can see
  // overall progress at a glance.
  const progress = useMemo(() => {
    if (!activeMap) return { done: 0, total: 0 };
    let done = 0;
    let total = 0;
    for (const n of activeMap.nodes) {
      if (n.id === activeMap.rootId) continue;
      total += 1;
      if (n.status === 'done') done += 1;
    }
    return { done, total };
  }, [activeMap]);

  // Phase 2: task mirror. Whenever the `linkableTasks` list changes
  // (the parent refetched tasks, the user promoted a new node, the
  // task title was edited in TodayView), we look at each `kind: 'task'`
  // node and sync the visual:
  //   - status 'done' → node.status = 'done'
  //   - title changed → node.text = task.title (one-way, last writer wins)
  // The "Open task" link also needs the source date so the canvas can
  // decide whether to show the button; we build a per-node lookup and
  // hand it to the canvas.
  const { taskSourceDateByNodeId } = useMemo(() => {
    if (!activeMap || linkableTasks.length === 0) {
      return { taskSourceDateByNodeId: {} as Record<string, string> };
    }
    return {
      taskSourceDateByNodeId: buildTaskSourceDateByNodeId(activeMap.nodes, linkableTasks),
    };
  }, [activeMap, linkableTasks]);

  // Apply the mirror only when the diff is real (avoid loops). We do
  // the diff in render so a quick text edit in TodayView shows up on
  // the next map render — the user doesn't have to refresh.
  useEffect(() => {
    if (!activeMap || linkableTasks.length === 0) return;
    let dirty = false;
    const nextNodes = activeMap.nodes.map((n) => {
      if (n.kind !== 'task' || !n.taskId) return n;
      // Find the source task. We only know the date via the lookup; the
      // task itself must be fetched per-date. If we don't have it, we
      // leave the node alone (it'll be re-evaluated on the next
      // refetch).
      const task = linkableTasks.find((t) => t.id === n.taskId);
      if (!task) return n;
      const mirroredStatus: MindMapNode['status'] =
        task.status === 'done' ? 'done' : 'todo';
      const textChanged = task.title && task.title !== n.text;
      const statusChanged = (n.status ?? 'todo') !== mirroredStatus;
      if (!textChanged && !statusChanged) return n;
      dirty = true;
      return { ...n, text: task.title || n.text, status: mirroredStatus };
    });
    if (!dirty) return;
    const next: MindMap = { ...activeMap, nodes: nextNodes };
    // Persist via the existing scheduleSave path but without pushing
    // history (mirroring is not a user edit).
    setActiveMap(next);
    setMaps((cur) => cur.map((m) => (m.id === next.id ? next : m)));
    scheduleSave(next.id, { nodes: nextNodes });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkableTasks, activeMap?.id]);

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

  const handleCreateFromTemplate = useCallback(
    async (templateId: string) => {
      const template = MINDMAP_TEMPLATES.find((t) => t.id === templateId);
      if (!template) return;
      const built = template.build();
      try {
        // The server will assign a fresh id and timestamp; we just pass
        // the template's topology (with `tpl-` ids) and the server will
        // re-root at the first node.
        const created = await mindmapsApi.create({
          title: built.title,
          rootId: built.rootId,
          nodes: built.nodes,
          edges: built.edges,
        });
        setMaps((current) => [created, ...current]);
        setActiveId(created.id);
        showToast(
          language === 'zh' ? `已从「${template.title}」创建` : `Created from ${template.title}`,
          'success',
        );
      } catch (err: any) {
        showToast(
          language === 'zh' ? '创建失败' : 'Failed to create',
          'error',
        );
        console.error('[mindmap] template create error:', err);
      }
    },
    [language, showToast],
  );

  const handleExport = useCallback(
    (mapId: string) => {
      const target = maps.find((m) => m.id === mapId);
      if (!target) return;
      try {
        const json = JSON.stringify(target, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const safeTitle = (target.title || 'mindmap')
          .replace(/[^\p{L}\p{N}\-_]+/gu, '-')
          .slice(0, 60);
        a.download = `${safeTitle || 'mindmap'}-${target.id.slice(-6)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showToast(
          language === 'zh' ? '已导出' : 'Exported',
          'success',
        );
      } catch (err: any) {
        showToast(
          language === 'zh' ? '导出失败' : 'Export failed',
          'error',
        );
        console.error('[mindmap] export error:', err);
      }
    },
    [maps, language, showToast],
  );

  const handleImport = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (
          !parsed ||
          typeof parsed !== 'object' ||
          !Array.isArray(parsed.nodes) ||
          !Array.isArray(parsed.edges) ||
          typeof parsed.rootId !== 'string' ||
          typeof parsed.title !== 'string'
        ) {
          throw new Error('Invalid mind map file');
        }
        const created = await mindmapsApi.create({
          title: `${parsed.title} (导入)`,
          rootId: parsed.rootId,
          nodes: parsed.nodes,
          edges: parsed.edges,
        });
        setMaps((current) => [created, ...current]);
        setActiveId(created.id);
        showToast(
          language === 'zh' ? '已导入导图' : 'Imported mind map',
          'success',
        );
      } catch (err: any) {
        showToast(
          language === 'zh' ? '导入失败：文件格式不对' : 'Import failed: invalid file',
          'error',
        );
        console.error('[mindmap] import error:', err);
      }
    },
    [language, showToast],
  );

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
        maps={visibleMaps}
        activeId={activeId}
        language={language}
        isLoading={isListLoading}
        onSelect={(id) => setActiveId(id)}
        onCreate={handleCreate}
        onDelete={handleDelete}
        onImport={() => fileInputRef.current?.click()}
        onExport={handleExport}
      />
      <div className="min-w-0 flex-1">
        {loadError ? (
          <ErrorPanel
            message={loadError}
            language={language}
            onRetry={refreshList}
          />
        ) : !activeMap && !isMapLoading ? (
          <>
            <EmptyState
              language={language}
              onCreate={handleCreate}
              onPickTemplate={handleCreateFromTemplate}
              onImport={() => fileInputRef.current?.click()}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImport(f);
                e.target.value = '';
              }}
              className="hidden"
              data-testid="mindmap-import-input"
            />
          </>
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
              {progress.total > 0 && (
                <div
                  className={`flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] ${
                    progress.done === progress.total
                      ? 'border-[var(--color-success)]/40 bg-[var(--color-success-light)] text-[var(--color-success)]'
                      : 'border-border bg-white/80 text-text-muted'
                  }`}
                  data-testid="mindmap-progress"
                  title={
                    language === 'zh'
                      ? `${progress.done} / ${progress.total} 任务已完成`
                      : `${progress.done} of ${progress.total} tasks done`
                  }
                >
                  {progress.done === progress.total ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    <ListChecks className="h-3 w-3" />
                  )}
                  <span className="tabular-nums">
                    {progress.done}/{progress.total}
                  </span>
                </div>
              )}
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
                reLayoutVersion={reLayoutVersion}
                onNodeContextMenu={handleContextMenu}
                onNodeOpenTask={onOpenTask}
                taskSourceDateByNodeId={taskSourceDateByNodeId}
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
      {contextMenu && (
        <NodeContextMenu
          open={!!contextMenu}
          position={contextMenu.position}
          kind={contextMenu.kind}
          language={language}
          taskOptions={linkableTasks as ReadonlyArray<NodeContextMenuTaskOption>}
          onPromote={handlePromoteNode}
          onLink={handleLinkNodeToTask}
          onSetTag={handleSetNodeTag}
          onUnclassify={handleUnclassifyNode}
          onClose={closeContextMenu}
        />
      )}
    </div>
  );
}

function EmptyState({
  language,
  onCreate,
  onPickTemplate,
  onImport,
}: {
  language: 'en' | 'zh';
  onCreate: () => void;
  onPickTemplate: (templateId: string) => void;
  onImport: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 overflow-y-auto px-6 py-10">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="rounded-full bg-[var(--color-accent-light)] p-3 text-[var(--color-accent)]">
          <Network className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-semibold text-text-heading">
          {language === 'zh' ? '还没有思维导图' : 'No mind maps yet'}
        </h2>
        <p className="max-w-md text-sm text-text-muted">
          {language === 'zh'
            ? '把一个复杂问题拆成主分支和子分支，边想边整理。从空白页开始，或挑一个常用骨架：'
            : 'Break a complex topic into a root and branches. Start from scratch, or pick a starter:'}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={onCreate}
            className="rounded-md bg-[var(--color-accent)] px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[var(--color-accent)]/90"
            data-testid="mindmap-empty-new"
          >
            {language === 'zh' ? '新建空白' : 'New blank'}
          </button>
          <button
            type="button"
            onClick={onImport}
            className="rounded-md border border-border bg-white/80 px-4 py-1.5 text-sm font-medium text-text-muted shadow-sm transition-colors hover:bg-white hover:text-[var(--color-accent)]"
            data-testid="mindmap-empty-import"
          >
            {language === 'zh' ? '导入 JSON' : 'Import JSON'}
          </button>
        </div>
      </div>

      <div className="mt-2 w-full max-w-2xl">
        <div className="mb-2 text-center text-[11px] font-semibold uppercase tracking-wider text-text-muted/70">
          {language === 'zh' ? '从模板开始' : 'Start from a template'}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {MINDMAP_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onPickTemplate(t.id)}
              className="group rounded-lg border border-border bg-white/80 p-3 text-left shadow-sm transition-all hover:border-[var(--color-accent)]/40 hover:bg-white hover:shadow-md"
              data-testid={`mindmap-template-${t.id}`}
            >
              <div className="text-sm font-semibold text-text-heading">
                {t.title}
              </div>
              <div className="mt-0.5 text-[11px] text-text-muted">
                {t.hint}
              </div>
            </button>
          ))}
        </div>
      </div>
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
