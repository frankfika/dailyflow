import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { MindMap, MindMapNodeStatus } from '../../api/client';
import { MindMapOutline } from './MindMapOutline';

const baseMap: MindMap = {
  id: 'map', title: '发布计划', rootId: 'root', version: 2,
  createdAt: '', updatedAt: '',
  nodes: [
    { id: 'root', text: '发布计划', kind: 'root', position: { x: 0, y: 0 } },
    { id: 'idea-a', text: '准备素材', kind: 'branch', status: 'todo', position: { x: 220, y: 0 } },
    { id: 'task-b', text: '发布官网', kind: 'task', taskId: 'task-1', taskDate: '2026-08-11', status: 'todo', position: { x: 220, y: 80 } },
  ],
  edges: [
    { id: 'edge-a', source: 'root', target: 'idea-a' },
    { id: 'edge-b', source: 'root', target: 'task-b' },
  ],
};

function Harness({
  onEnsureTask = vi.fn(),
  onTaskStatusChange = vi.fn(),
  onTaskTitleChange = vi.fn(),
  onLinkTask = vi.fn(),
  onTaskNoteChange = vi.fn(),
  onTaskFieldsChange,
  onTaskDateChange,
}: {
  onEnsureTask?: (id: string) => void;
  onTaskStatusChange?: (node: typeof baseMap.nodes[number], status: MindMapNodeStatus) => void;
  onTaskTitleChange?: (node: typeof baseMap.nodes[number], title: string) => void;
  onLinkTask?: (nodeId: string, taskId: string, date: string) => void;
  onTaskNoteChange?: (node: typeof baseMap.nodes[number], note: string) => void;
  onTaskFieldsChange?: (...args: any[]) => Promise<void>;
  onTaskDateChange?: (...args: any[]) => Promise<void>;
}) {
  const [map, setMap] = useState(baseMap);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return <MindMapOutline
    map={map}
    language="zh"
    selectedId={selectedId}
    onSelect={setSelectedId}
    onChange={(patch) => setMap((current) => ({ ...current, ...patch }))}
    onEnsureTask={onEnsureTask}
    onTaskStatusChange={onTaskStatusChange}
    onTaskTitleChange={onTaskTitleChange}
    onDelete={vi.fn()}
    onLinkTask={onLinkTask}
    onTaskNoteChange={onTaskNoteChange}
    onTaskFieldsChange={onTaskFieldsChange}
    onTaskDateChange={onTaskDateChange}
    selectedTaskDetails={onTaskFieldsChange ? { id: 'task-1', title: '发布官网', status: 'todo', date: '2026-08-11', description: '旧描述', tags: ['launch'], deadline: '2026-08-18', priority: 'medium' } : null}
    taskOptions={[{ id: 'existing', title: '已有 Task', status: 'todo', date: '2026-08-10' }]}
  />;
}

