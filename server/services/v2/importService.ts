/**
 * Import + reset services (Phase X — workspace data lifecycle).
 *
 * Mirrors the read-side of `exportService` for symmetry. The two endpoints
 * the UI calls from Settings → Workspace Data:
 *
 *   POST /api/v2/import  { entities, mode, confirm? }  → { imported, skipped, errors }
 *   POST /api/v2/reset   { confirm }                   → { ok, cleared, preResetCounts }
 *
 * Invariants enforced here (all from spec §13.3 / §13.4):
 *   - Every entity is parsed through its Zod schema before it touches disk.
 *   - Every entity must carry the same workspaceId as the target workspace
 *     (a strict barrier against cross-workspace import).
 *   - Audit log records a single import or reset event per call.
 *
 * The split between service and route stays clean: this file knows nothing
 * about Express, only the repository. The route layer maps thrown errors
 * to HTTP status codes.
 */
import fs from 'fs/promises';
import path from 'path';
import type { z } from 'zod';
import type { V2Repository } from '../../repositories/v2/repository.js';
import {
  SourceItemSchema,
  NoteDocumentSchema,
  CommitmentSchema,
  DecisionSchema,
  OutcomeSchema,
  ProjectSchema,
  PersonSchema,
  OrganizationSchema,
  EvidenceSchema,
  type SourceItem,
  type NoteDocument,
  type Commitment,
  type Decision,
  type Outcome,
  type Project,
  type Person,
  type Organization,
  type Evidence,
} from '../../domain/v2/types.js';

// ---------------------------------------------------------------------------
// Errors — thrown by the service, caught + mapped in routes/v2/index.ts
// ---------------------------------------------------------------------------

export class ImportOverwriteConflictError extends Error {
  readonly code = 'overwrite_conflict';
  readonly conflicts: Array<{ kind: ImportEntityKind; id: string }>;
  constructor(conflicts: Array<{ kind: ImportEntityKind; id: string }>) {
    super(
      `Import rejected in overwrite mode: ${conflicts.length} id${conflicts.length === 1 ? '' : 's'} already exist in the workspace.`
    );
    this.name = 'ImportOverwriteConflictError';
    this.conflicts = conflicts;
  }
}

export class ImportWorkspaceMismatchError extends Error {
  readonly code = 'workspace_mismatch';
  readonly offenders: Array<{ kind: ImportEntityKind; id: string; expected: string; got: string }>;
  constructor(
    offenders: Array<{ kind: ImportEntityKind; id: string; expected: string; got: string }>
  ) {
    super(
      `Import rejected: ${offenders.length} entity entr${offenders.length === 1 ? 'y' : 'ies'} carry a different workspaceId.`
    );
    this.name = 'ImportWorkspaceMismatchError';
    this.offenders = offenders;
  }
}

export class ResetConfirmError extends Error {
  readonly code = 'reset_confirm_required';
  constructor() {
    super('Reset requires { confirm: "RESET WORKSPACE" } to guard against accidental clicks.');
    this.name = 'ResetConfirmError';
  }
}

// ---------------------------------------------------------------------------
// Kinds + schemas — single map so a typo in route layer is impossible.
// ---------------------------------------------------------------------------

export type ImportEntityKind =
  | 'source'
  | 'note'
  | 'commitment'
  | 'decision'
  | 'outcome'
  | 'project'
  | 'person'
  | 'organization'
  | 'evidence';

interface KindBinding<T> {
  schema: z.ZodType<T>;
  findById: (repo: V2Repository, id: string) => Promise<boolean>;
  save: (repo: V2Repository, entity: T) => Promise<void>;
}

