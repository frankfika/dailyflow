import { Check, X } from 'lucide-react';

/**
 * Quiet reflection prompt bar (UX S12).
 *
 * Replaces the auto-opened DailyReflectionModal after a day rolls over:
 * a one-line bar on Today offers to write the reflection, defer it, or
 * stop prompting entirely. The modal itself still opens via ⌘J / ⌘K or
 * the bar's "写复盘" action.
 */

const OPT_OUT_KEY = 'dailyflow:reflection:promptOptOut';

export function isReflectionPromptOptedOut(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(OPT_OUT_KEY) === '1';
  } catch {
    return false;
  }
}

export interface TodayReflectionBarProps {
  date: string;
  completedCount: number;
  language: 'en' | 'zh';
  onWrite: () => void;
  onDismiss: () => void;
  onOptOut: () => void;
}

export function TodayReflectionBar({ date, completedCount, language, onWrite, onDismiss, onOptOut }: TodayReflectionBarProps) {
  const zh = language === 'zh';
  return (
    <div
      className="flex items-center gap-3 rounded-xl border border-border/80 bg-surface-elevated px-4 py-2.5 text-sm shadow-[0_1px_2px_rgba(20,45,38,0.03)]"
      data-testid="today-reflection-bar"
      data-date={date}
    >
      <Check className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-text-main">
        {zh
          ? `昨天完成 ${completedCount} 件事${completedCount > 0 ? ' 🎉' : ''}，写个复盘吗？`
          : `You finished ${completedCount} thing${completedCount === 1 ? '' : 's'} yesterday${completedCount > 0 ? ' 🎉' : ''} — write a reflection?`}
      </span>
      <button
        type="button"
        onClick={onWrite}
        className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-all hover:opacity-90 active:scale-[0.98]"
        data-testid="today-reflection-write"
      >
        {zh ? '写复盘' : 'Write'}
      </button>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs text-text-muted transition-colors hover:bg-black/[0.04]"
        data-testid="today-reflection-later"
      >
        {zh ? '明天再说' : 'Later'}
      </button>
      <button
        type="button"
        onClick={onOptOut}
        className="shrink-0 rounded-lg p-1.5 text-text-muted transition-colors hover:bg-black/[0.04]"
        aria-label={zh ? '不再提醒' : 'Never remind me'}
        title={zh ? '不再提醒' : 'Never remind me'}
        data-testid="today-reflection-optout"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
