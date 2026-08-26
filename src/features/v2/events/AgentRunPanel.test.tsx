import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentRunPanel } from './AgentRunPanel';
import type { EventGraphProposal } from '../api/client';

const mocks = vi.hoisted(() => ({
  getPendingGraphProposal: vi.fn(),
  startEventOperatorRun: vi.fn(),
  applyGraphProposal: vi.fn(),
  rejectGraphProposal: vi.fn(),
  listEventOperatorRuns: vi.fn(),
  getEventOperatorRun: vi.fn(),
  cancelEventOperatorRun: vi.fn(),
  retryEventOperatorRun: vi.fn(),
}));

vi.mock('../api/client', () => ({
  getPendingGraphProposal: mocks.getPendingGraphProposal,
  startEventOperatorRun: mocks.startEventOperatorRun,
  applyGraphProposal: mocks.applyGraphProposal,
  rejectGraphProposal: mocks.rejectGraphProposal,
  listEventOperatorRuns: mocks.listEventOperatorRuns,
  getEventOperatorRun: mocks.getEventOperatorRun,
  cancelEventOperatorRun: mocks.cancelEventOperatorRun,
  retryEventOperatorRun: mocks.retryEventOperatorRun,
}));

const PROPOSAL: EventGraphProposal & { operations: any[] } = {
  id: 'gprop_pending',
  schemaVersion: 1,
  workspaceId: 'ws',
  eventId: 'ev_1',
  mindmapId: 'map_1',
  agentRunId: 'eval_run',
  baseRevision: 'rev',
  status: 'pending',
  summary: 'AI 模板拆解：2 个下一步建议',
  riskLevel: 'low',
  createdAt: '2026-08-23T00:00:00Z',
  operations: [
    { changeId: 'gchg_1', op: 'add_node', tempId: 't1', parentId: 'root', node: { kind: 'task', text: '产品上线 · 第一步' }, domainDraft: { entity: 'commitment', title: '产品上线 · 第一步', state: 'active' }, confidence: 0.62, reason: '模板拆解' },
    { changeId: 'gchg_2', op: 'add_node', tempId: 't2', parentId: 'root', node: { kind: 'decision', text: '产品上线 · 关键决策' }, domainDraft: { entity: 'decision', title: '产品上线 · 关键决策', decision: '…' }, confidence: 0.6, reason: '模板拆解' },
  ],
};

