import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { UpdateInfo } from '../api/updater';

interface UpdateNotificationModalProps {
  language: 'en' | 'zh';
  updateInfo: UpdateInfo;
  onClose: () => void;
  onUpdate: (onProgress: (downloaded: number, total: number) => void) => Promise<void>;
  onSkipVersion: () => void;
}

export function UpdateNotificationModal({
  updateInfo,
  language,
  onClose,
  onUpdate,
  onSkipVersion,
}: UpdateNotificationModalProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
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
      <div role="dialog" aria-modal="true" aria-labelledby="update-modal-title" className="relative max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-lg border border-stone-200 bg-white p-6 shadow-lg dark:border-stone-700 dark:bg-stone-800">
        <button
          onClick={onClose}
          aria-label={language === 'zh' ? '关闭' : 'Close'}
          className="absolute top-4 right-4 text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
        >
          <X size={20} />
        </button>

        <div className="mb-4">
          <h2 id="update-modal-title" className="text-xl font-semibold text-stone-900 dark:text-stone-100">
            {language === 'zh' ? '发现新版本' : 'New Update Available'}
          </h2>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            {language === 'zh' ? `DailyFlow ${updateInfo.latestVersion} 现已可用` : `DailyFlow ${updateInfo.latestVersion} is now available`}
          </p>
        </div>

        {updateInfo.releaseNotes && (
          <div className="mb-4 max-h-48 overflow-y-auto rounded border border-stone-200 bg-stone-50 p-3 text-sm text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300">
            <div className="prose prose-sm dark:prose-invert">
              {updateInfo.releaseNotes.split('\n').map((line, i) => (
                <p key={i} className="mb-1">
                  {line}
                </p>
              ))}
            </div>
          </div>
        )}

        {isDownloading && (
          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-stone-600 dark:text-stone-400">{language === 'zh' ? '正在下载…' : 'Downloading...'}</span>
              <span className="font-medium text-stone-900 dark:text-stone-100">
                {downloadProgress}%
              </span>
            </div>
            <div role="progressbar" aria-label={language === 'zh' ? '下载进度' : 'Download progress'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={downloadProgress} className="h-2 w-full overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
          </div>
        )}

        {errorMessage && <div role="alert" className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{errorMessage}</div>}

        <div className="flex gap-3">
          <button
            onClick={onSkipVersion}
            className="flex-1 rounded border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
            disabled={isDownloading}
          >
            {language === 'zh' ? '跳过此版本' : 'Skip This Version'}
          </button>
          <button
            onClick={handleUpdate}
            className="flex-1 rounded bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
            disabled={isDownloading}
          >
            {isDownloading ? (language === 'zh' ? '正在下载…' : 'Downloading...') : (language === 'zh' ? '立即更新' : 'Update Now')}
          </button>
        </div>

        <button
          onClick={onClose}
          className="mt-3 w-full text-center text-sm text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-300"
          disabled={isDownloading}
        >
          {language === 'zh' ? '稍后提醒' : 'Remind Me Later'}
        </button>
      </div>
    </div>
  );
}
