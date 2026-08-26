import type { Request, Response } from 'express';
import type { V2Repository } from '../../repositories/v2/repository.js';
import { isTerminal } from '../../domain/v2/eventRuntimeState.js';
import { replayRuntimeEvents, toSseFrame } from './runtimeEventPersistence.js';

export function resolveRunEventCursor(req: Pick<Request, 'query' | 'header'>): string | undefined {
  const queryCursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
  const headerCursor = req.header('Last-Event-ID');
  const cursor = queryCursor ?? headerCursor;
  if (cursor !== undefined && !/^\d+$/.test(cursor)) {
    throw Object.assign(new Error('SSE cursor must be a non-negative decimal sequence.'), { code: 'invalid_cursor' });
  }
  return cursor;
}

/**
 * Replay persisted events and briefly tail the JSONL log. The endpoint never
 * exposes a runtime's in-memory iterator; disconnect/reconnect always resumes
 * from the last durable SSE id.
 */
export async function streamEventOperatorRunEvents(
  repo: V2Repository,
  runId: string,
  req: Request,
  res: Response,
  options: { pollMs?: number; maxOpenMs?: number; pageSize?: number } = {},
): Promise<void> {
  const run = await repo.getEventOperatorRun(runId);
  if (!run) {
    res.status(404).json({ error: { code: 'not_found', message: 'Run not found' } });
    return;
  }
  let cursor = resolveRunEventCursor(req);
  const pollMs = Math.max(25, options.pollMs ?? 250);
  const maxOpenMs = Math.max(0, options.maxOpenMs ?? 25_000);
  const pageSize = Math.min(Math.max(options.pageSize ?? 100, 1), 500);
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  res.write('retry: 1000\n\n');

  let closed = false;
  req.once('close', () => { closed = true; });
  const deadline = Date.now() + maxOpenMs;
  do {
    const page = await replayRuntimeEvents(repo, runId, cursor, pageSize);
    for (const event of page.items) {
      if (closed) return;
      res.write(toSseFrame(event));
      cursor = event.cursor;
    }
    const latest = await repo.getEventOperatorRun(runId);
    if (!page.hasMore && latest && isTerminal(latest.status)) break;
    if (Date.now() >= deadline || closed) break;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  } while (!closed);
  if (!closed) res.end();
}
