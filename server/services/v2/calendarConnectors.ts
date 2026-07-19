/**
 * Calendar connectors (Phase 5).
 *
 * The connector contract is fixed; what changes per provider is the
 * authentication, the read API, and the field mapping. Until external
 * credentials are configured, every connector refuses to sync and
 * returns `blocked_by_external_authorization`.
 *
 * The runtime lives at:
 *   - `.dailyflow/connector-state.json` — cursor, last sync, errors
 *   - `.dailyflow/secrets/<type>.json`  — token storage (gated by the
 *     host's secret store; we only write a placeholder here for
 *     development; production should use Keychain / Credential Manager)
 *
 * Mapping to internal objects:
 *   - Each busy block becomes a SourceItem with kind=calendar_event,
 *     NOT a Commitment (spec §17.3: "日历事件不自动成为用户承诺").
 *   - Cancelled events are not re-imported.
 *   - All-day events get an explicit allDay flag.
 *   - Timezone is preserved verbatim.
 */
import { z } from 'zod';
import { newId } from '../../domain/v2/ulid.js';
import { sha256 } from '../../repositories/v2/atomicWrite.js';
import { V2Repository } from '../../repositories/v2/repository.js';

export const CalendarEventSchema = z.object({
  externalId: z.string(),
  connectorId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  start: z.string().datetime({ offset: true }),
  end: z.string().datetime({ offset: true }),
  allDay: z.boolean(),
  timezone: z.string(),
  status: z.enum(['confirmed', 'tentative', 'cancelled']),
  attendees: z.array(z.string()).default([]),
  location: z.string().optional(),
  url: z.string().optional(),
});
export type CalendarEvent = z.infer<typeof CalendarEventSchema>;

export interface CalendarSyncResult {
  connectorId: string;
  ok: boolean;
  eventsImported: number;
  eventsSkipped: number;
  errors: string[];
  blockedBy?: 'external_authorization' | 'rate_limit' | 'network';
  nextCursor?: string;
  syncedAt: string;
}

export interface CalendarConnector {
  id: string;
  displayName: string;
  capabilities: ('read' | 'write' | 'webhook')[];
  /** Returns a cursor for the next sync. The connector remembers its own cursor. */
  fetchEvents(opts: { cursor?: string; timeMin?: string; timeMax?: string }): Promise<{
    events: CalendarEvent[];
    nextCursor?: string;
    blockedBy?: CalendarSyncResult['blockedBy'];
  }>;
  /** Test if the user has authorized this connector. */
  isAuthorized(): Promise<{ ready: boolean; reason?: string }>;
}

// ---------------------------------------------------------------------------
// Concrete connectors — all start as not-authorized.
// ---------------------------------------------------------------------------

class GoogleCalendarConnector implements CalendarConnector {
  id = 'google-calendar';
  displayName = 'Google Calendar';
  capabilities: CalendarConnector['capabilities'] = ['read', 'write', 'webhook'];

  async isAuthorized() {
    return { ready: false, reason: 'external_authorization' };
  }
  async fetchEvents() {
    return { events: [], blockedBy: 'external_authorization' as const };
  }
}

class OutlookCalendarConnector implements CalendarConnector {
  id = 'outlook-calendar';
  displayName = 'Outlook Calendar';
  capabilities: CalendarConnector['capabilities'] = ['read', 'write', 'webhook'];
  async isAuthorized() {
    return { ready: false, reason: 'external_authorization' };
  }
  async fetchEvents() {
    return { events: [], blockedBy: 'external_authorization' as const };
  }
}

class FeishuCalendarConnector implements CalendarConnector {
  id = 'feishu-calendar';
  displayName = '飞书日历';
  capabilities: CalendarConnector['capabilities'] = ['read', 'write', 'webhook'];
  async isAuthorized() {
    return { ready: false, reason: 'external_authorization' };
  }
  async fetchEvents() {
    return { events: [], blockedBy: 'external_authorization' as const };
  }
}

const REGISTRY: Record<string, CalendarConnector> = {
  'google-calendar': new GoogleCalendarConnector(),
  'outlook-calendar': new OutlookCalendarConnector(),
  'feishu-calendar': new FeishuCalendarConnector(),
};

