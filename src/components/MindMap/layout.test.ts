import { describe, expect, it } from 'vitest';
import {
  buildChildrenIndex,
  collectHiddenDescendants,
  layoutMindMap,
  toMarkdown,
} from './layout';
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

describe('collectHiddenDescendants', () => {
  function collapsed(id: string, c: boolean = true): MindMapNode {
    return { id, text: id, position: { x: 0, y: 0 }, collapsed: c };
  }

  it('returns empty when no nodes are collapsed', () => {
    const nodes = [node('r'), node('a'), node('a1')];
    const edges = [edge('r', 'a'), edge('a', 'a1')];
    expect(collectHiddenDescendants(nodes, edges).size).toBe(0);
  });

  it('hides direct children of a collapsed node', () => {
    const nodes = [collapsed('r', false), collapsed('a'), node('a1')];
    const edges = [edge('r', 'a'), edge('a', 'a1')];
    const hidden = collectHiddenDescendants(nodes, edges);
    // a is the collapsed node itself (not hidden by the helper, since it
    // is the one the user explicitly chose to collapse).
    expect(hidden.has('a')).toBe(false);
    // a1 is a descendant — it should be hidden.
    expect(hidden.has('a1')).toBe(true);
  });

  it('does not hide the collapsed node itself (only its descendants)', () => {
    const nodes = [collapsed('r', false), collapsed('a'), node('a1')];
    const edges = [edge('r', 'a'), edge('a', 'a1')];
    const hidden = collectHiddenDescendants(nodes, edges);
    expect(hidden.has('r')).toBe(false);
  });
});

describe('layoutMindMap with collapsed', () => {
  it('treats a collapsed node as a leaf in the layout', () => {
    const nodes: MindMapNode[] = [
      node('r'),
      { id: 'a', text: 'a', position: { x: 0, y: 0 }, collapsed: true },
      node('a1'),
      node('a2'),
    ];
    const edges: MindMapEdge[] = [
      edge('r', 'a'),
      edge('a', 'a1'),
      edge('a', 'a2'),
    ];
    const { positions } = layoutMindMap('r', nodes, edges);
    // a1 and a2 should not be placed by the layout (they are hidden descendants).
    expect(positions['a1']).toBeUndefined();
    expect(positions['a2']).toBeUndefined();
    // a is still placed as a single-child of r.
    expect(positions['a']).toBeDefined();
  });
});

describe('toMarkdown', () => {
  it('emits a heading for the root and nested lists for descendants', () => {
    const map = {
      rootId: 'r',
      nodes: [node('r'), node('a'), node('a1'), node('b')],
      edges: [edge('r', 'a'), edge('a', 'a1'), edge('r', 'b')],
    };
    const md = toMarkdown(map);
    expect(md).toMatch(/^# r/);
    expect(md).toMatch(/^- a/m);
    expect(md).toMatch(/^  - a1/m);
    expect(md).toMatch(/^- b/m);
  });

  it('appends a blockquote when a node has a note', () => {
    const map = {
      rootId: 'r',
      nodes: [
        { ...node('r'), note: 'top thought' },
        node('a'),
      ],
      edges: [edge('r', 'a')],
    };
    const md = toMarkdown(map);
    expect(md).toMatch(/^# r/m);
    expect(md).toMatch(/^> top thought/m);
  });

  it('skips collapsed subtrees (mirrors what the user sees)', () => {
    const map = {
      rootId: 'r',
      nodes: [
        node('r'),
        { ...node('a'), collapsed: true },
        node('a1'),
      ],
      edges: [edge('r', 'a'), edge('a', 'a1')],
    };
    const md = toMarkdown(map);
    expect(md).toMatch(/^- a/m);
    expect(md).not.toMatch(/a1/);
  });
});
