/**
 * DailyFlow 2.2 — AI Event Operator domain model.
 *
 * Spec: docs/DAILYFLOW_2_2_DEEPSEEK_HARNESS_IMPLEMENTATION_PLAN.md §4.
 *
 * This file defines the *business* contract of an Event Operator Run and its
 * Graph Proposal. It deliberately knows nothing about DeepSeek Harness
 * internals — the runtime seam that drives these Runs lives in
 * `server/services/harness/` behind the `AgentRuntime` interface. Everything
 * here is Zod-first and flows through a schema before it touches disk, matching
 * the existing `server/domain/v2/types.ts` conventions.
 *
 * Key decisions (see docs/adr/ADR-0022):
 * - EventOperatorRun is the DSH-driven successor of the v1 `AgentRun`. It uses
 *   `schemaVersion: 2` while the old `AgentRun` (schemaVersion 1) remains
 *   readable.
 * - Events must be extended by `event_graph_patch` Graph Operation before any
 *   business entity changes; the business Proposal remains the single approval
 *   object.
 * - AI never writes formal data directly. Every write is a pending
 *   EventGraphProposal that the server later applies atomically.
 */
import { z } from 'zod';
import { ProposalStatusSchema, CommitmentStateSchema } from './types.js';

// ---------------------------------------------------------------------------
// Enums & small scalars
// ---------------------------------------------------------------------------

export const EventOperatorPhaseSchema = z.enum([
  'collect',
  'retrieve',
  'extract',
  'resolve',
  'prepare',
  'review',
]);
export type EventOperatorPhase = z.infer<typeof EventOperatorPhaseSchema>;

export const EventOperatorStatusSchema = z.enum([
  'queued',
  'starting',
  'running',
  'waiting_review',
  'applying',
  'succeeded',
  'failed',
  'cancelled',
]);
export type EventOperatorStatus = z.infer<typeof EventOperatorStatusSchema>;

export const EventOperatorTriggerSchema = z.enum([
  'event_canvas',
  'meeting_note',
  'new_evidence',
]);
export type EventOperatorTrigger = z.infer<typeof EventOperatorTriggerSchema>;

export const GraphRiskLevelSchema = z.enum(['low', 'medium', 'high']);
export type GraphRiskLevel = z.infer<typeof GraphRiskLevelSchema>;

/** The stable, restricted entity ref types an Event graph node may carry. */
export const MindMapEntityRefTypeSchema = z.enum([
  'commitment',
  'decision',
  'outcome',
  'note',
  'source',
  'evidence',
]);
export type MindMapEntityRefType = z.infer<typeof MindMapEntityRefTypeSchema>;

export const MindMapEntityRefSchema = z.object({
  type: MindMapEntityRefTypeSchema,
  id: z.string().min(8),
});
export type MindMapEntityRef = z.infer<typeof MindMapEntityRefSchema>;

/**
 * Provenance tells the user *and* the recovery path whether a node originated
 * from a human, an AI proposal (and which run / proposal), or a migration.
 */
export const MindMapNodeOriginSchema = z.enum(['user', 'ai', 'migration']);
export type MindMapNodeOrigin = z.infer<typeof MindMapNodeOriginSchema>;

export const MindMapNodeProvenanceSchema = z
  .object({
    origin: MindMapNodeOriginSchema,
    proposalId: z.string().optional(),
    agentRunId: z.string().optional(),
    acceptedAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict();
export type MindMapNodeProvenance = z.infer<typeof MindMapNodeProvenanceSchema>;

// ---------------------------------------------------------------------------
// EventOperatorScope — the maximum authorization boundary of one Run
// ---------------------------------------------------------------------------

/** A generic typed reference to any entity selected as Run context. */
export const EntityRefSchema = z.object({
  type: z.string().min(1),
  id: z.string().min(8),
});
export type EntityRef = z.infer<typeof EntityRefSchema>;

export const EventOperatorScopeSchema = z.object({
  workspaceId: z.string().min(1),
  eventId: z.string().min(8),
  mindmapId: z.string().min(8),
  trigger: EventOperatorTriggerSchema,
  triggerEntityRef: EntityRefSchema.optional(),
  selectedContextRefs: z.array(EntityRefSchema).default([]),
  // Hard cap on context bytes the runtime may load for this Run.
  contextBudgetBytes: z.number().int().positive().max(8 * 1024 * 1024),
}).strict();
export type EventOperatorScope = z.infer<typeof EventOperatorScopeSchema>;

// The agent must never widen the workspace/event boundary. This schema is a
// pure mapping of an already-authorized scope; no model input can add fields
// because `strict()` rejects unknown keys.

// ---------------------------------------------------------------------------
// Context manifest — what a Run actually loaded, for accountability
// ---------------------------------------------------------------------------

export const ContextManifestItemSchema = z.object({
  entityType: z.enum(['event', 'mindmap', 'note', 'source', 'evidence', 'commitment', 'decision', 'outcome']),
  entityId: z.string().min(8),
  version: z.string().optional(),
  contentHash: z.string().optional(),
  bytes: z.number().int().nonnegative(),
}).strict();
export type ContextManifestItem = z.infer<typeof ContextManifestItemSchema>;

export const RunMetricsSchema = z.object({
  startedAt: z.string().datetime({ offset: true }).optional(),
  firstProgressAt: z.string().datetime({ offset: true }).optional(),
  finishedAt: z.string().datetime({ offset: true }).optional(),
  durationMs: z.number().int().nonnegative().optional(),
  modelRequests: z.number().int().nonnegative().default(0),
  toolCalls: z.number().int().nonnegative().default(0),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  estimatedCost: z.number().nonnegative().optional(),
}).strict();
export type RunMetrics = z.infer<typeof RunMetricsSchema>;

export const RunErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1).max(500),
  retryable: z.boolean(),
  stage: EventOperatorPhaseSchema.optional(),
}).strict();
export type RunError = z.infer<typeof RunErrorSchema>;

