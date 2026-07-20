/**
 * v2 domain types — Zod-first, matching docs/AI_NATIVE_PRODUCT_DEVELOPMENT_SPEC.md §11.
 *
 * These types are the **canonical contract** between the server, the React
 * client, the AI agent runtime, and the Markdown repository. Every persisted
 * entity flows through these schemas before it reaches disk, so a malformed
 * object can never be written.
 *
 * Rules (from spec §3 / §4 / §11):
 * - Stable, time-sortable IDs (ULID).
 * - Every first-class object carries schemaVersion + EntityMeta.
 * - State machines enforce invariants (waiting requires waitingOnId+reviewAt,
 *   completed requires completedAt, etc.).
 * - Every AI-extracted key field MUST be backed by Evidence.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// EntityMeta — the base of every first-class object
// ---------------------------------------------------------------------------

export const EntityMetaSchema = z.object({
  id: z.string().min(8),
  schemaVersion: z.literal(1),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  createdBy: z.enum(['user', 'ai', 'connector', 'migration']),
  workspaceId: z.string().min(1),
  archivedAt: z.string().datetime({ offset: true }).optional(),
});
export type EntityMeta = z.infer<typeof EntityMetaSchema>;

// ---------------------------------------------------------------------------
// SourceItem
// ---------------------------------------------------------------------------

export const SourceKindSchema = z.enum([
  'quick_capture',
  'markdown',
  'meeting_audio',
  'meeting_transcript',
  'calendar_event',
  'email',
  'message',
  'file',
]);
export type SourceKind = z.infer<typeof SourceKindSchema>;

export const ProcessingStatusSchema = z.enum([
  'saved',
  'processing',
  'needs_review',
  'processed',
  'failed',
]);
export type ProcessingStatus = z.infer<typeof ProcessingStatusSchema>;

export const SourceItemSchema = EntityMetaSchema.extend({
  kind: SourceKindSchema,
  title: z.string().max(500).optional(),
  body: z.string().optional(),
  occurredAt: z.string().datetime({ offset: true }).optional(),
  externalRef: z
    .object({
      connectorId: z.string().min(1),
      externalId: z.string().min(1),
      url: z.string().url().optional(),
    })
    .optional(),
  filePath: z.string().optional(),
  contentHash: z.string().min(8),
  processingStatus: ProcessingStatusSchema,
  sensitivity: z.enum(['normal', 'private', 'restricted']).optional(),
  language: z.enum(['zh', 'en', 'mixed']).optional(),
  meta: z
    .object({
      durationSeconds: z.number().nonnegative().optional(),
      fromAddress: z.string().optional(),
      channel: z.string().optional(),
    })
    .optional(),
});
export type SourceItem = z.infer<typeof SourceItemSchema>;

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

export const EvidenceLocatorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), start: z.number().int().nonnegative(), end: z.number().int().nonnegative() }),
  z.object({ kind: z.literal('lines'), start: z.number().int().positive(), end: z.number().int().positive() }),
  z.object({ kind: z.literal('audio'), startSeconds: z.number().nonnegative(), endSeconds: z.number().nonnegative() }),
  // Block-level locator for NoteDocument evidence (spec §11.4).
  // `blockId` is a stable hash of the anchored text — survives renames,
  // moves, and surrounding edits as long as the anchored block itself is
  // unchanged. `start`/`end` are offsets into `body` for rendering.
  z.object({
    kind: z.literal('note_block'),
    blockId: z.string().min(8),
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
  }),
]);
export type EvidenceLocator = z.infer<typeof EvidenceLocatorSchema>;

/**
 * Evidence is anchored to **either** a SourceItem OR a NoteDocument, never
 * both. The two share the same quote/locator/stale contract, so downstream
 * code treats them uniformly. Spec §11.4 / §5.3.
 */
