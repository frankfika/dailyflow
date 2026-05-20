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
}

const GITHUB_REPO = 'frankfika/dailyflow';
declare const __APP_VERSION__: string;
const CURRENT_VERSION = __APP_VERSION__;

/**
 * 检查是否有新版本
 */
export async function checkForUpdates(): Promise<UpdateInfo> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch latest release');
    }

    const release = await response.json();
    const latestVersion = release.tag_name.replace(/^v/, ''); // 移除 'v' 前缀
    const hasUpdate = compareVersions(latestVersion, CURRENT_VERSION) > 0;

    // 根据平台选择下载链接
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
    console.error('Failed to check for updates:', error);
    return {
      currentVersion: CURRENT_VERSION,
      latestVersion: CURRENT_VERSION,
      hasUpdate: false,
    };
  }
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

