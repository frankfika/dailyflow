import { describe, expect, it } from 'vitest';
import {
  NODE_HEIGHT,
  SIBLING_GAP,
  childrenOf,
  collectSubtreeIds,
  layoutEventTree,
  planChildPosition,
  planSiblingPlacement,
  subtreeBottomY,
  type PositionedNode,
} from './nodePlacement';

type Edge = { id: string; source: string; target: string };

function node(id: string, x: number, y: number): PositionedNode {
  return { id, position: { x, y } };
}

function edge(source: string, target: string, id = `e-${source}-${target}`): Edge {
  return { id, source, target };
}

describe('nodePlacement', () => {
  describe('collectSubtreeIds', () => {
    it('includes the root and all transitive descendants', () => {
      const edges = [edge('a', 'b'), edge('b', 'c'), edge('b', 'd')];
      expect(Array.from(collectSubtreeIds(edges, 'a')).sort()).toEqual(['a', 'b', 'c', 'd']);
      expect(Array.from(collectSubtreeIds(edges, 'b')).sort()).toEqual(['b', 'c', 'd']);
    });
  });

  describe('subtreeBottomY', () => {
    it('bottoms out at the node card when there are no children', () => {
      const nodes = [node('a', 0, 0)];
      expect(subtreeBottomY(nodes, [], 'a')).toBe(NODE_HEIGHT);
    });

    it('extends to the deepest descendant', () => {
      const nodes = [node('a', 0, 0), node('b', 300, 100), node('c', 300, 250)];
      const edges = [edge('a', 'b'), edge('b', 'c')];
      expect(subtreeBottomY(nodes, edges, 'a')).toBe(250 + NODE_HEIGHT);
    });

    it('ignores nodes that are not part of the subtree', () => {
      const nodes = [node('a', 0, 0), node('x', 300, 900)];
      const edges = [edge('a', 'x')];
      expect(subtreeBottomY(nodes, edges, 'a')).toBe(900 + NODE_HEIGHT);
      // A sibling of 'x' that happened to be at y=1000 is NOT part of the a-subtree.
      const nodes2 = [...nodes, node('y', 300, 1000)];
      const edges2 = [...edges, edge('a', 'y')];
      expect(subtreeBottomY(nodes2, edges2, 'x')).toBe(900 + NODE_HEIGHT);
    });
  });

  describe('childrenOf', () => {
    it('returns direct children ordered top to bottom', () => {
      const nodes = [node('a', 0, 0), node('b', 300, 200), node('c', 300, 100)];
      const edges = [edge('a', 'b'), edge('a', 'c')];
      expect(childrenOf(nodes, edges, 'a').map((n) => n.id)).toEqual(['c', 'b']);
    });
  });

  describe('planChildPosition', () => {
    it('sits at the parent height when there are no existing children', () => {
      const nodes = [node('a', 0, 0)];
      expect(planChildPosition(nodes, [], node('a', 0, 0))).toEqual({ x: 300, y: 0 });
    });

    it('sits below the deepest subtree of existing children (no overlap with grandchildren)', () => {
      const nodes = [node('a', 0, 0), node('b', 300, 100), node('c', 300, 100), node('d', 600, 250)];
      const edges = [edge('a', 'b'), edge('a', 'c'), edge('c', 'd')];
      const pos = planChildPosition(nodes, edges, node('a', 0, 0));
      // 'c' has a grandchild 'd' bottoming at 250+58; new child must clear it.
      expect(pos).toEqual({ x: 300, y: 250 + NODE_HEIGHT + SIBLING_GAP });
    });
  });

  describe('planSiblingPlacement', () => {
    it('places a plain sibling one gap below the reference', () => {
      const nodes = [node('a', 0, 0), node('b', 300, 100), node('c', 300, 300)];
      const edges = [edge('a', 'b'), edge('a', 'c')];
      const placement = planSiblingPlacement(nodes, edges, 'b');
      // Leaf ref: new sibling = ref bottom (100+58) + gap = 262.
      expect(placement.position).toEqual({ x: 300, y: 100 + NODE_HEIGHT + SIBLING_GAP });
      // 'c' (top 300) overlaps the new sibling's slot (which occupies up to
      // 262+58=320), so it is packed down to just below the new sibling.
      const packed = placement.position.y + NODE_HEIGHT + SIBLING_GAP; // = 424
      expect(placement.shifts.has('c')).toBe(true);
      expect(placement.shifts.get('c')).toEqual({ x: 300, y: packed });
    });

    it('places a sibling below the reference SUBTREE, not the reference card (no overlap)', () => {
      // 'b' has a child 'b1' at y=190, so its subtree bottoms out at 190+58.
      const nodes = [
        node('a', 0, 0),
        node('b', 300, 100),
        node('b1', 600, 190),
        node('c', 300, 340),
      ];
      const edges = [edge('a', 'b'), edge('b', 'b1'), edge('a', 'c')];
      const placement = planSiblingPlacement(nodes, edges, 'b');
      // New sibling must clear 'b1' (bottom 248): y = 248 + 104 = 352.
      expect(placement.position.y).toBe(190 + NODE_HEIGHT + SIBLING_GAP);
      // 'c' (340) overlaps the new slot (352..410), so packed to 352+58+104.
      const packed = placement.position.y + NODE_HEIGHT + SIBLING_GAP; // = 514
      expect(placement.shifts.has('c')).toBe(true);
      expect(placement.shifts.get('c')).toEqual({ x: 300, y: packed });
    });

    it('repacks a later sibling that is parked too close to the reference', () => {
      // 'c' sits at y=200, overlapping the new slot area (ref bottom 158 + gap =
      // 262). It must be pushed down below the new sibling, carrying its subtree.
      const nodes = [
        node('a', 0, 0),
        node('b', 300, 100),
        node('b1', 600, 190),
        node('c', 300, 200),
        node('c1', 600, 200),
      ];
      const edges = [edge('a', 'b'), edge('b', 'b1'), edge('a', 'c'), edge('c', 'c1')];
      const placement = planSiblingPlacement(nodes, edges, 'b');
      // New sibling below 'b' subtree (248 + 104 = 352).
      expect(placement.position.y).toBe(190 + NODE_HEIGHT + SIBLING_GAP);
      // 'c' (top 200) is packed below the new sibling; its subtree rides along.
      const dy = placement.position.y + NODE_HEIGHT + SIBLING_GAP - 200; // = 514 - 200 = 314
      expect(placement.shifts.get('c')).toEqual({ x: 300, y: 200 + dy });
      expect(placement.shifts.get('c1')).toEqual({ x: 600, y: 200 + dy });
    });

    it('shifts the whole subtree of later siblings, not just their cards', () => {
      const nodes = [
        node('a', 0, 0),
        node('b', 300, 100),
        node('c', 300, 340),
        node('c1', 600, 340),
        node('c2', 600, 520),
      ];
      const edges = [edge('a', 'b'), edge('a', 'c'), edge('c', 'c1'), edge('c', 'c2')];
      const placement = planSiblingPlacement(nodes, edges, 'b');
      // New sibling below leaf ref b: 262 (slot 262..320). Later sibling 'c'
      // (top 340) actually overlaps the pack cursor (new sibling bottom 320 +
      // gap = 424), so the whole subtree is packed down below 424.
      const packed = placement.position.y + NODE_HEIGHT + SIBLING_GAP; // = 424
      expect(placement.shifts.has('c')).toBe(true);
      expect(placement.shifts.has('c1')).toBe(true);
      expect(placement.shifts.has('c2')).toBe(true);
      const dy = packed - 340;
      expect(placement.shifts.get('c2')).toEqual({ x: 600, y: 520 + dy });
    });

    it('repacks a later sibling parked inside the new slot (no overlap)', () => {
      const nodes = [
        node('a', 0, 0),
        node('b', 300, 100),
        node('c', 300, 200),
        node('c1', 600, 200),
        node('c2', 600, 380),
      ];
      const edges = [edge('a', 'b'), edge('a', 'c'), edge('c', 'c1'), edge('c', 'c2')];
      const placement = planSiblingPlacement(nodes, edges, 'b');
      // 'c' subtree (top 200, bottom 438) overlaps the leaf-ref slot (newY=262,
      // bottom 320), so it must be pushed entirely below 320.
      const dy = placement.position.y + NODE_HEIGHT + SIBLING_GAP - 200; // = 424 - 200 = 224
      expect(placement.shifts.get('c')).toEqual({ x: 300, y: 200 + dy });
      expect(placement.shifts.get('c1')).toEqual({ x: 600, y: 200 + dy });
      expect(placement.shifts.get('c2')).toEqual({ x: 600, y: 380 + dy });
    });

    it('is a no-op for the last sibling (no later siblings to shift)', () => {
      const nodes = [node('a', 0, 0), node('b', 300, 100)];
      const edges = [edge('a', 'b')];
      const placement = planSiblingPlacement(nodes, edges, 'b');
      expect(placement.position.y).toBe(100 + NODE_HEIGHT + SIBLING_GAP);
      expect(placement.shifts.size).toBe(0);
    });
  });

  describe('layoutEventTree', () => {
    it('places root at origin and children one level right, stacked vertically', () => {
      const nodes = [node('a', 999, 999), node('b', 1, 1), node('c', 1, 1), node('d', 2, 2), node('e', 2, 2)];
      // a -> b, c; b -> d; c -> e
      const edges = [
        edge('a', 'b'), edge('a', 'c'), edge('b', 'd'), edge('c', 'e'),
      ];
      const layout = layoutEventTree(nodes, edges, 'a');
      expect(layout.get('a')).toEqual({ x: 0, y: layout.get('a')!.y }); // root at x 0
      expect(layout.get('a')!.x).toBe(0);
      expect(layout.get('b')!.x).toBe(300);
      expect(layout.get('c')!.x).toBe(300);
      expect(layout.get('d')!.x).toBe(600);
      expect(layout.get('e')!.x).toBe(600);
      // siblings b and c do not overlap: their y are separated by at least height.
      expect(Math.abs(layout.get('b')!.y - layout.get('c')!.y)).toBeGreaterThanOrEqual(NODE_HEIGHT);
    });

    it('keeps parent centered on its children and does not overlap descendants', () => {
      // a -> b (b has two children) ; a also -> c (leaf, below b's block)
      const nodes = [node('a', 0, 0), node('b', 0, 0), node('b1', 0, 0), node('b2', 0, 0), node('c', 0, 0)];
      const edges = [edge('a', 'b'), edge('b', 'b1'), edge('b', 'b2'), edge('a', 'c')];
      const layout = layoutEventTree(nodes, edges, 'a');
      const pairs: Array<[string, string]> = [['b', 'c'], ['b1', 'b2']];
      for (const [i, j] of pairs) {
        const a = layout.get(i)!, b = layout.get(j)!;
        // same x -> must be vertically separated with >= NODE_HEIGHT between centers
        expect(Math.abs(a.y - b.y)).toBeGreaterThanOrEqual(NODE_HEIGHT);
      }
      // b and its children occupy different columns.
      expect(Math.abs(layout.get('b')!.x - layout.get('b1')!.x)).toBe(300);
    });
  });
});