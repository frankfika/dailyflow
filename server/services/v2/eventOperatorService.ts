/**
 * Event Operator service — orchestrates an AI "推进这个 Event" run.
 *
 * Spec: docs/DAILYFLOW_2_2_DEEPSEEK_HARNESS_IMPLEMENTATION_PLAN.md §4 / §7.
 *
 * This is the server spine of the AI Event Operator vertical slice. It:
 *   1. `startEventOperatorRun` — persists an `EventOperatorRun`, drives a
 *      runtime (default: the production `DeepSeekHarnessRuntime`), and on
 *      `proposal.ready` persists an `EventGraphProposal` (a "graph patch"
 *      proposal) derived from the current event snapshot.
 *   2. `applyEventGraphProposal` — the user-approved apply. It calls the pure
 *      `buildGraphApplyPlan`, feeds the resulting `createChanges` through the
 *      existing Proposal apply (so Commitments are really materialised), then
 *      hands the resulting entity refs + node drafts to the `writeGraph` seam.
 *
 * Seams (injected, defaults wired by the route) keep this testable without
 * v1-global mindmap files or a model key:
 *   - `runtime`      — AgentRuntime; Fake by default, DSH later.
 *   - `loadSnapshot` — load the current GraphSnapshotBase for the run scope.
 *   - `writeGraph`   — persist the accepted node adds/updates/moves (+entityRefs)
 *                      to the event's mindmap.
 *
 * Honesty rule (imported from proposalService): AI never writes formal data
 * directly. Every write flows through a pending EventGraphProposal that the
 * user reviews and the server applies atomically.
 */
import type { V2Repository } from '../../repositories/v2/repository.js';
import { newId } from '../../domain/v2/ulid.js';
import { getDeepSeekHarnessRuntime } from '../harness/DeepSeekHarnessRuntime.js';
import type {
  AgentRuntime,
  RuntimeEvent,
  RuntimePhase,
  RuntimeProposalDraft,
  RuntimeRunSpec,
} from '../harness/AgentRuntime.js';
import {
  EventOperatorRunSchema,
  EventGraphProposalSchema,
  type EventOperatorRun,
  type EventOperatorPhase,
  type EventOperatorScope,
  type EventOperatorStatus,
  type EventGraphProposal,
  type GraphOperation,
} from '../../domain/v2/eventOperator.js';
import {
  computeBaseRevision,
  validateGraphProposal,
  type GraphSnapshotBase,
} from '../../domain/v2/eventGraphValidator.js';
import {
  buildGraphApplyPlan,
  type ApplyPlan,
} from '../../domain/v2/eventGraphApplier.js';
import {
  createProposal,
  applyProposal,
  rejectProposal,
} from './proposalService.js';
import { transition } from '../../domain/v2/eventRuntimeState.js';
import { persistRuntimeEvent } from './runtimeEventPersistence.js';
import {
  graphApplyRequestHash,
  inspectGraphApplyReplay,
  withEventGraphApplyLock,
} from './eventGraphApplyContract.js';

export interface EventOperatorDeps {
  runtime?: AgentRuntime;
  /** Load the current graph snapshot for a run scope. */
  loadSnapshot: (repo: V2Repository, scope: EventOperatorScope) => Promise<GraphSnapshotBase>;
  /** Persist accepted node writes (+ entityRefs) to the event mindmap. */
  writeGraph: (ctx: {
    scope: EventOperatorScope;
    snapshot: GraphSnapshotBase;
    proposal: EventGraphProposal;
    plan: ApplyPlan;
    /** changeId → the created business entity (so a node can carry the ref). */
    entities: Map<string, { type: 'commitment' | 'decision' | 'outcome'; id: string }>;
  }) => Promise<void>;
}

function isoNow(): string {
  return new Date().toISOString();
}

function scopeToSpec(scope: EventOperatorScope, snap: GraphSnapshotBase): RuntimeRunSpec {
  const projection = {
    event: { id: scope.eventId, status: snap.eventStatus },
    mindmap: {
      id: snap.mindmapId,
      nodes: snap.nodes.map((node) => ({ id: node.id, kind: node.kind, text: node.text, entityRefs: node.entityRefs })),
      edges: snap.edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target })),
    },
    commitments: snap.commitments,
    allowedEntityIds: [...snap.knownEntityIds],
    allowedEvidenceIds: [...snap.knownEvidenceIds],
  };
  return {
    eventId: scope.eventId,
    workspaceId: scope.workspaceId,
    scope,
    promptVersion: '1',
    context: {
      bytes: Buffer.byteLength(JSON.stringify(projection)),
      manifest: scopesToManifest(scope),
      projection,
      baseRevision: computeBaseRevision(snap),
    },
  };
}

