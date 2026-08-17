import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CalendarDays, ChevronDown, Loader2, MoreHorizontal, Plus, Search, X } from 'lucide-react';
import type { EventDetail, EventNode, EventSummary } from '../../../api/client';
import {
  useAddEventChild,
  useAddEventSibling,
  useCompleteNodeTask,
  useCreateEvent,
  useDeleteEventNode,
  useEventById,
  useEvents,
  useRenameEventNode,
  useScheduleEventNode,
  useUnscheduleEventNode,
  useUndoCompleteNodeTask,
} from '../hooks/useEvents';
import { EventCanvas } from './EventCanvas';

export interface EventsViewProps {
  language?: 'zh' | 'en';
  context?: 'work' | 'life';
  sidebarOpen?: boolean;
  onNotice?: (message: string, type?: 'success' | 'info' | 'error') => void;
  requestedEventId?: string | null;
  onRequestedEventHandled?: () => void;
}

const TEXT = {
  en: {
    title: 'Events', subtitle: 'Plan the outcome here. Send only the next actions to Today.', newEvent: 'New Event', active: 'Active', completed: 'Completed', empty: 'Create an event and start breaking it down.', emptyAction: 'Create your first event', input: 'What are you moving forward?', create: 'Create', cancel: 'Cancel', loading: 'Loading events…', loadError: 'Events could not be loaded.', noActions: 'Not scheduled yet', updated: 'Updated', back: 'Back to Events', search: 'Search nodes', more: 'More', missing: 'This event is missing its canvas.', noMatch: 'No matching nodes', removePending: 'Removing a date is not available yet.',
  },
  zh: {
    title: '事件', subtitle: '在这里规划全局，只把下一步行动安排到 Today。', newEvent: '新建事件', active: '进行中', completed: '已完成', empty: '创建一个事件，然后开始拆解。', emptyAction: '创建第一个事件', input: '你想推进什么事情？', create: '创建', cancel: '取消', loading: '正在加载事件…', loadError: '事件加载失败。', noActions: '尚未安排', updated: '更新于', back: '返回事件', search: '搜索节点', more: '更多', missing: '这个事件缺少可用的画布。', noMatch: '没有匹配的节点', removePending: '暂时无法移出日程。',
  },
} as const;

