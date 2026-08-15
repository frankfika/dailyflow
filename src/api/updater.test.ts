import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCheck = vi.fn();
const mockRelaunch = vi.fn();

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: (...args: unknown[]) => mockCheck(...args),
}));

vi.mock('@tauri-apps/plugin-process', () => ({
  relaunch: () => mockRelaunch(),
}));

type ProgressEvent =
  | { event: 'Started'; data: { contentLength?: number } }
  | { event: 'Progress'; data: { chunkLength: number } }
  | { event: 'Finished'; data: Record<string, never> };

function makeUpdate(events?: ProgressEvent[]) {
  return {
    version: '9.9.9',
    body: 'notes',
    date: '2026-08-15',
    downloadAndInstall: vi.fn(async (cb?: (e: ProgressEvent) => void) => {
      for (const e of events ?? [
        { event: 'Started', data: { contentLength: 100 } },
        { event: 'Progress', data: { chunkLength: 100 } },
        { event: 'Finished', data: {} },
      ] as ProgressEvent[]) {
        cb?.(e);
      }
    }),
  };
}

async function importUpdater() {
  // Fresh module state (cached update / download promise) per test
  vi.resetModules();
  return import('./updater');
}

describe('updater (background download)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as Record<string, unknown>).__APP_VERSION__ = '1.7.0';
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  });

  it('reports dev_mode outside Tauri', async () => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    const { checkForUpdates } = await importUpdater();
    const info = await checkForUpdates();
    expect(info.hasUpdate).toBe(false);
    expect(info.errorCode).toBe('dev_mode');
    expect(mockCheck).not.toHaveBeenCalled();
  });

  it('reuses the Update handle between check and download', async () => {
    const update = makeUpdate();
    mockCheck.mockResolvedValue(update);
    const { checkForUpdates, downloadUpdate } = await importUpdater();

    const info = await checkForUpdates();
    expect(info.hasUpdate).toBe(true);
    expect(info.latestVersion).toBe('9.9.9');

    await downloadUpdate();
    expect(mockCheck).toHaveBeenCalledTimes(1);
    expect(update.downloadAndInstall).toHaveBeenCalledTimes(1);
  });

  it('dedupes concurrent downloads into a single task', async () => {
    const update = makeUpdate();
    mockCheck.mockResolvedValue(update);
    const { downloadUpdate } = await importUpdater();

    await Promise.all([downloadUpdate(), downloadUpdate(), downloadUpdate()]);
    expect(update.downloadAndInstall).toHaveBeenCalledTimes(1);
  });

  it('reports downloaded state and short-circuits later calls', async () => {
    const update = makeUpdate();
    mockCheck.mockResolvedValue(update);
    const { downloadUpdate, isUpdateDownloaded } = await importUpdater();

    expect(isUpdateDownloaded()).toBe(false);
    await downloadUpdate();
    expect(isUpdateDownloaded()).toBe(true);

    await downloadUpdate();
    expect(update.downloadAndInstall).toHaveBeenCalledTimes(1);
  });

  it('forwards progress events to the callback', async () => {
    const update = makeUpdate([
      { event: 'Started', data: { contentLength: 200 } },
      { event: 'Progress', data: { chunkLength: 50 } },
      { event: 'Progress', data: { chunkLength: 150 } },
      { event: 'Finished', data: {} },
    ]);
    mockCheck.mockResolvedValue(update);
    const { downloadUpdate } = await importUpdater();

    const seen: Array<[number, number]> = [];
    await downloadUpdate((d, t) => seen.push([d, t]));
    expect(seen).toEqual([[0, 200], [50, 200], [200, 200], [200, 200]]);
  });

  it('allows retry after a failed download', async () => {
    const update = makeUpdate();
    update.downloadAndInstall
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(undefined);
    mockCheck.mockResolvedValue(update);
    const { downloadUpdate, isUpdateDownloaded } = await importUpdater();

    await expect(downloadUpdate()).rejects.toThrow('network down');
    expect(isUpdateDownloaded()).toBe(false);

    await downloadUpdate();
    expect(isUpdateDownloaded()).toBe(true);
    expect(update.downloadAndInstall).toHaveBeenCalledTimes(2);
  });

  it('throws when no update is available', async () => {
    mockCheck.mockResolvedValue(null);
    const { downloadUpdate } = await importUpdater();
    await expect(downloadUpdate()).rejects.toThrow('No update available');
  });

  it('relaunchApp delegates to the process plugin', async () => {
    const { relaunchApp } = await importUpdater();
    await relaunchApp();
    expect(mockRelaunch).toHaveBeenCalledTimes(1);
  });
});
