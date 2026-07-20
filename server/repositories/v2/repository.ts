/**
 * v2 Repository — single entry point for persisting and reading v2 entities.
 *
 * Spec §13.3:
 *   - Route 只做校验、鉴权边界和响应映射.
 *   - Domain Service implements state machine and business rules.
 *   - Repository 负责 Markdown、SQLite 和审计日志的一致性.
 *
 * In v1.x of the AI-Native product, the SQLite index is **not** built yet;
 * the Markdown file plus the audit log are the durable story. The Repository
 * owns the atomic-write protocol and the audit append for every mutation.
 */
import fs from 'fs/promises';
import path from 'path';
import { deriveLayout, entityPath, type V2Layout } from './paths.js';
import { atomicWrite, readWithHash, sha256, type AtomicWriteResult } from './atomicWrite.js';
import { AuditLog, type AuditEventKind, type AuditEvent } from './audit.js';
import { parseFrontmatter, snakeToCamel } from './markdownParser.js';
import {
  serializeSourceItem,
  serializeCommitment,
  serializeEvidence,
  serializeNoteDocument,
  serializeOutcome,
  serializeProject,
  serializePerson,
  serializeOrganization,
  serializeDecision,
  serializePlan,
  serializeProposal,
  serializeAgentRun,
} from './markdownSerializer.js';
import { parseFrontmatter as _parse } from './markdownParser.js';
import {
  SourceItemSchema,
  CommitmentSchema,
  EvidenceSchema,
  NoteDocumentSchema,
  OutcomeSchema,
  ProjectSchema,
  PersonSchema,
  OrganizationSchema,
  DecisionSchema,
  DailyPlanSchema,
  ProposalSchema,
  AgentRunSchema,
  type AnyV2Entity,
  type SourceItem,
  type Commitment,
  type Evidence,
  type NoteDocument,
  type Outcome,
  type Project,
  type Person,
  type Organization,
  type Decision,
  type DailyPlan,
  type Proposal,
  type AgentRun,
} from '../../domain/v2/types.js';
import type { ZodTypeAny } from 'zod';
import { ZodError } from 'zod';

export interface WorkspaceContext {
  root: string;
  workspaceId: string;
}

export interface WriteOptions {
  /** expectedHash from the previous read; triggers conflict if mismatched. */
  expectedHash?: string;
  /** Audit event kind; if absent, no audit is written. */
  auditKind?: AuditEventKind;
  auditData?: Record<string, unknown>;
  auditActor?: 'user' | 'ai' | 'connector' | 'system' | 'migration';
  auditEntity?: { type: string; id: string };
  /** Mark a SourceItem with occurredAt to control Inbox folder layout. */
  occurredAt?: string;
}

export class V2Repository {
  readonly layout: V2Layout;
  readonly audit: AuditLog;

  constructor(private readonly ctx: WorkspaceContext) {
    this.layout = deriveLayout(ctx.root);
    this.audit = new AuditLog(this.layout, ctx.workspaceId);
  }

  // -------------------------------------------------------------------------
  // SourceItem
  // -------------------------------------------------------------------------

  async saveSourceItem(s: SourceItem, opts: WriteOptions = {}): Promise<AtomicWriteResult> {
    const validated = SourceItemSchema.parse(s);
    const filePath = entityPath(this.layout, 'source', '', validated.id, opts.occurredAt ?? validated.occurredAt ?? validated.createdAt);
    const content = serializeSourceItem(validated);
    const result = await atomicWrite({ filePath, content, expectedHash: opts.expectedHash });
    await this.appendAudit(opts, result);
    return result;
  }

  async listSourceItems(): Promise<SourceItem[]> {
    return this.listAll('source', SourceItemSchema, this.layout.inbox);
  }

  async getSourceItem(id: string): Promise<SourceItem | null> {
    return this.findById('source', SourceItemSchema, id, this.layout.inbox);
  }

  async deleteSourceItem(id: string): Promise<boolean> {
    const item = await this.getSourceItem(id);
    if (!item) return false;
    const filePath = entityPath(this.layout, 'source', '', id, item.occurredAt ?? item.createdAt);
    await fs.unlink(filePath);
    await this.audit.append({
      kind: 'commitment.update',
      actor: 'system',
      data: { action: 'delete_source', id },
      entity: { type: 'source', id },
    });
    return true;
  }

  // -------------------------------------------------------------------------
  // Commitment
  // -------------------------------------------------------------------------

