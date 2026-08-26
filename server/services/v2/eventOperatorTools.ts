import { z } from 'zod';
import type { V2Repository } from '../../repositories/v2/repository.js';
import type { MindMap } from '../../types/mindmap.js';
import { newId } from '../../domain/v2/ulid.js';
import {
  EventGraphProposalSchema,
  GraphOperationDraftSchema,
  EventOperatorRunSchema,
  type EventOperatorRun,
  type EventGraphProposal,
} from '../../domain/v2/eventOperator.js';
import { computeBaseRevision, validateGraphProposal, type GraphSnapshotBase } from '../../domain/v2/eventGraphValidator.js';
import { transition } from '../../domain/v2/eventRuntimeState.js';
import type { EventSessionProjection } from './eventSessionProjection.js';
import { projectionHash } from './eventSessionProjection.js';

const MAX_TOOL_RESPONSE_BYTES = 32 * 1024;
const DEFAULT_PAGE_SIZE = 50;

export const EVENT_OPERATOR_TOOL_WHITELIST = [
  'read_event',
  'read_mindmap',
  'read_evidence',
  'search_evidence',
  'list_commitments',
  'propose_graph_patch',
  'complete_event_run',
] as const;

export type EventOperatorToolName = typeof EVENT_OPERATOR_TOOL_WHITELIST[number];

export interface EventOperatorToolDeps {
  repo: V2Repository;
  run: EventOperatorRun;
  projection: EventSessionProjection;
  mindmap: MindMap;
  snapshot: GraphSnapshotBase;
}

const ReadEventInput = z.object({
  include: z.array(z.enum(['participants', 'links', 'recent_activity'])).max(3).optional(),
}).strict();
const ReadMindmapInput = z.object({
  rootNodeId: z.string().optional(),
  depth: z.number().int().min(0).max(8).default(3),
  cursor: z.string().regex(/^\d+$/).optional(),
  includeEntityRefs: z.boolean().default(false),
}).strict();
const ReadEvidenceInput = z.object({ evidenceIds: z.array(z.string()).min(1).max(20) }).strict();
const SearchEvidenceInput = z.object({
  query: z.string().min(1).max(500),
  entityTypes: z.array(z.enum(['note', 'source', 'decision', 'commitment', 'outcome'])).max(5).optional(),
  limit: z.number().int().min(1).max(20).default(10),
}).strict();
const ListCommitmentsInput = z.object({
  states: z.array(z.enum(['inbox', 'active', 'planned', 'waiting', 'someday', 'completed', 'cancelled', 'archived'])).optional(),
  query: z.string().max(300).optional(),
  limit: z.number().int().min(1).max(100).default(50),
}).strict();
const ProposeGraphPatchInput = z.object({
  baseRevision: z.string().min(1),
  summary: z.string().min(1).max(500),
  riskLevel: z.enum(['low', 'medium', 'high']).default('low'),
  operations: z.array(GraphOperationDraftSchema).min(1).max(100),
}).strict();
const CompleteEventRunInput = z.object({
  proposalId: z.string().min(8),
  userFacingSummary: z.string().min(1).max(500),
}).strict();

export class EventOperatorToolGateway {
  private proposalAttempts = 0;
  private concluded = false;

  constructor(private readonly deps: EventOperatorToolDeps) {
    if (deps.run.workspaceId !== deps.repo.workspaceId || deps.run.eventId !== deps.projection.event.id || deps.run.mindmapId !== deps.mindmap.id) {
      throw toolError('TOOL_SCOPE_VIOLATION', 'Tool gateway dependencies do not match the persisted Run scope.');
    }
  }

  listTools(): readonly EventOperatorToolName[] {
    return EVENT_OPERATOR_TOOL_WHITELIST;
  }

  async execute(name: EventOperatorToolName, rawInput: unknown): Promise<unknown> {
    if (this.concluded) throw toolError('RUN_ALREADY_CONCLUDED', 'No tool may run after complete_event_run.');
    if (!EVENT_OPERATOR_TOOL_WHITELIST.includes(name)) throw toolError('RUNTIME_TOOLSET_UNSAFE', `Tool ${name} is not authorized.`);
    let result: unknown;
    switch (name) {
      case 'read_event': result = this.readEvent(ReadEventInput.parse(rawInput)); break;
      case 'read_mindmap': result = this.readMindmap(ReadMindmapInput.parse(rawInput)); break;
      case 'read_evidence': result = await this.readEvidence(ReadEvidenceInput.parse(rawInput)); break;
      case 'search_evidence': result = await this.searchEvidence(SearchEvidenceInput.parse(rawInput)); break;
      case 'list_commitments': result = await this.listCommitments(ListCommitmentsInput.parse(rawInput)); break;
      case 'propose_graph_patch': result = await this.proposeGraphPatch(ProposeGraphPatchInput.parse(rawInput)); break;
      case 'complete_event_run': result = await this.completeEventRun(CompleteEventRunInput.parse(rawInput)); break;
    }
    assertBoundedResponse(result);
    await this.auditTool(name, rawInput, result);
    return result;
  }

