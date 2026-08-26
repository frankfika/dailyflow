import { describe, expect, it } from 'vitest';
import { EVENT_OPERATOR_TOOL_WHITELIST } from '../eventOperatorTools';
import { diagnoseEventOperatorRuntime, telemetryAuditData } from '../eventOperatorDiagnostics';

describe('Event Operator diagnostics and privacy telemetry', () => {
  it('fails closed with distinct health codes and never accepts a polluted toolset', () => {
    expect(diagnoseEventOperatorRuntime({ health: { ready: false, modelConfigured: false }, actualTools: EVENT_OPERATOR_TOOL_WHITELIST }).code).toBe('MODEL_NOT_CONFIGURED');
    expect(diagnoseEventOperatorRuntime({ health: { ready: true, modelConfigured: true, sidecarAlive: true, runtimeVersion: '2' }, expectedRuntimeVersion: '1', actualTools: EVENT_OPERATOR_TOOL_WHITELIST }).code).toBe('RUNTIME_VERSION_MISMATCH');
    expect(diagnoseEventOperatorRuntime({ health: { ready: true, modelConfigured: true, sidecarAlive: true }, actualTools: [...EVENT_OPERATOR_TOOL_WHITELIST, 'shell'] })).toMatchObject({ ready: false, code: 'RUNTIME_TOOLSET_UNSAFE' });
  });

  it('emits aggregate-only telemetry with a deterministic acceptance rate', () => {
    const data = telemetryAuditData({ provider: 'deepseek', model: 'chat', runtimeVersion: '1', toolCalls: 3,
      validationWarningCodes: ['STALE'], acceptedOperations: 2, proposedOperations: 4 });
    expect(data).toMatchObject({ provider: 'deepseek', model: 'chat', toolCalls: 3, acceptedRate: 0.5 });
    expect(JSON.stringify(data)).not.toMatch(/prompt|transcript|reasoning|apiKey/i);
  });
});
