import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Check, ChevronDown, Minus, MoreHorizontal, Plus, Trash2, X } from 'lucide-react';
import type { EventDetail, EventNode } from '../../../api/client';
import { getTodayStr } from '../../../utils/tagColors';

type Copy = {
  child: string;
  sibling: string;
  addChild: string;
  addSibling: string;
  today: string;
  date: string;
  more: string;
  addStep: string;
  addFirstStep: string;
  cancel: string;
  removeDay: string;
  deleteNode: string;
  empty: string;
  hint: string;
};

const COPY: Record<'en' | 'zh', Copy> = {
  en: {
    child: 'Child',
    sibling: 'Sibling',
    addChild: 'Add child',
    addSibling: 'Add sibling',
    today: 'Today',
    date: 'Date',
    more: 'More',
    addStep: 'Add step',
    addFirstStep: 'First step…',
    cancel: 'Cancel',
    removeDay: 'Remove from day',
    deleteNode: 'Delete node',
    empty: 'Start by adding the first step.',
    hint: 'Tab child · Enter edit · ↑↓ navigate',
  },
  zh: {
    child: '子节点',
    sibling: '同级',
    addChild: '添加子节点',
    addSibling: '添加同级',
    today: '今天',
    date: '日期',
    more: '更多',
    addStep: '添加步骤',
    addFirstStep: '第一个步骤…',
    cancel: '取消',
    removeDay: '移出日程',
    deleteNode: '删除节点',
    empty: '从添加第一个步骤开始。',
    hint: 'Tab 子节点 · Enter 编辑 · ↑↓ 移动',
  },
};

interface EventCanvasProps {
  event: EventDetail;
  language: 'en' | 'zh';
  focusedNodeId?: string | null;
  onAddChild: (parentId: string, text: string) => Promise<string>;
  onAddSibling: (referenceId: string, text: string) => Promise<string>;
  onRename: (nodeId: string, text: string) => Promise<void>;
  onSchedule: (node: EventNode, date: string) => Promise<void>;
  onUnschedule: (node: EventNode) => Promise<void>;
  onToggleDone: (node: EventNode) => Promise<void>;
  onDelete: (nodeId: string) => Promise<void>;
}

const NODE_W = 196;
const NODE_H = 58;
const GAP_Y = 104;

