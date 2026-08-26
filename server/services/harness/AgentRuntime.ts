/**
 * AgentRuntime seam — the only way DailyFlow business code touches a runtime.
 *
 * Spec: docs/DAILYFLOW_2_2_DEEPSEEK_HARNESS_IMPLEMENTATION_PLAN.md §3.3, Adobe-style.
 *
 * Business code must NOT import DeepSeek Harness internals; it depends only on
 * this interface (and the `RuntimeEvent` vocabulary). Two implementations:
 *   - `FakeEventOperatorRuntime` (deterministic test double)
 *   - `DeepSeekHarnessRuntime` (production candidate, gated on model config)
 *
 * `RuntimeEvent`s are DailyFlow-owned vocabulary. The DSH adapter maps DSH
 * session/agent/tool events into these; duplicate/foreign events are never
 * surfaced here.
 */
export type RuntimePhase = 'collect' | 'retrieve' | 'extract' | 'resolve' | 'prepare' | 'review';

import type { GraphOperation } from '../../domain/v2/eventOperator.js';

export interface RuntimeProposalDraft {
  baseRevision: string;
  summary: string;
  operations: GraphOperation[];
}

export interface RuntimeRunSpec {
  eventId: string;
  workspaceId: string;
  scope: unknown; // EventOperatorScope at runtime; typed loosely to keep the seam runtime-agnostic
  promptVersion: string;
  context: {
    bytes: number;
    manifest: unknown[];
    /** A bounded, DailyFlow-owned projection. The runtime cannot fetch outside it. */
    projection?: unknown;
    baseRevision?: string;
  };
}

export interface RuntimeUserInput {
  text: string;
}

export interface RuntimeApproval {
  id: string;
  kind: string;
  /** Redacted, user-safe summary of whatever the runtime wants approval for. */
  safeDescription: string;
}

export interface RuntimeResult {
  status: 'succeeded' | 'cancelled' | 'failed';
  summary?: string;
  error?: { code: string; message: string; retryable: boolean };
}

export interface RuntimeError {
  code: string;
  message: string;
  retryable: boolean;
}

export type RuntimeHealth = {
  ready: boolean;
  runtimeVersion?: string;
  profileVersion?: string;
  protocolVersion?: string;
  modelConfigured: boolean;
  sidecarAlive?: boolean;
  toolkitSafe?: boolean;
  failureCode?: string;
  /** True when the safe in-process provider adapter is used instead of ACP. */
  degraded?: boolean;
};

/** Ordered, immutable event stream a Run producer hands to the store/UI. */
export type RuntimeEvent =
  | { type: 'run.started'; runId: string; at: string }
  | { type: 'phase.changed'; phase: RuntimePhase; at: string }
  | { type: 'assistant.delta'; text: string; at: string }
  | { type: 'tool.started'; callId: string; tool: string; safeArgs: unknown; at: string }
  | { type: 'tool.completed'; callId: string; summary: unknown; at: string }
  | { type: 'approval.required'; approval: RuntimeApproval; at: string }
  | { type: 'proposal.ready'; proposalId: string; proposal?: RuntimeProposalDraft; at: string }
  | { type: 'run.completed'; result: RuntimeResult; at: string }
  | { type: 'run.failed'; error: RuntimeError; at: string }
  | { type: 'run.cancelled'; at: string };

export const RUNTIME_EVENT_TYPES = [
  'run.started',
  'phase.changed',
  'assistant.delta',
  'tool.started',
  'tool.completed',
  'approval.required',
  'proposal.ready',
  'run.completed',
  'run.failed',
  'run.cancelled',
] as const;

export interface RuntimeRunHandle {
  runId: string;
  /** Immediately-after-start updater; idempotent. */
  cancel(): Promise<void>;
  dispose(): Promise<void>;
  events(cursor?: string): AsyncIterable<RuntimeEvent>;
}

export interface AgentRuntime {
  readonly runtimeId: string;
  health(): Promise<RuntimeHealth>;
  start(spec: RuntimeRunSpec): Promise<RuntimeRunHandle>;
  /** Runtime-wide forms are used by HTTP cancellation/recovery paths. */
  send?(runId: string, input: RuntimeUserInput): Promise<void>;
  cancel?(runId: string): Promise<void>;
  dispose?(runId: string): Promise<void>;
  events?(runId: string, cursor?: string): AsyncIterable<RuntimeEvent>;
  /** Best-effort runtime-wide hints (e.g. dispose all sidecars). */
  disposeAll?(): Promise<void>;
}
