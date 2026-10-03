/**
 * aiConfirmBus — the request/resolve channel for the C1 confirmation gate.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  cancelPendingAiConfirmations,
  requestAiConfirmation,
  resolveAiConfirmation,
  subscribeAiConfirm,
  getPendingAiConfirm,
} from '../../utils/aiConfirmBus';

describe('aiConfirmBus', () => {
  it('publishes a request and resolves it with the user decision', async () => {
    const seen: unknown[] = [];
    const unsubscribe = subscribeAiConfirm(req => seen.push(req));

    const pending = requestAiConfirmation({
      kind: 'delete',
      tool: 'delete_task',
      targetSummary: 'Doomed task',
      language: 'en',
    });
    expect(getPendingAiConfirm()).toMatchObject({
      kind: 'delete',
      tool: 'delete_task',
      targetSummary: 'Doomed task',
    });
    expect(getPendingAiConfirm()?.id).toBeTruthy();

    resolveAiConfirmation(getPendingAiConfirm()!.id, true);
    await expect(pending).resolves.toBe(true);
    expect(getPendingAiConfirm()).toBeNull();
    unsubscribe();

    expect(seen.at(0)).toMatchObject({ kind: 'delete' });
    expect(seen.at(-1)).toBeNull();
  });

  it('resolves false on decline and on stale ids', async () => {
    const pending = requestAiConfirmation({ kind: 'delete', tool: 'delete_note', language: 'zh' });
    resolveAiConfirmation('not-the-id', true);
    resolveAiConfirmation(getPendingAiConfirm()!.id, false);
    await expect(pending).resolves.toBe(false);
  });

  it('a newer request cancels the previous one instead of deadlocking it', async () => {
    const first = requestAiConfirmation({ kind: 'delete', tool: 'delete_task', language: 'en' });
    const second = requestAiConfirmation({ kind: 'batch_write', items: ['a', 'b'], language: 'en' });
    await expect(first).resolves.toBe(false);
    resolveAiConfirmation(getPendingAiConfirm()!.id, true);
    await expect(second).resolves.toBe(true);
  });

  it('cancel resolves pending with false (used on abort)', async () => {
    const spy = vi.fn();
    const pending = requestAiConfirmation({ kind: 'delete', tool: 'delete_event', language: 'en' });
    pending.then(spy);
    cancelPendingAiConfirmations();
    await expect(pending).resolves.toBe(false);
    expect(spy).toHaveBeenCalledWith(false);
    expect(getPendingAiConfirm()).toBeNull();
  });
});
