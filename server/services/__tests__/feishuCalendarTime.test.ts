import { describe, expect, it } from 'vitest';
import { normalizeCalendarTime } from '../feishuSync.js';

describe('normalizeCalendarTime', () => {
  it('parses the datetime object returned by current lark-cli agenda responses', () => {
    expect(normalizeCalendarTime({
      datetime: '2026-07-28T09:30:00+08:00',
      timezone: 'Asia/Shanghai',
    })).toEqual({
      iso: '2026-07-28T01:30:00.000Z',
      allDay: false,
    });
  });

  it('keeps all-day date values as all-day events', () => {
    expect(normalizeCalendarTime({ date: '2026-07-28' })).toEqual({
      iso: '2026-07-28T00:00:00+08:00',
      allDay: true,
    });
  });
});
