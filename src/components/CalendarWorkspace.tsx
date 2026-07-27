import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  ListTodo,
  Loader2,
  MapPin,
  RefreshCw,
} from 'lucide-react';
import { open } from '@tauri-apps/plugin-shell';
import {
  calendarApi,
  type CalendarWorkspaceData,
  type CalendarWorkspaceItem,
} from '../api/client';
import { getTodayStr } from '../utils/tagColors';

type CalendarViewMode = 'day' | 'week' | 'month';

interface CalendarWorkspaceProps {
  date: string;
  setDate: (date: string) => void;
  language: 'en' | 'zh';
  onOpenLocalDate: (date: string) => void;
}

const DAY_MS = 86_400_000;
const START_HOUR = 6;
const END_HOUR = 23;
const HOUR_HEIGHT = 64;
const SOURCE_COLOR: Record<string, string> = {
  dailyflow: '#6b7280',
  feishu: '#2563eb',
  google: '#16a34a',
};

function utcDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function dateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  return dateString(new Date(utcDate(date).getTime() + days * DAY_MS));
}

function startOfWeek(date: string): string {
  const d = utcDate(date);
  const offset = (d.getUTCDay() + 6) % 7;
  return addDays(date, -offset);
}

function monthGridRange(date: string): { start: string; end: string } {
  const d = utcDate(date);
  const first = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
  const last = dateString(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
  return { start: startOfWeek(first), end: addDays(startOfWeek(last), 6) };
}

function viewRange(date: string, mode: CalendarViewMode): { start: string; end: string } {
  if (mode === 'day') return { start: date, end: date };
  if (mode === 'week') {
    const start = startOfWeek(date);
    return { start, end: addDays(start, 6) };
  }
  return monthGridRange(date);
}

function itemDate(item: CalendarWorkspaceItem): string {
  if (item.allDay && /^\d{4}-\d{2}-\d{2}(?:$|T)/.test(item.start)) {
    return item.start.slice(0, 10);
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(item.start));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(part => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function sourceLabel(source: string, language: 'en' | 'zh'): string {
  if (source === 'dailyflow') return 'DailyFlow';
  if (source === 'feishu') return language === 'zh' ? '飞书' : 'Feishu';
  if (source === 'google') return 'Google';
  return source;
}

function minutesInShanghai(iso: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso));
  const hour = Number(parts.find(p => p.type === 'hour')?.value || 0);
  const minute = Number(parts.find(p => p.type === 'minute')?.value || 0);
  return hour * 60 + minute;
}

function timeText(iso: string, language: 'en' | 'zh'): string {
  return new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

function eventStyle(item: CalendarWorkspaceItem): React.CSSProperties {
  const startMinutes = minutesInShanghai(item.start);
  const endMinutes = item.end ? minutesInShanghai(item.end) : startMinutes + 30;
  const visibleStart = Math.max(startMinutes, START_HOUR * 60);
  const visibleEnd = Math.min(Math.max(endMinutes, visibleStart + 20), END_HOUR * 60);
  return {
    top: ((visibleStart - START_HOUR * 60) / 60) * HOUR_HEIGHT,
    height: Math.max(24, ((visibleEnd - visibleStart) / 60) * HOUR_HEIGHT),
    borderLeftColor: SOURCE_COLOR[item.source] || '#8b5cf6',
  };
}

export function CalendarWorkspace({
  date,
  setDate,
  language,
  onOpenLocalDate,
}: CalendarWorkspaceProps) {
  const [mode, setMode] = useState<CalendarViewMode>(() => {
    try {
      const saved = localStorage.getItem('df_calendar_view');
      return saved === 'day' || saved === 'month' ? saved : 'week';
    } catch {
      return 'week';
    }
  });
  const [data, setData] = useState<CalendarWorkspaceData>({ items: [], connectors: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const range = useMemo(() => viewRange(date, mode), [date, mode]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await calendarApi.getWorkspace(range.start, range.end));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [range.start, range.end]);

  useEffect(() => {
    load();
    const refresh = () => load();
    window.addEventListener('df:feishu-synced', refresh);
    return () => window.removeEventListener('df:feishu-synced', refresh);
  }, [load]);

  const changeMode = (next: CalendarViewMode) => {
    setMode(next);
    try { localStorage.setItem('df_calendar_view', next); } catch { /* noop */ }
  };

  const move = (direction: -1 | 1) => {
    if (mode === 'day') setDate(addDays(date, direction));
    else if (mode === 'week') setDate(addDays(date, direction * 7));
    else {
      const d = utcDate(date);
      setDate(dateString(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + direction, 1))));
    }
  };

  const title = useMemo(() => {
    const locale = language === 'zh' ? 'zh-CN' : 'en-US';
    if (mode === 'day') {
      return new Intl.DateTimeFormat(locale, {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
      }).format(utcDate(date));
    }
    if (mode === 'month') {
      return new Intl.DateTimeFormat(locale, {
        year: 'numeric', month: 'long', timeZone: 'UTC',
      }).format(utcDate(date));
    }
    const start = utcDate(range.start);
    const end = utcDate(range.end);
    const startText = new Intl.DateTimeFormat(locale, {
      month: 'short', day: 'numeric', timeZone: 'UTC',
    }).format(start);
    const endText = new Intl.DateTimeFormat(locale, {
      month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
    }).format(end);
    return `${startText} – ${endText}`;
  }, [date, language, mode, range.end, range.start]);

  const openItem = async (item: CalendarWorkspaceItem) => {
    if (item.url) {
      try { await open(item.url); } catch { window.open(item.url, '_blank', 'noopener,noreferrer'); }
      return;
    }
    if (item.localDate) onOpenLocalDate(item.localDate);
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.25, 0.1, 0.25, 1] }}
      className="flex h-full min-h-0 flex-col bg-background/30"
    >
      <header className="shrink-0 border-b border-border/70 bg-surface/70 px-4 py-3 backdrop-blur-xl md:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-lg border border-border/70 bg-background/60 p-0.5">
            <button
              onClick={() => move(-1)}
              aria-label={language === 'zh' ? '上一时间段' : 'Previous period'}
              title={language === 'zh' ? '上一时间段' : 'Previous period'}
              className="rounded-md p-1.5 text-text-muted hover:bg-black/5 hover:text-text-heading"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => move(1)}
              aria-label={language === 'zh' ? '下一时间段' : 'Next period'}
              title={language === 'zh' ? '下一时间段' : 'Next period'}
              className="rounded-md p-1.5 text-text-muted hover:bg-black/5 hover:text-text-heading"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <button
            onClick={() => setDate(getTodayStr())}
            className="rounded-lg border border-border/70 bg-surface px-3 py-1.5 text-xs font-semibold text-text-main hover:border-border"
          >
            {language === 'zh' ? '今天' : 'Today'}
          </button>
          <h1 className="order-first basis-full truncate text-center text-base font-semibold tracking-tight text-text-heading sm:order-none sm:min-w-0 sm:flex-1 sm:basis-auto sm:text-left sm:text-lg md:text-xl">
            {title}
          </h1>
          <div
            className="flex rounded-lg border border-border/70 bg-background/60 p-0.5"
            role="tablist"
            aria-label={language === 'zh' ? '日历视图' : 'Calendar view'}
          >
            {(['day', 'week', 'month'] as const).map(view => (
              <button
                key={view}
                onClick={() => changeMode(view)}
                role="tab"
                aria-selected={mode === view}
                className={`rounded-md px-3 py-1.5 text-[11px] font-semibold transition ${
                  mode === view ? 'bg-surface text-text-heading shadow-sm' : 'text-text-muted hover:text-text-main'
                }`}
              >
                {view === 'day'
                  ? (language === 'zh' ? '日' : 'Day')
                  : view === 'week'
                    ? (language === 'zh' ? '周' : 'Week')
                    : (language === 'zh' ? '月' : 'Month')}
              </button>
            ))}
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="rounded-lg p-2 text-text-muted hover:bg-black/5 hover:text-text-heading disabled:opacity-40"
            title={language === 'zh' ? '刷新' : 'Refresh'}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-text-muted">
          <Legend color={SOURCE_COLOR.dailyflow} label="DailyFlow" active />
          {data.connectors.map(connector => (
            <Legend
              key={connector.id}
              color={connector.color}
              label={connector.displayName}
              active={connector.connected}
              warning={Boolean(connector.error)}
            />
          ))}
          <span className="ml-auto">
            {language === 'zh' ? '时区：亚洲/上海' : 'Timezone: Asia/Shanghai'}
          </span>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        {error ? (
          <StateMessage icon={<CalendarDays className="h-6 w-6" />} title={error} error />
        ) : loading && data.items.length === 0 ? (
          <StateMessage icon={<Loader2 className="h-6 w-6 animate-spin" />} title={language === 'zh' ? '正在加载日历…' : 'Loading calendar…'} />
        ) : mode === 'month' ? (
          <MonthView date={date} range={range} items={data.items} language={language} onOpen={openItem} setDate={setDate} />
        ) : (
          <TimeGrid
            dates={mode === 'day' ? [date] : Array.from({ length: 7 }, (_, i) => addDays(range.start, i))}
            items={data.items}
            language={language}
            onOpen={openItem}
          />
        )}
      </div>
    </motion.section>
  );
}

