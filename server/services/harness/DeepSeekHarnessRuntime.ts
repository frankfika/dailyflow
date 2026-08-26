import { z } from 'zod';
import { GraphOperationSchema } from '../../domain/v2/eventOperator.js';
import {
  buildProvider,
  loadV2AIConfig,
  type AIProvider,
  type V2AIConfig,
} from '../v2/ai/provider.js';
import type {
  AgentRuntime,
  RuntimeEvent,
  RuntimeHealth,
  RuntimePhase,
  RuntimeRunHandle,
  RuntimeRunSpec,
} from './AgentRuntime.js';
import {
  DAILYFLOW_TOOL_ALLOWLIST,
  assertAllowedTool,
  auditRuntimeTools,
  parseRunScope,
  redactToolArgs,
} from './runtimePolicy.js';
import { checkDailyFlowSidecarReadiness, probeDshInstallation } from './runtimeProcessManager.js';
import { assertSafeModelBaseUrl } from './aiTargetPolicy.js';
import { startDshAcpRun } from './dshAcpBackend.js';
import type { DailyFlowAcpClient, RuntimeProcessManager } from './runtimeProcessManager.js';

const MODEL_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'operations'],
  properties: {
    summary: { type: 'string', minLength: 1, maxLength: 500 },
    operations: {
      type: 'array',
      maxItems: 12,
      items: { type: 'object' },
    },
  },
};

const ModelOutputSchema = z.object({
  summary: z.string().min(1).max(500),
  operations: z.array(GraphOperationSchema).max(12),
}).strict();

const SYSTEM_PROMPT = `You are DailyFlow's Event Operator. Work on exactly one server-scoped Event.
The supplied projection is your entire authorization boundary. Never invent or request a workspace, Event, file, shell, terminal, browser, web, or MCP capability.
Return JSON only: {"summary": string, "operations": GraphOperation[]}.
Allowed operations are add_node, update_node, move_node, and link_entity. Never delete nodes. Reuse existing nodes and ids when possible. Never output coordinates.
Every operation needs a stable changeId and a concise reason. Factual commitment, decision, waiting, or outcome drafts must cite an evidence id that exists in allowedEvidenceIds. If evidence is insufficient, create a question/risk node with domainDraft.entity="none" instead of inventing facts.
Waiting commitments require waitingOnText and an ISO-8601 reviewAt. Unknown owner/due fields must remain absent. The server validates everything and the user must approve before formal data changes.`;

interface RuntimeRecord {
  runId: string;
  events: RuntimeEvent[];
  controller: AbortController;
  done: boolean;
  cancelled: boolean;
  disposed: boolean;
  wake: Set<() => void>;
  sidecar?: RuntimeProcessManager;
  acp?: DailyFlowAcpClient;
  acpSessionId?: string;
}

export interface DeepSeekHarnessRuntimeOptions {
  provider?: AIProvider;
  config?: V2AIConfig;
  loadConfig?: () => Promise<V2AIConfig>;
  tools?: readonly string[];
  timeoutMs?: number;
  now?: () => string;
  idFactory?: () => string;
  /** Explicit test/degraded mode. Production defaults to the official ACP sidecar. */
  useProviderAdapter?: boolean;
}

function failureCode(reason?: string): string {
  if (reason === 'timeout') return 'MODEL_TIMEOUT';
  if (reason === 'no_api_key' || reason === 'no_provider') return 'MODEL_NOT_CONFIGURED';
  if (reason === 'context_too_long') return 'MODEL_CONTEXT_TOO_LONG';
  return 'MODEL_REQUEST_FAILED';
}

/**
 * Production Event Operator runtime.
 *
 * The official DSH ACP distribution is still a developer-preview sidecar. This
 * adapter therefore uses DailyFlow's already configured OpenAI-compatible
 * provider as the real model seam while preserving the accepted AgentRuntime
 * and restricted-tool contract. No template result is produced when a model is
 * unavailable: the run fails closed with a stable error.
 */
export class DeepSeekHarnessRuntime implements AgentRuntime {
  readonly runtimeId = 'deepseek-harness';
  readonly runs = new Map<string, RuntimeRecord>();
  private readonly tools: readonly string[];
  private readonly now: () => string;
  private readonly idFactory: () => string;
  private readonly useProviderAdapter: boolean;

