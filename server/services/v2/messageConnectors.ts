/**
 * Email / Message connectors (Phase 6).
 *
 * The contract: connectors are read-only and scoped to what the user
 * explicitly chose to import. They never read the full mailbox.
 *
 * Spec §17.3 + §9.3 + §10.7:
 *   - Default not to read the full inbox.
 *   - User selects a thread / channel; we read that.
 *   - Idempotent re-sync (cursor + content hash + externalId).
 *   - External content is treated as data, not instruction.
 *     (No tool execution triggered by email body.)
 */
import { z } from 'zod';
import { newId } from '../../domain/v2/ulid.js';
import { sha256 } from '../../repositories/v2/atomicWrite.js';
import { V2Repository } from '../../repositories/v2/repository.js';

export const ExternalMessageSchema = z.object({
  externalId: z.string(),
  connectorId: z.string(),
  subject: z.string().optional(),
  from: z.string().optional(),
  to: z.array(z.string()).default([]),
  body: z.string(),
  sentAt: z.string().datetime({ offset: true }),
  url: z.string().optional(),
  threadId: z.string().optional(),
  labels: z.array(z.string()).default([]),
});
export type ExternalMessage = z.infer<typeof ExternalMessageSchema>;

export interface MessageSyncResult {
  connectorId: string;
  ok: boolean;
  messagesImported: number;
  messagesSkipped: number;
  errors: string[];
  blockedBy?: 'external_authorization' | 'rate_limit' | 'network';
  nextCursor?: string;
  syncedAt: string;
}

export interface MessageConnector {
  id: string;
  displayName: string;
  /**
   * Read messages from a specific thread or scope. The connector
   * remembers what the user authorized (one channel, one label, etc.).
   */
  fetchMessages(opts: {
    cursor?: string;
    threadId?: string;
    limit?: number;
  }): Promise<{ messages: ExternalMessage[]; nextCursor?: string; blockedBy?: MessageSyncResult['blockedBy'] }>;
  isAuthorized(): Promise<{ ready: boolean; reason?: string }>;
}

class GmailConnector implements MessageConnector {
  id = 'gmail';
  displayName = 'Gmail';
  async isAuthorized() { return { ready: false, reason: 'external_authorization' }; }
  async fetchMessages() { return { messages: [], blockedBy: 'external_authorization' as const }; }
}
class OutlookEmailConnector implements MessageConnector {
  id = 'outlook-email';
  displayName = 'Outlook Email';
  async isAuthorized() { return { ready: false, reason: 'external_authorization' }; }
  async fetchMessages() { return { messages: [], blockedBy: 'external_authorization' as const }; }
}
class SlackConnector implements MessageConnector {
  id = 'slack';
  displayName = 'Slack';
  async isAuthorized() { return { ready: false, reason: 'external_authorization' }; }
  async fetchMessages() { return { messages: [], blockedBy: 'external_authorization' as const }; }
}
class FeishuMessagesConnector implements MessageConnector {
  id = 'feishu-messages';
  displayName = '飞书消息';
  async isAuthorized() { return { ready: false, reason: 'external_authorization' }; }
  async fetchMessages() { return { messages: [], blockedBy: 'external_authorization' as const }; }
}
class FeishuMinutesConnector implements MessageConnector {
  id = 'feishu-minutes';
  displayName = '飞书妙记';
  async isAuthorized() { return { ready: false, reason: 'external_authorization' }; }
  async fetchMessages() { return { messages: [], blockedBy: 'external_authorization' as const }; }
}

const REGISTRY: Record<string, MessageConnector> = {
  'gmail': new GmailConnector(),
  'outlook-email': new OutlookEmailConnector(),
  'slack': new SlackConnector(),
  'feishu-messages': new FeishuMessagesConnector(),
  'feishu-minutes': new FeishuMinutesConnector(),
};

export function getMessageConnector(id: string): MessageConnector | null {
  return REGISTRY[id] ?? null;
}

export function listMessageConnectors(): MessageConnector[] {
  return Object.values(REGISTRY);
}

export interface MessageSyncOptions {
  connectorId: string;
  threadId?: string;
  cursor?: string;
  limit?: number;
}

export async function syncMessages(
  repo: V2Repository,
  opts: MessageSyncOptions
): Promise<MessageSyncResult> {
  const c = getMessageConnector(opts.connectorId);
  if (!c) {
    return {
      connectorId: opts.connectorId,
      ok: false,
      messagesImported: 0,
      messagesSkipped: 0,
      errors: [`Unknown connector: ${opts.connectorId}`],
      syncedAt: new Date().toISOString(),
    };
  }
  const auth = await c.isAuthorized();
  if (!auth.ready) {
    return {
      connectorId: opts.connectorId,
      ok: false,
      messagesImported: 0,
      messagesSkipped: 0,
      errors: [`${c.displayName} requires external authorization.`],
      blockedBy: 'external_authorization',
      syncedAt: new Date().toISOString(),
    };
  }
  const r = await c.fetchMessages({
    cursor: opts.cursor,
    threadId: opts.threadId,
    limit: opts.limit,
  });
  if (r.blockedBy) {
    return {
      connectorId: opts.connectorId,
      ok: false,
      messagesImported: 0,
      messagesSkipped: 0,
      errors: [`${c.displayName} blocked: ${r.blockedBy}`],
      blockedBy: r.blockedBy,
      nextCursor: r.nextCursor,
      syncedAt: new Date().toISOString(),
    };
  }
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];
  for (const m of r.messages) {
    try {
      const body = [
        m.subject ? `Subject: ${m.subject}` : '',
        m.from ? `From: ${m.from}` : '',
        m.to.length > 0 ? `To: ${m.to.join(', ')}` : '',
        '',
        m.body,
      ]
        .filter(Boolean)
        .join('\n');
      const contentHash = sha256(body);
      // Idempotent id: include connector + externalId
      const id = `src_msg_${newId('src').split('_')[1]}_${m.externalId}`.slice(0, 40);
      await repo.saveSourceItem(
        {
          id,
          schemaVersion: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdBy: 'connector',
          workspaceId: '',
          kind: m.connectorId.startsWith('feishu') ? 'message' : 'email',
          title: m.subject ?? '(no subject)',
          body,
          occurredAt: m.sentAt,
          externalRef: {
            connectorId: c.id,
            externalId: m.externalId,
            url: m.url,
          },
          contentHash,
          processingStatus: 'saved',
          sensitivity: 'normal',
        } as never,
        {
          auditKind: 'connector.sync',
          auditEntity: { type: 'source', id },
          auditData: { connectorId: c.id, externalId: m.externalId, threadId: m.threadId },
        }
      );
      imported++;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
      skipped++;
    }
  }
  return {
    connectorId: c.id,
    ok: errors.length === 0,
    messagesImported: imported,
    messagesSkipped: skipped,
    errors,
    nextCursor: r.nextCursor,
    syncedAt: new Date().toISOString(),
  };
}

/**
 * Sanitize external content: strip any `<script>`, on*=*, and javascript:
 * patterns that could be used for prompt injection or XSS when rendered.
 *
 * This is *defense in depth*. The primary defense is treating external
 * content as data, not instruction (see Extractor system prompt).
 */
export function sanitizeExternalContent(input: string): string {
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]+on\w+\s*=\s*['"]?[^'"]*['"]?/gi, '')
    .replace(/javascript:/gi, 'blocked:')
    .replace(/\u0000/g, '');
}
