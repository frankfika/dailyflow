/**
 * v2 API router — mounts all AI-Native routes under /api/v2.
 *
 * The router follows spec §13.3:
 *   - Routes only validate, enforce auth boundaries, and shape responses.
 *   - Domain rules live in services/ (state machine, business validation).
 *   - Repository handles atomic writes + audit.
 *
 * Each route returns JSON; errors follow the { error: { code, message } }
 * shape with appropriate HTTP status codes. Empty / loading / success
 * payloads are explicit so the UI can render every state.
 */
import { Router, raw, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { newId } from '../../domain/v2/ulid.js';
import { bootstrapV2 } from '../../services/v2/workspaceContext.js';
import {
  capture,
} from '../../services/v2/captureService.js';
import {
  createCommitment,
  updateCommitment,
  transitionCommitment,
  waitOn,
  completeWithOutcome,
  listCommitments,
  getCommitmentOrThrow,
  CreateCommitmentInputSchema,
  type CreateCommitmentInput,
} from '../../services/v2/commitmentService.js';
import {
  createProposal,
  applyProposal,
  rejectProposal,
  expireProposal,
} from '../../services/v2/proposalService.js';
import { runExtractor, buildExtractorProposal } from '../../services/v2/ai/extractor.js';
import { generatePlan, acceptPlan, PlanConstraintsSchema } from '../../services/v2/planningService.js';
import { search, getContext } from '../../services/v2/memoryService.js';
import { NoteService, NoteNotFoundError } from '../../services/v2/noteService.js';
import { loadLegacyTasks, migrateLegacyTask } from '../../services/v2/legacyAdapter.js';
import { loadConfig } from '../../services/config.js';
import { readDailyNote, writeDailyNote } from '../../services/fileSystem.js';
import { withDateLock } from '../../services/lock.js';
import { editTaskFullInMarkdown, updateTaskInMarkdown } from '../../services/parser.js';
import { getV2Flags } from '../../services/v2/featureFlags.js';
import { listConnectors, getConnector, syncConnector, pauseConnector, deleteConnector, runConnectorSyncOnce } from '../../services/v2/connectors.js';
import {
  processMeeting,
  recordDecision,
  getMeetingStats,
} from '../../services/v2/meetingService.js';
import {
  getStaleCommitments,
  getWaitingOverdue,
  generateWeeklyReview,
  buildTriageProposal,
} from '../../services/v2/reviewerService.js';
import {
  loadProactiveConfig,
  saveProactiveConfig,
  scanProactiveProposals,
  recordProposalAction,
  loadProactiveState,
  saveProactiveState,
  type ProactiveConfig,
  type ProactiveChannel,
} from '../../services/v2/proactiveProposal.js';
import {
  syncCalendar,
  listCalendarConnectors,
} from '../../services/v2/calendarConnectors.js';
import {
  syncMessages,
  listMessageConnectors,
} from '../../services/v2/messageConnectors.js';
import {
  buildDraft,
  confirmAndSend,
  blockedSendImpl,
} from '../../services/v2/externalWriteService.js';
import {
  listEntities,
  getEntity as getExportEntity,
  exportWorkspace,
  searchEntities,
} from '../../services/v2/exportService.js';
import {
  importEntities,
  resetWorkspace,
  ImportOverwriteConflictError,
  ImportWorkspaceMismatchError,
  ResetConfirmError,
} from '../../services/v2/importService.js';
import {
  issueMobileToken,
  listMobileTokens,
  revokeMobileToken,
  authenticateMobileToken,
  mobileCapture,
  MobileCaptureInputSchema,
} from '../../services/v2/mobileService.js';
import { ConcurrentModificationError } from '../../repositories/v2/atomicWrite.js';
import {
  AgentInvocationInputSchema,
  OrganizeInputSchema,
  listAgentDefinitions,
  organizeMindmap,
  startAgentRun,
} from '../../services/v2/agentService.js';
import { JobKindSchema, JobStatusSchema } from '../../domain/v2/jobs.js';
import {
  captureNoteMeeting,
  captureNoteMeetingBinary,
  MeetingAudioAccessError,
  NoteMeetingCaptureInputSchema,
  resolveNoteMeetingAudio,
  StoredMeetingTranscriptionInputSchema,
  transcribeStoredMeetingAudio,
} from '../../services/v2/noteMeetingCaptureService.js';
import {
  getLocalTranscriptionConfig,
  saveLocalTranscriptionConfig,
  transcribeMeetingAudio,
  LocalTranscriptionConfigSchema,
  localTranscriptionDefaults,
  localTranscriptionStatus,
} from '../../services/v2/localTranscriptionService.js';
import {
  generateAndSaveDailyReport,
  listDailyReports,
  readDailyReport,
  assertIsoDate,
} from '../../services/v2/dailyReport.js';
import {
  mirrorTaskCompletionToMindmap,
  type CompletionMirrorInput,
  type MirrorResult,
} from '../../services/v2/taskCompletionMirror.js';
import {
  startEventOperatorRun,
  getEventOperatorRun,
  cancelEventOperatorRun,
  getPendingGraphProposal,
  applyEventGraphProposal,
  rejectEventGraphProposal,
  validateEventGraphProposal,
} from '../../services/v2/eventOperatorService.js';
import { makeEventGraphRouteDeps } from '../../services/v2/eventGraphMindmapBridge.js';
import { getDeepSeekHarnessRuntime } from '../../services/harness/DeepSeekHarnessRuntime.js';
import { streamEventOperatorRunEvents } from '../../services/v2/eventOperatorSse.js';
import { prepareEventOperatorRunRetry, recoverEventOperatorRuns } from '../../services/v2/eventRunRecovery.js';
import { diagnoseEventOperatorRuntime } from '../../services/v2/eventOperatorDiagnostics.js';
import { EVENT_OPERATOR_TOOL_WHITELIST } from '../../services/v2/eventOperatorTools.js';

export const v2Router = Router();

// ---------------------------------------------------------------------------
// Bootstrap middleware: every request gets a V2Repository bound to the
// active workspace. We attach it to res.locals for handlers to read.
// ---------------------------------------------------------------------------
v2Router.use(async (_req, res, next) => {
  try {
    const flags = await getV2Flags();
    if (!flags.enabled) {
      return res.status(503).json({
        error: { code: 'v2_disabled', message: 'AI-Native v2 is not enabled for this workspace.' },
      });
    }
    // Use the current config to resolve the workspace root. The v2 layer
    // never touches v1's config file; the host app passes the resolved root
    // via env or the bootstrap options.
    const b = await bootstrapV2({
      workspaceRoot: process.env.DAILYFLOW_V2_WORKSPACE_ROOT || undefined,
      workspaceId: process.env.DAILYFLOW_V2_WORKSPACE_ID || undefined,
    });
    res.locals.v2 = b;
    next();
  } catch (err) {
    next(err);
  }
});

function getV2(res: Response): { repo: import('../../repositories/v2/repository.js').V2Repository; workspaceId: string; ctx: import('../../repositories/v2/repository.js').WorkspaceContext } {
  const value = res.locals.v2 as { repo: import('../../repositories/v2/repository.js').V2Repository; ctx: import('../../repositories/v2/repository.js').WorkspaceContext };
  return { ...value, workspaceId: value.ctx.workspaceId };
}

async function requireConnectorsV2(_req: Request, res: Response, next: NextFunction) {
  try {
    const flags = await getV2Flags();
    if (!flags.connectorsV2) {
      return res.status(404).json({
        error: { code: 'not_found', message: 'Connector APIs are not enabled for this workspace.' },
      });
    }
    next();
  } catch (error) {
    next(error);
  }
}

// Durable background jobs. The UI can resume these by ID after navigation or
// reload; the idempotency key prevents duplicate work.
v2Router.post('/jobs', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const input = z.object({
      kind: JobKindSchema,
      entityRef: z.object({
        type: z.string().trim().min(1).max(64),
        id: z.string().trim().min(1).max(256),
      }),
      idempotencyKey: z.string().trim().min(1).max(512),
    }).parse(req.body);
    const job = await repo.createOrGetJob({ ...input, status: 'queued' });
    res.status(job.status === 'queued' && job.attempt === 1 ? 201 : 200).json({ job });
  } catch (err) { handleError(err, res); }
});

v2Router.get('/jobs', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const status = req.query.status ? JobStatusSchema.parse(req.query.status) : undefined;
    let items = await repo.listJobs();
    if (status) items = items.filter(j => j.status === status);
    res.json({ items, total: items.length });
  } catch (err) { handleError(err, res); }
});

v2Router.get('/jobs/:id', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const job = await repo.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: { code: 'not_found', message: 'Job not found' } });
    res.json({ job });
  } catch (err) { handleError(err, res); }
});

v2Router.post('/jobs/:id/retry', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const job = await repo.retryJob(req.params.id);
    if (!job) return res.status(404).json({ error: { code: 'not_found', message: 'Job not found' } });
    res.json({ job });
  } catch (err) { handleError(err, res); }
});

v2Router.post('/jobs/:id/cancel', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const job = await repo.cancelJob(req.params.id);
    if (!job) return res.status(404).json({ error: { code: 'not_found', message: 'Job not found' } });
    res.json({ job });
  } catch (err) { handleError(err, res); }
});

// Local ASR configuration is workspace-local and never contains API keys.
v2Router.get('/transcription/local-config', async (_req, res) => {
  try {
    const { repo } = getV2(res);
    const config = await getLocalTranscriptionConfig(repo);
    res.json({
      config,
      status: config ? await localTranscriptionStatus(config) : undefined,
      defaults: localTranscriptionDefaults,
    });
  }
  catch (err) { handleError(err, res); }
});