// ---------------------------------------------------------------------------
// EventOperatorRun (schemaVersion 2)
// ---------------------------------------------------------------------------

export const EventOperatorRunSchema = z.object({
  id: z.string().min(8),
  // The v1 AgentRun uses schemaVersion 1 + status running/succeeded/failed.
  // EventOperatorRun is a distinct, richer contract. Pure strict() object so
  // an old AgentRun can never be mistaken for one (no modelRunId, no agent field).
  schemaVersion: z.literal(2),
  workspaceId: z.string().min(1),
  eventId: z.string().min(8),
  mindmapId: z.string().min(8),
  runtimeId: z.literal('deepseek-harness'),
  runtimeVersion: z.string().min(1),
  runtimeSessionId: z.string().optional(),
  modelProvider: z.string().min(1),
  model: z.string().min(1),
  promptVersion: z.string().min(1),
  scope: EventOperatorScopeSchema,
  phase: EventOperatorPhaseSchema,
  status: EventOperatorStatusSchema,
  contextManifest: z.array(ContextManifestItemSchema).default([]),
  proposalId: z.string().optional(),
  lastEventCursor: z.string().optional(),
  error: RunErrorSchema.optional(),
  metrics: RunMetricsSchema,
  idempotencyKey: z.string().min(1).max(512),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
}).strict();
export type EventOperatorRun = z.infer<typeof EventOperatorRunSchema>;

// ---------------------------------------------------------------------------
// DomainEntityDraft — the *business* payload an accepted node may create
// ---------------------------------------------------------------------------

/**
 * Draft for a business entity a graph node materializes on Apply. Fields are
 * deliberately permissive markers; the server validator tightens them per kind
 * (e.g. a `waiting` node must carry waitingOnText + reviewAt).
 */
export const DomainEntityDraftSchema = z.object({
  entity: z.enum(['commitment', 'waiting_commitment', 'decision', 'outcome', 'none']),
  title: z.string().min(1).max(300).optional(),
  outcome: z.string().max(1000).optional(),
  state: CommitmentStateSchema.optional(),
  dueAt: z.string().datetime({ offset: true }).optional(),
  dueConfidence: z.enum(['explicit', 'inferred', 'unknown']).optional(),
  ownerText: z.string().max(200).optional(),
  waitingOnText: z.string().max(200).optional(),
  reviewAt: z.string().datetime({ offset: true }).optional(),
  nextAction: z.string().max(500).optional(),
  decision: z.string().max(2000).optional(),
  rationale: z.string().max(2000).optional(),
  outcomeSummary: z.string().max(2000).optional(),
  outcomeKind: z.enum(['delivered', 'decided', 'sent', 'confirmed', 'failed', 'cancelled']).optional(),
}).strict();
export type DomainEntityDraft = z.infer<typeof DomainEntityDraftSchema>;

/** Discriminant for the sections a node might reference. */
export const MindMapNodeKindSchema = z.enum([
  'root',
  'branch',
  'tag',
  'task',
  'question',
  'resource',
  'risk',
  'decision',
  'waiting',
  'outcome',
]);
export type MindMapNodeKind = z.infer<typeof MindMapNodeKindSchema>;

// ---------------------------------------------------------------------------
// GraphOperation — the plan-visible change unit of a Proposal
// ---------------------------------------------------------------------------

