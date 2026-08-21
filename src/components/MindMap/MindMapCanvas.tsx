/**
 * Mind map canvas — the React Flow surface.
 *
 * Responsibilities:
 *  - Render nodes and edges from the in-memory `MindMap`.
 *  - Translate React Flow events (drag stop, key press) into the small set
 *    of mutations the parent owns (move / add / delete / edit).
 *  - Own local UI state: which node is selected, which is being edited,
 *    and the transient "in-flight add child" target.
 *
 * All mutations flow through callbacks so the parent can debounce-persist
 * to the server. We do not call the server here.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeChange,
  type NodeMouseHandler,
  applyNodeChanges,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ulid } from 'ulid';
import {
  MINDMAP_NODE_COLORS,
  type MindMap,
  type MindMapEdge,
  type MindMapNode,
  type MindMapNodeColor,
} from '../../api/client';
import { collectHiddenDescendants, layoutMindMap } from './layout';
import { MindMapNode as MindMapNodeView } from './MindMapNode';
import type { MindMapNodeStatus } from '../../api/client';
import { Focus, LayoutGrid } from 'lucide-react';

interface MindMapCanvasProps {
  map: MindMap;
  language: 'en' | 'zh';
  /** Fired whenever the map mutates (drag, edit, add, delete). */
  onChange: (patch: {
    title?: string;
    rootId?: string;
    nodes?: MindMapNode[];
    edges?: MindMapEdge[];
  }) => void;
  /** Fired when the user wants to re-run auto-layout. */
  onRequestLayout: (positions: Record<string, { x: number; y: number }>) => void;
  /**
   * Fired when the user drags a node to a new position. Position-only
   * changes are routed through this callback so the parent can skip
   * pushing them onto the undo stack (drags would otherwise flood it).
   */
  onPositionsChange?: (positions: Record<string, { x: number; y: number }>) => void;
  /**
   * Flat list of node ids that match the current search query. The
   * canvas highlights these so the user can spot matches at a glance.
   */
  searchMatches?: string[];
  /**
   * The id of the currently focused search match. The canvas auto-pans
   * to keep this node in view.
   */
  focusedMatchId?: string | null;
  /**
   * Fired when the user presses Enter on a match (or arrow keys) so the
   * parent can move the focus to the next/previous match.
   */
  onCycleMatch?: (direction: 1 | -1) => void;
  /**
   * Bumped by the parent whenever a layout pass (auto-layout on load or
   * the "Re-layout" button) writes new positions. The canvas re-fits
   * when it sees a fresh version, but ignores position-only changes that
   * came from a drag (so the viewport doesn't snap back to fit-all
   * after the user just moved a node).
   */
  reLayoutVersion?: number;
  /**
   * Phase 2: jump to the linked task in TodayView. The canvas forwards
   * the click to the parent which owns navigation.
   */
  onNodeOpenTask?: (taskId: string, date: string) => void;
  /**
   * Phase 2: lookup of the source date for `kind === 'task'` nodes. The
   * canvas threads it into the per-node data so MindMapNode can render
   * the "Open task" button only when the date is known.
   */
  taskSourceDateByNodeId?: Readonly<Record<string, string>>;
  /** Persist the title of an already-linked task after a node edit. */
  onLinkedNodeTitleChange?: (node: MindMapNode, title: string) => void;
  /** Persist user-facing tags on an already-linked task. */
  onLinkedNodeTagsChange?: (node: MindMapNode, tags: string[]) => void;
  /** Persist the completion state of an already-linked task. */
  onLinkedNodeStatusChange?: (node: MindMapNode, status: MindMapNodeStatus) => void;
  /** Explicitly promote a non-root branch node to a persisted Task. */
  onEnsureNodeTask?: (nodeId: string) => void;
  onDeleteNodeRequest?: (nodeId: string) => void;
  /** Selection shared with the document-style outline editor. */
  selectedNodeId?: string | null;
  onNodeSelect?: (nodeId: string | null) => void;
}

