import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { UpdateInfo } from '../api/updater';

interface UpdateNotificationModalProps {
  updateInfo: UpdateInfo;
  onClose: () => void;
  onUpdate: (onProgress: (downloaded: number, total: number) => void) => Promise<void>;
  onSkipVersion: () => void;
}

export function UpdateNotificationModal({
  updateInfo,
  onClose,
  onUpdate,
  onSkipVersion,
}: UpdateNotificationModalProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  const handleUpdate = async () => {
    setIsDownloading(true);
    try {
      await onUpdate((downloaded, total) => {
        const progress = total > 0 ? Math.round((downloaded / total) * 100) : 0;
        setDownloadProgress(progress);
      });
    } catch (error) {
      console.error('Update failed:', error);
      setIsDownloading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="relative max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-lg border border-stone-200 bg-white p-6 shadow-lg dark:border-stone-700 dark:bg-stone-800">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
        >
          <X size={20} />
        </button>

        <div className="mb-4">
          <h2 className="text-xl font-semibold text-stone-900 dark:text-stone-100">
            New Update Available
          </h2>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            DailyFlow {updateInfo.latestVersion} is now available
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
              <span className="text-stone-600 dark:text-stone-400">Downloading...</span>
              <span className="font-medium text-stone-900 dark:text-stone-100">
                {downloadProgress}%
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onSkipVersion}
            className="flex-1 rounded border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
            disabled={isDownloading}
          >
            Skip This Version
          </button>
          <button
            onClick={handleUpdate}
            className="flex-1 rounded bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
            disabled={isDownloading}
          >
            {isDownloading ? 'Downloading...' : 'Update Now'}
          </button>
        </div>

        <button
          onClick={onClose}
          className="mt-3 w-full text-center text-sm text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-300"
          disabled={isDownloading}
        >
          Remind Me Later
        </button>
      </div>
    </div>
  );
}
