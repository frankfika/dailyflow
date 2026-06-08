import { describe, it, expect, beforeEach } from 'vitest';
import { withDateLock } from '../lock.js';

describe('withDateLock', () => {
  beforeEach(() => {
    // No global reset hook is exported; each test uses a unique date so the
    // shared map never carries state between cases.
  });

  it('runs jobs serially on the same date', async () => {
    const order: number[] = [];
    const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

    // Job 0 starts but blocks for 30ms; job 1 should not start until job 0
    // settles. We assert by recording the start times relative to the
    // overall clock.
    const startedAt: number[] = [];
    const t0 = Date.now();
    const p0 = withDateLock('2026-06-08', async () => {
      startedAt.push(Date.now() - t0);
      order.push(0);
      await delay(30);
      order.push(0);
    });
    const p1 = withDateLock('2026-06-08', async () => {
      startedAt.push(Date.now() - t0);
      order.push(1);
    });

    await Promise.all([p0, p1]);

    // The second job's body should not have started until after the first one
    // finished (>= ~30ms after t0).
    expect(order).toEqual([0, 0, 1]);
    expect(startedAt[1]).toBeGreaterThanOrEqual(25);
  });

  it('runs jobs on different dates in parallel', async () => {
    const order: (string | number)[] = [];
    const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

    const a = withDateLock('date-A', async () => {
      order.push('A-start');
      await delay(20);
      order.push('A-end');
    });
    const b = withDateLock('date-B', async () => {
      order.push('B-start');
    });

    await Promise.all([a, b]);
    // B should have started before A finished (otherwise the lock would be
    // over-serializing across dates).
    expect(order.indexOf('B-start')).toBeLessThan(order.indexOf('A-end'));
  });

  it('surfaces errors to the caller but keeps the chain alive', async () => {
    const date = `recover-${Date.now()}`;
    await expect(
      withDateLock(date, async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');

    // A subsequent job on the same date must still run; it must not be
    // blocked by the failed prior job.
    let ran = false;
    await withDateLock(date, async () => {
      ran = true;
    });
    expect(ran).toBe(true);
  });

  it('returns the value produced by the wrapped function', async () => {
    const result = await withDateLock('return-test', async () => 42);
    expect(result).toBe(42);
  });
});