export const EvidenceSchema = EntityMetaSchema.extend({
  sourceId: z.string().min(8).optional(),
  noteId: z.string().min(8).optional(),
  quote: z.string().min(1).max(2000),
  locator: EvidenceLocatorSchema,
  // Hash of the source-of-truth content the quote was extracted from.
  // For sourceId anchors this is SourceItem.contentHash; for noteId anchors
  // it is NoteDocument.contentHash. Required regardless of which side.
  sourceContentHash: z.string().min(8),
  stale: z.boolean(),
  fieldRefs: z.array(z.string()).optional(),
}).refine(
  (e) => Boolean(e.sourceId) !== Boolean(e.noteId),
  {
    message: 'Evidence must anchor to exactly one of sourceId or noteId, not both or neither',
    path: ['sourceId'],
  },
);
export type Evidence = z.infer<typeof EvidenceSchema>;

// ---------------------------------------------------------------------------
// Commitment
// ---------------------------------------------------------------------------

export const CommitmentStateSchema = z.enum([
  'inbox',
  'active',
  'planned',
  'waiting',
  'someday',
  'completed',
  'cancelled',
  'archived',
]);
export type CommitmentState = z.infer<typeof CommitmentStateSchema>;

export const ImportanceSchema = z.enum(['critical', 'high', 'normal', 'low']);
export const DueConfidenceSchema = z.enum(['explicit', 'inferred', 'unknown']);
export const EnergySchema = z.enum(['high', 'medium', 'low']);

export const CommitmentSchema = EntityMetaSchema.extend({
  title: z.string().min(1).max(300),
  outcome: z.string().min(1).max(1000),
  state: CommitmentStateSchema,
  ownerId: z.string().optional(),
  beneficiaryId: z.string().optional(),
  projectId: z.string().optional(),
  dueAt: z.string().datetime({ offset: true }).optional(),
  dueConfidence: DueConfidenceSchema.optional(),
  importance: ImportanceSchema.optional(),
  effortMinutes: z.number().int().positive().max(60 * 24).optional(),
  energy: EnergySchema.optional(),
  nextAction: z.string().max(500).optional(),
  waitingOnId: z.string().optional(),
  waitingSince: z.string().datetime({ offset: true }).optional(),
  reviewAt: z.string().datetime({ offset: true }).optional(),
  evidenceIds: z.array(z.string()),
  sourceIds: z.array(z.string()),
  tagIds: z.array(z.string()).optional(),
  completedAt: z.string().datetime({ offset: true }).optional(),
  outcomeId: z.string().optional(),
  lastProgressAt: z.string().datetime({ offset: true }).optional(),
  legacyTaskId: z.string().optional(),
  /**
   * v2 carries over the original free-form waiting target when the entity is
   * not yet resolved into a Person record (e.g. quick capture before the user
   * confirms who is responsible). Spec §11.4 still requires the commitment
   * to carry waiting context.
   */
  waitingOnText: z.string().max(200).optional(),
});
export type Commitment = z.infer<typeof CommitmentSchema>;

// ---------------------------------------------------------------------------
// Outcome
// ---------------------------------------------------------------------------

export const OutcomeSchema = EntityMetaSchema.extend({
  commitmentId: z.string().min(8),
  kind: z.enum(['delivered', 'decided', 'sent', 'confirmed', 'failed', 'cancelled']),
  summary: z.string().min(1).max(2000),
  evidenceIds: z.array(z.string()),
  followUpCommitmentIds: z.array(z.string()),
});
export type Outcome = z.infer<typeof OutcomeSchema>;

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

export const ProjectStateSchema = z.enum(['active', 'paused', 'completed', 'archived']);

export const ProjectSchema = EntityMetaSchema.extend({
  name: z.string().min(1).max(200),
  objective: z.string().max(2000),
  successCriteria: z.array(z.string()),
  state: ProjectStateSchema,
  ownerId: z.string().optional(),
  targetAt: z.string().datetime({ offset: true }).optional(),
  commitmentIds: z.array(z.string()),
  decisionIds: z.array(z.string()),
  sourceIds: z.array(z.string()),
});
export type Project = z.infer<typeof ProjectSchema>;