interface InternalNode extends Node {
  data: Record<string, unknown>;
}

function colorIndex(color: MindMapNodeColor | undefined): number {
  if (!color) return 0;
  const i = MINDMAP_NODE_COLORS.indexOf(color);
  return i < 0 ? 0 : i;
}

function nextColor(current: MindMapNodeColor | undefined): MindMapNodeColor {
  const i = colorIndex(current);
  return MINDMAP_NODE_COLORS[(i + 1) % MINDMAP_NODE_COLORS.length];
}

function nextStatus(current: MindMapNodeStatus | undefined): MindMapNodeStatus {
  return current === 'done' ? 'todo' : 'done';
}

const CHILD_X_GAP = 300;
const CHILD_Y_GAP = 104;

/**
 * Place a new child beside its parent without moving any existing node.
 * Re-running the whole tree layout on every insertion made the content jump
 * under a stationary viewport, which felt exactly like a forced re-center.
 */
export function nextChildPosition(map: MindMap, parentId: string): { x: number; y: number } {
  const parent = map.nodes.find((node) => node.id === parentId);
  if (!parent) return { x: 0, y: 0 };
  const childIds = new Set(map.edges.filter((edge) => edge.source === parentId).map((edge) => edge.target));
  const children = map.nodes.filter((node) => childIds.has(node.id));
  return {
    x: parent.position.x + CHILD_X_GAP,
    y: children.length === 0
      ? parent.position.y
      : Math.max(...children.map((node) => node.position.y)) + CHILD_Y_GAP,
  };
}

function toRfNodes(map: MindMap): InternalNode[] {
  // Hide any node whose ancestor is collapsed — the user explicitly asked
  // for a focus view.
  const hidden = collectHiddenDescendants(map.nodes, map.edges);
  return map.nodes
    .filter((n) => !hidden.has(n.id))
    .map((n) => ({
      id: n.id,
      type: 'mindmap',
      position: n.position,
      data: {
        text: n.text,
        tags: n.tags ?? [],
        color: n.color ?? 'default',
        isRoot: n.id === map.rootId,
        // Topic Space v2 (Phase 1): plumb the node kind so the renderer
        // can show tag / task decorations. Default to 'branch' for v1
        // maps that don't have a kind on disk yet.
        kind: n.kind ?? (n.id === map.rootId ? 'root' : 'branch'),
        tag: n.tag,
        taskId: n.taskId,
      },
      draggable: true,
      selectable: true,
    }));
}

function toRfEdges(map: MindMap): Edge[] {
  // Hide edges that target a hidden descendant of a collapsed ancestor.
  const hidden = collectHiddenDescendants(map.nodes, map.edges);
  return map.edges
    .filter((e) => !hidden.has(e.target))
    .map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'straight',
      style: { stroke: 'rgba(0,0,0,0.22)', strokeWidth: 1.25 },
      animated: false,
    }));
}