export const GraphAddNodeOpSchema = z.object({
  changeId: z.string().min(1),
  op: z.literal('add_node'),
  tempId: z.string().min(1),
  parentId: z.string().min(1),
  node: z.object({
    kind: MindMapNodeKindSchema,
    text: z.string().min(1).max(300),
    note: z.string().max(2000).optional(),
  }).strict(),
  domainDraft: DomainEntityDraftSchema.optional(),
  evidenceIds: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1).max(500),
}).strict();

export const GraphUpdateNodeOpSchema = z.object({
  changeId: z.string().min(1),
  op: z.literal('update_node'),
  nodeId: z.string().min(1),
  patch: z.object({
    text: z.string().min(1).max(300).optional(),
    note: z.string().max(2000).optional(),
    kind: MindMapNodeKindSchema.optional(),
  }).strict(),
  evidenceIds: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1).max(500),
}).strict();

export const GraphMoveNodeOpSchema = z.object({
  changeId: z.string().min(1),
  op: z.literal('move_node'),
  nodeId: z.string().min(1),
  newParentId: z.string().min(1),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1).max(500),
}).strict();

export const GraphLinkEntityOpSchema = z.object({
  changeId: z.string().min(1),
  op: z.literal('link_entity'),
  nodeId: z.string().min(1),
  entityRef: MindMapEntityRefSchema,
  reason: z.string().min(1).max(500),
}).strict();

export const GraphOperationSchema = z.discriminatedUnion('op', [
  GraphAddNodeOpSchema,
  GraphUpdateNodeOpSchema,
  GraphMoveNodeOpSchema,
  GraphLinkEntityOpSchema,
]);
export type GraphOperation = z.infer<typeof GraphOperationSchema>;

/**
 * Tool input shape for `propose_graph_patch`. For v1 the operation drafts are
 * structurally identical to the persisted `GraphOperation` — the server assigns
 * change ids if absent and persists a normalised copy.
 */
export const GraphOperationDraftSchema = GraphOperationSchema;
export type GraphOperationDraft = z.infer<typeof GraphOperationDraftSchema>;

// ---------------------------------------------------------------------------
// ValidationIssue — stable, model-correctable error surface
// ---------------------------------------------------------------------------

export const ValidationIssueSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  changeId: z.string().optional(),
  path: z.string().optional(),
  retryable: z.boolean().default(false),
}).strict();
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;

// ---------------------------------------------------------------------------
// EventGraphProposal — the single approval object for graph changes
// ---------------------------------------------------------------------------

export const EventGraphProposalSchema = z.object({
  id: z.string().min(8),
  schemaVersion: z.literal(1),
  workspaceId: z.string().min(1),
  eventId: z.string().min(8),
  mindmapId: z.string().min(8),
  agentRunId: z.string().min(8),
  baseRevision: z.string().min(1),
  status: ProposalStatusSchema,
  operations: z.array(GraphOperationSchema),
  summary: z.string().min(1).max(500),
  riskLevel: GraphRiskLevelSchema,
  createdAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }).optional(),
  // Per-change accept override keyed by changeId (text/kind/domain fields).
  overrides: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
  acceptedChangeIds: z.array(z.string()).optional(),
  applyReceipt: z.object({
    idempotencyKey: z.string().min(1),
    requestHash: z.string().min(1),
    appliedAt: z.string().datetime({ offset: true }),
  }).optional(),
  /**
   * Durable entity-apply idempotency (DFH apply fix): once the associated
   * business entities (Commitments) have been created, their changeId→id
   * mapping is persisted here BEFORE the graph write. If the graph write then
   * fails, a retry recognizes the claim and re-attaches the existing entities
   * instead of creating duplicates.
   */
  entityApplyKey: z.string().min(1).optional(),
  createdEntities: z.array(z.object({ changeId: z.string().min(1), id: z.string().min(1) })).optional(),
}).strict();
export type EventGraphProposal = z.infer<typeof EventGraphProposalSchema>;

// ---------------------------------------------------------------------------
// Runtime contract types shared between the harness seam and the domain
// ---------------------------------------------------------------------------

/** Health of the underlying runtime (or Fake). Field names stay stable. */
export const RuntimeHealthSchema = z.object({
  ready: z.boolean(),
  runtimeVersion: z.string().optional(),
  profileVersion: z.string().optional(),
  protocolVersion: z.string().optional(),
  modelConfigured: z.boolean(),
  sidecarAlive: z.boolean().optional(),
  toolkitSafe: z.boolean().optional(),
  failureCode: z.string().optional(),
}).strict();
export type RuntimeHealth = z.infer<typeof RuntimeHealthSchema>;