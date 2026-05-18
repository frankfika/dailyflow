import { motion, AnimatePresence } from 'motion/react';
import { Loader2 } from 'lucide-react';

interface RolloverTask {
  title: string;
  source_date?: string;
}

interface RolloverPreviewModalProps {
  show: boolean;
  preview: { tasksToMigrate: RolloverTask[]; fromDate: string } | null;
  isRollingOver: boolean;
  language: 'en' | 'zh';
  onClose: () => void;
  onConfirm: () => void;
}

export function RolloverPreviewModal({
  show,
  preview,
  isRollingOver,
  language,
  onClose,
  onConfirm,
}: RolloverPreviewModalProps) {
  return (
    <AnimatePresence>
      {show && preview && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9998] bg-black/40 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="bg-surface-white rounded-2xl shadow-2xl border border-border w-full max-w-md p-6"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="font-serif text-lg font-medium text-text-heading mb-1">
              {language === 'zh' ? '迁移未完成任务' : 'Migrate Unfinished Tasks'}
            </h2>
            <p className="text-sm text-text-muted mb-4">
              {language === 'zh'
                ? `将 ${preview.fromDate} 起的 ${preview.tasksToMigrate.length} 个未完成任务迁移到今天`
                : `Migrate ${preview.tasksToMigrate.length} unfinished tasks from ${preview.fromDate} to today`}
            </p>
            <div className="space-y-2 max-h-48 overflow-y-auto mb-5">
              {preview.tasksToMigrate.map((t, i) => (
                <div key={i} className="flex items-center gap-2.5 text-sm text-text-main py-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                  <span className="flex-1 truncate">{t.title}</span>
                  {t.source_date && <span className="text-[10px] text-text-muted shrink-0">{t.source_date}</span>}
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-2 rounded-xl border border-border text-sm font-medium text-text-muted hover:bg-surface transition-colors"
              >
                {language === 'zh' ? '取消' : 'Cancel'}
              </button>
              <button
                onClick={onConfirm}
                disabled={isRollingOver}
                className="flex-1 py-2 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isRollingOver && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {language === 'zh' ? '确认迁移' : 'Confirm'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