v2Router.put('/transcription/local-config', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const config = await saveLocalTranscriptionConfig(repo, LocalTranscriptionConfigSchema.parse(req.body));
    res.json({ config, status: await localTranscriptionStatus(config) });
  } catch (err) { handleError(err, res); }
});

// Queues and executes one local transcription. The durable JobRecord is
// returned even when the provider fails; clients can retry the failed job.
v2Router.post('/notes/:id/meeting/transcribe-local', async (req, res) => {
  let active: Awaited<ReturnType<import('../../repositories/v2/repository.js').V2Repository['getJob']>> = null;
  try {
    const { repo, workspaceId } = getV2(res);
    const input = z.object({ sourceId: z.string().min(1), config: LocalTranscriptionConfigSchema.optional() }).parse(req.body);
    const config = input.config ?? await getLocalTranscriptionConfig(repo);
    if (!config) return res.status(400).json({ error: { code: 'local_transcription_not_configured', message: 'Configure a local whisper.cpp executable and model first.' } });
    const source = await repo.getSourceItem(input.sourceId);
    if (!source || source.kind !== 'meeting_audio') return res.status(404).json({ error: { code: 'not_found', message: 'Meeting audio source not found.' } });
    active = await repo.createOrGetJob({ kind: 'transcription', entityRef: { type: 'source', id: source.id }, idempotencyKey: `local-transcription:${workspaceId}:${source.id}:${source.contentHash}:${config.modelPath}`, status: 'queued' });
    if (active.status === 'succeeded') return res.json({ job: active });
    if (active.status === 'failed' && active.error?.retryable) {
      active = await repo.retryJob(active.id);
      if (!active) return res.status(404).json({ error: { code: 'not_found', message: 'Transcription job not found.' } });
    }
    if (active.status !== 'queued') return res.status(202).json({ job: active });
    const claim = await repo.startJob(active.id, 10); if (!claim.started || !claim.job) return res.status(202).json({ job: claim.job });
    active = claim.job;
    const out = await transcribeMeetingAudio(repo, req.params.id, source.id, config);
    active = await repo.updateJob(active.id, { status: 'succeeded', progress: 100, resultRef: { type: 'source', id: out.source.id }, finishedAt: new Date().toISOString() });
    const note = await repo.getNoteDocument(req.params.id);
    res.status(201).json({ job: active, source: out.source, note });
  } catch (err) {
    if (active?.status === 'running') await getV2(res).repo.updateJob(active.id, { status: 'failed', error: { code: 'local_transcription_failed', message: err instanceof Error ? err.message : String(err), retryable: true }, finishedAt: new Date().toISOString() }).catch(() => {});
    handleError(err, res);
  }
});

function handleError(err: unknown, res: Response): void {
  if (err instanceof z.ZodError) {
    res.status(400).json({ error: { code: 'validation', message: 'Invalid input.', issues: err.issues } });
    return;
  }
  if (err && typeof err === 'object' && 'code' in err) {
    const e = err as { code: string; message: string; from?: string; to?: string };
    if (e.code === 'invalid_transition') {
      res.status(409).json({ error: { code: e.code, message: e.message, from: e.from, to: e.to } });
      return;
    }
    if (e.code === 'concurrent_modification') {
      res.status(409).json({ error: { code: e.code, message: e.message } });
      return;
    }
    if (e.code === 'commitment_invalid') {
      res.status(400).json({ error: { code: e.code, message: e.message } });
      return;
    }
    if (e.code === 'invalid_job_transition' || e.code === 'job_not_retryable' || e.code === 'job_not_cancellable') {
      res.status(409).json({ error: { code: e.code, message: e.message, from: e.from, to: e.to } });
      return;
    }
    // AI Event Operator errors.
    if (e.code === 'proposal_stale' || e.code === 'pending_proposal_exists' || e.code === 'run_not_cancellable' || e.code === 'run_not_retryable' || e.code === 'proposal_not_pending' || e.code === 'IDEMPOTENCY_KEY_REUSED' || e.code === 'PROPOSAL_ALREADY_APPLIED' || e.code === 'PROPOSAL_APPLY_BUSY') {
      res.status(409).json({ error: { code: e.code, message: e.message } });
      return;
    }
    if (e.code === 'not_found') {
      res.status(404).json({ error: { code: e.code, message: e.message } });
      return;
    }
    if (e.code === 'invalid_cursor') {
      res.status(400).json({ error: { code: e.code, message: e.message } });
      return;
    }
    if (e.code === 'proposal_invalid' || e.code === 'graph_domain_apply_failed') {
      res.status(422).json({ error: { code: e.code, message: e.message, issues: (e as { issues?: unknown }).issues } });
      return;
    }
  }
  if (err instanceof ConcurrentModificationError) {
    res.status(409).json({ error: { code: 'concurrent_modification', message: err.message } });
    return;
  }
  if (err instanceof NoteNotFoundError) {
    res.status(404).json({ error: { code: 'not_found', message: err.message } });
    return;
  }
  if (err instanceof ImportOverwriteConflictError) {
    res.status(409).json({
      error: {
        code: 'overwrite_conflict',
        message: err.message,
        conflicts: err.conflicts,
      },
    });
    return;
  }
  if (err instanceof ImportWorkspaceMismatchError) {
    res.status(403).json({
      error: {
        code: 'workspace_mismatch',
        message: err.message,
        offenders: err.offenders,
      },
    });
    return;
  }
  if (err instanceof ResetConfirmError) {
    res.status(400).json({
      error: { code: 'reset_confirm_required', message: err.message },
    });
    return;
  }
  // Avoid leaking internals to the wire
  // eslint-disable-next-line no-console
  console.error('[v2] unhandled error:', err);
  res.status(500).json({ error: { code: 'internal', message: 'Internal server error' } });
}

// ---------------------------------------------------------------------------
// Health / status
// ---------------------------------------------------------------------------

v2Router.get('/status', async (_req, res) => {
  try {
    const flags = await getV2Flags();
    const { repo } = getV2(res);
    const { scanned, entities } = await repo.rebuildIndex();
    res.json({
      status: 'ok',
      version: 1,
      flags,
      index: { scanned, entities },
    });
  } catch (err) {
    handleError(err, res);
  }
});

// ---------------------------------------------------------------------------
// Source / Inbox (DF2-003)
// ---------------------------------------------------------------------------

