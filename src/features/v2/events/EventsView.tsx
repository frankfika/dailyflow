import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays, ChevronDown, Loader2, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Plus, Redo2, Search, Sparkles, Undo2, X } from 'lucide-react';
import { ulid } from 'ulid';
import type { EventDetail, EventNode, EventSummary, MindMap, OrganizeStrategy, OrganizeSuggestion } from '../../../api/client';
import { mindmapsApi, organizeApi } from '../../../api/client';
import { queryKeys } from '../../../queryKeys';
import { readEventMap, writeEventMap } from '../hooks/mindMapCache';
import { OrganizeSuggestionModal } from '../../../components/MindMap/OrganizeSuggestionModal';
import { MINDMAP_TEMPLATES } from '../../../components/MindMap/templates';
import {
  useAddEventChild,
  useAddEventSibling,
  useApplyOrganizeSuggestion,
  useSeedEventTemplate,
  useCompleteNodeTask,
  useCreateEvent,
  useDeleteEventNode,
  useEventById,
  useEvents,
  useLayoutEventTree,
  useMoveEventNode,
  useOutdentEventNode,
  useReorderEventNode,
  useRenameEventNode,
  useScheduleEventNode,
  useUnscheduleEventNode,
  useUndoCompleteNodeTask,
  useUpdateNodePosition,
} from '../hooks/useEvents';
import { EventCanvas } from './EventCanvas';
import { EventOutline } from './EventOutline';
import { AgentRunPanel } from './AgentRunPanel';
import { ResizeHandle } from '../../../components/ResizeHandle';
import { EventOperatorContextPreview, type ContextRef } from './EventOperatorContextPreview';
import { getPendingGraphProposal, listEventOperatorRuns, type EventGraphProposal, type EventOperatorRun } from '../api/client';

export interface EventsViewProps {
  language?: 'zh' | 'en';
  context?: 'work' | 'life';
  sidebarOpen?: boolean;
  onNotice?: (message: string, type?: 'success' | 'info' | 'error') => void;
  requestedEventId?: string | null;
  /** UX S8: node to highlight when the canvas opens via a Today chip. */
  requestedNodeId?: string | null;
  onRequestedNodeHandled?: () => void;
  onRequestedEventHandled?: () => void;
}

const TEXT = {
  en: {
    title: 'Events', subtitle: 'Plan the outcome here. Send only the next actions to Today.', newEvent: 'New Event', active: 'Active', completed: 'Completed', empty: 'Create an event and start breaking it down.', emptyAction: 'Create your first event', input: 'What are you moving forward?', create: 'Create', cancel: 'Cancel', loading: 'Loading events…', loadError: 'Events could not be loaded.', noActions: 'Not scheduled yet', updated: 'Updated', back: 'Back to Events', search: 'Search nodes', more: 'More', missing: 'This event is missing its canvas.', noMatch: 'No matching nodes', removePending: 'Removing a date is not available yet.', showOutline: 'Show outline', hideOutline: 'Hide outline', undo: 'Undo', redo: 'Redo',
  },
  zh: {
    title: '事件', subtitle: '在这里规划全局，只把下一步行动安排到 Today。', newEvent: '新建事件', active: '进行中', completed: '已完成', empty: '创建一个事件，然后开始拆解。', emptyAction: '创建第一个事件', input: '你想推进什么事情？', create: '创建', cancel: '取消', loading: '正在加载事件…', loadError: '事件加载失败。', noActions: '尚未安排', updated: '更新于', back: '返回事件', search: '搜索节点', more: '更多', missing: '这个事件缺少可用的画布。', noMatch: '没有匹配的节点', removePending: '暂时无法移出日程。', showOutline: '显示大纲', hideOutline: '隐藏大纲', undo: '撤销', redo: '重做',
  },
} as const;

const OUTLINE_VISIBILITY_KEY = 'dailyflow:events:outlineVisible';
const OUTLINE_WIDTH_KEY = 'dailyflow:events:outlineWidth';
const OUTLINE_DEFAULT_WIDTH = 300;
const OUTLINE_MIN_WIDTH = 200;
const CANVAS_MIN_WIDTH = 320;

