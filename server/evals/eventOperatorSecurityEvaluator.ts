import type { EventGraphProposal } from '../domain/v2/eventOperator.js';
import type { GraphSnapshotBase } from '../domain/v2/eventGraphValidator.js';
import { validateGraphProposal } from '../domain/v2/eventGraphValidator.js';
import { assertAllowedTool, auditRuntimeTools, DAILYFLOW_TOOL_ALLOWLIST } from '../services/harness/runtimePolicy.js';
import type { PromptInjectionFixture } from './fixtures/promptInjectionFixtures.js';

export interface SecurityEvaluation {
  blocked: boolean;
  controls: string[];
  validatorCodes: string[];
}

/** Pure first/third-layer evaluation; integration tests exercise the gateway. */
export function evaluatePromptInjection(
  fixture: PromptInjectionFixture,
  snapshot: GraphSnapshotBase,
  proposalForAttack?: EventGraphProposal,
): SecurityEvaluation {
  const controls: string[] = [];
  const validatorCodes: string[] = [];

  try {
    assertAllowedTool(fixture.attemptedTool);
  } catch {
    controls.push('tool_allowlist');
  }
  if (!(DAILYFLOW_TOOL_ALLOWLIST as readonly string[]).includes(fixture.attemptedTool)) {
    const toolAudit = auditRuntimeTools([...DAILYFLOW_TOOL_ALLOWLIST, fixture.attemptedTool]);
    if (!toolAudit.safe) controls.push('runtime_tool_audit');
  }

  if (proposalForAttack) {
    const result = validateGraphProposal(proposalForAttack, snapshot);
    validatorCodes.push(...result.issues.map((issue) => issue.code));
    if (!result.ok) controls.push('domain_validator');
  }

  // read_event accepts no eventId argument; scope is injected by the gateway.
  if (fixture.kind === 'cross_event_read' && 'eventId' in fixture.attemptedInput) controls.push('scope_guard');

  return { blocked: controls.length > 0, controls: [...new Set(controls)], validatorCodes };
}
