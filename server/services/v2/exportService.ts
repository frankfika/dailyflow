/**
 * Export / MCP / sync (Phase 9 — first slice).
 *
 * Spec §9 + §19 (Phase 9): "本地/私有同步策略" and "MCP 只读出口".
 *
 * We provide a small MCP-shaped read-only API for the v2 data. The
 * surface is intentionally narrow:
 *   - list_entities(kind, since?)
 *   - get_entity(kind, id)
 *   - search(query)
 *
 * All responses include the workspaceId and the source / evidence
 * references so the consumer can verify provenance.
 *
 * For now the responses are JSON; the SDK can be wired up to a real
 * MCP transport (stdio / sse) in a follow-up.
 */
import { V2Repository } from '../../repositories/v2/repository.js';
import { search } from './memoryService.js';

export type EntityKind =
  | 'source'
  | 'commitment'
  | 'outcome'
  | 'project'
  | 'person'
  | 'decision'
  | 'plan'
  | 'evidence';

export interface ExportEntity<T = unknown> {
  kind: EntityKind;
  id: string;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
  data: T;
  sourceIds: string[];
  evidenceIds: string[];
}

export interface ListOpts {
  since?: string;
  limit?: number;
}

export async function listEntities(
  repo: V2Repository,
  kind: EntityKind,
  opts: ListOpts = {}
): Promise<ExportEntity[]> {
  const limit = Math.min(500, opts.limit ?? 100);
  const since = opts.since ? new Date(opts.since).getTime() : 0;
  const filter = (updated: string) => since === 0 || new Date(updated).getTime() >= since;

  const wrap = (e: {
    id: string;
    workspaceId: string;
    createdAt: string;
    updatedAt: string;
    sourceIds?: string[];
    evidenceIds?: string[];
  }): ExportEntity => ({
    kind,
    id: e.id,
    workspaceId: e.workspaceId,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    data: e,
    sourceIds: e.sourceIds ?? [],
    evidenceIds: e.evidenceIds ?? [],
  });

  switch (kind) {
    case 'source': {
      const items = (await repo.listSourceItems()).filter(s => filter(s.updatedAt)).slice(0, limit);
      return items.map(wrap);
    }
    case 'commitment': {
      const items = (await repo.listCommitments()).filter(c => filter(c.updatedAt)).slice(0, limit);
      return items.map(wrap);
    }
    case 'outcome': {
      const items = (await repo.listOutcomes()).filter(o => filter(o.updatedAt)).slice(0, limit);
      return items.map(wrap);
    }
    case 'project': {
      const items = (await repo.listProjects()).filter(p => filter(p.updatedAt)).slice(0, limit);
      return items.map(wrap);
    }
    case 'person': {
      const items = (await repo.listPeople()).filter(p => filter(p.updatedAt)).slice(0, limit);
      return items.map(wrap);
    }
    case 'decision': {
      const items = (await repo.listDecisions()).filter(d => filter(d.updatedAt)).slice(0, limit);
      return items.map(wrap);
    }
    case 'plan': {
      const today = new Date().toISOString().slice(0, 10);
      const p = await repo.getPlanByDate(today);
      if (!p) return [];
      return [wrap(p as unknown as Parameters<typeof wrap>[0])];
    }
    case 'evidence': {
      const items = (await repo.listEvidence()).filter(e => filter(e.updatedAt)).slice(0, limit);
      return items.map(wrap);
    }
  }
}

export async function getEntity(
  repo: V2Repository,
  kind: EntityKind,
  id: string
): Promise<ExportEntity | null> {
  switch (kind) {
    case 'source': {
      const s = await repo.getSourceItem(id);
      if (!s) return null;
      return {
        kind, id: s.id, workspaceId: s.workspaceId,
        createdAt: s.createdAt, updatedAt: s.updatedAt,
        data: s, sourceIds: [], evidenceIds: [],
      };
    }
    case 'commitment': {
      const c = await repo.getCommitment(id);
      if (!c) return null;
      return {
        kind, id: c.id, workspaceId: c.workspaceId,
        createdAt: c.createdAt, updatedAt: c.updatedAt,
        data: c, sourceIds: c.sourceIds, evidenceIds: c.evidenceIds,
      };
    }
    case 'plan': {
      const day = id.split('T')[0]!;
      const p = await repo.getPlanByDate(day);
      if (!p) return null;
      return {
        kind, id: p.id, workspaceId: p.workspaceId,
        createdAt: p.createdAt, updatedAt: p.updatedAt,
        data: p, sourceIds: [], evidenceIds: [],
      };
    }
  }
  return null;
}

export async function searchEntities(repo: V2Repository, q: string) {
  const r = await search(repo, q, 50);
  return r;
}
