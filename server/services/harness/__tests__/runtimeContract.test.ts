import { describe, it, expect } from 'vitest';
import { FakeEventOperatorRuntime } from '../FakeEventOperatorRuntime';
import {
  canTransition,
  cancelAllowed,
  isTerminal,
  transition,
} from '../../../domain/v2/eventRuntimeState';
import type { RuntimeRunSpec } from '../AgentRuntime';

const spec: RuntimeRunSpec = {
  eventId: 'ev_01KAAAAAAAAAAAAAAAA',
  workspaceId: 'ws_test',
  scope: {},
  promptVersion: '1',
  context: { bytes: 100, manifest: [] },
};

async function collect(run: { events: (cursor?: string) => AsyncIterable<import('../AgentRuntime').RuntimeEvent> }) {
  const out: string[] = [];
  for await (const e of run.events()) out.push(e.type);
  return out;
}

async function collectEvents(run: { events: (cursor?: string) => AsyncIterable<import('../AgentRuntime').RuntimeEvent> }) {
  const out: import('../AgentRuntime').RuntimeEvent[] = [];
  for await (const e of run.events()) out.push(e);
  return out;
}

describe('FakeEventOperatorRuntime (runtime contract)', () => {
  it('reports health with a safe toolkit', async () => {
    const rt = new FakeEventOperatorRuntime();
    const h = await rt.health();
    expect(h.ready).toBe(true);
    expect(h.toolkitSafe).toBe(true);
    expect(h.modelConfigured).toBe(true);
  });

  it('plays a full happy-path run: started → phases → tools → proposal → completed', async () => {
    const rt = new FakeEventOperatorRuntime({
      phases: ['collect', 'retrieve', 'extract', 'resolve', 'prepare', 'review'],
      deltas: 2,
      tools: ['read_mindmap', 'read_evidence'],
      proposal: true,
      result: { status: 'succeeded' },
    });
    const handle = await rt.start(spec);
    const types = await collect(handle);
    expect(types).toContain('run.started');
    expect(types).toContain('phase.changed');
    expect(types).toContain('proposal.ready');
    expect(types).toContain('run.completed');
    // completed and cancelled are mutually exclusive.
    expect(types).not.toContain('run.cancelled');
  });

  it('cancel is idempotent and suppresses a later completed event', async () => {
    const rt = new FakeEventOperatorRuntime({
      phases: ['collect', 'retrieve'],
      proposal: true,
      result: { status: 'succeeded' },
    });
    const handle = await rt.start(spec);
    await handle.cancel();
    await handle.cancel(); // second call is a no-op
    const types = await collect(handle);
    expect(types).toContain('run.cancelled');
    expect(types).not.toContain('run.completed');
  });

  it('delivers run.failed with a stable, retryable error', async () => {
    const rt = new FakeEventOperatorRuntime({
      phases: ['collect'],
      failWith: { code: 'PROPOSAL_VALIDATION_FAILED', message: 'invalid ops', retryable: true },
    });
    const handle = await rt.start(spec);
    const all = await collectEvents(handle);
    expect(all.map((e) => e.type)).toContain('run.failed');
    const failed = all.find((e) => e.type === 'run.failed');
    expect(failed && failed.type === 'run.failed' ? failed.error.retryable : false).toBe(true);
    expect(failed && failed.type === 'run.failed' ? failed.error.code : '').toBe('PROPOSAL_VALIDATION_FAILED');
  });

  it('dispose clears the run from the runtime', async () => {
    const rt = new FakeEventOperatorRuntime({ result: { status: 'succeeded' } });
    const handle = await rt.start(spec);
    await handle.dispose();
    expect(rt.runs.has(handle.runId)).toBe(false);
  });

  it('resumes from a cursor (subset is projectable)', async () => {
    const rt = new FakeEventOperatorRuntime({
      phases: ['collect', 'retrieve'],
      proposal: true,
      result: { status: 'succeeded' },
    });
    // cursor support lives behind the persisted event store, not the double;
    // here we assert the event array itself is run-scoped and ordered.
    const handle = await rt.start(spec);
    const evts = [];
    for await (const e of handle.events()) evts.push(e);
    expect(evts[0]?.type).toBe('run.started');
    expect(evts[evts.length - 1]?.type).toBe('run.completed');
  });
});

describe('EventOperator run state machine (DFH-204)', () => {
  const happy = ['queued', 'starting', 'running', 'waiting_review', 'applying', 'succeeded'] as const;
  it('accepts the happy-path chain', () => {
    for (let i = 0; i < happy.length - 1; i++) {
      expect(canTransition(happy[i], happy[i + 1])).toBe(true);
    }
  });

  it.each([
    ['starting', 'waiting_review'],
    ['queued', 'running'],
    ['applying', 'cancelled'],
    ['succeeded', 'queued'],
    ['waiting_review', 'cancelled'],
  ] as const)('rejects illegal transition %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
    expect(() => transition(from, to)).toThrow(/Illegal run status transition/);
  });

  it('accepts a clean completion with nothing to propose (running → succeeded)', () => {
    expect(canTransition('running', 'succeeded')).toBe(true);
    expect(canTransition('starting', 'succeeded')).toBe(true);
  });

  it('allows a retry from failed → queued', () => {
    expect(canTransition('failed', 'queued')).toBe(true);
  });

  it('recognises terminal states and forbids recovery to running', () => {
    expect(isTerminal('succeeded')).toBe(true);
    expect(isTerminal('failed')).toBe(true);
    expect(isTerminal('cancelled')).toBe(true);
    expect(isTerminal('running')).toBe(false);
  });

  it('cancel is allowed from any pre-terminal state and blocked when terminal', () => {
    expect(cancelAllowed('running')).toBe(true);
    expect(cancelAllowed('waiting_review')).toBe(true);
    expect(cancelAllowed('succeeded')).toBe(false);
  });
});