function scopesToManifest(scope: EventOperatorScope): unknown[] {
  return [
    { entityType: 'event', entityId: scope.eventId, bytes: 0 },
    { entityType: 'mindmap', entityId: scope.mindmapId, bytes: 0 },
    ...scope.selectedContextRefs.map((r) => ({ entityType: r.type, entityId: r.id, bytes: 0 })),
  ];
}

// ---------------------------------------------------------------------------
// Template proposal generator ("模板模式")
// ---------------------------------------------------------------------------
//
// Until a real model key is configured, the Fake runtime stands in for DSH and
// this deterministic generator produces the *proposal*. It is derived from the
// real event content (node text, tree shape) but is explicitly a template —
// the UI labels it as such. When DSH is wired, only the proposal source
// changes; the persistence, review and apply paths are identical.

export interface TemplateOptions {
  /** Max add_node ops to emit (keeps review manageable). */
  maxOps?: number;
}

/**
 * Deterministic, real-content-derived "拆解下一步" proposal for a v1 event.
 * For the (run scope) root and every branch node that currently has fewer than
 * two children and no committed entity ref, propose a concrete next-action
 * child (→ real active Commitment) and, for the root, a waiting child (→ real
 * waiting Commitment). Child text is a natural decomposition of the parent.
 */
export function buildTemplateProposal(
  scope: EventOperatorScope,
  snap: GraphSnapshotBase,
  agentRunId: string,
  opts: TemplateOptions = {},
): EventGraphProposal {
  const maxOps = opts.maxOps ?? 6;
  const now = isoNow();

  const childrenOf = new Map<string, string[]>();
  for (const e of snap.edges) {
    const arr = childrenOf.get(e.source) ?? [];
    arr.push(e.target);
    childrenOf.set(e.source, arr);
  }

  const nodeById = new Map(snap.nodes.map((n) => [n.id, n]));

  const operations: GraphOperation[] = [];

  const rootId = snap.nodes.find((n) => n.kind === 'root')?.id ?? snap.nodes[0]?.id;
  const ordered = [...snap.nodes];

  // Honesty rule (plan §1.3): an op that materialises a business entity must
  // cite where its claim came from. When the workspace has a real evidence
  // anchor in scope, cite it. With none available, don't fabricate — the
  // template falls back to structural-only suggestions (no entity draft).
  const evidenceAnchor = [...snap.knownEvidenceIds][0];
  const hasEvidence = Boolean(evidenceAnchor);

  for (const n of ordered) {
    if (operations.length >= maxOps) break;
    if (n.id === rootId) continue; // root handled separately below
    const text = (n.text ?? '').trim();
    if (!text) continue;
    // Already committed to a business entity? Don't re-propose.
    if (hasEntityRef(n)) continue;
    const isLeaf = (childrenOf.get(n.id) ?? []).length === 0;
    // Only decompose actionable nodes (branches) into concrete next steps.
    const kind = n.kind ?? 'branch';
    if (kind !== 'branch' && kind !== 'root') continue;

    const tempId = newId('gchg');
    const changeId = newId('gchg');
    operations.push({
      changeId,
      op: 'add_node',
      tempId,
      parentId: n.id,
      node: { kind: 'task', text: `${text} · 下一步` },
      ...(hasEvidence
        ? { domainDraft: { entity: 'commitment', title: `${text} · 下一步`, state: 'active' } }
        : {}),
      evidenceIds: hasEvidence ? [evidenceAnchor] : [],
      confidence: 0.62,
      reason: hasEvidence
        ? '模板拆解：基于已有资料把分支推进到具体下一步'
        : '模板拆解：结构占位（暂无可引用的资料）',
    });
    if (operations.length >= maxOps) break;
    // A waiting child keeps the loop alive ("等确认").
    if (isLeaf) {
      const waitingTemp = newId('gchg');
      const waitingChange = newId('gchg');
      operations.push({
        changeId: waitingChange,
        op: 'add_node',
        tempId: waitingTemp,
        parentId: n.id,
        node: { kind: 'waiting', text: `${text} · 等确认` },
        ...(hasEvidence
          ? {
              domainDraft: {
                entity: 'waiting_commitment',
                title: `${text} · 等确认`,
                waitingOnText: '对方',
                reviewAt: new Date(Date.now() + 7 * 86400000).toISOString(),
              },
            }
          : {}),
        evidenceIds: hasEvidence ? [evidenceAnchor] : [],
        confidence: 0.5,
        reason: hasEvidence ? '模板拆解：基于已有资料保持等待循环' : '模板拆解：结构占位（等确认）',
      });
    }
  }

  // If nothing was proposed yet, decompose the root into a few concrete paths.
  if (operations.length === 0 && rootId) {
    const rootText = (nodeById.get(rootId)?.text ?? scope.eventId).trim() || '这个事件';
    const fragments = [`${rootText} · 第一步`, `${rootText} · 关键决策`];
    for (const frag of fragments) {
      if (operations.length >= maxOps) break;
      const changeId = newId('gchg');
      const isDecision = frag.endsWith('关键决策');
      operations.push({
        changeId,
        op: 'add_node',
        tempId: newId('gchg'),
        parentId: rootId,
        node: { kind: isDecision ? 'decision' : 'task', text: frag },
        ...(hasEvidence
          ? isDecision
            ? { domainDraft: { entity: 'decision', title: frag, decision: frag, rationale: '模板拆解建议' } }
            : { domainDraft: { entity: 'commitment', title: frag, state: 'active' } }
          : {}),
        evidenceIds: hasEvidence ? [evidenceAnchor] : [],
        confidence: 0.6,
        reason: hasEvidence ? '模板拆解：基于已有资料从事件主题生成下一步' : '模板拆解：结构占位（暂无可引用的资料）',
      });
    }
  }

  const baseRevision = computeBaseRevision(snap);
  const proposal: EventGraphProposal = EventGraphProposalSchema.parse({
    id: newId('gprop'),
    schemaVersion: 1,
    workspaceId: scope.workspaceId,
    eventId: scope.eventId,
    mindmapId: scope.mindmapId,
    agentRunId,
    baseRevision,
    status: 'pending',
    operations,
    summary: `AI 模板拆解：${operations.length} 个下一步建议`,
    riskLevel: operations.length > 4 ? 'medium' : 'low',
    createdAt: now,
  });

  // Validate before persisting. A template must also satisfy the graph rules.
  const check = validateGraphProposal(proposal, snap);
  if (check.ok !== true) {
    throw Object.assign(new Error(`Template proposal failed validation (${check.issues.length}); refusing to ship a broken plan.`), {
      code: 'proposal_invalid',
      issues: check.issues,
    });
  }
  return proposal;
}

