import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ReactFlow, ReactFlowProvider } from '@xyflow/react';
import { MindMapNode, type MindMapNodeData } from './MindMapNode';

beforeAll(() => {
  if (typeof window !== 'undefined' && !('ResizeObserver' in window)) {
    (window as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver = class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    } as unknown as typeof ResizeObserver;
  }
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
    tags: [],
    color: 'default',
    isRoot: false,
    isSelected: false,
    isEditing: false,
    hasChildren: false,
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
    onToggleCollapsed: vi.fn(),
    onCommitTags: vi.fn(),
    onCycleStatus: vi.fn(),
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

describe('MindMapNode — explicit task model', () => {
  it('keeps a legacy non-root node as a normal branch', () => {
    renderNode('legacy', makeData({ kind: undefined }));
    expect(screen.getByTestId('mindmap-node-legacy')).toHaveAttribute('data-kind', 'branch');
    expect(screen.queryByTestId('mindmap-status-legacy')).not.toBeInTheDocument();
  });

  it('keeps the center topic separate from tasks', () => {
    renderNode('root', makeData({ text: '中心', isRoot: true, kind: 'root' }));
    expect(screen.getByTestId('mindmap-node-root')).toHaveAttribute('data-kind', 'root');
    expect(screen.queryByTestId('mindmap-status-root')).not.toBeInTheDocument();
  });

  it('keeps a tag node distinct from a task node', () => {
    renderNode('tagged', makeData({ text: '起草合同', kind: 'tag', tags: ['法务', '重要'] }));
    expect(screen.getByTestId('mindmap-node-tagged')).toHaveAttribute('data-kind', 'tag');
    expect(screen.queryByTestId('mindmap-status-tagged')).not.toBeInTheDocument();
  });

  it('does not expose an internal linked-task id inside the node', () => {
    renderNode('linked', makeData({ text: '起草合同', kind: 'task', taskId: 'task-abcdef1234', sourceDate: '2026-08-09' }));
    expect(screen.getByTestId('mindmap-node-linked')).not.toHaveTextContent('1234');
    expect(screen.getByTestId('mindmap-task-meta-linked')).toHaveTextContent('任务');
    expect(screen.getByTestId('mindmap-task-meta-linked')).toHaveTextContent('2026-08-09');
  });

  it('edits tags from one compact selected-node action', () => {
    const onCommitTags = vi.fn();
    renderNode('task-tags', makeData({ kind: 'task', isSelected: true, onCommitTags }));
    fireEvent.click(screen.getByTestId('mindmap-edit-tags-task-tags'));
    const input = screen.getByTestId('mindmap-tags-input-task-tags');
    fireEvent.change(input, { target: { value: '#工作, 重要 工作' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommitTags).toHaveBeenCalledWith('task-tags', ['工作', '重要']);
  });

  it('offers an explicit task conversion action for a selected branch', () => {
    const onMakeTask = vi.fn();
    renderNode('branch', makeData({ kind: 'branch', isSelected: true, onMakeTask }));
    fireEvent.click(screen.getByTestId('mindmap-make-task-branch'));
    expect(onMakeTask).toHaveBeenCalledWith('branch');
  });
});
