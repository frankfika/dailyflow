/**
 * v2 API client for React.
 *
 * The v2 routes are mounted at /api/v2. The client maps to the spec
 * section 14 endpoints.
 */
import { API_BASE } from '../../../config/api';

export interface V2Error {
  code: string;
  message: string;
  issues?: unknown;
  from?: string;
  to?: string;
}

export class V2ApiError extends Error {
  status: number;
  body: V2Error;
  constructor(status: number, body: V2Error) {
    super(body.message || `v2 API error ${status}`);
    this.status = status;
    this.body = body;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const base = (API_BASE as { api?: string }).api ?? '';
  const url = `${base}/api/v2${path}`;
  const resp = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await resp.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }
  if (!resp.ok) {
    const err = (json as { error?: V2Error } | null)?.error ?? { code: 'http_error', message: `HTTP ${resp.status}` };
    throw new V2ApiError(resp.status, err);
  }
  return json as T;
}

// ---------------------------------------------------------------------------
// Source / Inbox
// ---------------------------------------------------------------------------

export interface SourceItem {
  id: string;
  schemaVersion: 1;
  createdAt: string;
  updatedAt: string;
  createdBy: 'user' | 'ai' | 'connector' | 'migration';
  workspaceId: string;
  kind: 'quick_capture' | 'markdown' | 'meeting_audio' | 'meeting_transcript' | 'calendar_event' | 'email' | 'message' | 'file';
  title?: string;
  body?: string;
  occurredAt?: string;
  externalRef?: { connectorId: string; externalId: string; url?: string };
  filePath?: string;
  contentHash: string;
  processingStatus: 'saved' | 'processing' | 'needs_review' | 'processed' | 'failed';
  sensitivity?: 'normal' | 'private' | 'restricted';
  language?: 'zh' | 'en' | 'mixed';
  meta?: { durationSeconds?: number; fromAddress?: string; channel?: string };
}

export interface InboxList { items: SourceItem[]; total: number; }

export const captureInput = (body: { kind: 'quick_capture' | 'markdown' | 'file'; title?: string; body: string; language?: 'zh' | 'en' | 'mixed'; sensitivity?: 'normal' | 'private' | 'restricted' }) =>
  request<{ source: SourceItem }>('POST', '/inbox/capture', body);

export const listInbox = (opts?: { processingStatus?: string }) =>
  request<InboxList>('GET', `/inbox${opts?.processingStatus ? `?processingStatus=${opts.processingStatus}` : ''}`);

export const getSource = (id: string) =>
  request<{ source: SourceItem }>('GET', `/sources/${id}`);

export const processSource = (id: string) =>
  request<{ proposal: Proposal; evidence: Evidence[]; agentRun: AgentRun; fallback: boolean; fallbackReason?: string; empty: boolean }>(
    'POST',
    `/sources/${id}/process`,
    {}
  );

export const deleteSource = (id: string) => request<{ ok: boolean }>('DELETE', `/sources/${id}`);

// ---------------------------------------------------------------------------
// NoteDocument (spec §5.2 / §7.3 / §11.3 / F-02A)
// ---------------------------------------------------------------------------

export type NoteKind = 'quick' | 'daily' | 'meeting' | 'project' | 'reference' | 'general';
export type NoteState = 'draft' | 'active' | 'archived';

export interface NoteDocument {
  id: string;
  schemaVersion: 1;
  createdAt: string;
  updatedAt: string;
  createdBy: 'user' | 'ai' | 'connector' | 'migration';
  workspaceId: string;
  title?: string;
  body: string;
  kind: NoteKind;
  state: NoteState;
  date?: string;
  projectIds: string[];
  personIds: string[];
  sourceIds: string[];
  pinned: boolean;
  lastOpenedAt?: string;
  autoSaveVersion: number;
  contentHash: string;
  tagIds?: string[];
}

export interface CreateNoteInput {
  body?: string;
  title?: string;
  kind?: NoteKind;
  state?: NoteState;
  date?: string;
  projectIds?: string[];
  personIds?: string[];
  sourceIds?: string[];
  pinned?: boolean;
  tagIds?: string[];
}

