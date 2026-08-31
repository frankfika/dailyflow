/**
 * Node placement planning for the Event canvas.
 *
 * The canvas is free-positioned (the user drags nodes around), so adding a
 * sibling or child must pick a spot that does NOT overlap what is already on
 * screen. The naive `y + 104` heuristic treated every node as a single line
 * item and stacked the new node right under the reference's own card — but
 * a node with descendants occupies a whole vertical swath below it, so the
 * new node could land on top of the subtree. These helpers compute the real
 * bottom of the reference's subtree and place the new node below it, shifting
 * later siblings out of the way by the same amount.
 *
 * We also provide `layoutEventTree` — a tidy tree layout that re-zeros the
 * whole map (root at (0,0), each level one X_STEP to the right, siblings
 * stacked vertically). Use it for a one-shot "arrange as tree" pass or to
 * seed a fresh map so the canvas reads as a proper mind map instead of
 * whatever free drag positions happen to be.
 *
 * Both the server-side mutation function and the client-side optimistic
 * update must agree on placement; they call the same pure functions here.
 */
import type { MindMapEdge } from '../../../api/client';

/** Vertical gap between two sibling nodes in raw canvas units. */
export const SIBLING_GAP = 104;
/** Approximate rendered card height (used to find the bottom edge). */
export const NODE_HEIGHT = 58;
/** Horizontal distance between a parent and its child (tree layout). */
const X_STEP = 300;

interface PositionedNode {
  id: string;
  position: { x: number; y: number };
}

/** Collect every node id in the subtree rooted at `rootId` (inclusive). */
export function collectSubtreeIds(
  edges: MindMapEdge[],
  rootId: string,
): Set<string> {
  const ids = new Set<string>([rootId]);
  const queue = [rootId];
  while (queue.length) {
    const current = queue.shift()!;
    for (const edge of edges) {
      if (edge.source === current && !ids.has(edge.target)) {
        ids.add(edge.target);
        queue.push(edge.target);
      }
    }
  }
  return ids;
}

/**
 * Bottom-most Y of a node's subtree — the maximum `position.y + NODE_HEIGHT`
 * over the node and every descendant. A node without children bottoms out at
 * its own card; a node with children is bounded by the deepest descendant.
 */
export function subtreeBottomY(
  nodes: PositionedNode[],
  edges: MindMapEdge[],
  rootId: string,
): number {
  const ids = collectSubtreeIds(edges, rootId);
  let bottom = -Infinity;
  for (const node of nodes) {
    if (ids.has(node.id)) {
      bottom = Math.max(bottom, node.position.y + NODE_HEIGHT);
    }
  }
  return Number.isFinite(bottom) ? bottom : 0;
}

/** Direct children of `parentId`, ordered top-to-bottom (by Y, then X). */
export function childrenOf(
  nodes: PositionedNode[],
  edges: MindMapEdge[],
  parentId: string,
): PositionedNode[] {
  return nodes
    .filter((node) => edges.some((edge) => edge.source === parentId && edge.target === node.id))
    .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
}

/**
 * Where to place a new child of `parentId`. It sits one SIBLING_GAP below the
 * existing siblings' subtree bottoms (or at the parent's height if there are
 * none), so it never collides with grandchildren.
 */
export function planChildPosition(
  nodes: PositionedNode[],
  edges: MindMapEdge[],
  parent: PositionedNode,
): { x: number; y: number } {
  const children = childrenOf(nodes, edges, parent.id);
  const x = parent.position.x + 300;
  if (children.length === 0) {
    return { x, y: parent.position.y };
  }
  const bottom = Math.max(...children.map((child) => subtreeBottomY(nodes, edges, child.id)));
  return { x, y: bottom + SIBLING_GAP };
}

export interface SiblingPlacement {
  /** Absolute position for the new sibling node. */
  position: { x: number; y: number };
  /** Map of node id -> (dx, dy) shift applied to later siblings. */
  shifts: Map<string, { x: number; y: number }>;
}