export function EventsView({ language = 'en', context = 'work', onNotice, requestedEventId, onRequestedEventHandled }: EventsViewProps) {
  const t = TEXT[language];
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const eventsQ = useEvents();
  const createEvent = useCreateEvent();
  const events = useMemo(
    () => (eventsQ.data?.events ?? []).filter((event) => event.context === context),
    [context, eventsQ.data?.events],
  );

  useEffect(() => {
    if (!requestedEventId) return;
    setSelectedEventId(requestedEventId);
    onRequestedEventHandled?.();
  }, [onRequestedEventHandled, requestedEventId]);

  async function submitNewEvent() {
    if (!newTitle.trim()) return;
    try {
      const created = await createEvent.mutateAsync({ title: newTitle.trim(), context });
      setNewTitle('');
      setCreating(false);
      setSelectedEventId(created.id);
      onNotice?.(language === 'zh' ? '事件已创建' : 'Event created', 'success');
    } catch (error) {
      onNotice?.(error instanceof Error ? error.message : t.loadError, 'error');
    }
  }

  if (selectedEventId) {
    return <EventDetailView eventId={selectedEventId} language={language} onBack={() => setSelectedEventId(null)} onNotice={onNotice} />;
  }

  const active = events.filter((event) => event.status === 'active');
  const completed = events.filter((event) => event.status === 'completed');

  return (
    <section className="flex h-full min-h-0 flex-col bg-[var(--color-background)]" data-testid="events-surface">
      <header className="shrink-0 border-b border-border/70 bg-surface/70 px-6 py-5 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-6">
          <div><h1 className="text-xl font-semibold tracking-tight text-text-heading">{t.title}</h1><p className="mt-1 text-xs text-text-muted">{t.subtitle}</p></div>
          <button onClick={() => setCreating(true)} className="flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-all hover:opacity-90 active:scale-[0.98]" data-testid="new-event-button"><Plus className="h-4 w-4" />{t.newEvent}</button>
        </div>
      </header>

      {creating && (
        <form onSubmit={(e) => { e.preventDefault(); void submitNewEvent(); }} className="border-b border-gray-200 bg-gray-50 px-6 py-4 dark:border-gray-800 dark:bg-gray-900/40" data-testid="new-event-form">
          <div className="mx-auto flex max-w-4xl items-center gap-2">
            <input autoFocus value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder={t.input} aria-label={t.input} className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[#23877B] focus:ring-2 focus:ring-[#23877B]/10 dark:border-gray-700 dark:bg-gray-900" />
            <button disabled={!newTitle.trim() || createEvent.isPending} className="rounded-lg bg-[#23877B] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40">{createEvent.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t.create}</button>
            <button type="button" onClick={() => { setCreating(false); setNewTitle(''); }} className="rounded-lg px-3 py-2.5 text-sm text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-800">{t.cancel}</button>
          </div>
        </form>
      )}

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-4xl">
          {eventsQ.isLoading && <CenteredState icon={<Loader2 className="h-5 w-5 animate-spin" />} text={t.loading} />}
          {eventsQ.isError && <CenteredState text={t.loadError} />}
          {!eventsQ.isLoading && !eventsQ.isError && events.length === 0 && (
            <div className="flex min-h-80 flex-col items-center justify-center text-center">
              <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-[#23877B]/10 text-[#23877B]"><CalendarDays className="h-6 w-6" /></div>
              <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">{t.empty}</p>
              <button onClick={() => setCreating(true)} className="rounded-lg border border-gray-300 px-3.5 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900">{t.emptyAction}</button>
            </div>
          )}
          {active.length > 0 && <EventGroup title={t.active} events={active} language={language} onOpen={setSelectedEventId} noActions={t.noActions} updated={t.updated} />}
          {completed.length > 0 && <CompletedGroup title={t.completed} events={completed} language={language} onOpen={setSelectedEventId} noActions={t.noActions} updated={t.updated} />}
        </div>
      </div>
    </section>
  );
}

function EventGroup({ title, events, language, onOpen, noActions, updated }: { title: string; events: EventSummary[]; language: 'en' | 'zh'; onOpen: (id: string) => void; noActions: string; updated: string }) {
  return <div className="mb-8"><h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">{title}</h2><div className="space-y-2">{events.map((event) => <EventCard key={event.id} event={event} language={language} onOpen={onOpen} noActions={noActions} updated={updated} />)}</div></div>;
}

function CompletedGroup(props: Parameters<typeof EventGroup>[0]) {
  const [open, setOpen] = useState(false);
  return <div><button onClick={() => setOpen((value) => !value)} className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-400" aria-expanded={open}><ChevronDown className={`h-4 w-4 transition ${open ? '' : '-rotate-90'}`} />{props.title}<span className="font-normal">{props.events.length}</span></button>{open && <div className="space-y-2">{props.events.map((event) => <EventCard key={event.id} event={event} language={props.language} onOpen={props.onOpen} noActions={props.noActions} updated={props.updated} />)}</div>}</div>;
}

function EventCard({ event, language, onOpen, noActions, updated }: { event: EventSummary; language: 'en' | 'zh'; onOpen: (id: string) => void; noActions: string; updated: string }) {
  return <button onClick={() => onOpen(event.id)} className="w-full rounded-xl border border-border/80 bg-surface-elevated px-4 py-3.5 text-left shadow-[0_1px_2px_rgba(20,45,38,0.025)] transition-all hover:-translate-y-px hover:border-border-strong hover:shadow-[0_5px_18px_rgba(20,45,38,0.055)]" data-testid={`event-card-${event.id}`}><div className="flex items-start justify-between gap-4"><div className="min-w-0"><h3 className="truncate text-sm font-medium text-text-heading">{event.title}</h3><p className="mt-1 text-xs text-text-muted">{updated} {formatDate(event.updatedAt, language)}</p></div><span className="shrink-0 text-xs tabular-nums text-text-muted">{event.progress.total ? `${event.progress.done} / ${event.progress.total}` : noActions}</span></div>{event.progress.total > 0 && <div className="mt-3 h-1 overflow-hidden rounded-full bg-black/[0.045]"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(event.progress.done / event.progress.total * 100)}%` }} /></div>}{event.effectiveTags.length > 0 && <div className="mt-2.5 flex gap-1.5">{event.effectiveTags.slice(0, 2).map((tag) => <span key={tag} className="rounded-md border border-border/70 bg-black/[0.025] px-1.5 py-0.5 text-[10px] text-text-muted">#{tag}</span>)}</div>}</button>;
}

function EventDetailView({ eventId, language, onBack, onNotice }: { eventId: string; language: 'en' | 'zh'; onBack: () => void; onNotice?: EventsViewProps['onNotice'] }) {
  const t = TEXT[language];
  const detailQ = useEventById(eventId);
  const addChild = useAddEventChild();
  const addSibling = useAddEventSibling();
  const rename = useRenameEventNode();
  const deleteNode = useDeleteEventNode();
  const schedule = useScheduleEventNode();
  const unschedule = useUnscheduleEventNode();
  const complete = useCompleteNodeTask();
  const reopen = useUndoCompleteNodeTask();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const event = detailQ.data?.event;
  const matches = useMemo(() => event?.nodes.filter((node) => node.text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) ?? [], [event?.nodes, query]);

  async function safe<T>(action: () => Promise<T>, success?: string): Promise<T | undefined> {
    try {
      const result = await action();
      if (success) onNotice?.(success, 'success');
      return result;
    }
    catch (error) { onNotice?.(error instanceof Error ? error.message : t.loadError, 'error'); return undefined; }
  }

  if (detailQ.isLoading) return <CenteredState icon={<Loader2 className="h-5 w-5 animate-spin" />} text={t.loading} />;
  if (!event) return <CenteredState text={t.missing} />;
  if (event.integrity.missingMap) return <CenteredState text={t.missing} />;

  return <section className="flex h-full min-h-0 flex-col" data-testid="event-detail">
    <header className="relative z-20 flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-[#101514]">
      <button onClick={onBack} aria-label={t.back} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"><ArrowLeft className="h-4 w-4" /></button>
      <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-gray-950 dark:text-gray-50">{event.title}</h1>
      {searchOpen ? <div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" /><input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.search} aria-label={t.search} className="w-56 rounded-lg border border-gray-200 bg-transparent py-2 pl-8 pr-8 text-sm outline-none focus:border-[#23877B] dark:border-gray-700" /><button onClick={() => { setSearchOpen(false); setQuery(''); }} className="absolute right-2 top-2 p-0.5 text-gray-400" aria-label="Close search"><X className="h-4 w-4" /></button>{query && matches.length === 0 && <div className="absolute right-0 top-11 w-56 rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-400 shadow-lg dark:border-gray-700 dark:bg-gray-900">{t.noMatch}</div>}</div> : <button onClick={() => setSearchOpen(true)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" aria-label={t.search}><Search className="h-4 w-4" /></button>}
      <div className="relative"><button onClick={() => setMoreOpen((value) => !value)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" aria-label={t.more}><MoreHorizontal className="h-4 w-4" /></button>{moreOpen && <div className="absolute right-0 top-10 w-44 rounded-xl border border-gray-200 bg-white p-2 text-xs text-gray-500 shadow-lg dark:border-gray-700 dark:bg-gray-900">{event.progress.total ? `${event.progress.done} / ${event.progress.total}` : t.noActions}</div>}</div>
    </header>
    <div className="min-h-0 flex-1">
      <EventCanvas
        event={event}
        language={language}
        focusedNodeId={query && matches.length ? matches[0].id : null}
        onAddChild={async (parentId, text) => {
          const result = await safe(() => addChild.mutateAsync({ eventId, mindmapId: event.mindmapId, parentId, text }));
          return result?.nodeId ?? '';
        }}
        onAddSibling={async (referenceId, text) => {
          const result = await safe(() => addSibling.mutateAsync({ eventId, mindmapId: event.mindmapId, referenceId, text }));
          return result?.nodeId ?? '';
        }}
        onRename={async (nodeId, text) => { await safe(() => rename.mutateAsync({ eventId, mindmapId: event.mindmapId, nodeId, text })); }}
        onDelete={async (nodeId) => { await safe(() => deleteNode.mutateAsync({ eventId, mindmapId: event.mindmapId, nodeId })); }}
        onSchedule={async (node, date) => { await safe(() => schedule.mutateAsync({ eventId, mindmapId: event.mindmapId, nodeId: node.id, date, taskId: node.execution?.taskId, fromDate: node.execution?.scheduledDate }), language === 'zh' ? '已安排' : 'Scheduled'); }}
        onUnschedule={async (node) => {
          if (!node.execution) return;
          await safe(() => unschedule.mutateAsync({ eventId, mindmapId: event.mindmapId, nodeId: node.id, taskId: node.execution!.taskId, scheduledDate: node.execution!.scheduledDate }), language === 'zh' ? '已移出日程' : 'Removed from day');
        }}
        onToggleDone={async (node) => { await safe(() => toggleNode(node, complete.mutateAsync, reopen.mutateAsync)); }}
      />
    </div>
  </section>;
}

async function toggleNode(node: EventNode, complete: (input: { taskId: string; scheduledDate: string }) => Promise<unknown>, reopen: (input: { taskId: string; scheduledDate: string }) => Promise<unknown>) {
  if (!node.execution) return;
  const input = { taskId: node.execution.taskId, scheduledDate: node.execution.scheduledDate };
  if (node.execution.status === 'done') await reopen(input); else await complete(input);
}

function CenteredState({ icon, text }: { icon?: React.ReactNode; text: string }) { return <div className="flex h-full min-h-64 items-center justify-center gap-2 text-sm text-gray-400">{icon}{text}</div>; }
function formatDate(value: string, language: 'en' | 'zh') { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en', { month: 'short', day: 'numeric' }).format(date); }
