import { z } from 'zod';

export const JobKindSchema = z.enum([
  'source_analysis',
  'transcription',
  'calendar_sync',
  'import',
]);
export type JobKind = z.infer<typeof JobKindSchema>;

export const JobStatusSchema = z.enum([
  'queued',
  'running',
  'waiting_review',
  'succeeded',
  'failed',
  'cancelled',
]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const JobEntityRefSchema = z.object({
  type: z.string().trim().min(1).max(64),
  id: z.string().trim().min(1).max(256),
});

export const JobErrorSchema = z.object({
  code: z.string().trim().min(1).max(128),
  message: z.string().max(4_000),
  retryable: z.boolean(),
});

export const JobRecordSchema = z.object({
  id: z.string().regex(/^job_[0-9A-HJKMNP-TV-Z]{26}$/),
  workspaceId: z.string().min(1),
  kind: JobKindSchema,
  entityRef: JobEntityRefSchema,
  idempotencyKey: z.string().trim().min(1).max(512),
  status: JobStatusSchema,
  progress: z.number().min(0).max(100).optional(),
  resultRef: JobEntityRefSchema.optional(),
  error: JobErrorSchema.optional(),
  attempt: z.number().int().positive().default(1),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  startedAt: z.string().datetime({ offset: true }).optional(),
  finishedAt: z.string().datetime({ offset: true }).optional(),
});
export type JobRecord = z.infer<typeof JobRecordSchema>;

const transitions: Record<JobStatus, ReadonlySet<JobStatus>> = {
  queued: new Set(['running', 'cancelled']),
  running: new Set(['waiting_review', 'succeeded', 'failed', 'cancelled']),
  waiting_review: new Set(['succeeded', 'cancelled']),
  succeeded: new Set(),
  failed: new Set(['queued', 'cancelled']),
  cancelled: new Set(),
};

export class InvalidJobTransitionError extends Error {
  readonly code = 'invalid_job_transition';

  constructor(
    readonly from: JobStatus,
    readonly to: JobStatus,
  ) {
    super(`Job cannot transition from ${from} to ${to}.`);
  }
}

export function assertJobTransition(from: JobStatus, to: JobStatus): void {
  if (from === to) return;
  if (!transitions[from].has(to)) throw new InvalidJobTransitionError(from, to);
}

export function canCancelJob(status: JobStatus): boolean {
  return status === 'queued' || status === 'running' || status === 'waiting_review' || status === 'failed';
}

export function canRetryJob(job: Pick<JobRecord, 'status' | 'error'>): boolean {
  return job.status === 'failed' && job.error?.retryable === true;
}