const KIND_BINDINGS: Record<ImportEntityKind, KindBinding<any>> = {
  source: {
    schema: SourceItemSchema as z.ZodType<SourceItem>,
    findById: async (repo, id) => (await repo.getSourceItem(id)) !== null,
    save: async (repo, e) => {
      await repo.saveSourceItem(e, {
        auditKind: 'capture',
        auditActor: 'user',
        auditEntity: { type: 'source', id: e.id },
        auditData: { action: 'import' },
      });
    },
  },
  note: {
    schema: NoteDocumentSchema as z.ZodType<NoteDocument>,
    findById: async (repo, id) => (await repo.getNoteDocument(id)) !== null,
    save: async (repo, e) => {
      await repo.saveNoteDocument(e, {
        auditKind: 'file.write',
        auditActor: 'user',
        auditEntity: { type: 'note', id: e.id },
        auditData: { action: 'import' },
      });
    },
  },
  commitment: {
    schema: CommitmentSchema as z.ZodType<Commitment>,
    findById: async (repo, id) => (await repo.getCommitment(id)) !== null,
    save: async (repo, e) => {
      await repo.saveCommitment(e, {
        auditKind: 'commitment.create',
        auditActor: 'user',
        auditEntity: { type: 'commitment', id: e.id },
        auditData: { action: 'import', state: e.state },
      });
    },
  },
  decision: {
    schema: DecisionSchema as z.ZodType<Decision>,
    findById: async (repo, id) => (await repo.listDecisions()).some((d) => d.id === id),
    save: async (repo, e) => {
      await repo.saveDecision(e, {
        auditKind: 'file.write',
        auditActor: 'user',
        auditEntity: { type: 'decision', id: e.id },
        auditData: { action: 'import' },
      });
    },
  },
  outcome: {
    schema: OutcomeSchema as z.ZodType<Outcome>,
    findById: async (repo, id) => (await repo.listOutcomes()).some((o) => o.id === id),
    save: async (repo, e) => {
      await repo.saveOutcome(e, {
        auditKind: 'outcome.create',
        auditActor: 'user',
        auditEntity: { type: 'outcome', id: e.id },
        auditData: { action: 'import' },
      });
    },
  },
  project: {
    schema: ProjectSchema as z.ZodType<Project>,
    findById: async (repo, id) => (await repo.listProjects()).some((p) => p.id === id),
    save: async (repo, e) => {
      await repo.saveProject(e, {
        auditKind: 'file.write',
        auditActor: 'user',
        auditEntity: { type: 'project', id: e.id },
        auditData: { action: 'import' },
      });
    },
  },
  person: {
    schema: PersonSchema as z.ZodType<Person>,
    findById: async (repo, id) => (await repo.listPeople()).some((p) => p.id === id),
    save: async (repo, e) => {
      await repo.savePerson(e, {
        auditKind: 'file.write',
        auditActor: 'user',
        auditEntity: { type: 'person', id: e.id },
        auditData: { action: 'import' },
      });
    },
  },
  organization: {
    schema: OrganizationSchema as z.ZodType<Organization>,
    findById: async (repo, id) => (await repo.listOrganizations()).some((o) => o.id === id),
    save: async (repo, e) => {
      await repo.saveOrganization(e, {
        auditKind: 'file.write',
        auditActor: 'user',
        auditEntity: { type: 'organization', id: e.id },
        auditData: { action: 'import' },
      });
    },
  },
  evidence: {
    schema: EvidenceSchema as z.ZodType<Evidence>,
    findById: async (repo, id) => (await repo.listEvidence()).some((ev) => ev.id === id),
    save: async (repo, e) => {
      await repo.saveEvidence(e, {
        auditKind: 'file.write',
        auditActor: 'user',
        auditEntity: { type: 'evidence', id: e.id },
        auditData: { action: 'import' },
      });
    },
  },
};

// ---------------------------------------------------------------------------
// Input contract
// ---------------------------------------------------------------------------

export type ImportMode = 'merge' | 'overwrite';

export interface ImportInput {
  entities: Partial<Record<ImportEntityKind, unknown[]>>;
  /** Default 'merge' if omitted. */
  mode?: ImportMode;
}

