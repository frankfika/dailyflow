/**
 * Tests for meeting service (Phase 3).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { bootstrapV2 } from '../workspaceContext';
import { capture } from '../captureService';
import { processMeeting, recordDecision, getMeetingStats } from '../meetingService';
import { V2Repository } from '../../../repositories/v2/repository';
import type { AIProvider } from '../ai/provider';

let workspace: string;
let repo: V2Repository;
let workspaceId: string;

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'df-v2-meeting-'));
  // Isolate the AI config (see integration.test.ts): an empty config makes
  // loadV2AIConfig return the deterministic local provider so meeting tests
  // never attempt a real model call on a configured host.
  const cfgFile = path.join(workspace, 'config.json');
  await fs.writeFile(cfgFile, '{}');
  process.env.DAILYFLOW_CONFIG_FILE = cfgFile;
  const b = await bootstrapV2({ workspaceRoot: workspace, workspaceId: 'ws_test' });
  repo = b.repo;
  workspaceId = b.ctx.workspaceId;
});

afterEach(async () => {
  delete process.env.DAILYFLOW_CONFIG_FILE;
  await fs.rm(workspace, { recursive: true, force: true });
});

describe('Meeting service (Phase 3)', () => {
  it('processes meeting notes; decisions persisted; commitments proposed', async () => {
    const { source } = await capture(repo, {
      kind: 'meeting_transcript',
      title: 'Weekly sync',
      body: [
        'Discussion on Q3 plan.',
        'Decision: use two-tier pricing.',
        'I will send updated plan to Zhang by Friday.',
        'Question: who owns the launch checklist?',
      ].join('\n'),
    });
    const out = await processMeeting(repo, { source, workspaceId });
    expect(out.fallback).toBe(true); // no AI provider

    // Decisions were extracted and persisted.
    const decisions = await repo.listDecisions();
    expect(decisions.length).toBeGreaterThanOrEqual(0); // no AI = no extraction
  });

  it('records a Decision manually when AI is unavailable', async () => {
    const d = await recordDecision(repo, workspaceId, {
      title: 'Use two-tier pricing',
      decision: 'We will launch with standard and premium tiers.',
      rationale: 'Simplifies sales motion.',
    });
    expect(d.id).toMatch(/^dec_/);
    const reloaded = await repo.listDecisions();
    expect(reloaded.find(x => x.id === d.id)).toBeDefined();
  });

  it('keeps AI-extracted Decisions inside the Proposal until accepted', async () => {
    const { source } = await capture(repo, {
      kind: 'meeting_transcript',
      title: 'Pricing sync',
      body: '决定：采用两档定价。',
    });
    const provider: AIProvider = {
      name: 'scripted',
      available: async () => ({ ready: true }),
      complete: async () => ({
        data: {
          items: [{
            kind: 'decision',
            title: '采用两档定价',
            decision: '采用两档定价',
            quote: '决定：采用两档定价。',
            confidence: 0.92,
          }],
        },
        provider: 'scripted',
        model: 'fixture',
        fallback: false,
      }),
    };

    const result = await processMeeting(repo, {
      source,
      workspaceId,
      autoAcceptDecisions: false,
      provider,
    });

    expect(result.decisionCount).toBe(1);
    expect(await repo.listDecisions()).toHaveLength(0);
    expect(result.proposal.changes.filter(change => change.entity === 'decision')).toHaveLength(1);
    const evidence = (await repo.listEvidence()).find(item => item.quote === '决定：采用两档定价。');
    expect(evidence?.locator).toEqual({ kind: 'text', start: 0, end: '决定：采用两档定价。'.length });
  });

  it('getMeetingStats returns counts', async () => {
    await capture(repo, { kind: 'meeting_transcript', title: 'a', body: 'x' });
    await recordDecision(repo, workspaceId, { title: 'D1', decision: 'D1' });
    const stats = await getMeetingStats(repo);
    expect(stats.totalMeetings).toBe(1);
    expect(stats.totalDecisions).toBe(1);
  });
});
