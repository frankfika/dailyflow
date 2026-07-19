/**
 * Memory / Search service (Phase 4 — basic version).
 *
 * Spec §7.4 / §15.4:
 *   - Structured relationships first.
 *   - Then metadata filters.
 *   - Then full-text on title/body/quote/notes.
 *   - Returns answer with evidence and source IDs; never claims "I don't know"
 *     when results exist; never returns a file path without a snippet.
 *
 * This implementation is the **minimum** v1 of the memory service: it walks
 * the markdown tree, indexes every entity, and serves /memory/search and
 * /memory/context. It does not require an embedding model and never sends
 * the full workspace to a model — it sends only the top-K candidates the
 * context builder selects.
 */
import { V2Repository } from '../../repositories/v2/repository.js';
import type { Commitment, Project, Person, Decision, Outcome, SourceItem } from '../../domain/v2/types.js';

export interface MemorySearchHit {
  type: string;
  id: string;
  title: string;
  snippet: string;
  score: number;
  sourceIds: string[];
  evidenceIds: string[];
}

export interface MemorySearchResult {
  query: string;
  hits: MemorySearchHit[];
  usedSourceIds: string[];
}

const SNIPPET_RADIUS = 80;

export async function search(repo: V2Repository, query: string, limit = 20): Promise<MemorySearchResult> {
  const q = query.trim().toLowerCase();
  if (!q) return { query, hits: [], usedSourceIds: [] };

  const commitments = await repo.listCommitments();
  const projects = await repo.listProjects();
  const people = await repo.listPeople();
  const decisions = await repo.listDecisions();
  const outcomes = await repo.listOutcomes();
  const sources = await repo.listSourceItems();

  const candidates: MemorySearchHit[] = [];
  const usedSourceIds = new Set<string>();

  const addHit = (entity: { id?: string; sourceIds?: string[]; evidenceIds?: string[] }, type: string, title: string, snippetSource: string | undefined, scoreBase: number) => {
    const lower = (title + '\n' + (snippetSource ?? '')).toLowerCase();
    let score = 0;
    if (lower.includes(q)) score = scoreBase + 10;
    // Token overlap
    const tokens = q.split(/\s+/).filter(Boolean);
    for (const t of tokens) {
      if (t.length < 2) continue;
      if (lower.includes(t)) score += 2;
    }
    if (score <= 0) return;
    const snippet = extractSnippet(snippetSource ?? title, q);
    if (!entity.id) return;
    candidates.push({
      type,
      id: entity.id,
      title,
      snippet,
      score,
      sourceIds: entity.sourceIds ?? [],
      evidenceIds: entity.evidenceIds ?? [],
    });
    for (const sid of entity.sourceIds ?? []) usedSourceIds.add(sid);
  };

  for (const c of commitments) {
    addHit(c, 'commitment', c.title, c.outcome, 6);
  }
  for (const p of projects) {
    addHit(p, 'project', p.name, p.objective, 4);
  }
  for (const person of people) {
    addHit(person, 'person', person.displayName, person.relationshipNotes, 5);
  }
  for (const d of decisions) {
    addHit(d, 'decision', d.title, `${d.decision}\n${d.rationale ?? ''}`, 7);
  }
  for (const o of outcomes) {
    addHit(o, 'outcome', o.summary, o.summary, 4);
  }
  for (const s of sources) {
    addHit(s, 'source', s.title ?? s.body?.slice(0, 80) ?? 'Source', s.body, 3);
  }

  candidates.sort((a, b) => b.score - a.score);
  return {
    query,
    hits: candidates.slice(0, limit),
    usedSourceIds: Array.from(usedSourceIds),
  };
}

function extractSnippet(text: string, q: string): string {
  if (!text) return '';
  const lower = text.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx === -1) return text.slice(0, SNIPPET_RADIUS * 2);
  const start = Math.max(0, idx - SNIPPET_RADIUS);
  const end = Math.min(text.length, idx + q.length + SNIPPET_RADIUS);
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

export interface ContextBundle {
  commitment: Commitment;
  related: {
    project?: Project;
    person?: Person;
    /** Decisions linked through shared evidence IDs. */
    decisions: Decision[];
    outcomes: Outcome[];
    sourceItems: SourceItem[];
    /** Evidence for this commitment (for §26 step 5 / step 10). */
    evidence: import('../../domain/v2/types.js').Evidence[];
  };
}

export async function getContext(repo: V2Repository, commitmentId: string): Promise<ContextBundle | null> {
  const c = await repo.getCommitment(commitmentId);
  if (!c) return null;
  const projects = c.projectId ? (await repo.listProjects()).filter(p => p.id === c.projectId) : [];
  const people = c.ownerId || c.beneficiaryId
    ? (await repo.listPeople()).filter(p => p.id === c.ownerId || p.id === c.beneficiaryId)
    : [];
  const allDecisions = await repo.listDecisions();
  // Spec §7.5 / §15.4: a decision is "related" when it shares evidence
  // or sources with the commitment. This is the primary link between
  // meeting context and the work that flows out of it.
  const decisionEvidence = new Set(c.evidenceIds);
  const relatedDecisions = allDecisions
    .filter(d => {
      if (d.evidenceIds.some(eid => decisionEvidence.has(eid))) return true;
      if (d.projectId && d.projectId === c.projectId) return true;
      return false;
    })
    .slice(0, 10);
  const allOutcomes = (await repo.listOutcomes()).filter(o => o.commitmentId === c.id);
  const allSources = (await repo.listSourceItems()).filter(s => c.sourceIds.includes(s.id));
  const allEvidence = await repo.listEvidence();
  const evidence = allEvidence.filter(e => c.evidenceIds.includes(e.id));
  return {
    commitment: c,
    related: {
      project: projects[0],
      person: people[0],
      decisions: relatedDecisions,
      outcomes: allOutcomes,
      sourceItems: allSources,
      evidence,
    },
  };
}
