import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2 } from 'lucide-react';

interface ConfirmDialogProps {
  show: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isLoading?: boolean;
  variant?: 'danger' | 'accent';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  show,
  title,
  message,
  confirmText,
  cancelText,
  isLoading,
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // A8: a11y baseline for the shared confirm — role/aria-modal, Esc to cancel,
  // and initial focus on the cancel button so an accidental Enter/Space on
  // the trigger does not confirm the destructive action.
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!show) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey, true);
    cancelRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey, true);
  }, [show, onCancel]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9998] bg-black/40 flex items-center justify-center p-4"
          onClick={onCancel}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            data-testid="confirm-dialog"
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto overscroll-contain rounded-md border border-border bg-surface-white p-6 shadow-sm"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="font-sans text-lg font-medium text-text-heading mb-1">{title}</h2>
            <p className="text-sm text-text-muted mb-5">{message}</p>
            <div className="flex gap-3">
              <button
                ref={cancelRef}
                onClick={onCancel}
                disabled={isLoading}
                data-testid="confirm-dialog-cancel"
                className="flex-1 py-2 rounded-md border border-border text-sm font-medium text-text-muted hover:bg-surface transition-colors disabled:opacity-50"
              >
                {cancelText || 'Cancel'}
              </button>
              <button
                onClick={onConfirm}
                disabled={isLoading}
                data-testid="confirm-dialog-confirm"
                className={`flex-1 py-2 rounded-md text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${
                  variant === 'danger'
                    ? 'bg-red-500 hover:bg-red-600'
                    : 'bg-accent hover:bg-accent/90'
                }`}
              >
                {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {confirmText || 'Confirm'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
