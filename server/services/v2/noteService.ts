/**
 * Note service (DF2-013 / spec §5.2 / §7.3 / F-02A).
 *
 * Notes are the user's primary working surface. They are intentionally
 * permissive: a note is created on first body keystroke with no title,
 * no kind, no date, no project, no person — every metadata field is
 * either inferred later or filled lazily. The note is persisted as
 * `state: 'draft'` immediately so a refresh or crash never loses work.
 *
 * The auto-save contract is the most important behavioural detail:
 *   - Every save is versioned (autoSaveVersion monotonically increases).
 *   - Every save carries the body hash the client believed it was
 *     editing. If the server has a different hash (because another
 *     client or process wrote in between), the save is rejected with
 *     ConcurrentModificationError and the client must merge.
 *   - The body is the source of truth. Frontmatter is metadata.
 */
import { z } from 'zod';
import crypto from 'crypto';
import type { V2Repository } from '../../repositories/v2/repository.js';
import { newId } from '../../domain/v2/ulid.js';
import {
  NoteDocumentSchema,
  type NoteDocument,
  type NoteKind,
  type NoteState,
} from '../../domain/v2/types.js';
import { ConcurrentModificationError as RepoConcurrentModificationError } from '../../repositories/v2/atomicWrite.js';

// Re-export the repository's error so callers can `instanceof` check
// against the same class the routes layer catches.
export { RepoConcurrentModificationError as ConcurrentModificationError };

// ---------------------------------------------------------------------------
// Inputs / outputs
// ---------------------------------------------------------------------------

export const CreateNoteInputSchema = z.object({
  // Body is the only required field — F-02A forbids blocking on a title
  // or any other metadata at create time.
  body: z.string().max(500_000).default(''),
  title: z.string().max(500).optional(),
  kind: z
    .enum(['quick', 'daily', 'meeting', 'project', 'reference', 'general'])
    .optional(),
  state: z.enum(['draft', 'active', 'archived']).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  projectIds: z.array(z.string()).optional(),
  personIds: z.array(z.string()).optional(),
  sourceIds: z.array(z.string()).optional(),
  pinned: z.boolean().optional(),
  tagIds: z.array(z.string()).optional(),
  // workspaceId falls back to the repo's workspaceId.
  workspaceId: z.string().optional(),
});
export type CreateNoteInput = z.infer<typeof CreateNoteInputSchema>;

export const UpdateNoteInputSchema = z.object({
  // `expectedAutoSaveVersion` is the version the client thinks it is
  // overwriting. Server rejects with ConcurrentModificationError if the
  // stored version is higher.
  expectedAutoSaveVersion: z.number().int().nonnegative(),
  body: z.string().max(500_000).optional(),
  title: z.string().max(500).nullable().optional(),
  kind: z
    .enum(['quick', 'daily', 'meeting', 'project', 'reference', 'general'])
    .optional(),
  state: z.enum(['draft', 'active', 'archived']).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  projectIds: z.array(z.string()).optional(),
  personIds: z.array(z.string()).optional(),
  sourceIds: z.array(z.string()).optional(),
  pinned: z.boolean().optional(),
  tagIds: z.array(z.string()).optional(),
});
export type UpdateNoteInput = z.infer<typeof UpdateNoteInputSchema>;

