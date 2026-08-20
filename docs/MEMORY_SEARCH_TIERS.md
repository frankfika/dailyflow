# Memory Search — 3-Tier Ranking

> Gap 4 / P0 / Sprint 1 — see `docs/ROADSHOW_VS_PRODUCT_GAP.md` for context.

## What the user sees

When the user types a query into the Memory search bar, results are grouped
into three clearly-marked tiers so they can predict **why** a hit surfaced:

| Tier | Badge (zh / en) | Color | What it means |
| --- | --- | --- | --- |
| **structured** | 关联 / Link | blue | The query token matched a linked id — the user typed (a prefix of) something the entity *points at*. |
| **metadata** | 标签 / Tag | purple | The query matched a structured field — title, state, tag, date, owner. |
| **fulltext** | 全文 / Text | grey | The query matched free-form body / decision / summary text. Last-resort substring. |

Order is always **structured → metadata → fulltext**. Inside a tier, hits are
ordered by score, then by id (deterministic tie-break).

## Why three tiers, in this order

The deck-06 demo flow (slide 06 of the v2 roadshow) leans on this hierarchy:

1. **Structured first** so the user can ask "what was I working on with Alex?"
   and see every commitment, decision, and note that has Alex as owner /
   evidence / source — without us having to materialize an index.
2. **Metadata second** so that "Q3 plan" surfaces a project whose *name*
   matches, even if the body of every document only paraphrases the phrase.
3. **Fulltext last** as a safety net so we never return zero hits when a
   substring exists somewhere.

This mirrors the search semantics the spec calls out (§7.4 / §15.4):

> Structured relationships first. Then metadata filters. Then full-text on
> title/body/quote/notes.

## Implementation map

| Concern | File |
| --- | --- |
| Scoring + tier assignment | `server/services/v2/memoryService.ts` |
| Public types (`MemorySearchHit`, `SearchMatchTier`) | `server/services/v2/memoryService.ts` |
| HTTP route | `server/routes/v2/index.ts` (`GET /api/v2/memory/search`) |
| React client types | `src/features/v2/api/client.ts` (`MemoryHit`, `MemoryMatchTier`) |
| Tier badges + tier-aware sort | `src/features/v2/memory/MemoryView.tsx` |
| Tests | `server/services/v2/__tests__/memoryService.searchTier.test.ts` |

The repository contract — `V2Repository.listCommitments()`,
`listProjects()`, `listPeople()`, `listDecisions()`, `listOutcomes()`,
`listSourceItems()`, `listNoteDocuments()` — is unchanged. The ranking
runs entirely in memory after a single bulk read.

## Per-tier scoring

```
Tier 1 (structured)   base 50  + 2 × |matches|  (capped at +10)
Tier 2 (metadata)     base 30  + 8 (whole-query) + 5/title-token + 3/meta-token
Tier 3 (fulltext)     base 10  + 10 (whole-query) + 2/token
```

- **Structured matches** are tokens from the query that appear as a
  case-insensitive substring of any id the entity links to (see
  `Rankable.linkIds`). Each match contributes +2 to the intra-tier score.
- **Metadata matches** look at the *stored* title (`realTitle` — never the
  fallback), the entity state, tag ids (treated as labels), owner / project
  / waiting-on IDs, and the ISO date strings. Title hits are weighted +5 per
  token; other metadata hits +3.
- **Fulltext matches** fall back to substring search on the body / decision
  text / summary / note body.

A hit is assigned to the first tier that returns non-null and is never
promoted across tiers. We don't stack tiers because that would muddy the UI
badge and make "why is this ranked first?" unanswerable.

## `linkIds` — what counts as structured

For each entity, the structured tier considers the following ids:

| Entity | linkIds |
| --- | --- |
| `commitment` | `projectId`, `legacyTaskId`, `outcomeId`, `evidenceIds[]`, `sourceIds[]`, `tagIds[]` |
| `project` | `commitmentIds[]`, `decisionIds[]`, `sourceIds[]` |
| `person` | `aliases[]` (display-name aliases), `organizationId` |
| `decision` | `projectId`, `supersedesId`, `participantIds[]`, `evidenceIds[]` |
| `outcome` | `commitmentId`, `followUpCommitmentIds[]`, `evidenceIds[]` |
| `source` | (leaf — nothing points *from* a source in the spec) |
| `note` | `commitmentIds[]`, `projectIds[]`, `personIds[]`, `sourceIds[]`, `tagIds[]` |

(`ownerId` / `beneficiaryId` are intentionally excluded — see "Known
round-trip bug" below.)

### Known round-trip bug — `ownerId` / `beneficiaryId` / `projectId`

The v2 serializer writes `owner` / `beneficiary` / `project` in frontmatter
(no underscore), but the camelCase deserializer doesn't recognize those keys
and the Zod schema silently strips unknown fields. So those ids are lost on
read. Until that's fixed at the repository layer, structured matching works
via `evidenceIds` / `sourceIds` / `commitmentIds` (note) / `projectIds` (note)
/ `tagIds` — all of which round-trip correctly.

## Performance

Empirically the bulk-read + scoring loop handles **1000 entities in under
500ms** on a developer laptop (see `Performance: 1000 entities finish under
500ms` test). The bulk read is O(files) thanks to the existing repository
abstraction; the scoring loop is O(entities × query-tokens), and tokens are
always ≤ ~10 for a real search query.

If we ever need to scale past 10k entities, the next move is a per-entity
**inverted index over `linkIds` and `realTitle`** — kept in memory, built
lazily. Until then, the linear scan is well within budget.

## UI: tier badges

`MemoryView.tsx` renders each hit with two pills:

1. **Type pill** — what kind of entity this is (commitment / project /
   person / decision / outcome / source / note).
2. **Tier pill** — coloured by tier, with the `tierReason` as a tooltip so
   the user can hover and see why this hit landed here.

```
[commitment] [关联]  Send Q3 plan to Zhang            score 52
              "Zhang receives the plan by Friday…"
              reason: linked id contains "onboard"
              sources: 2 · evidence: 1
```

The sort inside `MemoryView` mirrors the server: tier order first, then
score, then id. This makes the UI stable against re-renders even when the
server returns hits in a slightly different order due to incidental scoring
changes inside a tier.

## Future work

- [ ] Fix the frontmatter round-trip for `ownerId` / `beneficiaryId` /
      `projectId` so those fields become structured candidates.
- [ ] Promote tier 1 to use the **reverse-link index** (query token → which
      entities have this token in their `linkIds`) so the user can paste a
      ULID and instantly see every entity that points at it.
- [ ] Add an inverse-DAU mode where the user can hide tier 3 hits via a UI
      toggle — useful for power users who want "only show me structured or
      title hits".

