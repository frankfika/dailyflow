/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseMeetingCaptureOptions {
  /** Localized language for the ⌘⇧R hint toast text. */
  language: 'en' | 'zh';
  /** Toast used to surface the ⌘⇧R hint the first time it's used. */
  showToast: (message: string, type?: 'success' | 'info' | 'error') => void;
}

export interface UseMeetingCaptureResult {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

/**
 * useMeetingCapture — owns the global MeetingCapture modal lifecycle and the
 * ⌘⇧R global shortcut so `App.tsx` doesn't have to wire its own state,
 * key handler, and first-use hint every single time.
 *
 * Why a hook (not a context provider): only `App.tsx` ever needs to drive
 * the modal state, and the `<MeetingCapture>` component itself already
 * encapsulates the capture / save / extract-action-items flow. Threading
 * a context would add ceremony without saving any state.
 *
 * ⌘⇧R is normally the browser hard-reload. We intercept it so the user
 * can use the same muscle memory for "start a meeting capture" inside
 * the Tauri shell; the first invocation shows a one-shot toast hint.
 */
export function useMeetingCapture({ language, showToast }: UseMeetingCaptureOptions): UseMeetingCaptureResult {
  const [isOpen, setIsOpen] = useState(false);
  const hintShownRef = useRef(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // We don't require a hint cooldown here — if the modal is already
      // open, the component itself will short-circuit, and we don't want
      // to re-trigger any stale hint by re-opening it.
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'R' || e.key === 'r')) {
        e.preventDefault();
        setIsOpen(prev => {
          const wasClosed = !prev;
          if (wasClosed && !hintShownRef.current) {
            hintShownRef.current = true;
            showToast(
              language === 'zh'
                ? '提示: ⌘⇧R = 会议 Capture (dailyflow 拦截了浏览器 reload)'
                : 'Tip: ⌘⇧R = Meeting Capture (dailyflow intercepted the browser reload)',
              'info'
            );
          }
          return true;
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [language, showToast]);

  return { isOpen, open, close };
}