describe('AgentRunPanel — AI 推进 UX', () => {
  beforeEach(() => {
    mocks.getPendingGraphProposal.mockReset();
    mocks.startEventOperatorRun.mockReset();
    mocks.applyGraphProposal.mockReset();
    mocks.rejectGraphProposal.mockReset();
    mocks.listEventOperatorRuns.mockReset();
    mocks.getEventOperatorRun.mockReset();
    mocks.cancelEventOperatorRun.mockReset();
    mocks.retryEventOperatorRun.mockReset();
    mocks.listEventOperatorRuns.mockResolvedValue({ items: [] });
  });

  it('shows the start action when no pending proposal exists', async () => {
    mocks.getPendingGraphProposal.mockResolvedValue({ proposal: null });
    render(<AgentRunPanel language="zh" eventId="ev_1" mindmapId="map_1" onApplied={() => {}} onClose={() => {}} />);
    expect(await screen.findByTestId('agent-run-start')).toBeInTheDocument();
  });

  it('renders suggested operations and applies on accept, calling onApplied + onClose', async () => {
    mocks.getPendingGraphProposal.mockResolvedValue({ proposal: PROPOSAL });
    mocks.applyGraphProposal.mockResolvedValue({ proposal: PROPOSAL, createdCommitments: 1, appliedChanges: ['gchg_1'], staleChangeIds: [] });
    const onApplied = vi.fn();
    const onClose = vi.fn();

    render(<AgentRunPanel language="zh" eventId="ev_1" mindmapId="map_1" onApplied={onApplied} onClose={onClose} />);

    expect(await screen.findByTestId('agent-run-apply')).toBeInTheDocument();
    expect(screen.getByText('产品上线 · 第一步')).toBeInTheDocument();
    expect(screen.getByText('产品上线 · 关键决策')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('agent-suggestion-gchg_1'));
    fireEvent.click(screen.getByTestId('agent-suggestion-gchg_2'));
    fireEvent.click(screen.getByTestId('agent-run-apply'));
    await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mocks.applyGraphProposal).toHaveBeenCalledWith('ev_1', 'gprop_pending', { selection: ['gchg_1', 'gchg_2'], userOverrides: {} });
  });

  it('reject declines the proposal without applying', async () => {
    mocks.getPendingGraphProposal.mockResolvedValue({ proposal: PROPOSAL });
    mocks.rejectGraphProposal.mockResolvedValue({ proposal: { ...PROPOSAL, status: 'rejected' } });
    const onApplied = vi.fn();

    render(<AgentRunPanel language="zh" eventId="ev_1" mindmapId="map_1" onApplied={onApplied} onClose={() => {}} />);
    fireEvent.click(await screen.findByTestId('agent-run-reject'));
    await waitFor(() => expect(mocks.rejectGraphProposal).toHaveBeenCalledWith('ev_1', 'gprop_pending'));
    expect(mocks.applyGraphProposal).not.toHaveBeenCalled();
  });

  it('lets the user deselect a suggestion and applies only the selection', async () => {
    mocks.getPendingGraphProposal.mockResolvedValue({ proposal: PROPOSAL });
    mocks.applyGraphProposal.mockResolvedValue({ proposal: PROPOSAL, createdCommitments: 0, appliedChanges: [], staleChangeIds: [] });
    const onApplied = vi.fn();
    render(<AgentRunPanel language="en" eventId="ev_1" mindmapId="map_1" onApplied={onApplied} onClose={() => {}} />);

    const applyBtn = await screen.findByTestId('agent-run-apply');
    // Select only the first suggestion.
    fireEvent.click(screen.getByTestId('agent-suggestion-gchg_1'));
    expect(applyBtn).toHaveTextContent('1');
    fireEvent.click(applyBtn);
    await waitFor(() => expect(mocks.applyGraphProposal).toHaveBeenCalledWith('ev_1', 'gprop_pending', { selection: ['gchg_1'], userOverrides: {} }));
  });

  it('keeps high-risk items out of the low-risk batch action', async () => {
    mocks.getPendingGraphProposal.mockResolvedValue({ proposal: { ...PROPOSAL, riskLevel: 'high' } });
    render(<AgentRunPanel language="en" eventId="ev_1" mindmapId="map_1" onApplied={() => {}} onClose={() => {}} />);
    expect(await screen.findByTestId('agent-accept-low-risk')).toBeDisabled();
  });

  it('opens an inspector and keeps title edits local until apply', async () => {
    mocks.getPendingGraphProposal.mockResolvedValue({ proposal: PROPOSAL });
    mocks.applyGraphProposal.mockResolvedValue({ proposal: PROPOSAL, createdCommitments: 1, appliedChanges: ['gchg_1'], staleChangeIds: [] });
    render(<AgentRunPanel language="en" eventId="ev_1" mindmapId="map_1" onApplied={() => {}} onClose={() => {}} />);
    const inspector = await screen.findByTestId('proposal-node-inspector');
    fireEvent.change(inspector.querySelector('input')!, { target: { value: 'Edited locally' } });
    expect(mocks.applyGraphProposal).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('agent-suggestion-gchg_1'));
    fireEvent.click(screen.getByTestId('agent-run-apply'));
    await waitFor(() => expect(mocks.applyGraphProposal).toHaveBeenCalledWith('ev_1', 'gprop_pending', expect.objectContaining({ userOverrides: { gchg_1: { text: 'Edited locally' } } })));
  });
});