export interface NoteBacklinks {
  noteId: string;
  evidenceIds: string[];
  // Reverse lookups — entities that reference this note via Evidence.
  // Empty for now; populated when other services learn to anchor to
  // noteId. Listed here so the UI has a stable shape to render.
  commitmentIds: string[];
  decisionIds: string[];
  outcomeIds: string[];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class NoteNotFoundError extends Error {
  constructor(public noteId: string) {
    super(`Note ${noteId} not found`);
    this.name = 'NoteNotFoundError';
  }
}

/** Throws the repository's ConcurrentModificationError for note saves. */
function noteConflict(noteId: string, expected: number, actual: number): never {
  // The repository's ConcurrentModificationError is built for atomicWrite
  // (filePath / expectedHash / actualHash). We re-use it for autosave by
  // packing the note id into filePath and serialising the version
  // numbers into the hash slots. The wire shape is `code:
  // 'concurrent_modification'` which the routes layer already maps to
  // HTTP 409, so the client only sees a typed conflict.
  throw new RepoConcurrentModificationError(
    `note:${noteId}`,
    `v${expected}`,
    `v${actual}`,
  );
}

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

function inferKind(body: string, explicit?: NoteKind): NoteKind {
  if (explicit) return explicit;
  const text = body.trim();
  if (!text) return 'quick';
  // Cheap heuristics — never required, just helps the UI bucket things.
  if (/^#\s*meeting\b/im.test(text)) return 'meeting';
  if (/^#\s*daily\b/im.test(text)) return 'daily';
  if (/^#\s*project\b/im.test(text)) return 'project';
  return 'general';
}

function inferTitle(body: string, explicit?: string): string | undefined {
  if (explicit !== undefined) return explicit || undefined;
  const text = body.trim();
  if (!text) return undefined;
  // First non-empty line, trimmed of leading #'s, capped at 200 chars.
  const m = text.match(/^#+\s*(.+)$/m);
  const line = (m ? m[1] : text.split('\n')[0]).trim();
  return line.length > 200 ? line.slice(0, 200) : line;
}

export class NoteService {
  constructor(private readonly repo: V2Repository) {}

  /**
   * Create a new note. Always succeeds; even an empty body produces a
   * draft that the user can type into. The `createdAt` is used as the
   * default `date` partition; if the caller passes a date that wins.
   */
  async create(input: CreateNoteInput): Promise<NoteDocument> {
    const parsed = CreateNoteInputSchema.parse(input);
    const workspaceId = parsed.workspaceId ?? this.repo['ctx'].workspaceId;
    const now = new Date().toISOString();
    const kind = inferKind(parsed.body, parsed.kind);
    const title = inferTitle(parsed.body, parsed.title);
    const note: NoteDocument = NoteDocumentSchema.parse({
      id: newId('note'),
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
      createdBy: 'user',
      workspaceId,
      title,
      body: parsed.body,
      kind,
      state: parsed.state ?? 'draft',
      date: parsed.date,
      projectIds: parsed.projectIds ?? [],
      personIds: parsed.personIds ?? [],
      sourceIds: parsed.sourceIds ?? [],
      pinned: parsed.pinned ?? false,
      lastOpenedAt: undefined,
      autoSaveVersion: 0,
      contentHash: sha256(parsed.body),
      tagIds: parsed.tagIds ?? [],
    });
    await this.repo.saveNoteDocument(note);
    return note;
  }

  async get(id: string): Promise<NoteDocument> {
    const note = await this.repo.getNoteDocument(id);
    if (!note) throw new NoteNotFoundError(id);
    return note;
  }

  async tryGet(id: string): Promise<NoteDocument | null> {
    return this.repo.getNoteDocument(id);
  }

  async list(opts: { state?: NoteState; kind?: NoteKind; q?: string } = {}): Promise<NoteDocument[]> {
    const all = await this.repo.listNoteDocuments({ state: opts.state });
    let out = all;
    if (opts.kind) out = out.filter((n) => n.kind === opts.kind);
    if (opts.q) {
      const needle = opts.q.toLowerCase();
      out = out.filter(
        (n) =>
          (n.title && n.title.toLowerCase().includes(needle)) ||
          (n.body && n.body.toLowerCase().includes(needle)),
      );
    }
    // Pinned first, then most-recently-updated.
    out.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
    return out;
  }

  /**
   * Update a note. Implements the auto-save conflict protocol: the
   * caller must send `expectedAutoSaveVersion`; if the server's stored
   * version is higher, we throw ConcurrentModificationError and the
   * client is expected to re-fetch and merge.
   */
  async update(id: string, input: UpdateNoteInput): Promise<NoteDocument> {
    const parsed = UpdateNoteInputSchema.parse(input);
    const existing = await this.tryGet(id);
    if (!existing) throw new NoteNotFoundError(id);
    if (existing.autoSaveVersion !== parsed.expectedAutoSaveVersion) {
      noteConflict(id, parsed.expectedAutoSaveVersion, existing.autoSaveVersion);
    }
    const nextBody = parsed.body ?? existing.body;
    const next: NoteDocument = NoteDocumentSchema.parse({
      ...existing,
      body: nextBody,
      contentHash: sha256(nextBody),
      // Title is nullable in input — null clears, undefined keeps.
      title:
        parsed.title === null
          ? undefined
          : parsed.title === undefined
          ? existing.title
          : inferTitle(nextBody, parsed.title),
      kind: parsed.kind ?? existing.kind,
      state: parsed.state ?? existing.state,
      date: parsed.date === null ? undefined : parsed.date ?? existing.date,
      projectIds: parsed.projectIds ?? existing.projectIds,
      personIds: parsed.personIds ?? existing.personIds,
      sourceIds: parsed.sourceIds ?? existing.sourceIds,
      pinned: parsed.pinned ?? existing.pinned,
      tagIds: parsed.tagIds ?? existing.tagIds,
      updatedAt: new Date().toISOString(),
      autoSaveVersion: existing.autoSaveVersion + 1,
    });
    await this.repo.saveNoteDocument(next);
    return next;
  }

  async touchLastOpened(id: string): Promise<NoteDocument> {
    const note = await this.tryGet(id);
    if (!note) throw new NoteNotFoundError(id);
    const next: NoteDocument = NoteDocumentSchema.parse({
      ...note,
      lastOpenedAt: new Date().toISOString(),
      updatedAt: note.updatedAt,
    });
    await this.repo.saveNoteDocument(next);
    return next;
  }

  async archive(id: string): Promise<NoteDocument> {
    const note = await this.tryGet(id);
    if (!note) throw new NoteNotFoundError(id);
    const next: NoteDocument = NoteDocumentSchema.parse({
      ...note,
      state: 'archived',
      updatedAt: new Date().toISOString(),
    });
    await this.repo.saveNoteDocument(next);
    return next;
  }

  async delete(id: string): Promise<boolean> {
    return this.repo.deleteNoteDocument(id);
  }

  /**
   * Compute backlinks for a note.
   *
   * Spec §26 step 19 asks the user to be able to ask "where does
   * this note live in the system?" and see every Commitment,
   * Decision, and Outcome that has been linked to it via Evidence.
   *
   * Reverse-lookup strategy (kept simple to stay within a single
   * service call):
   *   1. Find all Evidence anchored to this note (noteId field).
   *   2. Walk Commitment / Decision / Outcome lists, picking up any
   *      whose `evidenceIds` intersect with that set.
   *
   * This is O(NxM) but N and M are tiny (a note usually has < 50
   * pieces of evidence, the workspace rarely has > 10k entities). If
   * that ever becomes a hot path, the index.sqlite already has the
   * necessary joins — we just rebuild lazily.
   */
  async backlinks(id: string): Promise<NoteBacklinks> {
    const noteEvidence = await this.repo.listEvidenceForNote(id);
    const evidenceIds = new Set(noteEvidence.map((e) => e.id));
    const out: NoteBacklinks = {
      noteId: id,
      evidenceIds: noteEvidence.map((e) => e.id),
      commitmentIds: [],
      decisionIds: [],
      outcomeIds: [],
    };
    if (evidenceIds.size === 0) return out;

    const intersects = (ids: string[]) => ids.some((eid) => evidenceIds.has(eid));

    const [commitments, decisions, outcomes] = await Promise.all([
      this.repo.listCommitments(),
      this.repo.listDecisions(),
      this.repo.listOutcomes(),
    ]);
    out.commitmentIds = commitments.filter((c) => intersects(c.evidenceIds)).map((c) => c.id);
    out.decisionIds = decisions.filter((d) => intersects(d.evidenceIds)).map((d) => d.id);
    out.outcomeIds = outcomes.filter((o) => intersects(o.evidenceIds)).map((o) => o.id);
    return out;
  }
}
