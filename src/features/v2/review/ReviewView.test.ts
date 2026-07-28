import { describe, expect, it } from 'vitest';
import { detectCalendarConflicts } from './ReviewView';
import type { CalendarWorkspaceItem } from '../../../api/client';

function event(id: string, start: string, end: string): CalendarWorkspaceItem {
  return {
    id,
    kind: 'event',
    source: 'dailyflow',
    title: id,
    start,
    end,
    allDay: false,
    status: 'confirmed',
  };
}

describe('detectCalendarConflicts', () => {
  it('finds overlapping timed events but ignores adjacent events', () => {
    const conflicts = detectCalendarConflicts([
      event('a', '2026-07-28T09:00:00+08:00', '2026-07-28T10:00:00+08:00'),
      event('b', '2026-07-28T09:30:00+08:00', '2026-07-28T10:30:00+08:00'),
      event('c', '2026-07-28T10:30:00+08:00', '2026-07-28T11:00:00+08:00'),
    ]);

    expect(conflicts.map(item => [item.first.id, item.second.id])).toEqual([['a', 'b']]);
  });
});
