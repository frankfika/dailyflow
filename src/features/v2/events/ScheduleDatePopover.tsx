import { useEffect, useRef } from 'react';

export interface ScheduleDateCopy {
  pickDate: string;
  today: string;
  tomorrow: string;
  nextWeek: string;
  cancel: string;
  confirm: string;
}

interface ScheduleDatePopoverProps {
  copy: ScheduleDateCopy;
  date: string;
  onChange: (date: string) => void;
  onConfirm: () => void | Promise<void>;
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
 * Small date-picker popover used by both the EventCanvas node button and the
 * EventOutline row. Defaults to today; offers Today / Tomorrow / +3d / Next
 * week presets plus a native date picker for arbitrary dates.
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
    const id = window.setTimeout(() => document.addEventListener('mousedown', onDoc), 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('mousedown', onDoc);
    };
  }, [onClickAway]);

  const presets: Array<{ label: string; days: number }> = [
    { label: copy.today, days: 0 },
    { label: copy.tomorrow, days: 1 },
    { label: '+3d', days: 3 },
    { label: copy.nextWeek, days: 7 },
  ];

  return (
    <div
      ref={ref}
      className={`absolute right-0 z-40 w-56 rounded-xl border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-900 ${placement === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'}`}
      onClick={(e) => e.stopPropagation()}
      data-testid={testId}
    >
      <div className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        {copy.pickDate}
      </div>
      <div className="mb-2 grid grid-cols-4 gap-1">
        {presets.map((p) => {
          const value = shiftDate(today, p.days);
          const active = value === date;
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => onChange(value)}
              className={`rounded-md border px-1 py-1 text-[11px] font-medium ${active ? 'border-accent bg-accent/10 text-accent' : 'border-gray-200 text-gray-600 hover:border-accent/40 hover:text-accent dark:border-gray-700'}`}
              data-testid={`${testId}-preset-${p.days}`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <input
        type="date"
        value={date}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-200 bg-transparent px-2 py-1.5 text-xs dark:border-gray-700"
        aria-label={copy.pickDate}
        data-testid={`${testId}-date-input`}
      />
      <div className="mt-2 flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-2 py-1 text-[12px] text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
          data-testid={`${testId}-cancel`}
        >
          {copy.cancel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-md bg-accent px-2.5 py-1 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-40"
          data-testid={`${testId}-confirm`}
        >
          {copy.confirm}
        </button>
      </div>
    </div>
  );
}