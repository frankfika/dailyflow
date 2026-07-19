/**
 * Capture service (DF2-003).
 *
 * Saves raw user input as a SourceItem. No AI is invoked here — the source
 * must always be persisted before any extraction begins. This is the
 * spec §4 / §13.4 contract: "原始内容立即保存在本地 Inbox".
 *
 * The UI calls capture() immediately on every quick-capture / paste / drop
 * event, then asynchronously calls process() to extract structured items.
 */
import crypto from 'crypto';
import { z } from 'zod';
import type { V2Repository } from '../../repositories/v2/repository.js';
import { newId } from '../../domain/v2/ulid.js';
import {
  SourceItemSchema,
  type SourceItem,
  type SourceKind,
} from '../../domain/v2/types.js';

export const CaptureInputSchema = z.object({
  kind: z.enum(['quick_capture', 'markdown', 'meeting_audio', 'meeting_transcript', 'file']),
  title: z.string().max(500).optional(),
  body: z.string().min(1).max(500_000),
  occurredAt: z.string().datetime({ offset: true }).optional(),
  sensitivity: z.enum(['normal', 'private', 'restricted']).optional(),
  language: z.enum(['zh', 'en', 'mixed']).optional(),
  meta: z.record(z.unknown()).optional(),
  /** Workspace id; falls back to repo workspaceId. */
  workspaceId: z.string().optional(),
});
export type CaptureInput = z.infer<typeof CaptureInputSchema>;

export interface CaptureResult {
  source: SourceItem;
  contentHash: string;
}

export function buildSourceItem(input: CaptureInput, workspaceId: string, now = new Date()): SourceItem {
  const contentHash = sha256(input.body);
  const item: SourceItem = {
    id: newId('src'),
    schemaVersion: 1,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    createdBy: 'user',
    workspaceId,
    kind: input.kind as SourceKind,
    title: input.title,
    body: input.body,
    occurredAt: input.occurredAt ?? now.toISOString(),
    contentHash,
    processingStatus: 'saved',
    sensitivity: input.sensitivity ?? 'normal',
    language: input.language,
    meta: input.meta as SourceItem['meta'],
  };
  // Validate before returning
  return SourceItemSchema.parse(item);
}

export async function capture(repo: V2Repository, input: CaptureInput): Promise<CaptureResult> {
  const parsed = CaptureInputSchema.parse(input);
  const workspaceId = parsed.workspaceId ?? (await repo.audit.readAll())[0]?.workspaceId;
  if (!workspaceId) throw new Error('Workspace id is not configured.');
  const item = buildSourceItem(parsed, workspaceId);
  const result = await repo.saveSourceItem(item, {
    auditKind: 'capture',
    auditActor: 'user',
    auditEntity: { type: 'source', id: item.id },
    auditData: { kind: item.kind, bytes: item.body?.length ?? 0, hash: item.contentHash },
    occurredAt: item.occurredAt,
  });
  return { source: item, contentHash: result.contentHash };
}

export function sha256(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}
