/**
 * DailyReflectionModal — Today 视图的"今日复盘"对话框 (Sprint 1 Gap 5).
 *
 * The user opens this via ⌘J / ⌘K or the quiet reflection bar. The
 * modal pre-fills today's completed / in-progress / postponed tasks (so
 * they don't have to retype what they just did), and lets them write a
 * free-form reflection. On confirm we POST to `/api/v2/reports/daily`,
 * which writes `Journal/YYYY-MM-DD.md` and audits the action.
 *
 * The component is intentionally controlled: the parent owns `show`,
 * supplies the task snapshot, and gets `onClose` / `onConfirm`
 * callbacks. We deliberately keep the API surface small so the host can
 * reuse it from other entry points (rollover auto-trigger, keyboard
 * shortcut, etc.).
 */

import { useEffect, useId, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, Clock, X as XIcon, PauseCircle, FileText, Loader2 } from 'lucide-react';
import { reportsApi, type DailyReportSnapshot, type DailyReportSummary } from '../api/client';

export interface DailyReflectionTask {
  id: string;
  title: string;
  tags?: string[];
  /** Optional progress note (in-progress tasks). */
  progress?: string;
  /** Optional reason (postponed tasks). */
  reason?: string;
}

export interface DailyReflectionModalProps {
  show: boolean;
  date: string;
  language: 'en' | 'zh';
  completedTasks: DailyReflectionTask[];
  inProgressTasks: DailyReflectionTask[];
  postponedTasks: DailyReflectionTask[];
  /** Optional pre-existing reflection text (e.g. when reopening a saved report). */
  initialReflection?: string;
  /** True while the parent is saving (button spinner). */
  saving?: boolean;
  /** Server result from a previous save; lets us show the saved path. */
  lastSaved?: DailyReportSummary | null;
  /** Toast helper from the host app. */
  showToast?: (message: string, type?: 'success' | 'info' | 'error') => void;
  onClose: () => void;
  onConfirm: (params: {
    date: string;
    reflection: string;
    snapshot: DailyReportSnapshot;
  }) => Promise<void> | void;
}

const MAX_REFLECTION = 20_000;

function Section({
  icon,
  title,
  count,
  emptyLabel,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  emptyLabel: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-border/60 bg-white/55 p-3" data-testid="reflection-section">
      <header className="flex items-center gap-1.5 mb-1.5">
        {icon}
        <h3 className="text-xs font-medium text-text-heading">{title}</h3>
        <span className="text-[11px] tabular-nums text-text-muted/65">{count}</span>
      </header>
      {count === 0 ? (
        <p className="text-[12px] text-text-muted/65 italic">{emptyLabel}</p>
      ) : (
        <ul className="space-y-1">{children}</ul>
      )}
    </section>
  );
}

function TaskRow({ task, testid }: { task: DailyReflectionTask; testid?: string }) {
  return (
    <li className="flex items-start gap-2 text-[12px] leading-snug" data-testid={testid}>
      <span className="mt-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-sm bg-accent/55" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <div className="truncate text-text-main">{task.title}</div>
        {task.tags && task.tags.length > 0 && (
          <div className="text-[11px] text-text-muted/65">
            {task.tags.slice(0, 4).map((t) => `#${t}`).join(' ')}
          </div>
        )}
        {task.progress && (
          <div className="text-[11px] text-text-muted/75">{task.progress}</div>
        )}
        {task.reason && (
          <div className="text-[11px] text-text-muted/75">原因：{task.reason}</div>
        )}
      </div>
    </li>
  );
}

