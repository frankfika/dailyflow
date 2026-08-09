import { describe, expect, it } from 'vitest';
import type { MindMap } from '../../api/client';
import { nextChildPosition } from './MindMapCanvas';

const MAP: MindMap = {
  id: 'map',
  title: 'Launch',
  rootId: 'root',
  nodes: [
    { id: 'root', text: 'Launch', kind: 'root', position: { x: 120, y: 80 } },
    { id: 'existing', text: 'Existing', kind: 'task', position: { x: 420, y: 80 } },
  ],
  edges: [{ id: 'edge', source: 'root', target: 'existing' }],
  version: 2,
  createdAt: '2026-08-09T00:00:00.000Z',
  updatedAt: '2026-08-09T00:00:00.000Z',
};

describe('nextChildPosition', () => {
  it('places the first child beside its parent', () => {
    expect(nextChildPosition({ ...MAP, nodes: [MAP.nodes[0]], edges: [] }, 'root')).toEqual({ x: 420, y: 80 });
  });

  it('places later children below siblings without moving existing nodes', () => {
    const before = structuredClone(MAP.nodes);
    expect(nextChildPosition(MAP, 'root')).toEqual({ x: 420, y: 184 });
    expect(MAP.nodes).toEqual(before);
  });
});