/**
 * Where to place a new sibling right after `referenceId`, and how far later
 * siblings must shift down to stay out of the way.
 *
 * The new sibling goes directly below the reference's *subtree bottom* (one
 * SIBLING_GAP down from it), then every sibling that was previously below the
 * reference is shifted by the same delta. This keeps the free-positioned
 * canvas from stacking the new node on top of the reference's children.
 */
export function planSiblingPlacement(
  nodes: PositionedNode[],
  edges: MindMapEdge[],
  referenceId: string,
): SiblingPlacement {
  const parentEdge = edges.find((edge) => edge.target === referenceId);
  if (!parentEdge) {
    // No parent edge — treat as a child of the reference's column (root-like
    // fallback): place below the reference's subtree.
    const refNode = nodes.find((n) => n.id === referenceId);
    const y = refNode ? subtreeBottomY(nodes, edges, referenceId) + SIBLING_GAP : SIBLING_GAP;
    return {
      position: { x: refNode?.position.x ?? 0, y },
      shifts: new Map(),
    };
  }
  const refNode = nodes.find((n) => n.id === referenceId);
  if (!refNode) {
    return {
      position: { x: 0, y: SIBLING_GAP },
      shifts: new Map(),
    };
  }
  const refBottom = subtreeBottomY(nodes, edges, referenceId);

  const children = childrenOf(nodes, edges, parentEdge.source);
  const refIndex = children.findIndex((child) => child.id === referenceId);
  const later = children.slice(refIndex + 1);

  // Compact insert: the new sibling sits directly below the reference's
  // subtree, and every later sibling is re-packed below the new one — each
  // taking as much vertical room as its own subtree needs. This keeps the
  // column tight while guaranteeing no two cards overlap even when later
  // siblings were previously parked close to the reference.
  const y = refBottom + SIBLING_GAP;
  const shifts = new Map<string, { x: number; y: number }>();
  // The new sibling occupies [y, y + NODE_HEIGHT); later siblings pack
  // starting below it.
  let cursor = y + NODE_HEIGHT + SIBLING_GAP;
  for (const laterChild of later) {
    const laterIds = Array.from(collectSubtreeIds(edges, laterChild.id));
    const heights = laterIds.map((id) => nodes.find((n) => n.id === id)?.position.y ?? 0);
    const top = Math.min(...heights);
    const bottom = Math.max(...heights) + NODE_HEIGHT;
    // If this later sibling starts below where the previous siblings have been
    // packed, leave it in place and just advance the cursor past its footprint.
    // Otherwise shift it down into the cursor slot, and advance the cursor past
    // its *shifted* footprint so the next sibling cannot collide with it.
    if (top < cursor) {
      const dy = cursor - top;
      for (const id of laterIds) {
        const node = nodes.find((n) => n.id === id);
        if (node) shifts.set(id, { x: node.position.x, y: node.position.y + dy });
      }
      cursor = (bottom + dy) + SIBLING_GAP;
    } else {
      cursor = Math.max(cursor, bottom + SIBLING_GAP);
    }
  }

  return { position: { x: refNode.position.x, y }, shifts };
}

// Re-export so the type reads naturally at call sites.
export type { PositionedNode };

/**
 * A tidy tree layout for the whole event. Root sits at (0,0); each level steps
 * X_STEP to the right; siblings under the same parent stack vertically with
 * SIBLING_GAP between them, centered around their parent. Disconnected nodes
 * (no incoming edge, still reachable from storage) are packed under the tree in
 * their own column so they never disappear.
 *
 * New events are seeded with this layout so the canvas reads as a real mind
 * map; "Arrange as tree" reapplies it to re-zero a map the user has dragged
 * into a mess.
 *
 * Returns a map of nodeId -> { x, y }.
 */