export interface UpdateNoteInput {
  // The version the client believes it's overwriting. The server rejects
  // with 409 + code: 'concurrent_modification' if it doesn't match.
  expectedAutoSaveVersion: number;
  body?: string;
  title?: string | null;
  kind?: NoteKind;
  state?: NoteState;
  date?: string | null;
  projectIds?: string[];
  personIds?: string[];
  sourceIds?: string[];
  pinned?: boolean;
  tagIds?: string[];
}

export interface NoteBacklinks {
  noteId: string;
  evidenceIds: string[];
  commitmentIds: string[];
  decisionIds: string[];
  outcomeIds: string[];
}

export const listNotes = (opts?: { state?: NoteState; kind?: NoteKind; q?: string }) => {
  const params = new URLSearchParams();
  if (opts?.state) params.set('state', opts.state);
  if (opts?.kind) params.set('kind', opts.kind);
  if (opts?.q) params.set('q', opts.q);
  const qs = params.toString();
  return request<{ notes: NoteDocument[]; total: number }>('GET', `/notes${qs ? `?${qs}` : ''}`);
};

export const createNote = (input: CreateNoteInput) =>
  request<{ note: NoteDocument }>('POST', '/notes', input);

export const getNote = (id: string) =>
  request<{ note: NoteDocument }>('GET', `/notes/${id}`);

export const updateNote = (id: string, input: UpdateNoteInput) =>
  request<{ note: NoteDocument }>('PATCH', `/notes/${id}`, input);

export const deleteNote = (id: string) =>
  request<{ ok: boolean }>('DELETE', `/notes/${id}`);

export const archiveNote = (id: string) =>
  request<{ note: NoteDocument }>('POST', `/notes/${id}/archive`, {});

export const getNoteBacklinks = (id: string) =>
  request<{ backlinks: NoteBacklinks }>('GET', `/notes/${id}/backlinks`);

// ---------------------------------------------------------------------------
// Commitment
// ---------------------------------------------------------------------------

export interface Commitment {
  id: string;
  schemaVersion: 1;
  createdAt: string;
  updatedAt: string;
  createdBy: 'user' | 'ai' | 'connector' | 'migration';
  workspaceId: string;
  title: string;
  outcome: string;
  state: 'inbox' | 'active' | 'planned' | 'waiting' | 'someday' | 'completed' | 'cancelled' | 'archived';
  ownerId?: string;
  beneficiaryId?: string;
  projectId?: string;
  dueAt?: string;
  dueConfidence?: 'explicit' | 'inferred' | 'unknown';
  importance?: 'critical' | 'high' | 'normal' | 'low';
  effortMinutes?: number;
  energy?: 'high' | 'medium' | 'low';
  nextAction?: string;
  waitingOnId?: string;
  waitingOnText?: string;
  waitingSince?: string;
  reviewAt?: string;
  evidenceIds: string[];
  sourceIds: string[];
  tagIds?: string[];
  completedAt?: string;
  outcomeId?: string;
  lastProgressAt?: string;
  legacyTaskId?: string;
}

export const listCommitments = (opts?: { state?: string }) =>
  request<{ items: Commitment[]; total: number }>('GET', `/commitments${opts?.state ? `?state=${opts.state}` : ''}`);

export const getCommitment = (id: string) =>
  request<{ commitment: Commitment }>('GET', `/commitments/${id}`);

export const createCommitment = (input: Partial<Commitment>) =>
  request<{ commitment: Commitment }>('POST', '/commitments', input);

export const patchCommitment = (id: string, patch: Partial<Commitment>) =>
  request<{ commitment: Commitment }>('PATCH', `/commitments/${id}`, patch);

export const waitOnCommitment = (id: string, body: { waitingOnId?: string; waitingOnText: string; reviewAt: string }) =>
  request<{ commitment: Commitment }>('POST', `/commitments/${id}/wait`, body);

export const resumeCommitment = (id: string) =>
  request<{ commitment: Commitment }>('POST', `/commitments/${id}/resume`, {});

export const cancelCommitment = (id: string, reason?: string) =>
  request<{ commitment: Commitment }>('POST', `/commitments/${id}/cancel`, { reason });

export const completeCommitment = (id: string, body: { outcomeKind: string; outcomeSummary: string; evidenceIds?: string[]; suggestFollowUp?: boolean }) =>
  request<{ commitment: Commitment; outcome: Outcome; followUpProposal: { id: string; candidateCount: number; changeIds: string[] } | null; followUpCandidates: { title: string; quote: string; confidence: number; reason: string }[] }>('POST', `/commitments/${id}/complete`, body);

