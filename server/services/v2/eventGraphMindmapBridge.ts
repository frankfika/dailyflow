/**
 * Event Graph ↔ v1 mindmap bridge — wires the EventOperatorService deps to the
 * existing v1 mindmap store (`server/services/mindmaps.ts`). This is the ONLY
 * place the AI Event Operator touches the v1 mindmap document. The core
 * service (`eventOperatorService.ts`) stays v1-agnostic.
 *
 *   - `loadSnapshot` — read the current event mindmap + v2 commitments/evidence
 *     into a `GraphSnapshotBase` (the base revision drives stale detection).
 *   - `writeGraph`   — apply the user-accepted node adds/updates/moves to the
 *     v1 mindmap, attaching the created entity back-links (entityRefs) and
 *     AI provenance to the nodes the proposal created.
 */
import { ulid } from 'ulid';
import { getMindMap, updateMindMap } from '../mindmaps.js';
import type { V2Repository } from '../../repositories/v2/repository.js';
import type { EventOperatorScope, EventGraphProposal } from '../../domain/v2/eventOperator.js';
import type { GraphSnapshotBase } from '../../domain/v2/eventGraphValidator.js';
import type { ApplyPlan } from '../../domain/v2/eventGraphApplier.js';
import type { MindMapNode } from '../../types/mindmap.js';
import type { EventOperatorDeps } from './eventOperatorService.js';

export function makeEventGraphRouteDeps(repo: V2Repository, workspaceId: string): EventOperatorDeps {
  return {
    loadSnapshot: (r, scope) => loadEventGraphSnapshot(r, workspaceId, scope),
    writeGraph: (ctx) => writeEventGraphToMindmap(ctx),
  };
}

async function loadEventGraphSnapshot(
  repo: V2Repository,
  workspaceId: string,
  scope: EventOperatorScope,
): Promise<GraphSnapshotBase> {
  const map = await getMindMap(scope.mindmapId);
  if (!map) throw Object.assign(new Error('Event mindmap not found.'), { code: 'not_found' });
  const commitments = await repo.listCommitments();
  const decisions = await repo.listDecisions();
  const evidence = await repo.listEvidence();
  const knownEntityIds = new Set<string>([...commitments.map((c) => c.id), ...decisions.map((d) => d.id)]);
  const knownEvidenceIds = new Set<string>(evidence.map((e) => e.id));
  return {
    workspaceId,
    eventId: scope.eventId,
    mindmapId: map.id,
    mindmapUpdatedAt: map.updatedAt,
    eventStatus: 'active',
    nodes: map.nodes.map((n) => ({ id: n.id, kind: n.kind ?? 'branch', text: n.text, entityRefs: n.entityRefs })),
    edges: map.edges,
    commitments: commitments.map((c) => ({ id: c.id, updatedAt: c.updatedAt, state: c.state })),
    knownEntityIds,
    knownEvidenceIds,
  };
}

async function writeEventGraphToMindmap(ctx: {
  scope: EventOperatorScope;
  snapshot: GraphSnapshotBase;
  proposal: EventGraphProposal;
  plan: ApplyPlan;
  entities: Map<string, { type: 'commitment' | 'decision' | 'outcome'; id: string }>;
}): Promise<void> {
  const map = await getMindMap(ctx.scope.mindmapId);
  if (!map) throw Object.assign(new Error('Event mindmap not found.'), { code: 'not_found' });

  const nodes: MindMapNode[] = map.nodes.slice();
  const edges = map.edges.slice();
  const nodePos = new Map(map.nodes.map((n) => [n.id, n.position]));

  // Place new nodes as a tidy child column under their parent, reusing the
  // v1 auto-layout spacing so the canvas reads naturally after apply.
  for (const a of ctx.plan.addNodes) {
    // A prior attempt may have committed the atomic mindmap write and then
    // crashed before saving the Proposal receipt. Stable changeId provenance
    // makes retry a no-op instead of duplicating the node.
    if (nodes.some((node) => node.provenance?.proposalId === ctx.proposal.id && node.provenance?.changeId === a.changeId)) continue;
    const parent = nodePos.get(a.parentId) ?? { x: 0, y: 0 };
    const siblingCount = edges.filter((e) => e.source === a.parentId).length;
    const id = `node_${ulid()}`;
    const entityRef = a.entityRefType ? ctx.entities.get(a.changeId) : undefined;
    const node: MindMapNode = {
      id,
      text: a.text,
      note: a.note,
      kind: a.kind as MindMapNode['kind'],
      position: { x: parent.x + 140, y: parent.y + 104 * (siblingCount + 1) },
      ...(entityRef
        ? { entityRefs: [{ type: entityRef.type, id: entityRef.id }], provenance: { origin: 'ai' as const, proposalId: ctx.proposal.id, agentRunId: ctx.proposal.agentRunId, changeId: a.changeId, acceptedAt: new Date().toISOString() } }
        : { provenance: { origin: 'ai' as const, proposalId: ctx.proposal.id, agentRunId: ctx.proposal.agentRunId, changeId: a.changeId, acceptedAt: new Date().toISOString() } }),
    };
    nodes.push(node);
    nodePos.set(id, node.position);
    edges.push({ id: `edge_${ulid()}`, source: a.parentId, target: id });
  }

  for (const u of ctx.plan.updateNodes) {
    const n = nodes.find((n) => n.id === u.nodeId);
    if (!n) continue;
    if (u.patch.text) n.text = u.patch.text;
    if (u.patch.note) n.note = u.patch.note;
    if (u.patch.kind) n.kind = u.patch.kind as MindMapNode['kind'];
  }

  // Move re-attaches the child edge to the new parent (edge source = parent).
  for (const m of ctx.plan.moveNodes) {
    const e = edges.find((e) => e.target === m.nodeId);
    if (e) e.source = m.newParentId;
  }

  for (const link of ctx.plan.linkEntities) {
    const node = nodes.find((item) => item.id === link.nodeId);
    if (!node) continue;
    const exists = (node.entityRefs ?? []).some((ref) => ref.type === link.entityRef.type && ref.id === link.entityRef.id);
    if (!exists) node.entityRefs = [...(node.entityRefs ?? []), link.entityRef as NonNullable<MindMapNode['entityRefs']>[number]];
  }

  await updateMindMap(ctx.scope.mindmapId, { nodes, edges });
}