  async saveCommitment(c: Commitment, opts: WriteOptions = {}): Promise<AtomicWriteResult> {
    const validated = CommitmentSchema.parse(c);
    const filePath = entityPath(this.layout, 'commitment', validated.state, validated.id);
    const content = serializeCommitment(validated);
    const result = await atomicWrite({ filePath, content, expectedHash: opts.expectedHash });
    await this.appendAudit(opts, result);
    return result;
  }

  async listCommitments(): Promise<Commitment[]> {
    const out: Commitment[] = [];
    for (const dir of [
      this.layout.commitments.active,
      this.layout.commitments.planned,
      this.layout.commitments.waiting,
      this.layout.commitments.someday,
      this.layout.commitments.completed,
      this.layout.commitments.cancelled,
      this.layout.commitments.archived,
    ]) {
      out.push(...(await this.listAll('commitment', CommitmentSchema, dir)));
    }
    return out;
  }

  async getCommitment(id: string): Promise<Commitment | null> {
    return this.findById('commitment', CommitmentSchema, id, this.layout.commitments.all);
  }

  // -------------------------------------------------------------------------
  // Evidence
  // -------------------------------------------------------------------------

  async saveEvidence(e: Evidence, opts: WriteOptions = {}): Promise<AtomicWriteResult> {
    const validated = EvidenceSchema.parse(e);
    // Evidence lives in the same partition as the entity it anchors.
    // sourceId → meetings/YYYY/MM/ ; noteId → notes/YYYY/MM/_evidence/.
    // Co-locating makes per-note evidence listing O(small) without a
    // global index.
    const filePath = validated.noteId
      ? entityPath(this.layout, 'note_evidence', '', validated.id, validated.createdAt)
      : entityPath(this.layout, 'meeting', '', validated.id, validated.createdAt);
    const content = serializeEvidence(validated);
    const result = await atomicWrite({ filePath, content, expectedHash: opts.expectedHash });
    await this.appendAudit(opts, result);
    return result;
  }