export function DailyReflectionModal({
  show,
  date,
  language,
  completedTasks,
  inProgressTasks,
  postponedTasks,
  initialReflection = '',
  saving = false,
  lastSaved = null,
  showToast,
  onClose,
  onConfirm,
}: DailyReflectionModalProps) {
  const [reflection, setReflection] = useState(initialReflection);
  const reflectionId = useId();

  // Reset the textarea whenever the modal re-opens with a new initial value.
  useEffect(() => {
    if (show) setReflection(initialReflection);
  }, [show, initialReflection]);

  // Escape closes the modal (unless we're mid-save).
  useEffect(() => {
    if (!show) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [show, saving, onClose]);

  const handleConfirm = async () => {
    const trimmed = reflection.trim();
    if (
      trimmed.length === 0 &&
      completedTasks.length === 0 &&
      inProgressTasks.length === 0 &&
      postponedTasks.length === 0
    ) {
      showToast?.(language === 'zh' ? '今日暂无内容可复盘' : 'Nothing to reflect on yet', 'info');
      return;
    }
    await onConfirm({
      date,
      reflection: trimmed,
      snapshot: {
        completedTasks: completedTasks.map((t) => ({ id: t.id, title: t.title, tags: t.tags })),
        inProgressTasks: inProgressTasks.map((t) => ({ id: t.id, title: t.title, progress: t.progress })),
        postponedTasks: postponedTasks.map((t) => ({ id: t.id, title: t.title, reason: t.reason })),
      },
    });
  };

  const charCount = reflection.length;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 p-4"
          onClick={() => { if (!saving) onClose(); }}
          role="presentation"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.18 }}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto overscroll-contain rounded-md border border-border bg-surface-white p-5 shadow-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="daily-reflection-title"
            data-testid="daily-reflection-modal"
          >
            <header className="mb-4 flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <FileText className="mt-0.5 h-5 w-5 text-accent" aria-hidden="true" />
                <div>
                  <h2 id="daily-reflection-title" className="font-sans text-base font-medium text-text-heading">
                    {language === 'zh' ? '今日复盘' : 'Daily reflection'}
                  </h2>
                  <p className="text-[12px] text-text-muted/75">
                    {language === 'zh'
                      ? `${date} · 将写入 Journal/${date}.md`
                      : `${date} · writes to Journal/${date}.md`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { if (!saving) onClose(); }}
                aria-label={language === 'zh' ? '关闭' : 'Close'}
                className="rounded-md p-1 text-text-muted hover:bg-black/[0.04] hover:text-text-heading disabled:opacity-50"
                disabled={saving}
              >
                <XIcon className="h-4 w-4" />
              </button>
            </header>

            <div className="grid gap-3">
              <Section
                icon={<Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />}
                title={language === 'zh' ? '✅ 今日完成' : 'Completed today'}
                count={completedTasks.length}
                emptyLabel={language === 'zh' ? '尚无已完成任务' : 'No completed tasks yet'}
              >
                {completedTasks.map((t) => (
                  <TaskRow key={t.id} task={t} testid="reflection-completed-row" />
                ))}
              </Section>

              <Section
                icon={<Clock className="h-3.5 w-3.5 text-warning" aria-hidden="true" />}
                title={language === 'zh' ? '⏰ 进行中' : 'In progress'}
                count={inProgressTasks.length}
                emptyLabel={language === 'zh' ? '今日没有进行中的任务' : 'Nothing in progress today'}
              >
                {inProgressTasks.map((t) => (
                  <TaskRow key={t.id} task={t} testid="reflection-inprogress-row" />
                ))}
              </Section>

              <Section
                icon={<PauseCircle className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />}
                title={language === 'zh' ? '⛔ 推迟 / 取消' : 'Postponed'}
                count={postponedTasks.length}
                emptyLabel={language === 'zh' ? '无推迟任务' : 'No postponed tasks'}
              >
                {postponedTasks.map((t) => (
                  <TaskRow key={t.id} task={t} testid="reflection-postponed-row" />
                ))}
              </Section>

              <div className="rounded-md border border-border/60 bg-white/55 p-3">
                <label
                  htmlFor={reflectionId}
                  className="mb-1.5 block text-xs font-medium text-text-heading"
                >
                  {language === 'zh' ? '💭 今日复盘（进展 / 卡点 / 启发）' : 'Reflection (progress / blockers / insights)'}
                </label>
                <textarea
                  id={reflectionId}
                  value={reflection}
                  onChange={(e) => setReflection(e.target.value.slice(0, MAX_REFLECTION))}
                  placeholder={
                    language === 'zh'
                      ? '今天的进展是……\n卡点是……\n启发是……'
                      : 'What went well today?\nWhat blocked you?\nWhat did you learn?'
                  }
                  rows={6}
                  disabled={saving}
                  data-testid="reflection-textarea"
                  className="block w-full resize-y rounded-md border border-border/80 bg-white/80 p-2.5 text-sm leading-relaxed text-text-main placeholder:text-text-muted/45 focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-60"
                />
                <div className="mt-1 flex items-center justify-between text-[11px] text-text-muted/65">
                  <span>
                    {language === 'zh'
                      ? '将保存为 Markdown 文件，路径 Journal/<date>.md'
                      : 'Saves as Markdown under Journal/<date>.md'}
                  </span>
                  <span className={charCount > MAX_REFLECTION * 0.9 ? 'text-warning' : ''} data-testid="reflection-char-count">
                    {charCount}/{MAX_REFLECTION}
                  </span>
                </div>
              </div>

              {lastSaved && (
                <p className="text-[12px] text-success" data-testid="reflection-saved-path">
                  ✓ {language === 'zh' ? '已保存到' : 'Saved to'} {lastSaved.filePath} ({lastSaved.byteSize}B)
                </p>
              )}
            </div>

            <footer className="mt-5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => { if (!saving) onClose(); }}
                disabled={saving}
                className="flex-1 rounded-md border border-border py-2 text-sm font-medium text-text-muted transition-colors hover:bg-surface disabled:opacity-50"
              >
                {language === 'zh' ? '取消' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={saving}
                data-testid="reflection-confirm"
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-accent py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                {language === 'zh' ? '生成日报' : 'Save report'}
              </button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Re-export the API type so consumers don't need to import from two places.
export type { DailyReportSnapshot } from '../api/client';
// Re-export the API itself to keep imports tidy when the host only needs one symbol.
export { reportsApi };