/** Convert a model-produced draft into the only persisted approval object. */
export function buildRuntimeProposal(
  scope: EventOperatorScope,
  snap: GraphSnapshotBase,
  agentRunId: string,
  draft: RuntimeProposalDraft,
): EventGraphProposal {
  const authoritativeRevision = computeBaseRevision(snap);
  if (draft.baseRevision !== authoritativeRevision) {
    throw Object.assign(new Error('Runtime proposal was generated from a stale or foreign graph revision.'), {
      code: 'proposal_stale',
    });
  }
  const proposal = EventGraphProposalSchema.parse({
    id: newId('gprop'),
    schemaVersion: 1,
    workspaceId: scope.workspaceId,
    eventId: scope.eventId,
    mindmapId: scope.mindmapId,
    agentRunId,
    baseRevision: authoritativeRevision,
    status: 'pending',
    operations: draft.operations,
    summary: draft.summary,
    riskLevel: draft.operations.length > 4 ? 'medium' : 'low',
    createdAt: isoNow(),
  });
  const validation = validateGraphProposal(proposal, snap);
  if (!validation.ok) {
    throw Object.assign(new Error('Model proposal failed DailyFlow graph validation.'), {
      code: 'PROPOSAL_VALIDATION_FAILED',
      issues: validation.issues,
    });
  }
  return proposal;
}

function hasEntityRef(n: { entityRefs?: unknown }): boolean {
  return Array.isArray(n.entityRefs) && n.entityRefs.length > 0;
}

// ---------------------------------------------------------------------------
// Run lifecycle
// ---------------------------------------------------------------------------

export interface StartRunOptions {
  trigger?: EventOperatorScope['trigger'];
  contextBudgetBytes?: number;
  runtimeOverride?: AgentRuntime;
  templateMaxOps?: number;
}

