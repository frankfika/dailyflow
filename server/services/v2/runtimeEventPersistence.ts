import { createHash } from 'crypto';
import type { RuntimeEvent } from '../harness/AgentRuntime.js';
import type { V2Repository } from '../../repositories/v2/repository.js';
import type { StoredRunEvent, RunEventPage } from '../../domain/v2/eventRunEvents.js';

const SECRET_KEY = /(api[-_]?key|authorization|password|secret|token|cookie|credential)/i;
const SECRET_VALUE = /(bearer\s+[a-z0-9._~+/=-]+|sk-[a-z0-9_-]{12,})/ig;
const MAX_STRING_BYTES = 8 * 1024;
const MAX_DEPTH = 5;

/** Redact credentials and cap event payload size before it reaches JSONL/audit. */
export function sanitizeRuntimeValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[truncated]';
  if (typeof value === 'string') {
    const redacted = value.replace(SECRET_VALUE, '[REDACTED]');
    if (Buffer.byteLength(redacted, 'utf8') <= MAX_STRING_BYTES) return redacted;
    return `${Buffer.from(redacted).subarray(0, MAX_STRING_BYTES).toString('utf8')}…[truncated]`;
  }
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitizeRuntimeValue(item, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>).slice(0, 100)) {
      out[key] = SECRET_KEY.test(key) ? '[REDACTED]' : sanitizeRuntimeValue(child, depth + 1);
    }
    return out;
  }
  return value;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function runtimeEventFingerprint(runId: string, event: RuntimeEvent): string {
  return createHash('sha256').update(canonical({ runId, event })).digest('hex');
}

export async function persistRuntimeEvent(
  repo: V2Repository,
  runId: string,
  event: RuntimeEvent,
): Promise<{ event: StoredRunEvent; appended: boolean }> {
  const { type, at, ...payload } = event;
  return repo.appendEventOperatorRunEvent({
    runId,
    type,
    at,
    fingerprint: runtimeEventFingerprint(runId, event),
    payload: sanitizeRuntimeValue(payload) as Record<string, unknown>,
  });
}

export function replayRuntimeEvents(
  repo: V2Repository,
  runId: string,
  cursor?: string,
  limit?: number,
): Promise<RunEventPage> {
  return repo.pageEventOperatorRunEvents(runId, { afterCursor: cursor, limit });
}

/** SSE wire format. `id` is the durable cursor consumed by Last-Event-ID. */
export function toSseFrame(event: StoredRunEvent): string {
  return `id: ${event.cursor}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}