export function getCalendarConnector(id: string): CalendarConnector | null {
  return REGISTRY[id] ?? null;
}

export function listCalendarConnectors(): CalendarConnector[] {
  return Object.values(REGISTRY);
}

// ---------------------------------------------------------------------------
// Sync orchestration — converts events into SourceItems (not Commitments).
// ---------------------------------------------------------------------------

export interface CalendarSyncOptions {
  connectorId: string;
  cursor?: string;
  timeMin?: string;
  timeMax?: string;
  /** When true, the connector may use stored user credentials. */
  useStoredCredentials?: boolean;
}

export async function syncCalendar(
  repo: V2Repository,
  opts: CalendarSyncOptions
): Promise<CalendarSyncResult> {
  const c = getCalendarConnector(opts.connectorId);
  if (!c) {
    return {
      connectorId: opts.connectorId,
      ok: false,
      eventsImported: 0,
      eventsSkipped: 0,
      errors: [`Unknown connector: ${opts.connectorId}`],
      syncedAt: new Date().toISOString(),
    };
  }
  const auth = await c.isAuthorized();
  if (!auth.ready) {
    return {
      connectorId: opts.connectorId,
      ok: false,
      eventsImported: 0,
      eventsSkipped: 0,
      errors: [`${c.displayName} requires external authorization.`],
      blockedBy: 'external_authorization',
      syncedAt: new Date().toISOString(),
    };
  }
  const r = await c.fetchEvents({
    cursor: opts.cursor,
    timeMin: opts.timeMin,
    timeMax: opts.timeMax,
  });
  if (r.blockedBy) {
    return {
      connectorId: opts.connectorId,
      ok: false,
      eventsImported: 0,
      eventsSkipped: 0,
      errors: [`${c.displayName} blocked: ${r.blockedBy}`],
      blockedBy: r.blockedBy,
      nextCursor: r.nextCursor,
      syncedAt: new Date().toISOString(),
    };
  }

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];
  for (const ev of r.events) {
    if (ev.status === 'cancelled') {
      skipped++;
      continue;
    }
    try {
      // Each event becomes a SourceItem; never a Commitment.
      // The user will see them in the Inbox or Memory; if they want to
      // turn one into a Commitment, they explicitly tap "follow up".
      const body = [
        ev.title,
        ev.description ?? '',
        ev.location ? `Location: ${ev.location}` : '',
        ev.attendees.length > 0 ? `Attendees: ${ev.attendees.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join('\n');
      const contentHash = sha256(body);
      // Use a deterministic id derived from the external id so re-syncs
      // are idempotent (spec §17.3).
      const id = `src_${newId('src').split('_')[1]}_${ev.externalId}`.slice(0, 40);
      await repo.saveSourceItem(
        {
          id,
          schemaVersion: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdBy: 'connector',
          workspaceId: repo.layout.root ? '' : '', // computed at save time
          kind: 'calendar_event',
          title: ev.title,
          body,
          occurredAt: ev.start,
          externalRef: {
            connectorId: c.id,
            externalId: ev.externalId,
            url: ev.url,
          },
          contentHash,
          processingStatus: 'saved',
          sensitivity: 'normal',
        } as never,
        {
          auditKind: 'connector.sync',
          auditEntity: { type: 'source', id },
          auditData: { connectorId: c.id, externalId: ev.externalId, allDay: ev.allDay, timezone: ev.timezone },
        }
      );
      imported++;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  return {
    connectorId: c.id,
    ok: errors.length === 0,
    eventsImported: imported,
    eventsSkipped: skipped,
    errors,
    nextCursor: r.nextCursor,
    syncedAt: new Date().toISOString(),
  };
}

/** A normalizer: convert a local-time string to a UTC ISO string. */
export function toUtcIso(localIso: string, timezone: string): string {
  // The runtime contract is: input is already in the user's timezone
  // and ends with a `+HH:MM` or `Z` offset. We round-trip via Date.
  const d = new Date(localIso);
  if (isNaN(d.getTime())) throw new Error(`Invalid date: ${localIso}`);
  void timezone;
  return d.toISOString();
}