export function EventCanvas({
  event,
  language,
  focusedNodeId,
  onAddChild,
  onAddSibling,
  onRename,
  onSchedule,
  onUnschedule,
  onToggleDone,
  onDelete,
}: EventCanvasProps) {
  const copy = COPY[language];
  const [selectedId, setSelectedId] = useState<string | null>(event.rootNodeId);
  const [addingChild, setAddingChild] = useState(false);
  const [childText, setChildText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [dateOpen, setDateOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pendingEditNodeId, setPendingEditNodeId] = useState<string | null>(null);
  const editInputRef = useRef<HTMLInputElement | null>(null);

  async function run<T>(action: () => Promise<T>): Promise<T | undefined> {
    if (busy) return undefined;
    setBusy(true);
    try {
      return await action();
    } finally {
      setBusy(false);
    }
  }

  // Keep selection valid when the underlying event changes.
  useEffect(() => {
    if (focusedNodeId && event.nodes.some((node) => node.id === focusedNodeId)) {
      setSelectedId(focusedNodeId);
    }
  }, [event.nodes, focusedNodeId]);

  useEffect(() => {
    if (selectedId && !event.nodes.some((node) => node.id === selectedId)) {
      setSelectedId(event.rootNodeId);
    }
  }, [event.nodes, event.rootNodeId, selectedId]);

  // When a newly created node lands in the fetched event, select it and start editing.
  useEffect(() => {
    if (!pendingEditNodeId) return;
    const node = event.nodes.find((n) => n.id === pendingEditNodeId);
    if (!node) return;
    setSelectedId(node.id);
    setEditingId(node.id);
    setEditText(node.text);
    setPendingEditNodeId(null);
  }, [event.nodes, pendingEditNodeId]);

  // Focus the edit input whenever we enter edit mode.
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  const normalized = useMemo(() => {
    if (!event.nodes.length) return { nodes: [], width: 900, height: 560 };
    const minX = Math.min(...event.nodes.map((node) => node.position.x));
    const minY = Math.min(...event.nodes.map((node) => node.position.y));
    const maxX = Math.max(...event.nodes.map((node) => node.position.x));
    const maxY = Math.max(...event.nodes.map((node) => node.position.y));
    return {
      nodes: event.nodes.map((node) => ({ ...node, canvasX: node.position.x - minX + 110, canvasY: node.position.y - minY + 110 })),
      width: Math.max(900, maxX - minX + NODE_W + 220),
      height: Math.max(560, maxY - minY + NODE_H + 220),
    };
  }, [event.nodes]);

  const byId = useMemo(() => new Map(normalized.nodes.map((node) => [node.id, node])), [normalized.nodes]);
  const childrenByParent = useMemo(() => {
    const map = new Map<string, EventNode[]>();
    for (const edge of event.edges) {
      const child = event.nodes.find((n) => n.id === edge.target);
      if (!child) continue;
      const siblings = map.get(edge.source) ?? [];
      siblings.push(child);
      map.set(edge.source, siblings);
    }
    for (const siblings of map.values()) {
      siblings.sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
    }
    return map;
  }, [event.edges, event.nodes]);
  const parentByChild = useMemo(() => {
    const map = new Map<string, string>();
    for (const edge of event.edges) map.set(edge.target, edge.source);
    return map;
  }, [event.edges]);

  const selected = event.nodes.find((node) => node.id === selectedId) ?? null;
  const isRoot = selected?.id === event.rootNodeId;
  const today = getTodayStr();
  const hasOnlyRoot = event.nodes.length <= 1;

  async function submitChild() {
    if (!selected || !childText.trim()) return;
    const nodeId = await run(() => onAddChild(selected.id, childText.trim()));
    if (nodeId) {
      setChildText('');
      setAddingChild(false);
      setPendingEditNodeId(nodeId);
    }
  }

  async function submitRename(node: EventNode, then?: 'sibling' | 'child') {
    const trimmed = editText.trim();
    if (!trimmed || trimmed === node.text) {
      setEditingId(null);
      return;
    }
    await run(() => onRename(node.id, trimmed));
    setEditingId(null);
    if (!then) return;
    if (then === 'sibling' && !isRoot) {
      const nodeId = await run(() => onAddSibling(node.id, ''));
      if (nodeId) setPendingEditNodeId(nodeId);
    } else if (then === 'child') {
      const nodeId = await run(() => onAddChild(node.id, ''));
      if (nodeId) setPendingEditNodeId(nodeId);
    }
  }

  async function addSiblingAfter(node: EventNode) {
    const nodeId = await run(() => onAddSibling(node.id, ''));
    if (nodeId) setPendingEditNodeId(nodeId);
  }

  async function addChildTo(node: EventNode) {
    const nodeId = await run(() => onAddChild(node.id, ''));
    if (nodeId) setPendingEditNodeId(nodeId);
  }

  async function removeNode(nodeId: string) {
    await run(() => onDelete(nodeId));
  }

  function selectNextSibling(direction: 1 | -1) {
    if (!selected) return;
    const parentId = parentByChild.get(selected.id) ?? '';
    const siblings = childrenByParent.get(parentId) ?? [];
    const idx = siblings.findIndex((n) => n.id === selected.id);
    if (idx === -1) return;
    const next = siblings[idx + direction];
    if (next) setSelectedId(next.id);
  }

  function selectParent() {
    if (!selected) return;
    const parentId = parentByChild.get(selected.id);
    if (parentId) setSelectedId(parentId);
  }

  function selectFirstChild() {
    if (!selected) return;
    const children = childrenByParent.get(selected.id);
    if (children?.length) setSelectedId(children[0].id);
  }

  function handleEditKeyDown(e: React.KeyboardEvent<HTMLInputElement>, node: EventNode) {
    if (e.key === 'Escape') {
      e.preventDefault();
      setEditingId(null);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const trimmed = editText.trim();
      if (!trimmed) {
        setEditingId(null);
        return;
      }
      if (e.metaKey || e.ctrlKey) {
        void submitRename(node, 'child');
      } else {
        void submitRename(node, isRoot ? 'child' : 'sibling');
      }
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      void submitRename(node, 'child');
    }
  }

  function handleCanvasKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, button')) return;
    if (!selected) return;

    if (event.key === 'Tab') {
      event.preventDefault();
      void addChildTo(selected);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      setEditingId(selected.id);
      setEditText(selected.text);
      return;
    }
    if (event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      setEditingId(selected.id);
      setEditText(selected.text);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      selectNextSibling(-1);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      selectNextSibling(1);
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      selectParent();
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      selectFirstChild();
      return;
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && !isRoot) {
      event.preventDefault();
      void removeNode(selected.id);
    }
  }

  async function submitFirstStep(text: string) {
    const nodeId = await run(() => onAddChild(event.rootNodeId, text));
    if (nodeId) setPendingEditNodeId(nodeId);
  }

  return (
    <div
      className="relative h-full min-h-0 overflow-auto bg-[#f8faf9] outline-none dark:bg-[#111716]"
      data-testid="event-canvas"
      tabIndex={0}
      onKeyDown={handleCanvasKeyDown}
      onClick={() => { setMoreOpen(false); setDateOpen(false); }}
    >
      <div className="sticky right-4 top-4 z-10 float-right mr-4 flex w-fit items-center rounded-lg border border-gray-200 bg-white p-1 shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <button type="button" onClick={() => setZoom((value) => Math.max(0.6, Number((value - 0.1).toFixed(1))))} className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Zoom out"><Minus className="h-4 w-4" /></button>
        <button type="button" onClick={() => setZoom(1)} className="min-w-10 rounded-md px-1.5 py-1 text-[11px] text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Reset zoom">{Math.round(zoom * 100)}%</button>
        <button type="button" onClick={() => setZoom((value) => Math.min(1.4, Number((value + 0.1).toFixed(1))))} className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Zoom in"><Plus className="h-4 w-4" /></button>
      </div>

      <div className="relative origin-top-left" style={{ width: normalized.width, height: normalized.height, transform: `scale(${zoom})` }}>
        <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
          {event.edges.map((edge) => {
            const source = byId.get(edge.source);
            const target = byId.get(edge.target);
            if (!source || !target) return null;
            const x1 = source.canvasX + NODE_W;
            const y1 = source.canvasY + NODE_H / 2;
            const x2 = target.canvasX;
            const y2 = target.canvasY + NODE_H / 2;
            return <path key={edge.id} d={`M ${x1} ${y1} C ${x1 + 70} ${y1}, ${x2 - 70} ${y2}, ${x2} ${y2}`} fill="none" stroke="currentColor" className="text-gray-400 dark:text-gray-600" strokeWidth="2" />;
          })}
        </svg>

        {normalized.nodes.map((node) => {
          const isSelected = selectedId === node.id;
          const isDone = node.execution?.status === 'done';
          const isEventRoot = node.id === event.rootNodeId;
          return (
            <div key={node.id} className="absolute" style={{ left: node.canvasX, top: node.canvasY, width: NODE_W }} data-testid={`event-node-${node.id}`}>
              <div className="group relative">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setSelectedId(node.id); setAddingChild(false); setDateOpen(false); setMoreOpen(false); }}
                  onDoubleClick={() => { setEditingId(node.id); setEditText(node.text); }}
                  className={`flex min-h-[58px] w-full items-center gap-2 rounded-xl border px-3 py-2 text-left transition ${isSelected ? 'border-[#23877B] bg-white ring-2 ring-[#23877B]/15 dark:bg-gray-900' : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-900'} ${isEventRoot ? 'font-semibold' : ''} ${isSelected ? 'shadow-sm' : 'shadow-none'}`}
                  aria-pressed={isSelected}
                >
                  {node.execution && (
                    <span
                      role="checkbox"
                      aria-checked={isDone}
                      aria-label={isDone ? 'Reopen' : 'Complete'}
                      onClick={(e) => { e.stopPropagation(); void run(() => onToggleDone(node)); }}
                      className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${isDone ? 'border-[#23877B] bg-[#23877B] text-white' : 'border-gray-300 dark:border-gray-600'}`}
                    >{isDone && <Check className="h-3 w-3" />}</span>
                  )}
                  {editingId === node.id ? (
                    <input
                      ref={editInputRef}
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={() => void submitRename(node)}
                      onKeyDown={(e) => handleEditKeyDown(e, node)}
                      className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                      aria-label="Node title"
                    />
                  ) : (
                    <span className={`min-w-0 flex-1 text-sm leading-5 text-gray-900 dark:text-gray-100 ${isDone ? 'line-through opacity-60' : ''}`}>{node.text}</span>
                  )}
                  {node.execution && <span className="shrink-0 text-[10px] text-gray-400">{node.execution.scheduledDate.slice(5)}</span>}
                </button>

                {/* Inline add buttons — visible on hover / focus. */}
                {!editingId && (
                  <>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); void addChildTo(node); }}
                      className="absolute -right-3 top-1/2 z-20 hidden h-6 w-6 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full border border-[#23877B] bg-white text-[#23877B] shadow-sm hover:bg-[#23877B] hover:text-white group-hover:flex dark:border-[#23877B] dark:bg-gray-900"
                      aria-label={copy.child}
                      title={copy.child}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    {!isEventRoot && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); void addSiblingAfter(node); }}
                        className="absolute bottom-0 left-1/2 z-20 hidden h-6 w-6 -translate-x-1/2 translate-y-1/2 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-600 shadow-sm hover:border-[#23877B] hover:text-[#23877B] group-hover:flex dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300"
                        aria-label={copy.sibling}
                        title={copy.sibling}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty-state direct input for brand-new events. */}
      {hasOnlyRoot && (
        <div className="absolute inset-0 z-10 grid place-items-center">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const input = (e.currentTarget.elements.namedItem('first-step') as HTMLInputElement | null);
              const text = input?.value.trim() ?? '';
              if (text) void submitFirstStep(text);
            }}
            className="flex w-80 items-center gap-2 rounded-xl border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-900"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              name="first-step"
              autoFocus
              placeholder={copy.addFirstStep}
              className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm outline-none focus:border-[#23877B] dark:border-gray-700"
              aria-label={copy.addFirstStep}
            />
            <button type="submit" className="rounded-lg bg-[#23877B] px-3 py-2 text-sm text-white">{copy.addStep}</button>
          </form>
        </div>
      )}

      {selected && !hasOnlyRoot && (
        <div className="sticky bottom-5 z-10 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-1 rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg dark:border-gray-700 dark:bg-gray-900" data-testid="event-node-toolbar" onClick={(e) => e.stopPropagation()}>
          {addingChild ? (
            <form onSubmit={(e) => { e.preventDefault(); void submitChild(); }} className="flex items-center gap-1">
              <input autoFocus value={childText} onChange={(e) => setChildText(e.target.value)} placeholder={copy.addStep} className="w-48 rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm outline-none focus:border-[#23877B] dark:border-gray-700" aria-label={copy.addStep} />
              <button disabled={!childText.trim() || busy} className="rounded-lg bg-[#23877B] px-3 py-2 text-sm text-white disabled:opacity-40">{copy.addStep}</button>
              <button type="button" onClick={() => setAddingChild(false)} className="rounded-lg p-2 text-gray-500" aria-label={copy.cancel}><X className="h-4 w-4" /></button>
            </form>
          ) : (
            <>
              <ToolbarButton icon={<Plus className="h-4 w-4" />} label={copy.addChild} onClick={() => setAddingChild(true)} />
              {!isRoot && <ToolbarButton icon={<Plus className="h-4 w-4" />} label={copy.addSibling} onClick={() => selected && void addSiblingAfter(selected)} />}
              {!isRoot && <ToolbarButton icon={<Check className="h-4 w-4" />} label={copy.today} onClick={() => void run(() => onSchedule(selected, today))} />}
              {!isRoot && <div className="relative"><ToolbarButton icon={<CalendarDays className="h-4 w-4" />} label={copy.date} onClick={() => setDateOpen((open) => !open)} />{dateOpen && <div className="absolute bottom-12 left-0 rounded-xl border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-900"><input type="date" defaultValue={selected.execution?.scheduledDate ?? today} onChange={(e) => { if (e.target.value) void run(() => onSchedule(selected, e.target.value)); setDateOpen(false); }} aria-label="Schedule date" className="rounded-lg border border-gray-200 bg-transparent px-2 py-1.5 text-sm dark:border-gray-700" /></div>}</div>}
              <div className="relative"><ToolbarButton icon={<MoreHorizontal className="h-4 w-4" />} label={copy.more} onClick={() => setMoreOpen((open) => !open)} trailing={<ChevronDown className="h-3 w-3" />} />{moreOpen && <div className="absolute bottom-12 right-0 min-w-48 rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg dark:border-gray-700 dark:bg-gray-900">{selected.execution && <button onClick={() => void run(() => onUnschedule(selected))} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800"><CalendarDays className="h-4 w-4" />{copy.removeDay}</button>}{!isRoot && <button onClick={() => void run(() => onDelete(selected.id))} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"><Trash2 className="h-4 w-4" />{copy.deleteNode}</button>}</div>}</div>
              <span className="ml-1 hidden text-[10px] text-gray-400 md:inline">{copy.hint}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ToolbarButton({ icon, label, onClick, trailing }: { icon: React.ReactNode; label: string; onClick: () => void; trailing?: React.ReactNode }) {
  return <button type="button" onClick={onClick} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800">{icon}<span>{label}</span>{trailing}</button>;
}
