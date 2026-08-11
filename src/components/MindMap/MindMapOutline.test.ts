import { describe, expect, it } from 'vitest';
import type { MindMap } from '../../api/client';
import { addOutlineChild, addOutlineNode, flattenMindMap, indentOutlineNode, moveOutlineNode, outdentOutlineNode, removeEmptyOutlineNode } from './MindMapOutline';

const map: MindMap = {
  id: 'map', title: '计划', rootId: 'root', version: 2,
  createdAt: '', updatedAt: '',
  nodes: [
    { id: 'root', text: '计划', kind: 'root', position: { x: 0, y: 0 } },
    { id: 'a', text: 'A', kind: 'branch', position: { x: 220, y: 0 } },
    { id: 'b', text: 'B', kind: 'branch', position: { x: 220, y: 80 } },
    { id: 'c', text: 'C', kind: 'branch', position: { x: 440, y: 80 } },
  ],
  edges: [
    { id: 'ra', source: 'root', target: 'a' },
    { id: 'rb', source: 'root', target: 'b' },
    { id: 'bc', source: 'b', target: 'c' },
  ],
};

describe('mind note outline operations', () => {
  it('flattens the tree in document order', () => {
    expect(flattenMindMap(map).map((row) => [row.node.id, row.depth])).toEqual([
      ['root', 0], ['a', 1], ['b', 1], ['c', 2],
    ]);
  });

  it('Enter creates a sibling, while Enter on root creates a child', () => {
    const sibling = addOutlineNode(map, 'a');
    expect(sibling.map.edges.find((edge) => edge.target === sibling.nodeId)?.source).toBe('root');
    const child = addOutlineNode(map, 'root');
    expect(child.map.edges.find((edge) => edge.target === child.nodeId)?.source).toBe('root');
  });

  it('creates a child directly for the keyboard child command', () => {
    const child = addOutlineChild(map, 'a');
    expect(child.map.edges.find((edge) => edge.target === child.nodeId)?.source).toBe('a');
  });

  it('Tab nests below the previous sibling and Shift+Tab restores the level', () => {
    const indented = indentOutlineNode(map, 'b');
    expect(indented.edges.find((edge) => edge.target === 'b')?.source).toBe('a');
    const restored = outdentOutlineNode(indented, 'b');
    expect(restored.edges.find((edge) => edge.target === 'b')?.source).toBe('root');
  });

  it('moves siblings without changing their parent', () => {
    const moved = moveOutlineNode(map, 'b', -1);
    expect(flattenMindMap(moved).map((row) => row.node.id)).toEqual(['root', 'b', 'c', 'a']);
    expect(moved.edges.find((edge) => edge.target === 'b')?.source).toBe('root');
  });

  it('removes an empty node while preserving and reparenting its children', () => {
    const removed = removeEmptyOutlineNode(map, 'b');
    expect(removed.nodes.some((node) => node.id === 'b')).toBe(false);
    expect(removed.edges.find((edge) => edge.target === 'c')?.source).toBe('root');
  });
});
