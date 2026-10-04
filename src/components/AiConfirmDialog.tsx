/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * AiConfirmDialog — the human confirmation gate for AI tool calls (C1/C2).
 *
 * Listens on aiConfirmBus; when the send pipeline requests confirmation for a
 * destructive delete or a batch of write tools, this dialog is shown and the
 * pipeline stays blocked until the user decides. Visual paradigm mirrors
 * ConfirmDialog.tsx (overlay + centered card + cancel/confirm pair).
 *
 * Accessibility: role="dialog" + aria-modal, Esc = cancel, background click =
 * cancel, focus lands on the safe action (cancel for deletes).
 */

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  getPendingAiConfirm,
  resolveAiConfirmation,
  subscribeAiConfirm,
  type AiConfirmRequest,
} from '../utils/aiConfirmBus';

const LABELS = {
  deleteTitle: { zh: 'AI 请求删除数据', en: 'AI wants to delete data' },
  batchTitle: { zh: 'AI 请求批量写入', en: 'AI wants to write multiple items' },
  deleteBodyPrefix: {
    zh: 'AI 请求删除：',
    en: 'The AI asks to delete:',
  },
  deleteHint: {
    zh: '删除不可撤销。确认后才会在你的数据中真实执行。',
    en: 'Deletion cannot be undone. Nothing happens until you confirm.',
  },
  batchHint: {
    zh: 'AI 将连续执行以下写入操作：',
    en: 'The AI will apply the following writes:',
  },
  confirmDelete: { zh: '确认删除', en: 'Delete' },
  confirmBatch: { zh: '全部执行', en: 'Apply all' },
  cancel: { zh: '取消', en: 'Cancel' },
  typeChangePrefix: { zh: '应用后将把类型改为「', en: 'Will also change type to "' },
} as const;

export function AiConfirmDialog() {
  const [request, setRequest] = useState<AiConfirmRequest | null>(() => getPendingAiConfirm());
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => subscribeAiConfirm(setRequest), []);

  // Esc = cancel; move focus to the safe button while open.
  useEffect(() => {
    if (!request) return;
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        resolveAiConfirmation(request.id, false);
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [request]);

  const isDelete = request?.kind === 'delete';
  const lang = request?.language ?? 'zh';

  return (
    <AnimatePresence>
      {request && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9998] bg-black/40 flex items-center justify-center p-4"
          onClick={() => resolveAiConfirmation(request.id, false)}
          data-testid="ai-confirm-overlay"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ai-confirm-title"
            data-testid="ai-confirm-dialog"
            className="max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto overscroll-contain rounded-md border border-border bg-surface-white p-6 shadow-sm"
            onClick={e => e.stopPropagation()}
          >
            <h2 id="ai-confirm-title" className="font-sans text-lg font-medium text-text-heading mb-1">
              {isDelete ? LABELS.deleteTitle[lang] : LABELS.batchTitle[lang]}
            </h2>
            {isDelete ? (
              <p className="text-sm text-text-muted mb-2">
                {LABELS.deleteBodyPrefix[lang]}
                {request.targetSummary ? (
                  <span className="font-bold text-text-heading"> {request.targetSummary}</span>
                ) : null}
              </p>
            ) : (
              <div className="mb-2">
                <p className="text-sm text-text-muted mb-1.5">{LABELS.batchHint[lang]}</p>
                <ul className="max-h-40 overflow-y-auto rounded border border-border bg-surface px-2.5 py-1.5 text-[13px] text-text-heading space-y-1">
                  {(request.items ?? []).map((item, index) => (
                    <li key={index} className="whitespace-pre-wrap">{item}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-xs text-text-muted/80 mb-5">
              {isDelete ? LABELS.deleteHint[lang] : (lang === 'zh' ? '取消则本轮所有写入都不会执行。' : 'Cancel to skip every write in this turn.')}
            </p>
            <div className="flex gap-3">
              <button
                ref={cancelRef}
                onClick={() => resolveAiConfirmation(request.id, false)}
                data-testid="ai-confirm-cancel"
                className="flex-1 py-2 rounded-md border border-border text-sm font-medium text-text-muted hover:bg-surface transition-colors"
              >
                {LABELS.cancel[lang]}
              </button>
              <button
                onClick={() => resolveAiConfirmation(request.id, true)}
                data-testid="ai-confirm-confirm"
                className={`flex-1 py-2 rounded-md text-white text-sm font-medium transition-colors ${
                  isDelete ? 'bg-red-500 hover:bg-red-600' : 'bg-accent hover:bg-accent/90'
                }`}
              >
                {isDelete ? LABELS.confirmDelete[lang] : LABELS.confirmBatch[lang]}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
