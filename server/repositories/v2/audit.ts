/**
 * Append-only audit log for v2 entities (spec §12.2 / §13.4).
 *
 * Every state transition, every AI proposal applied, every conflict, every
 * connector sync is recorded as a JSONL line. The log is intentionally
 * append-only and never used as a primary store; the Markdown files remain
 * the canonical user content.
 *
 * The audit log is the single source of truth for "undo" and for forensics
 * when the SQLite index is dropped and rebuilt.
 */
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { deriveLayout, type V2Layout } from './paths.js';

export type AuditEventKind =
  | 'capture' // SourceItem saved
  | 'process' // AI run started/finished
  | 'proposal.create'
  | 'proposal.accept'
  | 'proposal.reject'
  | 'proposal.expire'
  | 'commitment.create'
  | 'commitment.update'
  | 'commitment.transition'
  | 'commitment.complete'
  | 'commitment.wait'
  | 'outcome.create'
  | 'plan.create'
  | 'plan.accept'
  | 'connector.sync'
  | 'connector.error'
  | 'migrate.dry_run'
  | 'migrate.apply'
  | 'agent.error'
  | 'system.error'
  | 'file.write'
  | 'file.conflict'
  | 'workspace.reset'
  | 'workspace.import';

export interface AuditEvent {
  /** Stable, time-sortable id. */
  id: string;
  ts: string;
  workspaceId: string;
  kind: AuditEventKind;
  entity?: { type: string; id: string };
  actor: 'user' | 'ai' | 'connector' | 'system' | 'migration';
  actorId?: string;
  /** Free-form payload, never contains raw user content beyond IDs. */
  data: Record<string, unknown>;
  prevHash?: string;
  hash?: string;
}

const ZERO_HASH = '0'.repeat(64);

export class AuditLog {
  constructor(private readonly layout: V2Layout, private readonly workspaceId: string) {}

  filePath(): string {
    return this.layout.internal.audit;
  }

  async append(input: Omit<AuditEvent, 'id' | 'ts' | 'workspaceId' | 'hash' | 'prevHash'>): Promise<AuditEvent> {
    const prev = await this.lastHash();
    const event: AuditEvent = {
      id: 'aud_' + crypto.randomBytes(8).toString('hex'),
      ts: new Date().toISOString(),
      workspaceId: this.workspaceId,
      prevHash: prev,
      ...input,
    };
    event.hash = hashEvent(event);
    await fs.mkdir(path.dirname(this.filePath()), { recursive: true });
    await fs.appendFile(this.filePath(), JSON.stringify(event) + '\n', 'utf8');
    return event;
  }

  async readAll(): Promise<AuditEvent[]> {
    try {
      const raw = await fs.readFile(this.filePath(), 'utf8');
      return raw
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line) as AuditEvent);
    } catch (err: any) {
      if (err && err.code === 'ENOENT') return [];
      throw err;
    }
  }

  async eventsFor(entityType: string, entityId: string): Promise<AuditEvent[]> {
    const all = await this.readAll();
    return all.filter(e => e.entity?.type === entityType && e.entity?.id === entityId);
  }

  private async lastHash(): Promise<string> {
    try {
      const stat = await fs.stat(this.filePath());
      if (stat.size === 0) return ZERO_HASH;
      // Read tail efficiently
      const fd = await fs.open(this.filePath(), 'r');
      try {
        const bufSize = Math.min(stat.size, 64 * 1024);
        const buf = Buffer.alloc(bufSize);
        await fd.read(buf, 0, bufSize, stat.size - bufSize);
        const text = buf.toString('utf8');
        const lastLine = text.split('\n').filter(Boolean).pop();
        if (!lastLine) return ZERO_HASH;
        const parsed = JSON.parse(lastLine) as AuditEvent;
        return parsed.hash ?? ZERO_HASH;
      } finally {
        await fd.close();
      }
    } catch (err: any) {
      if (err && err.code === 'ENOENT') return ZERO_HASH;
      throw err;
    }
  }
}

function hashEvent(e: AuditEvent): string {
  const payload = `${e.id}|${e.ts}|${e.workspaceId}|${e.kind}|${e.actor}|${e.prevHash ?? ''}|${JSON.stringify(e.data)}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export function buildAuditLog(workspaceRoot: string, workspaceId: string): AuditLog {
  return new AuditLog(deriveLayout(workspaceRoot), workspaceId);
}