export interface ImportErrorEntry {
  kind?: ImportEntityKind;
  id?: string;
  reason: string;
  issues?: unknown;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: ImportErrorEntry[];
  mode: ImportMode;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

interface ValidatedEntity {
  kind: ImportEntityKind;
  entity: any;
}

interface ValidationFailure {
  kind: ImportEntityKind;
  id: string | undefined;
  reason: string;
  issues?: unknown;
}

/**
 * Validate every entity through its Zod schema and check the workspaceId
 * contract. Returns the entities that passed (ready to write) plus the
 * list of per-entity errors.
 *
 * workspaceId mismatch is treated as a hard error — the route layer maps
 * it to 403 Forbidden rather than a per-entity error, because a single
 * mismatched entity is a sign the import file was generated for a
 * different workspace and the user should be told upfront.
 */
function validateEntities(
  entities: Partial<Record<ImportEntityKind, unknown[]>>,
  targetWorkspaceId: string
): { valid: ValidatedEntity[]; errors: ValidationFailure[]; workspaceOffenders: Array<{ kind: ImportEntityKind; id: string; expected: string; got: string }> } {
  const valid: ValidatedEntity[] = [];
  const errors: ValidationFailure[] = [];
  const workspaceOffenders: Array<{ kind: ImportEntityKind; id: string; expected: string; got: string }> = [];

  for (const kind of Object.keys(entities) as ImportEntityKind[]) {
    const arr = entities[kind];
    if (!arr) continue;
    const binding = KIND_BINDINGS[kind];
    if (!binding) {
      errors.push({ kind, id: undefined, reason: `unknown entity kind: ${kind}` });
      continue;
    }
    for (const raw of arr) {
      if (!raw || typeof raw !== 'object') {
        errors.push({ kind, id: undefined, reason: 'entity must be an object' });
        continue;
      }
      const idHint = (raw as { id?: unknown }).id;
      const idStr = typeof idHint === 'string' ? idHint : undefined;
      const parsed = binding.schema.safeParse(raw);
      if (!parsed.success) {
        errors.push({ kind, id: idStr, reason: 'schema_validation', issues: parsed.error.issues });
        continue;
      }
      const entity = parsed.data;
      if (entity.workspaceId !== targetWorkspaceId) {
        workspaceOffenders.push({
          kind,
          id: entity.id,
          expected: targetWorkspaceId,
          got: entity.workspaceId,
        });
        continue;
      }
      valid.push({ kind, entity });
    }
  }

  return { valid, errors, workspaceOffenders };
}

export async function importEntities(
  repo: V2Repository,
  targetWorkspaceId: string,
  input: ImportInput
): Promise<ImportResult> {
  const mode: ImportMode = input.mode ?? 'merge';
  if (mode !== 'merge' && mode !== 'overwrite') {
    throw new Error(`Invalid import mode: ${String(mode)}`);
  }
  const entities = input.entities ?? {};

  // Phase 1: validate + workspace gate
  const { valid, errors, workspaceOffenders } = validateEntities(entities, targetWorkspaceId);
  if (workspaceOffenders.length > 0) {
    // Cross-workspace import is a 403 — refuse the whole call.
    throw new ImportWorkspaceMismatchError(workspaceOffenders);
  }

  // Phase 2: conflict pre-check (overwrite mode fails fast on any conflict)
  if (mode === 'overwrite') {
    const conflicts: Array<{ kind: ImportEntityKind; id: string }> = [];
    for (const { kind, entity } of valid) {
      const exists = await KIND_BINDINGS[kind].findById(repo, entity.id);
      if (exists) conflicts.push({ kind, id: entity.id });
    }
    if (conflicts.length > 0) {
      throw new ImportOverwriteConflictError(conflicts);
    }
  }

  // Phase 3: write
  let imported = 0;
  let skipped = 0;
  for (const { kind, entity } of valid) {
    const exists = await KIND_BINDINGS[kind].findById(repo, entity.id);
    if (mode === 'merge' && exists) {
      skipped++;
      continue;
    }
    await KIND_BINDINGS[kind].save(repo, entity);
    imported++;
  }

  // Phase 4: single audit event for the whole call
  await repo.audit.append({
    kind: 'workspace.import',
    actor: 'user',
    data: {
      mode,
      imported,
      skipped,
      errorCount: errors.length,
      kindsWritten: [...new Set(valid.map((v) => v.kind))],
    },
  });

  return { imported, skipped, errors, mode };
}

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

export const RESET_CONFIRM_PHRASE = 'RESET WORKSPACE';

export interface ResetOptions {
  /** Caller must echo this exact phrase to confirm the destructive call. */
  confirm: string;
}

export interface ResetResult {
  ok: true;
  cleared: string[];
  preResetCounts: {
    sources: number;
    notes: number;
    commitments: number;
    outcomes: number;
    projects: number;
    people: number;
    organizations: number;
    decisions: number;
    evidence: number;
  };
  resetAt: string;
}

/**
 * Snapshot the entity counts before deletion so the response can tell the
 * user exactly what was cleared. We avoid loading every entity into memory
 * — a `length` on each list* call is enough for the audit shape.
 */
async function snapshotCounts(repo: V2Repository) {
  const [
    sources,
    notes,
    commitments,
    outcomes,
    projects,
    people,
    organizations,
    decisions,
    evidence,
  ] = await Promise.all([
    repo.listSourceItems(),
    repo.listNoteDocuments(),
    repo.listCommitments(),
    repo.listOutcomes(),
    repo.listProjects(),
    repo.listPeople(),
    repo.listOrganizations(),
    repo.listDecisions(),
    repo.listEvidence(),
  ]);
  return {
    sources: sources.length,
    notes: notes.length,
    commitments: commitments.length,
    outcomes: outcomes.length,
    projects: projects.length,
    people: people.length,
    organizations: organizations.length,
    decisions: decisions.length,
    evidence: evidence.length,
  };
}

/**
 * Reset the workspace to a clean v2 state. This is intentionally not in
 * the repository — it crosses file-system boundaries (.dailyflow/ + every
 * v2 entity directory) and re-bootstraps, which the repository's
 * invariant-per-save design doesn't cover.
 *
 * The confirm string is mandatory. We refuse with ResetConfirmError if
 * the phrase does not match — never silently accept.
 */
export async function resetWorkspace(
  repo: V2Repository,
  opts: ResetOptions
): Promise<ResetResult> {
  if (opts.confirm !== RESET_CONFIRM_PHRASE) {
    throw new ResetConfirmError();
  }

  // Snapshot before destructive ops so the user gets a meaningful report.
  const preResetCounts = await snapshotCounts(repo);

  const layout = repo.layout;
  const resetAt = new Date().toISOString();

  // Top-level v2 directories the bootstrap recreates. Listed explicitly
  // (no recursive walk) so a stray file in the workspaceRoot is preserved.
  const targets: Array<{ rel: string; abs: string }> = [
    { rel: '.dailyflow', abs: path.dirname(layout.internal.audit) },
    { rel: 'Inbox', abs: layout.inbox },
    { rel: 'Commitments', abs: layout.commitments.all },
    { rel: 'Memory', abs: path.dirname(layout.people) },
    { rel: 'Projects', abs: layout.projects },
    { rel: 'Plans', abs: layout.plans },
    { rel: 'Attachments', abs: layout.attachments },
  ];

  // Persist a "last-reset" marker OUTSIDE .dailyflow/ so it survives the
  // clear. The next audit chain starts fresh after bootstrap, so we can't
  // rely on the in-workspace audit.jsonl to remember the reset event.
  const lastResetPath = path.join(layout.root, '.last-reset.json');
  const resetMarker = {
    resetAt,
    workspaceId: repo['ctx'].workspaceId,
    preResetCounts,
  };
  try {
    await fs.writeFile(lastResetPath, JSON.stringify(resetMarker, null, 2), 'utf8');
  } catch {
    // Best-effort marker; reset must not be blocked by a read-only root.
  }

  const cleared: string[] = [];
  for (const t of targets) {
    try {
      await fs.rm(t.abs, { recursive: true, force: true });
    } catch (err: any) {
      if (err && err.code !== 'ENOENT') {
        throw err;
      }
    }
    cleared.push(t.rel);
  }

  // Re-bootstrap so the audit dir, the inbox partition, the commitment
  // state subfolders, and every other v2 directory exist again. We pull
  // the lazy import from the workspaceContext module so there is no
  // cycle (workspaceContext.ts only depends on repository + paths).
  const { bootstrapV2 } = await import('./workspaceContext.js');
  await bootstrapV2({
    workspaceRoot: layout.root,
    workspaceId: repo['ctx'].workspaceId,
  });

  // Append the post-reset audit event to the freshly-created audit log so
  // the chain is not empty after a destructive operation. This is the
  // canonical record: "X sources, Y notes, ... were cleared at <ts>".
  await repo.audit.append({
    kind: 'workspace.reset',
    actor: 'user',
    data: {
      resetAt,
      ...preResetCounts,
      cleared,
    },
  });

  return {
    ok: true,
    cleared,
    preResetCounts,
    resetAt,
  };
}