  constructor(private readonly opts: DeepSeekHarnessRuntimeOptions = {}) {
    this.tools = opts.tools ?? DAILYFLOW_TOOL_ALLOWLIST;
    this.now = opts.now ?? (() => new Date().toISOString());
    this.idFactory = opts.idFactory ?? (() => `dsh_${crypto.randomUUID()}`);
    this.useProviderAdapter = opts.useProviderAdapter ?? !!opts.provider;
  }

  private async config(): Promise<V2AIConfig> {
    return this.opts.config ?? await (this.opts.loadConfig ?? (() => loadV2AIConfig('chat')))();
  }

  async health(): Promise<RuntimeHealth> {
    const toolAudit = auditRuntimeTools(this.tools);
    const dsh = probeDshInstallation();
    if (!toolAudit.safe) {
      return {
        ready: false,
        runtimeVersion: 'dailyflow-provider-adapter@1',
        profileVersion: 'dailyflow@1',
        protocolVersion: 'agent-runtime/1',
        modelConfigured: false,
        sidecarAlive: false,
        toolkitSafe: false,
        failureCode: toolAudit.failureCode,
      };
    }
    const cfg = await this.config();
    const configured = cfg.provider !== 'local-deterministic' && !!cfg.apiKey && !!cfg.model;
    if (!configured) {
      return {
        ready: false,
        runtimeVersion: 'dailyflow-provider-adapter@1',
        profileVersion: 'dailyflow@1',
        protocolVersion: 'agent-runtime/1',
        modelConfigured: false,
        sidecarAlive: false,
        toolkitSafe: true,
        failureCode: 'MODEL_NOT_CONFIGURED',
      };
    }
    try {
      if (!cfg.baseUrl) throw new Error('missing URL');
      await assertSafeModelBaseUrl(cfg.baseUrl);
    } catch {
      return {
        ready: false,
        runtimeVersion: 'dailyflow-provider-adapter@1',
        profileVersion: 'dailyflow@1',
        protocolVersion: 'agent-runtime/1',
        modelConfigured: true,
        sidecarAlive: false,
        toolkitSafe: true,
        failureCode: 'PROVIDER_URL_UNSAFE',
      };
    }
    if (!this.useProviderAdapter) {
      if (!dsh.installed || dsh.failureCode) return {
        ready: false,
        runtimeVersion: dsh.version ? `dsh@${dsh.version}` : undefined,
        profileVersion: 'dailyflow-event-operator@1',
        protocolVersion: 'acp/1',
        modelConfigured: true,
        sidecarAlive: false,
        toolkitSafe: true,
        failureCode: dsh.failureCode ?? 'DSH_NOT_INSTALLED',
      };
      const readiness = await checkDailyFlowSidecarReadiness(DAILYFLOW_TOOL_ALLOWLIST);
      if (!readiness.ready) return {
        ready: false,
        runtimeVersion: `dsh@${dsh.version}`,
        profileVersion: 'dailyflow-event-operator@1',
        protocolVersion: 'acp/1',
        modelConfigured: true,
        sidecarAlive: false,
        toolkitSafe: readiness.failureCode !== 'TOOLSET_UNSAFE',
        failureCode: readiness.failureCode,
      };
      return {
        ready: true,
        runtimeVersion: `dsh@${dsh.version}`,
        profileVersion: 'dailyflow-event-operator@1',
        protocolVersion: 'acp/1',
        modelConfigured: true,
        sidecarAlive: [...this.runs.values()].some(run => run.sidecar?.alive),
        toolkitSafe: true,
        degraded: false,
      };
    }
    const provider = this.opts.provider ?? buildProvider(cfg);
    const available = await provider.available();
    return {
      ready: available.ready,
      runtimeVersion: dsh.installed ? `dailyflow-provider-adapter@1;dsh@${dsh.version}` : 'dailyflow-provider-adapter@1',
      profileVersion: 'dailyflow@1',
      protocolVersion: 'agent-runtime/1',
      modelConfigured: available.ready,
      sidecarAlive: false,
      toolkitSafe: true,
      degraded: available.ready,
      failureCode: available.ready ? (dsh.failureCode ?? 'DSH_SIDECAR_NOT_ACTIVE') : failureCode(available.reason),
    };
  }