  private readEvent(_input: z.infer<typeof ReadEventInput>) {
    return { event: this.deps.projection.event, linked: { mindmapId: this.deps.mindmap.id, ...this.deps.projection.linked } };
  }

  private readMindmap(input: z.infer<typeof ReadMindmapInput>) {
    const rootId = input.rootNodeId ?? this.deps.mindmap.rootId;
    if (!this.deps.mindmap.nodes.some((node) => node.id === rootId)) throw toolError('NODE_NOT_FOUND', 'Requested root node is outside this Event graph.');
    const depthById = new Map<string, number>([[rootId, 0]]);
    for (let pass = 0; pass <= input.depth; pass += 1) {
      for (const edge of this.deps.mindmap.edges) {
        const parentDepth = depthById.get(edge.source);
        if (parentDepth !== undefined && parentDepth < input.depth) depthById.set(edge.target, parentDepth + 1);
      }
    }
    const visible = this.deps.mindmap.nodes
      .filter((node) => depthById.has(node.id))
      .sort((a, b) => a.id.localeCompare(b.id));
    const start = Number(input.cursor ?? 0);
    const page = visible.slice(start, start + DEFAULT_PAGE_SIZE);
    const nodeIds = new Set(page.map((node) => node.id));
    return {
      revision: computeBaseRevision(this.deps.snapshot),
      nodes: page.map((node) => ({
        id: node.id,
        parentId: this.deps.mindmap.edges.find((edge) => edge.target === node.id)?.source,
        text: node.text,
        kind: node.kind ?? 'branch',
        ...(input.includeEntityRefs ? { entityRefs: node.entityRefs ?? [] } : {}),
      })),
      edges: this.deps.mindmap.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)),
      nextCursor: start + page.length < visible.length ? String(start + page.length) : undefined,
    };
  }

  private async readEvidence(input: z.infer<typeof ReadEvidenceInput>) {
    const allowed = new Set(this.deps.projection.linked.evidenceIds);
    if (input.evidenceIds.some((id) => !allowed.has(id))) throw toolError('EVIDENCE_SCOPE_VIOLATION', 'Evidence is outside this Event Session scope.');
    const all = await this.deps.repo.listEvidence();
    return input.evidenceIds.map((id) => {
      const item = all.find((candidate) => candidate.id === id);
      if (!item) throw toolError('EVIDENCE_NOT_FOUND', `Evidence ${id} was not found.`);
      return { id: item.id, sourceId: item.sourceId ?? item.noteId, quote: item.quote.slice(0, 1000), locator: item.locator, stale: item.stale, sourceContentHash: item.sourceContentHash };
    });
  }

  private async searchEvidence(input: z.infer<typeof SearchEvidenceInput>) {
    const allowed = new Set(this.deps.projection.linked.evidenceIds);
    const query = input.query.toLocaleLowerCase();
    return (await this.deps.repo.listEvidence())
      .filter((item) => allowed.has(item.id))
      .filter((item) => item.quote.toLocaleLowerCase().includes(query))
      .slice(0, input.limit)
      .map((item) => ({
        evidenceId: item.id,
        entityRef: { type: item.noteId ? 'note' : 'source', id: item.noteId ?? item.sourceId },
        quote: item.quote.slice(0, 500),
        locator: item.locator,
        score: 1,
        updatedAt: item.updatedAt,
      }));
  }

  private async listCommitments(input: z.infer<typeof ListCommitmentsInput>) {
    const allowed = new Set(this.deps.projection.linked.commitmentIds);
    const query = input.query?.toLocaleLowerCase();
    return (await this.deps.repo.listCommitments())
      .filter((item) => allowed.has(item.id))
      .filter((item) => !input.states || input.states.includes(item.state))
      .filter((item) => !query || `${item.title}\n${item.outcome}\n${item.nextAction ?? ''}`.toLocaleLowerCase().includes(query))
      .slice(0, input.limit)
      .map(({ id, title, state, ownerId, dueAt, waitingOnText, reviewAt, evidenceIds, updatedAt }) => ({
        id, title, state, ownerText: ownerId, dueAt, waitingOnText, reviewAt, evidenceIds, updatedAt,
      }));
  }

  private async proposeGraphPatch(input: z.infer<typeof ProposeGraphPatchInput>) {
    this.proposalAttempts += 1;
    if (this.proposalAttempts > 2) throw toolError('PROPOSAL_RETRY_LIMIT', 'A Run may submit at most two complete graph proposals.');
    const now = new Date().toISOString();
    const proposal = EventGraphProposalSchema.parse({
      id: newId('gprop'),
      schemaVersion: 1,
      workspaceId: this.deps.run.workspaceId,
      eventId: this.deps.run.eventId,
      mindmapId: this.deps.run.mindmapId,
      agentRunId: this.deps.run.id,
      baseRevision: input.baseRevision,
      status: 'pending',
      operations: input.operations,
      summary: input.summary,
      riskLevel: input.riskLevel,
      createdAt: now,
    });
    const validation = validateGraphProposal(proposal, this.deps.snapshot);
    if (!validation.ok) return { ok: false, issues: validation.issues };
    await this.deps.repo.saveEventGraphProposal(proposal, {
      auditKind: 'graph_proposal.create',
      auditEntity: { type: 'event_graph_proposal', id: proposal.id },
      auditActor: 'ai',
      auditData: { runId: this.deps.run.id, operationCount: proposal.operations.length, warningCodes: [] },
    });
    return { ok: true, proposalId: proposal.id, acceptedOperationCount: proposal.operations.length, warnings: [] };
  }

  private async completeEventRun(input: z.infer<typeof CompleteEventRunInput>) {
    const proposal = await this.deps.repo.getEventGraphProposal(input.proposalId);
    if (!proposal || proposal.agentRunId !== this.deps.run.id || proposal.status !== 'pending') {
      throw toolError('PROPOSAL_NOT_READY', 'complete_event_run requires this Run\'s valid pending Proposal.');
    }
    const current = await this.deps.repo.getEventOperatorRun(this.deps.run.id);
    if (!current) throw toolError('RUN_NOT_FOUND', 'Run was not found.');
    transition(current.status, 'waiting_review');
    const now = new Date().toISOString();
    const updated = EventOperatorRunSchema.parse({ ...current, proposalId: proposal.id, phase: 'review', status: 'waiting_review', updatedAt: now });
    await this.deps.repo.saveEventOperatorRun(updated, {
      auditKind: 'event_run.update',
      auditEntity: { type: 'event_operator_run', id: current.id },
      auditActor: 'ai',
      auditData: { event: 'complete_event_run', proposalId: proposal.id, summaryHash: projectionHash(input.userFacingSummary) },
    });
    this.concluded = true;
    return { status: 'waiting_review' as const, proposalId: proposal.id };
  }

  private async auditTool(name: EventOperatorToolName, input: unknown, output: unknown): Promise<void> {
    await this.deps.repo.audit.append({
      kind: 'process',
      actor: 'ai',
      entity: { type: 'event_operator_run', id: this.deps.run.id },
      data: {
        event: 'tool.completed',
        tool: name,
        inputShape: input && typeof input === 'object' ? Object.keys(input as object).sort() : [],
        outputBytes: Buffer.byteLength(JSON.stringify(output), 'utf8'),
      },
    });
  }
}

export function validateToolWhitelist(actualTools: readonly string[]): { safe: boolean; unauthorized: string[]; missing: string[] } {
  const allowed = new Set<string>(EVENT_OPERATOR_TOOL_WHITELIST);
  const actual = new Set(actualTools);
  return {
    safe: actualTools.every((tool) => allowed.has(tool)) && EVENT_OPERATOR_TOOL_WHITELIST.every((tool) => actual.has(tool)),
    unauthorized: actualTools.filter((tool) => !allowed.has(tool)).sort(),
    missing: EVENT_OPERATOR_TOOL_WHITELIST.filter((tool) => !actual.has(tool)),
  };
}

function assertBoundedResponse(result: unknown): void {
  const bytes = Buffer.byteLength(JSON.stringify(result), 'utf8');
  if (bytes > MAX_TOOL_RESPONSE_BYTES) throw toolError('TOOL_RESPONSE_TOO_LARGE', `Tool response exceeded ${MAX_TOOL_RESPONSE_BYTES} bytes; use pagination.`);
}

function toolError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

export type ProposeGraphPatchResult =
  | { ok: true; proposalId: string; acceptedOperationCount: number; warnings: [] }
  | { ok: false; issues: unknown[] };
export type { EventGraphProposal };