export async function startEventOperatorRun(
  repo: V2Repository,
  workspaceId: string,
  scopeInput: Pick<EventOperatorScope, 'eventId' | 'mindmapId'> & Partial<Pick<EventOperatorScope, 'trigger' | 'selectedContextRefs' | 'triggerEntityRef' | 'contextBudgetBytes'>>,
  deps: EventOperatorDeps,
  opts: StartRunOptions = {},
): Promise<{ run: EventOperatorRun; proposal: EventGraphProposal | null; events: RuntimeEvent[] }> {
  const runtime = opts.runtimeOverride ?? deps.runtime ?? getDeepSeekHarnessRuntime();
  const scope: EventOperatorScope = {
    workspaceId,
    trigger: opts.trigger ?? scopeInput.trigger ?? 'event_canvas',
    eventId: scopeInput.eventId,
    mindmapId: scopeInput.mindmapId,
    selectedContextRefs: scopeInput.selectedContextRefs ?? [],
    contextBudgetBytes: scopeInput.contextBudgetBytes ?? opts.contextBudgetBytes ?? 256 * 1024,
  };

  // Duplicate runs for the same event are allowed before a proposal exists,
  // but once a pending proposal is waiting, start must refuse — the user has
  // an unreviewed proposal to deal with first.
  const existing = await repo.listEventGraphProposals({ eventId: scope.eventId, status: 'pending' });
  if (existing.length > 0) {
    throw Object.assign(new Error('This event already has a pending graph proposal to review.'), { code: 'pending_proposal_exists', proposalId: existing[0].id });
  }

  const now = isoNow();
  const runId = newId('eval');
  const run: EventOperatorRun = EventOperatorRunSchema.parse({
    id: runId,
    schemaVersion: 2,
    workspaceId,
    eventId: scope.eventId,
    mindmapId: scope.mindmapId,
    runtimeId: 'deepseek-harness' as const,
    runtimeVersion: 'starting',
    modelProvider: 'pending',
    model: 'pending',
    promptVersion: '1',
    scope,
    phase: 'collect',
    status: 'starting',
    contextManifest: [
      { entityType: 'event', entityId: scope.eventId, bytes: 0 },
      { entityType: 'mindmap', entityId: scope.mindmapId, bytes: 0 },
    ],
    metrics: {},
    idempotencyKey: `event-run:${workspaceId}:${scope.eventId}:${now}`,
    createdAt: now,
    updatedAt: now,
  });
  await repo.saveEventOperatorRun(run, {
    auditKind: 'event_run.create',
    auditEntity: { type: 'event_operator_run', id: run.id },
    auditData: { eventId: scope.eventId, trigger: scope.trigger },
  });

  const runtimeHealth = await runtime.health();
  if (!runtimeHealth.ready) {
    const failed = EventOperatorRunSchema.parse({
      ...run,
      status: 'failed',
      error: {
        code: runtimeHealth.failureCode ?? 'runtime_unavailable',
        message: `Event Operator runtime is unavailable: ${runtimeHealth.failureCode ?? 'unknown'}`,
        retryable: runtimeHealth.failureCode !== 'MODEL_NOT_CONFIGURED',
      },
      updatedAt: isoNow(),
    });
    await repo.saveEventOperatorRun(failed, {
      auditKind: 'event_run.update',
      auditEntity: { type: 'event_operator_run', id: run.id },
      auditData: { event: 'runtime.health_failed', failureCode: runtimeHealth.failureCode },
    });
    throw Object.assign(new Error(`Event Operator runtime is unavailable: ${runtimeHealth.failureCode ?? 'unknown'}`), {
      code: runtimeHealth.failureCode ?? 'runtime_unavailable',
    });
  }
  const initialSnapshot = await deps.loadSnapshot(repo, scope);
  const handle = await runtime.start(scopeToSpec(scope, initialSnapshot));
  let latest = EventOperatorRunSchema.parse({
    ...run,
    runtimeVersion: runtimeHealth.runtimeVersion ?? 'unknown',
    runtimeSessionId: handle.runId,
    modelProvider: runtimeHealth.degraded ? 'openai-compatible-fallback' : 'deepseek-harness',
    model: runtimeHealth.degraded ? 'configured-chat-model' : 'dsh-profile-model',
    updatedAt: isoNow(),
  });
  await repo.saveEventOperatorRun(latest, {
    auditKind: 'event_run.update',
    auditEntity: { type: 'event_operator_run', id: run.id },
    auditData: { event: 'runtime.started', runtimeSessionId: handle.runId },
  });

  // Drain the deterministic stream synchronously. A real runtime streams async;
  // the seam + event store already support that, but the Fake is fast and we
  // can persist a complete, ordered run before returning.
  const events: RuntimeEvent[] = [];
  let proposal: EventGraphProposal | null = null;
  for await (const ev of handle.events()) {
    events.push(ev);
    const persisted = await persistRuntimeEvent(repo, run.id, ev);
    latest = EventOperatorRunSchema.parse({ ...latest, lastEventCursor: persisted.event.cursor });
    latest = await foldEvent(repo, latest, ev, deps, scope, { maxOps: opts.templateMaxOps }, (p) => { proposal = p; });
  }

  return { run: latest, proposal, events };
}

