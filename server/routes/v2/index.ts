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
import { Router, type Request, type Response } from 'express';
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
  searchEntities,
} from '../../services/v2/exportService.js';
import {
  issueMobileToken,
  listMobileTokens,
  revokeMobileToken,
  authenticateMobileToken,
  mobileCapture,
  MobileCaptureInputSchema,
} from '../../services/v2/mobileService.js';
import { ConcurrentModificationError } from '../../repositories/v2/atomicWrite.js';

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
  return res.locals.v2;
}

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
  }
  if (err instanceof ConcurrentModificationError) {
    res.status(409).json({ error: { code: 'concurrent_modification', message: err.message } });
    return;
  }
  if (err instanceof NoteNotFoundError) {
    res.status(404).json({ error: { code: 'not_found', message: err.message } });
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
    // Side-effect: touch lastOpenedAt so Recent works.
    svc.touchLastOpened(req.params.id).catch(() => undefined);
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
    const note = await svc.archive(req.params.id);
    res.json({ note });
  } catch (err) {
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

    res.json({
      proposal,
      evidence: built.evidence,
      agentRun: built.agentRun,
      fallback: built.fallback,
      fallbackReason: built.fallbackReason,
      empty: built.empty,
    });
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
    res.json({
      commitment: r.commitment,
      outcome: r.outcome,
      followUpProposal: r.followUpProposal,
      followUpCandidates: r.followUpCandidates,
    });
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
    res.json({ proposal: p });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.post('/proposals/:id/accept', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const result = await applyProposal(repo, req.params.id, {
      selection: req.body?.selection,
      userOverride: req.body?.userOverride,
    });
    res.json(result);
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.post('/proposals/:id/apply-selection', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const result = await applyProposal(repo, req.params.id, {
      selection: req.body?.selection,
      userOverride: req.body?.userOverride,
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

v2Router.get('/connectors', async (_req, res) => {
  try {
    const items = await listConnectors();
    res.json({ items });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.get('/connectors/:id', async (req, res) => {
  try {
    const c = await getConnector(req.params.id);
    if (!c) return res.status(404).json({ error: { code: 'not_found', message: 'Connector not found' } });
    res.json({ connector: c });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.post('/connectors/:id/sync', async (req, res) => {
  try {
    const result = await syncConnector(req.params.id);
    res.json(result);
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.post('/connectors/:id/pause', async (req, res) => {
  try {
    const c = await pauseConnector(req.params.id);
    res.json({ connector: c });
  } catch (err) {
    handleError(err, res);
  }
});

v2Router.delete('/connectors/:id', async (req, res) => {
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
v2Router.post('/connectors/sync-once', async (req, res) => {
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
  try {
    const { repo, ctx } = getV2(res);
    const workspaceId = ctx.workspaceId;
    const schema = z.object({ sourceId: z.string() });
    const { sourceId } = schema.parse(req.body);
    const source = await repo.getSourceItem(sourceId);
    if (!source) return res.status(404).json({ error: { code: 'not_found', message: 'Source not found' } });
    const out = await processMeeting(repo, { source, workspaceId, autoAcceptDecisions: false });
    res.json(out);
  } catch (err) {
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

v2Router.get('/calendar/connectors', async (_req, res) => {
  res.json({ items: listCalendarConnectors() });
});

v2Router.post('/calendar/sync', async (req, res) => {
  try {
    const { repo } = getV2(res);
    const schema = z.object({
      connectorId: z.string(),
      cursor: z.string().optional(),
      timeMin: z.string().datetime({ offset: true }).optional(),
      timeMax: z.string().datetime({ offset: true }).optional(),
    });
    const input = schema.parse(req.body) as {
      connectorId: string;
      cursor?: string;
      timeMin?: string;
      timeMax?: string;
    };
    const r = await syncCalendar(repo, input);
    res.json(r);
  } catch (err) {
    handleError(err, res);
  }
});

// ---------------------------------------------------------------------------
// Messages (Phase 6)
// ---------------------------------------------------------------------------

v2Router.get('/messages/connectors', async (_req, res) => {
  res.json({ items: listMessageConnectors() });
});

v2Router.post('/messages/sync', async (req, res) => {
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

v2Router.post('/external-writes/draft', async (req, res) => {
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

v2Router.post('/external-writes/:id/confirm', async (req, res) => {
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