export const commitmentHistory = (id: string) =>
  request<{ events: AuditEvent[] }>('GET', `/commitments/${id}/history`);

// ---------------------------------------------------------------------------
// Reviewer (Phase 7)
// ---------------------------------------------------------------------------

export interface WaitingOverdueItem {
  commitmentId: string;
  title: string;
  waitingOn: string;
  reviewAt: string;
  daysOverdue: number;
}

export const getWaitingOverdue = () =>
  request<{ items: WaitingOverdueItem[] }>('GET', '/review/waiting-overdue');

export interface StaleCommitmentItem {
  commitmentId: string;
  title: string;
  daysSinceProgress: number;
  reason: string;
  suggestions: Array<{ op: 'transition' | 'cancel' | 'merge'; to?: string; reason: string }>;
}

export const getStaleCommitments = () =>
  request<{ items: StaleCommitmentItem[] }>('GET', '/review/stale');

// ---------------------------------------------------------------------------
// Proposal
// ---------------------------------------------------------------------------

export interface ProposedChange {
  op: 'create' | 'update' | 'merge' | 'archive' | 'transition';
  entity: 'commitment' | 'outcome' | 'project' | 'person' | 'decision' | 'plan' | 'evidence' | 'source';
  targetId?: string;
  draft: Record<string, unknown>;
  evidenceIds: string[];
  confidence: number;
  reason: string;
  changeId: string;
}

export interface Proposal {
  id: string;
  schemaVersion: 1;
  createdAt: string;
  updatedAt: string;
  createdBy: 'user' | 'ai' | 'connector' | 'migration';
  workspaceId: string;
  kind: 'extract_commitments' | 'triage' | 'daily_plan' | 'replan' | 'close_loop' | 'merge_entities';
  status: 'pending' | 'partially_accepted' | 'accepted' | 'rejected' | 'expired';
  sourceIds: string[];
  changes: ProposedChange[];
  modelRunId: string;
  expiresAt?: string;
  rejectedReason?: string;
  acceptedChangeIds?: string[];
}

export interface Evidence {
  id: string;
  schemaVersion: 1;
  createdAt: string;
  updatedAt: string;
  createdBy: 'user' | 'ai' | 'connector' | 'migration';
  workspaceId: string;
  sourceId: string;
  quote: string;
  locator: { kind: 'text' | 'lines' | 'audio'; [k: string]: unknown };
  sourceContentHash: string;
  stale: boolean;
  fieldRefs?: string[];
}

export interface AgentRun {
  id: string;
  schemaVersion: 1;
  createdAt: string;
  updatedAt: string;
  createdBy: 'user' | 'ai' | 'connector' | 'migration';
  workspaceId: string;
  agent: 'extractor' | 'resolver' | 'planner' | 'copilot' | 'reviewer';
  modelProvider: string;
  model: string;
  promptVersion: string;
  inputEntityIds: string[];
  status: 'running' | 'succeeded' | 'failed';
  errorCode?: string;
  errorMessage?: string;
  durationMs?: number;
}

export interface AuditEvent {
  id: string;
  ts: string;
  workspaceId: string;
  kind: string;
  actor: string;
  data: Record<string, unknown>;
}

export interface Outcome {
  id: string;
  schemaVersion: 1;
  createdAt: string;
  updatedAt: string;
  createdBy: 'user' | 'ai' | 'connector' | 'migration';
  workspaceId: string;
  commitmentId: string;
  kind: 'delivered' | 'decided' | 'sent' | 'confirmed' | 'failed' | 'cancelled';
  summary: string;
  evidenceIds: string[];
  followUpCommitmentIds: string[];
}

export const listProposals = (opts?: { status?: string }) =>
  request<{ items: Proposal[]; total: number }>('GET', `/proposals${opts?.status ? `?status=${opts.status}` : ''}`);

export const getProposal = (id: string) =>
  request<{ proposal: Proposal }>('GET', `/proposals/${id}`);

export const applyProposal = (id: string, body?: { selection?: string[]; userOverride?: Record<string, Record<string, unknown>> }) =>
  request<{ proposal: Proposal; created: Array<{ commitment: Commitment; evidence?: Evidence[] }>; updated: Commitment[]; rejected: Array<{ changeId: string; reason: string }> }>(
    'POST',
    `/proposals/${id}/accept`,
    body ?? {}
  );