/** Apply one runtime event to the persisted run + (on proposal.ready) build/persist the proposal. */
async function foldEvent(
  repo: V2Repository,
  run: EventOperatorRun,
  ev: RuntimeEvent,
  deps: EventOperatorDeps,
  scope: EventOperatorScope,
  templateOpts: TemplateOptions,
  onProposal: (p: EventGraphProposal) => void,
): Promise<EventOperatorRun> {
  let next = EventOperatorRunSchema.parse(run);
  switch (ev.type) {
    case 'run.started':
      next = setStatus(next, 'starting');
      break;
    case 'phase.changed':
      next = EventOperatorRunSchema.parse({ ...next, phase: ev.phase, status: runningFrom(next) });
      break;
    case 'proposal.ready': {
      const snap = await deps.loadSnapshot(repo, scope);
      let proposal: EventGraphProposal;
      try {
        proposal = ev.proposal
          ? buildRuntimeProposal(scope, snap, run.id, ev.proposal)
          : buildTemplateProposal(scope, snap, run.id, templateOpts);
      } catch (error) {
        const rawCode = (error as { code?: unknown })?.code;
        next = EventOperatorRunSchema.parse({
          ...next,
          status: 'failed',
          error: {
            code: typeof rawCode === 'string' ? rawCode : 'PROPOSAL_VALIDATION_FAILED',
            message: error instanceof Error ? error.message.slice(0, 500) : 'Proposal validation failed.',
            retryable: true,
            stage: 'prepare',
          },
          updatedAt: isoNow(),
        });
        break;
      }
      await repo.saveEventGraphProposal(proposal, {
        auditKind: 'graph_proposal.create',
        auditEntity: { type: 'event_graph_proposal', id: proposal.id },
        auditData: { eventId: scope.eventId, runId: run.id },
      });
      next = EventOperatorRunSchema.parse({
        ...next,
        proposalId: proposal.id,
        status: 'waiting_review',
        updatedAt: isoNow(),
      });
      onProposal(proposal);
      break;
    }
    case 'run.failed':
      next = EventOperatorRunSchema.parse({
        ...next,
        status: 'failed',
        error: { code: ev.error.code, message: ev.error.message, retryable: ev.error.retryable },
        updatedAt: isoNow(),
      });
      break;
    case 'run.cancelled':
      next = setStatus(next, 'cancelled');
      break;
    case 'run.completed':
      // If a proposal was persisted we hold at waiting_review (the user must
      // approve). Otherwise the run finishes clean.
      if (!['waiting_review', 'failed', 'cancelled'].includes(next.status)) next = setStatus(next, 'succeeded');
      break;
    default:
      break;
  }
  if (next !== run) {
    if (next.status !== run.status) transition(run.status, next.status);
    await repo.saveEventOperatorRun(next, {
      auditKind: 'event_run.update',
      auditEntity: { type: 'event_operator_run', id: run.id },
      auditData: { event: ev.type, status: next.status, phase: next.phase },
    });
  }
  return next;
}

function runningFrom(run: EventOperatorRun): EventOperatorStatus {
  return run.status === 'waiting_review' || run.status === 'failed' || run.status === 'cancelled' || run.status === 'succeeded' ? run.status : 'running';
}

function setStatus(run: EventOperatorRun, status: EventOperatorStatus): EventOperatorRun {
  return EventOperatorRunSchema.parse({ ...run, status, updatedAt: isoNow() });
}

export async function getEventOperatorRun(repo: V2Repository, runId: string): Promise<EventOperatorRun | null> {
  return repo.getEventOperatorRun(runId);
}