v2Router.post('/inbox/capture', async (req, res) => {
  try {
    const { repo, ctx } = getV2(res); const workspaceId = ctx.workspaceId;
    const r = await capture(repo, { ...req.body, workspaceId });
    res.status(201).json({ source: r.source });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.get('/inbox', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const all = await repo.listSourceItems();
    // Filter: show only items that haven't been processed into commitments.
    // In v1 we surface all sources; the UI groups by processingStatus.
    const status = (req.query.processingStatus as string | undefined) ?? undefined;
    const filtered = status ? all.filter(s => s.processingStatus === status) : all;
    res.json({ items: filtered, total: filtered.length });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.get('/sources/:id', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const item = await repo.getSourceItem(req.params.id);
    if (!item) return res.status(404).json({ error: { code: 'not_found', message: 'Source not found' } });
    res.json({ source: item });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.delete('/sources/:id', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const ok = await repo.deleteSourceItem(req.params.id);
    if (!ok) return res.status(404).json({ error: { code: 'not_found', message: 'Source not found' } });
    res.json({ ok: true });
  } catch (err) {
    handleError(err, res);
  }
});

// ---------------------------------------------------------------------------
// Notes (spec §5.2 / §7.3 / F-02A / §11.3)
// ---------------------------------------------------------------------------
//
// Notes are the user's primary working surface. They are intentionally
// permissive: a note can be created with an empty body and no title, and
// auto-saves bump a version counter so the client and server can detect
// concurrent edits and merge gracefully.

v2Router.get('/notes', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const svc = new NoteService(repo);
    const state = typeof req.query.state === 'string' ? (req.query.state as 'draft' | 'active' | 'archived') : undefined;
    const kind = typeof req.query.kind === 'string' ? (req.query.kind as 'quick' | 'daily' | 'meeting' | 'project' | 'reference' | 'general') : undefined;
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const notes = await svc.list({ state, kind, q });
    res.json({ notes, total: notes.length });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.post('/notes', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const svc = new NoteService(repo);
    const note = await svc.create(req.body ?? {});
    res.status(201).json({ note });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.get('/notes/:id', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const svc = new NoteService(repo);
    const note = await svc.get(req.params.id);
    // Keep reads side-effect free. The former fire-and-forget
    // touchLastOpened() rewrote the whole Markdown document without
    // participating in the autosave version protocol. If that write
    // completed after a PATCH, it could silently restore the stale body
    // even though the editor had already shown "Saved".
    //
    // The Notes "Recent" view is based on updatedAt, so this write was
    // unnecessary as well as unsafe.
    res.json({ note });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.patch('/notes/:id', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const svc = new NoteService(repo);
    const note = await svc.update(req.params.id, req.body ?? {});
    res.json({ note });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.delete('/notes/:id', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const svc = new NoteService(repo);
    const ok = await svc.delete(req.params.id);
    if (!ok) return res.status(404).json({ error: { code: 'not_found', message: 'Note not found' } });
    res.json({ ok: true });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.post('/notes/:id/archive', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const svc = new NoteService(repo);
    const expectedAutoSaveVersion = z.number().int().nonnegative().parse(
      req.body?.expectedAutoSaveVersion,
    );
    const note = await svc.archive(req.params.id, expectedAutoSaveVersion);
    res.json({ note });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.post('/notes/:id/meeting/capture', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const input = NoteMeetingCaptureInputSchema.parse(req.body ?? {});
    const result = await captureNoteMeeting(repo, req.params.id, input);
    res.status(result.transcriptSource ? 201 : 200).json(result);
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.post(
  '/notes/:id/meeting/capture-binary',
  raw({ type: 'audio/*', limit: '512mb' }),
  async (req, res) => {
    try {
      const { repo } = getV2(res);
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({
          error: { code: 'empty_recording', message: 'No audio bytes were received.' },
        });
      }
      const durationParam = req.query.durationSeconds;
      const languageParam = req.query.language;
      const filenameParam = req.query.filename;
      const result = await captureNoteMeetingBinary(repo, req.params.id, {
        audio: {
          bytes: req.body,
          mimeType: req.get('content-type') || 'application/octet-stream',
          filename: typeof filenameParam === 'string' ? filenameParam : undefined,
        },
        durationSeconds: typeof durationParam === 'string' ? Number(durationParam) : undefined,
        language: languageParam === 'zh' || languageParam === 'en' ? languageParam : undefined,
      });
      res.status(200).json(result);
    } catch (err) {
      handleError(err, res);
    }
  },
);

v2Router.post('/notes/:id/meeting/transcribe', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const input = StoredMeetingTranscriptionInputSchema.parse(req.body ?? {});
    const result = await transcribeStoredMeetingAudio(repo, req.params.id, input);
    res.status(201).json(result);
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.get('/notes/:id/meeting/audio/:sourceId', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const audio = await resolveNoteMeetingAudio(repo, req.params.id, req.params.sourceId);
    res.type(audio.mimeType);
    res.sendFile(audio.absolutePath, (error) => {
      if (error && !res.headersSent) {
        const statusCode = (error as Error & { statusCode?: number }).statusCode;
        res.status(statusCode === 404 ? 404 : 500).json({
          error: {
            code: statusCode === 404 ? 'audio_source_not_found' : 'audio_read_failed',
            message: statusCode === 404 ? 'Meeting audio file not found.' : 'Unable to read meeting audio.',
          },
        });
      }
    });
  } catch (err) {
    if (err instanceof MeetingAudioAccessError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message } });
      return;
    }
    handleError(err, res);
  }
});

v2Router.get('/notes/:id/backlinks', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const svc = new NoteService(repo);
    const backlinks = await svc.backlinks(req.params.id);
    res.json({ backlinks });
  } catch (err) {
    handleError(err, res);
  }
});

/**
 * POST /api/v2/sources/:id/process
 * Runs the Extractor and emits a Proposal. The Proposal is persisted; the
 * client (Inbox review UI) then POSTs to /proposals/:id/accept.
 */
v2Router.post('/sources/:id/process', async (req, res) => {
  try {
    const { repo, ctx } = getV2(res);
    const workspaceId = ctx.workspaceId;
    const source = await repo.getSourceItem(req.params.id);
    if (!source) return res.status(404).json({ error: { code: 'not_found', message: 'Source not found' } });
    const job = await repo.createOrGetJob({
      kind: 'source_analysis',
      entityRef: { type: 'source', id: source.id },
      idempotencyKey: `source-analysis:${workspaceId}:${source.id}:${source.contentHash}:extractor@1`,
      status: source.processingStatus === 'processing' ? 'running' : 'queued',
    });
    if (job.status === 'succeeded' || job.status === 'waiting_review') {
      const existing = (await repo.listProposals()).find(p => p.sourceIds.includes(source.id));
      if (existing) return res.json({ proposal: existing, evidence: [], agentRun: null, fallback: false, empty: false, resumed: true, job });
    }
    if (job.status === 'failed' || job.status === 'cancelled') {
      return res.status(409).json({
        error: {
          code: job.status === 'failed' ? 'job_requires_retry' : 'job_cancelled',
          message: job.status === 'failed'
            ? 'Retry the failed job before processing this source again.'
            : 'This source processing job was cancelled.',
          jobId: job.id,
        },
      });
    }
    // Processing is a durable state transition. A second click must not
    // create another AgentRun/Evidence/Proposal for the same source.
    if (source.processingStatus === 'processing') {
      return res.status(202).json({ job, resumed: true });
    }
    if (source.processingStatus === 'needs_review' || source.processingStatus === 'processed') {
      const existing = (await repo.listProposals()).find(p => p.sourceIds.includes(source.id));
      if (existing) {
        return res.json({
          proposal: existing,
          evidence: [],
          agentRun: null,
          fallback: false,
          empty: source.processingStatus === 'processed',
          resumed: true,
          job,
        });
      }
    }
    source.processingStatus = 'processing';
    const claim = await repo.startJob(job.id, 10);
    if (!claim.started) return res.status(202).json({ job: claim.job, resumed: true });
    let latestJob = claim.job;
    await repo.saveSourceItem(source, {
      auditKind: 'process',
      auditEntity: { type: 'source', id: source.id },
    });
    const extractorOutput = await runExtractor({ source });
    const built = buildExtractorProposal({ source, extractorOutput, workspaceId, actorId: 'user' });

    // Persist the AgentRun (success or failed) for the audit trail.
    await repo.saveAgentRun(built.agentRun, {
      auditKind: 'process',
      auditEntity: { type: 'run', id: built.agentRun.id },
    });

    // Persist any evidence records (the proposal links to them by id).
    for (const ev of built.evidence) {
      await repo.saveEvidence(ev, {
        auditKind: 'process',
        auditEntity: { type: 'evidence', id: ev.id },
      });
    }

    const proposal = await createProposal(repo, workspaceId, {
      kind: 'extract_commitments',
      sourceIds: [source.id],
      modelRunId: built.agentRun.id,
      changes: built.changes,
    });

    // Update the source's processingStatus.
    source.processingStatus = built.empty ? 'processed' : 'needs_review';
    await repo.saveSourceItem(source, {
      auditKind: 'process',
      auditEntity: { type: 'source', id: source.id },
    });
    latestJob = await repo.updateJob(job.id, {
      status: built.empty ? 'succeeded' : 'waiting_review',
      progress: 100,
      resultRef: { type: 'proposal', id: proposal.id },
      finishedAt: new Date().toISOString(),
    });

    res.json({
      proposal,
      evidence: built.evidence,
      agentRun: built.agentRun,
      fallback: built.fallback,
      fallbackReason: built.fallbackReason,
      empty: built.empty,
      job: latestJob,
    });
  } catch (err) {
    try {
      const { repo } = getV2(res);
      const failedSource = await repo.getSourceItem(req.params.id);
      if (failedSource?.processingStatus === 'processing') {
        failedSource.processingStatus = 'failed';
        await repo.saveSourceItem(failedSource, {
          auditKind: 'agent.error',
          auditEntity: { type: 'source', id: failedSource.id },
        });
      }
      const failedJob = (await repo.listJobs()).find(j => j.entityRef.id === req.params.id && j.status === 'running');
      if (failedJob) await repo.updateJob(failedJob.id, {
        status: 'failed',
        error: { code: 'source_processing_failed', message: err instanceof Error ? err.message : String(err), retryable: true },
        finishedAt: new Date().toISOString(),
      });
    } catch {
      // Preserve the original processing error if failure bookkeeping fails.
    }
    handleError(err, res);
  }
});

/** Declarative Agent catalog. Execution is intentionally a separate concern. */
v2Router.get('/agents', (_req, res) => {
  res.json({ agents: listAgentDefinitions() });
});

/** Create a reviewable AgentRun context for a Note; no summary is generated yet. */
v2Router.post('/notes/:id/agents/run', async (req, res) => {
  try {
    const { repo, ctx } = getV2(res);
    const parsed = AgentInvocationInputSchema.parse({ ...(req.body ?? {}), noteId: req.params.id });
    const run = await startAgentRun(repo, ctx.workspaceId, parsed);
    res.status(202).json({ run, status: 'awaiting_agent_runtime' });
  } catch (err) {
    handleError(err, res);
  }
});
// ---------------------------------------------------------------------------
// Mind-map "AI organize" — Sprint 1 / Gap 2
//
//   POST /api/v2/mindmaps/:id/organize
//     body  : { strategy: 'by_topic' | 'by_priority' | 'by_time',
//               nodes:   [{ id, text, kind?, status?, tags? }, …],
//               edges:   [{ id, source, target }, …] }
//     200   : { suggestion: OrganizeSuggestion }
//     4xx   : validation / not-found (Zod)
//
// The handler is deliberately *read-only*. It returns a suggestion the
// client previews in the modal; the user must explicitly press "应用" before
// anything is persisted via the legacy PUT /api/mindmaps/:id. This keeps
// the "永远给撤销按钮 / 第一次仅给推荐" rule from Gap 2 (see
// docs/MINDMAP_AI_ORGANIZE.md).
// ---------------------------------------------------------------------------

v2Router.post('/mindmaps/:id/organize', async (req, res) => {
  try {
    // v2 bootstrap is not strictly needed for the read-only organizer —
    // it doesn't touch v2 storage — but we still respect the same error
    // envelope and feature flags for consistency with neighbouring routes.
    getV2(res);
    const parsed = OrganizeInputSchema.parse({
      ...(req.body ?? {}),
      mindmapId: req.params.id,
    });
    const suggestion = organizeMindmap(null, parsed);
    res.status(200).json({ suggestion });
  } catch (err) {
    handleError(err, res);
  }
});


// ---------------------------------------------------------------------------
// Commitment (DF2-007)
// ---------------------------------------------------------------------------

v2Router.get('/commitments', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const state = req.query.state as string | undefined;
    const filter: { state?: 'open' | import('../../domain/v2/types.js').CommitmentState } | undefined = state
      ? { state: state as 'open' | import('../../domain/v2/types.js').CommitmentState }
      : undefined;
    const items = await listCommitments(repo, filter);
    res.json({ items, total: items.length });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.post('/commitments', async (req, res) => {
  try {
    const { repo, ctx } = getV2(res); const workspaceId = ctx.workspaceId;
    const input: CreateCommitmentInput = CreateCommitmentInputSchema.parse(req.body);
    const c = await createCommitment(repo, workspaceId, input);
    res.status(201).json({ commitment: c });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.get('/commitments/:id', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const c = await getCommitmentOrThrow(repo, req.params.id);
    res.json({ commitment: c });
  } catch (err) {
    if (err instanceof Error && err.message === 'Commitment not found') {
      return res.status(404).json({ error: { code: 'not_found', message: err.message } });
    }
    handleError(err, res);
  }
});

v2Router.patch('/commitments/:id', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const expectedHash = req.header('If-Match') ?? req.body.expectedHash;
    const c = await updateCommitment(repo, req.params.id, req.body, { expectedHash });
    res.json({ commitment: c });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.post('/commitments/:id/plan', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const target = req.body.targetState ?? 'planned';
    const c = await transitionCommitment(repo, req.params.id, target, { reason: 'add_to_plan' });
    res.json({ commitment: c });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.post('/commitments/:id/wait', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const schema = z.object({
      waitingOnId: z.string().optional(),
      waitingOnText: z.string().min(1),
      reviewAt: z.string().datetime({ offset: true }),
    });
    const input = schema.parse(req.body);
    const c = await waitOn(repo, req.params.id, {
      waitingOnId: input.waitingOnId,
      waitingOnText: input.waitingOnText,
      reviewAt: input.reviewAt,
    });
    res.json({ commitment: c });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.post('/commitments/:id/resume', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const c = await transitionCommitment(repo, req.params.id, 'active', { reason: 'resume' });
    res.json({ commitment: c });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.post('/commitments/:id/cancel', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const c = await transitionCommitment(repo, req.params.id, 'cancelled', { reason: req.body?.reason });
    res.json({ commitment: c });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.post('/commitments/:id/complete', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const schema = z.object({
      outcomeKind: z.enum(['delivered', 'decided', 'sent', 'confirmed', 'failed', 'cancelled']),
      outcomeSummary: z.string().min(1).max(2000),
      evidenceIds: z.array(z.string()).optional(),
      followUpCommitmentIds: z.array(z.string()).optional(),
      suggestFollowUp: z.boolean().optional(),
    });
    const input = schema.parse(req.body);
    const r = await completeWithOutcome(repo, req.params.id, {
      outcomeKind: input.outcomeKind,
      outcomeSummary: input.outcomeSummary,
      evidenceIds: input.evidenceIds,
      followUpCommitmentIds: input.followUpCommitmentIds,
      suggestFollowUp: input.suggestFollowUp,
    });

    // Sprint 1 Gap 7: mirror the completion back to the linked mindmap
    // node (status='done' + note appended). A migrated v1 task carries
    // `legacyTaskId`; only that path can resolve to a mindmap node today.
    // Wrapped in try/catch so a mirror failure NEVER blocks the response.
    let mirrorResult: MirrorResult = { mirroredNodeIds: [], mindmapIds: [] };
    if (r.commitment.legacyTaskId) {
      const taskDate = (r.commitment.completedAt ?? new Date().toISOString()).slice(0, 10);
      const mirrorInput: CompletionMirrorInput = {
        taskId: r.commitment.legacyTaskId,
        taskDate,
        completedAt: r.commitment.completedAt ?? new Date().toISOString(),
        outcomeSummary: r.outcome.summary,
      };
      try {
        mirrorResult = await mirrorTaskCompletionToMindmap(repo, mirrorInput);
      } catch (err) {
        console.warn('[v2/commitments/complete] mindmap mirror failed (non-blocking):', err);
      }
    }

    res.json({
      commitment: r.commitment,
      outcome: r.outcome,
      followUpProposal: r.followUpProposal,
      followUpCandidates: r.followUpCandidates,
      mirror: mirrorResult,
    });
  } catch (err) {
    handleError(err, res);
  }
});

// ---------------------------------------------------------------------------
// Sprint 1 Gap 7: explicit mindmap mirror trigger
// ---------------------------------------------------------------------------
// Used when the caller has no automatic hook into completeWithOutcome
// (e.g. legacy v1 paths, the desktop-app migration script, or
// recovery after a partial failure). The route performs the same
// persistence as the implicit hook on /commitments/:id/complete, so
// re-running it is safe and idempotent.
// ---------------------------------------------------------------------------
v2Router.post('/mirror/task-completion', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const schema = z.object({
      taskId: z.string().min(1),
      taskDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      completedAt: z.string().min(1),
      outcomeSummary: z.string().optional(),
    });
    const input = schema.parse(req.body);
    const result = await mirrorTaskCompletionToMindmap(repo, input);
    res.json({ mirrored: result.mirroredNodeIds.length > 0, ...result });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.get('/commitments/:id/history', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const events = await repo.audit.eventsFor('commitment', req.params.id);
    res.json({ events });
  } catch (err) {
    handleError(err, res);
  }
});

// ---------------------------------------------------------------------------
// Proposal (DF2-004)
// ---------------------------------------------------------------------------

v2Router.post('/proposals/draft', async (req, res) => {
  try {
    const { repo, workspaceId } = getV2(res);
    const input = {
      kind: req.body?.kind ?? 'extract_commitments',
      sourceIds: Array.isArray(req.body?.sourceIds) ? req.body.sourceIds : [],
      changes: Array.isArray(req.body?.changes) ? req.body.changes : [],
      modelRunId: typeof req.body?.modelRunId === 'string' ? req.body.modelRunId : undefined,
    };
    const proposal = await createProposal(repo, workspaceId, input);
    res.status(201).json({ proposal });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.get('/proposals', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const status = req.query.status as string | undefined;
    let items = await repo.listProposals();
    if (status) items = items.filter(p => p.status === status);
    res.json({ items, total: items.length });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.get('/proposals/:id', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const p = await repo.getProposal(req.params.id);
    if (!p) return res.status(404).json({ error: { code: 'not_found', message: 'Proposal not found' } });
    const evidenceIds = new Set(p.changes.flatMap(change => change.evidenceIds));
    const evidence = (await repo.listEvidence()).filter(item => evidenceIds.has(item.id));
    res.json({ proposal: p, evidence });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.post('/proposals/:id/accept', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const body = z.object({
      idempotencyKey: z.string().trim().min(1).max(512),
      selection: z.array(z.string()).optional(),
      userOverride: z.record(z.record(z.unknown())).optional(),
    }).parse(req.body);
    const result = await applyProposal(repo, req.params.id, {
      idempotencyKey: body.idempotencyKey,
      selection: body.selection,
      userOverride: body.userOverride,
    });
    res.json(result);
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.post('/proposals/:id/apply-selection', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const body = z.object({
      idempotencyKey: z.string().trim().min(1).max(512),
      selection: z.array(z.string()).optional(),
      userOverride: z.record(z.record(z.unknown())).optional(),
    }).parse(req.body);
    const result = await applyProposal(repo, req.params.id, {
      idempotencyKey: body.idempotencyKey,
      selection: body.selection,
      userOverride: body.userOverride,
    });
    res.json(result);
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.post('/proposals/:id/reject', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const reason = req.body?.reason ?? 'user_rejected';
    const p = await rejectProposal(repo, req.params.id, reason);
    res.json({ proposal: p });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.post('/proposals/:id/expire', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const p = await expireProposal(repo, req.params.id, req.body?.reason ?? 'expired');
    res.json({ proposal: p });
  } catch (err) {
    handleError(err, res);
  }
});

// ---------------------------------------------------------------------------
// Plan (DF2-009)
// ---------------------------------------------------------------------------

v2Router.post('/plans/generate', async (req, res) => {
  try {
    const { repo, ctx } = getV2(res); const workspaceId = ctx.workspaceId;
    const input = PlanConstraintsSchema.parse(req.body);
    const r = await generatePlan(repo, workspaceId, input);
    res.json(r);
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.get('/plans/:date', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const plan = await repo.getPlanByDate(req.params.date);
    if (!plan) return res.json({ plan: null });
    res.json({ plan });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.post('/plans/:id/accept', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const plan = await acceptPlan(repo, req.params.id);
    res.json({ plan });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.post('/plans/:date/replan', async (req, res) => {
  try {
    const { repo, ctx } = getV2(res); const workspaceId = ctx.workspaceId;
    const input = PlanConstraintsSchema.parse({ date: req.params.date, ...req.body });
    const r = await generatePlan(repo, workspaceId, input);
    res.json(r);
  } catch (err) {
    handleError(err, res);
  }
});

// ---------------------------------------------------------------------------
// Memory / search (Phase 4 - basic version)
// ---------------------------------------------------------------------------

v2Router.get('/memory/search', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const q = (req.query.q as string) ?? '';
    const r = await search(repo, q, Math.min(50, Number(req.query.limit ?? 20)));
    res.json(r);
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.get('/memory/context', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const commitmentId = req.query.commitmentId as string;
    if (!commitmentId) return res.status(400).json({ error: { code: 'validation', message: 'commitmentId required' } });
    const ctx = await getContext(repo, commitmentId);
    if (!ctx) return res.status(404).json({ error: { code: 'not_found', message: 'Commitment not found' } });
    res.json(ctx);
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.get('/people', async (req, res) => {
  try {
    const { repo } = getV2(res);
    res.json({ items: await repo.listPeople() });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.get('/projects', async (req, res) => {
  try {
    const { repo } = getV2(res);
    res.json({ items: await repo.listProjects() });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.get('/meetings', async (req, res) => {
  try {
    const { repo } = getV2(res);
    // Meetings are stored as SourceItems with kind=meeting_audio/meeting_transcript
    const sources = await repo.listSourceItems();
    res.json({ items: sources.filter(s => s.kind === 'meeting_audio' || s.kind === 'meeting_transcript') });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.get('/decisions', async (_req, res) => {
  try {
    const { repo } = getV2(res);
    res.json({ items: await repo.listDecisions() });
  } catch (err) {
    handleError(err, res);
  }
});

// Manual evidence creation. Used when the user wants to attach a snippet
// from a Source **or a Note** to a Commitment or Decision, or when the AI
// is offline and the user is recording the link themselves. Spec §10.5:
// "无法找到来源时必须明确标记为...AI 建议，不得伪造引用" — this endpoint
// creates real evidence only; the user cannot link to a quote that does
// not exist in the body.
v2Router.post('/evidence', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const { EvidenceSchema } = await import('../../domain/v2/types.js');
    const schema = z
      .object({
        // Exactly one of sourceId or noteId is required.
        sourceId: z.string().optional(),
        noteId: z.string().optional(),
        quote: z.string().min(1).max(2000),
        locator: z
          .union([
            z.object({ kind: z.literal('text'), start: z.number(), end: z.number() }),
            z.object({ kind: z.literal('lines'), start: z.number(), end: z.number() }),
            z.object({ kind: z.literal('audio'), startSeconds: z.number(), endSeconds: z.number() }),
            z.object({ kind: z.literal('note_block'), blockId: z.string(), start: z.number(), end: z.number() }),
          ])
          .optional(),
      })
      .refine((b) => Boolean(b.sourceId) !== Boolean(b.noteId), {
        message: 'Exactly one of sourceId or noteId is required',
      });
    const input = schema.parse(req.body);

    // Resolve the anchor and check the quote is verbatim (spec §10.5).
    let anchorWorkspaceId: string;
    let anchorContentHash: string;
    if (input.noteId) {
      const note = await repo.getNoteDocument(input.noteId);
      if (!note) {
        return res.status(404).json({ error: { code: 'not_found', message: 'Note not found' } });
      }
      if (!note.body.includes(input.quote)) {
        return res.status(400).json({
          error: {
            code: 'validation',
            message: 'Quote must be a verbatim substring of the note body. Spec §10.5 forbids fabrication.',
          },
        });
      }
      anchorWorkspaceId = note.workspaceId;
      anchorContentHash = note.contentHash;
    } else if (input.sourceId) {
      const source = await repo.getSourceItem(input.sourceId);
      if (!source) {
        return res.status(404).json({ error: { code: 'not_found', message: 'Source not found' } });
      }
      if (source.body && !source.body.includes(input.quote)) {
        return res.status(400).json({
          error: {
            code: 'validation',
            message: 'Quote must be a verbatim substring of the source body. Spec §10.5 forbids fabrication.',
          },
        });
      }
      anchorWorkspaceId = source.workspaceId;
      anchorContentHash = source.contentHash;
    } else {
      return res.status(400).json({ error: { code: 'validation', message: 'sourceId or noteId is required' } });
    }

    const now = new Date().toISOString();
    const evidence = EvidenceSchema.parse({
      id: newId('ev'),
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
      createdBy: 'user',
      workspaceId: anchorWorkspaceId,
      sourceId: input.sourceId,
      noteId: input.noteId,
      quote: input.quote,
      locator: input.locator ?? { kind: 'text', start: 0, end: input.quote.length },
      sourceContentHash: anchorContentHash,
      stale: false,
    });
    await repo.saveEvidence(evidence, {
      auditKind: 'commitment.update',
      auditEntity: { type: 'evidence', id: evidence.id },
      auditData: { sourceId: input.sourceId, noteId: input.noteId, manual: true },
    });
    res.status(201).json({ evidence });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.get('/outcomes', async (req, res) => {
  try {
    const { repo } = getV2(res);
    res.json({ items: await repo.listOutcomes() });
  } catch (err) {
    handleError(err, res);
  }
});

// ---------------------------------------------------------------------------
// Legacy (DF2-012)
// ---------------------------------------------------------------------------

v2Router.get('/legacy/tasks', async (req, res) => {
  try {
    const { ctx } = getV2(res);
    const items = await loadLegacyTasks(ctx.root);
    res.json({ items });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.patch('/legacy/tasks/:dateLine', async (req, res) => {
  try {
    const { ctx } = getV2(res);
    const [date, lineStr] = req.params.dateLine.split('#');
    const line = Number(lineStr);
    if (!date || !line) {
      return res.status(400).json({ error: { code: 'validation', message: 'Expected /legacy/tasks/:date#:line' } });
    }
    const body = z.object({
      expectedTitle: z.string().min(1),
      status: z.enum(['todo', 'done']).optional(),
      deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }).refine(value => value.status !== undefined || value.deadline !== undefined, {
      message: 'status or deadline is required',
    }).parse(req.body);
    const config = await loadConfig();
    if (config.workspaceRoot !== ctx.root) {
      return res.status(409).json({ error: { code: 'workspace_changed', message: 'Active workspace changed; refresh and retry.' } });
    }
    const updateError = await withDateLock(date, async () => {
      const note = await readDailyNote(date, config);
      if (!note) return { status: 404, code: 'not_found', message: 'Daily file not found' };
      const task = note.tasks.find(item => item.line === line - 1 && item.title === body.expectedTitle);
      if (!task || task.line === undefined) {
        return { status: 409, code: 'concurrent_modification', message: 'Task moved or changed; refresh and retry.' };
      }
      let content = note.content;
      if (body.status) content = updateTaskInMarkdown(content, task.line, body.status);
      if (body.deadline) content = editTaskFullInMarkdown(content, task.line, { deadline: body.deadline }, date);
      await writeDailyNote(date, content, config);
      return null;
    });
    if (updateError) {
      return res.status(updateError.status).json({
        error: { code: updateError.code, message: updateError.message },
      });
    }
    res.json({ ok: true });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.post('/legacy/tasks/:dateLine/migrate', async (req, res) => {
  try {
    const { repo, workspaceId, ctx } = getV2(res);
    const [date, lineStr] = req.params.dateLine.split('#');
    const line = Number(lineStr);
    if (!date || !line) return res.status(400).json({ error: { code: 'validation', message: 'Expected /legacy/tasks/:date#:line' } });
    const all = await loadLegacyTasks(ctx.root);
    const task = all.find(t => t.date === date && t.line === line);
    if (!task) return res.status(404).json({ error: { code: 'not_found', message: 'Legacy task not found' } });
    const r = await migrateLegacyTask(repo, workspaceId, task, req.body ?? {});
    res.status(201).json(r);
  } catch (err) {
    handleError(err, res);
  }
});

// ---------------------------------------------------------------------------
// Connectors (Phase 5/6 — stub for the spec; default blocked_by_external_authorization)
// ---------------------------------------------------------------------------

v2Router.get('/connectors', requireConnectorsV2, async (_req, res) => {
  try {
    const items = await listConnectors();
    res.json({ items });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.get('/connectors/:id', requireConnectorsV2, async (req, res) => {
  try {
    const c = await getConnector(req.params.id);
    if (!c) return res.status(404).json({ error: { code: 'not_found', message: 'Connector not found' } });
    res.json({ connector: c });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.post('/connectors/:id/sync', requireConnectorsV2, async (req, res) => {
  try {
    const result = await syncConnector(req.params.id);
    res.json(result);
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.post('/connectors/:id/pause', requireConnectorsV2, async (req, res) => {
  try {
    const c = await pauseConnector(req.params.id);
    res.json({ connector: c });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.delete('/connectors/:id', requireConnectorsV2, async (req, res) => {
  try {
    const ok = await deleteConnector(req.params.id);
    res.json({ ok });
  } catch (err) {
    handleError(err, res);
  }
});

// One-off sync (used for testing) — runs a single batch with the user's
// configured local connector. The Calendar/Email connectors return a
// blocked_by_external_authorization error until the user has actually granted
// credentials (Phase 5+).
v2Router.post('/connectors/sync-once', requireConnectorsV2, async (req, res) => {
  try {
    const result = await runConnectorSyncOnce(req.body?.type ?? 'local-markdown');
    res.json(result);
  } catch (err) {
    handleError(err, res);
  }
});

// ---------------------------------------------------------------------------
// Meeting (Phase 3)
// ---------------------------------------------------------------------------

v2Router.post('/meetings/process', async (req, res) => {
  let activeJob: Awaited<ReturnType<import('../../repositories/v2/repository.js').V2Repository['getJob']>> = null;
  try {
    const { repo, ctx } = getV2(res);
    const workspaceId = ctx.workspaceId;
    const schema = z.object({ sourceId: z.string() });
    const { sourceId } = schema.parse(req.body);
    const source = await repo.getSourceItem(sourceId);
    if (!source) return res.status(404).json({ error: { code: 'not_found', message: 'Source not found' } });
    activeJob = await repo.createOrGetJob({
      kind: 'transcription',
      entityRef: { type: 'source', id: source.id },
      idempotencyKey: `meeting-process:${workspaceId}:${source.id}:${source.contentHash}:meeting@1`,
      status: 'queued',
    });
    if (activeJob.status === 'succeeded') {
      return res.json({ resumed: true, job: activeJob });
    }
    if (activeJob.status === 'running') {
      return res.status(202).json({ resumed: true, job: activeJob });
    }
    if (activeJob.status !== 'queued') {
      return res.status(409).json({ error: { code: 'job_not_runnable', message: `Job is ${activeJob.status}.`, jobId: activeJob.id } });
    }
    const claim = await repo.startJob(activeJob.id, 10);
    if (!claim.started) return res.status(202).json({ resumed: true, job: claim.job });
    activeJob = claim.job;
    const out = await processMeeting(repo, { source, workspaceId, autoAcceptDecisions: false });
    activeJob = activeJob && await repo.updateJob(activeJob.id, {
      status: 'succeeded',
      progress: 100,
      resultRef: { type: 'source', id: source.id },
      finishedAt: new Date().toISOString(),
    });
    res.json({ ...out, job: activeJob });
  } catch (err) {
    if (activeJob?.status === 'running') {
      const { repo } = getV2(res);
      await repo.updateJob(activeJob.id, {
        status: 'failed',
        error: { code: 'transcription_failed', message: err instanceof Error ? err.message : String(err), retryable: true },
        finishedAt: new Date().toISOString(),
      }).catch(() => {});
    }
    handleError(err, res);
  }
});

v2Router.post('/decisions', async (req, res) => {
  try {
    const { repo, ctx } = getV2(res);
    const schema = z.object({
      title: z.string().min(1),
      decision: z.string().min(1),
      rationale: z.string().optional(),
      participantIds: z.array(z.string()).optional(),
      projectId: z.string().optional(),
      evidenceIds: z.array(z.string()).optional(),
    });
    const input = schema.parse(req.body) as {
      title: string;
      decision: string;
      rationale?: string;
      participantIds?: string[];
      projectId?: string;
      evidenceIds?: string[];
    };
    const d = await recordDecision(repo, ctx.workspaceId, input);
    res.status(201).json({ decision: d });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.get('/meetings/stats', async (_req, res) => {
  try {
    const { repo } = getV2(res);
    res.json(await getMeetingStats(repo));
  } catch (err) {
    handleError(err, res);
  }
});

// ---------------------------------------------------------------------------
// Reviewer (Phase 7)
// ---------------------------------------------------------------------------

v2Router.get('/review/stale', async (_req, res) => {
  try {
    const { repo } = getV2(res);
    res.json({ items: await getStaleCommitments(repo) });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.get('/review/waiting-overdue', async (_req, res) => {
  try {
    const { repo } = getV2(res);
    res.json({ items: await getWaitingOverdue(repo) });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.get('/review/weekly', async (_req, res) => {
  try {
    const { repo } = getV2(res);
    res.json(await generateWeeklyReview(repo));
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.post('/review/triage', async (_req, res) => {
  try {
    const { repo, ctx } = getV2(res);
    const prop = await buildTriageProposal(repo, { workspaceId: ctx.workspaceId, userId: 'user' });
    res.json(prop);
  } catch (err) {
    handleError(err, res);
  }
});

// ---------------------------------------------------------------------------
// Calendar (Phase 5)
// ---------------------------------------------------------------------------

v2Router.get('/calendar/connectors', requireConnectorsV2, async (_req, res) => {
  res.json({ items: listCalendarConnectors() });
});

v2Router.post('/calendar/sync', requireConnectorsV2, async (req, res) => {
  let activeJob: Awaited<ReturnType<import('../../repositories/v2/repository.js').V2Repository['getJob']>> = null;
  try {
    const { repo, ctx } = getV2(res);
    const schema = z.object({
      connectorId: z.string(),
      cursor: z.string().optional(),
      timeMin: z.string().datetime({ offset: true }).optional(),
      timeMax: z.string().datetime({ offset: true }).optional(),
      idempotencyKey: z.string().trim().min(1).max(512).optional(),
    });
    const input = schema.parse(req.body) as {
      connectorId: string;
      cursor?: string;
      timeMin?: string;
      timeMax?: string;
      idempotencyKey?: string;
    };
    activeJob = await repo.createOrGetJob({
      kind: 'calendar_sync',
      entityRef: { type: 'connector', id: input.connectorId },
      idempotencyKey: input.idempotencyKey ?? `calendar-sync:${ctx.workspaceId}:${input.connectorId}:${newId('job')}`,
      status: 'queued',
    });
    if (activeJob.status !== 'queued') {
      return res.status(activeJob.status === 'running' ? 202 : 200).json({ resumed: true, job: activeJob });
    }
    const claim = await repo.startJob(activeJob.id, 10);
    if (!claim.started) return res.status(202).json({ resumed: true, job: claim.job });
    activeJob = claim.job;
    const { idempotencyKey: _idempotencyKey, ...syncInput } = input;
    const r = await syncCalendar(repo, syncInput);
    activeJob = activeJob && await repo.updateJob(activeJob.id, r.ok ? {
      status: 'succeeded',
      progress: 100,
      resultRef: { type: 'connector', id: input.connectorId },
      finishedAt: new Date().toISOString(),
    } : {
      status: 'failed',
      progress: 0,
      error: {
        code: r.blockedBy ?? 'calendar_sync_failed',
        message: r.errors.join('; ') || 'Calendar sync failed',
        retryable: r.blockedBy !== 'external_authorization',
      },
      finishedAt: new Date().toISOString(),
    });
    res.status(r.ok ? 200 : 424).json({ ...r, job: activeJob });
  } catch (err) {
    if (activeJob?.status === 'running') {
      const { repo } = getV2(res);
      await repo.updateJob(activeJob.id, {
        status: 'failed',
        error: { code: 'calendar_sync_failed', message: err instanceof Error ? err.message : String(err), retryable: true },
        finishedAt: new Date().toISOString(),
      }).catch(() => {});
    }
    handleError(err, res);
  }
});

// ---------------------------------------------------------------------------
// Messages (Phase 6)
// ---------------------------------------------------------------------------

v2Router.get('/messages/connectors', requireConnectorsV2, async (_req, res) => {
  res.json({ items: listMessageConnectors() });
});

v2Router.post('/messages/sync', requireConnectorsV2, async (req, res) => {
  try {
    const { repo } = getV2(res);
    const schema = z.object({
      connectorId: z.string(),
      threadId: z.string().optional(),
      cursor: z.string().optional(),
      limit: z.number().int().positive().max(100).optional(),
    });
    const input = schema.parse(req.body) as {
      connectorId: string;
      threadId?: string;
      cursor?: string;
      limit?: number;
    };
    const r = await syncMessages(repo, input);
    res.json(r);
  } catch (err) {
    handleError(err, res);
  }
});

// ---------------------------------------------------------------------------
// External write (Phase 8)
// ---------------------------------------------------------------------------

v2Router.post('/external-writes/draft', requireConnectorsV2, async (req, res) => {
  try {
    const { repo } = getV2(res);
    const schema = z.object({
      commitmentId: z.string(),
      kind: z.enum(['email', 'message', 'calendar_event']),
      recipient: z.union([z.string(), z.array(z.string())]),
      bodyOverride: z.string().optional(),
      subjectOverride: z.string().optional(),
      template: z.enum(['follow_up', 'send_update', 'invite', 'reminder']).optional(),
    });
    const input = schema.parse(req.body) as {
      commitmentId: string;
      kind: 'email' | 'message' | 'calendar_event';
      recipient: string | string[];
      bodyOverride?: string;
      subjectOverride?: string;
      template?: 'follow_up' | 'send_update' | 'invite' | 'reminder';
    };
    const c = await repo.getCommitment(input.commitmentId);
    if (!c) return res.status(404).json({ error: { code: 'not_found', message: 'Commitment not found' } });
    const draft = await buildDraft(repo, { commitment: c, ...input });
    res.json({ draft });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.post('/external-writes/:id/confirm', requireConnectorsV2, async (req, res) => {
  try {
    const { repo } = getV2(res);
    // The default transport is blocked. Real implementations replace
    // the impl when the user has granted credentials. We still expose
    // the endpoint so the UI can render a preview + confirm flow.
    const r = await confirmAndSend(repo, req.params.id, blockedSendImpl);
    res.json(r);
  } catch (err) {
    handleError(err, res);
  }
});

// ---------------------------------------------------------------------------
// Export / MCP (Phase 9)
// ---------------------------------------------------------------------------

v2Router.get('/export/workspace', async (_req, res) => {
  try {
    const { repo } = getV2(res);
    res.json({ entities: await exportWorkspace(repo) });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.get('/export/entities', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const kind = req.query.kind as any;
    const items = await listEntities(repo, kind, {
      since: req.query.since as string | undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json({ items });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.get('/export/entities/:kind/:id', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const e = await getExportEntity(repo, req.params.kind as any, req.params.id);
    if (!e) return res.status(404).json({ error: { code: 'not_found', message: 'Entity not found' } });
    res.json({ entity: e });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.get('/export/search', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const q = (req.query.q as string) ?? '';
    res.json(await searchEntities(repo, q));
  } catch (err) {
    handleError(err, res);
  }
});

// ---------------------------------------------------------------------------
// Mobile (Phase 9)
// ---------------------------------------------------------------------------

v2Router.post('/mobile/tokens', async (req, res) => {
  try {
    const { ctx } = getV2(res);
    const schema = z.object({ deviceLabel: z.string().min(1) });
    const { deviceLabel } = schema.parse(req.body);
    const t = await issueMobileToken(ctx.root, deviceLabel);
    res.status(201).json({ token: t });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.get('/mobile/tokens', async (_req, res) => {
  try {
    const { ctx } = getV2(res);
    res.json({ items: await listMobileTokens(ctx.root) });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.delete('/mobile/tokens/:id', async (req, res) => {
  try {
    const { ctx } = getV2(res);
    const ok = await revokeMobileToken(ctx.root, req.params.id);
    res.json({ ok });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.post('/mobile/capture', async (req, res) => {
  try {
    const { repo, ctx } = getV2(res);
    const auth = req.header('X-Mobile-Token');
    if (!auth) return res.status(401).json({ error: { code: 'unauthorized', message: 'X-Mobile-Token required' } });
    const ok = await authenticateMobileToken(ctx.root, auth);
    if (!ok) return res.status(401).json({ error: { code: 'unauthorized', message: 'Invalid or expired token' } });
    const input = MobileCaptureInputSchema.parse(req.body);
    const r = await mobileCapture(repo, ctx.workspaceId, input);
    res.status(201).json({ source: r.source });
  } catch (err) {
    handleError(err, res);
  }
});

// ---------------------------------------------------------------------------
// Workspace data lifecycle (Phase X — import + reset)
//
//   POST /api/v2/import   { entities, mode }   → { imported, skipped, errors }
//   POST /api/v2/reset    { confirm }          → { ok, cleared, preResetCounts }
//
// The body shape mirrors what `exportService.listEntities` produces, so a
// round-trip through the UI's "Export JSON → Import JSON" loop is a no-op
// at the data layer. The client's settings modal also accepts the same
// payload, so we accept it directly here without re-shaping.
// ---------------------------------------------------------------------------

v2Router.post('/import', async (req, res) => {
  let activeJob: Awaited<ReturnType<import('../../repositories/v2/repository.js').V2Repository['getJob']>> = null;
  try {
    const { repo, ctx } = getV2(res);
    const workspaceId = ctx.workspaceId;
    const schema = z.object({
      entities: z.record(z.array(z.unknown())).default({}),
      mode: z.enum(['merge', 'overwrite']).optional(),
      idempotencyKey: z.string().trim().min(1).max(512).optional(),
    });
    const parsed = schema.parse(req.body ?? {});
    // Backward compatibility for old exports. Canonical exports now use only
    // `entities`; aliases are used only when that kind is absent, preventing
    // duplicated commitments from being imported twice.
    const entities: Record<string, unknown[]> = { ...(parsed.entities as Record<string, unknown[]>) };
    if (!entities.note && Array.isArray((req.body as any)?.notes)) {
      entities.note = (req.body as any).notes;
    }
    if (!entities.commitment && Array.isArray((req.body as any)?.commitments)) {
      entities.commitment = (req.body as any).commitments;
    }
    activeJob = await repo.createOrGetJob({
      kind: 'import',
      entityRef: { type: 'workspace', id: workspaceId },
      idempotencyKey: parsed.idempotencyKey ?? `import:${workspaceId}:${newId('job')}`,
      status: 'queued',
    });
    if (activeJob.status !== 'queued') {
      return res.status(activeJob.status === 'running' ? 202 : 200).json({ resumed: true, job: activeJob });
    }
    const claim = await repo.startJob(activeJob.id, 10);
    if (!claim.started) return res.status(202).json({ resumed: true, job: claim.job });
    activeJob = claim.job;
    const result = await importEntities(repo, workspaceId, {
      entities,
      mode: parsed.mode,
    });
    activeJob = activeJob && await repo.updateJob(activeJob.id, {
      status: 'succeeded',
      progress: 100,
      resultRef: { type: 'workspace', id: workspaceId },
      finishedAt: new Date().toISOString(),
    });
    res.status(200).json({ ...result, job: activeJob });
  } catch (err) {
    if (activeJob?.status === 'running') {
      const { repo } = getV2(res);
      await repo.updateJob(activeJob.id, {
        status: 'failed',
        error: { code: 'import_failed', message: err instanceof Error ? err.message : String(err), retryable: true },
        finishedAt: new Date().toISOString(),
      }).catch(() => {});
    }
    handleError(err, res);
  }
});

v2Router.post('/reset', async (req, res) => {
  try {
    const { repo, ctx } = getV2(res);
    const schema = z.object({
      confirm: z.string().min(1),
    });
    const parsed = schema.parse(req.body ?? {});
    const result = await resetWorkspace(repo, { confirm: parsed.confirm });
    // After reset the existing repo instance is still alive (it just
    // writes to a freshly-recreated audit log) — but res.locals.v2 was
    // set at middleware time and may point at now-deleted directories.
    // Re-bootstrap so subsequent requests on the same connection land
    // on the fresh layout.
    const { bootstrapV2 } = await import('../../services/v2/workspaceContext.js');
    res.locals.v2 = await bootstrapV2({
      workspaceRoot: ctx.root,
      workspaceId: ctx.workspaceId,
    });
    res.status(200).json(result);
  } catch (err) {
    handleError(err, res);
  }
});

// ---------------------------------------------------------------------------
// Proactive Proposal (Gap 3 — Sprint 1)
//
//   GET    /api/v2/proactive/config   → load user config
//   PUT    /api/v2/proactive/config   → save user config
//   GET    /api/v2/proactive/scan?channel=today_load  → generate proposals
//   POST   /api/v2/proactive/:id/action  → record user accept/dismiss
//
// All four endpoints are read or write of lightweight user-state under
// ~/.dailyflow/. They never block the server startup and never touch
// v1 data.
// ---------------------------------------------------------------------------

v2Router.get('/proactive/config', async (_req, res) => {
  try {
    const cfg = await loadProactiveConfig();
    res.json({ config: cfg });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.put('/proactive/config', async (req, res) => {
  try {
    const schema = z.object({
      enabled: z.boolean(),
      quietHours: z.object({
        start: z.number().min(0).max(24),
        end: z.number().min(0).max(24),
      }),
      maxPerWeek: z.number().min(0).max(100),
      overdueTaskDays: z.number().min(1).max(60),
    });
    const parsed = schema.parse(req.body) as ProactiveConfig;
    const saved = await saveProactiveConfig(parsed);
    res.json({ config: saved });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.get('/proactive/scan', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const channel = (req.query.channel as ProactiveChannel) || 'today_load';
    const cfg = await loadProactiveConfig();
    const state = await loadProactiveState();
    const proposals = await scanProactiveProposals(repo, cfg, state, channel);
    // Fire-and-forget history update — the user has now seen these.
    if (proposals.length > 0) {
      let next = state;
      for (const p of proposals) {
        // Skip if already counted this week.
        const already = next.entries.find(e => e.proposalId === p.id);
        if (already) continue;
        next = {
          entries: [
            ...next.entries,
            {
              proposalId: p.id,
              kind: p.kind,
              entityId: p.entityId,
              channel: p.cooldown.channel,
              firedAt: p.createdAt,
            },
          ],
        };
      }
      if (next !== state) {
        await saveProactiveState(next);
      }
    }
    res.json({ proposals });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.post('/proactive/:id/action', async (req, res) => {
  try {
    const body = z.object({
      action: z.enum(['accepted', 'dismissed']),
    }).parse(req.body);
    const next = await recordProposalAction(req.params.id, body.action);
    res.json({ ok: true, state: next });
  } catch (err) {
    handleError(err, res);
  }
});


// ---------------------------------------------------------------------------
// Daily Report + Reflection (Sprint 1 Gap 5 — Daily 闭环)
//
//   POST /api/v2/reports/daily              body: { date, reflection, snapshot? }
//   GET  /api/v2/reports/daily?date=YYYY-MM-DD
//   GET  /api/v2/reports/daily/list?year=YYYY&month=MM
//
// The routes write a single Markdown file under `Journal/YYYY-MM-DD.md`
// at the active workspace root. The file is plain text, lives alongside
// the user's other notes, and shows up in `git diff` — there is no
// separate database to migrate from.
// ---------------------------------------------------------------------------

const DailyReportTaskSummarySchema = z.object({
  id: z.string().trim().min(1).max(128),
  title: z.string().trim().min(1).max(300),
  tags: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
});

const DailyReportInProgressSchema = z.object({
  id: z.string().trim().min(1).max(128),
  title: z.string().trim().min(1).max(300),
  progress: z.string().trim().max(300).optional(),
});

const DailyReportPostponedSchema = z.object({
  id: z.string().trim().min(1).max(128),
  title: z.string().trim().min(1).max(300),
  reason: z.string().trim().max(500).optional(),
});

const DailyReportSnapshotSchema = z.object({
  completedTasks: z.array(DailyReportTaskSummarySchema).max(200).default([]),
  inProgressTasks: z.array(DailyReportInProgressSchema).max(200).default([]),
  postponedTasks: z.array(DailyReportPostponedSchema).max(200).default([]),
});

function sanitizeSnapshot(
  date: string,
  input?: {
    completedTasks?: Array<{ id: string; title: string; tags?: string[] }>;
    inProgressTasks?: Array<{ id: string; title: string; progress?: string }>;
    postponedTasks?: Array<{ id: string; title: string; reason?: string }>;
  },
): import('../../services/v2/dailyReport.js').DailyReportInput {
  return {
    date,
    completedTasks: (input?.completedTasks ?? []).map((t) => ({ id: t.id, title: t.title, tags: t.tags })),
    inProgressTasks: (input?.inProgressTasks ?? []).map((t) => ({ id: t.id, title: t.title, progress: t.progress })),
    postponedTasks: (input?.postponedTasks ?? []).map((t) => ({ id: t.id, title: t.title, reason: t.reason })),
    reflection: '',
  };
}

v2Router.post('/reports/daily', async (req, res) => {
  try {
    const { repo, ctx } = getV2(res);
    const schema = z.object({
      date: z.string(),
      reflection: z.string().max(20_000).default(''),
      snapshot: DailyReportSnapshotSchema.optional(),
    });
    const parsed = schema.parse(req.body ?? {});
    assertIsoDate(parsed.date, 'date');
    const result = await generateAndSaveDailyReport(
      repo,
      ctx.root,
      parsed.date,
      parsed.reflection,
      { snapshot: sanitizeSnapshot(parsed.date, parsed.snapshot) },
    );
    res.status(200).json({
      ok: true,
      report: {
        date: parsed.date,
        filePath: result.filePath,
        byteSize: result.byteSize,
      },
    });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.get('/reports/daily', async (req, res) => {
  try {
    const { ctx } = getV2(res);
    const date = String(req.query.date ?? '').trim();
    assertIsoDate(date, 'date');
    const markdown = await readDailyReport(ctx.root, date);
    res.status(200).json({
      ok: true,
      date,
      markdown,
      exists: markdown !== null,
    });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.get('/reports/daily/list', async (req, res) => {
  try {
    const { ctx } = getV2(res);
    const yearRaw = req.query.year;
    const monthRaw = req.query.month;
    const year = Number(yearRaw);
    if (!Number.isInteger(year) || year < 1970 || year > 2999) {
      return res.status(400).json({
        error: { code: 'bad_request', message: 'year must be a 4-digit integer.' },
      });
    }
    let month: number | undefined;
    if (monthRaw !== undefined) {
      month = Number(monthRaw);
      if (!Number.isInteger(month) || month < 1 || month > 12) {
        return res.status(400).json({
          error: { code: 'bad_request', message: 'month must be between 1 and 12.' },
        });
      }
    }
    const reports = await listDailyReports(ctx.root, year, month);
    res.status(200).json({
      ok: true,
      year,
      month: month ?? null,
      total: reports.length,
      reports,
    });
  } catch (err) {
    handleError(err, res);
  }
});


// ---------------------------------------------------------------------------
// AI Event Operator (DailyFlow 2.2 / DFH) — "AI 推进这个 Event"
//
//   POST  /api/v2/events/:id/agent-runs          start an AI run (→ proposal)
//   GET   /api/v2/agent-runs/:id                 read a run
//   GET   /api/v2/events/:id/agent-runs          list runs for an event
//   POST  /api/v2/agent-runs/:id/cancel          cancel a running run
//   GET   /api/v2/events/:id/graph-proposals/pending   pending proposal to review
//   POST  /api/v2/events/:id/graph-proposals/:pid/apply   approve + apply
//   POST  /api/v2/events/:id/graph-proposals/:pid/reject  decline
//   GET   /api/v2/agent-runtime/health          runtime health (Fake/DSH)
//
// Every write flows through a pending EventGraphProposal the user reviews;
// the server applies it atomically (create Commitments + write the graph).
// ---------------------------------------------------------------------------

v2Router.get('/agent-runtime/health', async (_req, res) => {
  try {
    const rt = getDeepSeekHarnessRuntime();
    const health = await rt.health();
    const diagnostic = diagnoseEventOperatorRuntime({ health, actualTools: EVENT_OPERATOR_TOOL_WHITELIST });
    res.json({
      health,
      diagnostic,
      runtime: health.degraded ? 'provider-adapter-fallback' : 'deepseek-harness',
      note: health.degraded
        ? 'A real model is available through the restricted provider adapter; the official DSH ACP sidecar is not active.'
        : undefined,
    });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.post('/events/:id/agent-runs', async (req, res) => {
  try {
    const { repo, workspaceId } = getV2(res);
    const deps = makeEventGraphRouteDeps(repo, workspaceId);
    const body = z.object({
      mindmapId: z.string().min(8),
      trigger: z.enum(['event_canvas', 'meeting_note', 'new_evidence']).optional(),
      selectedContextRefs: z.array(z.object({ type: z.string().min(1), id: z.string().min(8) })).optional(),
      contextBudgetBytes: z.number().int().positive().max(8 * 1024 * 1024).optional(),
      templateMaxOps: z.number().int().positive().max(12).optional(),
    }).parse(req.body ?? {});
    const result = await startEventOperatorRun(repo, workspaceId, {
      eventId: req.params.id,
      mindmapId: body.mindmapId,
      trigger: body.trigger,
      selectedContextRefs: body.selectedContextRefs,
      contextBudgetBytes: body.contextBudgetBytes,
    }, deps, { templateMaxOps: body.templateMaxOps });
    if (!result.proposal) {
      res.status(201).json({ run: result.run, proposal: null, events: result.events, mode: 'waiting' });
      return;
    }
    res.status(201).json({ run: result.run, proposal: result.proposal, events: result.events, mode: 'waiting_review' });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.get('/events/:id/agent-runs', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const runs = await repo.listEventOperatorRuns({ eventId: req.params.id });
    res.json({ items: runs });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.get('/agent-runs/:id', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const run = await getEventOperatorRun(repo, req.params.id);
    if (!run) return res.status(404).json({ error: { code: 'not_found', message: 'Run not found' } });
    res.json({ run });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.get('/agent-runs/:id/events', async (req, res) => {
  try {
    const { repo } = getV2(res);
    await streamEventOperatorRunEvents(repo, req.params.id, req, res);
  } catch (err) {
    if (!res.headersSent) handleError(err, res);
    else res.end();
  }
});

v2Router.post('/agent-runs/recover', async (_req, res) => {
  try {
    const { repo } = getV2(res);
    const results = await recoverEventOperatorRuns(repo);
    res.json({ items: results });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.post('/agent-runs/:id/retry', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const run = await prepareEventOperatorRunRetry(repo, req.params.id);
    if (!run) return res.status(404).json({ error: { code: 'not_found', message: 'Run not found' } });
    res.json({ run });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.post('/agent-runs/:id/cancel', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const run = await cancelEventOperatorRun(repo, req.params.id);
    if (!run) return res.status(404).json({ error: { code: 'not_found', message: 'Run not found' } });
    res.json({ run });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.get('/events/:id/graph-proposals/pending', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const proposal = await getPendingGraphProposal(repo, req.params.id);
    res.json({ proposal: proposal ? { ...proposal, operations: proposal.operations } : null });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.get('/events/:id/graph-proposals', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const items = await repo.listEventGraphProposals({ eventId: req.params.id });
    res.json({ items });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.post('/events/:id/graph-proposals/:pid/apply', async (req, res) => {
  try {
    const { repo, workspaceId } = getV2(res);
    const deps = makeEventGraphRouteDeps(repo, workspaceId);
    const body = z.object({
      idempotencyKey: z.string().min(1).max(512).optional(),
      selection: z.array(z.string()).optional(),
      userOverrides: z.record(z.record(z.unknown())).optional(),
    }).parse(req.body ?? {});
    const result = await applyEventGraphProposal(repo, deps, req.params.pid, {
      idempotencyKey: body.idempotencyKey,
      selection: body.selection,
      userOverrides: body.userOverrides,
    });
    res.json(result);
  } catch (err) {
    handleError(err, res);
  }
});

// Canonical Event Graph Proposal API. The older event-nested routes remain as
// compatibility aliases for the shipped client.
v2Router.get('/event-graph-proposals/:pid', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const proposal = await repo.getEventGraphProposal(req.params.pid);
    if (!proposal) return res.status(404).json({ error: { code: 'not_found', message: 'Graph proposal not found' } });
    res.json({ proposal });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.post('/event-graph-proposals/:pid/validate', async (req, res) => {
  try {
    const { repo, workspaceId } = getV2(res);
    const result = await validateEventGraphProposal(repo, makeEventGraphRouteDeps(repo, workspaceId), req.params.pid);
    res.status(result.valid ? 200 : 409).json(result);
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.post('/event-graph-proposals/:pid/apply', async (req, res) => {
  try {
    const { repo, workspaceId } = getV2(res);
    const body = z.object({
      idempotencyKey: z.string().min(1).max(512),
      selection: z.array(z.string()).optional(),
      overrides: z.record(z.record(z.unknown())).optional(),
    }).parse(req.body ?? {});
    const result = await applyEventGraphProposal(repo, makeEventGraphRouteDeps(repo, workspaceId), req.params.pid, {
      idempotencyKey: body.idempotencyKey,
      selection: body.selection,
      userOverrides: body.overrides,
    });
    res.json(result);
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.post('/event-graph-proposals/:pid/reject', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const body = z.object({ reason: z.string().max(500).default('user_rejected') }).parse(req.body ?? {});
    const proposal = await rejectEventGraphProposal(repo, req.params.pid, body.reason);
    res.json({ proposal });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.post('/events/:id/graph-proposals/:pid/reject', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const reason = req.body?.reason ?? 'user_rejected';
    const proposal = await rejectEventGraphProposal(repo, req.params.pid, reason);
    res.json({ proposal });
  } catch (err) {
    handleError(err, res);
  }
});
