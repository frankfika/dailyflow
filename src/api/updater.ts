/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  downloadUrl?: string;
  releaseNotes?: string;
  publishedAt?: string;
  error?: string;
}

declare const __APP_VERSION__: string;
const CURRENT_VERSION = __APP_VERSION__;

function isTauriEnv(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function classifyUpdaterError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();

  if (!isTauriEnv()) {
    return 'Not running in Tauri app (development mode)';
  }
  if (lower.includes('not configured') || lower.includes('no updater') || lower.includes('updater is not')) {
    return 'Updater not configured';
  }
  if (lower.includes('network') || lower.includes('fetch') || lower.includes('connection') || lower.includes('econnrefused') || lower.includes('offline') || lower.includes('failed to fetch')) {
    return 'Network error';
  }
  if (lower.includes('404') || lower.includes('not found')) {
    return 'Update endpoint not found';
  }
  if (lower.includes('signature') || lower.includes('sign')) {
    return 'Signature verification failed';
  }
  if (lower.includes('timeout')) {
    return 'Request timed out';
  }
  if (lower.includes('tauri') || lower.includes('__tauri__') || lower.includes('ipc')) {
    return 'Not running in Tauri app';
  }
  return msg || 'Unknown error';
}

/**
 * 检查是否有新版本
 */
export async function checkForUpdates(): Promise<UpdateInfo> {
  if (!isTauriEnv()) {
    return {
      currentVersion: CURRENT_VERSION,
      latestVersion: CURRENT_VERSION,
      hasUpdate: false,
      error: 'Not running in Tauri app (development mode)',
    };
  }

  try {
    const update = await check();

    if (!update) {
      return {
        currentVersion: CURRENT_VERSION,
        latestVersion: CURRENT_VERSION,
        hasUpdate: false,
      };
    }

    return {
      currentVersion: CURRENT_VERSION,
      latestVersion: update.version,
      hasUpdate: true,
      releaseNotes: update.body,
      publishedAt: update.date,
    };
  } catch (error) {
    const message = classifyUpdaterError(error);
    console.error('Failed to check for updates:', message, error);
    return {
      currentVersion: CURRENT_VERSION,
      latestVersion: CURRENT_VERSION,
      hasUpdate: false,
      error: message,
    };
  }
}

/**
 * 下载并安装更新（不自动重启）
 */
export async function downloadUpdate(
  onProgress?: (downloaded: number, total: number) => void
): Promise<void> {
  const update = await check();

  if (!update) {
    throw new Error('No update available');
  }

  let totalBytes = 0;
  let downloadedBytes = 0;

  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case 'Started':
        totalBytes = event.data.contentLength ?? 0;
        downloadedBytes = 0;
        onProgress?.(0, totalBytes);
        break;
      case 'Progress':
        downloadedBytes += event.data.chunkLength;
        onProgress?.(downloadedBytes, totalBytes);
        break;
      case 'Finished':
        onProgress?.(downloadedBytes, totalBytes);
        break;
    }
  });
}

/**
 * 重启应用以应用更新
 */
export async function relaunchApp(): Promise<void> {
  await relaunch();
}