export async function cancelEventOperatorRun(repo: V2Repository, runId: string): Promise<EventOperatorRun | null> {
  const run = await repo.getEventOperatorRun(runId);
  if (!run) return null;
  if (run.status === 'succeeded' || run.status === 'failed' || run.status === 'cancelled') {
    throw Object.assign(new Error(`Run is ${run.status}, cannot cancel.`), { code: 'run_not_cancellable' });
  }
  if (run.runtimeSessionId) {
    await getDeepSeekHarnessRuntime().cancel(run.runtimeSessionId);
  }
  const next = setStatus(run, 'cancelled');
  transition(run.status, 'cancelled');
  await repo.saveEventOperatorRun(next, {
    auditKind: 'event_run.cancel',
    auditEntity: { type: 'event_operator_run', id: run.id },
  });
  return next;
}

export async function getPendingGraphProposal(repo: V2Repository, eventId: string): Promise<EventGraphProposal | null> {
  const list = await repo.listEventGraphProposals({ eventId, status: 'pending' });
  return list[0] ?? null;
}

export async function validateEventGraphProposal(
  repo: V2Repository,
  deps: EventOperatorDeps,
  proposalId: string,
): Promise<{ proposal: EventGraphProposal; valid: boolean; issues: ReturnType<typeof validateGraphProposal>['issues']; currentRevision: string }> {
  const proposal = await repo.getEventGraphProposal(proposalId);
  if (!proposal) throw Object.assign(new Error('Graph proposal not found.'), { code: 'not_found' });
  const scope: EventOperatorScope = {
    workspaceId: proposal.workspaceId,
    eventId: proposal.eventId,
    mindmapId: proposal.mindmapId,
    trigger: 'event_canvas',
    selectedContextRefs: [],
    contextBudgetBytes: 256 * 1024,
  };
  const snapshot = await deps.loadSnapshot(repo, scope);
  const validation = validateGraphProposal(proposal, snapshot);
  const currentRevision = computeBaseRevision(snapshot);
  const revisionIssues = currentRevision === proposal.baseRevision ? [] : [{
    code: 'REVISION_STALE',
    message: 'The Event graph changed after this Proposal was created.',
    retryable: true,
  }];
  const issues = [...validation.issues, ...revisionIssues];
  return { proposal, valid: issues.length === 0, issues, currentRevision };
}

// ---------------------------------------------------------------------------
// Apply / reject
// ---------------------------------------------------------------------------

export interface ApplyGraphResult {
  proposal: EventGraphProposal;
  createdCommitments: number;
  appliedChanges: string[];
  staleChangeIds: string[];
  replayed?: boolean;
  affectedSurfaces: Array<'events' | 'today' | 'proposals' | 'memory' | 'agentRuns'>;
}

/**
 * The user's single approved apply. Builds the plan from the current snapshot
 * (so a stale baseRevision is detected and never silently over-written), runs
 * the created-commitment changes through the existing Proposal apply to
 * materialise real entities, then calls `writeGraph` to persist the node adds.
 */
export async function applyEventGraphProposal(
  repo: V2Repository,
  deps: EventOperatorDeps,
  proposalId: string,
  options: { idempotencyKey?: string; selection?: string[]; userOverrides?: Record<string, Record<string, unknown>> } = {},
): Promise<ApplyGraphResult> {
  return withEventGraphApplyLock(repo, proposalId, () => applyEventGraphProposalUnlocked(repo, deps, proposalId, options));
}