export const rejectProposal = (id: string, reason: string) =>
  request<{ proposal: Proposal }>('POST', `/proposals/${id}/reject`, { reason });

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

export interface DailyPlan {
  id: string;
  schemaVersion: 1;
  createdAt: string;
  updatedAt: string;
  createdBy: 'user' | 'ai' | 'connector' | 'migration';
  workspaceId: string;
  date: string;
  constraintSummary?: string;
  availableMinutes?: number;
  items: Array<{
    commitmentId: string;
    intendedOutcome: string;
    suggestedNextAction: string;
    plannedMinutes?: number;
    reason: string;
    rank: number;
  }>;
  deferredCommitmentIds: string[];
  acceptedAt?: string;
}

export const generatePlan = (body: { date: string; availableMinutes?: number; maxItems?: number; brief?: string }) =>
  request<{ plan: DailyPlan; rejected: Array<{ id: string; reason: string }> }>('POST', '/plans/generate', body);

export const getPlan = (date: string) =>
  request<{ plan: DailyPlan | null }>('GET', `/plans/${date}`);

export const acceptPlan = (id: string) =>
  request<{ plan: DailyPlan }>('POST', `/plans/${id}/accept`, {});

export const replan = (date: string, body: { availableMinutes?: number; maxItems?: number; brief?: string }) =>
  request<{ plan: DailyPlan; rejected: Array<{ id: string; reason: string }> }>('POST', `/plans/${date}/replan`, body);

// ---------------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------------

export interface MemoryHit {
  type: string;
  id: string;
  title: string;
  snippet: string;
  score: number;
  sourceIds: string[];
  evidenceIds: string[];
}

export const searchMemory = (q: string) =>
  request<{ query: string; hits: MemoryHit[]; usedSourceIds: string[] }>('GET', `/memory/search?q=${encodeURIComponent(q)}`);

export const getContext = (commitmentId: string) =>
  request<{
    commitment: Commitment;
    related: {
      project?: unknown;
      person?: unknown;
      decisions: Array<{ id: string; title: string; decision: string; rationale?: string; decidedAt: string; evidenceIds: string[] }>;
      outcomes: Outcome[];
      sourceItems: Array<{ id: string; title?: string; body?: string; kind: string }>;
      evidence: Array<{ id: string; sourceId: string; quote: string; locator: unknown }>;
    };
  }>('GET', `/memory/context?commitmentId=${commitmentId}`);

// ---------------------------------------------------------------------------
// Connectors
// ---------------------------------------------------------------------------

export interface ConnectorStatus {
  id: string;
  type: string;
  displayName: string;
  state: 'connected' | 'paused' | 'needs_auth' | 'error';
  capabilities: Array<'read' | 'write' | 'webhook'>;
  lastSyncAt?: string;
  lastError?: string;
  scopes?: string[];
  blockedBy?: 'external_authorization' | 'not_implemented' | 'maintenance';
  description: string;
}

export const listConnectors = () =>
  request<{ items: ConnectorStatus[] }>('GET', '/connectors');

// ---------------------------------------------------------------------------
// Legacy
// ---------------------------------------------------------------------------

export interface LegacyTaskView {
  id: string;
  date: string;
  title: string;
  status: 'todo' | 'done' | 'migrated';
  priority?: 'high' | 'medium' | 'low';
  deadline?: string;
  tags?: string[];
  project?: string;
  source_date?: string;
  filePath: string;
  line: number;
  migratedToCommitmentId?: string;
}

export const listLegacyTasks = () =>
  request<{ items: LegacyTaskView[] }>('GET', '/legacy/tasks');

export const migrateLegacyTask = (date: string, line: number, body?: Partial<Commitment>) =>
  request<{ commitmentId: string; legacyTaskId: string }>('POST', `/legacy/tasks/${date}#${line}/migrate`, body ?? {});

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export interface V2Status {
  status: 'ok';
  version: number;
  flags: {
    enabled: boolean;
    inboxV2: boolean;
    todayV2: boolean;
    memoryV2: boolean;
    connectorsV2: boolean;
    aiEnabled: boolean;
    contextBudgetBytes: number;
  };
  index: { scanned: number; entities: number };
}

export const getStatus = () => request<V2Status>('GET', '/status');
