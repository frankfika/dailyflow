import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * healingFetch runs only inside the packaged Tauri webview (isTauri) with
 * production builds (DEV false), so these tests fake both conditions before
 * importing the module.
 */

async function loadBase(tauriPort: number | null) {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  import.meta.env.DEV = false;
  vi.doMock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(async () => {
      if (tauriPort === null) throw new Error('shell gone');
      return tauriPort;
    }),
  }));
  return (await import('./base')).healingFetch;
}

describe('healingFetch (Tauri prod simulation)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    import.meta.env.DEV = true;
  });

  it('rewrites stale absolute API origins to the shell-assigned port', async () => {
    const healingFetch = await loadBase(51999);
    const fetchMock = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);

    // Legacy client builds the URL from the build-time default (47832).
    await healingFetch('http://127.0.0.1:47832/api/files/2026-09-10');

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:51999/api/files/2026-09-10', undefined);
  });

  it('re-asks the shell and retries a GET on a fresh port after network failure', async () => {
    const healingFetch = await loadBase(51001);
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(new Response('{"ok":true}'));
    vi.stubGlobal('fetch', fetchMock);

    const res = await healingFetch('http://127.0.0.1:47832/api/files/list');

    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith('http://127.0.0.1:51001/api/files/list', undefined);
  });

  it('does not retry writes (no idempotency keys) but refreshes the origin', async () => {
    const healingFetch = await loadBase(51002);
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      healingFetch('http://127.0.0.1:47832/api/tasks/t_1', { method: 'DELETE' }),
    ).rejects.toThrow('fetch failed');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    // The next read uses the refreshed port without another failure first.
    fetchMock.mockResolvedValueOnce(new Response('[]'));
    await healingFetch('http://127.0.0.1:47832/api/files/list');
    expect(fetchMock).toHaveBeenLastCalledWith('http://127.0.0.1:51002/api/files/list', undefined);
  });
});
