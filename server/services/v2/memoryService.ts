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
 * Phase-1 memory search (this file) is the minimum viable ranking:
 *
 *   Tier 1 (structured, base 50) — query token matches a linked id
 *     (commitment.linkedProjectId/ownerId/waitingOnId, note.linkedCommitmentIds,
 *     project.linkedCommitmentIds/decisionIds, etc.). Highest weight: when the
 *     user types an ID or part of one, we surface every entity that references
 *     it first. This is the "ask me about anything I've seen" story.
 *
 *   Tier 2 (metadata, base 30) — title / tag / state / date / owner.
 *     Weighted within the tier: title match is strongest, then tag/state,
 *     then owner/date.
 *
 *   Tier 3 (fulltext, base 10) — body / decision / rationale / notes body.
 *     Last-resort substring match.
 *
 * Each hit carries matchTier + tierReason so the UI can highlight structured
 * hits ("关联") above metadata hits ("标签") above fulltext hits ("全文").
 * Within a tier, hits are ordered by score descending. Across tiers the order
 * is always structured → metadata → fulltext.
 */
import { V2Repository } from '../../repositories/v2/repository.js';
import type { Commitment, Project, Person, Decision, Outcome, SourceItem, NoteDocument } from '../../domain/v2/types.js';

/**
 * The three ranking tiers. Order matters: lower index = higher priority.
 * The UI badge colour and label is derived from this string.
 */
export type SearchMatchTier = 'structured' | 'metadata' | 'fulltext';

/**
 * Tier priority for the comparator. Numeric so we can sort without enum gymnastics.
 */
export const TIER_PRIORITY: Record<SearchMatchTier, number> = {
  structured: 0,
  metadata: 1,
  fulltext: 2,
};

export interface MemorySearchHit {
  type: string;
  id: string;
  title: string;
  snippet: string;
  score: number;
  sourceIds: string[];
  evidenceIds: string[];
  /** Which ranking tier produced this hit. */
  matchTier: SearchMatchTier;
  /** Human-readable reason this hit landed in this tier (debug + UI tooltip). */
  tierReason: string;
}

export interface MemorySearchResult {
  query: string;
  hits: MemorySearchHit[];
  usedSourceIds: string[];
}

// ---------------------------------------------------------------------------
// Score bases per spec (gap 4). Anything that makes it into a tier adds
// intra-tier weight on top of these.
// ---------------------------------------------------------------------------
const SCORE_BASE_STRUCTURED = 50;
const SCORE_BASE_METADATA = 30;
const SCORE_BASE_FULLTEXT = 10;
const SNIPPET_RADIUS = 80;

interface Rankable {
  type: string;
  id: string;
  /** Display title — always populated, may fall back to the first body line. */
  title: string;
  /** Stored title only — empty when the entity has no schema-level title.
   *  This is what metadata scoring uses; we never want body content leaking
   *  into tier 2 because of the fallback. */
  realTitle: string;
  snippetSource: string;
  linkIds: string[];        // IDs this entity points at (people, projects, commitments, evidence, sources, tags…)
  metaFields: string;       // Concatenated metadata text (realTitle, state, tag labels, owner IDs, dates).
  bodyText: string;         // The "fulltext" corpus — body, decision text, summary, etc.
  sourceIds: string[];
  evidenceIds: string[];
}

/**
 * Build a normalized, lowercased blob used by the metadata tier.
 * Includes type, status / state, tag ids (treated as labels), owner / beneficiary
 * IDs and the ISO date strings (so "2026-08" matches anything created in August).
 */
function buildMetaFields(parts: Array<string | undefined | null>): string {
  return parts.filter(Boolean).map(p => String(p)).join('\n').toLowerCase();
}

