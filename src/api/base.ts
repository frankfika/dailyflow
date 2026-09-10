import { invoke } from '@tauri-apps/api/core';

/**
 * Sidecar connection layer.
 *
 * The packaged app no longer hardcodes the sidecar port: the Rust shell picks
 * a free port per launch (and per watchdog respawn), so port conflicts cannot
 * happen. The frontend asks the shell for the current port lazily and
 * re-asks after any network failure, which is what makes a mid-session
 * sidecar restart invisible: requests rewrite their `http://127.0.0.1:<any>`
 * prefix to the live origin, so even a URL built from a stale constant
 * reaches the right server.
 */

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

let origin = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_ORIGIN ?? 'http://127.0.0.1:47832');
let originPromise: Promise<string> | null = null;

function ensureOrigin(): Promise<string> {
  if (import.meta.env.DEV || !isTauri) return Promise.resolve(origin);
  if (!originPromise) {
    originPromise = invoke<number>('get_server_port')
      .then((port) => {
        origin = `http://127.0.0.1:${port}`;
        return origin;
      })
      .catch((error) => {
        // Shell unreachable: fall back to the last known origin and let the
        // next call retry instead of caching the failure forever.
        originPromise = null;
        console.error('Failed to resolve sidecar port from shell', error);
        return origin;
      });
  }
  return originPromise;
}

/** Current sidecar origin ('' in dev, where Vite's /api proxy applies). */
export function apiOrigin(): string {
  return origin;
}

// Matches the API origin embedded in request URLs by the legacy clients —
// either the build-time default or any previously resolved dynamic port.
const API_PREFIX = /^http:\/\/127\.0\.0\.1:\d+(?=\/api)/;

export const healingFetch: typeof globalThis.fetch = async (input, init) => {
  if (!isTauri || import.meta.env.DEV || typeof input !== 'string' || !API_PREFIX.test(input)) {
    return globalThis.fetch(input, init);
  }
  try {
    return await globalThis.fetch(input.replace(API_PREFIX, await ensureOrigin()), init);
  } catch (error) {
    // Network-level failure: the sidecar may have died and been respawned by
    // the watchdog (possibly on a NEW port), or the blip may be transient.
    // Re-ask the shell and retry reads once. Writes are not retried (no
    // idempotency keys) but their origin is refreshed so the user's next
    // attempt succeeds.
    originPromise = null;
    const port = await invoke<number>('get_server_port').catch(() => null);
    if (!port) throw error;
    origin = `http://127.0.0.1:${port}`;
    if ((init?.method ?? 'GET') !== 'GET') throw error;
    return globalThis.fetch(input.replace(API_PREFIX, origin), init);
  }
};