describe('MindMapOutline document interactions', () => {
  it('edits continuously and creates a sibling with Enter', () => {
    render(<Harness />);
    const input = screen.getByDisplayValue('准备素材');
    fireEvent.change(input, { target: { value: '准备发布素材' } });
    expect(screen.getByDisplayValue('准备发布素材')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByDisplayValue('准备发布素材'), { key: 'Enter' });
    expect(screen.getAllByPlaceholderText('输入想法…')).toHaveLength(3);
    expect(screen.getAllByPlaceholderText('输入想法…').some((element) => (element as HTMLInputElement).value === '')).toBe(true);
  });

  it('exposes direct buttons for a top-level topic and a sibling node', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('outline-add-sibling-idea-a'));
    expect(screen.getAllByPlaceholderText('输入想法…')).toHaveLength(3);
    fireEvent.click(screen.getByTestId('outline-add-top-level-root'));
    expect(screen.getAllByPlaceholderText('输入想法…')).toHaveLength(4);
  });

  it('indents with Tab and outdents with Shift+Tab', () => {
    render(<Harness />);
    const task = screen.getByDisplayValue('发布官网');
    fireEvent.keyDown(task, { key: 'Tab' });
    expect(screen.getByTestId('outline-row-task-b')).toHaveStyle({ paddingLeft: '46px' });
    fireEvent.keyDown(screen.getByDisplayValue('发布官网'), { key: 'Tab', shiftKey: true });
    expect(screen.getByTestId('outline-row-task-b')).toHaveStyle({ paddingLeft: '26px' });
  });

  it('promotes ideas and mirrors task completion from the visible row', () => {
    const onEnsureTask = vi.fn();
    const onTaskStatusChange = vi.fn();
    render(<Harness onEnsureTask={onEnsureTask} onTaskStatusChange={onTaskStatusChange} />);
    fireEvent.click(screen.getByTestId('outline-task-idea-a'));
    expect(onEnsureTask).toHaveBeenCalledWith('idea-a');
    fireEvent.click(screen.getByTestId('outline-task-task-b'));
    expect(onTaskStatusChange).toHaveBeenCalledWith(expect.objectContaining({ id: 'task-b' }), 'done');
    expect(screen.getByDisplayValue('发布官网')).toHaveClass('line-through');
  });

  it('commits a linked task title once on blur with the rollback title', () => {
    const onTaskTitleChange = vi.fn();
    render(<Harness onTaskTitleChange={onTaskTitleChange} />);
    const input = screen.getByDisplayValue('发布官网');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '发布新版官网' } });
    fireEvent.blur(screen.getByDisplayValue('发布新版官网'));
    expect(onTaskTitleChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'task-b', text: '发布官网' }),
      '发布新版官网',
    );
  });

  it('reorders, adds a child with Cmd+Enter, and sends an idea to Today with Cmd+Shift+Enter', () => {
    const onEnsureTask = vi.fn();
    render(<Harness onEnsureTask={onEnsureTask} />);
    const task = screen.getByDisplayValue('发布官网');
    fireEvent.keyDown(task, { key: 'ArrowUp', altKey: true });
    const rows = screen.getAllByTestId(/outline-row-/);
    expect(rows[1]).toHaveAttribute('data-testid', 'outline-row-task-b');
    fireEvent.keyDown(screen.getByDisplayValue('准备素材'), { key: 'Enter', metaKey: true });
    expect(screen.getByTestId('outline-row-idea-a').nextElementSibling).toHaveStyle({ paddingLeft: '46px' });
    fireEvent.keyDown(screen.getByDisplayValue('准备素材'), { key: 'Enter', metaKey: true, shiftKey: true });
    expect(onEnsureTask).toHaveBeenCalledWith('idea-a');
  });

  it('links the selected idea to an existing Task from the context toolbar', () => {
    const onLinkTask = vi.fn();
    render(<Harness onLinkTask={onLinkTask} />);
    fireEvent.focus(screen.getByDisplayValue('准备素材'));
    expect(screen.getByTestId('outline-node-toolbar')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '关联已有' }));
    fireEvent.click(screen.getByTestId('outline-link-task-existing'));
    expect(onLinkTask).toHaveBeenCalledWith('idea-a', 'existing', '2026-08-10');
  });

  it('adds node details and syncs them to the linked Task on blur', () => {
    const onTaskNoteChange = vi.fn();
    render(<Harness onTaskNoteChange={onTaskNoteChange} />);
    fireEvent.focus(screen.getByDisplayValue('发布官网'));
    const details = screen.getByPlaceholderText('补充说明，将同步到 Task 描述…');
    fireEvent.focus(details);
    fireEvent.change(details, { target: { value: '上线前完成回归测试' } });
    fireEvent.blur(screen.getByDisplayValue('上线前完成回归测试'));
    expect(onTaskNoteChange).toHaveBeenCalledWith(expect.objectContaining({ id: 'task-b', note: '' }), '上线前完成回归测试');
  });

  it('edits date, tags, deadline, priority and description in one task panel', async () => {
    const onTaskFieldsChange = vi.fn().mockResolvedValue(undefined);
    const onTaskDateChange = vi.fn().mockResolvedValue(undefined);
    render(<Harness onTaskFieldsChange={onTaskFieldsChange} onTaskDateChange={onTaskDateChange} />);
    fireEvent.focus(screen.getByDisplayValue('发布官网'));
    expect(screen.getByTestId('outline-task-editor')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('outline-task-date'), { target: { value: '2026-08-12' } });
    fireEvent.change(screen.getByTestId('outline-task-deadline'), { target: { value: '2026-08-20' } });
    fireEvent.change(screen.getByTestId('outline-task-priority'), { target: { value: 'high' } });
    fireEvent.change(screen.getByTestId('outline-task-description'), { target: { value: '新版上线前完成回归' } });
    const tagInput = screen.getByTestId('outline-task-editor').querySelector('input[type="text"]')!;
    fireEvent.change(tagInput, { target: { value: 'website' } });
    fireEvent.keyDown(tagInput, { key: 'Enter' });
    fireEvent.click(screen.getByTestId('outline-task-save'));
    await waitFor(() => expect(onTaskDateChange).toHaveBeenCalledWith(expect.objectContaining({ id: 'task-b' }), '2026-08-11', '2026-08-12'));
    await waitFor(() => expect(onTaskFieldsChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'task-b', taskDate: '2026-08-12' }),
      { description: '新版上线前完成回归', tags: ['launch', 'website'], deadline: '2026-08-20', priority: 'high', comments: [] },
      '2026-08-12',
    ));
  });
});
