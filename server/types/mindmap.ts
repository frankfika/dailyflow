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
 *
 * `nodes` carry an explicit `position` so the canvas state survives a reload
 * even if the user has dragged nodes away from the auto-laid-out default.
 */
export interface MindMapNode {
  id: string;
  text: string;
  /** Optional tailwind-style color key, see MINDMAP_NODE_COLORS. */
  color?: MindMapNodeColor;
  /** x/y in canvas coordinates. */
  position: { x: number; y: number };
}

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
  version: 1;
  createdAt: string;
  updatedAt: string;
}

/** Shape used when the client creates a new map. Server fills in id/timestamps. */
export interface MindMapInput {
  title: string;
  rootId: string;
  nodes: MindMapNode[];
  edges: MindMapEdge[];
}
