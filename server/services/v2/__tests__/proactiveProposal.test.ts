/**
 * Tests for Proactive Proposal (Gap 3 — Sprint 1).
 *
 * Coverage required by the task spec:
 *   1. overdue 5+ day task is detected
 *   2. global kill-switch returns []
 *   3. quiet hours returns []
 *   4. weekly cap returns []
 *   5. accepting a suggestion updates state
 *   6. dismissed proposal is not shown again this week
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { bootstrapV2 } from '../workspaceContext';
import { createCommitment, transitionCommitment } from '../commitmentService';
import {
  DEFAULT_PROACTIVE_CONFIG,
  scanProactiveProposals,
  recordProposalAction,
  recordProposalShown,
  type ProactiveConfig,
  type ProactiveState,
} from '../proactiveProposal';
import { V2Repository } from '../../../repositories/v2/repository';

let workspace: string;
let repo: V2Repository;
let workspaceId: string;
let configFile: string;
let historyFile: string;
let originalConfig: string | undefined;
let originalHistory: string | undefined;

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'df-v2-proactive-'));
  const b = await bootstrapV2({ workspaceRoot: workspace, workspaceId: 'ws_test' });
  repo = b.repo;
  workspaceId = b.ctx.workspaceId;

  // Redirect persistence to per-test files so cases don't bleed.
  configFile = path.join(workspace, 'proactive.json');
  historyFile = path.join(workspace, 'proactive_history.json');
  originalConfig = process.env.DAILYFLOW_PROACTIVE_CONFIG_FILE;
  originalHistory = process.env.DAILYFLOW_PROACTIVE_HISTORY_FILE;
  process.env.DAILYFLOW_PROACTIVE_CONFIG_FILE = configFile;
  process.env.DAILYFLOW_PROACTIVE_HISTORY_FILE = historyFile;
});

afterEach(async () => {
  if (originalConfig === undefined) delete process.env.DAILYFLOW_PROACTIVE_CONFIG_FILE;
  else process.env.DAILYFLOW_PROACTIVE_CONFIG_FILE = originalConfig;
  if (originalHistory === undefined) delete process.env.DAILYFLOW_PROACTIVE_HISTORY_FILE;
  else process.env.DAILYFLOW_PROACTIVE_HISTORY_FILE = originalHistory;
  await fs.rm(workspace, { recursive: true, force: true });
});

const NOON = new Date('2026-08-19T12:00:00.000Z');

async function seedOverdueCommitment(daysOverdue: number): Promise<string> {
  const c = await createCommitment(repo, workspaceId, {
    title: 'Send weekly plan',
    outcome: 'send it',
    state: 'active',
  });
  const dueAt = new Date(NOON.getTime() - daysOverdue * 86_400_000).toISOString();
  const w = await repo.getCommitment(c.id);
  await repo.saveCommitment(
    { ...w!, dueAt } as any,
    { auditKind: 'commitment.update', auditEntity: { type: 'commitment', id: c.id } },
  );
  return c.id;
}

describe('Proactive Proposal (Gap 3)', () => {
  it('detects a task overdue by >= 5 days and returns a proposal', async () => {
    await seedOverdueCommitment(7);
    const proposals = await scanProactiveProposals(
      repo,
      DEFAULT_PROACTIVE_CONFIG,
      { entries: [] },
      'today_load',
      { now: NOON },
    );
    expect(proposals.length).toBe(1);
    expect(proposals[0].kind).toBe('overdue_task');
    expect(proposals[0].severity).toBe('warning');
    expect(proposals[0].body).toContain('7');
    expect(proposals[0].suggestions.map(s => s.action)).toContain('move_to_today');
  });

  it('does NOT generate anything when global enabled === false', async () => {
    await seedOverdueCommitment(10);
    const cfg: ProactiveConfig = { ...DEFAULT_PROACTIVE_CONFIG, enabled: false };
    const proposals = await scanProactiveProposals(
      repo,
      cfg,
      { entries: [] },
      'today_load',
      { now: NOON },
    );
    expect(proposals).toEqual([]);
  });

  it('does NOT generate anything during quiet hours', async () => {
    await seedOverdueCommitment(10);
    // Quiet hours spanning the full day; simulates "always quiet" path.
    const cfg: ProactiveConfig = {
      ...DEFAULT_PROACTIVE_CONFIG,
      quietHours: { start: 0, end: 24 },
    };
    const proposals = await scanProactiveProposals(
      repo,
      cfg,
      { entries: [] },
      'today_load',
      { now: NOON },
    );
    expect(proposals).toEqual([]);
  });

  it('respects the weekly maxPerWeek cap', async () => {
    await seedOverdueCommitment(6);
    await seedOverdueCommitment(7);
    await seedOverdueCommitment(8);
    await seedOverdueCommitment(9);
    const cfg: ProactiveConfig = { ...DEFAULT_PROACTIVE_CONFIG, maxPerWeek: 2 };
    const proposals = await scanProactiveProposals(
      repo,
      cfg,
      { entries: [] },
      'today_load',
      { now: NOON },
    );
    expect(proposals.length).toBe(2);
  });

  it('records accepted suggestions in state', async () => {
    const id = await seedOverdueCommitment(7);
    const proposals = await scanProactiveProposals(
      repo,
      DEFAULT_PROACTIVE_CONFIG,
      { entries: [] },
      'today_load',
      { now: NOON },
    );
    expect(proposals.length).toBe(1);
    const p = proposals[0];
    // Simulate the route handler: first record the show, then the action.
    let state = await recordProposalShown(p, { entries: [] });
    state = await recordProposalAction(p.id, 'accepted', state);
    const entry = state.entries.find(e => e.proposalId === p.id);
    expect(entry).toBeDefined();
    expect(entry!.outcome).toBe('accepted');
    expect(entry!.resolvedAt).toBeDefined();
    expect(entry!.entityId).toBe(id);
  });

  it('does NOT show a dismissed proposal again this week', async () => {
    await seedOverdueCommitment(7);
    const first = await scanProactiveProposals(
      repo,
      DEFAULT_PROACTIVE_CONFIG,
      { entries: [] },
      'today_load',
      { now: NOON },
    );
    expect(first.length).toBe(1);
    // Realistic flow: scan → record show → record dismiss.
    let state = await recordProposalShown(first[0], { entries: [] });
    state = await recordProposalAction(first[0].id, 'dismissed', state);
    const second = await scanProactiveProposals(
      repo,
      DEFAULT_PROACTIVE_CONFIG,
      state,
      'today_load',
      { now: NOON },
    );
    expect(second.length).toBe(0);
  });

  it('detects waiting-review overdue as a stale_commitment', async () => {
    const c = await createCommitment(repo, workspaceId, {
      title: 'Waiting task',
      outcome: 'wait',
      state: 'active',
    });
    await transitionCommitment(repo, c.id, 'waiting');
    const w = await repo.getCommitment(c.id);
    const past = new Date(NOON.getTime() - 8 * 86_400_000).toISOString();
    await repo.saveCommitment(
      { ...w!, reviewAt: past } as any,
      { auditKind: 'commitment.update', auditEntity: { type: 'commitment', id: c.id } },
    );
    const proposals = await scanProactiveProposals(
      repo,
      DEFAULT_PROACTIVE_CONFIG,
      { entries: [] },
      'today_load',
      { now: NOON },
    );
    const stale = proposals.filter(p => p.kind === 'stale_commitment');
    expect(stale.length).toBe(1);
    expect(stale[0].entityId).toBe(c.id);
  });
});
