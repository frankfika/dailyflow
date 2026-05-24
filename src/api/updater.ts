/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  downloadUrl?: string;
  releaseNotes?: string;
  publishedAt?: string;
  error?: string;
}

const GITHUB_REPO = 'frankfika/dailyflow';
declare const __APP_VERSION__: string;
const CURRENT_VERSION = __APP_VERSION__;

// GitHub token for API requests (avoids rate limiting)
// Set via environment variable or build config
const GITHUB_TOKEN = (typeof import.meta.env.VITE_GITHUB_TOKEN === 'string' && import.meta.env.VITE_GITHUB_TOKEN)
  ? import.meta.env.VITE_GITHUB_TOKEN
  : '';

// Debug: log token presence (don't log the actual token)
console.log('[Updater] GitHub token present:', !!GITHUB_TOKEN, '| Token length:', GITHUB_TOKEN.length);

/**
 * 检查是否有新版本
 */
export async function checkForUpdates(): Promise<UpdateInfo> {
  const maxRetries = 2;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const headers: Record<string, string> = {
        'Accept': 'application/vnd.github.v3+json',
      };
      if (GITHUB_TOKEN) {
        headers['Authorization'] = `Bearer ${GITHUB_TOKEN}`;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
        { headers, signal: controller.signal }
      );
      clearTimeout(timeoutId);

      if (response.status === 404) {
        return {
          currentVersion: CURRENT_VERSION,
          latestVersion: CURRENT_VERSION,
          hasUpdate: false,
        };
      }

      if (response.status === 403 || response.status === 401) {
        // Rate limit or auth error - don't retry
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch latest release: ${response.status} ${response.statusText}`);
      }

      const release = await response.json();
      const latestVersion = release.tag_name.replace(/^v/, '');
      const hasUpdate = compareVersions(latestVersion, CURRENT_VERSION) > 0;

      const platform = getPlatform();
      const asset = release.assets.find((a: any) => {
        const name = a.name.toLowerCase();
        if (platform === 'macos') return name.endsWith('.dmg') || name.endsWith('.app.tar.gz');
        if (platform === 'windows') return name.endsWith('.msi') || name.endsWith('.exe');
        if (platform === 'linux') return name.endsWith('.AppImage') || name.endsWith('.deb');
        return false;
      });

      return {
        currentVersion: CURRENT_VERSION,
        latestVersion,
        hasUpdate,
        downloadUrl: asset?.browser_download_url || release.html_url,
        releaseNotes: release.body,
        publishedAt: release.published_at,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const isLastAttempt = attempt === maxRetries;

      // Don't retry on auth errors or abort
      if (message.includes('403') || message.includes('401') || message.includes('GitHub API error') || message.includes('aborted')) {
        console.error('Failed to check for updates (auth error, no retry):', message);
        return {
          currentVersion: CURRENT_VERSION,
          latestVersion: CURRENT_VERSION,
          hasUpdate: false,
          error: message,
        };
      }

      if (isLastAttempt) {
        console.error('Failed to check for updates:', message);
        return {
          currentVersion: CURRENT_VERSION,
          latestVersion: CURRENT_VERSION,
          hasUpdate: false,
          error: message,
        };
      }

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Should never reach here
  return {
    currentVersion: CURRENT_VERSION,
    latestVersion: CURRENT_VERSION,
    hasUpdate: false,
    error: 'Update check failed',
  };
}

/**
 * 比较版本号
 * @returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

/**
 * 获取当前平台
 */
function getPlatform(): 'macos' | 'windows' | 'linux' | 'unknown' {
  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes('mac')) return 'macos';
  if (userAgent.includes('win')) return 'windows';
  if (userAgent.includes('linux')) return 'linux';
  return 'unknown';
}

