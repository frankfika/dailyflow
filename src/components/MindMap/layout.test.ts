import { describe, expect, it } from 'vitest';
import { layoutMindMap, buildChildrenIndex } from './layout';
import type { MindMapEdge, MindMapNode } from '../../api/client';

function node(id: string, x = 0, y = 0): MindMapNode {
  return { id, text: id, position: { x, y } };
}

function edge(source: string, target: string): MindMapEdge {
  return { id: `${source}->${target}`, source, target };
}

describe('layoutMindMap', () => {
  it('places the root at (0, 0) when alone (post-normalization)', () => {
    const root = node('r');
    const { positions } = layoutMindMap('r', [root], []);
    expect(positions['r']).toEqual({ x: 0, y: 0 });
  });

  it('places every direct child one level to the right of the root', () => {
    const nodes = [node('r'), node('a'), node('b'), node('c')];
    const edges = [edge('r', 'a'), edge('r', 'b'), edge('r', 'c')];
    const { positions } = layoutMindMap('r', nodes, edges);
    expect(positions['r'].x).toBe(0);
    for (const id of ['a', 'b', 'c']) {
      expect(positions[id].x).toBeGreaterThan(positions['r'].x);
    }
  });

  it('centers a single-child subtree around the parent', () => {
    const nodes = [node('r'), node('a'), node('a1'), node('a2')];
    const edges = [edge('r', 'a'), edge('a', 'a1'), edge('a', 'a2')];
    const { positions } = layoutMindMap('r', nodes, edges);
    // a is the only child, so it sits at the parent's y.
    expect(positions['a'].y).toBe(positions['r'].y);
    // a1 and a2 are stacked around a.
    expect(positions['a1'].y).toBeLessThan(positions['a2'].y);
  });

  it('does not overlap sibling subtrees with different widths', () => {
    // r has two children: a (with one grand-child) and b (no children).
    // b's vertical slot should not sit on top of a's subtree.
    const nodes = [node('r'), node('a'), node('a1'), node('b')];
    const edges = [edge('r', 'a'), edge('a', 'a1'), edge('r', 'b')];
    const { positions } = layoutMindMap('r', nodes, edges);
    // a and b are direct children of r, so they share the same x.
    expect(positions['a'].x).toBe(positions['b'].x);
    // a1 is a grand-child, so its x is one level deeper.
    expect(positions['a1'].x).toBeGreaterThan(positions['b'].x);
    // Their y values must differ.
    expect(positions['a1'].y).not.toBe(positions['b'].y);
  });

  it('produces deterministic positions for a given topology', () => {
    const nodes = [node('r'), node('a'), node('b'), node('a1')];
    const edges = [edge('r', 'a'), edge('r', 'b'), edge('a', 'a1')];
    const a = layoutMindMap('r', nodes, edges);
    const b = layoutMindMap('r', nodes, edges);
    expect(a.positions).toEqual(b.positions);
  });

  it('ignores cycles without throwing', () => {
    // Pathological: r -> a, a -> r. The first edge puts a as a child of r;
    // the second would make r a child of a. We only visit nodes once so the
    // cycle is broken; the result still has positions for r and a.
    const nodes = [node('r'), node('a')];
    const edges = [edge('r', 'a'), edge('a', 'r')];
    const { positions } = layoutMindMap('r', nodes, edges);
    expect(positions['r']).toBeDefined();
    expect(positions['a']).toBeDefined();
  });

  it('buildChildrenIndex returns parent -> [childIds]', () => {
    const edges = [edge('r', 'a'), edge('r', 'b'), edge('a', 'a1')];
    const idx = buildChildrenIndex(edges);
    expect(idx.get('r')).toEqual(['a', 'b']);
    expect(idx.get('a')).toEqual(['a1']);
  });
});
