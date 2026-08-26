import { EventOperatorScopeSchema, type EventOperatorScope } from '../../domain/v2/eventOperator.js';

/** Exactly the capabilities exposed to an Event Operator model. */
export const DAILYFLOW_TOOL_ALLOWLIST = Object.freeze([
  'read_event',
  'read_mindmap',
  'read_evidence',
  'search_evidence',
  'list_commitments',
  'propose_graph_patch',
  'complete_event_run',
] as const);

export type DailyFlowToolName = (typeof DAILYFLOW_TOOL_ALLOWLIST)[number];

const DENIED_TOOL = /(?:^|[_.-])(bash|shell|terminal|pty|filesystem|fs|mcp|web|browser)(?:$|[_.-])/i;

export function auditRuntimeTools(tools: readonly string[]): { safe: boolean; failureCode?: string } {
  const expected = new Set<string>(DAILYFLOW_TOOL_ALLOWLIST);
  if (tools.some((tool) => DENIED_TOOL.test(tool))) return { safe: false, failureCode: 'RUNTIME_FORBIDDEN_TOOL' };
  if (tools.length !== expected.size || tools.some((tool) => !expected.has(tool))) {
    return { safe: false, failureCode: 'RUNTIME_TOOLSET_MISMATCH' };
  }
  return { safe: true };
}

export function assertAllowedTool(tool: string): asserts tool is DailyFlowToolName {
  if (!(DAILYFLOW_TOOL_ALLOWLIST as readonly string[]).includes(tool) || DENIED_TOOL.test(tool)) {
    throw Object.assign(new Error(`Runtime tool is not allowed: ${tool}`), { code: 'RUNTIME_TOOL_DENIED' });
  }
}

/** Parse a server-issued scope and reject any model-supplied widening fields. */
export function parseRunScope(input: unknown): EventOperatorScope {
  return EventOperatorScopeSchema.parse(input);
}

/** Tool telemetry must never contain credentials or full source text. */
export function redactToolArgs(value: unknown): unknown {
  if (Array.isArray(value)) return value.slice(0, 20).map(redactToolArgs);
  if (!value || typeof value !== 'object') {
    return typeof value === 'string' && value.length > 500 ? `${value.slice(0, 500)}…` : value;
  }
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (/api.?key|authorization|token|secret|password/i.test(key)) out[key] = '[REDACTED]';
    else if (/content|transcript|body|quote/i.test(key) && typeof val === 'string') out[key] = `[${Buffer.byteLength(val)} bytes]`;
    else out[key] = redactToolArgs(val);
  }
  return out;
}