// ---------------------------------------------------------------------------
// Person / Organization
// ---------------------------------------------------------------------------

export const PersonSchema = EntityMetaSchema.extend({
  displayName: z.string().min(1).max(200),
  aliases: z.array(z.string()),
  organizationId: z.string().optional(),
  externalRefs: z
    .array(
      z.object({
        connectorId: z.string(),
        externalId: z.string(),
      })
    )
    .optional(),
  relationshipNotes: z.string().max(2000).optional(),
});
export type Person = z.infer<typeof PersonSchema>;

export const OrganizationSchema = EntityMetaSchema.extend({
  name: z.string().min(1).max(200),
  aliases: z.array(z.string()),
});
export type Organization = z.infer<typeof OrganizationSchema>;

// ---------------------------------------------------------------------------
// Decision
// ---------------------------------------------------------------------------

export const DecisionSchema = EntityMetaSchema.extend({
  title: z.string().min(1).max(300),
  decision: z.string().min(1).max(2000),
  rationale: z.string().max(2000).optional(),
  decidedAt: z.string().datetime({ offset: true }),
  participantIds: z.array(z.string()),
  projectId: z.string().optional(),
  evidenceIds: z.array(z.string()),
  supersedesId: z.string().optional(),
});
export type Decision = z.infer<typeof DecisionSchema>;

// ---------------------------------------------------------------------------
// NoteDocument
// ---------------------------------------------------------------------------
//
// A first-class note object. Distinct from SourceItem (which is "what
// happened" — external, captured, not authored) and from Commitment/Decision
// (which are structured objects). Notes are the user's primary working
// surface: meeting notes, daily notes, project notes, quick thoughts, and
// long-form reference. Spec §5.2 / §11.3 / F-02A.

export const NoteKindSchema = z.enum([
  'quick',
  'daily',
  'meeting',
  'project',
  'reference',
  'general',
]);
export type NoteKind = z.infer<typeof NoteKindSchema>;

export const NoteStateSchema = z.enum(['draft', 'active', 'archived']);
export type NoteState = z.infer<typeof NoteStateSchema>;

export const NoteDocumentSchema = EntityMetaSchema.extend({
  // Title is optional — F-02A forbids blocking on a title. The first
  // non-empty line is the fallback for list rendering.
  title: z.string().max(500).optional(),
  body: z.string(),
  kind: NoteKindSchema,
  state: NoteStateSchema,
  // ISO date the note is associated with (for daily/meeting). Optional —
  // a quick note may not be tied to a date.
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  projectIds: z.array(z.string()),
  personIds: z.array(z.string()),
  // SourceItems that this note cites or builds on (one-way reference).
  sourceIds: z.array(z.string()),
  // Pinned notes surface first in lists. Spec §7.3 Favorites.
  pinned: z.boolean(),
  // Last time the user opened the note. Used for Recent ordering.
  lastOpenedAt: z.string().datetime({ offset: true }).optional(),
  // Monotonic per-note counter — every autosave bumps it. Combined with
  // contentHash for optimistic-concurrency collision detection.
  autoSaveVersion: z.number().int().nonnegative(),
  // Hash of `body` at the time of the last write. Repository uses this to
  // reject autosaves against a stale client (F-02A save-resilience).
  contentHash: z.string().min(8),
  // Tags on the note — these are different from project tags: they are
  // note-local labels (e.g. "draft", "follow-up") that help the user find
  // things later without forcing a type or category at create time.
  tagIds: z.array(z.string()).optional(),
});
export type NoteDocument = z.infer<typeof NoteDocumentSchema>;

// ---------------------------------------------------------------------------
// DailyPlan
// ---------------------------------------------------------------------------

export const DailyPlanItemSchema = z.object({
  commitmentId: z.string(),
  intendedOutcome: z.string().min(1).max(500),
  suggestedNextAction: z.string().min(1).max(500),
  plannedMinutes: z.number().int().positive().optional(),
  reason: z.string().min(1).max(500),
  rank: z.number().int().nonnegative(),
});
export type DailyPlanItem = z.infer<typeof DailyPlanItemSchema>;

