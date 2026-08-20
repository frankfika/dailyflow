/**
 * Memory service — 3-tier ranking (gap 4).
 *
 * Spec §7.4 / §15.4: search returns hits ranked structured → metadata →
 * fulltext. Each hit carries matchTier + tierReason. These tests pin
 * the tier boundaries and the tie-break rules so a future change to the
 * scoring curve can't silently regress the deck-06 demo.
 *
 * Implementation note: the v2 serializer writes `owner` / `beneficiary` /
 * `project` keys in frontmatter (not `owner_id` etc.), and the camelCase
 * deserializer doesn't restore them — so `ownerId`/`beneficiaryId`/
 * `projectId` round-trip as undefined. We exercise structured linking via
 * `evidenceIds`, `sourceIds`, and the cross-entity `commitmentIds` /
 * `projectIds` fields, which DO round-trip correctly.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { V2Repository } from '../../../repositories/v2/repository';
import { bootstrapV2 } from '../workspaceContext';
import { search } from '../memoryService';
import type { Commitment, Decision, NoteDocument, Person, Project, SourceItem } from '../../../domain/v2/types';

let workspace: string;
let repo: V2Repository;
let workspaceId: string;

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'df-v2-mem-'));
  const b = await bootstrapV2({ workspaceRoot: workspace, workspaceId: 'ws_mem' });
  repo = b.repo;
  workspaceId = b.ctx.workspaceId;
});

afterEach(async () => {
  // Some tests seed 1000+ entities via atomic write; the OS sometimes
  // keeps an inode pinned briefly. Best-effort cleanup.
  await fs.rm(workspace, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
});

// ---------------------------------------------------------------------------
// Entity builders — kept tiny and inline so the test reads top-to-bottom.
// ---------------------------------------------------------------------------
function baseMeta(id: string, extra: Partial<{ createdBy: 'user' | 'ai' | 'connector' | 'migration' }> = {}) {
  return {
    id,
    schemaVersion: 1 as const,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    createdBy: extra.createdBy ?? 'user',
    workspaceId,
  };
}

async function savePerson(id: string, displayName: string): Promise<Person> {
  const person: Person = {
    ...baseMeta(id),
    displayName,
    aliases: [],
  };
  await repo.savePerson(person);
  return person;
}

async function saveSource(id: string, title: string, body: string): Promise<SourceItem> {
  const s: SourceItem = {
    ...baseMeta(id),
    kind: 'quick_capture',
    title,
    body,
    contentHash: 'h'.repeat(32),
    processingStatus: 'saved',
  };
  await repo.saveSourceItem(s);
  return s;
}

async function saveProject(id: string, name: string, commitmentIds: string[] = []): Promise<Project> {
  const project: Project = {
    ...baseMeta(id),
    name,
    objective: `objective of ${name}`,
    successCriteria: [],
    state: 'active',
    commitmentIds,
    decisionIds: [],
    sourceIds: [],
  };
  await repo.saveProject(project);
  return project;
}

async function saveCommitment(
  id: string,
  title: string,
  outcome: string,
  extra: Partial<Commitment> = {},
): Promise<Commitment> {
  const c: Commitment = {
    ...baseMeta(id),
    title,
    outcome,
    state: 'active',
    evidenceIds: [],
    sourceIds: [],
    ...extra,
  };
  await repo.saveCommitment(c);
  return c;
}

async function saveDecision(
  id: string,
  title: string,
  decision: string,
  extra: Partial<Decision> = {},
): Promise<Decision> {
  const d: Decision = {
    ...baseMeta(id),
    title,
    decision,
    decidedAt: '2026-08-01T00:00:00.000Z',
    participantIds: [],
    evidenceIds: [],
    ...extra,
  };
  await repo.saveDecision(d);
  return d;
}

async function saveNote(
  id: string,
  body: string,
  extra: Partial<NoteDocument> = {},
): Promise<NoteDocument> {
  const n: NoteDocument = {
    ...baseMeta(id),
    body,
    kind: 'general',
    state: 'active',
    projectIds: [],
    personIds: [],
    sourceIds: [],
    pinned: false,
    autoSaveVersion: 1,
    contentHash: 'h'.repeat(32),
    commitmentIds: [],
    ...extra,
  };
  await repo.saveNoteDocument(n);
  return n;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('memoryService.search — 3-tier ranking', () => {
  it('Tier 1 (structured): note that links to a commitment surfaces when query matches the linked id', async () => {
    // Seed the link target: a commitment with id "com_onboard_q3_...".
    const commitmentId = 'com_onboard_q3_2026abcdef';
    await saveCommitment(
      commitmentId,
      'Onboard new Q3 customers',
      'New customers receive welcome email within 24h.',
    );
    // A note whose commitmentIds contains the commitment id → structured match.
    const structured = await saveNote(
      'note_linked_2026abcdef',
      'This is the structured-link note. It links to the onboarding commitment.',
      { commitmentIds: [commitmentId] },
    );
    // A note whose title contains the query → metadata match.
    const metadataOnly = await saveNote(
      'note_metaonly_2026abcdef',
      'Yesterday we talked about onboarding at the standup.',
      { title: 'Onboard standup notes' },
    );
    // A note whose body contains the query but no title and no link → fulltext.
    const fulltextOnly = await saveNote(
      'note_bodyonly_2026abcdef',
      'Random body that mentions onboarding once for fulltext scoring.',
    );

    const result = await search(repo, 'onboard');

    expect(result.hits.length).toBeGreaterThanOrEqual(3);
    const tiers = result.hits.map(h => h.matchTier);
    const firstStructured = tiers.indexOf('structured');
    const firstMetadata = tiers.indexOf('metadata');
    const firstFulltext = tiers.indexOf('fulltext');
    expect(firstStructured).toBeGreaterThanOrEqual(0);
    expect(firstMetadata).toBeGreaterThan(firstStructured);
    expect(firstFulltext).toBeGreaterThan(firstMetadata);

    // The structured hit is the note that links to the commitment.
    const structuredHit = result.hits.find(h => h.id === structured.id);
    expect(structuredHit?.matchTier).toBe('structured');
    expect(structuredHit?.tierReason).toMatch(/onboard/);

    // Metadata-only hit landed in tier 2.
    expect(result.hits.find(h => h.id === metadataOnly.id)?.matchTier).toBe('metadata');
    // Fulltext-only hit landed in tier 3.
    expect(result.hits.find(h => h.id === fulltextOnly.id)?.matchTier).toBe('fulltext');
  });

  it('Tier 2 (metadata): title/state hits rank above body-only hits', async () => {
    // Note title contains the query (metadata), but its body does not.
    // Use a body whose first non-empty line does NOT match the query so the
    // title-fallback trick can't promote it into tier 2.
    const titled = await saveNote('note_titled_2026abcdef', 'Meeting minutes are in the daily note.', {
      title: 'Pricing roadmap review',
      kind: 'project',
    });
    // Body-only match (fulltext). First line contains "pricing", so the
    // body fallback would *not* surface it as metadata — which is the
    // assertion we want. We deliberately start the body with an unrelated
    // heading so the body content stays in tier 3.
    const bodyOnly = await saveNote(
      'note_bodyonly_2026abcdef',
      '# Standup 2026-08-01\n\nWe discussed the pricing roadmap briefly today.',
    );

    const result = await search(repo, 'pricing');

    expect(result.hits.length).toBe(2);
    const titledHit = result.hits.find(h => h.id === titled.id);
    const bodyHit = result.hits.find(h => h.id === bodyOnly.id);
    expect(titledHit?.matchTier).toBe('metadata');
    expect(bodyHit?.matchTier).toBe('fulltext');
    // Metadata hit comes first regardless of exact score.
    expect(result.hits[0].id).toBe(titled.id);
    expect(result.hits[0].matchTier).toBe('metadata');
  });

  it('Tier 3 (fulltext): body substring matches land in tier 3 with a populated reason', async () => {
    const note = await saveNote(
      'note_fulltext_2026abcdef',
      '# Daily log\n\nA long note about the onboarding flow and trial signup funnel.',
    );
    const result = await search(repo, 'onboarding');

    const hit = result.hits.find(h => h.id === note.id);
    expect(hit).toBeDefined();
    expect(hit?.matchTier).toBe('fulltext');
    expect(hit?.tierReason).toMatch(/onboarding/);
    expect(hit?.score).toBeGreaterThanOrEqual(10); // base 10 + intra-tier bonus
  });

  it('Mixed tier ranking: structured beats metadata beats fulltext, intra-tier by score', async () => {
    // Seed the link target: id deliberately contains the query token so
    // that "lightStructured" can match via its commitmentIds link.
    const commitmentId = 'com_onboard_root_2026abcdef';
    await saveCommitment(commitmentId, 'Anchor', 'Anchor outcome.');

    // 1. Structured tier — two notes whose commitmentIds link to the
    //    anchor. "richStructured" also tags itself with "q3" so the
    //    multi-token query "onboard q3" matches more link ids → higher
    //    intra-tier score. "lightStructured" only links once.
    const richStructured = await saveNote(
      'note_rich_2026abcdef',
      '# Rich\n\nBody content unrelated to query tokens.',
      {
        commitmentIds: [commitmentId],
        tagIds: ['q3'],
      },
    );
    const lightStructured = await saveNote(
      'note_light_2026abcdef',
      '# Light\n\nBody content unrelated to query tokens.',
      { commitmentIds: [commitmentId] },
    );

    // 2. Metadata tier — a project whose name contains the query.
    const meta = await saveProject('prj_meta_2026abcdef', 'Onboard Onboard', []);

    // 3. Fulltext tier — a note whose body only mentions the query.
    const body = await saveNote(
      'note_mix_2026abcdef',
      '# Daily log\n\nOnboarding doc lives in the team wiki.',
    );

    const result = await search(repo, 'onboard q3');

    // Sanity: we see all three categories.
    const tiers = new Set(result.hits.map(h => h.matchTier));
    expect(tiers.has('structured')).toBe(true);
    expect(tiers.has('metadata')).toBe(true);
    expect(tiers.has('fulltext')).toBe(true);

    // Structured comes first; the richer commitment beats the lighter one.
    const richIdx = result.hits.findIndex(h => h.id === richStructured.id);
    const lightIdx = result.hits.findIndex(h => h.id === lightStructured.id);
    expect(richIdx).toBeGreaterThanOrEqual(0);
    expect(lightIdx).toBeGreaterThanOrEqual(0);
    expect(richIdx).toBeLessThan(lightIdx);

    // The first metadata-tier hit sits below all structured hits.
    const firstMetadataIdx = result.hits.findIndex(h => h.matchTier === 'metadata');
    const lastStructuredIdx = result.hits
      .map((h, i) => (h.matchTier === 'structured' ? i : -1))
      .filter(i => i >= 0)
      .pop();
    expect(lastStructuredIdx).toBeDefined();
    expect(firstMetadataIdx).toBeGreaterThan(lastStructuredIdx!);

    // Fulltext hit sits below the metadata hit.
    const bodyIdx = result.hits.findIndex(h => h.id === body.id);
    expect(bodyIdx).toBeGreaterThan(firstMetadataIdx);

    // Sanity: tier reasons are populated for every tier.
    for (const hit of result.hits) {
      expect(hit.tierReason.length).toBeGreaterThan(0);
    }
  });

  it('Empty / whitespace query returns no hits without throwing', async () => {
    // Seed something so an empty-query still iterating the repo wouldn't be
    // an accidental false-pass.
    await saveCommitment('com_seed_2026abcdef', 'Seed', 'Seed outcome.');

    const empty = await search(repo, '');
    expect(empty.hits).toEqual([]);
    expect(empty.usedSourceIds).toEqual([]);

    const whitespace = await search(repo, '   ');
    expect(whitespace.hits).toEqual([]);

    // Single-char tokens are filtered (length < 2). The contract we care
    // about is that no throws occur and tier assignment stays consistent.
    const oneChar = await search(repo, 'a');
    for (const hit of oneChar.hits) {
      expect(['structured', 'metadata', 'fulltext']).toContain(hit.matchTier);
    }
  });

  it('Performance: 1000 entities finish under 500ms', async () => {
    // Stress-test the tier machinery end-to-end. We seed 250 commitments,
    // 250 notes, 250 sources, 250 projects — and confirm the search wall
    // time stays well inside the 500ms budget. The budget applies to the
    // search call only; the seeding I/O is excluded from the assertion.
    const N = 250;
    for (let i = 0; i < N; i++) {
      const padded = i.toString().padStart(4, '0');
      await saveCommitment(
        `com_p_${padded}_2026abcdef`,
        `Commitment number ${i} with assorted noise ${i * 7}`,
        `Outcome ${i}: deliver thing ${i} by the deadline.`,
      );
      await saveNote(
        `note_p_${padded}_2026abcdef`,
        `# Daily log ${i}\n\nNote body ${i} containing some searchable content for benchmarking.`,
      );
      await saveSource(
        `src_p_${padded}_2026abcdef`,
        `Source ${i}`,
        `Source body ${i} also has content we want to find.`,
      );
      await saveProject(`prj_p_${padded}_2026abcdef`, `Project ${i}`, []);
    }

    const t0 = Date.now();
    // 500 of the 1000 entities (250 notes + 250 sources) match "content"
    // with the same score; alphabetical tiebreak orders them note-first.
    // We need a limit large enough to push past the notes so the
    // sources assertion below can find sources too.
    const result = await search(repo, 'content', 600);
    const elapsed = Date.now() - t0;

    expect(elapsed).toBeLessThan(500);
    // "content" appears in every note body and every source body, so we
    // expect both kinds to be present and tiered correctly.
    const notes = result.hits.filter(h => h.type === 'note');
    const sources = result.hits.filter(h => h.type === 'source');
    expect(notes.length).toBeGreaterThan(0);
    expect(sources.length).toBeGreaterThan(0);
    // Notes have no stored title and the body doesn't start with "content"
    // (we used a heading first), so they should land in fulltext.
    for (const h of notes) expect(h.matchTier).toBe('fulltext');
    // Sources' body matches and titles don't contain "content".
    for (const h of sources) expect(h.matchTier).toBe('fulltext');
  }, 30_000); // seeding is IO-bound; allow 30s for the whole test
});
