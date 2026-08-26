import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    event: EVENT,
    language: 'en',
    activeNodeId: 'root',
    collapsedIds: new Set<string>(),
    onToggleCollapse: vi.fn(),
    onActivate: vi.fn(),
    onCommit: vi.fn(),
    onAddChild: vi.fn(async () => ''),
    onAddSibling: vi.fn(async () => ''),
    onRename: vi.fn(),
    onSchedule: vi.fn(),
    onUnschedule: vi.fn(),
    onToggleDone: vi.fn(),
    onDelete: vi.fn(),
    onMoveNodePosition: vi.fn(),
    ...overrides,
  };
  render(<EventCanvas {...props} />);
  return props;
}

describe('EventCanvas node actions', () => {
  it('keeps the root toolbar limited to Add child and More', () => {
    renderCanvas();
    const toolbar = screen.getByTestId('event-node-toolbar');
    expect(within(toolbar).getByRole('button', { name: /Add child/ })).toBeInTheDocument();
    expect(within(toolbar).getByRole('button', { name: /More/ })).toBeInTheDocument();
    expect(within(toolbar).queryByRole('button', { name: /Today/ })).not.toBeInTheDocument();
    expect(within(toolbar).queryByRole('button', { name: /^Date/ })).not.toBeInTheDocument();
  });

  it('shows a prominent Add to Task button on each non-task node with date picker', async () => {
    // Build a one-off event with a non-task child so we can assert against it.
    const nonTaskNode: EventDetail['nodes'][number] = {
      id: 'branch', eventId: EVENT.id, parentId: 'root', text: 'Brainstorm',
      position: { x: 300, y: 120 }, manualTags: [], aiTags: [],
    };
    const local: EventDetail = {
      ...EVENT,
      nodes: [...EVENT.nodes, nonTaskNode],
      edges: [...EVENT.edges, { id: 'edge-branch', source: 'root', target: 'branch' }],
    };
    const onSchedule = vi.fn(async () => undefined);
    render(<EventCanvas {...{
      event: local,
      language: 'en',
      activeNodeId: 'branch',
      collapsedIds: new Set<string>(),
      onToggleCollapse: vi.fn(),
      onActivate: vi.fn(),
      onCommit: vi.fn(),
      onAddChild: vi.fn(async () => ''),
      onAddSibling: vi.fn(async () => ''),
      onRename: vi.fn(),
      onSchedule,
      onUnschedule: vi.fn(),
      onToggleDone: vi.fn(),
      onDelete: vi.fn(),
      onMoveNodePosition: vi.fn(),
    }} />);
    const addTask = screen.getByTestId('event-node-add-task-branch');
    expect(addTask).toBeInTheDocument();
    expect(addTask).toHaveTextContent(/Add to Task/);
    fireEvent.click(addTask);
    // After clicking, the picker popover appears with quick presets and a date input.
    const popover = await screen.findByTestId('event-node-schedule-popover');
    expect(popover).toBeInTheDocument();
    expect(screen.getByTestId('event-node-schedule-popover-preset-1')).toHaveTextContent(/Tomorrow/);
    fireEvent.click(screen.getByTestId('event-node-schedule-popover-preset-1'));
    fireEvent.click(screen.getByTestId('event-node-schedule-popover-confirm'));
    await waitFor(() => expect(onSchedule).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'branch' }),
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    ));
  });

  it('hides the Add to Task button for nodes that are already tasks', () => {
    // The 'step' node already has an execution; the button must not appear.
    renderCanvas({ activeNodeId: 'step' });
    expect(screen.queryByTestId('event-node-add-task-step')).not.toBeInTheDocument();
  });

  it('shows a persistent Task badge on scheduled nodes', () => {
    // activeNodeId is 'root' so the 'step' node renders in display mode (not edit).
    renderCanvas({ activeNodeId: 'root' });
    expect(screen.getByTestId('event-node-task-badge-step')).toHaveTextContent(/Task/);
  });

  it('schedules a non-task node from the toolbar through the date popover (no one-click Today)', async () => {
    const nonTaskNode: EventDetail['nodes'][number] = {
      id: 'branch', eventId: EVENT.id, parentId: 'root', text: 'Brainstorm',
      position: { x: 300, y: 120 }, manualTags: [], aiTags: [],
    };
    const local: EventDetail = {
      ...EVENT,
      nodes: [...EVENT.nodes, nonTaskNode],
      edges: [...EVENT.edges, { id: 'edge-branch', source: 'root', target: 'branch' }],
    };
    const onSchedule = vi.fn(async () => undefined);
    renderCanvas({ event: local, activeNodeId: 'branch', onSchedule });
    const toolbar = screen.getByTestId('event-node-toolbar');
    expect(within(toolbar).getByRole('button', { name: /Add child/ })).toBeInTheDocument();
    expect(within(toolbar).getByRole('button', { name: /Add sibling/ })).toBeInTheDocument();
    // The old one-click "Today" shortcut is gone — scheduling always goes
    // through the date popover and only fires on confirm.
    expect(within(toolbar).queryByRole('button', { name: /Today/ })).not.toBeInTheDocument();
    fireEvent.click(within(toolbar).getByRole('button', { name: /Add to Task/ }));
    expect(await screen.findByTestId('event-toolbar-schedule-popover')).toBeInTheDocument();
    expect(onSchedule).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('event-toolbar-schedule-popover-preset-1'));
    fireEvent.click(screen.getByTestId('event-toolbar-schedule-popover-confirm'));
    await waitFor(() => expect(onSchedule).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'branch' }),
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    ));
  });

  it('shows the current date on the toolbar for task nodes and reschedules via the popover', async () => {
    const onSchedule = vi.fn(async () => undefined);
    renderCanvas({ activeNodeId: 'step', onSchedule });
    const toolbar = screen.getByTestId('event-node-toolbar');
    // 'step' is scheduled for 2026-08-10 — the toolbar surfaces that date.
    fireEvent.click(within(toolbar).getByRole('button', { name: /Date · 08-10/ }));
    const popover = await screen.findByTestId('event-toolbar-schedule-popover');
    expect(popover).toBeInTheDocument();
    expect(screen.getByTestId('event-toolbar-schedule-popover-date-input')).toHaveValue('2026-08-10');
    fireEvent.change(screen.getByTestId('event-toolbar-schedule-popover-date-input'), { target: { value: '2026-08-21' } });
    fireEvent.click(screen.getByTestId('event-toolbar-schedule-popover-confirm'));
    await waitFor(() => expect(onSchedule).toHaveBeenCalledWith(EVENT.nodes[1], '2026-08-21'));
  });

  it('keeps Remove from day and Delete node in the More menu', () => {
    renderCanvas({ activeNodeId: 'step' });
    const toolbar = screen.getByTestId('event-node-toolbar');
    fireEvent.click(within(toolbar).getByRole('button', { name: /More/ }));
    expect(screen.getByRole('button', { name: 'Remove from day' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete node' })).toBeInTheDocument();
  });

  it('adds a child from the focused inline input', () => {
    const onAddChild = vi.fn(async () => '');
    renderCanvas({ onAddChild });
    const toolbar = screen.getByTestId('event-node-toolbar');
    fireEvent.click(within(toolbar).getByRole('button', { name: /Add child/ }));
    fireEvent.change(screen.getByLabelText('Add step'), { target: { value: 'Prepare notes' } });
    fireEvent.submit(screen.getByLabelText('Add step').closest('form')!);
    expect(onAddChild).toHaveBeenCalledWith('root', 'Prepare notes');
  });

  it('activates a node on click', () => {
    const onActivate = vi.fn();
    renderCanvas({ onActivate });
    fireEvent.click(screen.getByTestId('event-node-step').querySelector('button')!);
    expect(onActivate).toHaveBeenCalledWith('step');
  });

  it('drags a node and persists the new position', () => {
    // The 'step' node in EVENT has stored position { x: 300, y: 0 }. A drag
    // of (+50, +30) should call onMoveNodePosition with the stored position
    // translated by the same delta (zoom is 1 in tests).
    const onMoveNodePosition = vi.fn(async () => undefined);
    renderCanvas({ activeNodeId: 'root', onMoveNodePosition });
    const step = screen.getByTestId('event-node-step');
    const canvas = screen.getByTestId('event-canvas');
    const pid = 7;
    fireEvent.pointerDown(step, { clientX: 10, clientY: 10, button: 0, pointerId: pid });
    fireEvent.pointerMove(canvas, { clientX: 60, clientY: 40, pointerId: pid });
    fireEvent.pointerUp(canvas, { clientX: 60, clientY: 40, pointerId: pid });
    expect(onMoveNodePosition).toHaveBeenCalledWith('step', 350, 30);
  });

  it('hides a child whose ancestor is collapsed', () => {
    // EVENT.root has one child 'step'. Collapsing the root must hide the
    // child from the canvas, not just flip the chevron.
    renderCanvas({ collapsedIds: new Set(['root']) });
    expect(screen.queryByTestId('event-node-step')).not.toBeInTheDocument();
  });

  it('shows the child again when the collapsed ancestor is expanded', () => {
    renderCanvas({ collapsedIds: new Set() });
    expect(screen.getByTestId('event-node-step')).toBeInTheDocument();
  });

  it('does not start a drag from the Add to Task chip, collapse button, or inline add buttons', () => {
    // Make 'step' a non-task node for this test.
    const onMoveNodePosition = vi.fn();
    const localEvent: EventDetail = {
      ...EVENT,
      nodes: EVENT.nodes.map((n) =>
        n.id === 'step' ? { ...n, execution: undefined } : n,
      ),
    };
    renderCanvas({ event: localEvent, activeNodeId: 'root', onMoveNodePosition });
    const step = screen.getByTestId('event-node-step');
    const canvas = screen.getByTestId('event-canvas');
    // Click the "Add to Task" chip and drag — should NOT commit a move.
    const chip = screen.getByTestId('event-node-add-task-step');
    fireEvent.pointerDown(chip, { clientX: 10, clientY: 10, button: 0, pointerId: 9 });
    fireEvent.pointerMove(canvas, { clientX: 200, clientY: 200, pointerId: 9 });
    fireEvent.pointerUp(canvas, { clientX: 200, clientY: 200, pointerId: 9 });
    expect(onMoveNodePosition).not.toHaveBeenCalled();
  });

  it('renders proposal nodes as a non-persistent overlay and opens the inspector selection', () => {
    const onSelectProposalChange = vi.fn();
    renderCanvas({
      proposal: { id: 'gprop_1', schemaVersion: 1, workspaceId: 'ws', eventId: EVENT.id, mindmapId: EVENT.mindmapId, agentRunId: 'eval_1', baseRevision: 'rev', status: 'pending', summary: 'one', riskLevel: 'low', createdAt: '', operations: [{ changeId: 'chg_1', op: 'add_node', parentId: 'root', node: { kind: 'task', text: 'AI candidate' }, confidence: 0.9, reason: 'next step' }] },
      proposalSelection: new Set(['chg_1']),
      activeProposalChangeId: 'chg_1',
      onSelectProposalChange,
    });
    const candidate = screen.getByTestId('proposal-node-chg_1');
    expect(candidate).toHaveTextContent('AI candidate');
    fireEvent.click(candidate);
    expect(onSelectProposalChange).toHaveBeenCalledWith('chg_1');
  });
});