  async start(spec: RuntimeRunSpec): Promise<RuntimeRunHandle> {
    parseRunScope(spec.scope);
    const health = await this.health();
    if (!health.ready) {
      throw Object.assign(new Error(`Event Operator runtime is unavailable: ${health.failureCode ?? 'UNKNOWN'}`), {
        code: health.failureCode ?? 'RUNTIME_UNAVAILABLE',
      });
    }
    if (!spec.context.projection || !spec.context.baseRevision) {
      throw Object.assign(new Error('A bounded event projection and base revision are required.'), { code: 'RUNTIME_CONTEXT_MISSING' });
    }
    const runId = this.idFactory();
    const record: RuntimeRecord = {
      runId,
      events: [],
      controller: new AbortController(),
      done: false,
      cancelled: false,
      disposed: false,
      wake: new Set(),
    };
    this.runs.set(runId, record);
    void this.execute(record, spec);
    return {
      runId,
      cancel: () => this.cancel(runId),
      dispose: () => this.dispose(runId),
      events: (cursor?: string) => this.events(runId, cursor),
    };
  }

  async cancel(runId: string): Promise<void> {
    const record = this.runs.get(runId);
    if (!record || record.cancelled || record.done) return;
    record.cancelled = true;
    record.controller.abort(new Error('Run cancelled'));
    if (record.acp && record.acpSessionId) record.acp.cancel(record.acpSessionId);
    await record.sidecar?.stop();
    this.emit(record, { type: 'run.cancelled', at: this.now() });
    record.done = true;
    this.notify(record);
  }

  async dispose(runId: string): Promise<void> {
    const record = this.runs.get(runId);
    if (!record) return;
    if (!record.done) await this.cancel(runId);
    record.disposed = true;
    this.notify(record);
    this.runs.delete(runId);
  }

  async disposeAll(): Promise<void> {
    await Promise.all([...this.runs.keys()].map((id) => this.dispose(id)));
  }

  async *events(runId: string, cursor?: string): AsyncIterable<RuntimeEvent> {
    const record = this.runs.get(runId);
    if (!record) throw Object.assign(new Error(`Runtime run not found: ${runId}`), { code: 'RUNTIME_RUN_NOT_FOUND' });
    let index = cursor === undefined ? 0 : Number(cursor);
    if (!Number.isInteger(index) || index < 0) throw Object.assign(new Error('Invalid runtime cursor.'), { code: 'RUNTIME_CURSOR_INVALID' });
    while (!record.disposed) {
      while (index < record.events.length) yield record.events[index++]!;
      if (record.done) return;
      await new Promise<void>((resolve) => record.wake.add(resolve));
    }
  }

  private emit(record: RuntimeRecord, event: RuntimeEvent): void {
    if (record.done || record.disposed) return;
    record.events.push(event);
    this.notify(record);
  }

  private notify(record: RuntimeRecord): void {
    for (const resolve of record.wake) resolve();
    record.wake.clear();
  }

