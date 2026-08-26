import { describe, expect, it } from 'vitest';
import type { AIProvider, CompletionRequest, CompletionResult } from '../../v2/ai/provider';
import type { RuntimeEvent, RuntimeRunSpec } from '../AgentRuntime';
import { DeepSeekHarnessRuntime } from '../DeepSeekHarnessRuntime';
import { DAILYFLOW_TOOL_ALLOWLIST, auditRuntimeTools, parseRunScope, redactToolArgs } from '../runtimePolicy';

const rootId = 'node_root_AAAAAAAAAAAAAAAA';
const spec: RuntimeRunSpec = {
  eventId: 'ev_AAAAAAAAAAAAAAAAAAAAAA',
  workspaceId: 'ws_test',
  scope: {
    workspaceId: 'ws_test',
    eventId: 'ev_AAAAAAAAAAAAAAAAAAAAAA',
    mindmapId: 'map_ev_AAAAAAAAAAAAAAAA',
    trigger: 'event_canvas',
    selectedContextRefs: [],
    contextBudgetBytes: 262144,
  },
  promptVersion: '1',
  context: {
    bytes: 100,
    manifest: [],
    baseRevision: 'revision-1',
    projection: {
      event: { id: 'ev_AAAAAAAAAAAAAAAAAAAAAA' },
      mindmap: { nodes: [{ id: rootId, kind: 'root', text: 'Launch' }], edges: [] },
      allowedEvidenceIds: [],
    },
  },
};

class Provider implements AIProvider {
  name = 'fixture-real-provider';
  constructor(private readonly completion: (req: CompletionRequest) => Promise<CompletionResult>) {}
  async available() { return { ready: true }; }
  complete(req: CompletionRequest) { return this.completion(req); }
}

const config = {
  provider: 'openai-compatible' as const,
  apiKey: 'test-key',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  format: 'openai' as const,
};

async function collect(handle: { events(cursor?: string): AsyncIterable<RuntimeEvent> }) {
  const events: RuntimeEvent[] = [];
  for await (const event of handle.events()) events.push(event);
  return events;
}

describe('DeepSeekHarnessRuntime contract', () => {
  it('calls a real provider and returns its validated operations, never a template', async () => {
    const provider = new Provider(async () => ({
      data: {
        summary: 'Add launch question',
        operations: [{
          changeId: 'change-1', op: 'add_node', tempId: 'temp-1', parentId: rootId,
          node: { kind: 'question', text: 'Who owns launch?' },
          domainDraft: { entity: 'none' }, evidenceIds: [], confidence: 0.8, reason: 'Owner is unknown',
        }],
      },
      provider: 'fixture-real-provider', model: 'deepseek-chat', fallback: false,
    }));
    const runtime = new DeepSeekHarnessRuntime({ provider, config, idFactory: () => 'dsh_contract_run' });
    const health = await runtime.health();
    expect(health.ready).toBe(true);
    expect(health.toolkitSafe).toBe(true);
    expect(health.sidecarAlive).toBe(false);
    expect(health.degraded).toBe(true);

    const handle = await runtime.start(spec);
    const events = await collect(handle);
    expect(events[0]?.type).toBe('run.started');
    expect(events.at(-1)?.type).toBe('run.completed');
    const ready = events.find((event) => event.type === 'proposal.ready');
    expect(ready && ready.type === 'proposal.ready' ? ready.proposal?.operations[0] : undefined)
      .toMatchObject({ op: 'add_node', node: { text: 'Who owns launch?' } });
    expect(events.filter((event) => event.type === 'tool.started').map((event) => event.type === 'tool.started' && event.tool))
      .toEqual(expect.arrayContaining(['read_event', 'read_mindmap', 'propose_graph_patch', 'complete_event_run']));
  });

  it('maps invalid model JSON to a stable failed event', async () => {
    const provider = new Provider(async () => ({
      data: { summary: 'bad', operations: [{ op: 'delete_node' }] },
      provider: 'fixture-real-provider', model: 'deepseek-chat', fallback: false,
    }));
    const runtime = new DeepSeekHarnessRuntime({ provider, config });
    const events = await collect(await runtime.start(spec));
    expect(events.at(-1)).toMatchObject({ type: 'run.failed', error: { code: 'MODEL_OUTPUT_INVALID', retryable: true } });
    expect(events.some((event) => event.type === 'proposal.ready')).toBe(false);
  });

  it('aborts the provider request and emits exactly one cancelled terminal event', async () => {
    const provider = new Provider((req) => new Promise((resolve) => {
      req.signal?.addEventListener('abort', () => resolve({
        data: null, provider: 'fixture-real-provider', model: 'deepseek-chat', fallback: true, fallbackReason: 'timeout',
      }), { once: true });
    }));
    const runtime = new DeepSeekHarnessRuntime({ provider, config });
    const handle = await runtime.start(spec);
    await handle.cancel();
    await handle.cancel();
    const events = await collect(handle);
    expect(events.filter((event) => event.type === 'run.cancelled')).toHaveLength(1);
    expect(events.some((event) => event.type === 'run.completed' || event.type === 'run.failed')).toBe(false);
  });

  it('fails health closed when the resolved tool registry is polluted', async () => {
    const provider = new Provider(async () => ({ data: {}, provider: 'x', model: 'x', fallback: false }));
    const runtime = new DeepSeekHarnessRuntime({ provider, config, tools: [...DAILYFLOW_TOOL_ALLOWLIST, 'bash'] });
    await expect(runtime.health()).resolves.toMatchObject({ ready: false, toolkitSafe: false, failureCode: 'RUNTIME_FORBIDDEN_TOOL' });
    await expect(runtime.start(spec)).rejects.toMatchObject({ code: 'RUNTIME_FORBIDDEN_TOOL' });
  });
});

describe('runtime policy', () => {
  it('requires the exact allowlist and rejects scope widening', () => {
    expect(auditRuntimeTools(DAILYFLOW_TOOL_ALLOWLIST)).toEqual({ safe: true });
    expect(auditRuntimeTools(DAILYFLOW_TOOL_ALLOWLIST.slice(0, -1))).toMatchObject({ safe: false });
    expect(() => parseRunScope({ ...(spec.scope as object), extraWorkspaceId: 'ws_other' })).toThrow();
  });

  it('redacts credentials and full evidence text from telemetry', () => {
    expect(redactToolArgs({ apiKey: 'secret', quote: 'private evidence', nested: { token: 'abc' } }))
      .toEqual({ apiKey: '[REDACTED]', quote: '[16 bytes]', nested: { token: '[REDACTED]' } });
  });
});
