import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { EventDetail } from '../../../api/client';
import { EventCanvas } from './EventCanvas';

const EVENT: EventDetail = {
  id: 'event-1', title: 'Launch', context: 'work', status: 'active', progress: { done: 0, total: 1 }, effectiveTags: [],
  createdAt: '2026-08-01', updatedAt: '2026-08-10', mindmapId: 'map-1', rootNodeId: 'root', manualTags: [], aiTags: [],
  nodes: [
    { id: 'root', eventId: 'event-1', text: 'Launch', position: { x: 0, y: 0 }, manualTags: [], aiTags: [] },
    { id: 'step', eventId: 'event-1', parentId: 'root', text: 'Test release', position: { x: 300, y: 0 }, manualTags: [], aiTags: [], execution: { taskId: 'task-1', status: 'todo', scheduledDate: '2026-08-10' } },
  ],
  edges: [{ id: 'edge-1', source: 'root', target: 'step' }],
  integrity: { missingMap: false, sourceContextWasUnclassified: false, orphanTaskIds: [], duplicateNodeTaskIds: [] },
};

function renderCanvas(overrides: Partial<React.ComponentProps<typeof EventCanvas>> = {}) {
  const props: React.ComponentProps<typeof EventCanvas> = {
    event: EVENT, language: 'en', onAddChild: vi.fn(async () => ''), onAddSibling: vi.fn(async () => ''), onRename: vi.fn(), onSchedule: vi.fn(), onUnschedule: vi.fn(), onToggleDone: vi.fn(), onDelete: vi.fn(), ...overrides,
  };
  render(<EventCanvas {...props} />);
  return props;
}

describe('EventCanvas node actions', () => {
  it('keeps the root toolbar limited to Add child and More', () => {
    renderCanvas();
    expect(screen.getByRole('button', { name: /Add child/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /More/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Today/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Date/ })).not.toBeInTheDocument();
  });

  it('shows Add child, Add sibling, Today, Date, More for a selected action node and wires scheduling', () => {
    const onSchedule = vi.fn(async () => undefined);
    renderCanvas({ onSchedule });
    fireEvent.click(screen.getByTestId('event-node-step').querySelector('button')!);
    expect(screen.getByRole('button', { name: /Add child/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Today/ }));
    expect(onSchedule).toHaveBeenCalledWith(EVENT.nodes[1], expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    fireEvent.click(screen.getByRole('button', { name: /More/ }));
    expect(screen.getByRole('button', { name: 'Remove from day' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete node' })).toBeInTheDocument();
  });

  it('adds a child from the focused inline input', () => {
    const onAddChild = vi.fn(async () => '');
    renderCanvas({ onAddChild });
    fireEvent.click(screen.getByRole('button', { name: /Add child/ }));
    fireEvent.change(screen.getByLabelText('Add step'), { target: { value: 'Prepare notes' } });
    fireEvent.submit(screen.getByLabelText('Add step').closest('form')!);
    expect(onAddChild).toHaveBeenCalledWith('root', 'Prepare notes');
  });
});
