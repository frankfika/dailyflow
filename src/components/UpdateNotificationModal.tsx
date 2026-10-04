import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { UpdateInfo } from '../api/updater';

interface UpdateNotificationModalProps {
  language: 'en' | 'zh';
  updateInfo: UpdateInfo;
  onClose: () => void;
  onUpdate: (onProgress: (downloaded: number, total: number) => void) => Promise<void>;
  onSkipVersion: () => void;
  alreadyDownloaded?: boolean;
}

export function UpdateNotificationModal({
  updateInfo,
  language,
  onClose,
  onUpdate,
  onSkipVersion,
  alreadyDownloaded = false,
}: UpdateNotificationModalProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(alreadyDownloaded ? 100 : 0);
  const [errorMessage, setErrorMessage] = useState('');

  const handleUpdate = async () => {
    setIsDownloading(true);
    setErrorMessage('');
    try {
      await onUpdate((downloaded, total) => {
        const progress = total > 0 ? Math.round((downloaded / total) * 100) : 0;
        setDownloadProgress(progress);
      });
    } catch (error) {
      console.error('Update failed:', error);
      setErrorMessage(language === 'zh'
        ? `更新失败：${error instanceof Error ? error.message : '请稍后重试'}`
        : `Update failed: ${error instanceof Error ? error.message : 'Please try again'}`);
      setIsDownloading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="update-modal-title" className="relative max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-lg border border-border bg-surface-white p-6 shadow-lg">
        <button
          onClick={onClose}
          aria-label={language === 'zh' ? '关闭' : 'Close'}
          className="absolute top-4 right-4 text-text-muted hover:text-text-heading"
        >
          <X size={20} />
        </button>

        <div className="mb-4">
          <h2 id="update-modal-title" className="text-xl font-semibold text-text-heading">
            {language === 'zh' ? '发现新版本' : 'New Update Available'}
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            {language === 'zh' ? `DailyFlow ${updateInfo.latestVersion} 现已可用` : `DailyFlow ${updateInfo.latestVersion} is now available`}
          </p>
        </div>

        {updateInfo.releaseNotes && (
          <div className="mb-4 max-h-48 overflow-y-auto rounded border border-border bg-background p-3 text-sm text-text-main">
            <div className="prose prose-sm">
              {updateInfo.releaseNotes.split('\n').map((line, i) => (
                <p key={i} className="mb-1">
                  {line}
                </p>
              ))}
            </div>
          </div>
        )}

        {alreadyDownloaded && !isDownloading && (
          <div className="mb-4 rounded border border-success/30 bg-success-light p-3 text-sm text-success">
            {language === 'zh'
              ? '更新包已在后台下载完成，点击「重启更新」即可生效。'
              : 'The update has been downloaded in the background. Click "Restart & Update" to apply.'}
          </div>
        )}

        {isDownloading && !alreadyDownloaded && (
          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-text-muted">{language === 'zh' ? '正在下载…' : 'Downloading...'}</span>
              <span className="font-medium text-text-heading">
                {downloadProgress}%
              </span>
            </div>
            <div role="progressbar" aria-label={language === 'zh' ? '下载进度' : 'Download progress'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={downloadProgress} className="h-2 w-full overflow-hidden rounded-full bg-border">
              <div
                className="h-full bg-accent transition-all duration-300"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
          </div>
        )}

        {errorMessage && <div role="alert" className="mb-4 rounded border border-danger/30 bg-danger-light p-3 text-sm text-danger">{errorMessage}</div>}

        <div className="flex gap-3">
          <button
            onClick={onSkipVersion}
            className="flex-1 rounded border border-border bg-surface-white px-4 py-2 text-sm font-medium text-text-main hover:bg-surface"
            disabled={isDownloading}
          >
            {language === 'zh' ? '跳过此版本' : 'Skip This Version'}
          </button>
          <button
            onClick={handleUpdate}
            className="flex-1 rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-warm disabled:opacity-50"
            disabled={isDownloading}
          >
            {isDownloading
              ? (language === 'zh' ? '正在处理…' : 'Processing...')
              : alreadyDownloaded
                ? (language === 'zh' ? '重启更新' : 'Restart & Update')
                : (language === 'zh' ? '立即更新' : 'Update Now')}
          </button>
        </div>

        <button
          onClick={onClose}
          className="mt-3 w-full text-center text-sm text-text-muted hover:text-text-heading"
          disabled={isDownloading}
        >
          {language === 'zh' ? '稍后提醒' : 'Remind Me Later'}
        </button>
      </div>
    </div>
  );
}
