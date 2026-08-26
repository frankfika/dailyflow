import type { RuntimeHealth } from '../harness/AgentRuntime.js';
import { validateToolWhitelist } from './eventOperatorTools.js';

export type RuntimeDiagnosticCode =
  | 'OK'
  | 'MODEL_NOT_CONFIGURED'
  | 'RUNTIME_UNAVAILABLE'
  | 'RUNTIME_VERSION_MISMATCH'
  | 'RUNTIME_PROTOCOL_MISMATCH'
  | 'RUNTIME_TOOLSET_UNSAFE';

export interface EventOperatorDiagnostic {
  ready: boolean;
  code: RuntimeDiagnosticCode;
  runtimeVersion?: string;
  profileVersion?: string;
  protocolVersion?: string;
  modelConfigured: boolean;
  sidecarAlive: boolean;
  toolkit: { safe: boolean; actual: string[]; unauthorized: string[]; missing: string[] };
  codexSubagentEnabled: boolean;
  checkedAt: string;
}

/** Stable Settings/health response. It intentionally accepts no config object containing keys. */
export function diagnoseEventOperatorRuntime(input: {
  health: RuntimeHealth;
  actualTools: readonly string[];
  expectedRuntimeVersion?: string;
  expectedProtocolVersion?: string;
  codexSubagentEnabled?: boolean;
}): EventOperatorDiagnostic {
  const toolkit = validateToolWhitelist(input.actualTools);
  let code: RuntimeDiagnosticCode = 'OK';
  if (!input.health.modelConfigured) code = 'MODEL_NOT_CONFIGURED';
  else if (!input.health.sidecarAlive || !input.health.ready) code = 'RUNTIME_UNAVAILABLE';
  else if (input.expectedRuntimeVersion && input.health.runtimeVersion !== input.expectedRuntimeVersion) code = 'RUNTIME_VERSION_MISMATCH';
  else if (input.expectedProtocolVersion && input.health.protocolVersion !== input.expectedProtocolVersion) code = 'RUNTIME_PROTOCOL_MISMATCH';
  else if (!toolkit.safe || input.health.toolkitSafe === false) code = 'RUNTIME_TOOLSET_UNSAFE';
  return {
    ready: code === 'OK',
    code,
    runtimeVersion: input.health.runtimeVersion,
    profileVersion: input.health.profileVersion,
    protocolVersion: input.health.protocolVersion,
    modelConfigured: input.health.modelConfigured,
    sidecarAlive: input.health.sidecarAlive ?? false,
    toolkit: { ...toolkit, actual: [...input.actualTools].sort() },
    codexSubagentEnabled: input.codexSubagentEnabled ?? false,
    checkedAt: new Date().toISOString(),
  };
}

export function telemetryAuditData(input: {
  provider: string;
  model: string;
  runtimeVersion: string;
  phaseDurationsMs?: Partial<Record<'collect' | 'retrieve' | 'extract' | 'resolve' | 'prepare' | 'review', number>>;
  toolCalls: number;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCost?: number;
  validationWarningCodes?: string[];
  acceptedOperations?: number;
  proposedOperations?: number;
}): Record<string, unknown> {
  const acceptedRate = input.proposedOperations && input.proposedOperations > 0
    ? (input.acceptedOperations ?? 0) / input.proposedOperations
    : undefined;
  // IDs, counters and codes only: no prompt, Note/Transcript, tool args,
  // credentials or hidden reasoning can enter the audit through this helper.
  return {
    provider: input.provider,
    model: input.model,
    runtimeVersion: input.runtimeVersion,
    phaseDurationsMs: input.phaseDurationsMs,
    toolCalls: input.toolCalls,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    estimatedCost: input.estimatedCost,
    validationWarningCodes: [...(input.validationWarningCodes ?? [])].sort(),
    acceptedRate,
  };
}
