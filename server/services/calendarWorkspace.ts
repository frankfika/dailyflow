import { loadConfig } from './config.js';
import { listDailyNotes, readDailyNote } from './fileSystem.js';
import { getAllNotes } from './notes.js';
import { listConnectorPlugins } from './connectorPlugins.js';

export type CalendarItemKind = 'task' | 'event';
export type CalendarItemSource = 'dailyflow' | 'feishu' | 'google' | string;

export interface CalendarWorkspaceItem {
  id: string;
  kind: CalendarItemKind;
  source: CalendarItemSource;
  title: string;
  description?: string;
  start: string;
  end?: string;
  allDay: boolean;
  status: 'todo' | 'done' | 'confirmed' | 'tentative';
  location?: string;
  url?: string;
  localDate?: string;
  localTaskId?: string;
  localNoteId?: string;
  delayed?: boolean;
  originalDate?: string;
}

export interface CalendarWorkspaceResult {
  items: CalendarWorkspaceItem[];
  connectors: Array<{
    id: string;
    displayName: string;
    connected: boolean;
    color: string;
    error?: string;
  }>;
}

const SOURCE_COLORS: Record<string, string> = {
  dailyflow: '#6b7280',
  feishu: '#2563eb',
  google: '#16a34a',
};

function assertDateRange(start: string, end: string): void {
  const isValidDate = (value: string): boolean => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  };
  if (!isValidDate(start) || !isValidDate(end)) {
    throw Object.assign(new Error('start and end must use YYYY-MM-DD.'), { status: 400 });
  }
  const days = (new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) / 86_400_000;
  if (days < 0 || days > 62) {
    throw Object.assign(new Error('Calendar range must be between 0 and 62 days.'), { status: 400 });
  }
}

function toOffsetBoundary(date: string, end = false): string {
  return `${date}T${end ? '23:59:59' : '00:00:00'}+08:00`;
}

function normalizeClock(value: string): string {
  return value.length === 5 ? `${value}:00` : value;
}

export async function getCalendarWorkspace(start: string, end: string): Promise<CalendarWorkspaceResult> {
  assertDateRange(start, end);
  const config = await loadConfig();
  const items: CalendarWorkspaceItem[] = [];

  // A task can live in an older daily note while carrying a deadline in this
  // range, so all daily notes must be considered before filtering by its
  // effective calendar date.
  const dates = await listDailyNotes(config);
  for (const date of dates) {
    const note = await readDailyNote(date, config);
    for (const task of note?.tasks || []) {
      const delayed = Boolean(task.tags?.includes('delayed'));
      // A rolled-over task belongs to the day it was moved to. Its original
      // deadline remains metadata, but must not pin it to an old calendar day.
      const calendarDate = delayed ? date : (task.deadline || date);
      if (calendarDate < start || calendarDate > end || task.status === 'migrated') continue;
      items.push({
        id: `dailyflow:task:${task.id}`,
        kind: 'task',
        source: 'dailyflow',
        title: task.title,
        description: task.description,
        start: calendarDate,
        allDay: true,
        status: task.status === 'done' ? 'done' : 'todo',
        localDate: date,
        localTaskId: task.id,
        delayed,
        originalDate: delayed ? (task.deadline || task.source_date) : undefined,
      });
    }
  }

  const notes = await getAllNotes({ startDate: start, endDate: end });
  for (const note of notes) {
    if (!note.time) continue;
    const startAt = `${note.date}T${normalizeClock(note.time)}+08:00`;
    const endAt = note.endTime
      ? `${note.date}T${normalizeClock(note.endTime)}+08:00`
      : new Date(new Date(startAt).getTime() + 30 * 60_000).toISOString();
    items.push({
      id: `dailyflow:note:${note.id}`,
      kind: 'event',
      source: 'dailyflow',
      title: note.title,
      description: note.body,
      start: startAt,
      end: endAt,
      allDay: false,
      status: 'confirmed',
      localDate: note.date,
      localNoteId: note.id,
    });
  }

  const connectors: CalendarWorkspaceResult['connectors'] = [];
  for (const plugin of listConnectorPlugins()) {
    const status = await plugin.getStatus();
    connectors.push({
      id: plugin.manifest.id,
      displayName: plugin.manifest.displayName,
      connected: status.connected,
      color: SOURCE_COLORS[plugin.manifest.provider] || '#8b5cf6',
    });
    if (!status.connected || !plugin.listCalendarEvents) continue;
    try {
      const external = await plugin.listCalendarEvents(
        toOffsetBoundary(start),
        toOffsetBoundary(end, true)
      );
      for (const event of external) {
        if (event.status === 'cancelled') continue;
        items.push({
          id: `${plugin.manifest.id}:event:${event.externalId}`,
          kind: 'event',
          source: plugin.manifest.provider,
          title: event.title,
          description: event.description,
          start: event.start,
          end: event.end,
          allDay: event.allDay,
          status: event.status,
          location: event.location,
          url: event.url,
        });
      }
    } catch (error: any) {
      connectors[connectors.length - 1]!.error = error?.message || String(error);
    }
  }

  items.sort((a, b) => {
    if (a.start !== b.start) return a.start.localeCompare(b.start);
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
  return { items, connectors };
}