function toRankableCommitment(c: Commitment): Rankable {
  const linkIds = [
    c.projectId,
    c.ownerId,
    c.beneficiaryId,
    c.waitingOnId,
    c.legacyTaskId,
    c.outcomeId,
    ...c.evidenceIds,
    ...c.sourceIds,
    ...(c.tagIds ?? []),
  ].filter(Boolean) as string[];
  return {
    type: 'commitment',
    id: c.id,
    title: c.title,
    realTitle: c.title,
    snippetSource: c.outcome ?? c.title,
    linkIds,
    metaFields: buildMetaFields([
      c.title,
      c.outcome,
      c.state,
      c.importance,
      c.energy,
      c.ownerId,
      c.beneficiaryId,
      c.dueAt,
      c.completedAt,
      ...(c.tagIds ?? []),
    ]),
    bodyText: `${c.title}\n${c.outcome ?? ''}\n${c.nextAction ?? ''}`,
    sourceIds: c.sourceIds,
    evidenceIds: c.evidenceIds,
  };
}

function toRankableProject(p: Project): Rankable {
  const linkIds = [
    p.ownerId,
    ...p.commitmentIds,
    ...p.decisionIds,
    ...p.sourceIds,
  ].filter(Boolean) as string[];
  return {
    type: 'project',
    id: p.id,
    title: p.name,
    realTitle: p.name,
    snippetSource: p.objective ?? p.name,
    linkIds,
    metaFields: buildMetaFields([
      p.name,
      p.objective,
      p.state,
      p.ownerId,
      p.targetAt,
      ...p.successCriteria,
    ]),
    bodyText: `${p.name}\n${p.objective ?? ''}\n${p.successCriteria.join('\n')}`,
    sourceIds: p.sourceIds,
    evidenceIds: [],
  };
}

function toRankablePerson(p: Person): Rankable {
  const linkIds = [p.organizationId, ...p.aliases].filter(Boolean) as string[];
  return {
    type: 'person',
    id: p.id,
    title: p.displayName,
    realTitle: p.displayName,
    snippetSource: p.relationshipNotes ?? p.displayName,
    linkIds,
    metaFields: buildMetaFields([
      p.displayName,
      ...p.aliases,
      p.organizationId,
    ]),
    bodyText: p.relationshipNotes ?? p.displayName,
    sourceIds: [],
    evidenceIds: [],
  };
}

function toRankableDecision(d: Decision): Rankable {
  const linkIds = [
    d.projectId,
    d.supersedesId,
    ...d.participantIds,
    ...d.evidenceIds,
  ].filter(Boolean) as string[];
  return {
    type: 'decision',
    id: d.id,
    title: d.title,
    realTitle: d.title,
    snippetSource: `${d.decision}\n${d.rationale ?? ''}`,
    linkIds,
    metaFields: buildMetaFields([
      d.title,
      d.decision,
      d.projectId,
      ...d.participantIds,
      d.decidedAt,
    ]),
    bodyText: `${d.title}\n${d.decision}\n${d.rationale ?? ''}`,
    sourceIds: [],
    evidenceIds: d.evidenceIds,
  };
}

function toRankableOutcome(o: Outcome): Rankable {
  const linkIds = [
    o.commitmentId,
    ...o.followUpCommitmentIds,
    ...o.evidenceIds,
  ].filter(Boolean) as string[];
  return {
    type: 'outcome',
    id: o.id,
    title: o.summary,
    realTitle: o.summary,
    snippetSource: o.summary,
    linkIds,
    metaFields: buildMetaFields([
      o.summary,
      o.kind,
      o.commitmentId,
      ...o.followUpCommitmentIds,
    ]),
    bodyText: o.summary,
    sourceIds: [],
    evidenceIds: o.evidenceIds,
  };
}

function toRankableSource(s: SourceItem): Rankable {
  const title = s.title ?? s.body?.slice(0, 80) ?? 'Source';
  return {
    type: 'source',
    id: s.id,
    title,
    realTitle: s.title ?? '',
    snippetSource: s.body ?? title,
    linkIds: [], // SourceItem is the leaf in the graph — nothing points *from* it in the spec.
    metaFields: buildMetaFields([
      s.title ?? '',
      s.kind,
      s.processingStatus,
      s.occurredAt,
      s.language,
    ]),
    bodyText: `${title}\n${s.body ?? ''}`,
    sourceIds: [],
    evidenceIds: [],
  };
}

