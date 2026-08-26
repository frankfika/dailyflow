import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { EventDetail } from '../../../api/client';
import { EventOperatorContextPreview } from './EventOperatorContextPreview';

const { health } = vi.hoisted(() => ({ health: vi.fn() }));
vi.mock('../api/client', () => ({ getEventOperatorHealth: health }));

const EVENT: EventDetail = {
  id: 'event_12345678', title: 'Launch', context: 'work', status: 'active', progress: { done: 0, total: 1 }, effectiveTags: [], createdAt: '', updatedAt: '', mindmapId: 'mindmap_12345678', rootNodeId: 'root_12345678', manualTags: [], aiTags: [],
  nodes: [{ id: 'root_12345678', eventId: 'event_12345678', text: 'Launch', note: 'source note', position: { x: 0, y: 0 }, manualTags: [], aiTags: [] }, { id: 'node_12345678', eventId: 'event_12345678', text: 'Ship', note: 'Evidence', position: { x: 1, y: 1 }, manualTags: [], aiTags: [], execution: { taskId: 'task_12345678', status: 'todo', scheduledDate: '2026-08-26' } }],
  edges: [], integrity: { missingMap: false, sourceContextWasUnclassified: false, orphanTaskIds: [], duplicateNodeTaskIds: [] },
};

describe('EventOperatorContextPreview', () => {
  it('does not start on cancel and sends only selected refs on confirm', async () => {
    health.mockResolvedValue({ runtime: 'deepseek-harness', health: { ready: true, modelConfigured: true, version: '1.2.3' } });
    const cancel = vi.fn(); const confirm = vi.fn();
    render(<EventOperatorContextPreview event={EVENT} language="en" defaultRefs={[{ type: 'note', id: 'note_12345678' }]} onCancel={cancel} onConfirm={confirm} />);
    await waitFor(() => expect(screen.getByText(/deepseek-harness 1.2.3/)).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel' })[0]);
    expect(cancel).toHaveBeenCalled(); expect(confirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Confirm & start/ }));
    expect(confirm).toHaveBeenCalledWith([]);
  });
});
