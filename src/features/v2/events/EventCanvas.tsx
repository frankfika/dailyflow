import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Check, ChevronDown, ListTodo, Minus, MoreHorizontal, Plus, Trash2, X } from 'lucide-react';
import type { EventDetail, EventNode, MindMapEdge, MindMapNode } from '../../../api/client';
import { layoutMindMap } from '../../../components/MindMap/layout';
import { getTodayStr } from '../../../utils/tagColors';
import { ScheduleDatePopover } from './ScheduleDatePopover';

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
  addToTask: string;
  taskBadge: string;
  tomorrow: string;
  nextWeek: string;
  pickDate: string;
  confirm: string;
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
    hint: 'Tab child · Enter sibling · ↑↓←→ navigate',
    addToTask: 'Add to Task',
    taskBadge: 'Task',
    tomorrow: 'Tomorrow',
    nextWeek: 'Next week',
    pickDate: 'Pick date',
    confirm: 'Schedule',
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
    hint: 'Tab 子节点 · Enter 同级 · ↑↓←→ 移动',
    addToTask: '添加为任务',
    taskBadge: '任务',
    tomorrow: '明天',
    nextWeek: '下周',
    pickDate: '选择日期',
    confirm: '安排',
  },
};

interface EventCanvasProps {
  event: EventDetail;
  language: 'en' | 'zh';
  activeNodeId: string | null;
  focusedNodeId?: string | null;
  collapsedIds: Set<string>;
  onToggleCollapse: (nodeId: string) => void;
  onActivate: (id: string) => void;
  onCommit: () => void;
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
  activeNodeId,
  focusedNodeId,
  collapsedIds,
  onToggleCollapse,
  onActivate,
  onCommit,
  onAddChild,
  onAddSibling,
  onRename,
  onSchedule,
  onUnschedule,
  onToggleDone,
  onDelete,
}: EventCanvasProps) {
  const copy = COPY[language];
  const [addingChild, setAddingChild] = useState(false);
  const [childText, setChildText] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [draftText, setDraftText] = useState<Record<string, string>>({});
  // Single schedule picker shared by the node chip ('node' anchor) and the
  // bottom toolbar ('toolbar' anchor); only one popover is visible at a time.
  const [schedulePicker, setSchedulePicker] = useState<{ nodeId: string; date: string; anchor: 'node' | 'toolbar' } | null>(null);
  const inputRefs = useRef(new Map<string, HTMLInputElement>());
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef<{ pointerId: number; startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null);
  const [panning, setPanning] = useState(false);

  const normalized = useMemo(() => {
    if (!event.nodes.length) return { nodes: [] as Array<EventNode & { canvasX: number; canvasY: number }>, width: 900, height: 560 };
    // Compute a clean horizontal tree layout every render so the canvas
    // mirrors Feishu mind notes regardless of stored positions.
    const layoutNodes: MindMapNode[] = event.nodes.map((n) => ({
      id: n.id,
      text: n.text,
      position: n.position,
      collapsed: collapsedIds.has(n.id) ? true : n.collapsed,
    }));
    const layoutEdges: MindMapEdge[] = event.edges;
    const { positions } = layoutMindMap(event.rootNodeId, layoutNodes, layoutEdges);
    // layoutMindMap centers the tree on the root, so siblings above the root
    // get NEGATIVE y values — which clip outside the scroll container and can
    // never be scrolled into view. Shift the whole tree so the top-left of the
    // bounding box starts at (PAD, PAD).
    const PAD = 120;
    let rawMinX = Infinity, rawMinY = Infinity;
    for (const n of event.nodes) {
      const p = positions[n.id];
      if (!p) continue;
      if (p.x < rawMinX) rawMinX = p.x;
      if (p.y < rawMinY) rawMinY = p.y;
    }
    if (!Number.isFinite(rawMinX)) rawMinX = 0;
    if (!Number.isFinite(rawMinY)) rawMinY = 0;
    let maxX = -Infinity, maxY = -Infinity;
    const laid = event.nodes
      .filter((n) => positions[n.id]) // drop nodes hidden by collapse
      .map((n) => {
        const p = positions[n.id];
        const canvasX = p.x - rawMinX + PAD;
        const canvasY = p.y - rawMinY + PAD;
        if (canvasX > maxX) maxX = canvasX;
        if (canvasY > maxY) maxY = canvasY;
        return { ...n, canvasX, canvasY };
      });
    const width = Math.max(900, (Number.isFinite(maxX) ? maxX : 0) + NODE_W + PAD);
    const height = Math.max(560, (Number.isFinite(maxY) ? maxY : 0) + NODE_H + PAD);
    return { nodes: laid, width, height };
  }, [event.nodes, event.edges, event.rootNodeId, collapsedIds]);

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

  const activeNode = event.nodes.find((node) => node.id === activeNodeId) ?? null;
  const isRootActive = activeNode?.id === event.rootNodeId;
  const today = getTodayStr();
  const hasOnlyRoot = event.nodes.length <= 1;

  function shiftDate(base: string, days: number): string {
    const d = new Date(`${base}T00:00:00`);
    d.setDate(d.getDate() + days);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  useEffect(() => {
    if (focusedNodeId && event.nodes.some((node) => node.id === focusedNodeId)) {
      onActivate(focusedNodeId);
    }
  }, [event.nodes, focusedNodeId, onActivate]);

  useEffect(() => {
    if (activeNodeId && inputRefs.current.has(activeNodeId)) {
      const input = inputRefs.current.get(activeNodeId);
      input?.focus();
      input?.select();
    }
  }, [activeNodeId, event.nodes]);

  // The toolbar picker tracks the active node; close it when selection moves.
  useEffect(() => {
    setSchedulePicker((prev) => (prev?.anchor === 'toolbar' ? null : prev));
  }, [activeNodeId]);

  function textFor(nodeId: string) {
    return draftText[nodeId] ?? event.nodes.find((n) => n.id === nodeId)?.text ?? '';
  }

  async function commit(nodeId: string) {
    const text = draftText[nodeId];
    if (text === undefined) return;
    const node = event.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    setDraftText((prev) => {
      const next = { ...prev };
      delete next[nodeId];
      return next;
    });
    if (text.trim() && text !== node.text) {
      await onRename(nodeId, text.trim());
    }
  }

  async function submitChild() {
    if (!activeNode || !childText.trim()) return;
    const nodeId = await onAddChild(activeNode.id, childText.trim());
    if (nodeId) {
      setChildText('');
      setAddingChild(false);
      onActivate(nodeId);
    }
  }

  async function addSiblingAfter(node: EventNode) {
    const nodeId = await onAddSibling(node.id, '');
    if (nodeId) onActivate(nodeId);
  }

  async function addChildTo(node: EventNode) {
    const nodeId = await onAddChild(node.id, '');
    if (nodeId) onActivate(nodeId);
  }

  async function removeNode(nodeId: string) {
    await onDelete(nodeId);
  }

  function selectNextSibling(direction: 1 | -1) {
    if (!activeNode) return;
    const parentId = parentByChild.get(activeNode.id) ?? '';
    const siblings = childrenByParent.get(parentId) ?? [];
    const idx = siblings.findIndex((n) => n.id === activeNode.id);
    if (idx === -1) return;
    const next = siblings[idx + direction];
    if (next) onActivate(next.id);
  }

  function selectParent() {
    if (!activeNode) return;
    const parentId = parentByChild.get(activeNode.id);
    if (parentId) onActivate(parentId);
  }

  function selectFirstChild() {
    if (!activeNode) return;
    const children = childrenByParent.get(activeNode.id);
    if (children?.length) onActivate(children[0].id);
  }

  async function handleNodeKeyDown(e: React.KeyboardEvent<HTMLInputElement>, node: EventNode) {
    const isRoot = node.id === event.rootNodeId;
    const text = draftText[node.id] ?? node.text;

    if (e.key === 'Escape') {
      e.preventDefault();
      setDraftText((prev) => {
        const next = { ...prev };
        delete next[node.id];
        return next;
      });
      onCommit();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      await commit(node.id);
      if (isRoot) {
        const nodeId = await onAddChild(node.id, '');
        if (nodeId) onActivate(nodeId);
      } else {
        const nodeId = await onAddSibling(node.id, '');
        if (nodeId) onActivate(nodeId);
      }
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      await commit(node.id);
      const nodeId = await onAddChild(node.id, '');
      if (nodeId) onActivate(nodeId);
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectNextSibling(-1);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectNextSibling(1);
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      selectParent();
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      selectFirstChild();
      return;
    }

    if (e.key === 'Backspace' && text === '' && !isRoot) {
      e.preventDefault();
      const parentId = parentByChild.get(node.id) ?? '';
      const siblings = childrenByParent.get(parentId) ?? [];
      const idx = siblings.findIndex((n) => n.id === node.id);
      const prevId = idx > 0 ? siblings[idx - 1].id : parentId;
      await removeNode(node.id);
      if (prevId) onActivate(prevId);
    }
  }

  async function handleCanvasKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, button')) return;
    if (!activeNode) return;

    if (event.key === 'Tab') {
      event.preventDefault();
      await commit(activeNode.id);
      const nodeId = await onAddChild(activeNode.id, '');
      if (nodeId) onActivate(nodeId);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      onActivate(activeNode.id);
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
    if ((event.key === 'Delete' || event.key === 'Backspace') && !isRootActive) {
      event.preventDefault();
      const parentId = parentByChild.get(activeNode.id) ?? '';
      const siblings = childrenByParent.get(parentId) ?? [];
      const idx = siblings.findIndex((n) => n.id === activeNode.id);
      const prevId = idx > 0 ? siblings[idx - 1].id : parentId;
      await removeNode(activeNode.id);
      if (prevId) onActivate(prevId);
    }
  }

  async function submitFirstStep(text: string) {
    const nodeId = await onAddChild(event.rootNodeId, text);
    if (nodeId) onActivate(nodeId);
  }

  // Drag-to-pan on empty canvas space (Feishu-style). Pressing on a node,
  // button, input or form does NOT start a pan — only the bare background does.
  function handlePanStart(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, input, form, a, [data-testid^="event-node-"]')) return;
    const scroller = scrollRef.current;
    if (!scroller) return;
    panRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, scrollLeft: scroller.scrollLeft, scrollTop: scroller.scrollTop };
    scroller.setPointerCapture(e.pointerId);
    setPanning(true);
  }

  function handlePanMove(e: React.PointerEvent<HTMLDivElement>) {
    const pan = panRef.current;
    const scroller = scrollRef.current;
    if (!pan || !scroller || e.pointerId !== pan.pointerId) return;
    scroller.scrollLeft = pan.scrollLeft - (e.clientX - pan.startX);
    scroller.scrollTop = pan.scrollTop - (e.clientY - pan.startY);
  }

  function handlePanEnd(e: React.PointerEvent<HTMLDivElement>) {
    if (panRef.current?.pointerId !== e.pointerId) return;
    panRef.current = null;
    setPanning(false);
  }

  return (
    <div
      ref={scrollRef}
      className={`relative h-full min-h-0 overflow-auto bg-[#f8faf9] outline-none dark:bg-[#111716] ${panning ? 'cursor-grabbing select-none' : 'cursor-grab'}`}
      data-testid="event-canvas"
      tabIndex={0}
      onKeyDown={handleCanvasKeyDown}
      onPointerDown={handlePanStart}
      onPointerMove={handlePanMove}
      onPointerUp={handlePanEnd}
      onPointerCancel={handlePanEnd}
      onPointerLeave={handlePanEnd}
      onClick={() => { setMoreOpen(false); }}
    >
      <div className="sticky right-4 top-4 z-10 float-right mr-4 flex w-fit items-center rounded-lg border border-gray-200 bg-white p-1 shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <button type="button" onClick={() => setZoom((value) => Math.max(0.6, Number((value - 0.1).toFixed(1))))} className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Zoom out"><Minus className="h-4 w-4" /></button>
        <button type="button" onClick={() => setZoom(1)} className="min-w-10 rounded-md px-1.5 py-1 text-[11px] text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Reset zoom">{Math.round(zoom * 100)}%</button>
        <button type="button" onClick={() => setZoom((value) => Math.min(1.4, Number((value + 0.1).toFixed(1))))} className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Zoom in"><Plus className="h-4 w-4" /></button>
      </div>

      {/* Sizer keeps the scrollable area proportional to the zoomed content —
          without it, scale() only visually grows the map and the far edges stay
          out of reach of the scrollbars. */}
      <div className="relative" style={{ width: normalized.width * zoom, height: normalized.height * zoom }}>
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
          const isActive = activeNodeId === node.id;
          const isDone = node.execution?.status === 'done';
          const isEventRoot = node.id === event.rootNodeId;
          const hasChildren = event.edges.some((edge) => edge.source === node.id);
          const isCollapsed = collapsedIds.has(node.id);
          const isTaskNode = Boolean(node.execution);
          return (
            <div key={node.id} className="absolute" style={{ left: node.canvasX, top: node.canvasY, width: NODE_W }} data-testid={`event-node-${node.id}`}>
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onActivate(node.id); }}
                  className={`relative flex min-h-[58px] w-full items-center gap-2 overflow-hidden rounded-xl border px-3 py-2 text-left transition ${isActive ? 'border-[#23877B] bg-white ring-2 ring-[#23877B]/15 dark:bg-gray-900' : isTaskNode ? 'border-[#23877B]/40 bg-[#23877B]/[0.04] hover:border-[#23877B]/60 dark:bg-[#23877B]/[0.06]' : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-900'} ${isEventRoot ? 'font-semibold' : ''} ${isActive ? 'shadow-sm' : 'shadow-none'}`}
                  aria-pressed={isActive}
                  data-task-node={isTaskNode || undefined}
                >
                  {/* Persistent accent stripe on task nodes — mirrors the MindMap v1
                      treatment so the user can scan the canvas and instantly see
                      which branches are already in Today. */}
                  {isTaskNode && (
                    <span className="absolute inset-y-0 left-0 w-1 bg-[#23877B]" aria-hidden="true" />
                  )}
                  {node.execution && (
                    <span
                      role="checkbox"
                      aria-checked={isDone}
                      aria-label={isDone ? 'Reopen' : 'Complete'}
                      onClick={(e) => { e.stopPropagation(); void onToggleDone(node); }}
                      className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${isDone ? 'border-[#23877B] bg-[#23877B] text-white' : 'border-gray-300 dark:border-gray-600'}`}
                    >{isDone && <Check className="h-3 w-3" />}</span>
                  )}
                  {isActive ? (
                    <input
                      ref={(el) => {
                        if (el) inputRefs.current.set(node.id, el);
                        else inputRefs.current.delete(node.id);
                      }}
                      value={textFor(node.id)}
                      onChange={(e) => setDraftText((prev) => ({ ...prev, [node.id]: e.target.value }))}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={() => { void commit(node.id); onCommit(); }}
                      onKeyDown={(e) => void handleNodeKeyDown(e, node)}
                      className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                      aria-label="Node title"
                    />
                  ) : (
                    <span className={`min-w-0 flex-1 text-sm leading-5 text-gray-900 dark:text-gray-100 ${isDone ? 'line-through opacity-60' : ''}`}>
                      {node.text}
                    </span>
                  )}
                  {/* Task badge + date — persistent visual marker so the user can
                      see at a glance "this node is already a task". */}
                  {isTaskNode && !isActive && (
                    <span className="flex shrink-0 items-center gap-1 text-[10px] font-medium text-[#23877B]" data-testid={`event-node-task-badge-${node.id}`}>
                      <ListTodo className="h-3 w-3" aria-hidden="true" />
                      <span>{copy.taskBadge}</span>
                      <span className="text-gray-400">·</span>
                      <span className="tabular-nums text-gray-500">{node.execution!.scheduledDate.slice(5)}</span>
                    </span>
                  )}
                </button>

                {/* Collapse toggle for nodes with children */}
                {hasChildren && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onToggleCollapse(node.id); }}
                    className="absolute -right-3 top-1/2 z-30 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-500 shadow-sm hover:border-[#23877B] hover:text-[#23877B] dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300"
                    aria-label={isCollapsed ? 'Expand' : 'Collapse'}
                    title={isCollapsed ? 'Expand' : 'Collapse'}
                  >
                    <ChevronDown className={`h-3 w-3 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                  </button>
                )}

                {/* Inline add-child button (hidden when collapsed to reduce clutter). */}
                {!isCollapsed && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); void addChildTo(node); }}
                  className="absolute -right-2 top-1/2 z-20 flex h-5 w-5 translate-x-1/2 items-center justify-center rounded-full border border-[#23877B] bg-white text-[#23877B] shadow-sm hover:bg-[#23877B] hover:text-white dark:border-[#23877B] dark:bg-gray-900"
                  aria-label={copy.addChild}
                  title={copy.addChild}
                  style={{ marginTop: hasChildren ? 14 : -2 }}
                >
                  <Plus className="h-3 w-3" />
                </button>
                )}

                {/* Prominent "Add to Task" affordance for non-task nodes. Clicking opens a
                    small date picker so the user can pick when to schedule it
                    (defaults to today; offers Today/Tomorrow/+3d/+1w/custom). */}
                {!isEventRoot && !node.execution && (
                  <div className="absolute -top-3 right-1 z-20">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSchedulePicker((prev) => (prev?.nodeId === node.id && prev.anchor === 'node' ? null : { nodeId: node.id, date: today, anchor: 'node' }));
                      }}
                      className="flex items-center gap-1 rounded-md bg-[var(--color-accent-light,#23877B1a)] px-2 py-1 text-[11px] font-medium text-[#23877B] shadow-sm hover:brightness-95"
                      aria-label={copy.addToTask}
                      title={copy.addToTask}
                      aria-expanded={schedulePicker?.nodeId === node.id && schedulePicker.anchor === 'node'}
                      data-testid={`event-node-add-task-${node.id}`}
                    >
                      <ListTodo className="h-3.5 w-3.5" />
                      {copy.addToTask}
                    </button>
                    {schedulePicker?.nodeId === node.id && schedulePicker.anchor === 'node' && (
                      <ScheduleDatePopover
                        copy={copy}
                        date={schedulePicker.date}
                        onChange={(d) => setSchedulePicker({ nodeId: node.id, date: d, anchor: 'node' })}
                        onConfirm={async () => {
                          await onSchedule(node, schedulePicker.date);
                          setSchedulePicker(null);
                        }}
                        onCancel={() => setSchedulePicker(null)}
                        onClickAway={() => setSchedulePicker(null)}
                        today={today}
                        shiftDate={shiftDate}
                        testId="event-node-schedule-popover"
                      />
                    )}
                  </div>
                )}

                {!isEventRoot && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); void addSiblingAfter(node); }}
                    className="absolute bottom-0 left-1/2 z-20 flex h-5 w-5 -translate-x-1/2 translate-y-1/2 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-500 shadow-sm hover:border-[#23877B] hover:text-[#23877B] dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300"
                    aria-label={copy.addSibling}
                    title={copy.addSibling}
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
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

      {activeNode && !hasOnlyRoot && (
        <div className="sticky bottom-5 z-10 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-1 rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg dark:border-gray-700 dark:bg-gray-900" data-testid="event-node-toolbar" onClick={(e) => e.stopPropagation()}>
          {addingChild ? (
            <form onSubmit={(e) => { e.preventDefault(); void submitChild(); }} className="flex items-center gap-1">
              <input autoFocus value={childText} onChange={(e) => setChildText(e.target.value)} placeholder={copy.addStep} className="w-48 rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm outline-none focus:border-[#23877B] dark:border-gray-700" aria-label={copy.addStep} />
              <button disabled={!childText.trim()} className="rounded-lg bg-[#23877B] px-3 py-2 text-sm text-white disabled:opacity-40">{copy.addStep}</button>
              <button type="button" onClick={() => setAddingChild(false)} className="rounded-lg p-2 text-gray-500" aria-label={copy.cancel}><X className="h-4 w-4" /></button>
            </form>
          ) : (
            <>
              <ToolbarButton icon={<Plus className="h-4 w-4" />} label={copy.addChild} onClick={() => setAddingChild(true)} />
              {!isRootActive && <ToolbarButton icon={<Plus className="h-4 w-4" />} label={copy.addSibling} onClick={() => activeNode && void addSiblingAfter(activeNode)} />}
              {/* Single scheduling entry — no one-click "Today". Non-task nodes
                  get "Add to Task"; task nodes get a reschedule button showing the
                  current date. Both open the same date popover (upward, since the
                  toolbar sits at the bottom) and only schedule on confirm. */}
              {!isRootActive && activeNode && (
                <div className="relative">
                  <ToolbarButton
                    icon={activeNode.execution ? <CalendarDays className="h-4 w-4" /> : <ListTodo className="h-4 w-4" />}
                    label={activeNode.execution ? `${copy.date} · ${activeNode.execution.scheduledDate.slice(5)}` : copy.addToTask}
                    onClick={() => setSchedulePicker((prev) => (prev?.anchor === 'toolbar' ? null : { nodeId: activeNode.id, date: activeNode.execution?.scheduledDate ?? today, anchor: 'toolbar' }))}
                    trailing={<ChevronDown className="h-3 w-3" />}
                  />
                  {schedulePicker?.anchor === 'toolbar' && (
                    <ScheduleDatePopover
                      copy={copy}
                      date={schedulePicker.date}
                      onChange={(d) => setSchedulePicker({ nodeId: activeNode.id, date: d, anchor: 'toolbar' })}
                      onConfirm={async () => {
                        await onSchedule(activeNode, schedulePicker.date);
                        setSchedulePicker(null);
                      }}
                      onCancel={() => setSchedulePicker(null)}
                      onClickAway={() => setSchedulePicker(null)}
                      today={today}
                      shiftDate={shiftDate}
                      testId="event-toolbar-schedule-popover"
                      placement="up"
                    />
                  )}
                </div>
              )}
              <div className="relative"><ToolbarButton icon={<MoreHorizontal className="h-4 w-4" />} label={copy.more} onClick={() => setMoreOpen((open) => !open)} trailing={<ChevronDown className="h-3 w-3" />} />{moreOpen && <div className="absolute bottom-12 right-0 min-w-48 rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg dark:border-gray-700 dark:bg-gray-900">{activeNode.execution && <button onClick={() => void onUnschedule(activeNode)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800"><CalendarDays className="h-4 w-4" />{copy.removeDay}</button>}{!isRootActive && <button onClick={() => void onDelete(activeNode.id)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"><Trash2 className="h-4 w-4" />{copy.deleteNode}</button>}</div>}</div>
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
