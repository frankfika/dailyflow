import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronRight, ListTodo, Plus } from 'lucide-react';
import type { EventDetail, EventNode } from '../../../api/client';
import { ScheduleDatePopover, type ScheduleDateCopy } from './ScheduleDatePopover';
import { getTodayStr } from '../../../utils/tagColors';

type Copy = {
  addChild: string;
  addSibling: string;
  empty: string;
  rootPlaceholder: string;
  untitled: string;
  addToTask: string;
  today: string;
  tomorrow: string;
  nextWeek: string;
  pickDate: string;
  confirm: string;
  cancel: string;
};

const COPY: Record<'en' | 'zh', Copy> = {
  en: {
    addChild: 'Add child',
    addSibling: 'Add sibling',
    empty: 'No steps yet.',
    rootPlaceholder: 'Type the first step…',
    untitled: 'Untitled',
    addToTask: 'Add to Task',
    today: 'Today',
    tomorrow: 'Tomorrow',
    nextWeek: 'Next week',
    pickDate: 'Pick date',
    confirm: 'Schedule',
    cancel: 'Cancel',
  },
  zh: {
    addChild: '添加子节点',
    addSibling: '添加同级',
    empty: '还没有步骤。',
    rootPlaceholder: '输入第一个步骤…',
    untitled: '无标题',
    addToTask: '添加为任务',
    today: '今天',
    tomorrow: '明天',
    nextWeek: '下周',
    pickDate: '选择日期',
    confirm: '安排',
    cancel: '取消',
  },
};

function pickDateCopy(copy: Copy): ScheduleDateCopy {
  return { pickDate: copy.pickDate, today: copy.today, tomorrow: copy.tomorrow, nextWeek: copy.nextWeek, cancel: copy.cancel, confirm: copy.confirm };
}

interface OutlineRow {
  node: EventNode;
  depth: number;
  index: number;
  parentId?: string;
  hasChildren: boolean;
}

interface EventOutlineProps {
  event: EventDetail;
  language: 'en' | 'zh';
  selectedId: string | null;
  editingId: string | null;
  collapsedIds: Set<string>;
  onToggleCollapse: (nodeId: string) => void;
  onSelect: (id: string) => void;
  onStartEdit: (id: string) => void;
  onCommitEdit: () => void;
  onRename: (nodeId: string, text: string) => Promise<void>;
  onAddChild: (parentId: string, text: string) => Promise<string>;
  onAddSibling: (referenceId: string, text: string) => Promise<string>;
  onOutdent?: (nodeId: string) => Promise<void>;
  onDelete: (nodeId: string) => Promise<void>;
  onMoveNode?: (nodeId: string, newParentId: string) => Promise<void>;
  onReorderNode?: (nodeId: string, direction: 'up' | 'down') => Promise<void>;
  onScheduleTask?: (node: EventNode, date: string) => Promise<void>;
}

function buildRows(event: EventDetail, collapsed: Set<string>): OutlineRow[] {
  const nodeMap = new Map(event.nodes.map((n) => [n.id, n]));
  const childrenByParent = new Map<string, EventNode[]>();
  for (const node of event.nodes) {
    const parentId = node.parentId;
    if (!parentId) continue;
    const siblings = childrenByParent.get(parentId) ?? [];
    siblings.push(node);
    childrenByParent.set(parentId, siblings);
  }
  for (const siblings of childrenByParent.values()) {
    siblings.sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
  }
  const rows: OutlineRow[] = [];
  const root = nodeMap.get(event.rootNodeId);
  if (!root) return rows;

  function walk(node: EventNode, depth: number) {
    const children = childrenByParent.get(node.id) ?? [];
    rows.push({
      node,
      depth,
      index: rows.length,
      parentId: node.parentId,
      hasChildren: children.length > 0,
    });
    // Skip children when this node is collapsed.
    if (collapsed.has(node.id)) return;
    for (const child of children) {
      walk(child, depth + 1);
    }
  }

  walk(root, 0);
  return rows;
}

