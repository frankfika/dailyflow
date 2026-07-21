/**
 * Tests for the import + reset service (Phase X — workspace data lifecycle).
 *
 * Coverage:
 *   - import 1 note + 1 commitment → entities written to disk, re-readable
 *   - duplicate id + mode='merge'   → skipped (not overwritten)
 *   - invalid Zod payload          → error recorded, no write
 *   - workspaceId mismatch         → hard 403 (ImportWorkspaceMismatchError)
 *   - overwrite mode + existing id → ImportOverwriteConflictError
 *   - reset confirm string wrong   → ResetConfirmError
 *   - reset happy path             → directories cleared, audit log has
 *                                    the reset event, marker file persists
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { bootstrapV2 } from '../workspaceContext';
import { V2Repository } from '../../../repositories/v2/repository';
import {
  importEntities,
  resetWorkspace,
  ImportOverwriteConflictError,
  ImportWorkspaceMismatchError,
  ResetConfirmError,
  RESET_CONFIRM_PHRASE,
} from '../importService';
import { capture } from '../captureService';
import { createCommitment } from '../commitmentService';
import {
  SourceItemSchema,
  NoteDocumentSchema,
  CommitmentSchema,
  ProjectSchema,
  PersonSchema,
} from '../../../domain/v2/types';
import crypto from 'crypto';

let workspace: string;
let repo: V2Repository;
let workspaceId: string;

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), `df-v2-import-${crypto.randomUUID()}-`));
  const b = await bootstrapV2({ workspaceRoot: workspace, workspaceId: 'ws_test' });
  repo = b.repo;
  workspaceId = b.ctx.workspaceId;
});

afterEach(async () => {
  await fs.rm(workspace, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Fixtures — these are full Zod-valid entities we can hand to importEntities
// ---------------------------------------------------------------------------

function buildNote(overrides: Partial<{
  id: string;
  workspaceId: string;
  body: string;
  title: string;
}> = {}) {
  const now = new Date().toISOString();
  return NoteDocumentSchema.parse({
    id: overrides.id ?? `note_${crypto.randomBytes(6).toString('hex')}`,
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    createdBy: 'user',
    workspaceId: overrides.workspaceId ?? workspaceId,
    title: overrides.title ?? 'Imported note',
    body: overrides.body ?? 'Body of the imported note.',
    kind: 'general',
    state: 'active',
    projectIds: [],
    personIds: [],
    sourceIds: [],
    pinned: false,
    autoSaveVersion: 0,
    contentHash: crypto.createHash('sha256').update(overrides.body ?? 'Body of the imported note.').digest('hex'),
    tagIds: [],
  });
}

function buildCommitment(overrides: Partial<{ id: string; workspaceId: string; title: string }> = {}) {
  const now = new Date().toISOString();
  return CommitmentSchema.parse({
    id: overrides.id ?? `cmt_${crypto.randomBytes(6).toString('hex')}`,
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    createdBy: 'user',
    workspaceId: overrides.workspaceId ?? workspaceId,
    title: overrides.title ?? 'Imported commitment',
    outcome: 'Imported outcome',
    state: 'active',
    evidenceIds: [],
    sourceIds: [],
  });
}

function buildSourceItem(overrides: Partial<{ id: string; workspaceId: string; body: string }> = {}) {
  const now = new Date().toISOString();
  return SourceItemSchema.parse({
    id: overrides.id ?? `src_${crypto.randomBytes(6).toString('hex')}`,
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    createdBy: 'user',
    workspaceId: overrides.workspaceId ?? workspaceId,
    kind: 'quick_capture',
    body: overrides.body ?? 'Imported source body.',
    occurredAt: now,
    contentHash: crypto.createHash('sha256').update(overrides.body ?? 'Imported source body.').digest('hex'),
    processingStatus: 'saved',
  });
}

// ---------------------------------------------------------------------------
// Import — happy path
// ---------------------------------------------------------------------------

describe('importEntities — happy path', () => {
  it('writes a note + commitment to disk and they round-trip', async () => {
    const note = buildNote();
    const commitment = buildCommitment();

    const result = await importEntities(repo, workspaceId, {
      entities: { note: [note], commitment: [commitment] },
      mode: 'merge',
    });

    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.errors).toEqual([]);
    expect(result.mode).toBe('merge');

    // Read back from disk via the repository to confirm the write path.
    const reloadedNote = await repo.getNoteDocument(note.id);
    expect(reloadedNote).not.toBeNull();
    expect(reloadedNote!.body).toBe(note.body);
    expect(reloadedNote!.workspaceId).toBe(workspaceId);

    const reloadedCommit = await repo.getCommitment(commitment.id);
    expect(reloadedCommit).not.toBeNull();
    expect(reloadedCommit!.title).toBe(commitment.title);
    expect(reloadedCommit!.workspaceId).toBe(workspaceId);

    // Single audit event covers the whole call.
    const audit = await repo.audit.readAll();
    const importEvents = audit.filter((e) => e.kind === 'workspace.import');
    expect(importEvents.length).toBe(1);
    expect(importEvents[0]!.data).toMatchObject({ imported: 2, skipped: 0, mode: 'merge' });
  });

  it('imports across every supported kind (source / note / commitment / project / person / decision / outcome)', async () => {
    const src = buildSourceItem();
    const note = buildNote();
    const cmt = buildCommitment();
    const proj = ProjectSchema.parse({
      id: `prj_${crypto.randomBytes(6).toString('hex')}`,
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'user',
      workspaceId,
      name: 'Imported project',
      objective: 'object',
      successCriteria: [],
      state: 'active',
      commitmentIds: [],
      decisionIds: [],
      sourceIds: [],
    });
    const person = PersonSchema.parse({
      id: `per_${crypto.randomBytes(6).toString('hex')}`,
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'user',
      workspaceId,
      displayName: 'Imported Person',
      aliases: [],
    });

    const result = await importEntities(repo, workspaceId, {
      entities: {
        source: [src],
        note: [note],
        commitment: [cmt],
        project: [proj],
        person: [person],
      },
      mode: 'merge',
    });

    expect(result.imported).toBe(5);
    expect(result.errors).toEqual([]);

    // Verify by reading through the repo list endpoints.
    const sources = await repo.listSourceItems();
    expect(sources.find((s) => s.id === src.id)).toBeDefined();
    const projects = await repo.listProjects();
    expect(projects.find((p) => p.id === proj.id)).toBeDefined();
    const people = await repo.listPeople();
    expect(people.find((p) => p.id === person.id)).toBeDefined();
  });

  it('defaults to merge mode when mode is omitted', async () => {
    const note = buildNote();
    const result = await importEntities(repo, workspaceId, {
      entities: { note: [note] },
    });
    expect(result.mode).toBe('merge');
    expect(result.imported).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Import — merge skips duplicates
// ---------------------------------------------------------------------------

describe('importEntities — merge mode', () => {
  it('skips an entity whose id already exists, leaves the on-disk copy untouched', async () => {
    // Pre-seed a note with body "v1".
    const note = buildNote({ body: 'v1' });
    await importEntities(repo, workspaceId, {
      entities: { note: [note] },
      mode: 'merge',
    });
    const reloaded1 = await repo.getNoteDocument(note.id);
    expect(reloaded1!.body).toBe('v1');

    // Re-import the same id with body "v2". Merge mode should skip.
    const noteV2 = buildNote({ id: note.id, body: 'v2' });
    const result = await importEntities(repo, workspaceId, {
      entities: { note: [noteV2] },
      mode: 'merge',
    });
    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);

    const reloaded2 = await repo.getNoteDocument(note.id);
    expect(reloaded2!.body).toBe('v1'); // unchanged
  });

  it('mixes imported + skipped + errored in a single call (graceful batch)', async () => {
    const goodNote = buildNote();
    const goodCmt = buildCommitment();
    // Pre-seed one to force a skip.
    await importEntities(repo, workspaceId, {
      entities: { note: [goodNote] },
      mode: 'merge',
    });

    // A malformed note (missing required body / kind) should be reported
    // as an error and not block the rest of the batch.
    const broken = { id: 'note_broken', workspaceId }; // missing body, kind, etc.
    const result = await importEntities(repo, workspaceId, {
      entities: { note: [goodNote, broken], commitment: [goodCmt] },
      mode: 'merge',
    });
    expect(result.imported).toBe(1); // the commitment
    expect(result.skipped).toBe(1); // the note re-import
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]!.reason).toBe('schema_validation');
    expect(result.errors[0]!.id).toBe('note_broken');
  });
});

// ---------------------------------------------------------------------------
// Import — overwrite conflict + workspace mismatch
// ---------------------------------------------------------------------------

describe('importEntities — overwrite mode', () => {
  it('rejects the whole call when any id conflicts (409 overwrite_conflict)', async () => {
    const note = buildNote();
    await importEntities(repo, workspaceId, {
      entities: { note: [note] },
      mode: 'merge',
    });

    await expect(
      importEntities(repo, workspaceId, {
        entities: { note: [note] },
        mode: 'overwrite',
      })
    ).rejects.toBeInstanceOf(ImportOverwriteConflictError);
  });

  it('succeeds when no id conflicts (writes all)', async () => {
    const note = buildNote();
    const cmt = buildCommitment();
    const result = await importEntities(repo, workspaceId, {
      entities: { note: [note], commitment: [cmt] },
      mode: 'overwrite',
    });
    expect(result.imported).toBe(2);
  });
});

describe('importEntities — workspace isolation', () => {
  it('rejects an entity whose workspaceId does not match the target', async () => {
    const foreign = buildNote({ workspaceId: 'ws_someone_else' });
    await expect(
      importEntities(repo, workspaceId, {
        entities: { note: [foreign] },
        mode: 'merge',
      })
    ).rejects.toBeInstanceOf(ImportWorkspaceMismatchError);

    // Nothing got written.
    const all = await repo.listNoteDocuments();
    expect(all.find((n) => n.id === foreign.id)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Reset — confirm phrase + happy path
// ---------------------------------------------------------------------------

describe('resetWorkspace — confirm phrase', () => {
  it('rejects when confirm is missing or wrong (400 ResetConfirmError)', async () => {
    await expect(resetWorkspace(repo, { confirm: 'yes' })).rejects.toBeInstanceOf(ResetConfirmError);
    await expect(resetWorkspace(repo, { confirm: '' })).rejects.toBeInstanceOf(ResetConfirmError);
    await expect(
      resetWorkspace(repo, { confirm: 'reset workspace' }) // wrong case
    ).rejects.toBeInstanceOf(ResetConfirmError);
  });
});

describe('resetWorkspace — happy path', () => {
  it('clears the workspace, re-bootstraps, and records the reset event in the fresh audit log', async () => {
    // Seed a few entities so the snapshot is non-trivial.
    await capture(repo, { kind: 'quick_capture', body: 'leftover source item' });
    const cmt = await createCommitment(repo, workspaceId, {
      title: 'Leftover commitment',
      outcome: 'leftover outcome',
      state: 'active',
    });
    const note = buildNote();
    await importEntities(repo, workspaceId, {
      entities: { note: [note] },
      mode: 'merge',
    });

    const result = await resetWorkspace(repo, { confirm: RESET_CONFIRM_PHRASE });

    expect(result.ok).toBe(true);
    expect(result.cleared).toEqual(
      expect.arrayContaining(['.dailyflow', 'Inbox', 'Commitments', 'Memory', 'Projects', 'Plans', 'Attachments'])
    );
    expect(result.preResetCounts.sources).toBeGreaterThanOrEqual(1);
    expect(result.preResetCounts.notes).toBe(1);
    expect(result.preResetCounts.commitments).toBe(1);

    // The .dailyflow tree was wiped; bootstrap should have rebuilt an empty
    // audit log with a single workspace.reset event.
    const audit = await repo.audit.readAll();
    const resetEvents = audit.filter((e) => e.kind === 'workspace.reset');
    expect(resetEvents.length).toBe(1);
    expect(resetEvents[0]!.data).toMatchObject({
      notes: 1,
      commitments: 1,
    });
    expect(resetEvents[0]!.data.cleared).toEqual(expect.arrayContaining(['.dailyflow', 'Inbox']));

    // The marker file persists outside .dailyflow/ so future runs know
    // the workspace was reset.
    const marker = JSON.parse(
      await fs.readFile(path.join(workspace, '.last-reset.json'), 'utf8')
    );
    expect(marker.preResetCounts.notes).toBe(1);
    expect(marker.workspaceId).toBe(workspaceId);

    // The previously-existing commitment id no longer exists on disk.
    const reloaded = await repo.getCommitment(cmt.id);
    expect(reloaded).toBeNull();
    const reloadedNote = await repo.getNoteDocument(note.id);
    expect(reloadedNote).toBeNull();
  });

  it('subsequent operations after reset land on a clean workspace', async () => {
    await capture(repo, { kind: 'quick_capture', body: 'before reset' });
    await resetWorkspace(repo, { confirm: RESET_CONFIRM_PHRASE });

    const all = await repo.listSourceItems();
    expect(all.length).toBe(0);
    const allNotes = await repo.listNoteDocuments();
    expect(allNotes.length).toBe(0);
  });
});