  private async execute(record: RuntimeRecord, spec: RuntimeRunSpec): Promise<void> {
    const baseRevision = spec.context.baseRevision;
    if (!baseRevision) throw Object.assign(new Error('Runtime base revision is missing.'), { code: 'RUNTIME_CONTEXT_MISSING' });
    const emitPhase = (phase: RuntimePhase) =>
      this.emit(record, { type: 'phase.changed', phase, at: this.now() });
    try {
      this.emit(record, { type: 'run.started', runId: record.runId, at: this.now() });
      if (!this.useProviderAdapter) {
        await this.executeAcp(record, spec, emitPhase);
        return;
      }
      emitPhase('collect');
      for (const tool of ['read_event', 'read_mindmap', 'read_evidence', 'list_commitments'] as const) {
        assertAllowedTool(tool);
        const callId = `${record.runId}:${tool}`;
        this.emit(record, { type: 'tool.started', callId, tool, safeArgs: redactToolArgs({ eventId: spec.eventId }), at: this.now() });
        this.emit(record, { type: 'tool.completed', callId, summary: { source: 'bounded_projection' }, at: this.now() });
      }
      emitPhase('retrieve');
      emitPhase('extract');
      const cfg = await this.config();
      const provider = this.opts.provider ?? buildProvider(cfg);
      const result = await provider.complete({
        systemPrompt: SYSTEM_PROMPT,
        prompt: `Analyze this bounded Event projection and propose a reviewable graph patch.\n${JSON.stringify(spec.context.projection)}`,
        jsonSchema: MODEL_OUTPUT_SCHEMA,
        model: cfg.model,
        maxTokens: 4096,
        temperature: 0.1,
        signal: record.controller.signal,
        timeoutMs: this.opts.timeoutMs ?? 120_000,
      });
      if (record.cancelled) return;
      if (result.fallback) {
        throw Object.assign(new Error(result.text || 'Model request failed.'), {
          code: failureCode(result.fallbackReason),
          retryable: !['no_api_key', 'no_provider'].includes(result.fallbackReason ?? ''),
        });
      }
      emitPhase('resolve');
      const output = ModelOutputSchema.parse(result.data);
      emitPhase('prepare');
      assertAllowedTool('propose_graph_patch');
      const callId = `${record.runId}:propose_graph_patch`;
      this.emit(record, {
        type: 'tool.started',
        callId,
        tool: 'propose_graph_patch',
        safeArgs: { operationCount: output.operations.length, baseRevision },
        at: this.now(),
      });
      this.emit(record, { type: 'tool.completed', callId, summary: { ok: true, operationCount: output.operations.length }, at: this.now() });
      this.emit(record, {
        type: 'proposal.ready',
        proposalId: `pending_${record.runId}`,
        proposal: { baseRevision, summary: output.summary, operations: output.operations },
        at: this.now(),
      });
      emitPhase('review');
      assertAllowedTool('complete_event_run');
      const completeCallId = `${record.runId}:complete_event_run`;
      this.emit(record, { type: 'tool.started', callId: completeCallId, tool: 'complete_event_run', safeArgs: {}, at: this.now() });
      this.emit(record, { type: 'tool.completed', callId: completeCallId, summary: { status: 'waiting_review' }, at: this.now() });
      this.emit(record, { type: 'run.completed', result: { status: 'succeeded', summary: output.summary }, at: this.now() });
      record.done = true;
      this.notify(record);
    } catch (error) {
      if (record.cancelled) return;
      const parsed = error instanceof z.ZodError
        ? { code: 'MODEL_OUTPUT_INVALID', message: 'The model returned an invalid graph proposal.', retryable: true }
        : {
            code: typeof (error as { code?: unknown })?.code === 'string' ? (error as { code: string }).code : 'RUNTIME_FAILED',
            message: error instanceof Error ? error.message.slice(0, 500) : 'Runtime failed.',
            retryable: (error as { retryable?: boolean })?.retryable ?? false,
          };
      this.emit(record, { type: 'run.failed', error: parsed, at: this.now() });
      record.done = true;
      this.notify(record);
    }
  }

  private async executeAcp(record: RuntimeRecord, spec: RuntimeRunSpec, emitPhase: (phase: RuntimePhase) => void): Promise<void> {
    try {
      emitPhase('collect');
      const cfg = await this.config();
      const run = await startDshAcpRun(cfg, spec);
      record.sidecar = run.process;
      record.acp = run.client;
      record.acpSessionId = run.sessionId;
      const result = await run.result;
      if (record.cancelled) return;
      emitPhase('retrieve');
      for (const event of result.trace) {
        if (event.type === 'assistant.delta' && event.text) {
          this.emit(record, { type: 'assistant.delta', text: event.text, at: event.at });
        } else if (event.type === 'tool.started' && event.callId && event.tool) {
          this.emit(record, { type: 'tool.started', callId: event.callId, tool: event.tool, safeArgs: {}, at: event.at });
        } else if (event.type === 'tool.completed' && event.callId) {
          this.emit(record, { type: 'tool.completed', callId: event.callId, summary: { ok: event.ok }, at: event.at });
        }
      }
      emitPhase('extract');
      emitPhase('resolve');
      emitPhase('prepare');
      this.emit(record, {
        type: 'proposal.ready',
        proposalId: `pending_${record.runId}`,
        proposal: result.proposal,
        at: this.now(),
      });
      emitPhase('review');
      this.emit(record, { type: 'run.completed', result: { status: 'succeeded', summary: result.summary }, at: this.now() });
      record.done = true;
      this.notify(record);
    } catch (error) {
      if (record.cancelled) return;
      throw error;
    }
  }
}

let sharedRuntime: DeepSeekHarnessRuntime | undefined;

/** One process-wide runtime so HTTP cancel can reach active provider calls. */
export function getDeepSeekHarnessRuntime(): DeepSeekHarnessRuntime {
  sharedRuntime ??= new DeepSeekHarnessRuntime();
  return sharedRuntime;
}
