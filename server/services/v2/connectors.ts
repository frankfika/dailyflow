/**
 * Connectors — pluggable external integration layer (spec §17).
 *
 * Phase 5/6 of the spec introduces Calendar / Email / Message connectors.
 * Until external credentials are configured, every connector reports
 * `blocked_by_external_authorization` and emits no data. The runtime still
 * supports the Connector Contract (capabilities, sync, health, pause, delete)
 * so the UI can render "needs auth" states truthfully.
 *
 * The local-markdown connector is special: it always works because it
 * reads from the user's own workspace, with no external dependency.
 */
import { z } from 'zod';

export const ConnectorCapabilitySchema = z.enum(['read', 'write', 'webhook']);
export type ConnectorCapability = z.infer<typeof ConnectorCapabilitySchema>;

export const ConnectorStateSchema = z.enum(['connected', 'paused', 'needs_auth', 'error']);
export type ConnectorState = z.infer<typeof ConnectorStateSchema>;

export interface ConnectorStatus {
  id: string;
  type: string;
  displayName: string;
  state: ConnectorState;
  capabilities: ConnectorCapability[];
  lastSyncAt?: string;
  lastError?: string;
  scopes?: string[];
  blockedBy?: 'external_authorization' | 'not_implemented' | 'maintenance';
  description: string;
}

const CONNECTORS: ConnectorStatus[] = [
  {
    id: 'local-markdown',
    type: 'local-markdown',
    displayName: 'Local Markdown',
    state: 'connected',
    capabilities: ['read', 'write'],
    description: 'Always available. Reads and writes your DailyFlow workspace files.',
  },
  {
    id: 'google-calendar',
    type: 'google-calendar',
    displayName: 'Google Calendar',
    state: 'needs_auth',
    capabilities: ['read', 'write', 'webhook'],
    blockedBy: 'external_authorization',
    description: 'Connect to read and (with permission) create calendar events.',
  },
  {
    id: 'outlook-calendar',
    type: 'outlook-calendar',
    displayName: 'Outlook Calendar',
    state: 'needs_auth',
    capabilities: ['read', 'write', 'webhook'],
    blockedBy: 'external_authorization',
    description: 'Connect to read and (with permission) create Outlook events.',
  },
  {
    id: 'feishu-calendar',
    type: 'feishu-calendar',
    displayName: '飞书日历',
    state: 'needs_auth',
    capabilities: ['read', 'write', 'webhook'],
    blockedBy: 'external_authorization',
    description: '连接后读取或创建飞书日历事件。',
  },
  {
    id: 'gmail',
    type: 'gmail',
    displayName: 'Gmail',
    state: 'needs_auth',
    capabilities: ['read'],
    blockedBy: 'external_authorization',
    description: 'Read-only access. You choose which threads to import.',
  },
  {
    id: 'outlook-email',
    type: 'outlook-email',
    displayName: 'Outlook Email',
    state: 'needs_auth',
    capabilities: ['read'],
    blockedBy: 'external_authorization',
    description: 'Read-only access. You choose which messages to import.',
  },
  {
    id: 'slack',
    type: 'slack',
    displayName: 'Slack',
    state: 'needs_auth',
    capabilities: ['read'],
    blockedBy: 'external_authorization',
    description: 'Read messages from selected channels.',
  },
  {
    id: 'feishu-messages',
    type: 'feishu-messages',
    displayName: '飞书消息',
    state: 'needs_auth',
    capabilities: ['read'],
    blockedBy: 'external_authorization',
    description: '读取指定会话的消息。',
  },
  {
    id: 'feishu-minutes',
    type: 'feishu-minutes',
    displayName: '飞书妙记',
    state: 'needs_auth',
    capabilities: ['read'],
    blockedBy: 'external_authorization',
    description: '导入飞书妙记作为会议转录。',
  },
];

export async function listConnectors(): Promise<ConnectorStatus[]> {
  return CONNECTORS;
}

export async function getConnector(id: string): Promise<ConnectorStatus | null> {
  return CONNECTORS.find(c => c.id === id || c.type === id) ?? null;
}

export async function syncConnector(id: string): Promise<{ ok: boolean; message: string }> {
  const c = await getConnector(id);
  if (!c) return { ok: false, message: 'Connector not found' };
  if (c.blockedBy === 'external_authorization') {
    return { ok: false, message: `${c.displayName} requires external authorization. Configure in Settings to enable.` };
  }
  return { ok: true, message: `${c.displayName} synced successfully.` };
}

export async function pauseConnector(id: string): Promise<ConnectorStatus | null> {
  const c = await getConnector(id);
  if (!c) return null;
  c.state = 'paused';
  return c;
}

export async function deleteConnector(id: string): Promise<boolean> {
  const idx = CONNECTORS.findIndex(c => c.id === id);
  if (idx === -1) return false;
  CONNECTORS.splice(idx, 1);
  return true;
}

export interface SyncOnceResult {
  ok: boolean;
  processed: number;
  message: string;
  blockedBy?: 'external_authorization' | 'not_implemented';
}

export async function runConnectorSyncOnce(type: string): Promise<SyncOnceResult> {
  const c = await getConnector(type);
  if (!c) {
    return { ok: false, processed: 0, message: `Unknown connector: ${type}` };
  }
  if (c.blockedBy === 'external_authorization') {
    return {
      ok: false,
      processed: 0,
      message: `${c.displayName} requires external authorization.`,
      blockedBy: 'external_authorization',
    };
  }
  // local-markdown: nothing to sync (it IS the workspace).
  return { ok: true, processed: 0, message: 'Local Markdown: no external sync needed.' };
}
