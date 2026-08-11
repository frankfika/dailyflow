import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MindMap } from '../../api/client';
import { eventsApi, mindmapsApi, tasksApi } from '../../api/client';
import { MindMapView } from './MindMapView';

const promote = vi.fn();
const linkTask = vi.fn();

vi.mock('../../api/client', async () => {
  const actual = await vi.importActual<typeof import('../../api/client')>('../../api/client');
  return {
    ...actual,
    mindmapsApi: { ...actual.mindmapsApi, list: vi.fn(), get: vi.fn(), update: vi.fn() },
    tasksApi: { ...actual.tasksApi, getByDate: vi.fn(), updateStatus: vi.fn(), edit: vi.fn() },
    eventsApi: { ...actual.eventsApi, editNodeTask: vi.fn(), rescheduleNodeTask: vi.fn() },
  };
});

vi.mock('../../hooks/useMindMapActions', () => ({
  usePromoteNodeToTask: () => ({ mutateAsync: promote }),
  useLinkNodeToTask: () => ({ mutateAsync: linkTask }),
}));

vi.mock('./MindMapCanvas', () => ({ MindMapCanvas: () => <div data-testid="canvas" /> }));
vi.mock('./MindMapList', () => ({ MindMapList: () => <div data-testid="map-list" /> }));
vi.mock('./MindMapOutline', () => ({
  MindMapOutline: ({ map, onEnsureTask, onTaskStatusChange, onTaskTitleChange, onTaskNoteChange, onTaskFieldsChange, onTaskDateChange, onLinkTask }: any) => <div>
    <button onClick={() => onEnsureTask('branch')}>promote</button>
    <button onClick={() => onTaskStatusChange(map.nodes.find((node: any) => node.id === 'task'), 'done')}>complete</button>
    <button onClick={() => onTaskTitleChange(map.nodes.find((node: any) => node.id === 'task'), '新标题')}>rename</button>
    <button onClick={() => onTaskNoteChange(map.nodes.find((node: any) => node.id === 'task'), '新详情')}>details</button>
    <button onClick={() => onTaskFieldsChange(map.nodes.find((node: any) => node.id === 'task'), { description: '完整详情', tags: ['launch'], deadline: '2026-08-20', priority: 'high', comments: [] }, '2026-08-11')}>save fields</button>
    <button onClick={() => onTaskDateChange(map.nodes.find((node: any) => node.id === 'task'), '2026-08-11', '2026-08-12')}>reschedule</button>
    <button onClick={() => onLinkTask('branch', 'existing-task', '2026-08-10')}>link</button>
  </div>,
}));

const map: MindMap = {
  id: 'map', title: '计划', rootId: 'root', version: 2,
  createdAt: '', updatedAt: '',
  nodes: [
    { id: 'root', text: '计划', kind: 'root', position: { x: 0, y: 0 } },
    { id: 'branch', text: '新任务', kind: 'branch', position: { x: 220, y: 0 } },
    { id: 'task', text: '旧标题', kind: 'task', taskId: 'task-1', taskDate: '2026-08-11', status: 'todo', position: { x: 220, y: 80 } },
  ],
  edges: [
    { id: 'a', source: 'root', target: 'branch' },
    { id: 'b', source: 'root', target: 'task' },
  ],
};