async function applyEventGraphProposalUnlocked(
  repo: V2Repository,
  deps: EventOperatorDeps,
  proposalId: string,
  options: { idempotencyKey?: string; selection?: string[]; userOverrides?: Record<string, Record<string, unknown>> },
): Promise<ApplyGraphResult> {
  let proposal = await repo.getEventGraphProposal(proposalId);
  if (!proposal) throw Object.assign(new Error('Graph proposal not found.'), { code: 'not_found' });
  const key = options.idempotencyKey ?? `event-graph-apply:${proposal.id}`;
  const replay = inspectGraphApplyReplay(proposal, { idempotencyKey: key, selection: options.selection, overrides: options.userOverrides });
  if (replay) return { ...replay, affectedSurfaces: ['events', 'today', 'proposals', 'memory', 'agentRuns'] };
  if (proposal.status !== 'pending') {
    throw Object.assign(new Error(`Graph proposal is ${proposal.status}.`), { code: 'proposal_not_pending' });
  }
  const scope: EventOperatorScope = {
    workspaceId: proposal.workspaceId,
    eventId: proposal.eventId,
    mindmapId: proposal.mindmapId,
    trigger: 'event_canvas',
    selectedContextRefs: [],
    contextBudgetBytes: 256 * 1024,
  };
  const snapshot = await deps.loadSnapshot(repo, scope);

  // Revalidate the approved plan against the *current* graph before touching
  // anything — the base revision may have moved under us.
  const plan = buildGraphApplyPlan(
    { operations: proposal.operations, baseRevision: proposal.baseRevision },
    snapshot,
    options.selection,
    options.userOverrides,
  );

  if (plan.staleChangeIds.length > 0) {
    throw Object.assign(
      new Error(`The event changed after this proposal was built (${plan.staleChangeIds.length} change(s) are stale). Refresh and regenerate.`),
      { code: 'proposal_stale', staleChangeIds: plan.staleChangeIds },
    );
  }

  // Materialise the business entities (Commitments) via the existing Proposal
  // apply path — the exact flow the Inbox review already trusts.
  //
  // Idempotency (DFH apply fix): a prior attempt may already have created the
  // entities but failed on the graph write. We persist the changeId→id claim
  // BEFORE the graph write, so a retry re-links the existing entities instead
  // of creating duplicates.
  const entities = new Map<string, { type: 'commitment' | 'decision' | 'outcome'; id: string }>();
  let createdCount = 0;
  if (proposal.entityApplyKey === key && proposal.createdEntities) {
    // A previous attempt created the entities; the graph write failed. Reuse them.
    for (const p of proposal.createdEntities) entities.set(p.changeId, { type: p.type, id: p.id });
    createdCount = proposal.createdEntities.filter((item) => item.type === 'commitment').length;
  } else if (plan.createChanges.length > 0) {
    const wrapperProposal = await createProposal(repo, proposal.workspaceId, {
      kind: 'extract_commitments',
      sourceIds: [],
      changes: plan.createChanges as Required<typeof plan.createChanges>,
      modelRunId: newId('run'),
    });
    const applied = await applyProposal(repo, wrapperProposal.id, { idempotencyKey: key, applyAtomic: true });
    const createdPairs: { changeId: string; id: string; type: 'commitment' | 'decision' | 'outcome' }[] = [];
    for (const created of applied.createdEntities) {
      entities.set(created.changeId, { type: created.type, id: created.entity.id });
      createdPairs.push({ changeId: created.changeId, id: created.entity.id, type: created.type });
    }
    if (applied.rejected.length > 0) {
      await compensateCreatedEntities(repo, createdPairs);
      throw Object.assign(new Error(`Graph Proposal domain apply failed for ${applied.rejected.length} change(s).`), {
        code: 'graph_domain_apply_failed',
        rejected: applied.rejected,
      });
    }
    createdCount = createdPairs.filter((item) => item.type === 'commitment').length;
    // Persist the claim now — before writeGraph — so a graph-write failure
    // cannot double-create on the user's retry. This is an idempotency marker,
    // not the final acceptance (that happens only after the graph is written).
    proposal = EventGraphProposalSchema.parse({ ...proposal, entityApplyKey: key, createdEntities: createdPairs, status: 'pending' });
    try {
      await repo.saveEventGraphProposal(proposal);
    } catch (error) {
      await compensateCreatedEntities(repo, createdPairs);
      throw error;
    }
  }

  // Persist the graph (nodes/edges + entityRefs) via the seam.
  try {
    await deps.writeGraph({ scope, snapshot, proposal, plan, entities });
  } catch (error) {
    // The graph writer is an atomic document write. If it fails, compensate
    // every formal entity created by this attempt and clear the durable claim
    // so a retry cannot link deleted IDs.
    const createdThisAttempt = proposal.createdEntities ?? [];
    await compensateCreatedEntities(repo, createdThisAttempt);
    proposal = EventGraphProposalSchema.parse({
      ...proposal,
      entityApplyKey: undefined,
      createdEntities: undefined,
      status: 'pending',
    });
    await repo.saveEventGraphProposal(proposal, {
      auditKind: 'event_run.update',
      auditEntity: { type: 'event_graph_proposal', id: proposal.id },
      auditActor: 'system',
      auditData: { event: 'graph_apply.compensated', errorCode: (error as { code?: string })?.code },
    });
    throw error;
  }

  const selected = new Set(options.selection ?? proposal.operations.map((operation) => operation.changeId));
  const acceptedChangeIds = [...new Set([
    ...(proposal.acceptedChangeIds ?? []),
    ...proposal.operations
      .filter((operation) => selected.has(operation.changeId) && !plan.staleChangeIds.includes(operation.changeId))
      .map((operation) => operation.changeId),
  ])];
  const status = acceptedChangeIds.length === 0
    ? 'rejected'
    : acceptedChangeIds.length === proposal.operations.length ? 'accepted' : 'partially_accepted';
  const updated: EventGraphProposal = EventGraphProposalSchema.parse({
    ...proposal,
    acceptedChangeIds,
    applyReceipt: {
      idempotencyKey: key,
      requestHash: graphApplyRequestHash({ selection: options.selection, overrides: options.userOverrides }),
      appliedAt: isoNow(),
      acceptedChangeIds,
      staleChangeIds: plan.staleChangeIds,
    },
    status,
  });
  await repo.saveEventGraphProposal(updated, {
    auditKind: 'graph_proposal.apply',
    auditEntity: { type: 'event_graph_proposal', id: proposal.id },
    auditData: { eventId: proposal.eventId, createdCount, acceptedChangeIds },
  });

  // Mark the associated run as complete (applying → succeeded, or a retry
  // that was left at applying → succeeded).
  const run = proposal.agentRunId ? await repo.getEventOperatorRun(proposal.agentRunId) : null;
  if (run && run.status === 'waiting_review') {
    const applying = setStatus(run, 'applying');
    transition(run.status, 'applying');
    await repo.saveEventOperatorRun(applying, { auditKind: 'event_run.update', auditEntity: { type: 'event_operator_run', id: run.id }, auditData: { event: 'graph.apply' } });
    const done = setStatus(applying, 'succeeded');
    transition(applying.status, 'succeeded');
    await repo.saveEventOperatorRun(done, { auditKind: 'event_run.update', auditEntity: { type: 'event_operator_run', id: run.id }, auditData: { event: 'graph.applied' } });
  } else if (run && run.status === 'applying') {
    const done = setStatus(run, 'succeeded');
    transition(run.status, 'succeeded');
    await repo.saveEventOperatorRun(done, { auditKind: 'event_run.update', auditEntity: { type: 'event_operator_run', id: run.id }, auditData: { event: 'graph.applied' } });
  }

  return {
    proposal: updated,
    createdCommitments: createdCount,
    appliedChanges: acceptedChangeIds,
    staleChangeIds: plan.staleChangeIds,
    affectedSurfaces: ['events', 'today', 'proposals', 'memory', 'agentRuns'],
  };
}