function readOutlineWidth(): number {
  if (typeof window === 'undefined') return OUTLINE_DEFAULT_WIDTH;
  const parsed = Number(window.localStorage.getItem(OUTLINE_WIDTH_KEY));
  return Number.isFinite(parsed) && parsed >= OUTLINE_MIN_WIDTH ? parsed : OUTLINE_DEFAULT_WIDTH;
}
export function EventsView({ language = 'en', context = 'work', onNotice, requestedEventId, onRequestedEventHandled, requestedNodeId, onRequestedNodeHandled }: EventsViewProps) {
  const t = TEXT[language];
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  // UX S9: optional built-in mind-map template forked into the new event.
  const [newTemplateId, setNewTemplateId] = useState<string>('');
  const eventsQ = useEvents();
  const createEvent = useCreateEvent();
  const seedTemplate = useSeedEventTemplate();
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
      if (newTemplateId && created.mindmapId) {
        try {
          await seedTemplate.mutateAsync({ eventId: created.id, mindmapId: created.mindmapId, templateId: newTemplateId, language });
        } catch { /* template seeding is best-effort; the event itself exists */ }
      }
      setNewTemplateId('');
      setCreating(false);
      setSelectedEventId(created.id);
      onNotice?.(language === 'zh' ? '事件已创建' : 'Event created', 'success');
    } catch (error) {
      onNotice?.(error instanceof Error ? error.message : t.loadError, 'error');
    }
  }

  if (selectedEventId) {
    return <EventDetailView eventId={selectedEventId} language={language} onBack={() => setSelectedEventId(null)} onNotice={onNotice} onRequestedEventHandled={onRequestedEventHandled} requestedNodeId={requestedNodeId} onRequestedNodeHandled={onRequestedNodeHandled} />;
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
          <div className="mx-auto mt-2.5 flex max-w-4xl flex-wrap items-center gap-1.5" data-testid="new-event-templates">
            <span className="text-[11px] text-gray-400">{language === 'zh' ? '从模板开始：' : 'Start from:'}</span>
            <button type="button" onClick={() => setNewTemplateId('')} aria-pressed={newTemplateId === ''} className={`rounded-md border px-2 py-1 text-[11px] transition-colors ${newTemplateId === '' ? 'border-[#23877B] bg-[#23877B]/10 text-[#23877B]' : 'border-gray-300 text-gray-500 hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800'}`} data-testid="new-event-template-blank">{language === 'zh' ? '空白' : 'Blank'}</button>
            {MINDMAP_TEMPLATES.map((template) => (
              <button key={template.id} type="button" onClick={() => setNewTemplateId(template.id)} aria-pressed={newTemplateId === template.id} title={language === 'zh' ? template.hint : template.hintEn} className={`rounded-md border px-2 py-1 text-[11px] transition-colors ${newTemplateId === template.id ? 'border-[#23877B] bg-[#23877B]/10 text-[#23877B]' : 'border-gray-300 text-gray-500 hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800'}`} data-testid={`new-event-template-${template.id}`}>{language === 'zh' ? template.title : template.titleEn}</button>
            ))}
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

function EventDetailView({ eventId, language, onBack, onNotice, onRequestedEventHandled, requestedNodeId, onRequestedNodeHandled }: { eventId: string; language: 'en' | 'zh'; onBack: () => void; onNotice?: EventsViewProps['onNotice']; onRequestedEventHandled?: () => void; requestedNodeId?: string | null; onRequestedNodeHandled?: () => void }) {
  const t = TEXT[language];
  const detailQ = useEventById(eventId);
  const addChild = useAddEventChild();
  const addSibling = useAddEventSibling();
  const rename = useRenameEventNode();
  const deleteNode = useDeleteEventNode();
  const outdent = useOutdentEventNode();
  const moveNode = useMoveEventNode();
  const reorderNode = useReorderEventNode();
  const updateNodePosition = useUpdateNodePosition();
  const layoutTree = useLayoutEventTree();
  const schedule = useScheduleEventNode();
  const unschedule = useUnscheduleEventNode();
  const complete = useCompleteNodeTask();
  const reopen = useUndoCompleteNodeTask();
  const applyOrganize = useApplyOrganizeSuggestion();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  // UX S9: AI organize (folded in from the orphan MindMapView).
  const [organizeOpen, setOrganizeOpen] = useState(false);
  const [organizeStrategy, setOrganizeStrategy] = useState<OrganizeStrategy | null>(null);
  const [organizeSuggestion, setOrganizeSuggestion] = useState<OrganizeSuggestion | null>(null);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());
  const [agentPanelOpen, setAgentPanelOpen] = useState(false);
  const [contextPreviewOpen, setContextPreviewOpen] = useState(false);
  const [runContextRefs, setRunContextRefs] = useState<ContextRef[]>([]);
  const [autoStartRun, setAutoStartRun] = useState(false);
  const [graphProposal, setGraphProposal] = useState<EventGraphProposal | null>(null);
  const [proposalSelection, setProposalSelection] = useState<Set<string>>(() => new Set());
  const [activeProposalChangeId, setActiveProposalChangeId] = useState<string | null>(null);
  const [recoverableRun, setRecoverableRun] = useState<EventOperatorRun | null>(null);
  const [outlineVisible, setOutlineVisible] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const raw = window.localStorage.getItem(OUTLINE_VISIBILITY_KEY);
    return raw === null ? true : raw === 'true';
  });
  const splitRef = useRef<HTMLDivElement>(null);
  const [outlineWidth, setOutlineWidth] = useState(readOutlineWidth);
  const [outlineResizing, setOutlineResizing] = useState(false);
  const event = detailQ.data?.event;
  const matches = useMemo(() => event?.nodes.filter((node) => node.text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) ?? [], [event?.nodes, query]);

  // A saved outline width can become invalid when the app window or the main
  // sidebar changes size. Re-clamp it whenever the split container is resized
  // so the canvas always retains a useful working area.
  useEffect(() => {
    const split = splitRef.current;
    if (!split) return;
    const clampToContainer = () => {
      const containerWidth = split.clientWidth || window.innerWidth;
      const max = Math.max(OUTLINE_MIN_WIDTH, containerWidth - CANVAS_MIN_WIDTH);
      setOutlineWidth((current) => {
        const next = Math.min(max, Math.max(OUTLINE_MIN_WIDTH, current));
        if (next !== current) {
          try { window.localStorage.setItem(OUTLINE_WIDTH_KEY, String(next)); } catch { /* optional preference */ }
        }
        return next;
      });
    };
    clampToContainer();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(clampToContainer);
      observer.observe(split);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', clampToContainer);
    return () => window.removeEventListener('resize', clampToContainer);
  }, []);

  // ---------------------------------------------------------------------------
  // Undo / redo (UX_DESIGN §4.3 — ⌘Z / ⇧⌘Z, 50 steps). Two stacks of *full*
  // MindMap snapshots, taken just before each map-writing mutation. Snapshots
  // come from the lossless mindMapCache — the EventDetail projection drops
  // kind/taskId/taskDate/planOrder, so restoring from it would strip task
  // bindings. Undo/redo restore via one PUT /mindmaps/:id each, so a whole
  // undo step is a single entry in the server's own history too.
  // ---------------------------------------------------------------------------
  const qc = useQueryClient();
  const HISTORY_LIMIT = 50;
  const pastRef = useRef<MindMap[]>([]);
  const futureRef = useRef<MindMap[]>([]);
  const [, setHistoryVersion] = useState(0);
  useEffect(() => {
    // Switching events starts a fresh history for the new canvas.
    pastRef.current = [];
    futureRef.current = [];
    setHistoryVersion((v) => v + 1);
  }, [eventId]);

  const recordHistory = useCallback(async (): Promise<boolean> => {
    if (!event) return false;
    try {
      const map = await readEventMap(qc, event.mindmapId);
      const top = pastRef.current[pastRef.current.length - 1];
      if (top && top.rootId === map.rootId
        && JSON.stringify(top.nodes) === JSON.stringify(map.nodes)
        && JSON.stringify(top.edges) === JSON.stringify(map.edges)) return false;
      pastRef.current.push(map);
      while (pastRef.current.length > HISTORY_LIMIT) pastRef.current.shift();
      futureRef.current = [];
      setHistoryVersion((v) => v + 1);
      return true;
    } catch { /* snapshot is best-effort — never block the edit itself */ return false; }
  }, [event, qc]);

  const restoreMap = useCallback(async (snap: MindMap) => {
    const updated = await mindmapsApi.update(snap.id, {
      title: snap.title, rootId: snap.rootId, nodes: snap.nodes, edges: snap.edges,
    });
    writeEventMap(qc, updated);
    qc.invalidateQueries({ queryKey: queryKeys.event(eventId) });
    qc.invalidateQueries({ queryKey: queryKeys.eventsRoot() });
    qc.invalidateQueries({ queryKey: queryKeys.todayItemsRoot() });
    qc.invalidateQueries({ queryKey: queryKeys.tasksRoot() });
    qc.invalidateQueries({ queryKey: queryKeys.standaloneTasks() });
    qc.invalidateQueries({ queryKey: queryKeys.topicSpacesRoot(), exact: false });
  }, [eventId, qc]);

  const undo = useCallback(async () => {
    const prev = pastRef.current[pastRef.current.length - 1];
    if (!prev || !event) return;
    try {
      const current = await readEventMap(qc, event.mindmapId);
      pastRef.current.pop();
      futureRef.current.push(current);
      setHistoryVersion((v) => v + 1);
      await restoreMap(prev);
      onNotice?.(language === 'zh' ? '已撤销' : 'Undone', 'info');
    } catch (error) {
      onNotice?.(error instanceof Error ? error.message : t.loadError, 'error');
    }
  }, [event, qc, language, onNotice, restoreMap, t.loadError]);

  const redo = useCallback(async () => {
    const next = futureRef.current[futureRef.current.length - 1];
    if (!next || !event) return;
    try {
      const current = await readEventMap(qc, event.mindmapId);
      futureRef.current.pop();
      pastRef.current.push(current);
      setHistoryVersion((v) => v + 1);
      await restoreMap(next);
      onNotice?.(language === 'zh' ? '已重做' : 'Redone', 'info');
    } catch (error) {
      onNotice?.(error instanceof Error ? error.message : t.loadError, 'error');
    }
  }, [event, qc, language, onNotice, restoreMap, t.loadError]);

  const canUndo = pastRef.current.length > 0;
  const canRedo = futureRef.current.length > 0;

  // UX_DESIGN §4.3 canvas shortcuts: ⌘F search, ⌘Z undo, ⇧⌘Z / ⌘Y redo.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      const key = e.key.toLowerCase();
      if (key === 'z' && !typing) {
        e.preventDefault();
        if (e.shiftKey) void redo(); else void undo();
      } else if (key === 'y' && !typing) {
        e.preventDefault();
        void redo();
      } else if (key === 'f') {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  // UX S8: when opened from a Today "来自 ↗" chip, highlight the origin node.
  useEffect(() => {
    if (!event || !requestedNodeId) return;
    if (!event.nodes.some((node) => node.id === requestedNodeId)) return;
    setActiveNodeId(requestedNodeId);
    onRequestedNodeHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id, event?.nodes, requestedNodeId]);

  useEffect(() => {
    if (!event) return;
    const key = `dailyflow:event-operator-context:${event.id}`;
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return;
      sessionStorage.removeItem(key);
      const parsed = JSON.parse(raw) as { contextRefs?: ContextRef[] };
      setRunContextRefs(parsed.contextRefs ?? []);
      setContextPreviewOpen(true);
    } catch { /* optional navigation handoff */ }
  }, [event?.id]);

  useEffect(() => {
    if (!event) return;
    let live = true;
    Promise.all([getPendingGraphProposal(event.id), listEventOperatorRuns(event.id)]).then(([pending, runs]) => {
      if (!live) return;
      const latest = runs.items[0] ?? null;
      if (pending.proposal) { setGraphProposal(pending.proposal); setRecoverableRun(latest); }
      else if (latest && ['queued', 'starting', 'running', 'waiting_review', 'applying', 'failed'].includes(latest.status)) setRecoverableRun(latest);
    }).catch(() => {});
    return () => { live = false; };
  }, [event?.id]);

  const toggleOutline = useCallback(() => {
    setOutlineVisible((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') window.localStorage.setItem(OUTLINE_VISIBILITY_KEY, String(next));
      return next;
    });
  }, []);

  // Cmd/Ctrl+B — toggle the outline (common mind-notes / notepad shortcut).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta || e.altKey || e.shiftKey) return;
      if (e.key.toLowerCase() !== 'b') return;
      const target = e.target as HTMLElement | null;
      if (target && (target.matches('input, textarea, [contenteditable="true"]') || target.closest('input, textarea, [contenteditable="true"]'))) return;
      e.preventDefault();
      toggleOutline();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleOutline]);

  const toggleCollapse = useCallback((nodeId: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  // Default active node to root once event loads.
  useEffect(() => {
    if (event && !activeNodeId) {
      setActiveNodeId(event.rootNodeId);
    }
  }, [event, activeNodeId]);

  // If the active node disappears (deleted), fall back to root.
  useEffect(() => {
    if (event && activeNodeId && !event.nodes.some((n) => n.id === activeNodeId)) {
      setActiveNodeId(event.rootNodeId);
    }
  }, [event, activeNodeId]);

  const activateNode = (id: string) => setActiveNodeId(id);

  async function safe<T>(action: () => Promise<T>, success?: string, history = true): Promise<T | undefined> {
    let pushed = false;
    try {
      if (history) pushed = await recordHistory();
      const result = await action();
      if (success) onNotice?.(success, 'success');
      return result;
    }
    catch (error) {
      if (pushed) { pastRef.current.pop(); }
      onNotice?.(error instanceof Error ? error.message : t.loadError, 'error');
      return undefined;
    }
  }

  async function handleAddChild(parentId: string, text: string) {
    const nodeId = `node_${ulid()}`;
    setActiveNodeId(nodeId);
    await safe(() => addChild.mutateAsync({ eventId, mindmapId: event!.mindmapId, parentId, text, nodeId }));
    return nodeId;
  }

  async function handleAddSibling(referenceId: string, text: string) {
    const nodeId = `node_${ulid()}`;
    setActiveNodeId(nodeId);
    await safe(() => addSibling.mutateAsync({ eventId, mindmapId: event!.mindmapId, referenceId, text, nodeId }));
    return nodeId;
  }

  async function handleRename(nodeId: string, text: string) {
    await safe(() => rename.mutateAsync({ eventId, mindmapId: event!.mindmapId, nodeId, text }));
  }

  async function handleDelete(nodeId: string) {
    await safe(() => deleteNode.mutateAsync({ eventId, mindmapId: event!.mindmapId, nodeId }));
  }

  async function handleOutdent(nodeId: string) {
    await safe(() => outdent.mutateAsync({ eventId, mindmapId: event!.mindmapId, nodeId }));
  }

  async function handleMoveNode(nodeId: string, newParentId: string) {
    await safe(() => moveNode.mutateAsync({ eventId, mindmapId: event!.mindmapId, nodeId, newParentId }));
  }

  async function handleMoveNodePosition(nodeId: string, x: number, y: number) {
    await safe(() => updateNodePosition.mutateAsync({ eventId, mindmapId: event!.mindmapId, nodeId, x, y }));
  }

  async function handleReorderNode(nodeId: string, direction: 'up' | 'down') {
    await safe(() => reorderNode.mutateAsync({ eventId, mindmapId: event!.mindmapId, nodeId, direction }));
  }

  async function handleSchedule(node: EventNode, date: string) {
    await safe(() => schedule.mutateAsync({ eventId, mindmapId: event!.mindmapId, nodeId: node.id, date, taskId: node.execution?.taskId, fromDate: node.execution?.scheduledDate }), language === 'zh' ? '已安排' : 'Scheduled');
  }

  async function handleUnschedule(node: EventNode) {
    const execution = node.execution;
    if (!execution) return;
    await safe(() => unschedule.mutateAsync({ eventId, mindmapId: event!.mindmapId, nodeId: node.id, taskId: execution.taskId, scheduledDate: execution.scheduledDate }), language === 'zh' ? '已移出日程' : 'Removed from day');
  }

  async function handleToggleDone(node: EventNode) {
    if (!node.execution) return;
    const input = { taskId: node.execution.taskId, scheduledDate: node.execution.scheduledDate, eventId, nodeId: node.id };
    if (node.execution.status === 'done') {
      await safe(() => reopen.mutateAsync(input), undefined, false);
    } else {
      await safe(() => complete.mutateAsync(input), undefined, false);
    }
  }

  async function runOrganize(strategy: OrganizeStrategy) {
    if (!event) return;
    setOrganizeStrategy(strategy);
    try {
      const suggestion = await organizeApi.organize(event.mindmapId, strategy);
      setOrganizeSuggestion(suggestion);
      setOrganizeOpen(true);
    } catch (error) {
      onNotice?.(language === 'zh'
        ? `AI 整理失败：${error instanceof Error ? error.message : '未知错误'}`
        : `AI organize failed: ${error instanceof Error ? error.message : 'unknown error'}`, 'error');
    }
  }

  async function handleApplyOrganize(suggestion: OrganizeSuggestion) {
    if (!event) return;
    try {
      await recordHistory();
      const result = await applyOrganize.mutateAsync({ eventId: event.id, mindmapId: event.mindmapId, suggestion });
      setOrganizeOpen(false);
      setOrganizeSuggestion(null);
      setOrganizeStrategy(null);
      if (result.applied) {
        onNotice?.(language === 'zh'
          ? `AI 整理完成：${suggestion.stats.organizedNodes} 个节点 → ${suggestion.stats.groupCount} 组`
          : `AI organize applied: ${suggestion.stats.organizedNodes} nodes → ${suggestion.stats.groupCount} groups`, 'success');
      }
    } catch (error) {
      onNotice?.(error instanceof Error ? error.message : t.loadError, 'error');
    }
  }

  if (detailQ.isLoading) return <CenteredState icon={<Loader2 className="h-5 w-5 animate-spin" />} text={t.loading} />;
  if (!event) return <CenteredState text={t.missing} />;
  if (event.integrity.missingMap) return <CenteredState text={t.missing} />;

  const focusedNodeId = query && matches.length ? matches[0].id : null;

  return <section className="flex h-full min-h-0 flex-col" data-testid="event-detail">
    {recoverableRun && <button type="button" onClick={() => setAgentPanelOpen(true)} className="flex items-center justify-between border-b border-amber-200 bg-amber-50 px-5 py-2 text-left text-xs text-amber-900" data-testid="agent-run-recovery-banner"><span>{language === 'zh' ? `发现可恢复的 AI Run：${recoverableRun.status === 'waiting_review' ? '建议等待审阅' : recoverableRun.error?.message ?? recoverableRun.status}` : `Resumable AI run: ${recoverableRun.status === 'waiting_review' ? 'proposal awaiting review' : recoverableRun.error?.message ?? recoverableRun.status}`}</span><span className="font-semibold">{language === 'zh' ? '恢复' : 'Resume'} →</span></button>}
    <header className="relative z-20 flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-[#101514]">
      <button onClick={onBack} aria-label={t.back} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"><ArrowLeft className="h-4 w-4" /></button>
      <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-gray-950 dark:text-gray-50">{event.title}</h1>
      <button
        type="button"
        onClick={() => setContextPreviewOpen(true)}
        title={language === 'zh' ? 'AI 推进这个事件' : 'AI push this event forward'}
        aria-label={language === 'zh' ? 'AI 推进' : 'AI push forward'}
        className="flex items-center gap-1.5 rounded-lg border border-[#23877B]/30 bg-[#23877B]/5 px-3 py-2 text-sm font-medium text-[#23877B] hover:bg-[#23877B]/10"
        data-testid="event-agent-run-open"
      >
        <Sparkles className="h-4 w-4" />
        {language === 'zh' ? 'AI 推进' : 'AI'}
      </button>
      <button
        type="button"
        onClick={() => void undo()}
        disabled={!canUndo}
        title={`${t.undo} (⌘Z)`}
        aria-label={t.undo}
        className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-gray-800"
        data-testid="event-undo"
      >
        <Undo2 className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => void redo()}
        disabled={!canRedo}
        title={`${t.redo} (⇧⌘Z)`}
        aria-label={t.redo}
        className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-gray-800"
        data-testid="event-redo"
      >
        <Redo2 className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={toggleOutline}
        title={outlineVisible ? t.hideOutline : t.showOutline}
        aria-label={outlineVisible ? t.hideOutline : t.showOutline}
        aria-pressed={outlineVisible}
        className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
        data-testid="event-outline-toggle"
      >
        {outlineVisible ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
      </button>
      {searchOpen ? <div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" /><input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.search} aria-label={t.search} className="w-56 rounded-lg border border-gray-200 bg-transparent py-2 pl-8 pr-8 text-sm outline-none focus:border-[#23877B] dark:border-gray-700" /><button onClick={() => { setSearchOpen(false); setQuery(''); }} className="absolute right-2 top-2 p-0.5 text-gray-400" aria-label="Close search"><X className="h-4 w-4" /></button>{query && matches.length === 0 && <div className="absolute right-0 top-11 w-56 rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-400 shadow-lg dark:border-gray-700 dark:bg-gray-900">{t.noMatch}</div>}</div> : <button onClick={() => setSearchOpen(true)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" aria-label={t.search}><Search className="h-4 w-4" /></button>}
      <div className="relative"><button onClick={() => setMoreOpen((value) => !value)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" aria-label={t.more}><MoreHorizontal className="h-4 w-4" /></button>{moreOpen && <div className="absolute right-0 top-10 w-44 rounded-xl border border-gray-200 bg-white p-2 text-xs text-gray-500 shadow-lg dark:border-gray-700 dark:bg-gray-900">{event.progress.total ? `${event.progress.done} / ${event.progress.total}` : t.noActions}</div>}</div>
    </header>
    <div ref={splitRef} className="min-h-0 flex-1 flex" data-testid="event-split-view">
      <div
        className={`relative shrink-0 ${outlineResizing ? '' : 'transition-[width] duration-200'} ${outlineVisible ? '' : 'w-0 overflow-hidden border-r-0'}`}
        style={outlineVisible ? { width: outlineWidth } : undefined}
        data-testid="event-outline-pane"
        data-visible={outlineVisible}
      >
        <EventOutline
          event={event}
          language={language}
          selectedId={activeNodeId}
          editingId={activeNodeId}
          collapsedIds={collapsedIds}
          onToggleCollapse={toggleCollapse}
          onSelect={activateNode}
          onStartEdit={activateNode}
          onCommitEdit={() => {}}
          onRename={handleRename}
          onAddChild={handleAddChild}
          onAddSibling={handleAddSibling}
          onOutdent={handleOutdent}
          onDelete={handleDelete}
          onMoveNode={handleMoveNode}
          onReorderNode={handleReorderNode}
          onScheduleTask={handleSchedule}
        />
        {outlineVisible && (
          <ResizeHandle
            label={language === 'zh' ? '调整大纲宽度' : 'Resize outline'}
            value={outlineWidth}
            min={OUTLINE_MIN_WIDTH}
            max={Math.max(OUTLINE_MIN_WIDTH, (splitRef.current?.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 1024)) - CANVAS_MIN_WIDTH)}
            defaultValue={OUTLINE_DEFAULT_WIDTH}
            onResize={(delta) => {
              setOutlineWidth((current) => {
                const containerWidth = splitRef.current?.clientWidth || window.innerWidth;
                const max = Math.max(OUTLINE_MIN_WIDTH, containerWidth - CANVAS_MIN_WIDTH);
                const next = Math.min(max, Math.max(OUTLINE_MIN_WIDTH, current + delta));
                try { window.localStorage.setItem(OUTLINE_WIDTH_KEY, String(next)); } catch { /* optional preference */ }
                return next;
              });
            }}
            onResizeStart={() => setOutlineResizing(true)}
            onResizeEnd={() => setOutlineResizing(false)}
            testId="event-outline-resize-handle"
          />
        )}
      </div>
      <div className="min-h-0 min-w-0 flex-1">
        <EventCanvas
          event={event}
          language={language}
          activeNodeId={activeNodeId}
          focusedNodeId={focusedNodeId}
          collapsedIds={collapsedIds}
          onToggleCollapse={toggleCollapse}
          onActivate={activateNode}
          onCommit={() => {}}
          onAddChild={handleAddChild}
          onAddSibling={handleAddSibling}
          onRename={handleRename}
          onDelete={handleDelete}
          onSchedule={handleSchedule}
          onUnschedule={handleUnschedule}
          onToggleDone={handleToggleDone}
          onMoveNodePosition={handleMoveNodePosition}
          onRequestTreeLayout={() => void layoutTree.mutateAsync({ eventId, mindmapId: event.mindmapId }).catch(() => {})}
          onOrganize={(strategy) => void runOrganize(strategy)}
          organizeBusy={applyOrganize.isPending}
          proposal={graphProposal}
          proposalSelection={proposalSelection}
          activeProposalChangeId={activeProposalChangeId}
          onSelectProposalChange={(changeId) => { setActiveProposalChangeId(changeId); setAgentPanelOpen(true); }}
        />
      </div>
    </div>
    {agentPanelOpen && (
      <AgentRunPanel
        language={language}
        eventId={event.id}
        mindmapId={event.mindmapId}
        initialContextRefs={runContextRefs}
        autoStart={autoStartRun}
        onNotice={onNotice}
        onApplied={() => { void detailQ.refetch(); }}
        onBeforeApply={recordHistory}
        onClose={() => { setAgentPanelOpen(false); setAutoStartRun(false); }}
        onProposalChange={(proposal, selection, activeChangeId) => { setGraphProposal(proposal); setProposalSelection(new Set(selection)); setActiveProposalChangeId(activeChangeId); }}
      />
    )}
    {contextPreviewOpen && <EventOperatorContextPreview event={event} language={language} defaultRefs={runContextRefs} onCancel={() => setContextPreviewOpen(false)} onConfirm={(refs) => { setRunContextRefs(refs); setAutoStartRun(true); setContextPreviewOpen(false); setAgentPanelOpen(true); }} />}
    {organizeOpen && (
      <OrganizeSuggestionModal
        open={organizeOpen}
        strategy={organizeStrategy}
        suggestion={organizeSuggestion}
        language={language}
        onApply={handleApplyOrganize}
        onClose={() => { setOrganizeOpen(false); setOrganizeSuggestion(null); setOrganizeStrategy(null); }}
      />
    )}
  </section>;
}

function CenteredState({ icon, text }: { icon?: React.ReactNode; text: string }) { return <div className="flex h-full min-h-64 items-center justify-center gap-2 text-sm text-gray-400">{icon}{text}</div>; }
function formatDate(value: string, language: 'en' | 'zh') { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en', { month: 'short', day: 'numeric' }).format(date); }
