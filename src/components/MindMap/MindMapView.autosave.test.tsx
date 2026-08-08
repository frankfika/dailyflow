import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { MindMap } from '../../api/client';
import { mindmapsApi } from '../../api/client';
import { MindMapView, rebaseSemanticNodeFields } from './MindMapView';

vi.mock('../../api/client', async () => {
  const actual = await vi.importActual<typeof import('../../api/client')>('../../api/client');
  return {
    ...actual,
    mindmapsApi: {
      ...actual.mindmapsApi,
      list: vi.fn(),
      get: vi.fn(),
      update: vi.fn(),
    },
  };
});

vi.mock('../../hooks/useMindMapActions', () => ({
  usePromoteNodeToTask: () => ({ mutateAsync: vi.fn() }),
  useLinkNodeToTask: () => ({ mutateAsync: vi.fn() }),
  useUpdateNodeKind: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock('./MindMapCanvas', () => ({
  MindMapCanvas: ({ map, onChange }: {
    map: MindMap;
    onChange: (patch: { nodes: MindMap['nodes'] }) => void;
  }) => (
    <button
      type="button"
      data-testid={`edit-${map.id}`}
      onClick={() => onChange({
        nodes: map.nodes.map((node) => ({ ...node, text: `${node.text}-edited` })),
      })}
    >
      edit {map.id}
    </button>
  ),
}));

vi.mock('./MindMapList', () => ({
  MindMapList: ({ maps, onSelect }: { maps: MindMap[]; onSelect: (id: string) => void }) => (
    <div>
      {maps.map((map) => (
        <button key={map.id} type="button" data-testid={`select-${map.id}`} onClick={() => onSelect(map.id)}>
          {map.title}
        </button>
      ))}
    </div>
  ),
}));

const MAP_A: MindMap = {
  id: 'map-a',
  title: 'A',
  rootId: 'root-a',
  nodes: [{ id: 'root-a', text: 'A', position: { x: 0, y: 0 }, kind: 'root' }],
  edges: [],
  version: 2,
  createdAt: '2026-08-08T00:00:00.000Z',
  updatedAt: '2026-08-08T00:00:00.000Z',
};

const MAP_B: MindMap = {
  ...MAP_A,
  id: 'map-b',
  title: 'B',
  rootId: 'root-b',
  nodes: [{ id: 'root-b', text: 'B', position: { x: 0, y: 0 }, kind: 'root' }],
};

describe('MindMapView autosave', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(mindmapsApi.list).mockResolvedValue([MAP_A, MAP_B]);
    vi.mocked(mindmapsApi.update).mockImplementation(async (id, patch) => {
      const source = id === MAP_A.id ? MAP_A : MAP_B;
      return { ...source, ...patch, updatedAt: '2026-08-08T00:00:01.000Z' };
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('keeps independent pending saves when editing two maps inside one debounce window', async () => {
    render(<MindMapView workspaceId="ws" language="zh" showToast={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('edit-map-a')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('edit-map-a'));
    fireEvent.click(screen.getByTestId('select-map-b'));
    await waitFor(() => expect(screen.getByTestId('edit-map-b')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('edit-map-b'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    await waitFor(() => expect(mindmapsApi.update).toHaveBeenCalledTimes(2));
    expect(vi.mocked(mindmapsApi.update).mock.calls.map(([id]) => id).sort()).toEqual(['map-a', 'map-b']);
  });

  it('flushes a pending edit when the view unmounts before debounce fires', async () => {
    const view = render(<MindMapView workspaceId="ws" language="zh" showToast={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('edit-map-a')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('edit-map-a'));
    view.unmount();

    await waitFor(() => expect(mindmapsApi.update).toHaveBeenCalledWith(
      'map-a',
      expect.objectContaining({ nodes: expect.any(Array) }),
    ));
  });

  it('preserves authoritative task binding when rebasing an edit queued during mutation', () => {
    const staleNodes = [
      { id: 'node', text: 'edited while linking', position: { x: 5, y: 5 }, kind: 'branch' as const },
    ];
    const serverNodes = [
      { id: 'node', text: 'linked title', position: { x: 0, y: 0 }, kind: 'task' as const, taskId: 'task-1' },
    ];
    expect(rebaseSemanticNodeFields(staleNodes, serverNodes)).toEqual([
      expect.objectContaining({
        id: 'node',
        text: 'edited while linking',
        position: { x: 5, y: 5 },
        kind: 'task',
        taskId: 'task-1',
      }),
    ]);
  });
});