function toRankableNote(n: NoteDocument): Rankable {
  const title = n.title ?? n.body?.split('\n').find(l => l.trim().length > 0)?.slice(0, 80) ?? 'Note';
  // spec §26 step 19: notes surface in memory search. Their linkable ids are the
  // commitments / projects / persons / sources / tags they reference.
  const linkIds = [
    ...n.commitmentIds,
    ...n.projectIds,
    ...n.personIds,
    ...n.sourceIds,
    ...(n.tagIds ?? []),
  ].filter(Boolean) as string[];
  // For metadata scoring we MUST use the stored title only. The fallback
  // (`title` above) is for UI display and would otherwise leak the first
  // body line into tier 2.
  const realTitle = n.title ?? '';
  return {
    type: 'note',
    id: n.id,
    title,
    realTitle,
    snippetSource: n.body ?? title,
    linkIds,
    metaFields: buildMetaFields([
      realTitle,
      n.kind,
      n.state,
      n.date,
      ...(n.tagIds ?? []),
    ]),
    bodyText: n.body ?? '',
    sourceIds: n.sourceIds,
    evidenceIds: [],
  };
}

// ---------------------------------------------------------------------------
// Per-tier scorers. Each returns { score, reason } or null if the entity
// does not match at all in this tier. Tier 1 wins over Tier 2 wins over
// Tier 3 — we run them in order and take the first non-null result.
// ---------------------------------------------------------------------------

interface TierScore {
  score: number;
  reason: string;
}

/**
 * Tier 1 — structured (linked ids).
 *
 * Match if any whitespace-separated token from the query is a
 * case-insensitive substring of any linked id. ULIDs are 26-char base32,
 * so this surfaces anything the user typed as an ID prefix; we also
 * accept person-name aliases (which appear in `linkIds` via the Person
 * rankable), so "Alex" matches every commitment that has Alex as owner
 * or beneficiary.
 */
function scoreStructured(r: Rankable, tokens: string[]): TierScore | null {
  if (r.linkIds.length === 0) return null;
  const lowered = r.linkIds.map(id => id.toLowerCase());
  const matches: string[] = [];
  for (const tok of tokens) {
    if (tok.length < 2) continue;
    for (const id of lowered) {
      if (id.includes(tok)) {
        matches.push(tok);
        break;
      }
    }
  }
  if (matches.length === 0) return null;
  // More matches → higher intra-tier score, capped at +10.
  const bonus = Math.min(10, matches.length * 2);
  return {
    score: SCORE_BASE_STRUCTURED + bonus,
    reason: `linked id contains "${matches.join('", "')}"`,
  };
}

/**
 * Tier 2 — metadata (title / state / tag / date / owner).
 *
 * Weighted match inside the tier: title hit counts as +5 (the spec's
 * "加权匹配"), other metadata +3 per token. Substring match — same
 * semantics as v0 so we don't regress coverage.
 */
function scoreMetadata(r: Rankable, rawQuery: string, tokens: string[]): TierScore | null {
  const haystack = r.metaFields;
  if (!haystack) return null;
  let score = 0;
  const reasons: string[] = [];
  // Whole-query match is the strongest metadata signal.
  if (rawQuery.length >= 2 && haystack.includes(rawQuery)) {
    score += 8;
    reasons.push(`query="${rawQuery}"`);
  }
  // Title boost: only score against the *stored* title (realTitle) so
  // body-derived fallback titles don't leak body content into tier 2.
  const titleLower = r.realTitle.toLowerCase();
  for (const t of tokens) {
    if (t.length < 2) continue;
    if (titleLower && titleLower.includes(t)) {
      score += 5;
      reasons.push(`title∋"${t}"`);
    } else if (haystack.includes(t)) {
      score += 3;
      reasons.push(`meta∋"${t}"`);
    }
  }
  if (score === 0) return null;
  return { score: SCORE_BASE_METADATA + score, reason: reasons.join(', ') };
}

