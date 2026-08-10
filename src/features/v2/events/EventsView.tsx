import { useMemo, useState } from 'react';
import { ArrowLeft, Check, Calendar, ChevronRight, ListTodo, Sparkles, Loader2, X } from 'lucide-react';
import { useEvents, useTodayItems, useEventById } from '../hooks/useEvents';
import type { EventContext, EventDetail, EventSummary, TodayItem } from '../../../api/client';
import { getTodayStr } from '../../../utils/tagColors';

const STATUS_LABEL: Record<EventContext, string> = {
  work: '工作',
  life: '生活',
};

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="w-full h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
      <div
      className="h-full rounded-full bg-[#23877B] transition-all duration-500"
      style={{ width: `${pct}%` }}
    />
    </div>
  );
}

export interface EventsViewProps {
  language?: 'zh' | 'en';
  sidebarOpen?: boolean;
  onNotice?: (message: string, type?: 'success' | 'info' | 'error') => void;
}

export function EventsView({ language = 'en', sidebarOpen = true, onNotice }: EventsViewProps) {
  const today = getTodayStr();
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [dateRange] = useState({ from: undefined, to: undefined });
  const eventsQ = useEvents({ from: dateRange.from, to: dateRange.to });
  const todayQ = useTodayItems(today);
  const eventDetailQ = useEventById(selectedEventId);

  const todayGroups = useMemo(() => {
    const ev: TodayItem[] = todayQ.data?.items ?? [];
    return {
      todo: ev.filter((i) => i.status === 'todo'),
      done: ev.filter((i) => i.status === 'done'),
    };
  }, [todayQ.data?.items]);

  return (
    <div className="flex h-full w-full min-h-0">
      {/* Left column: Today + Event list */}
      <aside className={`flex flex-col border-r border-gray-200 dark:border-gray-700 transition-[width] duration-200 ${
        selectedEventId ? 'w-[360px]' : 'w-full'
      }`}>
        <header className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-[#23877B]" />
              Today
            </h2>
            <span className="text-xs text-gray-500 dark:text-gray-400">{today}</span>
          </div>
          {todayQ.isLoading ? (
            <div className="flex items-center gap-2 text-xs text-gray-500 py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>加载中…</span>
            </div>
          ) : (
            <>
              <ul className="space-y-1.5">
                {todayGroups.todo.length === 0 && todayGroups.done.length === 0 && (
                  <li className="text-xs text-gray-400 dark:text-gray-500 py-4 text-center">
                    今天还没有待办
                  </li>
                )}
                {todayGroups.todo.map((item) => (
                  <TodayItemRow
                  key={item.id}
                  item={item}
                  onClick={() => {
                    if (item.kind === 'event-node') {
                      setSelectedEventId(item.eventId);
                      onNotice?.(`打开事件: ${item.eventTitle}`, 'info');
                    }
                  }}
                />
                ))}
                {todayGroups.done.length > 0 && (
                  <li className="pt-2 mt-1 border-t border-gray-100 dark:border-gray-800">
                    <div className="text-xs text-gray-400 mb-1">已完成 {todayGroups.done.length}</div>
                    <ul className="space-y-1.5 opacity-60">
                      {todayGroups.done.map((item) => (
                        <TodayItemRow key={item.id} item={item} onClick={() => {
                          if (item.kind === 'event-node') setSelectedEventId(item.eventId);
                        }} />
                      ))}
                    </ul>
                  </li>
                )}
              </ul>
            </>
          )}
        </header>

        <div className="px-4 pt-4 pb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-[#23877B]" />
            全部事件
          </h3>
          <span className="text-xs text-gray-500">
            {eventsQ.data?.events?.length ?? 0}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {eventsQ.isLoading ? (
            <div className="flex items-center gap-2 text-xs text-gray-500 py-6 text-center">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>加载中…</span>
            </div>
          ) : eventsQ.data?.events?.length === 0 ? (
            <div className="text-xs text-gray-400 dark:text-gray-500 py-8 text-center">
              还没有事件。事件由 Topic Space 转换而来。
            </div>
          ) : (
            <ul className="space-y-2">
              {eventsQ.data?.events?.map((ev) => (
                <EventSummaryRow
                key={ev.id}
                event={ev}
                selected={selectedEventId === ev.id}
                onClick={() => setSelectedEventId(ev.id)}
              />
            ))}
            </ul>
          )}
        </div>
      </aside>

      {/* Right column: Event Detail */}
      {selectedEventId && (
        <section className="flex-1 flex flex-col min-w-0">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
            <button
            onClick={() => setSelectedEventId(null)}
            className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200"
            aria-label="关闭详情"
            title="返回列表"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          {eventDetailQ.isLoading ? (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              加载事件…
            </div>
          ) : eventDetailQ.data?.event ? (
            <EventDetailPanel event={eventDetailQ.data.event} onBack={() => setSelectedEventId(null)} />
          ) : (
            <EventDetailEmpty />
          )}
        </div>
      </section>
      )}
    </div>
  );
}

function TodayItemRow({
  item,
  onClick,
}: {
  item: TodayItem;
  onClick?: () => void;
}) {
  return (
    <li>
      <button
      onClick={onClick}
      disabled={!onClick || item.kind === 'standalone'}
      className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
        item.kind === 'event-node'
          ? 'hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-[#23877B]/40 cursor-pointer border-gray-200 dark:border-gray-700'
          : 'cursor-default border-gray-200 dark:border-gray-700'
      } ${item.status === 'done' ? 'opacity-70 line-through decoration-gray-400 dark:decoration-gray-500' : ''}`}
    >
      <div className="flex items-start gap-2">
        {item.status === 'done' ? (
          <Check className="w-4 h-4 mt-0.5 text-[#23877B]" />
        ) : (
          <div className="w-4 h-4 mt-0.5 rounded-full border-2 border-gray-300 dark:border-gray-600" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
            {item.title}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {item.kind === 'event-node' && (
              <span className="text-[11px] text-[#23877B] font-medium">{item.eventTitle}</span>
            )}
            {item.kind === 'standalone' && (
              <span className="text-[11px] text-gray-400">独立任务</span>
            )}
            {item.deadline && (
              <span className="text-[11px] text-red-500">⏰ {item.deadline}</span>
            )}
            {item.priority === 'high' && (
              <span className="text-[11px] text-red-500 font-semibold">高优</span>
            )}
          </div>
        </div>
        {item.kind === 'event-node' && (
          <ChevronRight className="w-3.5 h-3.5 text-gray-400 mt-1" />
        )}
      </div>
    </button>
    </li>
  );
}

function EventSummaryRow({
  event,
  selected,
  onClick,
}: {
  event: EventSummary;
  selected: boolean;
  onClick?: () => void;
}) {
  return (
    <li>
      <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all ${
        selected
          ? 'border-[#23877B] bg-[#23877B]/10 ring-1 ring-[#23877B]'
          : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-gray-300'
      }`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
            {event.title}
          </h4>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${
            event.context === 'work'
              ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
              : 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
          }`}>
            {STATUS_LABEL[event.context]}
          </span>
          {event.status === 'completed' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300">
              已完成
            </span>
          )}
        </div>
        <span className="text-[11px] text-gray-500">
          {event.progress.done}/{event.progress.total}
        </span>
      </div>
      <ProgressBar done={event.progress.done} total={event.progress.total} />
      {event.effectiveTags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {event.effectiveTags.slice(0, 4).map((t) => (
            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
              #{t}
            </span>
          ))}
        </div>
      )}
    </button>
    </li>
  );
}

function EventDetailPanel({ event, onBack }: { event: EventDetail; onBack: () => void }) {
  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <div className="flex-1 min-w-0">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">
          {event.title}
        </h2>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-[11px] px-1.5 py-0.5 rounded-md ${
            event.context === 'work'
              ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
              : 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
          }`}>
            {STATUS_LABEL[event.context]}
          </span>
          <span className="text-[11px] text-gray-500">{event.progress.done}/{event.progress.total} 项</span>
          {event.integrity.orphanTaskIds.length > 0 && (
            <span className="text-[11px] text-amber-600">
              ⚠ {event.integrity.orphanTaskIds.length} 孤立任务
            </span>
          )}
        </div>
      </div>
      <button
      onClick={onBack}
      className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
      aria-label="关闭详情"
    >
      <X className="w-4 h-4" />
    </button>
    </div>
  );
}

function EventDetailEmpty() {
  return (
    <div className="flex-1 min-w-0 flex flex-col items-center justify-center text-gray-400 text-sm">
      <ListTodo className="w-10 h-10 mb-2 opacity-30" />
      <div>事件未找到或已被删除</div>
    </div>
  );
}
