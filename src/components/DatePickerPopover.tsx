/**
 * Date picker popover for the Today header (UX_DESIGN §1.2).
 *
 * The header date is clickable (also via ⌘D): picking a past date jumps to
 * read-only look-back; "back to today" resets the view. Future dates are
 * disabled — DailyFlow only keeps a journal for today and the past.
 */
import { useEffect, useMemo, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';

export interface DatePickerPopoverProps {
  open: boolean;
  onClose: () => void;
  /** Current selected date, `YYYY-MM-DD`. */
  currentDate: string;
  /** Latest selectable date (today), `YYYY-MM-DD`. */
  today: string;
  onSelect: (date: string) => void;
  language: 'en' | 'zh';
}

function parseUTC(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function toISO(d: Date): string {
  return d.toISOString().split('T')[0];
}

const WEEKDAYS_ZH = ['一', '二', '三', '四', '五', '六', '日'];
const WEEKDAYS_EN = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

export function DatePickerPopover({ open, onClose, currentDate, today, onSelect, language }: DatePickerPopoverProps) {
  const [monthCursor, setMonthCursor] = useState(() => currentDate.slice(0, 7));

  useEffect(() => {
    if (open) setMonthCursor(currentDate.slice(0, 7));
  }, [open, currentDate]);

  const t = (zh: string, en: string) => (language === 'zh' ? zh : en);

  const grid = useMemo(() => {
    const year = Number(monthCursor.slice(0, 4));
    const month = Number(monthCursor.slice(5, 7)); // 1-based
    const first = new Date(Date.UTC(year, month - 1, 1));
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    // Monday-first offset
    const offset = (first.getUTCDay() + 6) % 7;
    const cells: Array<{ date: string; day: number; disabled: boolean } | null> = [];
    for (let i = 0; i < offset; i += 1) cells.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = toISO(new Date(Date.UTC(year, month - 1, day)));
      cells.push({ date, day, disabled: date > today });
    }
    return { year, month, cells };
  }, [monthCursor, today]);

  if (!open) return null;

  const shiftMonth = (delta: number) => {
    const year = Number(monthCursor.slice(0, 4));
    const month = Number(monthCursor.slice(5, 7));
    const next = new Date(Date.UTC(year, month - 1 + delta, 1));
    setMonthCursor(toISO(next).slice(0, 7));
  };

  // Next month nav is blocked once the month ahead is entirely in the future.
  const nextMonthFirst = (() => {
    const year = Number(monthCursor.slice(0, 4));
    const month = Number(monthCursor.slice(5, 7));
    return toISO(new Date(Date.UTC(year, month, 1)));
  })();

  const monthLabel = new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${monthCursor}-01T00:00:00Z`));

  return (
    <div
      className="absolute left-0 top-full z-30 mt-2 w-72 rounded-xl border border-border bg-surface p-3 shadow-lg"
      data-testid="date-picker-popover"
    >
      <div className="flex items-center justify-between gap-1">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          className="rounded-md p-1 text-text-muted hover:bg-black/5 hover:text-text-heading"
          title={t('上个月', 'Previous month')}
          data-testid="date-picker-prev-month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-xs font-semibold text-text-heading">{monthLabel}</p>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          disabled={nextMonthFirst > today}
          className="rounded-md p-1 text-text-muted hover:bg-black/5 hover:text-text-heading disabled:opacity-30 disabled:hover:bg-transparent"
          title={t('下个月', 'Next month')}
          data-testid="date-picker-next-month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-2 grid grid-cols-7 gap-y-0.5 text-center text-[11px] font-medium text-text-muted">
        {(language === 'zh' ? WEEKDAYS_ZH : WEEKDAYS_EN).map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-y-0.5" data-testid="date-picker-grid">
        {grid.cells.map((cell, index) =>
          cell ? (
            <button
              key={cell.date}
              type="button"
              disabled={cell.disabled}
              onClick={() => onSelect(cell.date)}
              className={`mx-auto flex h-7 w-7 items-center justify-center rounded-md text-xs transition-colors ${
                cell.date === today
                  ? 'font-semibold text-accent'
                  : 'text-text-main'
              } ${
                cell.date === currentDate
                  ? 'bg-accent/15 font-semibold text-accent'
                  : 'hover:bg-black/5'
              } disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:cursor-not-allowed`}
              data-testid={`date-picker-day-${cell.date}`}
            >
              {cell.day}
            </button>
          ) : (
            <span key={`pad-${index}`} />
          ),
        )}
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-border/60 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-text-muted hover:bg-black/5 hover:text-text-heading"
          data-testid="date-picker-close"
        >
          <X className="h-3 w-3" />
          {t('关闭', 'Close')}
        </button>
        <button
          type="button"
          onClick={() => onSelect(today)}
          className="flex items-center gap-1 rounded-md border border-accent/20 px-2 py-1 text-[12px] font-medium text-accent hover:bg-accent/10"
          data-testid="date-picker-today"
        >
          <Calendar className="h-3 w-3" />
          {t('回到今天', 'Back to today')}
        </button>
      </div>
    </div>
  );
}
