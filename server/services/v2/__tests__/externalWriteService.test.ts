/**
 * Tests for External Write service (Phase 8).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { bootstrapV2 } from '../workspaceContext';
import { createCommitment } from '../commitmentService';
import {
  buildDraft,
  confirmAndSend,
  blockedSendImpl,
  buildIdempotencyKey,
  buildDefaultDraftBody,
} from '../externalWriteService';
import { V2Repository } from '../../../repositories/v2/repository';

let workspace: string;
let repo: V2Repository;
let workspaceId: string;

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'df-v2-ext-'));
  const b = await bootstrapV2({ workspaceRoot: workspace, workspaceId: 'ws_test' });
  repo = b.repo;
  workspaceId = b.ctx.workspaceId;
});

afterEach(async () => {
  await fs.rm(workspace, { recursive: true, force: true });
});

describe('External Write service (Phase 8)', () => {
  it('buildIdempotencyKey is stable for same inputs', () => {
    const a = buildIdempotencyKey('c1', 'a@b.com', 'hello');
    const b = buildIdempotencyKey('c1', 'a@b.com', 'hello');
    expect(a).toBe(b);
    const c = buildIdempotencyKey('c1', 'a@b.com', 'hello2');
    expect(c).not.toBe(a);
  });

  it('buildDefaultDraftBody produces expected sections', () => {
    const c = {
      id: 'c1',
      schemaVersion: 1 as const,
      createdAt: '',
      updatedAt: '',
      createdBy: 'user' as const,
      workspaceId: 'w',
      title: 'Send plan',
      outcome: 'Zhang gets the plan',
      state: 'active' as const,
      evidenceIds: [],
      sourceIds: [],
    };
    const followUp = buildDefaultDraftBody(c, 'follow_up');
    expect(followUp).toContain('Send plan');
    expect(followUp).toContain('Zhang gets the plan');
    expect(followUp).toContain('DailyFlow');
  });

  it('buildDraft persists a draft file', async () => {
    const c = await createCommitment(repo, workspaceId, {
      title: 'Send plan to Zhang',
      outcome: 'Zhang receives the plan',
      state: 'active',
    });
    const draft = await buildDraft(repo, {
      commitment: c,
      kind: 'email',
      recipient: 'zhang@example.com',
      template: 'follow_up',
    });
    expect(draft.id).toBeDefined();
    expect(draft.idempotencyKey).toBeDefined();
    expect(draft.status).toBe('draft');
    const file = await fs.readFile(`${workspace}/.dailyflow/external-drafts/${draft.id}.json`, 'utf8');
    const parsed = JSON.parse(file);
    expect(parsed.subject).toContain('Send plan');
  });

  it('confirmAndSend with blockedSendImpl marks draft failed', async () => {
    const c = await createCommitment(repo, workspaceId, {
      title: 'Send',
      outcome: 'done',
      state: 'active',
    });
    const draft = await buildDraft(repo, {
      commitment: c,
      kind: 'email',
      recipient: 'x@y.com',
      template: 'follow_up',
    });
    const r = await confirmAndSend(repo, draft.id, blockedSendImpl);
    expect(r.ok).toBe(false);
    expect(r.draft.status).toBe('failed');
    expect(r.draft.failureReason).toBe('external_authorization');
  });

  it('confirmAndSend with a successful send impl marks sent', async () => {
    const c = await createCommitment(repo, workspaceId, {
      title: 'Send',
      outcome: 'done',
      state: 'active',
    });
    const draft = await buildDraft(repo, {
      commitment: c,
      kind: 'email',
      recipient: 'x@y.com',
      template: 'follow_up',
    });
    const r = await confirmAndSend(repo, draft.id, async () => ({ upstreamRef: 'gmail-msg-123' }));
    expect(r.ok).toBe(true);
    expect(r.draft.status).toBe('sent');
    expect(r.draft.upstreamRef).toBe('gmail-msg-123');
  });

  it('second send is rejected (idempotency)', async () => {
    const c = await createCommitment(repo, workspaceId, {
      title: 'Send',
      outcome: 'done',
      state: 'active',
    });
    const draft = await buildDraft(repo, {
      commitment: c,
      kind: 'email',
      recipient: 'x@y.com',
      template: 'follow_up',
    });
    const r1 = await confirmAndSend(repo, draft.id, async () => ({ upstreamRef: 'one' }));
    expect(r1.ok).toBe(true);
    const r2 = await confirmAndSend(repo, draft.id, async () => ({ upstreamRef: 'two' }));
    expect(r2.ok).toBe(false);
    expect(r2.reason).toBe('already_sent');
  });
});
