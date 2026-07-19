/**
 * Smoke tests for the v2 API client.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  captureInput,
  listInbox,
  processSource,
  applyProposal,
  generatePlan,
  acceptPlan,
  waitOnCommitment,
  completeCommitment,
  listCommitments,
  searchMemory,
  listConnectors,
  listLegacyTasks,
  getStatus,
  V2ApiError,
} from './client';

const originalFetch = globalThis.fetch;

function mockJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('v2/client', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async () => mockJsonResponse({ ok: true })) as any;
  });
  // Restore after all tests
  // (vitest will re-import per file; we just need to handle this single file)

  it('captureInput POSTs to /inbox/capture', async () => {
    await captureInput({ kind: 'quick_capture', body: 'hello' });
    const call = (fetch as any).mock.calls[0];
    expect(call[0]).toContain('/api/v2/inbox/capture');
    expect(call[1].method).toBe('POST');
    expect(JSON.parse(call[1].body)).toMatchObject({ kind: 'quick_capture', body: 'hello' });
  });

  it('listInbox GETs /inbox', async () => {
    await listInbox();
    const call = (fetch as any).mock.calls[0];
    expect(call[0]).toContain('/api/v2/inbox');
    expect(call[1].method).toBe('GET');
  });

  it('processSource POSTs to /sources/:id/process', async () => {
    await processSource('src_01');
    const call = (fetch as any).mock.calls[0];
    expect(call[0]).toContain('/api/v2/sources/src_01/process');
  });

  it('applyProposal POSTs to /proposals/:id/accept with selection', async () => {
    await applyProposal('prop_01', { selection: ['a', 'b'] });
    const call = (fetch as any).mock.calls[0];
    expect(call[0]).toContain('/api/v2/proposals/prop_01/accept');
    expect(JSON.parse(call[1].body)).toEqual({ selection: ['a', 'b'] });
  });

  it('generatePlan POSTs to /plans/generate', async () => {
    await generatePlan({ date: '2026-07-20', availableMinutes: 120 });
    const call = (fetch as any).mock.calls[0];
    expect(call[0]).toContain('/api/v2/plans/generate');
  });

  it('acceptPlan POSTs to /plans/:id/accept', async () => {
    await acceptPlan('plan_01');
    const call = (fetch as any).mock.calls[0];
    expect(call[0]).toContain('/api/v2/plans/plan_01/accept');
  });

  it('waitOnCommitment POSTs to /commitments/:id/wait', async () => {
    await waitOnCommitment('com_01', { waitingOnText: 'Alex', reviewAt: '2026-07-25T09:00:00+08:00' });
    const call = (fetch as any).mock.calls[0];
    expect(call[0]).toContain('/api/v2/commitments/com_01/wait');
  });

  it('completeCommitment POSTs to /commitments/:id/complete', async () => {
    await completeCommitment('com_01', { outcomeKind: 'sent', outcomeSummary: 'sent' });
    const call = (fetch as any).mock.calls[0];
    expect(call[0]).toContain('/api/v2/commitments/com_01/complete');
  });

  it('listCommitments GETs /commitments with state filter', async () => {
    await listCommitments({ state: 'open' });
    const call = (fetch as any).mock.calls[0];
    expect(call[0]).toContain('/api/v2/commitments?state=open');
  });

  it('searchMemory encodes query', async () => {
    await searchMemory('Zhang Q3');
    const call = (fetch as any).mock.calls[0];
    expect(call[0]).toContain('q=Zhang%20Q3');
  });

  it('listConnectors GETs /connectors', async () => {
    await listConnectors();
    const call = (fetch as any).mock.calls[0];
    expect(call[0]).toContain('/api/v2/connectors');
  });

  it('listLegacyTasks GETs /legacy/tasks', async () => {
    await listLegacyTasks();
    const call = (fetch as any).mock.calls[0];
    expect(call[0]).toContain('/api/v2/legacy/tasks');
  });

  it('getStatus GETs /status', async () => {
    await getStatus();
    const call = (fetch as any).mock.calls[0];
    expect(call[0]).toContain('/api/v2/status');
  });

  it('throws V2ApiError on non-2xx with error body', async () => {
    globalThis.fetch = vi.fn(async () =>
      mockJsonResponse({ error: { code: 'forbidden', message: 'denied' } }, 403)
    ) as any;
    await expect(captureInput({ kind: 'quick_capture', body: 'x' })).rejects.toBeInstanceOf(V2ApiError);
  });
});
