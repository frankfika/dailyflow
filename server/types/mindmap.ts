/**
 * Mind map data model.
 *
 * A mind map is a single document stored as a JSON file under
 * `<workspaceRoot>/.dailyflow/mindmaps/<id>.json`. It owns:
 *   - `title`         — the user-visible name shown in the list
 *   - `nodes`         — every node, including the root
 *   - `edges`         — parent → child relationships
 *   - `rootId`        — the starting node; the auto-layout pivots from it
 *   - `version`       — schema version, bumped if the shape changes
 *   - `spaceId`       — v2 only, reverse link to the owning TopicSpace
 *
 * `nodes` carry an explicit `position` so the canvas state survives a reload
 * even if the user has dragged nodes away from the auto-laid-out default.
 */

/**
 * v2 node discriminator. `branch` is the implicit default for any node
 * written before the kind field existed (SPEC §2.2).
 *
 * Sprint 1 / Gap 1: extends with three semantic kinds — `'question'`
 * (待澄清的问题), `'resource'` (资料 / 参考链接) and `'risk'` (风险 /
 * 注意事项). They share storage semantics with `'tag'` — a label-only
 * role with no linked task — but each gets its own visual treatment
 * (see MindMapNode.tsx) and its own right-click menu entry (see
 * NodeContextMenu). All five non-root Phase-2 kinds are writable via
 * `PUT /api/mindmaps/:id/nodes/:nodeId/kind`.
 */
export type MindMapNodeKind =
  | 'root'
  | 'branch'
  | 'tag'
  | 'task'
  | 'question'
  | 'resource'
  | 'risk';

export const DEFAULT_MINDMAP_NODE_KIND: MindMapNodeKind = 'branch';

export interface MindMapNode {
  id: string;
  text: string;
  /** User-facing task labels stored directly on the node. */
  tags?: string[];
  /** Optional tailwind-style color key, see MINDMAP_NODE_COLORS. */
  color?: MindMapNodeColor;
  /** x/y in canvas coordinates. */
  position: { x: number; y: number };
  /**
   * When true, the node's children are hidden in the canvas and the
   * layout algorithm treats the node as a leaf. Persisted so the user's
   * focus survives a reload.
   */
  collapsed?: boolean;
  /**
   * Optional longer-form note attached to the node. Useful for elaborated
   * thoughts that don't belong in the headline. Hidden in the canvas
   * until the node is selected.
   */
  note?: string;
  /**
   * Optional task status. Mind maps that decompose work can flip nodes
   * between `todo` (default), `in-progress`, and `done`. Render-only —
   * not used by the layout algorithm.
   */
  status?: MindMapNodeStatus;
  /** v2: node role. Defaults to 'branch' on read for v1 nodes. */
  kind?: MindMapNodeKind;
  /** v2: tag label, used when `kind === 'tag'`. */
  tag?: string;
  /** v2: back-link to a Task. Used when `kind === 'task'`. */
  taskId?: string;
  /** Daily-note date that owns the linked Task (YYYY-MM-DD). */
  taskDate?: string;
  /** Stable sibling planning order. Lower values are planned first. */
  planOrder?: number;
}

/** Three-state task marker. `todo` is the implicit default. */
export type MindMapNodeStatus = 'todo' | 'in-progress' | 'done';

export const MINDMAP_NODE_STATUSES: readonly MindMapNodeStatus[] = [
  'todo',
  'in-progress',
  'done',
] as const;

export interface MindMapEdge {
  id: string;
  source: string;
  target: string;
}

/** Named colors keep storage JSON-readable and avoid hex soup. */
export type MindMapNodeColor =
  | 'default'
  | 'accent'
  | 'warm'
  | 'success'
  | 'warning'
  | 'danger';

export const MINDMAP_NODE_COLORS: readonly MindMapNodeColor[] = [
  'default',
  'accent',
  'warm',
  'success',
  'warning',
  'danger',
] as const;

export interface MindMap {
  id: string;
  title: string;
  rootId: string;
  nodes: MindMapNode[];
  edges: MindMapEdge[];
  /**
   * Schema version. v1 is the pre-Topic-Space format; v2 adds
   * `spaceId` and per-node `kind` / `tag` / `taskId`. The server
   * auto-bumps to v2 on any PUT (SPEC §3.3).
   */
  version: 1 | 2;
  /** v2: reverse link to the owning TopicSpace. Optional — v1 maps have no value. */
  spaceId?: string;
  createdAt: string;
  updatedAt: string;
}

/** Shape used when the client creates a new map. Server fills in id/timestamps. */
export interface MindMapInput {
  title: string;
  rootId: string;
  nodes: MindMapNode[];
  edges: MindMapEdge[];
  /** v2 only: back-link to the TopicSpace this map was created for. */
  spaceId?: string;
}