function Legend({ color, label, active, warning = false }: { color: string; label: string; active: boolean; warning?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${active ? 'text-text-main' : 'opacity-45'}`} title={warning ? 'Sync error' : undefined}>
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: warning ? '#dc2626' : color }} />
      {label}
      {!active && <span>· off</span>}
    </span>
  );
}

function StateMessage({ icon, title, error = false }: { icon: React.ReactNode; title: string; error?: boolean }) {
  return (
    <div
      className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 p-8 text-center text-text-muted"
      role={error ? 'alert' : 'status'}
      aria-live={error ? 'assertive' : 'polite'}
    >
      <div className="rounded-xl border border-border bg-surface p-3">{icon}</div>
      <p className="max-w-md text-sm">{title}</p>
    </div>
  );
}

function TimeGrid({
  dates,
  items,
  language,
  onOpen,
}: {
  dates: string[];
  items: CalendarWorkspaceItem[];
  language: 'en' | 'zh';
  onOpen: (item: CalendarWorkspaceItem) => void;
}) {
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
  const today = getTodayStr();
  const locale = language === 'zh' ? 'zh-CN' : 'en-US';
  return (
    <div className="min-w-[720px]">
      <div className="sticky top-0 z-20 grid border-b border-border bg-surface/95 backdrop-blur-xl" style={{ gridTemplateColumns: `64px repeat(${dates.length}, minmax(120px, 1fr))` }}>
        <div className="border-r border-border/70" />
        {dates.map(day => (
          <div key={day} className={`border-r border-border/70 px-2 py-2 text-center ${day === today ? 'bg-blue-50/60' : ''}`}>
            <div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
              {new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(utcDate(day))}
            </div>
            <div className={`mt-0.5 text-sm font-semibold ${day === today ? 'text-blue-700' : 'text-text-heading'}`}>
              {new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(utcDate(day))}
            </div>
          </div>
        ))}
        <div className="border-r border-t border-border/70 px-2 py-2 text-[10px] text-text-muted">
          {language === 'zh' ? '全天' : 'All day'}
        </div>
        {dates.map(day => {
          const allDay = items.filter(item => item.allDay && itemDate(item) === day);
          return (
            <div key={`all-${day}`} className="min-h-10 border-r border-t border-border/70 p-1.5">
              <div className="flex flex-col gap-1">
                {allDay.slice(0, 4).map(item => (
                  <CalendarPill key={item.id} item={item} language={language} onOpen={onOpen} compact />
                ))}
                {allDay.length > 4 && <span className="px-1 text-[10px] text-text-muted">+{allDay.length - 4}</span>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="grid" style={{ gridTemplateColumns: `64px repeat(${dates.length}, minmax(120px, 1fr))` }}>
        <div className="relative border-r border-border/70" style={{ height: hours.length * HOUR_HEIGHT }}>
          {hours.map((hour, index) => (
            <div key={hour} className="absolute w-full -translate-y-1/2 pr-2 text-right text-[10px] text-text-muted" style={{ top: index * HOUR_HEIGHT }}>
              {String(hour).padStart(2, '0')}:00
            </div>
          ))}
        </div>
        {dates.map(day => {
          const timed = items.filter(item => !item.allDay && itemDate(item) === day);
          return (
            <div
              key={day}
              className={`relative border-r border-border/70 ${day === today ? 'bg-blue-50/20' : ''}`}
              style={{
                height: hours.length * HOUR_HEIGHT,
                backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0, transparent 63px, var(--color-border) 64px)',
              }}
            >
              {timed.map(item => (
                <button
                  key={item.id}
                  onClick={() => onOpen(item)}
                  className="absolute left-1 right-1 overflow-hidden rounded-md border border-border/70 border-l-[3px] bg-surface/95 px-2 py-1 text-left shadow-sm transition hover:z-10 hover:border-border hover:shadow-md"
                  style={eventStyle(item)}
                  title={item.title}
                >
                  <div className="truncate text-[11px] font-semibold text-text-heading">{item.title}</div>
                  <div className="mt-0.5 flex items-center gap-1 truncate text-[9px] text-text-muted">
                    <Clock3 className="h-2.5 w-2.5 shrink-0" />
                    {timeText(item.start, language)}
                    {item.location && <><MapPin className="ml-1 h-2.5 w-2.5 shrink-0" />{item.location}</>}
                  </div>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MonthView({
  date,
  range,
  items,
  language,
  onOpen,
  setDate,
}: {
  date: string;
  range: { start: string; end: string };
  items: CalendarWorkspaceItem[];
  language: 'en' | 'zh';
  onOpen: (item: CalendarWorkspaceItem) => void;
  setDate: (date: string) => void;
}) {
  const days = Array.from({ length: Math.round((utcDate(range.end).getTime() - utcDate(range.start).getTime()) / DAY_MS) + 1 }, (_, i) => addDays(range.start, i));
  const locale = language === 'zh' ? 'zh-CN' : 'en-US';
  const month = utcDate(date).getUTCMonth();
  return (
    <div className="min-w-[720px]">
      <div className="grid grid-cols-7 border-b border-border bg-surface/80">
        {Array.from({ length: 7 }, (_, i) => addDays(startOfWeek('2026-07-27'), i)).map(day => (
          <div key={day} className="border-r border-border/70 px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-text-muted">
            {new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(utcDate(day))}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map(day => {
          const dayItems = items.filter(item => itemDate(item) === day);
          const isCurrentMonth = utcDate(day).getUTCMonth() === month;
          const isToday = day === getTodayStr();
          return (
            <div key={day} className={`min-h-[128px] border-b border-r border-border/70 p-1.5 ${isCurrentMonth ? 'bg-background/20' : 'bg-black/[0.018]'}`}>
              <button
                onClick={() => setDate(day)}
                className={`mb-1 flex h-6 min-w-6 items-center justify-center rounded-md px-1 text-[11px] font-semibold ${
                  isToday ? 'bg-blue-600 text-white' : isCurrentMonth ? 'text-text-heading hover:bg-black/5' : 'text-text-muted/50'
                }`}
              >
                {utcDate(day).getUTCDate()}
              </button>
              <div className="flex flex-col gap-1">
                {dayItems.slice(0, 4).map(item => (
                  <CalendarPill key={item.id} item={item} language={language} onOpen={onOpen} compact />
                ))}
                {dayItems.length > 4 && (
                  <button onClick={() => setDate(day)} className="px-1 text-left text-[10px] font-medium text-text-muted hover:text-text-main">
                    +{dayItems.length - 4} {language === 'zh' ? '项' : 'more'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CalendarPill({
  item,
  language,
  onOpen,
  compact,
}: {
  item: CalendarWorkspaceItem;
  language: 'en' | 'zh';
  onOpen: (item: CalendarWorkspaceItem) => void;
  compact?: boolean;
}) {
  const color = SOURCE_COLOR[item.source] || '#8b5cf6';
  return (
    <button
      onClick={() => onOpen(item)}
      className={`group flex w-full items-center gap-1.5 overflow-hidden rounded px-1.5 py-1 text-left text-[10px] transition hover:brightness-95 ${
        item.status === 'done' ? 'opacity-50' : ''
      }`}
      style={{ backgroundColor: `${color}16`, color }}
      title={[
        item.title,
        item.delayed ? (language === 'zh' ? 'Delay（延期）' : 'Delayed') : '',
        item.originalDate
          ? `${language === 'zh' ? '原日期' : 'Original date'}: ${item.originalDate}`
          : '',
        sourceLabel(item.source, language),
      ].filter(Boolean).join(' · ')}
    >
      {item.kind === 'task' ? <ListTodo className="h-3 w-3 shrink-0" /> : <CalendarDays className="h-3 w-3 shrink-0" />}
      {!item.allDay && !compact && <span className="shrink-0">{timeText(item.start, language)}</span>}
      {item.delayed && (
        <span className="shrink-0 rounded bg-amber-100 px-1 py-0.5 text-[8px] font-bold uppercase leading-none text-amber-700">
          Delay
        </span>
      )}
      <span className={`truncate font-medium ${item.status === 'done' ? 'line-through' : ''}`}>{item.title}</span>
      {item.url && <ExternalLink className="ml-auto h-2.5 w-2.5 shrink-0 opacity-0 group-hover:opacity-70" />}
    </button>
  );
}