export const DailyPlanSchema = EntityMetaSchema.extend({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  constraintSummary: z.string().max(500).optional(),
  availableMinutes: z.number().int().nonnegative().optional(),
  items: z.array(DailyPlanItemSchema),
  deferredCommitmentIds: z.array(z.string()),
  acceptedAt: z.string().datetime({ offset: true }).optional(),
  supersededById: z.string().optional(),
});
export type DailyPlan = z.infer<typeof DailyPlanSchema>;

// ---------------------------------------------------------------------------
// Proposal
// ---------------------------------------------------------------------------

export const ProposalKindSchema = z.enum([
  'extract_commitments',
  'triage',
  'daily_plan',
  'replan',
  'close_loop',
  'merge_entities',
]);
export type ProposalKind = z.infer<typeof ProposalKindSchema>;

export const ProposalStatusSchema = z.enum([
  'pending',
  'partially_accepted',
  'accepted',
  'rejected',
  'expired',
]);
export type ProposalStatus = z.infer<typeof ProposalStatusSchema>;

export const ProposedChangeOpSchema = z.enum(['create', 'update', 'merge', 'archive', 'transition']);
export const ProposedChangeEntitySchema = z.enum([
  'commitment',
  'outcome',
  'project',
  'person',
  'decision',
  'plan',
  'evidence',
  'source',
]);

export const ProposedChangeSchema = z.object({
  op: ProposedChangeOpSchema,
  entity: ProposedChangeEntitySchema,
  targetId: z.string().optional(),
  draft: z.record(z.unknown()),
  evidenceIds: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1).max(500),
  /** Per-change id, stable within a proposal — used to mark accepted items. */
  changeId: z.string(),
  /** Per-change user override applied at accept time. */
  override: z.record(z.unknown()).optional(),
});
export type ProposedChange = z.infer<typeof ProposedChangeSchema>;

export const ProposalSchema = EntityMetaSchema.extend({
  kind: ProposalKindSchema,
  status: ProposalStatusSchema,
  sourceIds: z.array(z.string()),
  changes: z.array(ProposedChangeSchema),
  modelRunId: z.string(),
  expiresAt: z.string().datetime({ offset: true }).optional(),
  rejectedReason: z.string().max(500).optional(),
  acceptedChangeIds: z.array(z.string()).optional(),
});
export type Proposal = z.infer<typeof ProposalSchema>;

// ---------------------------------------------------------------------------
// AgentRun
// ---------------------------------------------------------------------------

export const AgentRoleSchema = z.enum(['extractor', 'resolver', 'planner', 'copilot', 'reviewer']);
export type AgentRole = z.infer<typeof AgentRoleSchema>;

export const AgentRunSchema = EntityMetaSchema.extend({
  agent: AgentRoleSchema,
  modelProvider: z.string(),
  model: z.string(),
  promptVersion: z.string(),
  inputEntityIds: z.array(z.string()),
  outputProposalId: z.string().optional(),
  status: z.enum(['running', 'succeeded', 'failed']),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
  tokenUsage: z
    .object({
      input: z.number().int().nonnegative(),
      output: z.number().int().nonnegative(),
    })
    .optional(),
  durationMs: z.number().int().nonnegative().optional(),
});
export type AgentRun = z.infer<typeof AgentRunSchema>;

// ---------------------------------------------------------------------------
// Toplevel union for any persisted v2 entity
// ---------------------------------------------------------------------------

export const AnyV2EntitySchema = z.union([
  SourceItemSchema,
  EvidenceSchema,
  NoteDocumentSchema,
  CommitmentSchema,
  OutcomeSchema,
  ProjectSchema,
  PersonSchema,
  OrganizationSchema,
  DecisionSchema,
  DailyPlanSchema,
  ProposalSchema,
  AgentRunSchema,
]);
export type AnyV2Entity = z.infer<typeof AnyV2EntitySchema>;
