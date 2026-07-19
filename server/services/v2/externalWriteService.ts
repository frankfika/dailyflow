/**
 * External write service (Phase 8).
 *
 * Spec §10.3 A4 + §18.4: external writes are HIGH RISK. They:
 *   - Require explicit per-write confirmation.
 *   - Must show a preview of the final content + recipient before send.
 *   - Must use idempotency keys to prevent duplicate sends on retry.
 *   - Must NOT mark a Commitment complete until the network call succeeds.
 *
 * We provide a small scaffolding here that:
 *   - Builds a draft from a Commitment (cover letter / follow-up / invite).
 *   - Persists the draft to .dailyflow/external-drafts/<id>.md.
 *   - Records the idempotency key in the audit log.
 *   - Returns a confirmation token; the actual send is a separate
 *     POST /external-writes/:id/confirm call.
 *
 * The transport layer is intentionally a thin interface; production
 * implementations (Gmail API, Outlook, 飞书) plug in by replacing
 * `sendDraftImpl`. Until then, the transport is blocked.
 */

import crypto from 'crypto';
import { newId } from '../../domain/v2/ulid.js';
import { V2Repository } from '../../repositories/v2/repository.js';
import type { Commitment, Outcome } from '../../domain/v2/types.js';

export type ExternalWriteKind = 'email' | 'message' | 'calendar_event';

export interface ExternalWriteDraft {
  id: string;
  kind: ExternalWriteKind;
  recipient: string | string[];
  subject?: string;
  body: string;
  commitmentId: string;
  /** Stable hash of (commitmentId + recipient + body) used to dedupe retries. */
  idempotencyKey: string;
  createdAt: string;
  expiresAt: string; // draft auto-expires after 24h
  status: 'draft' | 'pending_confirm' | 'sent' | 'failed' | 'expired';
  /** Optional response from the upstream service after send. */
  sentAt?: string;
  upstreamRef?: string;
  failureReason?: string;
}

const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

export function buildIdempotencyKey(commitmentId: string, recipient: string | string[], body: string): string {
  const payload = JSON.stringify({ commitmentId, recipient, body });
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex').slice(0, 32);
}

export interface BuildDraftInput {
  commitment: Commitment;
  kind: ExternalWriteKind;
  recipient: string | string[];
  bodyOverride?: string;
  subjectOverride?: string;
  template?: 'follow_up' | 'send_update' | 'invite' | 'reminder';
}

export function buildDefaultDraftBody(c: Commitment, template: NonNullable<BuildDraftInput['template']>): string {
  switch (template) {
    case 'follow_up':
      return [
        `Hi,`,
        ``,
        `Quick follow-up on: ${c.title}.`,
        ``,
        c.outcome ? `Goal: ${c.outcome}` : '',
        c.dueAt ? `Target: ${new Date(c.dueAt).toDateString()}` : '',
        ``,
        `Let me know if anything has shifted.`,
        ``,
        `Thanks,`,
        `— Sent from DailyFlow`,
      ].filter(Boolean).join('\n');
    case 'send_update':
      return [
        `Sharing an update on: ${c.title}.`,
        ``,
        c.outcome,
        ``,
        c.nextAction ? `Next step on my side: ${c.nextAction}` : '',
        ``,
        `— Sent from DailyFlow`,
      ].filter(Boolean).join('\n');
    case 'invite':
      return [
        `Would love to find a time to align on: ${c.title}.`,
        ``,
        c.outcome,
        ``,
        `What slots work for you in the next 7 days?`,
        ``,
        `— Sent from DailyFlow`,
      ].filter(Boolean).join('\n');
    case 'reminder':
      return [
        `Friendly reminder: ${c.title}`,
        ``,
        c.outcome,
        ``,
        c.dueAt ? `Due: ${new Date(c.dueAt).toDateString()}` : '',
        ``,
        `— Sent from DailyFlow`,
      ].filter(Boolean).join('\n');
  }
}