describe('MindMapView parent task refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mindmapsApi.list).mockResolvedValue([map]);
    vi.mocked(mindmapsApi.update).mockImplementation(async (_id, patch) => ({ ...map, ...patch }));
    vi.mocked(mindmapsApi.get).mockResolvedValue(map);
    vi.mocked(tasksApi.getByDate).mockResolvedValue([]);
    vi.mocked(tasksApi.updateStatus).mockResolvedValue(undefined);
    vi.mocked(tasksApi.edit).mockResolvedValue(undefined);
    vi.mocked(eventsApi.editNodeTask).mockResolvedValue({ updated: true });
    vi.mocked(eventsApi.rescheduleNodeTask).mockResolvedValue({ rescheduled: true, alreadyScheduled: false });
    promote.mockResolvedValue({
      ...map,
      nodes: map.nodes.map((node) => node.id === 'branch'
        ? { ...node, kind: 'task' as const, taskId: 'task-2', taskDate: '2026-08-11' }
        : node),
    });
    linkTask.mockResolvedValue({
      ...map,
      nodes: map.nodes.map((node) => node.id === 'branch'
        ? { ...node, kind: 'task' as const, taskId: 'existing-task', taskDate: '2026-08-10' }
        : node),
    });
  });

  it('refreshes Today after completing, renaming and detailing a linked task', async () => {
    const onTaskDataChanged = vi.fn().mockResolvedValue(undefined);
    render(<MindMapView workspaceId="ws" language="zh" showToast={vi.fn()} todayDate="2026-08-11" onTaskDataChanged={onTaskDataChanged} />);
    await screen.findByRole('button', { name: 'complete' });
    fireEvent.click(screen.getByRole('button', { name: 'complete' }));
    await waitFor(() => expect(tasksApi.updateStatus).toHaveBeenCalledWith('task-1', '2026-08-11', 'done'));
    await waitFor(() => expect(onTaskDataChanged).toHaveBeenCalledWith('2026-08-11'));
    onTaskDataChanged.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'rename' }));
    await waitFor(() => expect(tasksApi.edit).toHaveBeenCalledWith('task-1', '2026-08-11', { title: '新标题' }));
    await waitFor(() => expect(onTaskDataChanged).toHaveBeenCalledWith('2026-08-11'));
    onTaskDataChanged.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'details' }));
    await waitFor(() => expect(tasksApi.edit).toHaveBeenCalledWith('task-1', '2026-08-11', { description: '新详情' }));
    await waitFor(() => expect(onTaskDataChanged).toHaveBeenCalledWith('2026-08-11'));
  });

  it('refreshes Today after promoting a branch to Task', async () => {
    const onTaskDataChanged = vi.fn().mockResolvedValue(undefined);
    render(<MindMapView workspaceId="ws" language="zh" showToast={vi.fn()} todayDate="2026-08-11" onTaskDataChanged={onTaskDataChanged} />);
    fireEvent.click(await screen.findByRole('button', { name: 'promote' }));
    await waitFor(() => expect(promote).toHaveBeenCalledWith(expect.objectContaining({ nodeId: 'branch', date: '2026-08-11' })));
    await waitFor(() => expect(onTaskDataChanged).toHaveBeenCalledWith('2026-08-11'));
  });

  it('links an existing Task and refreshes its owning date', async () => {
    const onTaskDataChanged = vi.fn().mockResolvedValue(undefined);
    render(<MindMapView workspaceId="ws" language="zh" showToast={vi.fn()} todayDate="2026-08-11" onTaskDataChanged={onTaskDataChanged} />);
    fireEvent.click(await screen.findByRole('button', { name: 'link' }));
    await waitFor(() => expect(linkTask).toHaveBeenCalledWith({ mapId: 'map', nodeId: 'branch', taskId: 'existing-task', date: '2026-08-10' }));
    await waitFor(() => expect(onTaskDataChanged).toHaveBeenCalledWith('2026-08-10'));
  });

  it('saves normal task fields from the mind map and refreshes Today', async () => {
    const onTaskDataChanged = vi.fn().mockResolvedValue(undefined);
    render(<MindMapView workspaceId="ws" language="zh" showToast={vi.fn()} todayDate="2026-08-11" onTaskDataChanged={onTaskDataChanged} />);
    fireEvent.click(await screen.findByRole('button', { name: 'save fields' }));
    await waitFor(() => expect(eventsApi.editNodeTask).toHaveBeenCalledWith({
      taskId: 'task-1',
      scheduledDate: '2026-08-11',
      updates: { description: '完整详情', tags: ['launch'], deadline: '2026-08-20', priority: 'high', comments: [] },
    }));
    expect(onTaskDataChanged).toHaveBeenCalledWith('2026-08-11');
  });

  it('asks for and stores a resolution note after completing a mind-map task', async () => {
    vi.mocked(tasksApi.getByDate).mockResolvedValue([{
      id: 'task-1', title: '旧标题', status: 'done', comments: [], tags: [],
    } as any]);
    render(<MindMapView workspaceId="ws" language="zh" showToast={vi.fn()} todayDate="2026-08-11" onTaskDataChanged={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'complete' }));
    expect(await screen.findByTestId('mindmap-completion-prompt')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('mindmap-completion-comment'), { target: { value: '已完成最终验收' } });
    fireEvent.click(screen.getByTestId('mindmap-completion-save'));
    await waitFor(() => expect(eventsApi.editNodeTask).toHaveBeenCalledWith({
      taskId: 'task-1',
      scheduledDate: '2026-08-11',
      updates: { comments: [expect.objectContaining({ text: '已完成最终验收' })] },
    }));
    await waitFor(() => expect(screen.queryByTestId('mindmap-completion-prompt')).not.toBeInTheDocument());
  });

  it('moves a mind-map task to another date and refreshes both days', async () => {
    const onTaskDataChanged = vi.fn().mockResolvedValue(undefined);
    render(<MindMapView workspaceId="ws" language="zh" showToast={vi.fn()} todayDate="2026-08-11" onTaskDataChanged={onTaskDataChanged} />);
    fireEvent.click(await screen.findByRole('button', { name: 'reschedule' }));
    await waitFor(() => expect(eventsApi.rescheduleNodeTask).toHaveBeenCalledWith({ taskId: 'task-1', fromDate: '2026-08-11', toDate: '2026-08-12', mindmapId: 'map', nodeId: 'task' }));
    await waitFor(() => {
      expect(onTaskDataChanged).toHaveBeenCalledWith('2026-08-11');
      expect(onTaskDataChanged).toHaveBeenCalledWith('2026-08-12');
    });
  });
});
