import {
  getFeishuAgenda,
  getFeishuAuthStatus,
  type FeishuAgendaEvent,
} from './feishuSync.js';

export type ConnectorCapability =
  | 'tasks.read'
  | 'tasks.write'
  | 'calendar.read'
  | 'calendar.write';

export interface ConnectorPluginManifest {
  id: string;
  displayName: string;
  provider: 'feishu' | 'google' | 'outlook' | string;
  icon: string;
  capabilities: ConnectorCapability[];
  accountType: 'enterprise' | 'personal' | 'both';
  status: 'available' | 'coming_soon';
}

export interface ConnectorPluginStatus {
  connected: boolean;
  accountLabel?: string;
  reason?: string;
}

export interface CalendarConnectorEvent {
  externalId: string;
  title: string;
  description?: string;
  start: string;
  end: string;
  allDay: boolean;
  status: 'confirmed' | 'tentative' | 'cancelled';
  location?: string;
  url?: string;
}

export interface ConnectorPlugin {
  manifest: ConnectorPluginManifest;
  getStatus(): Promise<ConnectorPluginStatus>;
  listCalendarEvents?(start: string, end: string): Promise<CalendarConnectorEvent[]>;
}

function fromFeishuEvent(event: FeishuAgendaEvent): CalendarConnectorEvent {
  return {
    externalId: event.id,
    title: event.title,
    description: event.description,
    start: event.start,
    end: event.end,
    allDay: event.allDay,
    status: event.status,
    location: event.location,
    url: event.url,
  };
}

const feishuPlugin: ConnectorPlugin = {
  manifest: {
    id: 'feishu',
    displayName: '飞书',
    provider: 'feishu',
    icon: 'calendar-days',
    capabilities: ['tasks.read', 'tasks.write', 'calendar.read', 'calendar.write'],
    accountType: 'enterprise',
    status: 'available',
  },
  async getStatus() {
    const status = await getFeishuAuthStatus();
    return {
      connected: status.authorized,
      accountLabel: status.userName,
      reason: status.reason,
    };
  },
  async listCalendarEvents(start, end) {
    return (await getFeishuAgenda(start, end)).map(fromFeishuEvent);
  },
};

/**
 * Google intentionally starts as a manifest-only plugin. The calendar UI and
 * aggregation layer already understand it; OAuth + API transport can be
 * shipped independently without touching the calendar workspace.
 */
const googlePlugin: ConnectorPlugin = {
  manifest: {
    id: 'google',
    displayName: 'Google',
    provider: 'google',
    icon: 'calendar-range',
    capabilities: ['tasks.read', 'tasks.write', 'calendar.read', 'calendar.write'],
    accountType: 'both',
    status: 'coming_soon',
  },
  async getStatus() {
    return {
      connected: false,
      reason: 'Google OAuth connector is not configured yet.',
    };
  },
};

const registry = new Map<string, ConnectorPlugin>();

export function registerConnectorPlugin(plugin: ConnectorPlugin): void {
  if (registry.has(plugin.manifest.id)) {
    throw new Error(`Connector plugin already registered: ${plugin.manifest.id}`);
  }
  registry.set(plugin.manifest.id, plugin);
}

export function getConnectorPlugin(id: string): ConnectorPlugin | undefined {
  return registry.get(id);
}

export function listConnectorPlugins(): ConnectorPlugin[] {
  return [...registry.values()];
}

registerConnectorPlugin(feishuPlugin);
registerConnectorPlugin(googlePlugin);
