/**
 * FakeEventOperatorRuntime — deterministic runtime test double.
 *
 * Spec: docs/DAILYFLOW_2_2_DEEPSEEK_HARNESS_IMPLEMENTATION_PLAN.md §3.3, DFH-201.
 *
 * Implements the same `AgentRuntime` contract as the production
 * `DeepSeekHarnessRuntime`, but instead of driving a sidecar it replays a
 * scripted, deterministic sequence of RuntimeEvents. UI/service tests never
 * depend on a real harness or a model key.
 *
 * Determinism guarantees this double honours:
 *   - events are namespaced per runId
 *   - `cancel` is idempotent and suppresses any terminal event after the call
 *   - `events(cursor)` resumes from the next unconsumed event
 */
import type {
  AgentRuntime,
  RuntimeEvent,
  RuntimeHealth,
  RuntimePhase,
  RuntimeResult,
  RuntimeRunHandle,
  RuntimeRunSpec,
} from './AgentRuntime.js';

export interface FakeRunScript {
  health?: Partial<RuntimeHealth>;
  /** phase sequence to walk before the terminal event. */
  phases?: RuntimePhase[];
  /** assistant delta chat ticks during init. */
  deltas?: number;
  /** tool call names (safe summaries emitted per call). */
  tools?: string[];
  /** emit a proposal.ready before completing. */
  proposal?: boolean;
  /** terminal result. */
  result?: RuntimeResult;
  /** if set, the run ends in run.failed instead of running the result. */
  failWith?: { code: string; message: string; retryable: boolean };
}

interface FakeRun {
  runId: string;
  events: RuntimeEvent[];
  cancelled: boolean;
  running: boolean;
}

function isoNow(): string {
  return new Date().toISOString();
}

function buildScript(runId: string, s: FakeRunScript): RuntimeEvent[] {
  const events: RuntimeEvent[] = [];
  events.push({ type: 'run.started', runId, at: isoNow() });
  for (const ph of s.phases ?? []) {
    events.push({ type: 'phase.changed', phase: ph, at: isoNow() });
  }
  for (let i = 0; i < (s.deltas ?? 0); i++) {
    events.push({ type: 'assistant.delta', text: `tick ${i}`, at: isoNow() });
  }
  const tools = [...(s.tools ?? [])];
  if (s.proposal) tools.push('propose_graph_patch');
  if (s.result?.status === 'succeeded') tools.push('complete_event_run');
  for (const t of tools) {
    events.push({ type: 'tool.started', callId: `${t}:${runId}`, tool: t, safeArgs: {}, at: isoNow() });
    events.push({ type: 'tool.completed', callId: `${t}:${runId}`, summary: { ok: true }, at: isoNow() });
  }
  if (s.proposal) {
    events.push({ type: 'proposal.ready', proposalId: `gprop_${runId}`, at: isoNow() });
  }
  // A run always ends in a terminal event (completed or failed).
  if (s.failWith) {
    events.push({
      type: 'run.failed',
      error: { code: s.failWith.code, message: s.failWith.message, retryable: s.failWith.retryable },
      at: isoNow(),
    });
  } else if (s.result) {
    events.push({ type: 'run.completed', result: s.result, at: isoNow() });
  }
  return events;
}

export class FakeEventOperatorRuntime implements AgentRuntime {
  readonly runtimeId = 'fake-event-operator';
  readonly runs = new Map<string, FakeRun>();
  private healthOverride: Partial<RuntimeHealth> = {};

  constructor(private defaultScript: FakeRunScript = {}) {}

  setHealth(h: Partial<RuntimeHealth>): void {
    this.healthOverride = h;
  }

  async health(): Promise<RuntimeHealth> {
    return {
      ready: true,
      runtimeVersion: '0.0.0-fake',
      profileVersion: 'dailyflow-test',
      protocolVersion: 'acp/stdio-fake',
      modelConfigured: true,
      sidecarAlive: true,
      toolkitSafe: true,
      ...this.defaultScript.health,
      ...this.healthOverride,
    };
  }

  async start(_spec: RuntimeRunSpec): Promise<RuntimeRunHandle> {
    const runId = `run_${Math.random().toString(36).slice(2, 10)}`;
    const events = buildScript(runId, this.defaultScript);
    const run: FakeRun = { runId, events, cancelled: false, running: true };
    this.runs.set(runId, run);

    const eventsGen = async function* (cursor?: string): AsyncIterable<RuntimeEvent> {
      let i = cursor ? Number(cursor) : 0;
      while (i < run.events.length) {
        yield run.events[i++]!;
      }
    };

    return {
      runId,
      async cancel() {
        if (run.cancelled) return;
        run.cancelled = true;
        run.running = false;
        // Truncate any terminal event already scripted, then append run.cancelled.
        const terminalIdx = run.events.findIndex((e) => e.type === 'run.completed' || e.type === 'run.failed');
        if (terminalIdx >= 0) run.events.length = terminalIdx;
        if (!run.events.some((e) => e.type === 'run.cancelled')) {
          run.events.push({ type: 'run.cancelled', at: isoNow() });
        }
      },
      dispose: async () => {
        run.running = false;
        this.runs.delete(runId);
      },
      events: eventsGen,
    };
  }
}