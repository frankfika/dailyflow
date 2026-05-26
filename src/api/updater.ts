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

/**
 * 检查是否有新版本
 */
export async function checkForUpdates(): Promise<UpdateInfo> {
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
      hasUpdate: update.available,
      releaseNotes: update.body,
      publishedAt: update.date,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Failed to check for updates:', message);
    return {
      currentVersion: CURRENT_VERSION,
      latestVersion: CURRENT_VERSION,
      hasUpdate: false,
      error: message,
    };
  }
}

/**
 * 下载并安装更新
 */
export async function downloadAndInstallUpdate(
  onProgress?: (downloaded: number, total: number) => void
): Promise<void> {
  const update = await check();

  if (!update || !update.available) {
    throw new Error('No update available');
  }

  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case 'Started':
        onProgress?.(0, event.data.contentLength || 0);
        break;
      case 'Progress':
        onProgress?.(event.data.chunkLength, event.data.contentLength || 0);
        break;
      case 'Finished':
        break;
    }
  });

  await relaunch();
}

