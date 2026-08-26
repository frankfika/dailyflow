import { z } from 'zod';

/**
 * Durable envelope around a DailyFlow RuntimeEvent. `cursor` is a monotonically
 * increasing decimal sequence local to one run. The UI can pass it back as
 * either `cursor` or `Last-Event-ID` without knowing runtime internals.
 */
export const StoredRunEventSchema = z.object({
  schemaVersion: z.literal(1),
  workspaceId: z.string().min(1),
  runId: z.string().min(8),
  cursor: z.string().regex(/^\d+$/),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  type: z.string().min(1),
  at: z.string().datetime({ offset: true }),
  payload: z.record(z.string(), z.unknown()),
}).strict();

export type StoredRunEvent = z.infer<typeof StoredRunEventSchema>;

export interface RunEventPage {
  items: StoredRunEvent[];
  nextCursor?: string;
  hasMore: boolean;
}
