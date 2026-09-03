import { useEffect, useRef } from 'react';

export interface ScheduleDateCopy {
  pickDate: string;
  today: string;
  tomorrow: string;
  in3Days: string;
  nextWeek: string;
  confirm: string;
}

interface ScheduleDatePopoverProps {
  copy: ScheduleDateCopy;
  date: string;
  onChange: (date: string) => void;
  /** Receives the picked date — presets call it immediately (one click schedules). */
  onConfirm: (date: string) => void | Promise<void>;
  onCancel: () => void;
  onClickAway: () => void;
  today: string;
  shiftDate: (base: string, days: number) => string;
  testId?: string;
  /** 'down' opens below the trigger (default); 'up' opens above — used by the
      bottom toolbar so the popover doesn't render off-screen. */
  placement?: 'down' | 'up';
}

/**
 * Date-picker menu used by the EventCanvas toolbar and the EventOutline row.
 * One-click presets (label + the actual date it resolves to) schedule
 * immediately; a native date input covers arbitrary dates behind 确认.
 */
export function ScheduleDatePopover({
  copy,
  date,
  onChange,
  onConfirm,
  onCancel,
  onClickAway,
  today,
  shiftDate,
  testId = 'event-schedule-popover',
  placement = 'down',
}: ScheduleDatePopoverProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) onClickAway();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    const id = window.setTimeout(() => {
      document.addEventListener('mousedown', onDoc);
      document.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClickAway, onCancel]);

  const presets: Array<{ label: string; days: number }> = [
    { label: copy.today, days: 0 },
    { label: copy.tomorrow, days: 1 },
    { label: copy.in3Days, days: 3 },
    { label: copy.nextWeek, days: 7 },
  ];

  return (
    <div
      ref={ref}
      className={`absolute right-0 z-40 w-60 rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg dark:border-gray-700 dark:bg-gray-900 ${placement === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'}`}
      onClick={(e) => e.stopPropagation()}
      data-testid={testId}
    >
      {presets.map((p) => {
        const value = shiftDate(today, p.days);
        const active = value === date;
        return (
          <button
            key={p.label}
            type="button"
            onClick={() => void onConfirm(value)}
            className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[13px] ${active ? 'bg-accent/10 text-accent' : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800'}`}
            data-testid={`${testId}-preset-${p.days}`}
          >
            <span className="font-medium">{p.label}</span>
            <span className={`text-xs tabular-nums ${active ? 'text-accent' : 'text-gray-400'}`}>
              {value.slice(5)}
            </span>
          </button>
        );
      })}
      <div className="mt-1 flex items-center gap-1.5 border-t border-gray-100 px-1.5 pb-0.5 pt-2 dark:border-gray-800">
        <input
          type="date"
          value={date}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-transparent px-2 py-1.5 text-xs dark:border-gray-700"
          aria-label={copy.pickDate}
          data-testid={`${testId}-date-input`}
        />
        <button
          type="button"
          onClick={() => void onConfirm(date)}
          className="shrink-0 rounded-lg bg-accent px-2.5 py-1.5 text-xs font-semibold text-white hover:opacity-90"
          data-testid={`${testId}-confirm`}
          aria-label={copy.pickDate}
        >
          {copy.confirm}
        </button>
      </div>
    </div>
  );
}
