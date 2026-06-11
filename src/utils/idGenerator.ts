/**
 * Unique ID generators for DailyFlow.
 * All client-side IDs use crypto.randomUUID() when available,
 * falling back to a timestamp + random suffix for older environments.
 */

let _counter = 0;

function fallbackId(): string {
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  const cnt = (++_counter).toString(36);
  return `${time}_${rand}_${cnt}`;
}

/**
 * Generate a collision-resistant task ID.
 * Format: t_<uuid> or t_<timestamp>_<random>_<counter>
 */
export function generateTaskId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `t_${crypto.randomUUID()}`;
  }
  return `t_${fallbackId()}`;
}

/**
 * Generate a short unique ID for any purpose (messages, sessions, etc.)
 */
export function generateShortId(prefix = 'id'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}
