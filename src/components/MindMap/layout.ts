/**
 * Horizontal tree layout for mind maps.
 *
 * Given a root id, a list of nodes, and a list of parent->child edges,
 * assign each node a (x, y) position such that:
 *   - The root sits at (0, 0).
 *   - Every child is placed one level to the right of its parent.
 *   - Children are distributed vertically around their parent's y,
 *     centered as a group so the whole subtree is balanced.
 *   - Sibling subtrees that share a parent do not overlap.
 *
 * The algorithm is a simple post-order layout:
 *   1. Recursively compute each node's "subtree height" (sum of leaf
 *      vertical slots) and the y position of each child.
 *   2. After computing positions, shift the whole layout so the root
 *      is at (0, 0). This keeps consumers from having to translate.
 *
 * Complexity is O(N) for a tree. The result is a list of positions
 * keyed by node id; positions are deterministic for a given topology.
 */
import type { MindMapEdge, MindMapNode } from '../../api/client';

export const LEVEL_GAP = 220; // horizontal distance between parent and child
export const SIBLING_GAP = 16; // vertical padding between sibling subtrees

export interface LayoutResult {
  positions: Record<string, { x: number; y: number }>;
  /** Bounding box of the layout in canvas units (x, y, w, h). */
  bounds: { x: number; y: number; width: number; height: number };
}

interface InternalNode {
  id: string;
  children: InternalNode[];
  parentId: string | null;
  /** Subtree height in vertical slots (1 = one node's worth of space). */
  height: number;
  /** Final assigned y, computed in step 2. */
  y: number;
}

const NODE_SLOT = 72; // each node's vertical footprint; matches a single-line card

function slotHeight(): number {
  return NODE_SLOT;
}

function buildTree(
  rootId: string,
  edges: MindMapEdge[],
): InternalNode | null {
  const childMap = new Map<string, string[]>();
  for (const e of edges) {
    const list = childMap.get(e.source) ?? [];
    list.push(e.target);
    childMap.set(e.source, list);
  }

  const visited = new Set<string>();

  const visit = (id: string, parentId: string | null): InternalNode | null => {
    if (visited.has(id)) return null; // guard against cycles in malformed input
    visited.add(id);
    const childIds = childMap.get(id) ?? [];
    const children: InternalNode[] = [];
    for (const c of childIds) {
      const node = visit(c, id);
      if (node) children.push(node);
    }
    return { id, children, parentId, height: 0, y: 0 };
  };

  return visit(rootId, null);
}

function computeHeights(node: InternalNode): number {
  if (node.children.length === 0) {
    node.height = slotHeight();
    return node.height;
  }
  let total = 0;
  for (const c of node.children) {
    total += computeHeights(c);
  }
  // Add the node's own slot + a small gap between children.
  node.height = Math.max(slotHeight(), total + SIBLING_GAP * Math.max(0, node.children.length - 1));
  return node.height;
}

function assignY(node: InternalNode, topY: number): number {
  // The node itself sits at the vertical center of its allotted height.
  node.y = topY + node.height / 2;
  let cursor = topY;
  for (const c of node.children) {
    assignY(c, cursor);
    cursor += c.height + SIBLING_GAP;
  }
  return node.y;
}

/**
 * Normalize positions so the root sits at (0, 0) regardless of how much
 * vertical space its subtree consumed. This keeps consumers (e.g. fitView)
 * from having to compensate for tree size.
 */
function shiftToRootOrigin(positions: Record<string, { x: number; y: number }>, rootId: string): void {
  const root = positions[rootId];
  if (!root) return;
  for (const id of Object.keys(positions)) {
    positions[id] = {
      x: positions[id].x - root.x,
      y: positions[id].y - root.y,
    };
  }
}

function collect(node: InternalNode, out: Record<string, { x: number; y: number }>, depth: number, rootX: number): void {
  out[node.id] = { x: rootX + depth * LEVEL_GAP, y: node.y };
  for (const c of node.children) {
    collect(c, out, depth + 1, rootX);
  }
}

/**
 * Compute a layout for a forest that may be disconnected (multiple roots).
 * Each disconnected component is laid out as a separate tree, stacked
 * vertically. The first node passed in is treated as the primary root.
 */
export function layoutMindMap(
  rootId: string,
  nodes: MindMapNode[],
  edges: MindMapEdge[],
): LayoutResult {
  if (nodes.length === 0) {
    return { positions: {}, bounds: { x: 0, y: 0, width: 0, height: 0 } };
  }

  const positions: Record<string, { x: number; y: number }> = {};
  let cursorY = 0;

  // Primary tree from the chosen root.
  const primary = buildTree(rootId, edges);
  if (primary) {
    computeHeights(primary);
    assignY(primary, cursorY);
    collect(primary, positions, 0, 0);
    cursorY += primary.height + SIBLING_GAP * 4;
  }

  // Disconnected nodes (no incoming edge and not the primary root) are
  // rendered as small trees below. This keeps orphan nodes from disappearing
  // if an edge accidentally points to a non-existent parent.
  const childMap = new Map<string, string[]>();
  for (const e of edges) {
    const list = childMap.get(e.source) ?? [];
    list.push(e.target);
    childMap.set(e.source, list);
  }
  const inMap = new Set(edges.map((e) => e.target));
  for (const n of nodes) {
    if (positions[n.id] || n.id === rootId) continue;
    const hasParent = inMap.has(n.id);
    if (hasParent) continue; // safety: should have been placed by primary
    const sub = buildTree(n.id, edges);
    if (!sub) continue;
    computeHeights(sub);
    assignY(sub, cursorY);
    collect(sub, positions, 0, 0);
    cursorY += sub.height + SIBLING_GAP * 4;
  }

  // Normalize so the root sits at (0, 0). Without this, the root is at the
  // center of its allotted slot — visually correct, but inconvenient for
  // downstream consumers that expect root-relative coordinates.
  shiftToRootOrigin(positions, rootId);

  // Compute bounds for fitView / minimap use.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of Object.values(positions)) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  // Pad the bounds so the edges/labels don't clip the view.
  const PAD = 80;
  const bx = minX === Infinity ? 0 : minX - PAD;
  const by = minY === Infinity ? 0 : minY - PAD;
  const bw = maxX === Infinity ? 0 : maxX - bx + PAD;
  const bh = maxY === Infinity ? 0 : maxY - by + PAD;
  return { positions, bounds: { x: bx, y: by, width: bw, height: bh } };
}

/**
 * Build a child id list keyed by parent id. Useful for tree traversal in
 * the UI (e.g. "select first child of X").
 */
export function buildChildrenIndex(edges: MindMapEdge[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const e of edges) {
    const list = m.get(e.source) ?? [];
    list.push(e.target);
    m.set(e.source, list);
  }
  return m;
}