async function compensateCreatedEntities(
  repo: V2Repository,
  entities: Array<{ id: string; type: 'commitment' | 'decision' | 'outcome' }>,
): Promise<void> {
  for (const entity of [...entities].reverse()) {
    await repo.deleteCreatedEntity(entity.type, entity.id);
  }
}

export async function rejectEventGraphProposal(
  repo: V2Repository,
  proposalId: string,
  reason: string,
): Promise<EventGraphProposal> {
  const proposal = await repo.getEventGraphProposal(proposalId);
  if (!proposal) throw Object.assign(new Error('Graph proposal not found.'), { code: 'not_found' });
  if (proposal.status === 'rejected') return proposal;
  if (proposal.status !== 'pending') {
    throw Object.assign(new Error(`Graph proposal is ${proposal.status}.`), { code: 'proposal_not_pending' });
  }
  const updated: EventGraphProposal = EventGraphProposalSchema.parse({
    ...proposal,
    status: 'rejected',
    acceptedChangeIds: [],
  });
  await repo.saveEventGraphProposal(updated, {
    auditKind: 'graph_proposal.reject',
    auditEntity: { type: 'event_graph_proposal', id: proposal.id },
    auditData: { eventId: proposal.eventId, reason },
  });
  const run = proposal.agentRunId ? await repo.getEventOperatorRun(proposal.agentRunId) : null;
  if (run && run.status === 'waiting_review') {
    const done = setStatus(run, 'succeeded');
    transition(run.status, 'succeeded');
    await repo.saveEventOperatorRun(done, { auditKind: 'event_run.update', auditEntity: { type: 'event_operator_run', id: run.id }, auditData: { event: 'graph.reject' } });
  }
  return updated;
}

// Re-export for routes/UI convenience.
export type { EventOperatorRun, EventGraphProposal, GraphOperation };
export { rejectProposal };
