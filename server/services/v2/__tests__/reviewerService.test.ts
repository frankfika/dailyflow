/**
 * Tests for Reviewer service (Phase 7).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { bootstrapV2 } from '../workspaceContext';
import { createCommitment, transitionCommitment } from '../commitmentService';
import {
  getStaleCommitments,
  getWaitingOverdue,
  generateWeeklyReview,
  buildTriageProposal,
} from '../reviewerService';
import { V2Repository } from '../../../repositories/v2/repository';

let workspace: string;
let repo: V2Repository;
let workspaceId: string;

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'df-v2-reviewer-'));
  const b = await bootstrapV2({ workspaceRoot: workspace, workspaceId: 'ws_test' });
  repo = b.repo;
  workspaceId = b.ctx.workspaceId;
});

afterEach(async () => {
  await fs.rm(workspace, { recursive: true, force: true });
});

describe('Reviewer service (Phase 7)', () => {
  it('flags stale commitments (no progress 14+ days)', async () => {
    const c = await createCommitment(repo, workspaceId, {
      title: 'Old task',
      outcome: 'do it',
      state: 'active',
    });
    // Manually set lastProgressAt to 30 days ago
    const longAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const patched = { ...c, lastProgressAt: longAgo };
    await repo.saveCommitment(patched as Commitment, {
      auditKind: 'commitment.update',
      auditEntity: { type: 'commitment', id: c.id },
    });
    const stale = await getStaleCommitments(repo);
    expect(stale.find(s => s.commitmentId === c.id)).toBeDefined();
  });

  it('flags overdue Waiting items', async () => {
    const future = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const c = await createCommitment(repo, workspaceId, {
      title: 'Will wait',
      outcome: 'wait',
      state: 'active',
    });
    await transitionCommitment(repo, c.id, 'waiting');
    // The waiting commitment was just created so reviewAt is 3 days out by default
    // Force the reviewAt into the past:
    const w = await repo.getCommitment(c.id);
    const past = new Date(Date.now() - 10 * 86_400_000).toISOString();
    await repo.saveCommitment({ ...w!, reviewAt: past }, {
      auditKind: 'commitment.update',
      auditEntity: { type: 'commitment', id: c.id },
    });
    void future;
    const overdue = await getWaitingOverdue(repo);
    expect(overdue.find(o => o.commitmentId === c.id)).toBeDefined();
  });

  it('generates a weekly review digest', async () => {
    await createCommitment(repo, workspaceId, { title: 'A', outcome: 'A', state: 'active' });
    const r = await generateWeeklyReview(repo);
    expect(r.stillOpenCommitments).toBe(1);
    expect(r.suggestions).toBeDefined();
  });

  it('buildTriageProposal returns changes for stale + overdue', async () => {
    const c = await createCommitment(repo, workspaceId, {
      title: 'Will go stale',
      outcome: 'do',
      state: 'active',
    });
    const longAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
    await repo.saveCommitment({ ...c, lastProgressAt: longAgo } as Commitment, {
      auditKind: 'commitment.update',
      auditEntity: { type: 'commitment', id: c.id },
    });
    const prop = await buildTriageProposal(repo, { workspaceId, userId: 'u' });
    expect(prop.changes.length).toBeGreaterThan(0);
  });
});

// local helper type so the test can cast the patched object cleanly
type Commitment = import('../../../domain/v2/types').Commitment;