function MindMapCanvasInner({
  map,
  language,
  onChange,
  onRequestLayout,
  onPositionsChange,
  searchMatches,
  focusedMatchId,
  onCycleMatch,
  reLayoutVersion,
  onNodeOpenTask,
  taskSourceDateByNodeId,
  onLinkedNodeTitleChange,
  onLinkedNodeTagsChange,
  onLinkedNodeStatusChange,
  onEnsureNodeTask,
  onDeleteNodeRequest,
  selectedNodeId,
  onNodeSelect,
}: MindMapCanvasProps) {
  // The parent owns the canonical state. We mirror it locally as RF
  // nodes/edges for interaction. Whenever the map prop changes, we resync.
  const [rfNodes, setRfNodes] = useState<InternalNode[]>(() => toRfNodes(map));
  const [rfEdges, setRfEdges] = useState<Edge[]>(() => toRfEdges(map));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [noteEditingId, setNoteEditingId] = useState<string | null>(null);
  const selectedBeforeClickRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    selectedBeforeClickRef.current = new Set(rfNodes.filter((node) => node.selected).map((node) => node.id));
  }, [rfNodes]);

  const { setCenter, getNode, getViewport, setViewport } = useReactFlow();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewportByMapIdRef = useRef<Map<string, { x: number; y: number; zoom: number }>>(new Map());

  useEffect(() => {
    if (selectedNodeId === undefined || selectedNodeId === selectedId) return;
    setSelectedId(selectedNodeId);
    setRfNodes((current) => current.map((node) => ({ ...node, selected: node.id === selectedNodeId })));
    if (!selectedNodeId) return;
    const node = getNode(selectedNodeId);
    if (node) void setCenter(node.position.x + 100, node.position.y + 30, { zoom: getViewport().zoom, duration: 180 });
  }, [selectedNodeId, selectedId, getNode, getViewport, setCenter]);

  /**
   * Center the viewport on the tree's layout bounds. fitView can race
   * with React Flow's internal store (the new positions haven't
   * propagated yet) and ends up zooming to maxZoom on just the root.
   * Computing zoom + pan from the persisted node bounds sidesteps that
   * and gives a stable result without discarding manual positioning.
   */
  const fitToBounds = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (rect.width < 32 || rect.height < 32) return; // not laid out yet
    const m = mapRef.current;
    if (m.nodes.length === 0) return;
    // Fit what is actually on screen. The previous implementation fitted a
    // freshly-computed layout instead of the user's persisted positions and
    // ignored card width, which put the rightmost node outside the viewport.
    const visibleIds = new Set(toRfNodes(m).map((node) => node.id));
    const visibleNodes = m.nodes.filter((node) => visibleIds.has(node.id));
    const minX = Math.min(...visibleNodes.map((node) => node.position.x));
    const minY = Math.min(...visibleNodes.map((node) => node.position.y));
    const maxX = Math.max(...visibleNodes.map((node) => node.position.x + (node.id === m.rootId ? 280 : 260)));
    const maxY = Math.max(...visibleNodes.map((node) => node.position.y + 100));
    const PAD = 72;
    const bounds = {
      x: minX - PAD,
      y: minY - PAD,
      width: maxX - minX + PAD * 2,
      height: maxY - minY + PAD * 2,
    };
    if (bounds.width <= 0 || bounds.height <= 0) return;
    // Leave some breathing room around the tree (10% on each axis).
    const FIT_PAD = 0.9;
    const zoom = Math.max(
      0.1,
      Math.min(1.2, Math.min((rect.width * FIT_PAD) / bounds.width, (rect.height * FIT_PAD) / bounds.height)),
    );
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    const x = rect.width / 2 - cx * zoom;
    const y = rect.height / 2 - cy * zoom;
    try {
      setViewport({ x, y, zoom }, { duration: 250 });
    } catch {
      /* setViewport may fail before the provider is mounted; ignore. */
    }
  }, [setViewport]);

  // When the focused search match changes, center the canvas on it so
  // the user doesn't have to hunt. We use setCenter (a non-animated
  // re-center) to keep navigation snappy.
  useEffect(() => {
    if (!focusedMatchId) return;
    const node = getNode(focusedMatchId);
    if (!node) return;
    const t = setTimeout(() => {
      try {
        setCenter(node.position.x + 100, node.position.y + 30, {
          zoom: 1.0,
          duration: 200,
        });
      } catch {
        /* getNode may fail before init; ignore. */
      }
    }, 30);
    return () => clearTimeout(t);
  }, [focusedMatchId, getNode, setCenter]);

  // Keep the latest map and onChange in refs so the node data callbacks
  // can close over the freshest values without forcing a decoratedNodes
  // re-memo on every parent render.
  const mapRef = useRef(map);
  const onChangeRef = useRef(onChange);
  const onPositionsChangeRef = useRef(onPositionsChange);
  const onNodeOpenTaskRef = useRef(onNodeOpenTask);
  const taskSourceDateByNodeIdRef = useRef(taskSourceDateByNodeId);
  const onLinkedNodeTitleChangeRef = useRef(onLinkedNodeTitleChange);
  const onLinkedNodeTagsChangeRef = useRef(onLinkedNodeTagsChange);
  const onLinkedNodeStatusChangeRef = useRef(onLinkedNodeStatusChange);
  const onEnsureNodeTaskRef = useRef(onEnsureNodeTask);
  const onDeleteNodeRequestRef = useRef(onDeleteNodeRequest);
  useEffect(() => {
    mapRef.current = map;
    onChangeRef.current = onChange;
    onPositionsChangeRef.current = onPositionsChange;
    onNodeOpenTaskRef.current = onNodeOpenTask;
    taskSourceDateByNodeIdRef.current = taskSourceDateByNodeId;
    onLinkedNodeTitleChangeRef.current = onLinkedNodeTitleChange;
    onLinkedNodeTagsChangeRef.current = onLinkedNodeTagsChange;
    onLinkedNodeStatusChangeRef.current = onLinkedNodeStatusChange;
    onEnsureNodeTaskRef.current = onEnsureNodeTask;
    onDeleteNodeRequestRef.current = onDeleteNodeRequest;
  });

  // Track which prop value produced the current local state so we only
  // resync when the upstream map actually changed.
  const lastSyncedMapId = useRef<string>('');
  const lastSyncedTitle = useRef<string>('');
  const lastSyncedNodeIds = useRef<string>('');
  const lastSyncedEdgeIds = useRef<string>('');
  // Fingerprint of the per-node visual fields (text / color / collapsed /
  // note) so we re-mirror when the user changes them without otherwise
  // touching topology.
  const lastSyncedVisual = useRef<string>('');
  // Last reLayoutVersion we reacted to. When the parent bumps it
  // (auto-layout on load, or the Re-layout button), we re-fit on the
  // next resync; position-only changes from a drag don't bump it.
  const lastSeenReLayoutVersion = useRef<number>(-1);

  useEffect(() => {
    const nodeIds = map.nodes.map((n) => n.id).join(',');
    const edgeIds = map.edges.map((e) => e.id).join(',');
    const visual = map.nodes
      .map((n) =>
        `${n.id}:${n.text.length}:${(n.tags ?? []).join(',')}:${n.color ?? ''}:${n.collapsed ? 1 : 0}:${(n.note ?? '').length}:${n.status ?? 'todo'}:${n.kind ?? 'branch'}:${n.taskId ?? ''}:${n.position.x.toFixed(0)},${n.position.y.toFixed(0)}`,
      )
      .join('|');
    const isNewMap = lastSyncedMapId.current !== map.id;
    const topologyChanged = nodeIds !== lastSyncedNodeIds.current || edgeIds !== lastSyncedEdgeIds.current;
    const visualChanged = visual !== lastSyncedVisual.current;
    const layoutRequested =
      reLayoutVersion !== undefined && reLayoutVersion !== lastSeenReLayoutVersion.current;
    if (layoutRequested) {
      lastSeenReLayoutVersion.current = reLayoutVersion!;
    }

    if (isNewMap) {
      setRfNodes(toRfNodes(map));
      setRfEdges(toRfEdges(map));
      setSelectedId(null);
      setEditingId(null);
      setNoteEditingId(null);
      lastSyncedMapId.current = map.id;
      lastSyncedTitle.current = map.title;
      lastSyncedNodeIds.current = nodeIds;
      lastSyncedEdgeIds.current = edgeIds;
      lastSyncedVisual.current = visual;
      const savedViewport = viewportByMapIdRef.current.get(map.id);
      const t = setTimeout(() => {
        if (savedViewport) void setViewport(savedViewport, { duration: 0 });
        else fitToBounds();
      }, 60);
      return () => clearTimeout(t);
    }

    if (topologyChanged || visualChanged) {
      setRfNodes(toRfNodes(map));
      setRfEdges(toRfEdges(map));
      lastSyncedNodeIds.current = nodeIds;
      lastSyncedEdgeIds.current = edgeIds;
      lastSyncedVisual.current = visual;
      // Re-fit the viewport when the visible tree shape changes (nodes
      // added/removed, collapse toggled) or when the parent signalled a
      // layout pass (auto-layout on load, Re-layout button). Visual-only
      // changes that came from a drag — e.g. the user repositioned a
      // single node — leave the viewport alone because the user is
      // already looking at the result of their drag.
      if (layoutRequested) {
        const t = setTimeout(() => fitToBounds(), 60);
        return () => clearTimeout(t);
      }
    }
  }, [map, fitToBounds, reLayoutVersion]);

  // Inject transient per-node UI state (selected, editing) into the RF node
  // data. The callbacks close over `mapRef` and `onChangeRef` so we don't
  // need to put `map` / `onChange` in the memo deps — that would otherwise
  // create a new node array on every parent render and feed React Flow's
  // internal store a churn that escalates into an update loop.
  const decoratedNodes = useMemo<InternalNode[]>(
    () => {
      const m = mapRef.current;
      const hidden = collectHiddenDescendants(m.nodes, m.edges);
      return rfNodes.map((n) => {
        const source = m.nodes.find((nn) => nn.id === n.id);
        const isHiddenChild = !!source && hidden.has(source.id);
        // isHiddenChild should never happen because toRfNodes already
        // filtered those, but the type-narrow keeps the predicate readable.
        void isHiddenChild;
        return {
          ...n,
          data: {
            ...n.data,
            isSelected: Boolean(n.selected),
            isEditing: n.id === editingId,
            isNoteEditing: n.id === noteEditingId,
            isSearchMatch: searchMatches ? searchMatches.includes(n.id) : false,
            isFocusedMatch: focusedMatchId === n.id,
            hasHiddenChildren: hidden.has(n.id) ||
              // A node "has hidden children" if it has children AND any
              // descendant is hidden. (Simpler: just check edges where
              // the target is hidden.)
              m.edges.some((e) => e.source === n.id && hidden.has(e.target)),
            hasChildren: m.edges.some((e) => e.source === n.id),
            collapsed: source?.collapsed ?? false,
            note: source?.note ?? '',
            tags: source?.tags ?? [],
            status: source?.status ?? 'todo',
            onStartEdit: (id: string) => {
              setEditingId(id);
              setNoteEditingId(null);
            },
            onCommitEdit: (id: string, text: string) => {
              const cur = mapRef.current;
              const source = cur.nodes.find((nn) => nn.id === id);
              const next = cur.nodes.map((nn) => (nn.id === id ? { ...nn, text } : nn));
              onChangeRef.current({ nodes: next });
              if (source?.kind === 'task' && source.taskId && source.text !== text) {
                onLinkedNodeTitleChangeRef.current?.(source, text);
              }
              setEditingId(null);
            },
            onCancelEdit: () => setEditingId(null),
            onAddChild: (id: string) => {
              const cur = mapRef.current;
              const childId = ulid();
              const edgeId = ulid();
              const child: MindMapNode = {
                id: childId,
                text: '子主题',
                tags: [],
                status: 'todo',
                kind: 'branch',
                position: nextChildPosition(cur, id),
              };
              const edge: MindMapEdge = {
                id: edgeId,
                source: id,
                target: childId,
              };
              const next = [...cur.nodes, child].map((node) =>
                node.id === id && node.collapsed ? { ...node, collapsed: false } : node,
              );
              onChangeRef.current({ nodes: next, edges: [...cur.edges, edge] });
              setSelectedId(childId);
              setEditingId(childId);
              setNoteEditingId(null);
            },
            onAddSibling: (id: string) => {
              const cur = mapRef.current;
              const parent = cur.edges.find((e) => e.target === id);
              if (!parent) return;
              const childId = ulid();
              const edgeId = ulid();
              const child: MindMapNode = {
                id: childId,
                text: '子主题',
                tags: [],
                status: 'todo',
                kind: 'branch',
                position: nextChildPosition(cur, parent.source),
              };
              const edge: MindMapEdge = {
                id: edgeId,
                source: parent.source,
                target: childId,
              };
              const next = [...cur.nodes, child].map((node) =>
                node.id === parent.source && node.collapsed ? { ...node, collapsed: false } : node,
              );
              onChangeRef.current({ nodes: next, edges: [...cur.edges, edge] });
              setSelectedId(childId);
              setEditingId(childId);
              setNoteEditingId(null);
            },
            onDelete: (id: string) => {
              const cur = mapRef.current;
              if (id === cur.rootId) return;
              if (onDeleteNodeRequestRef.current) {
                onDeleteNodeRequestRef.current(id);
                return;
              }
              const toRemove = new Set<string>([id]);
              let added = true;
              while (added) {
                added = false;
                for (const e of cur.edges) {
                  if (toRemove.has(e.source) && !toRemove.has(e.target)) {
                    toRemove.add(e.target);
                    added = true;
                  }
                }
              }
              onChangeRef.current({
                nodes: cur.nodes.filter((nn) => !toRemove.has(nn.id)),
                edges: cur.edges.filter((e) => !toRemove.has(e.source) && !toRemove.has(e.target)),
              });
            },
            onCycleColor: (id: string) => {
              const cur = mapRef.current;
              const next = cur.nodes.map((nn) =>
                nn.id === id ? { ...nn, color: nextColor(nn.color) } : nn,
              );
              onChangeRef.current({ nodes: next });
            },
            onToggleCollapsed: (id: string) => {
              const cur = mapRef.current;
              const target = cur.nodes.find((nn) => nn.id === id);
              if (!target) return;
              const newCollapsed = !target.collapsed;
              const nextNodes = cur.nodes.map((nn) =>
                nn.id === id ? { ...nn, collapsed: newCollapsed } : nn,
              );
              // Collapsing changes visibility only. Existing positions stay
              // untouched so navigation never jumps unexpectedly.
              onChangeRef.current({ nodes: nextNodes });
            },
            onStartNote: (id: string) => {
              setNoteEditingId(id);
              setEditingId(null);
            },
            onCommitNote: (id: string, note: string) => {
              const cur = mapRef.current;
              const next = cur.nodes.map((nn) => (nn.id === id ? { ...nn, note } : nn));
              onChangeRef.current({ nodes: next });
              setNoteEditingId(null);
            },
            onCommitTags: (id: string, tags: string[]) => {
              const cur = mapRef.current;
              const source = cur.nodes.find((nn) => nn.id === id);
              if (!source) return;
              const normalized = Array.from(new Set(tags.map((tag) => tag.trim().replace(/^#/, '')).filter(Boolean)));
              const next = cur.nodes.map((nn) => (nn.id === id ? { ...nn, tags: normalized } : nn));
              onChangeRef.current({ nodes: next });
              if (source.taskId) onLinkedNodeTagsChangeRef.current?.(source, normalized);
            },
            onCycleStatus: (id: string) => {
              const cur = mapRef.current;
              const source = cur.nodes.find((nn) => nn.id === id);
              const status = nextStatus(source?.status);
              const next = cur.nodes.map((nn) =>
                nn.id === id ? { ...nn, status } : nn,
              );
              onChangeRef.current({ nodes: next });
              if (source?.kind === 'task' && source.taskId) {
                onLinkedNodeStatusChangeRef.current?.(source, status);
              }
            },
            onMakeTask: (id: string) => {
              // Conversion is deliberately explicit: ordinary nodes remain
              // part of the thinking structure until the user marks one as
              // actionable.
              onEnsureNodeTaskRef.current?.(id);
            },
            onOpenTask: (taskId: string, date: string) => {
              onNodeOpenTaskRef.current?.(taskId, date);
            },
            // Phase 2: thread the mirrored task's source date so the
            // "Open task" button only renders for nodes whose task we
            // actually know about. Falls back to the node's own stored
            // source_date (a future Phase 3 enhancement) if the parent's
            // map doesn't include the date.
            sourceDate: taskSourceDateByNodeIdRef.current?.[n.id] ?? undefined,
            language,
          },
        };
      });
    },
    // Only the visual inputs to the decorator change should re-create the
    // node array. `map` and `onChange` are read via refs, not deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rfNodes, editingId, noteEditingId, searchMatches, focusedMatchId],
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const selectionChanges = changes.filter((change) => change.type === 'select');
      setRfNodes((current) => {
        const next = applyNodeChanges(changes, current) as InternalNode[];
        if (selectionChanges.length > 0) {
          setSelectedId(next.filter((node) => node.selected).at(-1)?.id ?? null);
        }
        return next;
      });
      const positionChanges = changes.filter(
        (c) => c.type === 'position' && c.position && !c.dragging,
      );
      if (positionChanges.length === 0) return;
      // Pull the latest map from the ref so this callback doesn't need to
      // recreate on every map change.
      const m = mapRef.current;
      const positionById = new Map<string, { x: number; y: number }>();
      for (const ch of positionChanges) {
        if (ch.type === 'position' && ch.position) {
          positionById.set(ch.id, ch.position);
        }
      }
      const next = m.nodes.map((nn) => {
        const p = positionById.get(nn.id);
        return p ? { ...nn, position: { x: p.x, y: p.y } } : nn;
      });
      // Route position-only changes through a separate callback so the
      // parent can skip pushing them onto the undo stack — drag commits
      // would otherwise flood it.
      if (onPositionsChangeRef.current) {
        const positions: Record<string, { x: number; y: number }> = {};
        for (const nn of next) positions[nn.id] = nn.position;
        onPositionsChangeRef.current(positions);
      } else {
        onChangeRef.current({ nodes: next });
      }
    },
    [],
  );

  const handleNodeClick: NodeMouseHandler = useCallback((event, node) => {
    const additive = event.metaKey || event.ctrlKey || event.shiftKey;
    const previous = selectedBeforeClickRef.current;
    const next = additive ? new Set(previous) : new Set<string>();
    if (additive && next.has(node.id)) next.delete(node.id);
    else next.add(node.id);
    setRfNodes((current) => current.map((item) => ({ ...item, selected: next.has(item.id) })));
    setSelectedId(node.id);
    onNodeSelect?.(node.id);
    setEditingId(null);
    setNoteEditingId(null);
  }, [onNodeSelect]);

  const handlePaneClick = useCallback(() => {
    setRfNodes((current) => current.map((node) => node.selected ? { ...node, selected: false } : node));
    setSelectedId(null);
    onNodeSelect?.(null);
    setEditingId(null);
    setNoteEditingId(null);
  }, [onNodeSelect]);

  // Keyboard shortcuts — listen at the window level (capture phase) so we
  // get the event before React Flow's own keyboard a11y layer can claim
  // it. We read selectedId and decoratedNodes from refs so the listener
  // doesn't need to re-bind on every change.
  const selectedIdRef = useRef<string | null>(null);
  const decoratedNodesRef = useRef<InternalNode[]>([]);
  const rootIdRef = useRef<string>('');
  useEffect(() => {
    selectedIdRef.current = selectedId;
    decoratedNodesRef.current = decoratedNodes;
    rootIdRef.current = map.rootId;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      const sid = selectedIdRef.current;
      if (!sid) return;
      const node = decoratedNodesRef.current.find((n) => n.id === sid);
      const data = node?.data as
        | {
            onAddChild?: (id: string) => void;
            onAddSibling?: (id: string) => void;
            onStartEdit?: (id: string) => void;
            onDelete?: (id: string) => void;
            onMakeTask?: (id: string) => void;
          }
        | undefined;
      if (!data) return;
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'Enter') {
        if (sid === rootIdRef.current) return;
        e.preventDefault();
        e.stopPropagation();
        data.onMakeTask?.(sid);
      } else if (e.key === 'Tab' || ((e.metaKey || e.ctrlKey) && e.key === 'Enter')) {
        e.preventDefault();
        e.stopPropagation();
        data.onAddChild?.(sid);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (sid === rootIdRef.current) {
          data.onStartEdit?.(sid);
        } else {
          data.onAddSibling?.(sid);
        }
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        if (sid === rootIdRef.current) return;
        e.preventDefault();
        e.stopPropagation();
        data.onDelete?.(sid);
      } else if (e.key === 'F2' || e.key === ' ') {
        if (e.key === ' ') e.preventDefault();
        data.onStartEdit?.(sid);
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, []);

  const handleAutoLayout = useCallback(() => {
    const m = mapRef.current;
    const { positions } = layoutMindMap(m.rootId, m.nodes, m.edges);
    onRequestLayout(positions);
    // The re-fit is handled by the resync effect (it sees the
    // reLayoutVersion bump from the parent) — no need to also call
    // fitView here, which would race with the new positions arriving.
  }, [onRequestLayout]);

  return (
    <div className="relative h-full w-full outline-none" ref={containerRef}>
      <ReactFlow
        nodes={decoratedNodes}
        edges={rfEdges}
        onNodesChange={handleNodesChange}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        onMoveEnd={() => {
          viewportByMapIdRef.current.set(mapRef.current.id, getViewport());
        }}
        onInit={() => {
          // React Flow applies its default viewport during initialization;
          // fitting once it is ready avoids the first-open view being pinned
          // to the canvas' top edge.
          setTimeout(fitToBounds, 80);
        }}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={null}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        zoomOnScroll={false}
        zoomOnPinch
        zoomOnDoubleClick={false}
        panOnDrag={[1, 2]}
        panOnScroll
        panOnScrollSpeed={0.8}
        selectionOnDrag
        disableKeyboardA11y
        className="bg-[var(--color-background)]"
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} color="rgba(0,0,0,0.12)" />
        <Controls
          showInteractive={false}
          className="!bottom-3 !right-3 !top-auto !left-auto !shadow-md"
        />
        <MiniMap
          pannable
          zoomable
          className="!bottom-3 !left-3 !right-auto !top-auto !h-24 !w-32 !bg-white/85 !border !border-border !rounded-md !shadow-sm"
          nodeColor={(n) => colorForMini(n)}
          maskColor="rgba(0,0,0,0.04)"
        />
      </ReactFlow>

      <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-lg border border-border bg-white/90 p-1 shadow-sm backdrop-blur-xl">
        <button type="button" onClick={fitToBounds} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-text-muted hover:bg-black/5 hover:text-text-heading" data-testid="mindmap-fit-all">
          <Focus className="h-3.5 w-3.5" />
          {language === 'zh' ? '适应全部' : 'Fit all'}
        </button>
        <button type="button" onClick={handleAutoLayout} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-text-muted hover:bg-black/5 hover:text-text-heading" data-testid="mindmap-relayout">
          <LayoutGrid className="h-3.5 w-3.5" />
          {language === 'zh' ? '整理布局' : 'Re-layout'}
        </button>
      </div>

    </div>
  );
}

const nodeTypes = { mindmap: MindMapNodeView };
const defaultEdgeOptions = { type: 'straight' as const };

function colorForMini(n: Node): string {
  const data = n.data as { color?: MindMapNodeColor } | undefined;
  switch (data?.color) {
    case 'accent':
      return '#007AFF';
    case 'warm':
    case 'warning':
      return '#FF9F0A';
    case 'success':
      return '#34C759';
    case 'danger':
      return '#FF3B30';
    default:
      return '#8E8E93';
  }
}

export function MindMapCanvas(props: MindMapCanvasProps) {
  return (
    <ReactFlowProvider>
      <MindMapCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

// Suppress unused export warnings for helpers retained for callers.
void useEdgesState;
void useNodesState;
