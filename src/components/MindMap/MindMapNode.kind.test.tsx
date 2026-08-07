/**
 * MindMapNode — Topic Space v2 (Phase 1) kind rendering.
 *
 * The component is a React Flow custom node, so we drive it through the
 * full React Flow provider rather than reaching into its internals. Each
 * test renders a single node of a given kind and asserts on the
 * `data-testid` / `data-kind` hooks it emits, plus a couple of CSS
 * classes that distinguish the visual treatment.
 */
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ReactFlow, ReactFlowProvider } from '@xyflow/react';
import { MindMapNode, type MindMapNodeData } from './MindMapNode';
import type { MindMapNodeKind } from '../../api/client';

// React Flow calls ResizeObserver on mount; jsdom doesn't ship one.
beforeAll(() => {
  if (typeof window !== 'undefined' && !('ResizeObserver' in window)) {
    (window as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver = class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    } as unknown as typeof ResizeObserver;
  }
  // React Flow also looks for getBoundingClientRect. jsdom returns 0/0
  // by default which is fine; just make sure matchMedia is here.
  if (typeof window !== 'undefined' && !window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: () => ({
        matches: false,
        media: '',
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => {},
      }),
    });
  }
});

afterEach(() => cleanup());

const NODE_TYPES = { mindmap: MindMapNode };

function makeData(overrides: Partial<MindMapNodeData> = {}): MindMapNodeData {
  return {
    text: 'Sample',
    color: 'default',
    isRoot: false,
    isSelected: false,
    isEditing: false,
    hasHiddenChildren: false,
    collapsed: false,
    note: '',
    status: 'todo',
    isSearchMatch: false,
    isFocusedMatch: false,
    kind: 'branch',
    onStartEdit: vi.fn(),
    onCommitEdit: vi.fn(),
    onCancelEdit: vi.fn(),
    onAddChild: vi.fn(),
    onAddSibling: vi.fn(),
    onDelete: vi.fn(),
    onCycleColor: vi.fn(),
    onToggleCollapsed: vi.fn(),
    onCommitNote: vi.fn(),
    onStartNote: vi.fn(),
    onCycleStatus: vi.fn(),
    isNoteEditing: false,
    ...overrides,
  };
}

function renderNode(id: string, data: MindMapNodeData) {
  return render(
    <ReactFlowProvider>
      <ReactFlow
        nodes={[{ id, type: 'mindmap', position: { x: 0, y: 0 }, data: data as unknown as Record<string, unknown> }]}
        edges={[]}
        nodeTypes={NODE_TYPES}
        fitView={false}
      />
    </ReactFlowProvider>,
  );
}

describe('MindMapNode — kind rendering', () => {
  it('defaults missing kind to branch (legacy v1 data)', () => {
    const data = makeData({ kind: undefined as unknown as MindMapNodeKind });
    renderNode('n1', data);
    const root = screen.getByTestId('mindmap-node-n1');
    expect(root.getAttribute('data-kind')).toBe('branch');
  });

  it('renders the root kind as expected', () => {
    renderNode('root', makeData({ text: '中心', isRoot: true, kind: 'root' }));
    const root = screen.getByTestId('mindmap-node-root');
    expect(root.getAttribute('data-kind')).toBe('root');
  });

  it('renders a tag node with the tag icon and an opacity hint', () => {
    renderNode('tag1', makeData({ text: 'priority', kind: 'tag', tag: 'priority' }));
    const root = screen.getByTestId('mindmap-node-tag1');
    expect(root.getAttribute('data-kind')).toBe('tag');
    // The tag icon is present (data-testid is suffixed with the node id).
    expect(screen.getByTestId('mindmap-kind-tag-tag1')).toBeInTheDocument();
    // Dashed-border + opacity-70 hint applied to the card.
    expect(root.querySelector('.border-dashed')).not.toBeNull();
    expect(root.querySelector('.opacity-70')).not.toBeNull();
  });

  it('renders a task node with the linked task id suffix', () => {
    renderNode(
      'task1',
      makeData({ text: '起草合同', kind: 'task', taskId: 'task-abcdef1234' }),
    );
    const root = screen.getByTestId('mindmap-node-task1');
    expect(root.getAttribute('data-kind')).toBe('task');
    const linkBadge = screen.getByTestId('mindmap-kind-task-task1');
    expect(linkBadge).toBeInTheDocument();
    // The id prefix is the trailing 6 chars.
    expect(linkBadge.textContent).toContain('1234');
    // The accent left border distinguishes the task kind visually.
    expect(root.querySelector('.border-l-\\[var\\(--color-accent\\)\\]')).not.toBeNull();
  });

  it('keeps the branch kind visually identical to the legacy default', () => {
    renderNode('branch1', makeData({ text: '普通', kind: 'branch' }));
    const root = screen.getByTestId('mindmap-node-branch1');
    expect(root.getAttribute('data-kind')).toBe('branch');
    // No tag / task decoration.
    expect(screen.queryByTestId('mindmap-kind-tag-branch1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mindmap-kind-task-branch1')).not.toBeInTheDocument();
  });
});
