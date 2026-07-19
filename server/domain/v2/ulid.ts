/**
 * ULID generation for v2 entities.
 * Spec §11.1: "all first-class objects use stable, time-sortable IDs (ULID recommended)".
 *
 * Crockford base32 ULID: 26 chars, monotonic-friendly. Falls back to a
 * time-sortable pseudo-ULID if `ulid` fails to load (it should never happen
 * in the server runtime, but we keep a deterministic safety net).
 */
import { ulid as realUlid } from 'ulid';

export type EntityPrefix =
  | 'src' // SourceItem
  | 'ev' // Evidence
  | 'com' // Commitment
  | 'out' // Outcome
  | 'prj' // Project
  | 'per' // Person
  | 'org' // Organization
  | 'dec' // Decision
  | 'mtg' // Meeting (memory)
  | 'plan' // DailyPlan
  | 'prop' // Proposal
  | 'run' // AgentRun
  | 'chg'; // ProposedChange (in-memory, not persisted as a separate entity)

export function newId(prefix: EntityPrefix, seedTime?: number): string {
  try {
    return `${prefix}_${realUlid(seedTime)}`;
  } catch {
    // Fallback: timestamp (ms) + 10 random chars. Still time-sortable.
    const t = (seedTime ?? Date.now()).toString(36).padStart(9, '0');
    const r = Math.random().toString(36).slice(2, 12).padStart(10, '0');
    return `${prefix}_${t}${r}`;
  }
}

/**
 * Extract the embedded timestamp from a ULID-style id. Returns undefined for
 * malformed ids. Useful for backfilling createdAt on migration paths.
 */
export function idTimestamp(id: string): number | undefined {
  const parts = id.split('_');
  if (parts.length < 2) return undefined;
  const body = parts[1];
  if (!body || body.length < 10) return undefined;
  // Real ULIDs are 26 chars of Crockford base32. We only use the first 10.
  const tsChars = body.slice(0, 10);
  let ts = 0;
  for (const ch of tsChars) {
    const v = ULID_DECODE[ch];
    if (v === undefined) return undefined;
    ts = ts * 32 + v;
  }
  return ts;
}

const ULID_DECODE: Record<string, number> = {};
for (let i = 0; i < 32; i++) {
  ULID_DECODE['0123456789ABCDEFGHJKMNPQRSTVWXYZ'[i]!] = i;
}