export function EventOutline({
  event,
  language,
  selectedId,
  editingId,
  collapsedIds,
  onToggleCollapse,
  onSelect,
  onStartEdit,
  onCommitEdit,
  onRename,
  onAddChild,
  onAddSibling,
  onOutdent,
  onDelete,
  onMoveNode,
  onReorderNode,
  onScheduleTask,
}: EventOutlineProps) {
  const copy = COPY[language];
  const rows = useMemo(() => buildRows(event, collapsedIds), [event, collapsedIds]);
  const inputRefs = useRef(new Map<string, HTMLInputElement>());
  const [draftText, setDraftText] = useState<Record<string, string>>({});
  const [dragNodeId, setDragNodeId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [schedulePicker, setSchedulePicker] = useState<{ nodeId: string; date: string } | null>(null);
  const today = getTodayStr();

  function shiftDate(base: string, days: number): string {
    const d = new Date(`${base}T00:00:00`);
    d.setDate(d.getDate() + days);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  const selectedRow = rows.find((r) => r.node.id === selectedId);
  const editingRow = rows.find((r) => r.node.id === editingId);

  useEffect(() => {
    if (editingId && inputRefs.current.has(editingId)) {
      const input = inputRefs.current.get(editingId);
      input?.focus();
      input?.select();
    }
  }, [editingId, rows]);

  function textFor(row: OutlineRow) {
    return draftText[row.node.id] ?? row.node.text;
  }

  function previousRowId(row: OutlineRow): string | null {
    if (row.index <= 0) return null;
    return rows[row.index - 1].node.id;
  }

  function nextRowId(row: OutlineRow): string | null {
    if (row.index >= rows.length - 1) return null;
    return rows[row.index + 1].node.id;
  }

  async function commit(row: OutlineRow) {
    const text = draftText[row.node.id];
    if (text === undefined) return;
    setDraftText((prev) => {
      const next = { ...prev };
      delete next[row.node.id];
      return next;
    });
    if (text.trim() && text !== row.node.text) {
      await onRename(row.node.id, text.trim());
    }
  }

  async function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>, row: OutlineRow) {
    const isRoot = row.node.id === event.rootNodeId;
    const text = draftText[row.node.id] ?? row.node.text;

    if (e.key === 'Escape') {
      e.preventDefault();
      setDraftText((prev) => {
        const next = { ...prev };
        delete next[row.node.id];
        return next;
      });
      onCommitEdit();
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      await commit(row);
      if (isRoot) {
        const nodeId = await onAddChild(row.node.id, '');
        onStartEdit(nodeId);
      } else {
        const nodeId = await onAddSibling(row.node.id, '');
        onStartEdit(nodeId);
      }
      return;
    }

    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      await commit(row);
      const nodeId = await onAddChild(row.node.id, '');
      onStartEdit(nodeId);
      return;
    }

    if (e.key === 'Tab' && e.shiftKey && !isRoot && onOutdent) {
      e.preventDefault();
      await commit(row);
      await onOutdent(row.node.id);
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevId = previousRowId(row);
      if (prevId) onSelect(prevId);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextId = nextRowId(row);
      if (nextId) onSelect(nextId);
      return;
    }

    // ArrowRight on a collapsed node expands it (Feishu behavior).
    if (e.key === 'ArrowRight' && row.hasChildren && collapsedIds.has(row.node.id)) {
      e.preventDefault();
      onToggleCollapse(row.node.id);
      return;
    }

    // ArrowLeft on an expanded node with children collapses it.
    if (e.key === 'ArrowLeft' && row.hasChildren && !collapsedIds.has(row.node.id)) {
      e.preventDefault();
      onToggleCollapse(row.node.id);
      return;
    }

    // Alt+ArrowUp / Alt+ArrowDown — swap with adjacent sibling (Feishu behavior).
    if (e.altKey && e.key === 'ArrowUp' && onReorderNode) {
      e.preventDefault();
      await commit(row);
      await onReorderNode(row.node.id, 'up');
      return;
    }
    if (e.altKey && e.key === 'ArrowDown' && onReorderNode) {
      e.preventDefault();
      await commit(row);
      await onReorderNode(row.node.id, 'down');
      return;
    }

    if (e.key === 'Backspace' && e.currentTarget.value === '' && !isRoot) {
      e.preventDefault();
      const prevId = previousRowId(row);
      await onDelete(row.node.id);
      if (prevId) onSelect(prevId);
    }
  }

  async function handleBlur(row: OutlineRow) {
    await commit(row);
    onCommitEdit();
  }

  function handleChange(row: OutlineRow, value: string) {
    setDraftText((prev) => ({ ...prev, [row.node.id]: value }));
  }

  const root = rows[0];
  const childRows = rows.slice(1);
  const hasOnlyRoot = event.nodes.length <= 1;

  return (
    <div className="flex h-full min-h-0 w-full flex-col border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-[#101514]" data-testid="event-outline">
      <div className="shrink-0 border-b border-gray-200 px-3 py-2 text-xs font-medium text-gray-500 dark:border-gray-800 dark:text-gray-400">
        {language === 'zh' ? '大纲' : 'Outline'}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        {root && (
          <OutlineItem
            key={root.node.id}
            row={root}
            copy={copy}
            isSelected={selectedId === root.node.id}
            isEditing={editingId === root.node.id}
            isCollapsed={collapsedIds.has(root.node.id)}
            text={textFor(root)}
            isDragging={dragNodeId === root.node.id}
            isDropTarget={dropTargetId === root.node.id && dragNodeId !== null && dragNodeId !== root.node.id}
            onSelect={() => onSelect(root.node.id)}
            onStartEdit={() => onStartEdit(root.node.id)}
            onToggleCollapse={() => onToggleCollapse(root.node.id)}
            onChange={(value) => handleChange(root, value)}
            onKeyDown={(e) => void handleKeyDown(e, root)}
            onBlur={() => void handleBlur(root)}
            inputRef={(el) => {
              if (el) inputRefs.current.set(root.node.id, el);
              else inputRefs.current.delete(root.node.id);
            }}
            onAddChild={() => void onAddChild(root.node.id, '').then(onStartEdit)}
            onOpenSchedulePicker={onScheduleTask ? () => setSchedulePicker((prev) => (prev?.nodeId === root.node.id ? null : { nodeId: root.node.id, date: today })) : undefined}
            schedulePickerOpen={schedulePicker?.nodeId === root.node.id}
            schedulePicker={schedulePicker?.nodeId === root.node.id ? (
              <ScheduleDatePopover
                copy={pickDateCopy(copy)}
                date={schedulePicker.date}
                onChange={(d) => setSchedulePicker({ nodeId: root.node.id, date: d })}
                onConfirm={async () => { await onScheduleTask!(root.node, schedulePicker.date); setSchedulePicker(null); }}
                onCancel={() => setSchedulePicker(null)}
                onClickAway={() => setSchedulePicker(null)}
                today={today}
                shiftDate={shiftDate}
                testId="outline-schedule-popover"
              />
            ) : undefined}
            onDragStart={() => setDragNodeId(root.node.id)}
            onDragEnd={() => { setDragNodeId(null); setDropTargetId(null); }}
            onDragOver={() => setDropTargetId(root.node.id)}
            onDragLeave={() => setDropTargetId(null)}
            onDrop={() => {
              if (dragNodeId && dragNodeId !== root.node.id) void onMoveNode?.(dragNodeId, root.node.id);
              setDragNodeId(null);
              setDropTargetId(null);
            }}
          />
        )}

        {childRows.map((row) => (
          <OutlineItem
            key={row.node.id}
            row={row}
            copy={copy}
            isSelected={selectedId === row.node.id}
            isEditing={editingId === row.node.id}
            isCollapsed={collapsedIds.has(row.node.id)}
            text={textFor(row)}
            isDragging={dragNodeId === row.node.id}
            isDropTarget={dropTargetId === row.node.id && dragNodeId !== null && dragNodeId !== row.node.id}
            onSelect={() => onSelect(row.node.id)}
            onStartEdit={() => onStartEdit(row.node.id)}
            onToggleCollapse={() => onToggleCollapse(row.node.id)}
            onChange={(value) => handleChange(row, value)}
            onKeyDown={(e) => void handleKeyDown(e, row)}
            onBlur={() => void handleBlur(row)}
            inputRef={(el) => {
              if (el) inputRefs.current.set(row.node.id, el);
              else inputRefs.current.delete(row.node.id);
            }}
            onAddChild={() => void onAddChild(row.node.id, '').then(onStartEdit)}
            onAddSibling={() => void onAddSibling(row.node.id, '').then(onStartEdit)}
            onOpenSchedulePicker={onScheduleTask ? () => setSchedulePicker((prev) => (prev?.nodeId === row.node.id ? null : { nodeId: row.node.id, date: today })) : undefined}
            schedulePickerOpen={schedulePicker?.nodeId === row.node.id}
            schedulePicker={schedulePicker?.nodeId === row.node.id ? (
              <ScheduleDatePopover
                copy={pickDateCopy(copy)}
                date={schedulePicker.date}
                onChange={(d) => setSchedulePicker({ nodeId: row.node.id, date: d })}
                onConfirm={async () => { await onScheduleTask!(row.node, schedulePicker.date); setSchedulePicker(null); }}
                onCancel={() => setSchedulePicker(null)}
                onClickAway={() => setSchedulePicker(null)}
                today={today}
                shiftDate={shiftDate}
                testId="outline-schedule-popover"
              />
            ) : undefined}
            onDragStart={() => setDragNodeId(row.node.id)}
            onDragEnd={() => { setDragNodeId(null); setDropTargetId(null); }}
            onDragOver={() => setDropTargetId(row.node.id)}
            onDragLeave={() => setDropTargetId(null)}
            onDrop={() => {
              if (dragNodeId && dragNodeId !== row.node.id) void onMoveNode?.(dragNodeId, row.node.id);
              setDragNodeId(null);
              setDropTargetId(null);
            }}
          />
        ))}

        {hasOnlyRoot && root && (
          <div className="px-3 py-1.5 pl-8">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const input = (e.currentTarget.elements.namedItem('first-outline-step') as HTMLInputElement | null);
                const value = input?.value.trim() ?? '';
                if (!value) return;
                void onAddChild(root.node.id, value).then(onStartEdit);
              }}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-2"
            >
              <input
                name="first-outline-step"
                autoFocus
                placeholder={copy.rootPlaceholder}
                className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-[#23877B] dark:border-gray-700"
              />
              <button type="submit" className="rounded-md bg-[#23877B] px-2.5 py-1.5 text-xs text-white">
                {language === 'zh' ? '添加' : 'Add'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

interface OutlineItemProps {
  row: OutlineRow;
  copy: Copy;
  isSelected: boolean;
  isEditing: boolean;
  isCollapsed: boolean;
  text: string;
  isDragging: boolean;
  isDropTarget: boolean;
  onSelect: () => void;
  onStartEdit: () => void;
  onToggleCollapse: () => void;
  onChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onBlur: () => void;
  inputRef: (el: HTMLInputElement | null) => void;
  onAddChild: () => void;
  onAddSibling?: () => void;
  onOpenSchedulePicker?: () => void;
  schedulePickerOpen?: boolean;
  schedulePicker?: React.ReactNode;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: () => void;
}

function OutlineItem({
  row,
  copy,
  isSelected,
  isEditing,
  isCollapsed,
  text,
  isDragging,
  isDropTarget,
  onSelect,
  onStartEdit,
  onToggleCollapse,
  onChange,
  onKeyDown,
  onBlur,
  inputRef,
  onAddChild,
  onAddSibling,
  onOpenSchedulePicker,
  schedulePickerOpen,
  schedulePicker,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: OutlineItemProps) {
  const isRoot = row.parentId === undefined;
  const isDone = row.node.execution?.status === 'done';
  const isTaskRow = Boolean(row.node.execution);

  return (
    <div
      className={`group relative flex items-center gap-1 px-2 py-0.5 ${isSelected ? 'bg-[#23877B]/8' : isTaskRow ? 'bg-[#23877B]/[0.04] hover:bg-[#23877B]/[0.07]' : 'hover:bg-black/[0.02]'} ${isDragging ? 'opacity-40' : ''} ${isDropTarget ? 'ring-2 ring-[#23877B] ring-inset' : ''}`}
      style={{ paddingLeft: `${12 + row.depth * 18}px` }}
      data-testid={`outline-row-${row.node.id}`}
      data-task-row={isTaskRow || undefined}
      draggable={!isRoot}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart(); }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; onDragOver(); }}
      onDragLeave={onDragLeave}
      onDrop={(e) => { e.preventDefault(); onDrop(); }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
        onStartEdit();
      }}
    >
      {isTaskRow && <span className="absolute inset-y-0 left-0 w-0.5 bg-[#23877B]" aria-hidden="true" />}
      {row.hasChildren ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleCollapse(); }}
          className="grid h-4 w-4 shrink-0 place-items-center rounded text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          aria-label={isCollapsed ? 'Expand' : 'Collapse'}
        >
          <ChevronRight className={`h-3.5 w-3.5 transition-transform ${isCollapsed ? '' : 'rotate-90'}`} />
        </button>
      ) : (
        <span className="h-3.5 w-3.5 shrink-0" />
      )}

      {row.node.execution && (
        <span
          className={`mr-1 grid h-4 w-4 shrink-0 place-items-center rounded-full border ${isDone ? 'border-[#23877B] bg-[#23877B] text-white' : 'border-gray-300 dark:border-gray-600'}`}
          onClick={(e) => e.stopPropagation()}
        >
          {isDone && <Check className="h-2.5 w-2.5" />}
        </span>
      )}

      {!isRoot && !row.node.execution && onOpenSchedulePicker && (
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpenSchedulePicker(); }}
            className="flex h-5 items-center gap-1 rounded-md bg-[#23877B]/10 px-1.5 text-[11px] font-medium text-[#23877B] opacity-0 transition-opacity hover:bg-[#23877B]/20 group-hover:opacity-100"
            title={copy.addToTask}
            aria-label={copy.addToTask}
            aria-expanded={schedulePickerOpen}
            data-testid={`outline-add-task-${row.node.id}`}
          >
            <ListTodo className="h-3 w-3" />
            {copy.addToTask}
          </button>
          {schedulePickerOpen && schedulePicker}
        </div>
      )}

      {isEditing ? (
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          onClick={(e) => e.stopPropagation()}
          className="min-w-0 flex-1 rounded-md border border-[#23877B]/40 bg-white px-2 py-1 text-sm outline-none dark:bg-gray-900"
          data-testid={`outline-input-${row.node.id}`}
          aria-label="Node title"
        />
      ) : (
        <span
          className={`min-w-0 flex-1 cursor-text rounded-md px-2 py-1 text-sm ${isDone ? 'text-gray-400 line-through' : 'text-gray-900 dark:text-gray-100'}`}
        >
          {text || (isRoot ? <span className="text-gray-400">{copy.rootPlaceholder}</span> : <span className="text-gray-300">{copy.untitled}</span>)}
        </span>
      )}

      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onAddChild(); }}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[#23877B] bg-white text-[#23877B] opacity-0 transition-opacity group-hover:opacity-100 dark:bg-gray-900"
        title={copy.addChild}
        aria-label={copy.addChild}
      >
        <Plus className="h-3 w-3" />
      </button>

      {!isRoot && onAddSibling && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onAddSibling(); }}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-500 opacity-0 transition-opacity hover:border-[#23877B] hover:text-[#23877B] group-hover:opacity-100 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300"
          title={copy.addSibling}
          aria-label={copy.addSibling}
        >
          <Plus className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