/**
 * Tier 3 — fulltext (body / decision / summary).
 *
 * Last-resort substring match. Preserves the v0 scoring curve so existing
 * callers that depended on body-only matching continue to behave.
 */
function scoreFulltext(r: Rankable, rawQuery: string, tokens: string[]): TierScore | null {
  const haystack = r.bodyText.toLowerCase();
  if (!haystack) return null;
  let score = 0;
  const reasons: string[] = [];
  if (rawQuery.length >= 2 && haystack.includes(rawQuery)) {
    score += 10;
    reasons.push(`body∋"${rawQuery}"`);
  }
  for (const t of tokens) {
    if (t.length < 2) continue;
    if (haystack.includes(t)) {
      score += 2;
      reasons.push(`body∋"${t}"`);
    }
  }
  if (score === 0) return null;
  return { score: SCORE_BASE_FULLTEXT + score, reason: reasons.join(', ') };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function search(repo: V2Repository, query: string, limit = 20): Promise<MemorySearchResult> {
  const q = query.trim().toLowerCase();
  if (!q) return { query, hits: [], usedSourceIds: [] };

  // Bulk-load all entities once. The repository walks markdown files
  // and is the single source of truth for ranking. Each `list*` call is
  // O(files-in-folder) so the total cost is roughly O(total-entities).
  const [
    commitments,
    projects,
    people,
    decisions,
    outcomes,
    sources,
    notes,
  ] = await Promise.all([
    repo.listCommitments(),
    repo.listProjects(),
    repo.listPeople(),
    repo.listDecisions(),
    repo.listOutcomes(),
    repo.listSourceItems(),
    repo.listNoteDocuments(),
  ]);

  const tokens = q.split(/\s+/).filter(Boolean);
  const usedSourceIds = new Set<string>();
  const hits: MemorySearchHit[] = [];

  const allRankable: Rankable[] = [
    ...commitments.map(toRankableCommitment),
    ...projects.map(toRankableProject),
    ...people.map(toRankablePerson),
    ...decisions.map(toRankableDecision),
    ...outcomes.map(toRankableOutcome),
    ...sources.map(toRankableSource),
    ...notes.map(toRankableNote),
  ];

  for (const r of allRankable) {
    if (!r.id) continue;
    // Tier order: structured > metadata > fulltext. First hit wins; we
    // never stack tiers because that would muddy the UI badge signal and
    // make the ranking reason不可解释.
    const tier =
      scoreStructured(r, tokens) ??
      scoreMetadata(r, q, tokens) ??
      scoreFulltext(r, q, tokens);
    if (!tier) continue;
    hits.push({
      type: r.type,
      id: r.id,
      title: r.title,
      snippet: extractSnippet(r.snippetSource ?? r.title, q),
      score: tier.score,
      sourceIds: r.sourceIds,
      evidenceIds: r.evidenceIds,
      matchTier: inferTier(tier.score),
      tierReason: tier.reason,
    });
    for (const sid of r.sourceIds) usedSourceIds.add(sid);
  }

  // Final ordering: tier priority (structured < metadata < fulltext) first,
  // then intra-tier score descending. Stable for ties.
  hits.sort((a, b) => {
    const tp = TIER_PRIORITY[a.matchTier] - TIER_PRIORITY[b.matchTier];
    if (tp !== 0) return tp;
    if (a.score !== b.score) return b.score - a.score;
    return a.id.localeCompare(b.id);
  });

  return {
    query,
    hits: hits.slice(0, limit),
    usedSourceIds: Array.from(usedSourceIds),
  };
}

/**
 * Derive the tier label from the score base. Used internally when the
 * tier wasn't passed through from the scorer (e.g. legacy callers).
 */
function inferTier(score: number): SearchMatchTier {
  if (score >= SCORE_BASE_STRUCTURED) return 'structured';
  if (score >= SCORE_BASE_METADATA) return 'metadata';
  return 'fulltext';
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

// ---------------------------------------------------------------------------
// Context bundle (unchanged from v0 — out of scope for gap 4 but kept here
// because the file is the canonical home for memory APIs).
// ---------------------------------------------------------------------------

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
