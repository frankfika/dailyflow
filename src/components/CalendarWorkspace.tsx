import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  CalendarDays,
  CalendarPlus,
  CircleAlert,
  CircleCheck,
  CloudUpload,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  Layers3,
  ListTodo,
  Loader2,
  MapPin,
  Plus,
  Plug,
  RefreshCw,
  X,
} from 'lucide-react';
import { open } from '@tauri-apps/plugin-shell';
import {
  calendarApi,
  dispatchDomainEvent,
  DOMAIN_EVENTS,
  feishuApi,
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
  onManageConnections: () => void;
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
const SOURCE_SURFACE: Record<string, string> = {
  dailyflow: '#f4f4f5',
  feishu: '#eff6ff',
  google: '#f0fdf4',
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

function defaultEventSlot(selectedDate: string): { date: string; start: string; end: string } {
  const today = getTodayStr();
  if (selectedDate > today) return { date: selectedDate, start: '09:00', end: '09:30' };
  if (selectedDate < today) return { date: today, start: '09:00', end: '09:30' };

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const hour = Number(parts.find(part => part.type === 'hour')?.value || 0);
  const minute = Number(parts.find(part => part.type === 'minute')?.value || 0);
  const roundedMinutes = Math.ceil((hour * 60 + minute + 5) / 30) * 30;
  if (roundedMinutes >= 23 * 60 + 30) {
    return { date: addDays(today, 1), start: '09:00', end: '09:30' };
  }
  const time = (value: number) =>
    `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
  return { date: today, start: time(roundedMinutes), end: time(roundedMinutes + 30) };
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

function eventBounds(item: CalendarWorkspaceItem): { start: number; end: number } {
  const startMinutes = minutesInShanghai(item.start);
  let endMinutes = item.end ? minutesInShanghai(item.end) : startMinutes + 30;
  if (endMinutes <= startMinutes) endMinutes = startMinutes + 30;
  return { start: startMinutes, end: endMinutes };
}

type PositionedEvent = {
  item: CalendarWorkspaceItem;
  column: number;
  columns: number;
};

function positionOverlappingEvents(items: CalendarWorkspaceItem[]): PositionedEvent[] {
  const sorted = [...items].sort((a, b) => {
    const aBounds = eventBounds(a);
    const bBounds = eventBounds(b);
    return aBounds.start - bBounds.start || aBounds.end - bBounds.end;
  });
  const positioned: PositionedEvent[] = [];
  let cluster: Array<{ item: CalendarWorkspaceItem; start: number; end: number; column: number }> = [];
  let clusterEnd = -1;

  const flush = () => {
    if (cluster.length === 0) return;
    const columns = Math.max(...cluster.map(event => event.column)) + 1;
    positioned.push(...cluster.map(event => ({
      item: event.item,
      column: event.column,
      columns,
    })));
    cluster = [];
    clusterEnd = -1;
  };

  for (const item of sorted) {
    const bounds = eventBounds(item);
    if (cluster.length > 0 && bounds.start >= clusterEnd) flush();
    const columnEnds: number[] = [];
    for (const event of cluster) {
      columnEnds[event.column] = Math.max(columnEnds[event.column] || 0, event.end);
    }
    let column = columnEnds.findIndex(end => end <= bounds.start);
    if (column === -1) column = columnEnds.length;
    cluster.push({ item, ...bounds, column });
    clusterEnd = Math.max(clusterEnd, bounds.end);
  }
  flush();
  return positioned;
}

function eventStyle(
  item: CalendarWorkspaceItem,
  column = 0,
  columns = 1,
): React.CSSProperties {
  const { start: startMinutes, end: endMinutes } = eventBounds(item);
  const visibleStart = Math.max(startMinutes, START_HOUR * 60);
  const visibleEnd = Math.min(Math.max(endMinutes, visibleStart + 20), END_HOUR * 60);
  const gap = 4;
  return {
    top: ((visibleStart - START_HOUR * 60) / 60) * HOUR_HEIGHT,
    height: Math.max(24, ((visibleEnd - visibleStart) / 60) * HOUR_HEIGHT),
    left: `calc(${(column / columns) * 100}% + ${gap}px)`,
    width: `calc(${100 / columns}% - ${gap * 2}px)`,
    borderLeftColor: SOURCE_COLOR[item.source] || '#8b5cf6',
    backgroundColor: SOURCE_SURFACE[item.source] || '#f5f3ff',
  };
}

export function CalendarWorkspace({
  date,
  setDate,
  language,
  onOpenLocalDate,
  onManageConnections,
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
  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const [syncingTaskIds, setSyncingTaskIds] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
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
    window.addEventListener(DOMAIN_EVENTS.calendarConnectionChanged, refresh);
    window.addEventListener(DOMAIN_EVENTS.calendarEventsChanged, refresh);
    return () => {
      window.removeEventListener(DOMAIN_EVENTS.calendarConnectionChanged, refresh);
      window.removeEventListener(DOMAIN_EVENTS.calendarEventsChanged, refresh);
    };
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
  const feishuConnector = data.connectors.find(connector => connector.id === 'feishu');

  const openItem = async (item: CalendarWorkspaceItem) => {
    if (item.url) {
      try { await open(item.url); } catch { window.open(item.url, '_blank', 'noopener,noreferrer'); }
      return;
    }
    if (item.localDate) onOpenLocalDate(item.localDate);
  };

  const syncTaskToFeishu = async (item: CalendarWorkspaceItem) => {
    if (!item.localTaskId) return;
    const taskId = item.localTaskId;
    setSyncingTaskIds(current => new Set(current).add(taskId));
    setNotice(null);
    try {
      const result = await feishuApi.syncTasks([taskId]);
      if (result.errors.length) throw new Error(result.errors.join('；'));
      const action = result.pushed
        ? (language === 'zh' ? '已创建到飞书任务' : 'Created in Feishu Tasks')
        : result.updatedRemote
          ? (language === 'zh' ? '已更新飞书任务' : 'Updated in Feishu Tasks')
          : result.linked
            ? (language === 'zh' ? '已关联已有飞书任务' : 'Linked to an existing Feishu task')
            : (language === 'zh' ? '任务已是最新状态' : 'Task is already up to date');
      setNotice({ kind: 'success', text: `${item.title} · ${action}` });
      dispatchDomainEvent(DOMAIN_EVENTS.calendarEventsChanged, {
        provider: 'feishu',
        reason: 'task-sync',
        taskId,
      });
    } catch (e: any) {
      setNotice({ kind: 'error', text: e.message || String(e) });
    } finally {
      setSyncingTaskIds(current => {
        const next = new Set(current);
        next.delete(taskId);
        return next;
      });
    }
  };

  const requestCreateEvent = () => {
    if (!feishuConnector?.connected) {
      onManageConnections();
      return;
    }
    setShowCreateEvent(true);
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.25, 0.1, 0.25, 1] }}
      className="flex h-full min-h-0 flex-col bg-background/30"
    >
      <header className="shrink-0 border-b border-border/70 bg-surface/85 px-4 py-3 backdrop-blur-2xl md:px-6">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center rounded-lg border border-border/70 bg-background/50 p-0.5">
            <button
              onClick={() => move(-1)}
              aria-label={language === 'zh' ? '上一时间段' : 'Previous period'}
              title={language === 'zh' ? '上一时间段' : 'Previous period'}
              className="rounded-md p-1.5 text-text-muted transition hover:bg-surface hover:text-text-heading"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => move(1)}
              aria-label={language === 'zh' ? '下一时间段' : 'Next period'}
              title={language === 'zh' ? '下一时间段' : 'Next period'}
              className="rounded-md p-1.5 text-text-muted transition hover:bg-surface hover:text-text-heading"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <button
            onClick={() => setDate(getTodayStr())}
            className="rounded-lg border border-border/70 bg-surface px-3 py-1.5 text-[11px] font-semibold text-text-main transition hover:border-border-strong"
          >
            {language === 'zh' ? '今天' : 'Today'}
          </button>
          <h1 className="order-first basis-full truncate text-center text-lg font-semibold tracking-[-0.02em] text-text-heading sm:order-none sm:min-w-0 sm:flex-1 sm:basis-auto sm:text-left md:text-xl">
            {title}
          </h1>
          <button
            type="button"
            onClick={requestCreateEvent}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-blue-700"
            title={language === 'zh' ? '创建到飞书日历' : 'Create in Feishu Calendar'}
          >
            <Plus className="h-3.5 w-3.5" />
            {language === 'zh' ? '新建日程' : 'New event'}
          </button>
          <div
            className="flex rounded-lg border border-border/70 bg-background/50 p-0.5"
            role="tablist"
            aria-label={language === 'zh' ? '日历视图' : 'Calendar view'}
          >
            {(['day', 'week', 'month'] as const).map(view => (
              <button
                key={view}
                onClick={() => changeMode(view)}
                role="tab"
                aria-selected={mode === view}
                className={`min-w-12 rounded-md px-3 py-1.5 text-[11px] font-semibold transition ${
                  mode === view ? 'bg-surface text-text-heading shadow-sm ring-1 ring-border/60' : 'text-text-muted hover:text-text-main'
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
            className="rounded-lg p-2 text-text-muted transition hover:bg-background hover:text-text-heading disabled:opacity-40"
            title={language === 'zh' ? '刷新' : 'Refresh'}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[10px] text-text-muted">
          <Legend color={SOURCE_COLOR.dailyflow} label="DailyFlow" active />
          {data.connectors
            .filter(connector => connector.id !== 'feishu')
            .map(connector => (
              <Legend
                key={connector.id}
                color={connector.color}
                label={connector.displayName}
                active={connector.connected}
                warning={Boolean(connector.error)}
              />
            ))}
          {feishuConnector && (
            <button
              type="button"
              onClick={onManageConnections}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 font-medium transition ${
                feishuConnector.error
                  ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                  : feishuConnector.connected
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    : 'border-border bg-background text-text-muted hover:border-blue-200 hover:text-blue-700'
              }`}
              data-testid="feishu-connection-status"
              title={feishuConnector.error || feishuConnector.reason}
            >
              {feishuConnector.error
                ? <CircleAlert className="h-3 w-3" />
                : feishuConnector.connected
                  ? <CircleCheck className="h-3 w-3" />
                  : <Plug className="h-3 w-3" />}
              <span>
                {feishuConnector.connected
                  ? (language === 'zh'
                      ? `飞书已连接${feishuConnector.accountLabel ? ` · ${feishuConnector.accountLabel}` : ''}`
                      : `Feishu connected${feishuConnector.accountLabel ? ` · ${feishuConnector.accountLabel}` : ''}`)
                  : (language === 'zh' ? '连接飞书' : 'Connect Feishu')}
              </span>
            </button>
          )}
          <span className="ml-auto hidden sm:inline">
            {language === 'zh' ? '时区：亚洲/上海' : 'Timezone: Asia/Shanghai'}
          </span>
        </div>
      </header>

      {!loading && feishuConnector?.error && (
        <div className="flex shrink-0 items-center gap-2 border-b border-red-100 bg-red-50/70 px-4 py-2 text-[11px] text-red-700 md:px-6">
          <CircleAlert className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{feishuConnector.error}</span>
          <button onClick={load} className="font-semibold hover:underline">
            {language === 'zh' ? '重试' : 'Retry'}
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto overscroll-contain" data-testid="calendar-scroll-region">
        {error ? (
          <StateMessage icon={<CalendarDays className="h-6 w-6" />} title={error} error />
        ) : loading && data.items.length === 0 ? (
          <StateMessage icon={<Loader2 className="h-6 w-6 animate-spin" />} title={language === 'zh' ? '正在加载日历…' : 'Loading calendar…'} />
        ) : mode === 'month' ? (
          <MonthView
            date={date}
            range={range}
            items={data.items}
            language={language}
            onOpen={openItem}
            onOpenDay={(day) => {
              setDate(day);
              changeMode('day');
            }}
          />
        ) : mode === 'day' ? (
          <DayView
            date={date}
            items={data.items}
            language={language}
            onOpen={openItem}
            onSyncTask={syncTaskToFeishu}
            syncingTaskIds={syncingTaskIds}
          />
        ) : (
          <WeekGrid
            dates={Array.from({ length: 7 }, (_, i) => addDays(range.start, i))}
            items={data.items}
            language={language}
            onOpen={openItem}
          />
        )}
      </div>
      {showCreateEvent && (
        <CreateEventDialog
          selectedDate={date}
          language={language}
          onClose={() => setShowCreateEvent(false)}
          onCreated={async (title) => {
            setShowCreateEvent(false);
            setNotice({
              kind: 'success',
              text: language === 'zh' ? `${title} · 已创建到飞书日历` : `${title} · Created in Feishu Calendar`,
            });
            dispatchDomainEvent(DOMAIN_EVENTS.calendarEventsChanged, {
              provider: 'feishu',
              reason: 'event-created',
            });
            await load();
          }}
        />
      )}
      {notice && (
        <div
          className={`fixed bottom-5 right-5 z-[70] flex max-w-sm items-start gap-2 rounded-xl border px-3.5 py-3 text-xs shadow-xl backdrop-blur-xl ${
            notice.kind === 'success'
              ? 'border-emerald-200 bg-emerald-50/95 text-emerald-800'
              : 'border-red-200 bg-red-50/95 text-red-800'
          }`}
          role="status"
        >
          {notice.kind === 'success'
            ? <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" />
            : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />}
          <span className="min-w-0 flex-1">{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} className="rounded p-0.5 hover:bg-black/5">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </motion.section>
  );
}

function CreateEventDialog({
  selectedDate,
  language,
  onClose,
  onCreated,
}: {
  selectedDate: string;
  language: 'en' | 'zh';
  onClose: () => void;
  onCreated: (title: string) => void | Promise<void>;
}) {
  const initial = useMemo(() => defaultEventSlot(selectedDate), [selectedDate]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState(initial.date);
  const [startTime, setStartTime] = useState(initial.start);
  const [endTime, setEndTime] = useState(initial.end);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');
    if (!title.trim()) {
      setFormError(language === 'zh' ? '请输入日程名称。' : 'Enter an event title.');
      return;
    }
    if (endTime <= startTime) {
      setFormError(language === 'zh' ? '结束时间必须晚于开始时间。' : 'End time must be after start time.');
      return;
    }
    setSubmitting(true);
    try {
      await feishuApi.createCalendarEvent({
        title: title.trim(),
        description: description.trim() || undefined,
        start: `${eventDate}T${startTime}:00+08:00`,
        end: `${eventDate}T${endTime}:00+08:00`,
      });
      await onCreated(title.trim());
    } catch (e: any) {
      setFormError(e.message || String(e));
      setSubmitting(false);
    }
  };

  const inputClass = 'w-full rounded-xl border border-border bg-background/55 px-3 py-2.5 text-sm text-text-heading outline-none transition placeholder:text-text-muted/65 focus:border-blue-300 focus:ring-2 focus:ring-blue-100';

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-black/25 p-4 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
    >
      <form
        onSubmit={submit}
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/70 bg-surface/95 shadow-2xl backdrop-blur-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-event-title"
      >
        <div className="flex items-start gap-3 border-b border-border/70 px-5 py-4">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
            <CalendarPlus className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="create-event-title" className="text-base font-semibold tracking-tight text-text-heading">
              {language === 'zh' ? '新建日程' : 'New event'}
            </h2>
            <p className="mt-0.5 text-[11px] text-text-muted">
              {language === 'zh' ? '保存后会直接创建到你的飞书日历' : 'This will be created directly in your Feishu Calendar'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg p-1.5 text-text-muted transition hover:bg-background hover:text-text-heading disabled:opacity-40"
            aria-label={language === 'zh' ? '关闭' : 'Close'}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold text-text-main">
              {language === 'zh' ? '名称' : 'Title'}
            </span>
            <input
              autoFocus
              value={title}
              onChange={event => setTitle(event.target.value)}
              className={inputClass}
              placeholder={language === 'zh' ? '例如：产品周会' : 'e.g. Product weekly'}
              maxLength={200}
            />
          </label>

          <div className="grid grid-cols-[1.3fr_1fr_1fr] gap-2.5">
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-semibold text-text-main">
                {language === 'zh' ? '日期' : 'Date'}
              </span>
              <input
                type="date"
                value={eventDate}
                onChange={event => setEventDate(event.target.value)}
                className={inputClass}
                required
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-semibold text-text-main">
                {language === 'zh' ? '开始' : 'Start'}
              </span>
              <input
                type="time"
                value={startTime}
                onChange={event => setStartTime(event.target.value)}
                className={inputClass}
                required
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-semibold text-text-main">
                {language === 'zh' ? '结束' : 'End'}
              </span>
              <input
                type="time"
                value={endTime}
                onChange={event => setEndTime(event.target.value)}
                className={inputClass}
                required
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold text-text-main">
              {language === 'zh' ? '备注（可选）' : 'Notes (optional)'}
            </span>
            <textarea
              value={description}
              onChange={event => setDescription(event.target.value)}
              className={`${inputClass} min-h-20 resize-none`}
              placeholder={language === 'zh' ? '补充议程或说明' : 'Add an agenda or context'}
              maxLength={5000}
            />
          </label>

          {formError && (
            <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-[11px] text-red-700" role="alert">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{formError}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border/70 bg-background/30 px-5 py-3.5">
          <span className="text-[10px] text-text-muted">
            {language === 'zh' ? '亚洲/上海 · 飞书主日历' : 'Asia/Shanghai · Feishu primary calendar'}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg px-3 py-2 text-xs font-semibold text-text-main transition hover:bg-surface disabled:opacity-40"
            >
              {language === 'zh' ? '取消' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-55"
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarPlus className="h-3.5 w-3.5" />}
              {language === 'zh' ? '创建到飞书' : 'Create in Feishu'}
            </button>
          </div>
        </div>
      </form>
    </div>
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

function DayView({
  date,
  items,
  language,
  onOpen,
  onSyncTask,
  syncingTaskIds,
}: {
  date: string;
  items: CalendarWorkspaceItem[];
  language: 'en' | 'zh';
  onOpen: (item: CalendarWorkspaceItem) => void;
  onSyncTask: (item: CalendarWorkspaceItem) => void;
  syncingTaskIds: Set<string>;
}) {
  const dayItems = items.filter(item => itemDate(item) === date);
  const timed = dayItems
    .filter(item => !item.allDay)
    .sort((a, b) => a.start.localeCompare(b.start));
  const allDay = dayItems.filter(item => item.allDay);
  const positioned = positionOverlappingEvents(timed);
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
  const locale = language === 'zh' ? 'zh-CN' : 'en-US';
  const dateNumber = utcDate(date).getUTCDate();
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(utcDate(date));
  const monthText = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(utcDate(date));
  const now = new Date();
  const isToday = date === getTodayStr();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const showNow = isToday && nowMinutes >= START_HOUR * 60 && nowMinutes <= END_HOUR * 60;

  return (
    <div className="grid min-h-full min-w-[820px] grid-cols-[minmax(520px,1fr)_300px] bg-background/20">
      <section className="min-w-0 px-5 py-5 md:px-7">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl border text-2xl font-semibold tracking-tight ${
              isToday
                ? 'border-blue-200 bg-blue-600 text-white shadow-sm'
                : 'border-border bg-surface text-text-heading'
            }`}>
              {dateNumber}
            </div>
            <div>
              <p className="text-base font-semibold tracking-tight text-text-heading">{weekday}</p>
              <p className="mt-0.5 text-xs text-text-muted">{monthText}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-text-muted">
            <span className="rounded-full border border-border bg-surface px-2.5 py-1">
              {timed.length} {language === 'zh' ? '个日程' : timed.length === 1 ? 'event' : 'events'}
            </span>
            <span className="rounded-full border border-border bg-surface px-2.5 py-1">
              {allDay.length} {language === 'zh' ? '个全天事项' : 'all-day'}
            </span>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          <div className="flex items-center justify-between border-b border-border/70 px-4 py-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-text-heading">
              <Clock3 className="h-3.5 w-3.5 text-text-muted" />
              {language === 'zh' ? '时间安排' : 'Timeline'}
            </div>
            <span className="text-[10px] text-text-muted">
              {language === 'zh' ? '06:00—23:00 · 亚洲/上海' : '06:00–23:00 · Asia/Shanghai'}
            </span>
          </div>
          <div className="grid grid-cols-[64px_minmax(0,1fr)]">
            <div className="relative border-r border-border/70 bg-background/25" style={{ height: hours.length * HOUR_HEIGHT }}>
              {hours.map((hour, index) => (
                <div
                  key={hour}
                  className="absolute w-full -translate-y-1/2 pr-3 text-right text-[10px] tabular-nums text-text-muted"
                  style={{ top: index * HOUR_HEIGHT }}
                >
                  {String(hour).padStart(2, '0')}:00
                </div>
              ))}
            </div>
            <div
              className="relative"
              style={{
                height: hours.length * HOUR_HEIGHT,
                backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0, transparent 63px, color-mix(in srgb, var(--color-border) 58%, transparent) 64px)',
              }}
            >
              {positioned.map(({ item, column, columns }) => (
                <TimelineEvent
                  key={item.id}
                  item={item}
                  language={language}
                  onOpen={onOpen}
                  style={eventStyle(item, column, columns)}
                />
              ))}
              {showNow && (
                <div
                  className="pointer-events-none absolute left-0 right-0 z-20 flex items-center"
                  style={{ top: ((nowMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT }}
                >
                  <span className="-ml-1.5 h-3 w-3 rounded-full border-2 border-white bg-red-500 shadow-sm" />
                  <span className="h-px flex-1 bg-red-400" />
                </div>
              )}
              {timed.length === 0 && (
                <div className="absolute inset-x-8 top-24 rounded-xl border border-dashed border-border bg-background/35 px-5 py-8 text-center">
                  <CalendarDays className="mx-auto h-5 w-5 text-text-muted/70" />
                  <p className="mt-2 text-xs font-medium text-text-main">
                    {language === 'zh' ? '今天没有定时日程' : 'No timed events today'}
                  </p>
                  <p className="mt-1 text-[10px] text-text-muted">
                    {language === 'zh' ? '全天任务仍会显示在右侧。' : 'All-day items still appear in the agenda.'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <aside className="border-l border-border/70 bg-surface/65 p-4 backdrop-blur-xl">
        <div className="sticky top-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-text-heading">
                {language === 'zh' ? '今日议程' : 'Agenda'}
              </h2>
              <p className="mt-0.5 text-[10px] text-text-muted">
                {language === 'zh' ? `${dayItems.length} 个安排，按时间排序` : `${dayItems.length} items, ordered by time`}
              </p>
            </div>
            <Layers3 className="h-4 w-4 text-text-muted" />
          </div>

          <div className="space-y-5 pr-1">
            <AgendaSection
              title={language === 'zh' ? '日程' : 'Events'}
              count={timed.length}
              items={timed}
              language={language}
              onOpen={onOpen}
            />
            <AgendaSection
              title={language === 'zh' ? '全天与任务' : 'All-day & tasks'}
              count={allDay.length}
              items={allDay}
              language={language}
              onOpen={onOpen}
              allDay
              onSyncTask={onSyncTask}
              syncingTaskIds={syncingTaskIds}
            />
          </div>
        </div>
      </aside>
    </div>
  );
}

function AgendaSection({
  title,
  count,
  items,
  language,
  onOpen,
  allDay = false,
  onSyncTask,
  syncingTaskIds = new Set(),
}: {
  title: string;
  count: number;
  items: CalendarWorkspaceItem[];
  language: 'en' | 'zh';
  onOpen: (item: CalendarWorkspaceItem) => void;
  allDay?: boolean;
  onSyncTask?: (item: CalendarWorkspaceItem) => void;
  syncingTaskIds?: Set<string>;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">{title}</h3>
        <span className="rounded-full bg-background px-1.5 py-0.5 text-[9px] font-semibold text-text-muted">{count}</span>
      </div>
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-[10px] text-text-muted">
          {language === 'zh' ? '没有安排' : 'Nothing scheduled'}
        </div>
      ) : (
        <div className="space-y-1.5">
          {items.map(item => {
            const color = SOURCE_COLOR[item.source] || '#8b5cf6';
            const canSyncTask = item.kind === 'task'
              && item.source === 'dailyflow'
              && item.status !== 'done'
              && Boolean(item.localTaskId)
              && Boolean(onSyncTask);
            const syncing = Boolean(item.localTaskId && syncingTaskIds.has(item.localTaskId));
            return (
              <div
                key={item.id}
                className="group flex w-full items-start rounded-xl border border-transparent transition hover:border-border hover:bg-surface hover:shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => onOpen(item)}
                  className="flex min-w-0 flex-1 gap-2.5 px-2.5 py-2 text-left"
                  title={item.title}
                >
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-[11px] font-semibold text-text-heading ${item.status === 'done' ? 'line-through opacity-55' : ''}`}>
                      {item.title}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[9px] text-text-muted">
                      <span>{allDay ? sourceLabel(item.source, language) : timeText(item.start, language)}</span>
                      {!allDay && item.end && <span>— {timeText(item.end, language)}</span>}
                      {item.location && <MapPin className="ml-auto h-2.5 w-2.5" />}
                    </span>
                  </span>
                  {item.url && <ExternalLink className="mt-1 h-3 w-3 shrink-0 text-text-muted opacity-0 transition group-hover:opacity-100" />}
                </button>
                {canSyncTask && (
                  <button
                    type="button"
                    onClick={() => onSyncTask?.(item)}
                    disabled={syncing}
                    className="mr-1.5 mt-1.5 rounded-lg border border-blue-100 bg-blue-50 p-1.5 text-blue-600 opacity-0 transition hover:border-blue-200 hover:bg-blue-100 disabled:opacity-60 group-hover:opacity-100 focus:opacity-100"
                    title={language === 'zh' ? '同步这个任务到飞书任务' : 'Sync this task to Feishu Tasks'}
                    aria-label={language === 'zh' ? `同步 ${item.title} 到飞书任务` : `Sync ${item.title} to Feishu Tasks`}
                  >
                    {syncing
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <CloudUpload className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function TimelineEvent({
  item,
  language,
  onOpen,
  style,
  compact = false,
}: {
  item: CalendarWorkspaceItem;
  language: 'en' | 'zh';
  onOpen: (item: CalendarWorkspaceItem) => void;
  style: React.CSSProperties;
  compact?: boolean;
}) {
  const duration = eventBounds(item).end - eventBounds(item).start;
  return (
    <button
      onClick={() => onOpen(item)}
      className="absolute z-10 overflow-hidden rounded-lg border border-black/[0.06] border-l-[3px] px-2 py-1.5 text-left shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition duration-200 hover:z-30 hover:-translate-y-px hover:border-black/10 hover:shadow-md"
      style={style}
      title={`${item.title} · ${timeText(item.start, language)}${item.end ? `–${timeText(item.end, language)}` : ''}`}
    >
      <div className={`${compact ? 'text-[10px]' : 'text-[11px]'} truncate font-semibold leading-tight text-text-heading`}>
        {item.title}
      </div>
      {duration >= 40 && (
        <div className="mt-1 flex items-center gap-1 truncate text-[9px] font-medium text-text-muted">
          <span>{timeText(item.start, language)}</span>
          {item.end && <span>–{timeText(item.end, language)}</span>}
          {!compact && <span className="ml-auto">{sourceLabel(item.source, language)}</span>}
        </div>
      )}
      {!compact && duration >= 50 && item.location && (
        <div className="mt-1 flex items-center gap-1 truncate text-[9px] text-text-muted">
          <MapPin className="h-2.5 w-2.5 shrink-0" />
          {item.location}
        </div>
      )}
    </button>
  );
}

function WeekGrid({
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
    <div className="min-w-[680px] bg-background/20">
      <div className="sticky top-0 z-20 grid border-b border-border bg-surface/95 backdrop-blur-xl" style={{ gridTemplateColumns: `56px repeat(${dates.length}, minmax(88px, 1fr))` }}>
        <div className="border-r border-border/70" />
        {dates.map(day => (
          <div key={day} className={`border-r border-border/70 px-2 py-2.5 text-center ${day === today ? 'bg-blue-50/70' : ''}`}>
            <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-text-muted">
              {new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(utcDate(day))}
            </div>
            <div className={`mx-auto mt-1 grid h-7 w-7 place-items-center rounded-full text-sm font-semibold ${
              day === today ? 'bg-blue-600 text-white shadow-sm' : 'text-text-heading'
            }`}>
              {utcDate(day).getUTCDate()}
            </div>
          </div>
        ))}
        <div className="border-r border-t border-border/70 bg-background/30 px-2 py-2 text-[9px] font-medium uppercase tracking-wide text-text-muted">
          {language === 'zh' ? '全天' : 'All day'}
        </div>
        {dates.map(day => {
          const allDay = items.filter(item => item.allDay && itemDate(item) === day);
          return (
            <div key={`all-${day}`} className={`min-h-[58px] border-r border-t border-border/70 p-1.5 ${day === today ? 'bg-blue-50/30' : 'bg-surface/60'}`}>
              <div className="flex flex-col gap-1">
                {allDay.slice(0, 2).map(item => (
                  <CalendarPill key={item.id} item={item} language={language} onOpen={onOpen} compact />
                ))}
                {allDay.length > 2 && <span className="px-1 text-[9px] font-medium text-text-muted">+{allDay.length - 2}</span>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="grid" style={{ gridTemplateColumns: `56px repeat(${dates.length}, minmax(88px, 1fr))` }}>
        <div className="relative border-r border-border/70 bg-background/35" style={{ height: hours.length * HOUR_HEIGHT }}>
          {hours.map((hour, index) => (
            <div key={hour} className="absolute w-full -translate-y-1/2 pr-2 text-right text-[9px] tabular-nums text-text-muted" style={{ top: index * HOUR_HEIGHT }}>
              {String(hour).padStart(2, '0')}:00
            </div>
          ))}
        </div>
        {dates.map(day => {
          const timed = items.filter(item => !item.allDay && itemDate(item) === day);
          const positioned = positionOverlappingEvents(timed);
          return (
            <div
              key={day}
              className={`relative border-r border-border/70 ${day === today ? 'bg-blue-50/20' : ''}`}
              style={{
                height: hours.length * HOUR_HEIGHT,
                backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0, transparent 63px, var(--color-border) 64px)',
              }}
            >
              {positioned.map(({ item, column, columns }) => (
                <TimelineEvent
                  key={item.id}
                  item={item}
                  language={language}
                  onOpen={onOpen}
                  style={eventStyle(item, column, columns)}
                  compact
                />
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
  onOpenDay,
}: {
  date: string;
  range: { start: string; end: string };
  items: CalendarWorkspaceItem[];
  language: 'en' | 'zh';
  onOpen: (item: CalendarWorkspaceItem) => void;
  onOpenDay: (date: string) => void;
}) {
  const days = Array.from({ length: Math.round((utcDate(range.end).getTime() - utcDate(range.start).getTime()) / DAY_MS) + 1 }, (_, i) => addDays(range.start, i));
  const locale = language === 'zh' ? 'zh-CN' : 'en-US';
  const month = utcDate(date).getUTCMonth();
  return (
    <div className="min-w-[840px] bg-background/20 p-3">
      <div className="grid grid-cols-7 overflow-hidden rounded-t-xl border border-border bg-surface/90">
        {Array.from({ length: 7 }, (_, i) => addDays(startOfWeek('2026-07-27'), i)).map(day => (
          <div key={day} className="border-r border-border/70 px-2 py-2.5 text-center text-[9px] font-semibold uppercase tracking-[0.08em] text-text-muted last:border-r-0">
            {new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(utcDate(day))}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 overflow-hidden rounded-b-xl border-x border-b border-border bg-surface/55 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        {days.map(day => {
          const dayItems = items.filter(item => itemDate(item) === day);
          const isCurrentMonth = utcDate(day).getUTCMonth() === month;
          const isToday = day === getTodayStr();
          return (
            <div key={day} className={`group min-h-[132px] border-b border-r border-border/70 p-2 transition-colors hover:bg-background/55 ${isCurrentMonth ? 'bg-surface/35' : 'bg-black/[0.018]'}`}>
              <button
                onClick={() => onOpenDay(day)}
                className={`mb-1.5 grid h-7 min-w-7 place-items-center rounded-full px-1 text-[11px] font-semibold transition ${
                  isToday ? 'bg-blue-600 text-white shadow-sm' : isCurrentMonth ? 'text-text-heading hover:bg-background' : 'text-text-muted/45'
                }`}
                title={language === 'zh' ? '打开日视图' : 'Open day view'}
              >
                {utcDate(day).getUTCDate()}
              </button>
              <div className="flex flex-col gap-0.5">
                {dayItems.slice(0, 3).map(item => (
                  <CalendarPill key={item.id} item={item} language={language} onOpen={onOpen} compact />
                ))}
                {dayItems.length > 3 && (
                  <button onClick={() => onOpenDay(day)} className="mt-0.5 px-1 text-left text-[9px] font-semibold text-text-muted hover:text-text-main">
                    +{dayItems.length - 3} {language === 'zh' ? '项' : 'more'}
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
      className={`group flex w-full items-center gap-1.5 overflow-hidden rounded-md border border-transparent px-1.5 py-1 text-left text-[9px] transition hover:border-black/[0.06] hover:shadow-sm ${
        item.status === 'done' ? 'opacity-50' : ''
      }`}
      style={{ backgroundColor: SOURCE_SURFACE[item.source] || `${color}12`, color }}
      title={[
        item.title,
        item.delayed ? (language === 'zh' ? 'Delay（延期）' : 'Delayed') : '',
        item.originalDate
          ? `${language === 'zh' ? '原日期' : 'Original date'}: ${item.originalDate}`
          : '',
        sourceLabel(item.source, language),
      ].filter(Boolean).join(' · ')}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      {item.kind === 'task' ? <ListTodo className="h-2.5 w-2.5 shrink-0 opacity-75" /> : null}
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
