/**
 * Tests for the close-loop follow-up detector (spec §26 step 14).
 *
 * The detector runs after a Commitment is completed. It reads the
 * outcome summary, extracts candidate follow-up phrases via pattern
 * matching, and creates a close_loop Proposal. The user reviews and
 * accepts each change.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { bootstrapV2 } from '../workspaceContext';
import { createCommitment, completeWithOutcome, detectFollowUps } from '../commitmentService';
import { applyProposal } from '../proposalService';
import { V2Repository } from '../../../repositories/v2/repository';

let workspace: string;
let repo: V2Repository;
let workspaceId: string;

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'df-v2-followup-'));
  const b = await bootstrapV2({ workspaceRoot: workspace, workspaceId: 'ws_test' });
  repo = b.repo;
  workspaceId = b.ctx.workspaceId;
});

afterEach(async () => {
  await fs.rm(workspace, { recursive: true, force: true });
});

describe('detectFollowUps (pure)', () => {
  it('returns [] for empty / too-short input', () => {
    expect(detectFollowUps('')).toEqual([]);
    expect(detectFollowUps('   ')).toEqual([]);
    expect(detectFollowUps('hi')).toEqual([]);
  });

  it('catches Chinese commitment phrases', () => {
    const cands = detectFollowUps('方案已发出。还需要在周五前确认报价。');
    expect(cands.length).toBeGreaterThan(0);
    expect(cands[0]!.title).toMatch(/需要/);
  });

  it('catches English follow-up markers', () => {
    const cands = detectFollowUps('Email sent. TODO: schedule a follow-up call next week.');
    expect(cands.length).toBeGreaterThan(0);
    expect(cands.some(c => /TODO|follow[\s-]?up/i.test(c.title))).toBe(true);
  });

  it('deduplicates overlapping matches', () => {
    const cands = detectFollowUps('需要确认。需要确认。需要确认。');
    const titles = cands.map(c => c.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('caps result count at 5', () => {
    const cands = detectFollowUps(
      '需要1。需要2。需要3。需要4。需要5。需要6。需要7。需要8。'
    );
    expect(cands.length).toBeLessThanOrEqual(5);
  });

  it('attaches confidence <= 0.7 (never inflated for pattern matches)', () => {
    const cands = detectFollowUps('TODO follow up next step. Will need to.');
    for (const c of cands) {
      expect(c.confidence).toBeGreaterThan(0);
      expect(c.confidence).toBeLessThanOrEqual(0.7);
    }
  });

  it('always includes a quote from the input verbatim', () => {
    const summary = '报告已提交。还需要给客户发一封跟进邮件。';
    const cands = detectFollowUps(summary);
    expect(cands.length).toBeGreaterThan(0);
    for (const c of cands) {
      expect(summary).toContain(c.quote);
    }
  });
});

describe('completeWithOutcome → close_loop Proposal (§26 step 14)', () => {
  it('creates a close_loop proposal when outcome mentions follow-up work', async () => {
    const c = await createCommitment(repo, workspaceId, {
      title: 'Send updated proposal to Zhang',
      outcome: 'Zhang receives the proposal',
      state: 'active',
    });
    const r = await completeWithOutcome(repo, c.id, {
      outcomeKind: 'sent',
      outcomeSummary: '邮件已发送。还需要在周五前跟 Zhang 确认报价细节。',
    });
    expect(r.commitment.state).toBe('completed');
    expect(r.followUpProposal).not.toBeNull();
    expect(r.followUpProposal!.candidateCount).toBeGreaterThan(0);
    expect(r.followUpProposal!.changeIds.length).toBe(r.followUpProposal!.candidateCount);

    // The proposal must exist on disk and be pending.
    const allProps = await repo.listProposals();
    const closeLoop = allProps.find(p => p.id === r.followUpProposal!.id);
    expect(closeLoop).toBeDefined();
    expect(closeLoop!.kind).toBe('close_loop');
  });

  it('does NOT create a proposal when no follow-up patterns match', async () => {
    const c = await createCommitment(repo, workspaceId, {
      title: 'Quiet completion',
      outcome: 'Done',
      state: 'active',
    });
    const r = await completeWithOutcome(repo, c.id, {
      outcomeKind: 'delivered',
      outcomeSummary: '干净利落地做完了，没什么可说的。',
    });
    expect(r.followUpProposal).toBeNull();
    expect(r.followUpCandidates).toEqual([]);
  });

  it('does NOT create a proposal when caller already provided explicit followUps', async () => {
    const c = await createCommitment(repo, workspaceId, {
      title: 'Has explicit follow-ups',
      outcome: 'Done',
      state: 'active',
    });
    const r = await completeWithOutcome(repo, c.id, {
      outcomeKind: 'delivered',
      outcomeSummary: '邮件已发送。还需要跟进。',
      followUpCommitmentIds: ['com_external_xxx'],
    });
    expect(r.followUpProposal).toBeNull();
  });

  it('suggestFollowUp=false disables the detector', async () => {
    const c = await createCommitment(repo, workspaceId, {
      title: 'Opt-out',
      outcome: 'Done',
      state: 'active',
    });
    const r = await completeWithOutcome(repo, c.id, {
      outcomeKind: 'delivered',
      outcomeSummary: '邮件已发送。还需要跟进。',
      suggestFollowUp: false,
    });
    expect(r.followUpProposal).toBeNull();
  });

  it('the follow-up proposal can be accepted to create a real Commitment', async () => {
    const c = await createCommitment(repo, workspaceId, {
      title: 'Source commitment',
      outcome: 'Done',
      state: 'active',
    });
    const r = await completeWithOutcome(repo, c.id, {
      outcomeKind: 'sent',
      outcomeSummary: '已发送。还需要更新 CRM 记录。',
    });
    expect(r.followUpProposal).not.toBeNull();
    const ar = await applyProposal(repo, r.followUpProposal!.id);
    expect(ar.created.length).toBeGreaterThan(0);
    expect(ar.created[0]!.commitment.state).toBe('inbox');
    expect(ar.created[0]!.commitment.title).toMatch(/CRM/);
  });
});
