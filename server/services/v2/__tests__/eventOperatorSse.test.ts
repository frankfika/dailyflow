import { describe, expect, it } from 'vitest';
import { resolveRunEventCursor } from '../eventOperatorSse';

function request(query: Record<string, unknown>, lastEventId?: string) {
  return { query, header: (name: string) => name === 'Last-Event-ID' ? lastEventId : undefined } as any;
}

describe('Event Operator SSE cursor', () => {
  it('prefers explicit cursor and falls back to Last-Event-ID', () => {
    expect(resolveRunEventCursor(request({ cursor: '12' }, '8'))).toBe('12');
    expect(resolveRunEventCursor(request({}, '8'))).toBe('8');
  });

  it('rejects opaque or negative cursors', () => {
    expect(() => resolveRunEventCursor(request({ cursor: '-1' }))).toThrowError(expect.objectContaining({ code: 'invalid_cursor' }));
    expect(() => resolveRunEventCursor(request({}, 'session-secret'))).toThrowError(expect.objectContaining({ code: 'invalid_cursor' }));
  });
});
