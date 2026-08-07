/**
 * MindMapView — task mirror integration test.
 *
 * Phase 2 promises that `kind: 'task'` nodes follow the linked task's
 * status + title one-way. Rather than render the full MindMapView
 * (which would force a full React Flow + network stack), we extract
 * the mirror logic into a focused test: a node bound to a task whose
 * title / status changes should re-render with the new text.
 *
 * We drive this through MindMapNode — the rendered surface for a
 * single node — and check that the visual text + status reflect the
 * latest linkableTasks input.
 */
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ReactFlow, ReactFlowProvider } from '@xyflow/react';
import { MindMapNode, type MindMapNodeData } from './MindMapNode';
import type { MindMapNodeKind, MindMapNodeStatus } from '../../api/client';

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

describe('MindMapNode — task mirror (Phase 2)', () => {
  it('keeps the latest task title and status when the parent re-renders with new data', () => {
    // First render: the node is bound to a task and shows the task's
    // current title. The parent's data has been pushed down from the
    // `linkableTasks` lookup in MindMapView.
    const { rerender } = render(
      <ReactFlowProvider>
        <ReactFlow
          nodes={[{
            id: 'tn1',
            type: 'mindmap',
            position: { x: 0, y: 0 },
            data: makeData({ text: '起草合同', kind: 'task' as MindMapNodeKind, taskId: 't1', status: 'todo' as MindMapNodeStatus }) as unknown as Record<string, unknown>,
          }]}
          edges={[]}
          nodeTypes={NODE_TYPES}
          fitView={false}
        />
      </ReactFlowProvider>,
    );
    // The node renders the title text.
    expect(screen.getByTestId('mindmap-node-tn1').textContent).toContain('起草合同');
    // Status icon is the empty circle.
    const statusBtn = screen.getByTestId('mindmap-status-tn1');
    expect(statusBtn.getAttribute('title')).toContain('待办');

    // Now the parent re-renders with the new title (from a refreshed
    // task list) and a 'done' status. The mirror inside MindMapView
    // does this when the linkableTasks array changes; here we just
    // re-render with the new data to confirm the visual updates.
    rerender(
      <ReactFlowProvider>
        <ReactFlow
          nodes={[{
            id: 'tn1',
            type: 'mindmap',
            position: { x: 0, y: 0 },
            data: makeData({ text: '起草合同（已审计）', kind: 'task' as MindMapNodeKind, taskId: 't1', status: 'done' as MindMapNodeStatus }) as unknown as Record<string, unknown>,
          }]}
          edges={[]}
          nodeTypes={NODE_TYPES}
          fitView={false}
        />
      </ReactFlowProvider>,
    );
    // The new title replaces the old one.
    expect(screen.getByTestId('mindmap-node-tn1').textContent).toContain('起草合同（已审计）');
    expect(screen.getByTestId('mindmap-node-tn1').textContent).not.toContain('起草合同"');
    // The status icon is the success color (done).
    const statusBtn2 = screen.getByTestId('mindmap-status-tn1');
    expect(statusBtn2.getAttribute('title')).toContain('已完成');
  });

  it('renders the Open task button when onOpenTask and sourceDate are set', () => {
    const onOpenTask = vi.fn();
    render(
      <ReactFlowProvider>
        <ReactFlow
          nodes={[{
            id: 'tn2',
            type: 'mindmap',
            position: { x: 0, y: 0 },
            data: makeData({
              text: '代码 review',
              kind: 'task' as MindMapNodeKind,
              taskId: 't2',
              sourceDate: '2026-08-07',
              language: 'zh',
              onOpenTask,
              isSelected: true,
            }) as unknown as Record<string, unknown>,
          }]}
          edges={[]}
          nodeTypes={NODE_TYPES}
          fitView={false}
        />
      </ReactFlowProvider>,
    );
    const openBtn = screen.getByTestId('mindmap-open-task-tn2');
    expect(openBtn).toBeInTheDocument();
    // Clicking the button fires the parent's callback.
    openBtn.click();
    expect(onOpenTask).toHaveBeenCalledWith('t2', '2026-08-07');
  });

  it('does NOT render the Open task button for non-task kinds', () => {
    render(
      <ReactFlowProvider>
        <ReactFlow
          nodes={[{
            id: 'b1',
            type: 'mindmap',
            position: { x: 0, y: 0 },
            data: makeData({ text: '普通节点', kind: 'branch' as MindMapNodeKind, isSelected: true }) as unknown as Record<string, unknown>,
          }]}
          edges={[]}
          nodeTypes={NODE_TYPES}
          fitView={false}
        />
      </ReactFlowProvider>,
    );
    expect(screen.queryByTestId('mindmap-open-task-b1')).not.toBeInTheDocument();
  });
});
