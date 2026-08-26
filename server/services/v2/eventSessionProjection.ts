import { createHash } from 'crypto';
import type { V2Repository } from '../../repositories/v2/repository.js';
import type { EventDetail } from '../../types/event.js';
import type { MindMap } from '../../types/mindmap.js';
import type { ContextManifestItem, EntityRef, EventOperatorScope } from '../../domain/v2/eventOperator.js';

export interface EventProjectionInput {
  event: EventDetail;
  mindmap: MindMap;
}

export interface EventSessionProjection {
  schemaVersion: 1;
  workspaceId: string;
  event: {
    id: string;
    title: string;
    status: string;
    context: string;
    progress: { done: number; total: number };
    tags: string[];
    createdAt: string;
    updatedAt: string;
  };
  mindmap: {
    id: string;
    rootNodeId: string;
    updatedAt: string;
    nodeCount: number;
    edgeCount: number;
    rootsAndBranches: Array<{ id: string; text: string; kind: string }>;
  };
  linked: {
    noteIds: string[];
    sourceIds: string[];
    evidenceIds: string[];
    commitmentIds: string[];
    decisionIds: string[];
    outcomeIds: string[];
  };
  commitments: Array<{
    id: string;
    title: string;
    state: string;
    dueAt?: string;
    waitingOnText?: string;
    reviewAt?: string;
    updatedAt: string;
  }>;
  recentDecisions: Array<{ id: string; title: string; decidedAt: string; updatedAt: string }>;
  selectedContext: Array<{ type: string; id: string; title?: string; updatedAt?: string }>;
  budget: { maxBytes: number; projectedBytes: number; truncated: boolean };
  contextManifest: ContextManifestItem[];
  manifestHash: string;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function projectionHash(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

/**
 * Build the bounded, deterministic context injected at Session start. It only
 * contains summaries/IDs; selected Notes and Sources never contribute body.
 */
export async function buildEventSessionProjection(
  repo: V2Repository,
  scope: EventOperatorScope,
  input: EventProjectionInput,
): Promise<EventSessionProjection> {
  if (scope.workspaceId !== repo.workspaceId) throw scopedError('TOOL_SCOPE_VIOLATION', 'Run workspace does not match repository workspace.');
  if (input.event.id !== scope.eventId || input.mindmap.id !== scope.mindmapId || input.event.mindmapId !== input.mindmap.id) {
    throw scopedError('EVENT_SCOPE_MISMATCH', 'Event and mindmap do not match the authorized Run scope.');
  }

  const refIds = new Map<string, Set<string>>();
  for (const node of input.mindmap.nodes) {
    for (const ref of node.entityRefs ?? []) {
      const ids = refIds.get(ref.type) ?? new Set<string>();
      ids.add(ref.id);
      refIds.set(ref.type, ids);
    }
  }
  for (const ref of scope.selectedContextRefs) {
    const ids = refIds.get(ref.type) ?? new Set<string>();
    ids.add(ref.id);
    refIds.set(ref.type, ids);
  }

  const [allCommitments, allDecisions, allNotes, allSources, allEvidence] = await Promise.all([
    repo.listCommitments(),
    repo.listDecisions(),
    repo.listNoteDocuments(),
    repo.listSourceItems(),
    repo.listEvidence(),
  ]);
  const linkedCommitments = allCommitments
    .filter((item) => refIds.get('commitment')?.has(item.id))
    .filter((item) => !['completed', 'cancelled', 'archived'].includes(item.state))
    .sort((a, b) => a.id.localeCompare(b.id));
  const linkedDecisions = allDecisions
    .filter((item) => refIds.get('decision')?.has(item.id))
    .sort((a, b) => b.decidedAt.localeCompare(a.decidedAt))
    .slice(0, 20);

  // Evidence explicitly selected, referenced by a graph node, or backing an
  // Event-linked commitment/decision is in scope. Nothing else is exposed.
  const evidenceIds = new Set<string>(refIds.get('evidence') ?? []);
  for (const item of linkedCommitments) item.evidenceIds.forEach((id) => evidenceIds.add(id));
  for (const item of linkedDecisions) item.evidenceIds.forEach((id) => evidenceIds.add(id));
  const scopedEvidence = allEvidence.filter((item) => evidenceIds.has(item.id));
  const noteIds = new Set(refIds.get('note') ?? []);
  const sourceIds = new Set(refIds.get('source') ?? []);
  for (const item of scopedEvidence) {
    if (item.noteId) noteIds.add(item.noteId);
    if (item.sourceId) sourceIds.add(item.sourceId);
  }

  let selectedContext = scope.selectedContextRefs.map((ref) => {
    const note = ref.type === 'note' ? allNotes.find((item) => item.id === ref.id) : undefined;
    const source = ref.type === 'source' ? allSources.find((item) => item.id === ref.id) : undefined;
    const commitment = ref.type === 'commitment' ? allCommitments.find((item) => item.id === ref.id) : undefined;
    const decision = ref.type === 'decision' ? allDecisions.find((item) => item.id === ref.id) : undefined;
    return {
      type: ref.type,
      id: ref.id,
      title: note?.title ?? source?.title ?? commitment?.title ?? decision?.title,
      updatedAt: note?.updatedAt ?? source?.updatedAt ?? commitment?.updatedAt ?? decision?.updatedAt,
    };
  }).sort((a, b) => `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`));

  const event = {
    id: input.event.id,
    title: input.event.title.slice(0, 500),
    status: input.event.status,
    context: input.event.context,
    progress: input.event.progress,
    tags: [...input.event.effectiveTags].sort(),
    createdAt: input.event.createdAt,
    updatedAt: input.event.updatedAt,
  };
  const mindmap = {
    id: input.mindmap.id,
    rootNodeId: input.mindmap.rootId,
    updatedAt: input.mindmap.updatedAt,
    nodeCount: input.mindmap.nodes.length,
    edgeCount: input.mindmap.edges.length,
    rootsAndBranches: input.mindmap.nodes
      .filter((node) => node.id === input.mindmap.rootId || (node.kind ?? 'branch') === 'branch')
      .map((node) => ({ id: node.id, text: node.text.slice(0, 300), kind: node.kind ?? 'branch' }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
  const linked = {
    noteIds: uniqueSorted(noteIds),
    sourceIds: uniqueSorted(sourceIds),
    evidenceIds: uniqueSorted(scopedEvidence.map((item) => item.id)),
    commitmentIds: uniqueSorted(linkedCommitments.map((item) => item.id)),
    decisionIds: uniqueSorted(linkedDecisions.map((item) => item.id)),
    outcomeIds: uniqueSorted(refIds.get('outcome') ?? []),
  };
  let commitments = linkedCommitments.map(({ id, title, state, dueAt, waitingOnText, reviewAt, updatedAt }) => ({
    id, title, state, dueAt, waitingOnText, reviewAt, updatedAt,
  }));
  let recentDecisions = linkedDecisions.map(({ id, title, decidedAt, updatedAt }) => ({ id, title, decidedAt, updatedAt }));
  let projectedBytes = projectionBytes({ schemaVersion: 1, workspaceId: scope.workspaceId, event, mindmap, linked, commitments, recentDecisions, selectedContext });
  let truncated = false;
  // Deterministic budget trimming: retain the root summary and selected refs
  // longest, dropping lower-priority expansion lists from the tail.
  while (projectedBytes > scope.contextBudgetBytes) {
    truncated = true;
    if (mindmap.rootsAndBranches.length > 1) mindmap.rootsAndBranches.pop();
    else if (recentDecisions.length > 0) recentDecisions = recentDecisions.slice(0, -1);
    else if (commitments.length > 0) commitments = commitments.slice(0, -1);
    else if (selectedContext.length > 0) selectedContext = selectedContext.slice(0, -1);
    else throw scopedError('CONTEXT_BUDGET_TOO_SMALL', 'Context budget is too small for the minimum Event Session Projection.');
    projectedBytes = projectionBytes({ schemaVersion: 1, workspaceId: scope.workspaceId, event, mindmap, linked, commitments, recentDecisions, selectedContext });
  }
  const manifest: ContextManifestItem[] = [
    manifestItem('event', event.id, event.updatedAt, event),
    manifestItem('mindmap', mindmap.id, mindmap.updatedAt, mindmap),
    ...selectedContext.map((item) => manifestItem(normalizeManifestType(item.type), item.id, item.updatedAt, item)),
  ].sort((a, b) => `${a.entityType}:${a.entityId}`.localeCompare(`${b.entityType}:${b.entityId}`));
  const hash = projectionHash(manifest);
  const base = { schemaVersion: 1 as const, workspaceId: scope.workspaceId, event, mindmap, linked, commitments, recentDecisions, selectedContext };
  return {
    ...base,
    budget: { maxBytes: scope.contextBudgetBytes, projectedBytes, truncated },
    contextManifest: manifest,
    manifestHash: hash,
  };
}

function projectionBytes(value: unknown): number {
  return Buffer.byteLength(stableJson(value), 'utf8');
}

function normalizeManifestType(type: string): ContextManifestItem['entityType'] {
  return ['event', 'mindmap', 'note', 'source', 'evidence', 'commitment', 'decision', 'outcome'].includes(type)
    ? type as ContextManifestItem['entityType']
    : 'source';
}

function manifestItem(
  entityType: ContextManifestItem['entityType'],
  entityId: string,
  version: string | undefined,
  value: unknown,
): ContextManifestItem {
  const content = stableJson(value);
  return { entityType, entityId, version, contentHash: projectionHash(value), bytes: Buffer.byteLength(content, 'utf8') };
}

function scopedError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

export function isRefInProjection(projection: EventSessionProjection, ref: EntityRef): boolean {
  const key = `${ref.type}Ids` as keyof EventSessionProjection['linked'];
  const ids = projection.linked[key];
  return Array.isArray(ids) && ids.includes(ref.id);
}