export function layoutEventTree(
  nodes: PositionedNode[],
  edges: MindMapEdge[],
  rootId: string,
): Map<string, { x: number; y: number }> {
  // Children of each parent, ordered consistently (by current y, then x).
  const childrenOfParent = new Map<string, PositionedNode[]>();
  for (const node of nodes) {
    const parentEdge = edges.find((e) => e.target === node.id);
    if (!parentEdge) continue;
    const list = childrenOfParent.get(parentEdge.source) ?? [];
    list.push(node);
    childrenOfParent.set(parentEdge.source, list);
  }
  for (const list of childrenOfParent.values()) {
    list.sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
  }

  // Internal tree node: the subtree's vertical footprint in PIXELS.
  type Tree = { id: string; kids: Tree[]; height: number };
  // Indices so we can look up trees by id after building.
  const treesById = new Map<string, Tree>();

  // Bottom-up height: each child subtree fills a vertical block; siblings are
  // separated by one SIBLING_GAP. A leaf is just its own card slot.
  const buildTree = (id: string, visited: Set<string>): Tree | null => {
    if (visited.has(id)) return null; // cycle guard
    const nextVisited = new Set(visited);
    nextVisited.add(id);
    const kids = (childrenOfParent.get(id) ?? [])
      .map((k) => buildTree(k.id, nextVisited))
      .filter((k): k is Tree => k !== null);
    const height = kids.length
      ? kids.reduce((acc, k) => acc + k.height, 0) + SIBLING_GAP * (kids.length - 1)
      : NODE_HEIGHT;
    const tree: Tree = { id, kids, height };
    treesById.set(id, tree);
    return tree;
  };

  // Assign y: children pack top-down inside [blockTop, blockTop + height),
  // gap-separated; a parent centers its card on its children's vertical block.
  const yOf = new Map<string, number>();
  const assignY = (tree: Tree, blockTop: number) => {
    const kids = tree.kids;
    let cursor = blockTop;
    for (let i = 0; i < kids.length; i++) {
      assignY(kids[i], cursor);
      cursor += kids[i].height;
      if (i < kids.length - 1) cursor += SIBLING_GAP;
    }
    if (kids.length === 0) {
      yOf.set(tree.id, blockTop + NODE_HEIGHT / 2);
    } else {
      const firstTop = yOf.get(kids[0].id)! - NODE_HEIGHT / 2;
      const lastBottom = yOf.get(kids[kids.length - 1].id)! + NODE_HEIGHT / 2;
      yOf.set(tree.id, (firstTop + lastBottom) / 2);
    }
  };

  // Depth of each node relative to root (for horizontal stepping).
  const depthOf = new Map<string, number>();
  const walkDepth = (id: string, depth: number, visited: Set<string>) => {
    if (visited.has(id)) return;
    visited.add(id);
    depthOf.set(id, depth);
    for (const c of childrenOfParent.get(id) ?? []) walkDepth(c.id, depth + 1, visited);
  };

  const rootTree = buildTree(rootId, new Set());
  if (rootTree) assignY(rootTree, 0);
  walkDepth(rootId, 0, new Set());

  const result = new Map<string, { x: number; y: number }>();
  const laid = new Set<string>();
  for (const node of nodes) {
    const depth = depthOf.get(node.id) ?? 0;
    result.set(node.id, { x: depth * X_STEP, y: yOf.get(node.id) ?? 0 });
    laid.add(node.id);
  }
  // Fallback for nodes not reachable from root (broken edges).
  let orphanX = (Math.max(0, ...nodes.map((n) => depthOf.get(n.id) ?? 0)) + 1) * X_STEP;
  let orphanY = 0;
  for (const node of nodes) {
    if (laid.has(node.id)) continue;
    result.set(node.id, { x: orphanX, y: orphanY });
    orphanY += NODE_HEIGHT + SIBLING_GAP;
    laid.add(node.id);
  }
  return result;
}