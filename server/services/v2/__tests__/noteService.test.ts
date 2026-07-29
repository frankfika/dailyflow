/**
 * Tests for NoteService (DF2-013 / spec §5.2 / §7.3 / §11.3 / F-02A).
 *
 * Coverage target: the 14 contract cases in the task spec.
 *  - F-02A: notes are created on first body keystroke with no title /
 *    no kind / no date / no project / no person. Empty body is legal.
 *  - spec §5.2: notes are the user's primary working surface (create /
 *    update / list / archive / delete).
 *  - spec §7.3: pinned notes surface first; otherwise most-recently-updated.
 *  - spec §11.3: auto-save conflict protocol — every save carries
 *    expectedAutoSaveVersion; mismatch throws ConcurrentModificationError.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { V2Repository } from '../../../repositories/v2/repository';
import { NoteService, NoteNotFoundError, ConcurrentModificationError } from '../noteService';
import { ConcurrentModificationError as RepoConcurrentModificationError } from '../../../repositories/v2/atomicWrite';
import type { Evidence, NoteDocument } from '../../../domain/v2/types';

let workspace: string;
let repo: V2Repository;
let svc: NoteService;

beforeEach(async () => {
  // crypto.randomUUID ensures a unique tmp dir per test even when tests
  // run in parallel and the system tmpdir is shared.
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), `df-v2-note-${crypto.randomUUID()}-`));
  repo = new V2Repository({ root: workspace, workspaceId: 'ws_test' });
  svc = new NoteService(repo);
});

afterEach(async () => {
  await fs.rm(workspace, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// 1. F-02A: empty-body create is legal
// ---------------------------------------------------------------------------
describe('create', () => {
  it('creates a draft from an empty body (F-02A forbids blocking on a title)', async () => {
    const note = await svc.create({ body: '' });
    expect(note.id).toMatch(/^note_/);
    expect(note.state).toBe('draft');
    expect(note.title).toBeUndefined();
    expect(note.kind).toBe('quick');
    expect(note.body).toBe('');
    expect(note.autoSaveVersion).toBe(0);
    expect(note.workspaceId).toBe('ws_test');
    // contentHash is the sha256 of the empty string — noteService owns
    // the hash, we only assert shape and that the field is populated.
    expect(note.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('infers title and kind from a body and respects explicit kind/state', async () => {
    const note = await svc.create({
      body: '# meeting\nDecided to ship 2-tier pricing next week.',
    });
    expect(note.title).toBe('meeting');
    expect(note.kind).toBe('meeting');

    const daily = await svc.create({
      body: '# daily\nReflecting on what shipped today.',
    });
    expect(daily.kind).toBe('daily');

    const project = await svc.create({
      body: '# project\nFinalize Q4 launch checklist.',
    });
    expect(project.kind).toBe('project');

    const plain = await svc.create({ body: 'Just a thought.' });
    expect(plain.kind).toBe('general');
    expect(plain.title).toBe('Just a thought.');

    const explicit = await svc.create({
      body: 'Free-form.',
      kind: 'reference',
      state: 'active',
      title: 'My Ref',
    });
    expect(explicit.kind).toBe('reference');
    expect(explicit.state).toBe('active');
    expect(explicit.title).toBe('My Ref');
  });
});

// ---------------------------------------------------------------------------
// 3-5. update happy path, version conflict, partial update
// ---------------------------------------------------------------------------
describe('update', () => {
  it('bumps autoSaveVersion 0 → 1 and changes contentHash on body edit', async () => {
    const note = await svc.create({ body: 'first draft' });
    const updated = await svc.update(note.id, {
      expectedAutoSaveVersion: 0,
      body: 'second draft',
    });
    expect(updated.autoSaveVersion).toBe(1);
    expect(updated.body).toBe('second draft');
    expect(updated.contentHash).not.toBe(note.contentHash);
    // Persisted on disk: round-trip via repo.getNoteDocument.
    const reloaded = await repo.getNoteDocument(note.id);
    expect(reloaded?.body).toBe('second draft');
    expect(reloaded?.autoSaveVersion).toBe(1);
  });

  it('throws ConcurrentModificationError when expectedAutoSaveVersion is stale', async () => {
    const note = await svc.create({ body: 'a' });
    await svc.update(note.id, { expectedAutoSaveVersion: 0, body: 'b' });
    // Now on disk autoSaveVersion is 1; replaying v0 must fail.
    let captured: unknown;
    try {
      await svc.update(note.id, { expectedAutoSaveVersion: 0, body: 'c' });
    } catch (e) {
      captured = e;
    }
    expect(captured).toBeInstanceOf(ConcurrentModificationError);
    // Repository class identity — noteService re-exports the same class,
    // callers can use either import.
    expect(captured).toBeInstanceOf(RepoConcurrentModificationError);
    if (captured instanceof Error) {
      expect(captured.message).toMatch(/note:/);
    }
    // On-disk content must be the b version; the rejected write must
    // not have partially applied.
    const reloaded = await repo.getNoteDocument(note.id);
    expect(reloaded?.body).toBe('b');
    expect(reloaded?.autoSaveVersion).toBe(1);
  });

  it('partial update: changing only body preserves title and other fields', async () => {
    const note = await svc.create({
      body: 'Original title line\nOriginal body',
      kind: 'meeting',
    });
    const updated = await svc.update(note.id, {
      expectedAutoSaveVersion: 0,
      body: 'Original title line\nNew body content',
    });
    expect(updated.title).toBe(note.title);
    expect(updated.kind).toBe('meeting');
    expect(updated.body).toBe('Original title line\nNew body content');
  });

  it('passing title: null clears the title; omitting title preserves it', async () => {
    const note = await svc.create({ body: '# heading\nbody' });
    expect(note.title).toBe('heading');
    const cleared = await svc.update(note.id, {
      expectedAutoSaveVersion: 0,
      title: null,
    });
    expect(cleared.title).toBeUndefined();

    const again = await svc.update(note.id, {
      expectedAutoSaveVersion: cleared.autoSaveVersion,
      body: 'no heading line here',
    });
    // title was cleared → stays cleared
    expect(again.title).toBeUndefined();
  });

  it('persists note tags and direct task associations', async () => {
    const note = await svc.create({
      body: '# Launch notes',
      tagIds: ['planning'],
      commitmentIds: ['com_01KAAAAAAAAAAAAAAAA'],
    });
    expect(note.tagIds).toEqual(['planning']);
    expect(note.commitmentIds).toEqual(['com_01KAAAAAAAAAAAAAAAA']);

    const updated = await svc.update(note.id, {
      expectedAutoSaveVersion: note.autoSaveVersion,
      tagIds: ['planning', 'customer'],
      commitmentIds: ['com_01KBBBBBBBBBBBBBBBB'],
    });
    expect(updated.tagIds).toEqual(['planning', 'customer']);
    expect(updated.commitmentIds).toEqual(['com_01KBBBBBBBBBBBBBBBB']);

    const reloaded = await repo.getNoteDocument(note.id);
    expect(reloaded?.tagIds).toEqual(['planning', 'customer']);
    expect(reloaded?.commitmentIds).toEqual(['com_01KBBBBBBBBBBBBBBBB']);
  });
});

// ---------------------------------------------------------------------------
// 6-8. list ordering, filtering, text search
// ---------------------------------------------------------------------------
describe('list', () => {
  it('sorts pinned first, then updatedAt descending', async () => {
    const a = await svc.create({ body: 'a' });
    const b = await svc.create({ body: 'b' });
    const c = await svc.create({ body: 'c' });

    // Pin b; then update a so a becomes the most-recently-updated
    // non-pinned note.
    await svc.update(b.id, { expectedAutoSaveVersion: 0, pinned: true });
    // Tiny sleep so updatedAt timestamps differ.
    await new Promise((r) => setTimeout(r, 10));
    await svc.update(a.id, { expectedAutoSaveVersion: 0, body: 'a2' });
    await new Promise((r) => setTimeout(r, 10));
    await svc.update(c.id, { expectedAutoSaveVersion: 0, body: 'c2' });

    const out = await svc.list();
    expect(out.map((n) => n.id)).toEqual([b.id, c.id, a.id]);
  });

  it('filters by state and kind', async () => {
    const n1 = await svc.create({ body: 'd1' });
    const n2 = await svc.create({ body: 'd2', state: 'active' });
    const n3 = await svc.create({ body: '# daily\nreflect', state: 'active' });
    expect(n3.kind).toBe('daily');

    const onlyActive = await svc.list({ state: 'active' });
    expect(onlyActive.map((n) => n.id).sort()).toEqual([n2.id, n3.id].sort());

    const onlyDraft = await svc.list({ state: 'draft' });
    expect(onlyDraft.map((n) => n.id)).toEqual([n1.id]);

    const onlyDaily = await svc.list({ kind: 'daily' });
    expect(onlyDaily.map((n) => n.id)).toEqual([n3.id]);
  });

  it('text search matches title or body, case-insensitive', async () => {
    await svc.create({ body: 'Discussion about Zhang pricing' });
    await svc.create({ body: 'unrelated body', title: 'ZHU partnership' });
    await svc.create({ body: 'something else' });

    const hit = await svc.list({ q: 'zhang' });
    expect(hit).toHaveLength(1);
    expect(hit[0]!.body).toContain('Zhang pricing');

    const hitTitle = await svc.list({ q: 'zhu' });
    expect(hitTitle).toHaveLength(1);
    expect(hitTitle[0]!.title).toBe('ZHU partnership');
  });
});

// ---------------------------------------------------------------------------
// 9. touchLastOpened
// ---------------------------------------------------------------------------
describe('touchLastOpened', () => {
  it('sets lastOpenedAt to a recent timestamp', async () => {
    const note = await svc.create({ body: 'x' });
    expect(note.lastOpenedAt).toBeUndefined();
    const opened = await svc.touchLastOpened(note.id);
    expect(opened.lastOpenedAt).toBeDefined();
    const ts = new Date(opened.lastOpenedAt!).getTime();
    expect(Number.isFinite(ts)).toBe(true);
    expect(Math.abs(Date.now() - ts)).toBeLessThan(5_000);
  });

  it('throws NoteNotFoundError for an unknown id', async () => {
    await expect(svc.touchLastOpened('note_does_not_exist_at_all')).rejects.toBeInstanceOf(NoteNotFoundError);
  });
});

// ---------------------------------------------------------------------------
// 10. archive
// ---------------------------------------------------------------------------
describe('archive', () => {
  it('transitions state to archived and persists', async () => {
    const note = await svc.create({ body: 'x' });
    expect(note.state).toBe('draft');
    const arch = await svc.archive(note.id);
    expect(arch.state).toBe('archived');
    const reloaded = await repo.getNoteDocument(note.id);
    expect(reloaded?.state).toBe('archived');
  });
});

// ---------------------------------------------------------------------------
// 11-12. delete cascade + backlinks
// ---------------------------------------------------------------------------
describe('delete and backlinks', () => {
  it('deletes a note (cascade to evidence is currently broken; see report)', async () => {
    const note = await svc.create({ body: 'note body' });
    // Build valid evidence anchored to the note.
    const ev: Evidence = {
      id: 'ev_01KAAAAAAAAAAAAAAAA',
      schemaVersion: 1,
      createdAt: '2026-07-19T11:00:00+08:00',
      updatedAt: '2026-07-19T11:00:00+08:00',
      createdBy: 'user',
      workspaceId: 'ws_test',
      noteId: note.id,
      quote: 'note body',
      locator: { kind: 'note_block', blockId: 'block_aaa_aaaa', start: 0, end: 9 },
      sourceContentHash: 'deadbeefdeadbeef',
      stale: false,
    };
    const writeResult = await repo.saveEvidence(ev);
    const evidenceFilePath = writeResult.filePath;
    expect(await fileExists(evidenceFilePath)).toBe(true);

    const ok = await svc.delete(note.id);
    expect(ok).toBe(true);

    // Note is gone (logical + on disk).
    expect(await repo.getNoteDocument(note.id)).toBeNull();
    // KNOWN BUG (do NOT fix in this PR): deleteNoteDocument uses
    // listEvidenceForNote to find evidence anchored to the deleted
    // note, but listEvidence only walks the root-level notes/_evidence/
    // directory and never finds the per-month _evidence/ files that
    // saveEvidence actually writes. As of 1.1.3, listEvidence walks
    // the whole notes tree and filters on the `_evidence/` path
    // component, so the cascade now succeeds and the per-note
    // evidence file is removed alongside the note.
    expect(await fileExists(evidenceFilePath)).toBe(false);
  });

  it('delete returns false for a non-existent note', async () => {
    const ok = await svc.delete('note_01KZZZZZZZZZZZZZZ');
    expect(ok).toBe(false);
  });

  it('backlinks returns evidenceIds (empty if no evidence)', async () => {
    // Spec §5.2: backlinks returns the evidenceIds anchored to a note.
    // When no evidence is anchored, the list is empty — verified here.
    // The populated case cannot be exercised end-to-end today because
    // repo.listEvidence() does not walk the per-month notes/_evidence/
    // partition where saveEvidence writes (see report).
    const note = await svc.create({ body: 'no evidence' });
    const bl = await svc.backlinks(note.id);
    expect(bl.noteId).toBe(note.id);
    expect(bl.evidenceIds).toEqual([]);
    expect(bl.commitmentIds).toEqual([]);
    expect(bl.decisionIds).toEqual([]);
    expect(bl.outcomeIds).toEqual([]);
  });

  it('backlinks includes tasks explicitly linked from the note', async () => {
    const note = await svc.create({
      body: 'Task context',
      commitmentIds: ['com_01KAAAAAAAAAAAAAAAA'],
    });
    const bl = await svc.backlinks(note.id);
    expect(bl.commitmentIds).toEqual(['com_01KAAAAAAAAAAAAAAAA']);
  });
});

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// 13. Markdown round-trip
// ---------------------------------------------------------------------------
describe('markdown round-trip', () => {
  it('preserves body and frontmatter across save → list → get', async () => {
    // Note: we use a single-line body here. The serializer's
    // yamlString helper collapses `\n` → space when writing into the
    // frontmatter `body` field, so multi-line bodies don't survive
    // round-trip cleanly today. This is a known source issue — see
    // report. We cover the rest of the round-trip contract here.
    const created = await svc.create({
      body: 'single line body for round-trip',
      kind: 'meeting',
      state: 'active',
      title: 'Roundtrip',
      pinned: true,
      tagIds: ['demo'],
      commitmentIds: ['com_01KAAAAAAAAAAAAAAAA'],
    });

    const all: NoteDocument[] = await repo.listNoteDocuments();
    const found = all.find((n) => n.id === created.id);
    expect(found).toBeDefined();
    expect(found!.title).toBe('Roundtrip');
    expect(found!.body).toBe('single line body for round-trip');
    expect(found!.kind).toBe('meeting');
    expect(found!.state).toBe('active');
    expect(found!.pinned).toBe(true);
    expect(found!.tagIds).toEqual(['demo']);
    expect(found!.commitmentIds).toEqual(['com_01KAAAAAAAAAAAAAAAA']);
    expect(found!.autoSaveVersion).toBe(0);
    expect(found!.contentHash).toBe(created.contentHash);

    // The same note is reachable by id and matches.
    const got = await svc.get(created.id);
    expect(got.id).toBe(created.id);
    expect(got.body).toBe(created.body);
    expect(got.contentHash).toBe(created.contentHash);

    // tryGet returns null for absent ids.
    expect(await svc.tryGet('note_01KXXXXXXXXXXXXXX')).toBeNull();

    // get throws NoteNotFoundError for absent ids.
    await expect(svc.get('note_01KXXXXXXXXXXXXXX')).rejects.toBeInstanceOf(NoteNotFoundError);
  });
});

// ---------------------------------------------------------------------------
// 14. ConcurrentModificationError re-export identity
// ---------------------------------------------------------------------------
describe('ConcurrentModificationError re-export', () => {
  it('the class re-exported by noteService is the same class as in atomicWrite', () => {
    expect(ConcurrentModificationError).toBe(RepoConcurrentModificationError);
    // Sanity: instanceof still works end-to-end on a thrown error.
    const e = new ConcurrentModificationError('p', 'h1', 'h2');
    expect(e).toBeInstanceOf(RepoConcurrentModificationError);
    expect(e.code).toBe('concurrent_modification');
  });
});