export async function buildDraft(
  repo: V2Repository,
  input: BuildDraftInput
): Promise<ExternalWriteDraft> {
  const body = input.bodyOverride
    ?? (input.template ? buildDefaultDraftBody(input.commitment, input.template) : input.commitment.outcome);
  const subject = input.subjectOverride
    ?? (input.kind === 'email' ? `Update: ${input.commitment.title}` : undefined);
  const id = newId('run'); // reuse the run id format; not persisted as a Commitment
  const now = new Date();
  const draft: ExternalWriteDraft = {
    id,
    kind: input.kind,
    recipient: input.recipient,
    subject,
    body,
    commitmentId: input.commitment.id,
    idempotencyKey: buildIdempotencyKey(input.commitment.id, input.recipient, body),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + DRAFT_TTL_MS).toISOString(),
    status: 'draft',
  };
  // Persist the draft under .dailyflow/external-drafts/<id>.json
  const fs = await import('fs/promises');
  const dir = `${repo.layout.root}/.dailyflow/external-drafts`;
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(`${dir}/${draft.id}.json`, JSON.stringify(draft, null, 2), 'utf8');
  await repo.audit.append({
    kind: 'commitment.update',
    actor: 'user',
    entity: { type: 'commitment', id: input.commitment.id },
    data: { action: 'build_draft', draftId: draft.id, kind: draft.kind },
  });
  return draft;
}

export interface SendResult {
  ok: boolean;
  draft: ExternalWriteDraft;
  outcome?: Outcome;
  reason?: string;
}

export async function confirmAndSend(
  repo: V2Repository,
  draftId: string,
  sendImpl: (draft: ExternalWriteDraft) => Promise<{ upstreamRef: string } | { error: string }>
): Promise<SendResult> {
  const fs = await import('fs/promises');
  const path = `${repo.layout.root}/.dailyflow/external-drafts/${draftId}.json`;
  let draft: ExternalWriteDraft;
  try {
    const text = await fs.readFile(path, 'utf8');
    draft = JSON.parse(text);
  } catch {
    return {
      ok: false,
      draft: { ...({} as ExternalWriteDraft), id: draftId },
      reason: 'draft_not_found',
    };
  }
  if (new Date(draft.expiresAt) < new Date()) {
    draft.status = 'expired';
    await fs.writeFile(path, JSON.stringify(draft, null, 2), 'utf8');
    return { ok: false, draft, reason: 'draft_expired' };
  }
  if (draft.status === 'sent') {
    return { ok: false, draft, reason: 'already_sent' };
  }

  // Mark as pending; the UI should have already shown the final preview.
  draft.status = 'pending_confirm';
  await fs.writeFile(path, JSON.stringify(draft, null, 2), 'utf8');

  const r = await sendImpl(draft);
  if ('error' in r) {
    draft.status = 'failed';
    draft.failureReason = r.error;
    await fs.writeFile(path, JSON.stringify(draft, null, 2), 'utf8');
    await repo.audit.append({
      kind: 'connector.error',
      actor: 'system',
      entity: { type: 'commitment', id: draft.commitmentId },
      data: { draftId, idempotencyKey: draft.idempotencyKey, reason: r.error },
    });
    return { ok: false, draft, reason: r.error };
  }
  draft.status = 'sent';
  draft.sentAt = new Date().toISOString();
  draft.upstreamRef = r.upstreamRef;
  await fs.writeFile(path, JSON.stringify(draft, null, 2), 'utf8');
  await repo.audit.append({
    kind: 'commitment.update',
    actor: 'user',
    entity: { type: 'commitment', id: draft.commitmentId },
    data: { action: 'send_external', draftId, upstreamRef: r.upstreamRef, idempotencyKey: draft.idempotencyKey },
  });
  return { ok: true, draft };
}

/** No-op send implementation used until the user wires up real credentials. */
export async function blockedSendImpl(_d: ExternalWriteDraft): Promise<{ error: string }> {
  return { error: 'external_authorization' };
}