  async listEvidence(): Promise<Evidence[]> {
    // Evidence is split across two trees. Concatenate, dedupe by id.
    const meetings: Evidence[] = await this.listAll<Evidence>('evidence', EvidenceSchema, this.layout.meetings);
    // Notes-anchored evidence is partitioned by YYYY/MM inside
    // `.dailyflow/notes/` (mirroring the note body layout), so we
    // walk the whole notes tree and pick up files inside any
    // `_evidence/` subdirectory. The two helpers below stay
    // local to this method to keep the rest of the repo unaware
    // of the partition shape.
    const notesEvidence: Evidence[] = [];
    const allNoteFiles = await listFilesRecursive(this.layout.notes, ['.md']);
    for (const filePath of allNoteFiles) {
      // Only pick up files inside any `_evidence/` subdir; the
      // bodies themselves are not evidence.
      if (!filePath.includes(`${path.sep}_evidence${path.sep}`)) continue;
      try {
        const text = await fs.readFile(filePath, 'utf8');
        const { data } = _parse(text);
        const normalized = snakeToCamel<Record<string, unknown>>(data);
        const parsed = EvidenceSchema.safeParse(normalized);
        if (parsed.success) notesEvidence.push(parsed.data);
      } catch {
        // Skip unreadable evidence files; surface as a separate audit later.
      }
    }
    const seen = new Set<string>();
    const out: Evidence[] = [];
    for (const e of [...meetings, ...notesEvidence]) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      out.push(e);
    }
    return out;
  }

  async listEvidenceForNote(noteId: string): Promise<Evidence[]> {
    const all = await this.listEvidence();
    return all.filter((e) => e.noteId === noteId);
  }

  // -------------------------------------------------------------------------
  // NoteDocument
  // -------------------------------------------------------------------------
  //
  // Notes are the user's primary working surface (spec §5.2 / §7.3 / F-02A).
  // They are persisted to `.dailyflow/notes/YYYY/MM/<id>.md` so the v2
  // notes tree is fully isolated from the v1 `Notes/` legacy tree.

  async saveNoteDocument(n: NoteDocument, opts: WriteOptions = {}): Promise<AtomicWriteResult> {
    const validated = NoteDocumentSchema.parse(n);
    // Notes partition by their `date` when present, else fall back to
    // createdAt. The YYYY/MM partition makes month-range scans cheap.
    const partitionDate = validated.date ?? validated.createdAt;
    const filePath = entityPath(this.layout, 'note', '', validated.id, partitionDate);
    const content = serializeNoteDocument(validated);
    const result = await atomicWrite({ filePath, content, expectedHash: opts.expectedHash });
    await this.appendAudit(opts, result);
    return result;
  }

  async getNoteDocument(id: string): Promise<NoteDocument | null> {
    // The notes tree is partitioned by month; findById walks recursively
    // under `root` so a single call covers every YYYY/MM subfolder.
    return this.findById('note', NoteDocumentSchema, id, this.layout.notes);
  }

  async listNoteDocuments(opts: { state?: 'draft' | 'active' | 'archived' } = {}): Promise<NoteDocument[]> {
    // Notes are partitioned by YYYY/MM under `notes/`. listAll only walks
    // a single directory, so for notes we use listFilesRecursive and
    // parse each frontmatter through the schema (skipping malformed
    // files — they're v1 leftovers in a sibling tree or partial writes).
    const files = await listFilesRecursive(this.layout.notes, ['.md']);
    const out: NoteDocument[] = [];
    for (const f of files) {
      // Skip the per-month _evidence/ subdirs — those are evidence files,
      // not note bodies, and their frontmatter is for Evidence not Note.
      if (f.includes(`${path.sep}_evidence${path.sep}`)) continue;
      try {
        const text = await fs.readFile(f, 'utf8');
        const { data, body } = parseFrontmatter(text);
        if (!data || typeof data !== 'object') continue;
        const d = data as Record<string, unknown>;
        if (d.type !== 'note') continue;
        // NoteDocumentSchema requires `body`. As of 1.1.3 the
        // serializer writes body to the markdown section only (the
        // frontmatter YAML scalar encoding collapses newlines, which
        // would mangle multi-paragraph notes). We trim the trailing
        // \n the serializer adds so the round-trip is lossless.
        const dataWithBody =
          d.body === undefined || d.body === null || d.body === ''
            ? { ...d, body: body.replace(/\n$/, '') }
            : d;
        const normalized = snakeToCamel<Record<string, unknown>>(dataWithBody);
        const parsed = NoteDocumentSchema.safeParse(normalized);
        if (parsed.success) out.push(parsed.data);
      } catch {
        // Malformed file: skip silently. Audit can surface later if needed.
      }
    }
    if (!opts.state) return out;
    return out.filter((n) => n.state === opts.state);
  }

  async deleteNoteDocument(id: string): Promise<boolean> {
    const note = await this.getNoteDocument(id);
    if (!note) return false;
    const partitionDate = note.date ?? note.createdAt;
    const filePath = entityPath(this.layout, 'note', '', id, partitionDate);
    await fs.unlink(filePath);
    // Also drop any evidence anchored to this note — orphans are
    // misleading and we have a backref (noteId) to find them.
    const evidence = await this.listEvidenceForNote(id);
    for (const e of evidence) {
      try {
        const evPath = entityPath(this.layout, 'note_evidence', '', e.id, e.createdAt);
        await fs.unlink(evPath);
      } catch {
        // Best-effort cleanup; the audit log captures the action.
      }
    }
    await this.audit.append({
      kind: 'commitment.update',
      actor: 'system',
      data: { action: 'delete_note', id },
      entity: { type: 'note', id },
    });
    return true;
  }

  // -------------------------------------------------------------------------
  // Outcome
  // -------------------------------------------------------------------------

  async saveOutcome(o: Outcome, opts: WriteOptions = {}): Promise<AtomicWriteResult> {
    const validated = OutcomeSchema.parse(o);
    const filePath = entityPath(this.layout, 'outcome', '', validated.id, validated.createdAt);
    const content = serializeOutcome(validated);
    const result = await atomicWrite({ filePath, content, expectedHash: opts.expectedHash });
    await this.appendAudit(opts, result);
    return result;
  }

  async listOutcomes(): Promise<Outcome[]> {
    return this.listAll('outcome', OutcomeSchema, this.layout.outcomes);
  }

  // -------------------------------------------------------------------------
  // Project / Person / Organization / Decision
  // -------------------------------------------------------------------------

  async saveProject(p: Project, opts: WriteOptions = {}): Promise<AtomicWriteResult> {
    const validated = ProjectSchema.parse(p);
    const filePath = entityPath(this.layout, 'project', '', validated.id);
    const content = serializeProject(validated);
    const result = await atomicWrite({ filePath, content, expectedHash: opts.expectedHash });
    await this.appendAudit(opts, result);
    return result;
  }

  async listProjects(): Promise<Project[]> {
    return this.listAll('project', ProjectSchema, this.layout.projects);
  }

  async savePerson(p: Person, opts: WriteOptions = {}): Promise<AtomicWriteResult> {
    const validated = PersonSchema.parse(p);
    const filePath = entityPath(this.layout, 'person', '', validated.id);
    const content = serializePerson(validated);
    const result = await atomicWrite({ filePath, content, expectedHash: opts.expectedHash });
    await this.appendAudit(opts, result);
    return result;
  }

  async listPeople(): Promise<Person[]> {
    return this.listAll('person', PersonSchema, this.layout.people);
  }

  async saveOrganization(o: Organization, opts: WriteOptions = {}): Promise<AtomicWriteResult> {
    const validated = OrganizationSchema.parse(o);
    const filePath = entityPath(this.layout, 'meeting', '', validated.id, validated.createdAt);
    const content = serializeOrganization(validated);
    const result = await atomicWrite({ filePath, content, expectedHash: opts.expectedHash });
    await this.appendAudit(opts, result);
    return result;
  }

  async listOrganizations(): Promise<Organization[]> {
    return this.listAll('organization', OrganizationSchema, this.layout.meetings);
  }

  async saveDecision(d: Decision, opts: WriteOptions = {}): Promise<AtomicWriteResult> {
    const validated = DecisionSchema.parse(d);
    const filePath = entityPath(this.layout, 'decision', '', validated.id);
    const content = serializeDecision(validated);
    const result = await atomicWrite({ filePath, content, expectedHash: opts.expectedHash });
    await this.appendAudit(opts, result);
    return result;
  }

  async listDecisions(): Promise<Decision[]> {
    return this.listAll('decision', DecisionSchema, this.layout.decisions);
  }

  // -------------------------------------------------------------------------
  // DailyPlan
  // -------------------------------------------------------------------------

  async savePlan(p: DailyPlan, opts: WriteOptions = {}): Promise<AtomicWriteResult> {
    const validated = DailyPlanSchema.parse(p);
    const filePath = entityPath(this.layout, 'plan', validated.date, validated.id, validated.date);
    const content = serializePlan(validated);
    const result = await atomicWrite({ filePath, content, expectedHash: opts.expectedHash });
    await this.appendAudit(opts, result);
    return result;
  }

  async getPlanByDate(date: string): Promise<DailyPlan | null> {
    const filePath = entityPath(this.layout, 'plan', date, '', date);
    try {
      const text = await fs.readFile(filePath, 'utf8');
      const { data } = parseFrontmatter(text);
      const normalized = snakeToCamel<Record<string, unknown>>(data);
      return DailyPlanSchema.parse(normalized) as DailyPlan;
    } catch (err: any) {
      if (err && err.code === 'ENOENT') return null;
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // Proposal
  // -------------------------------------------------------------------------

  async saveProposal(p: Proposal, opts: WriteOptions = {}): Promise<AtomicWriteResult> {
    const validated = ProposalSchema.parse(p);
    const filePath = entityPath(this.layout, 'proposal', '', validated.id);
    const content = serializeProposal(validated);
    const result = await atomicWrite({ filePath, content, expectedHash: opts.expectedHash });
    await this.appendAudit(opts, result);
    return result;
  }

  async listProposals(): Promise<Proposal[]> {
    return this.listAll('proposal', ProposalSchema, this.layout.proposals);
  }

  async getProposal(id: string): Promise<Proposal | null> {
    return this.findById('proposal', ProposalSchema, id, this.layout.proposals);
  }

  // -------------------------------------------------------------------------
  // AgentRun (json, not markdown)
  // -------------------------------------------------------------------------

  async saveAgentRun(r: AgentRun, opts: WriteOptions = {}): Promise<AtomicWriteResult> {
    const validated = AgentRunSchema.parse(r);
    const filePath = entityPath(this.layout, 'run', '', validated.id);
    const content = serializeAgentRun(validated);
    const result = await atomicWrite({ filePath, content, expectedHash: opts.expectedHash });
    await this.appendAudit(opts, result);
    return result;
  }

  async listAgentRuns(): Promise<AgentRun[]> {
    try {
      const files = await listFiles(this.layout.runs, '.json');
      const out: AgentRun[] = [];
      for (const f of files) {
        try {
          const text = await fs.readFile(f, 'utf8');
          out.push(AgentRunSchema.parse(JSON.parse(text)));
        } catch (err) {
          // Skip malformed but do not throw — keeps resilience high
          if (!(err instanceof ZodError)) throw err;
        }
      }
      return out;
    } catch (err: any) {
      if (err && err.code === 'ENOENT') return [];
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // Index rebuild
  // -------------------------------------------------------------------------

  async rebuildIndex(): Promise<{ scanned: number; entities: number }> {
    let scanned = 0;
    let entities = 0;
    for (const dir of [
      this.layout.inbox,
      this.layout.commitments.all,
      this.layout.meetings,
      this.layout.outcomes,
      this.layout.people,
      this.layout.organizations,
      this.layout.projects,
      this.layout.plans,
      this.layout.decisions,
      this.layout.proposals,
    ]) {
      const files = await listFilesRecursive(dir, ['.md']);
      scanned += files.length;
      for (const f of files) {
        try {
          const text = await fs.readFile(f, 'utf8');
          const { data } = parseFrontmatter(text);
          if (data && typeof data === 'object' && 'id' in data && 'type' in data) {
            entities++;
          }
        } catch {
          /* ignore */
        }
      }
    }
    return { scanned, entities };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async appendAudit(opts: WriteOptions, result: AtomicWriteResult): Promise<AuditEvent | null> {
    if (!opts.auditKind) return null;
    return this.audit.append({
      kind: opts.auditKind,
      actor: opts.auditActor ?? 'user',
      actorId: undefined,
      entity: opts.auditEntity,
      data: { ...(opts.auditData ?? {}), filePath: result.filePath, contentHash: result.contentHash },
    });
  }

  private async listAll<T>(kind: string, schema: ZodTypeAny, root: string): Promise<T[]> {
    const files = await listFilesRecursive(root, ['.md']);
    const out: T[] = [];
    for (const f of files) {
      try {
        const text = await fs.readFile(f, 'utf8');
        const { data } = parseFrontmatter(text);
        if (data && typeof data === 'object' && (data as Record<string, unknown>).type === kind) {
          const normalized = snakeToCamel<Record<string, unknown>>(data);
          out.push(schema.parse(normalized) as T);
        }
      } catch (err) {
        if (err instanceof ZodError) {
          // Malformed entity: surface in the response shape, don't fail the
          // entire list. This makes the system resilient to user edits.
          continue;
        }
        throw err;
      }
    }
    return out;
  }

  private async findById<T>(kind: string, schema: ZodTypeAny, id: string, root: string): Promise<T | null> {
    const files = await listFilesRecursive(root, ['.md']);
    for (const f of files) {
      if (!f.endsWith(`_${id.split('_').pop()}.md`)) {
        // Cheap pre-filter; full id match below
      }
      try {
        const text = await fs.readFile(f, 'utf8');
        const { data, body } = parseFrontmatter(text);
        if (data && typeof data === 'object') {
          const d = data as Record<string, unknown>;
          if (d.id === id && d.type === kind) {
            // For NoteDocument, fall back to the markdown body if the
            // frontmatter didn't carry one (1.1.0/1.1.1-era files).
            // We trim the trailing newline that the serializer adds
            // so the round-trip is lossless.
            const dataWithBody =
              kind === 'note' &&
              (d.body === undefined || d.body === null || d.body === '')
                ? { ...d, body: body.replace(/\n$/, '') }
                : d;
            const normalized = snakeToCamel<Record<string, unknown>>(dataWithBody);
            return schema.parse(normalized) as T;
          }
        }
      } catch {
        /* ignore */
      }
    }
    return null;
  }
}

async function listFiles(root: string, ext: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries
      .filter(e => e.isFile() && e.name.endsWith(ext))
      .map(e => path.join(root, e.name));
  } catch (err: any) {
    if (err && err.code === 'ENOENT') return [];
    throw err;
  }
}

async function listFilesRecursive(root: string, exts: string[]): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (err: any) {
      if (err && err.code === 'ENOENT') return;
      throw err;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (e.isFile() && exts.some(ext => e.name.endsWith(ext))) {
        out.push(full);
      }
    }
  }
  await walk(root);
  return out;
}

export { readWithHash, sha256 };
