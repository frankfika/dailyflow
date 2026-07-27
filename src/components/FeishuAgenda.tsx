import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Clock3, MapPin, RefreshCw } from 'lucide-react';
import { open } from '@tauri-apps/plugin-shell';
import { feishuApi, type FeishuAgendaEvent } from '../api/client';

interface FeishuAgendaProps {
  date: string;
  language: 'en' | 'zh';
}

function dayBoundary(date: string, end = false): string {
  return `${date}T${end ? '23:59:59' : '00:00:00'}+08:00`;
}

function timeLabel(event: FeishuAgendaEvent, language: 'en' | 'zh'): string {
  if (event.allDay) return language === 'zh' ? '全天' : 'All day';
  const format = new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${format.format(new Date(event.start))}–${format.format(new Date(event.end))}`;
}

export function FeishuAgenda({ date, language }: FeishuAgendaProps) {
  const [events, setEvents] = useState<FeishuAgendaEvent[]>([]);
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const status = await feishuApi.status();
      setAuthorized(status.authorized);
      if (!status.authorized) {
        setEvents([]);
        return;
      }
      setEvents(await feishuApi.agenda(dayBoundary(date), dayBoundary(date, true)));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
    const refresh = () => load();
    window.addEventListener('df:feishu-synced', refresh);
    return () => window.removeEventListener('df:feishu-synced', refresh);
  }, [load]);

  if (!authorized && !loading) return null;

  const openEvent = async (url?: string) => {
    if (!url) return;
    try {
      await open(url);
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <section className="mb-5 overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border/70 px-4 py-3">
        <CalendarDays className="h-4 w-4 text-blue-600" />
        <h3 className="text-xs font-bold text-text-heading">
          {language === 'zh' ? '飞书日程' : 'Feishu Calendar'}
        </h3>
        <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold text-blue-700">
          {events.length}
        </span>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="ml-auto rounded p-1 text-text-muted hover:bg-background hover:text-text-heading disabled:opacity-50"
          title={language === 'zh' ? '刷新飞书日程' : 'Refresh Feishu calendar'}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error ? (
        <div className="px-4 py-3 text-xs text-red-600">{error}</div>
      ) : events.length === 0 && !loading ? (
        <div className="px-4 py-4 text-xs text-text-muted">
          {language === 'zh' ? '这一天没有飞书日程' : 'No Feishu events for this day'}
        </div>
      ) : (
        <div className="divide-y divide-border/60">
          {events.map(event => (
            <button
              key={event.id}
              type="button"
              onClick={() => openEvent(event.url)}
              className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-background/70"
            >
              <div className="mt-0.5 min-w-[76px] text-[11px] font-semibold text-blue-700">
                {timeLabel(event, language)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold text-text-heading">{event.title}</div>
                <div className="mt-1 flex flex-wrap gap-3 text-[10px] text-text-muted">
                  {!event.allDay && (
                    <span className="inline-flex items-center gap-1">
                      <Clock3 className="h-3 w-3" />
                      {timeLabel(event, language)}
                    </span>
                  )}
                  {event.location && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {event.location}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
