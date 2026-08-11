/**
 * Smoke tests for the v2 API client.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  captureInput,
  archiveNote,
  createNote,
  captureNoteMeeting,
  captureNoteMeetingBinary,
  transcribeNoteMeeting,
  getNoteMeetingAudioUrl,
  listInbox,
  processSource,
  createJob,
  listJobs,
  getJob,
  retryJob,
  cancelJob,
  applyProposal,
  generatePlan,
  acceptPlan,
  waitOnCommitment,
  completeCommitment,
  listCommitments,
  searchMemory,
  listConnectors,
  listLegacyTasks,
  migrateLegacyTask,
  getStatus,
  V2ApiError,
} from './client';
import { API_BASE } from '../../../config/api';

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

  it('createNote uses the configured API origin', async () => {
    await createNote({ body: '', kind: 'general', state: 'draft' });
    const call = (fetch as any).mock.calls[0];
    expect(call[0]).toBe(`${API_BASE.api}/api/v2/notes`);
    expect(call[1].method).toBe('POST');
  });

  it('archiveNote includes the expected autosave version', async () => {
    await archiveNote('note_01', 7);
    const call = (fetch as any).mock.calls[0];
    expect(call[0]).toBe(`${API_BASE.api}/api/v2/notes/note_01/archive`);
    expect(JSON.parse(call[1].body)).toEqual({ expectedAutoSaveVersion: 7 });
  });

  it('captureNoteMeeting saves audio through the current note endpoint', async () => {
    await captureNoteMeeting('note_01', {
      audio: {
        data: 'data:audio/webm;base64,YXVkaW8=',
        mimeType: 'audio/webm',
        filename: 'meeting-note_01.webm',
      },
      durationSeconds: 42,
      language: 'zh',
    });
    const call = (fetch as any).mock.calls[0];
    expect(call[0]).toBe(`${API_BASE.api}/api/v2/notes/note_01/meeting/capture`);
    expect(call[1].method).toBe('POST');
    expect(JSON.parse(call[1].body)).toMatchObject({
      audio: { mimeType: 'audio/webm' },
      durationSeconds: 42,
      language: 'zh',
    });
  });

  it('uploads long meeting audio as raw binary without base64 JSON', async () => {
    const audio = new Blob(['raw-audio'], { type: 'audio/mp4' });
    await captureNoteMeetingBinary('note_01', {
      audio,
      filename: 'weekly sync.m4a',
      durationSeconds: 6624,
      language: 'zh',
    });
    const call = (fetch as any).mock.calls[0];
    expect(call[0]).toBe(
      `${API_BASE.api}/api/v2/notes/note_01/meeting/capture-binary?filename=weekly+sync.m4a&durationSeconds=6624&language=zh`,
    );
    expect(call[1]).toMatchObject({ method: 'POST', body: audio });
    expect(call[1].headers).toEqual({ 'content-type': 'audio/mp4' });
  });

  it('sends the workspace-local contract for managed transcription', async () => {
    await transcribeNoteMeeting('note_01', {
      sourceId: 'src_audio',
      transcription: {
        mode: 'local-managed',
        engine: 'whisper.cpp',
        modelId: 'small',
        language: 'zh',
      },
    });
    const call = (fetch as any).mock.calls[0];
    expect(call[0]).toBe(`${API_BASE.api}/api/v2/notes/note_01/meeting/transcribe-local`);
    expect(JSON.parse(call[1].body)).toEqual({ sourceId: 'src_audio' });
  });

  it('getNoteMeetingAudioUrl builds a restart-safe streaming URL', () => {
    expect(getNoteMeetingAudioUrl('note / 01', 'src / audio')).toBe(
      `${API_BASE.api}/api/v2/notes/note%20%2F%2001/meeting/audio/src%20%2F%20audio`,
    );
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

  it('exposes the durable job lifecycle endpoints', async () => {
    await createJob({
      kind: 'import',
      entityRef: { type: 'workspace', id: 'ws_01' },
      idempotencyKey: 'import:ws_01:fixture',
    });
    expect((fetch as any).mock.calls.at(-1)[0]).toContain('/api/v2/jobs');
    expect((fetch as any).mock.calls.at(-1)[1].method).toBe('POST');

    await listJobs('failed');
    expect((fetch as any).mock.calls.at(-1)[0]).toContain('/api/v2/jobs?status=failed');

    await getJob('job_01');
    expect((fetch as any).mock.calls.at(-1)[0]).toContain('/api/v2/jobs/job_01');

    await retryJob('job_01');
    expect((fetch as any).mock.calls.at(-1)[0]).toContain('/api/v2/jobs/job_01/retry');

    await cancelJob('job_01');
    expect((fetch as any).mock.calls.at(-1)[0]).toContain('/api/v2/jobs/job_01/cancel');
  });

  it('applyProposal POSTs to /proposals/:id/accept with selection', async () => {
    await applyProposal('prop_01', { idempotencyKey: 'test-proposal-apply', selection: ['a', 'b'] });
    const call = (fetch as any).mock.calls[0];
    expect(call[0]).toContain('/api/v2/proposals/prop_01/accept');
    expect(JSON.parse(call[1].body)).toEqual({ idempotencyKey: 'test-proposal-apply', selection: ['a', 'b'] });
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

  it('migrateLegacyTask encodes the legacy date and line as one path segment', async () => {
    await migrateLegacyTask('2026-07-28', 42);
    const call = (fetch as any).mock.calls[0];
    expect(call[0]).toContain('/legacy/tasks/2026-07-28%2342/migrate');
    expect(call[1].method).toBe('POST');
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
