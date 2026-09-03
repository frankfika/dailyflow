import { useEffect, useRef, useState } from 'react';
import type { RecurrenceRule } from '../../../api/client';

export interface ScheduleExtrasDraft {
  deadline: string; // '' = none
  tags: string; // free text, parsed by the caller
  priority: '' | 'high' | 'medium' | 'low';
  recurrence: '' | 'daily' | 'weekly' | 'monthly';
}

export const EMPTY_EXTRAS: ScheduleExtrasDraft = { deadline: '', tags: '', priority: '', recurrence: '' };

export function hasExtras(ex: ScheduleExtrasDraft): boolean {
  return Boolean(ex.deadline || ex.tags.trim() || ex.priority || ex.recurrence);
}

export type ScheduleExtras = {
  deadline?: string;
  priority?: 'high' | 'medium' | 'low';
  tags?: string[];
  recurrence?: RecurrenceRule;
};

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
  /** Receives the picked date (and the extras draft in create mode) — presets
      call it immediately, so one click schedules. */
  onConfirm: (date: string, extras: ScheduleExtrasDraft) => void | Promise<void>;
  onCancel: () => void;
  onClickAway: () => void;
  today: string;
  shiftDate: (base: string, days: number) => string;
  testId?: string;
  /** 'down' opens below the trigger (default); 'up' opens above — used by the
      bottom toolbar so the popover doesn't render off-screen. */
  placement?: 'down' | 'up';
  /** Bilingual labels for the extra task fields (create mode). */
  language?: 'en' | 'zh';
  /** Create mode: also offer deadline / tags / priority / recurrence. */
  showExtras?: boolean;
}

/**
 * Date-picker menu used by the EventCanvas toolbar and the EventOutline row.
 * One-click presets (label + the actual date it resolves to) schedule
 * immediately; create mode adds deadline / tags / priority / recurrence so a
 * node can be turned into a task as richly as from the Today composer.
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
  language = 'en',
  showExtras = false,
}: ScheduleDatePopoverProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [deadline, setDeadline] = useState('');
  const [tags, setTags] = useState('');
  const [priority, setPriority] = useState<ScheduleExtrasDraft['priority']>('');
  const [recurrence, setRecurrence] = useState<ScheduleExtrasDraft['recurrence']>('');
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
  const confirmWith = (d: string) => {
    const extras: ScheduleExtrasDraft = showExtras
      ? { deadline, tags, priority, recurrence }
      : EMPTY_EXTRAS;
    return onConfirm(d, extras);
  };
  const t = (zh: string, en: string) => (language === 'zh' ? zh : en);
  const chip = (active: boolean) =>
    `rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${active ? 'border-accent bg-accent/10 text-accent' : 'border-gray-200 text-gray-500 hover:border-accent/40 hover:text-accent dark:border-gray-700'}`;

  return (
    <div
      ref={ref}
      className={`absolute right-0 z-40 w-64 rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg dark:border-gray-700 dark:bg-gray-900 ${placement === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'} ${showExtras ? 'max-h-[min(26rem,80vh)] overflow-y-auto' : ''}`}
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
            onClick={() => void confirmWith(value)}
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

      {showExtras && (
        <div className="mt-1 space-y-2 border-t border-gray-100 px-1.5 pb-1 pt-2 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <span className="w-12 shrink-0 text-[11px] text-gray-400">{t('截止', 'Deadline')}</span>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-gray-200 px-1.5 py-1 text-xs outline-none focus:border-accent dark:border-gray-700"
              data-testid={`${testId}-deadline-input`}
            />
            {deadline && (
              <button
                type="button"
                onClick={() => setDeadline('')}
                className="shrink-0 text-gray-400 hover:text-gray-600"
                aria-label={t('清除截止', 'Clear deadline')}
              >✕</button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="w-12 shrink-0 text-[11px] text-gray-400">{t('标签', 'Tags')}</span>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder={t('空格分隔，如 #紧急 #客户A', 'space separated, e.g. #urgent #clientA')}
              className="min-w-0 flex-1 rounded-md border border-gray-200 px-1.5 py-1 text-xs outline-none focus:border-accent dark:border-gray-700"
              data-testid={`${testId}-tags-input`}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-12 shrink-0 text-[11px] text-gray-400">{t('优先级', 'Priority')}</span>
            <div className="flex flex-wrap items-center gap-1">
              {([['high', t('高', 'High')], ['medium', t('中', 'Medium')], ['low', t('低', 'Low')]] as const).map(([v, label]) => (
                <button key={v} type="button" onClick={() => setPriority(priority === v ? '' : v)} className={chip(priority === v)} data-testid={`${testId}-prio-${v}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-12 shrink-0 text-[11px] text-gray-400">{t('重复', 'Repeat')}</span>
            <div className="flex flex-wrap items-center gap-1">
              {([['daily', t('每天', 'Daily')], ['weekly', t('每周', 'Weekly')], ['monthly', t('每月', 'Monthly')]] as const).map(([v, label]) => (
                <button key={v} type="button" onClick={() => setRecurrence(recurrence === v ? '' : v)} className={chip(recurrence === v)} data-testid={`${testId}-rec-${v}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

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
          onClick={() => void confirmWith(date)}
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
