/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * aiConfirmBus — tiny pub/sub bus connecting the AI send pipeline to the
 * human confirmation gate (C1).
 *
 * Why a bus: the send pipeline lives in a hook and must *await* a human
 * decision, while the dialog is a plain React component rendered by AIChat.
 * The pipeline publishes a request and awaits the returned promise; the
 * dialog subscribes, renders, and resolves the request with true/false.
 * No global UI state, no prop drilling through App.tsx.
 */

export type AiConfirmKind = 'delete' | 'batch_write';

export interface AiConfirmRequest {
  id: string;
  kind: AiConfirmKind;
  /** For kind 'delete': the destructive tool asking (delete_task / delete_note / delete_event). */
  tool?: string;
  /** Human-readable target, e.g. the task title about to be deleted. */
  targetSummary?: string;
  /** For kind 'batch_write': one summary line per queued write call. */
  items?: string[];
  language: 'en' | 'zh';
}

type Listener = (request: AiConfirmRequest | null) => void;

let current: (AiConfirmRequest & { resolve: (confirmed: boolean) => void }) | null = null;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach(listener => listener(getPendingAiConfirm()));
}

export function getPendingAiConfirm(): AiConfirmRequest | null {
  if (!current) return null;
  const { resolve: _resolve, ...request } = current;
  return request;
}

/**
 * Publish a confirmation request and await the user's decision.
 * A second request while one is pending cancels the first (resolved false) —
 * the send pipeline is single-flight, so this only guards stray callers.
 */
export function requestAiConfirmation(
  req: Omit<AiConfirmRequest, 'id'>
): Promise<boolean> {
  return new Promise(resolve => {
    if (current) {
      const previous = current;
      current = null;
      previous.resolve(false);
    }
    current = {
      ...req,
      id: `aiconfirm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      resolve: resolve,
    };
    emit();
  });
}

/** Resolve the pending request. No-op when the id no longer matches. */
export function resolveAiConfirmation(id: string, confirmed: boolean): void {
  if (!current || current.id !== id) return;
  const request = current;
  current = null;
  emit();
  request.resolve(confirmed);
}

/**
 * Resolve whatever is pending with `false` (declined). Used when the user
 * stops the request mid-confirmation so the awaited pipeline can unwind
 * instead of blocking forever.
 */
export function cancelPendingAiConfirmations(): void {
  if (!current) return;
  const request = current;
  current = null;
  emit();
  request.resolve(false);
}

export function subscribeAiConfirm(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
