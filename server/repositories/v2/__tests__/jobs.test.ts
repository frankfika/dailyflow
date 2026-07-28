import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { V2Repository } from '../repository';

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'dailyflow-jobs-'));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

function repo(workspaceId = 'ws_jobs') {
  return new V2Repository({ root, workspaceId });
}

const jobInput = {
  kind: 'source_analysis' as const,
  entityRef: { type: 'source', id: 'src_example' },
  idempotencyKey: 'source-analysis:ws_jobs:src_example:hash:v1',
  status: 'queued' as const,
};

describe('V2Repository durable jobs', () => {
  it('deduplicates concurrent creates by idempotency key', async () => {
    const repository = repo();
    const jobs = await Promise.all(
      Array.from({ length: 12 }, () => repository.createOrGetJob(jobInput)),
    );

    expect(new Set(jobs.map(job => job.id))).toHaveLength(1);
    expect(await repository.listJobs()).toHaveLength(1);
  });

  it('allows exactly one concurrent worker to claim a queued job', async () => {
    const repository = repo();
    const queued = await repository.createOrGetJob(jobInput);
    const claims = await Promise.all(
      Array.from({ length: 10 }, () => repository.startJob(queued.id, 5)),
    );

    expect(claims.filter(claim => claim.started)).toHaveLength(1);
    expect((await repository.getJob(queued.id))?.status).toBe('running');
  });

  it('enforces legal transitions and persists retry attempts', async () => {
    const repository = repo();
    const queued = await repository.createOrGetJob(jobInput);
    const running = await repository.updateJob(queued.id, {
      status: 'running',
      progress: 25,
      startedAt: new Date().toISOString(),
    });
    expect(running?.status).toBe('running');

    await expect(repository.updateJob(queued.id, { status: 'queued' })).rejects.toMatchObject({
      code: 'invalid_job_transition',
    });

    const failed = await repository.updateJob(queued.id, {
      status: 'failed',
      error: { code: 'extractor_failed', message: 'provider unavailable', retryable: true },
      finishedAt: new Date().toISOString(),
    });
    expect(failed?.status).toBe('failed');

    const retried = await repository.retryJob(queued.id);
    expect(retried).toMatchObject({ status: 'queued', progress: 0, attempt: 2 });
    expect(retried?.error).toBeUndefined();
    expect(retried?.finishedAt).toBeUndefined();
  });

  it('rejects retry of non-retryable failures and cancellation of completed jobs', async () => {
    const repository = repo();
    const queued = await repository.createOrGetJob(jobInput);
    await repository.updateJob(queued.id, { status: 'running' });
    await repository.updateJob(queued.id, {
      status: 'failed',
      error: { code: 'validation', message: 'bad payload', retryable: false },
    });
    await expect(repository.retryJob(queued.id)).rejects.toMatchObject({ code: 'job_not_retryable' });

    const second = await repository.createOrGetJob({
      ...jobInput,
      idempotencyKey: `${jobInput.idempotencyKey}:second`,
    });
    await repository.updateJob(second.id, { status: 'running' });
    await repository.updateJob(second.id, { status: 'succeeded', progress: 100 });
    await expect(repository.cancelJob(second.id)).rejects.toMatchObject({ code: 'job_not_cancellable' });
  });

  it('filters foreign-workspace records even when repositories share a root', async () => {
    const first = repo('ws_one');
    const second = repo('ws_two');
    const created = await first.createOrGetJob({ ...jobInput, idempotencyKey: 'shared-key' });

    expect(await second.getJob(created.id)).toBeNull();
    expect(await second.listJobs()).toEqual([]);

    const secondCreated = await second.createOrGetJob({ ...jobInput, idempotencyKey: 'shared-key' });
    expect(secondCreated.id).not.toBe(created.id);
    expect(secondCreated.workspaceId).toBe('ws_two');
  });

  it('cancels queued work and records a durable finish timestamp', async () => {
    const repository = repo();
    const queued = await repository.createOrGetJob(jobInput);
    const cancelled = await repository.cancelJob(queued.id);

    expect(cancelled?.status).toBe('cancelled');
    expect(cancelled?.finishedAt).toBeTruthy();
    expect((await repository.getJob(queued.id))?.status).toBe('cancelled');
  });
});
