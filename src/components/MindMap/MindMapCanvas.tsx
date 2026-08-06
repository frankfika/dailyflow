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
import { layoutMindMap } from './layout';
import { MindMapNode as MindMapNodeView } from './MindMapNode';

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

function toRfNodes(map: MindMap): InternalNode[] {
  return map.nodes.map((n) => ({
    id: n.id,
    type: 'mindmap',
    position: n.position,
    data: {
      text: n.text,
      color: n.color ?? 'default',
      isRoot: n.id === map.rootId,
    },
    draggable: true,
    selectable: true,
  }));
}

function toRfEdges(map: MindMap): Edge[] {
  return map.edges.map((e) => ({
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
}: MindMapCanvasProps) {
  // The parent owns the canonical state. We mirror it locally as RF
  // nodes/edges for interaction. Whenever the map prop changes, we resync.
  const [rfNodes, setRfNodes] = useState<InternalNode[]>(() => toRfNodes(map));
  const [rfEdges, setRfEdges] = useState<Edge[]>(() => toRfEdges(map));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { fitView } = useReactFlow();

  // Keep the latest map and onChange in refs so the node data callbacks
  // can close over the freshest values without forcing a decoratedNodes
  // re-memo on every parent render.
  const mapRef = useRef(map);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    mapRef.current = map;
    onChangeRef.current = onChange;
  });

  // Track which prop value produced the current local state so we only
  // resync when the upstream map actually changed.
  const lastSyncedMapId = useRef<string>('');
  const lastSyncedTitle = useRef<string>('');
  const lastSyncedNodeIds = useRef<string>('');
  const lastSyncedEdgeIds = useRef<string>('');

  useEffect(() => {
    const nodeIds = map.nodes.map((n) => n.id).join(',');
    const edgeIds = map.edges.map((e) => e.id).join(',');
    const isNewMap = lastSyncedMapId.current !== map.id || lastSyncedTitle.current !== map.title;
    const topologyChanged = nodeIds !== lastSyncedNodeIds.current || edgeIds !== lastSyncedEdgeIds.current;

    if (isNewMap) {
      setRfNodes(toRfNodes(map));
      setRfEdges(toRfEdges(map));
      setSelectedId(null);
      setEditingId(null);
      lastSyncedMapId.current = map.id;
      lastSyncedTitle.current = map.title;
      lastSyncedNodeIds.current = nodeIds;
      lastSyncedEdgeIds.current = edgeIds;
      const t = setTimeout(() => {
        try {
          fitView({ padding: 0.25, maxZoom: 1.2, minZoom: 0.2, duration: 300 });
        } catch {
          /* fitView may fail before the provider is mounted; ignore. */
        }
      }, 50);
      return () => clearTimeout(t);
    }

    if (topologyChanged) {
      setRfNodes(toRfNodes(map));
      setRfEdges(toRfEdges(map));
      lastSyncedNodeIds.current = nodeIds;
      lastSyncedEdgeIds.current = edgeIds;
    }
  }, [map, fitView]);

  // Inject transient per-node UI state (selected, editing) into the RF node
  // data. The callbacks close over `mapRef` and `onChangeRef` so we don't
  // need to put `map` / `onChange` in the memo deps — that would otherwise
  // create a new node array on every parent render and feed React Flow's
  // internal store a churn that escalates into an update loop.
  const decoratedNodes = useMemo<InternalNode[]>(
    () =>
      rfNodes.map((n) => ({
        ...n,
        selected: n.id === selectedId,
        data: {
          ...n.data,
          isSelected: n.id === selectedId,
          isEditing: n.id === editingId,
          onStartEdit: (id: string) => setEditingId(id),
          onCommitEdit: (id: string, text: string) => {
            const m = mapRef.current;
            const next = m.nodes.map((nn) => (nn.id === id ? { ...nn, text } : nn));
            onChangeRef.current({ nodes: next });
            setEditingId(null);
          },
          onCancelEdit: () => setEditingId(null),
          onAddChild: (id: string) => {
            const m = mapRef.current;
            const childId = ulid();
            const edgeId = ulid();
            const child: MindMapNode = {
              id: childId,
              text: '子主题',
              color: 'default',
              position: { x: 0, y: 0 },
            };
            const edge: MindMapEdge = {
              id: edgeId,
              source: id,
              target: childId,
            };
            const { positions } = layoutMindMap(m.rootId, [...m.nodes, child], [...m.edges, edge]);
            const next = [...m.nodes, child].map((nn) =>
              nn.id in positions ? { ...nn, position: positions[nn.id] } : nn,
            );
            onChangeRef.current({ nodes: next, edges: [...m.edges, edge] });
            setSelectedId(childId);
            setEditingId(childId);
          },
          onAddSibling: (id: string) => {
            const m = mapRef.current;
            const parent = m.edges.find((e) => e.target === id);
            if (!parent) return;
            const childId = ulid();
            const edgeId = ulid();
            const child: MindMapNode = {
              id: childId,
              text: '子主题',
              color: 'default',
              position: { x: 0, y: 0 },
            };
            const edge: MindMapEdge = {
              id: edgeId,
              source: parent.source,
              target: childId,
            };
            const { positions } = layoutMindMap(m.rootId, [...m.nodes, child], [...m.edges, edge]);
            const next = [...m.nodes, child].map((nn) =>
              nn.id in positions ? { ...nn, position: positions[nn.id] } : nn,
            );
            onChangeRef.current({ nodes: next, edges: [...m.edges, edge] });
            setSelectedId(childId);
            setEditingId(childId);
          },
          onDelete: (id: string) => {
            const m = mapRef.current;
            if (id === m.rootId) return;
            const toRemove = new Set<string>([id]);
            let added = true;
            while (added) {
              added = false;
              for (const e of m.edges) {
                if (toRemove.has(e.source) && !toRemove.has(e.target)) {
                  toRemove.add(e.target);
                  added = true;
                }
              }
            }
            onChangeRef.current({
              nodes: m.nodes.filter((nn) => !toRemove.has(nn.id)),
              edges: m.edges.filter((e) => !toRemove.has(e.source) && !toRemove.has(e.target)),
            });
          },
          onCycleColor: (id: string) => {
            const m = mapRef.current;
            const next = m.nodes.map((nn) =>
              nn.id === id ? { ...nn, color: nextColor(nn.color) } : nn,
            );
            onChangeRef.current({ nodes: next });
          },
        },
      })),
    // Only the visual inputs to the decorator change should re-create the
    // node array. `map` and `onChange` are read via refs, not deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rfNodes, selectedId, editingId],
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setRfNodes((current) => applyNodeChanges(changes, current) as InternalNode[]);
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
      onChangeRef.current({ nodes: next });
    },
    [],
  );

  const handleNodeClick: NodeMouseHandler = useCallback((_e, node) => {
    setSelectedId(node.id);
    setEditingId(null);
  }, []);

  const handlePaneClick = useCallback(() => {
    setSelectedId(null);
    setEditingId(null);
  }, []);

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
          }
        | undefined;
      if (!data) return;
      if (e.key === 'Tab') {
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
    setTimeout(() => {
      try {
        fitView({ padding: 0.25, maxZoom: 1.2, minZoom: 0.2, duration: 300 });
      } catch {
        /* ignore */
      }
    }, 80);
  }, [onRequestLayout, fitView]);

  return (
    <div className="relative h-full w-full outline-none">
      <ReactFlow
        nodes={decoratedNodes}
        edges={rfEdges}
        onNodesChange={handleNodesChange}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        fitViewOptions={{ padding: 0.25, maxZoom: 1.2, minZoom: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={null}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        zoomOnScroll
        panOnDrag
        panOnScroll={false}
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

      <button
        type="button"
        onClick={handleAutoLayout}
        className="absolute right-3 top-3 z-10 rounded-md border border-border bg-white/90 px-2.5 py-1 text-xs font-medium text-text-muted shadow-sm transition-colors hover:bg-white hover:text-text-heading"
        title={language === 'zh' ? '重新整理布局' : 'Re-layout'}
      >
        {language === 'zh' ? '整理布局' : 'Re-layout'}
      </button>
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
