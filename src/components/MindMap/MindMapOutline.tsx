import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, CalendarDays, Check, ChevronDown, ChevronRight, Circle, CornerDownRight, ExternalLink, Flag, Link2, ListTodo, Loader2, MessageSquare, Plus, Rows3, Save, Search, Trash2, X } from 'lucide-react';
import { ulid } from 'ulid';
import type { MindMap, MindMapEdge, MindMapNode, MindMapNodeStatus } from '../../api/client';
import { layoutMindMap } from './layout';
import { TagInput } from '../TagInput';

export interface OutlineRow {
  node: MindMapNode;
  depth: number;
  parentId: string | null;
}

export function flattenMindMap(map: MindMap): OutlineRow[] {
  const nodeById = new Map(map.nodes.map((node) => [node.id, node]));
  const children = new Map<string, string[]>();
  for (const edge of map.edges) {
    const items = children.get(edge.source) ?? [];
    items.push(edge.target);
    children.set(edge.source, items);
  }
  const rows: OutlineRow[] = [];
  const visited = new Set<string>();
  const visit = (id: string, depth: number, parentId: string | null) => {
    const node = nodeById.get(id);
    if (!node || visited.has(id)) return;
    visited.add(id);
    rows.push({ node, depth, parentId });
    if (node.collapsed) return;
    for (const childId of children.get(id) ?? []) visit(childId, depth + 1, id);
  };
  visit(map.rootId, 0, null);
  for (const node of map.nodes) visit(node.id, 0, null);
  return rows;
}

function withLayout(map: MindMap, nodes: MindMapNode[], edges: MindMapEdge[]): MindMap {
  const { positions } = layoutMindMap(map.rootId, nodes, edges);
  return {
    ...map,
    nodes: nodes.map((node) => positions[node.id] ? { ...node, position: positions[node.id] } : node),
    edges,
  };
}

function taskTimestampNow(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export function addOutlineNode(map: MindMap, afterId: string): { map: MindMap; nodeId: string } {
  const parentEdge = map.edges.find((edge) => edge.target === afterId);
  const parentId = afterId === map.rootId ? map.rootId : (parentEdge?.source ?? map.rootId);
  const id = ulid();
  const edge: MindMapEdge = { id: ulid(), source: parentId, target: id };
  const node: MindMapNode = {
    id,
    text: '',
    kind: 'branch',
    status: 'todo',
    tags: [],
    position: { x: 0, y: 0 },
  };
  const nodes = [...map.nodes, node].map((item) => item.id === parentId ? { ...item, collapsed: false } : item);
  const edges = [...map.edges];
  const afterEdgeIndex = edges.findIndex((item) => item.target === afterId);
  if (afterId !== map.rootId && afterEdgeIndex >= 0) edges.splice(afterEdgeIndex + 1, 0, edge);
  else edges.push(edge);
  return { map: withLayout(map, nodes, edges), nodeId: id };
}

export function addOutlineChild(map: MindMap, parentId: string): { map: MindMap; nodeId: string } {
  const id = ulid();
  const node: MindMapNode = {
    id,
    text: '',
    kind: 'branch',
    status: 'todo',
    tags: [],
    position: { x: 0, y: 0 },
  };
  const edge: MindMapEdge = { id: ulid(), source: parentId, target: id };
  const nodes = [...map.nodes, node].map((item) => item.id === parentId ? { ...item, collapsed: false } : item);
  return { map: withLayout(map, nodes, [...map.edges, edge]), nodeId: id };
}

export function indentOutlineNode(map: MindMap, nodeId: string): MindMap {
  if (nodeId === map.rootId) return map;
  const rows = flattenMindMap({ ...map, nodes: map.nodes.map((node) => ({ ...node, collapsed: false })) });
  const index = rows.findIndex((row) => row.node.id === nodeId);
  if (index <= 1) return map;
  const row = rows[index];
  let previousSibling: OutlineRow | undefined;
  for (let i = index - 1; i >= 0; i -= 1) {
    if (rows[i].depth < row.depth) break;
    if (rows[i].depth === row.depth && rows[i].parentId === row.parentId) {
      previousSibling = rows[i];
      break;
    }
  }
  if (!previousSibling) return map;
  const edges = map.edges.map((edge) => edge.target === nodeId ? { ...edge, source: previousSibling!.node.id } : edge);
  const nodes = map.nodes.map((node) => node.id === previousSibling!.node.id ? { ...node, collapsed: false } : node);
  return withLayout(map, nodes, edges);
}

export function outdentOutlineNode(map: MindMap, nodeId: string): MindMap {
  if (nodeId === map.rootId) return map;
  const parentEdge = map.edges.find((edge) => edge.target === nodeId);
  if (!parentEdge || parentEdge.source === map.rootId) return map;
  const grandParentEdge = map.edges.find((edge) => edge.target === parentEdge.source);
  if (!grandParentEdge) return map;
  const edges = map.edges.map((edge) => edge.id === parentEdge.id ? { ...edge, source: grandParentEdge.source } : edge);
  return withLayout(map, map.nodes, edges);
}

export function moveOutlineNode(map: MindMap, nodeId: string, direction: -1 | 1): MindMap {
  if (nodeId === map.rootId) return map;
  const edge = map.edges.find((item) => item.target === nodeId);
  if (!edge) return map;
  const siblings = map.edges.filter((item) => item.source === edge.source);
  const siblingIndex = siblings.findIndex((item) => item.target === nodeId);
  const swapWith = siblings[siblingIndex + direction];
  if (!swapWith) return map;
  const currentIndex = map.edges.findIndex((item) => item.id === edge.id);
  const swapIndex = map.edges.findIndex((item) => item.id === swapWith.id);
  const edges = [...map.edges];
  [edges[currentIndex], edges[swapIndex]] = [edges[swapIndex], edges[currentIndex]];
  return withLayout(map, map.nodes, edges);
}

/** Remove an empty idea without destroying its children. */
export function removeEmptyOutlineNode(map: MindMap, nodeId: string): MindMap {
  if (nodeId === map.rootId) return map;
  const parentEdge = map.edges.find((edge) => edge.target === nodeId);
  if (!parentEdge) return map;
  const edges = map.edges
    .filter((edge) => edge.id !== parentEdge.id)
    .map((edge) => edge.source === nodeId ? { ...edge, source: parentEdge.source } : edge);
  return withLayout(map, map.nodes.filter((node) => node.id !== nodeId), edges);
}

export interface OutlineTaskOption {
  id: string;
  title: string;
  status: 'todo' | 'done' | 'migrated';
  date: string;
  description?: string;
  comment?: string;
  comments?: { text: string; timestamp: string }[];
  tags?: string[];
  deadline?: string;
  priority?: 'high' | 'medium' | 'low';
}

export interface OutlineTaskUpdates {
  description: string;
  tags: string[];
  deadline: string;
  priority: 'high' | 'medium' | 'low' | '';
  comments: { text: string; timestamp: string }[];
}

interface MindMapOutlineProps {
  map: MindMap;
  language: 'en' | 'zh';
  selectedId: string | null;
  onSelect: (nodeId: string) => void;
  onChange: (patch: { nodes?: MindMapNode[]; edges?: MindMapEdge[] }) => void;
  onEnsureTask: (nodeId: string) => void;
  onTaskStatusChange: (node: MindMapNode, status: MindMapNodeStatus) => void;
  onTaskTitleChange: (node: MindMapNode, title: string) => void;
  onTaskNoteChange?: (node: MindMapNode, note: string) => void;
  onTaskFieldsChange?: (node: MindMapNode, updates: OutlineTaskUpdates, date: string) => Promise<void>;
  onTaskDateChange?: (node: MindMapNode, fromDate: string, toDate: string) => Promise<void>;
  onDelete: (nodeId: string) => void;
  onLinkTask?: (nodeId: string, taskId: string, date: string) => void;
  onOpenTask?: (taskId: string, date: string) => void;
  taskOptions?: ReadonlyArray<OutlineTaskOption>;
  selectedTaskDetails?: OutlineTaskOption | null;
  layout?: 'document' | 'split';
}

export function MindMapOutline({ map, language, selectedId, onSelect, onChange, onEnsureTask, onTaskStatusChange, onTaskTitleChange, onTaskNoteChange, onTaskFieldsChange, onTaskDateChange, onDelete, onLinkTask, onOpenTask, taskOptions = [], selectedTaskDetails = null, layout = 'document' }: MindMapOutlineProps) {
  const rows = useMemo(() => flattenMindMap(map), [map]);
  const inputRefs = useRef(new Map<string, HTMLInputElement>());
  const focusStartText = useRef(new Map<string, string>());
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);
  const [linkQuery, setLinkQuery] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const noteFocusStart = useRef('');
  const [taskDraft, setTaskDraft] = useState<OutlineTaskUpdates & { date: string }>({ description: '', tags: [], deadline: '', priority: '', comments: [], date: '' });
  const [taskCommentDraft, setTaskCommentDraft] = useState('');
  const [taskSaving, setTaskSaving] = useState(false);
  const selectedNode = selectedId ? map.nodes.find((node) => node.id === selectedId) : undefined;
  const selectedTaskOption = selectedTaskDetails?.id === selectedNode?.taskId
    ? selectedTaskDetails
    : taskOptions.find((task) => task.id === selectedNode?.taskId);
  const selectedTaskDate = selectedNode?.taskDate ?? selectedTaskOption?.date;
  const availableTags = useMemo(() => Array.from(new Set(taskOptions.flatMap((task) => task.tags ?? []))).sort(), [taskOptions]);
  const filteredTasks = useMemo(() => {
    const query = linkQuery.trim().toLocaleLowerCase();
    const available = taskOptions.filter((task) => task.id !== selectedNode?.taskId);
    return (query ? available.filter((task) => task.title.toLocaleLowerCase().includes(query)) : available).slice(0, 12);
  }, [linkQuery, selectedNode?.taskId, taskOptions]);

  useEffect(() => {
    setLinkPickerOpen(false);
    setLinkQuery('');
    setDetailsOpen(Boolean(selectedNode?.taskId));
  }, [selectedId, selectedNode?.taskId]);

  useEffect(() => {
    setTaskDraft({
      description: selectedTaskOption?.description ?? selectedNode?.note ?? '',
      tags: selectedTaskOption?.tags ?? selectedNode?.tags ?? [],
      deadline: selectedTaskOption?.deadline ?? '',
      priority: selectedTaskOption?.priority ?? '',
      comments: selectedTaskOption?.comments ?? [],
      date: selectedTaskDate ?? '',
    });
    setTaskCommentDraft('');
  }, [selectedNode?.id, selectedNode?.taskId, selectedNode?.note, selectedNode?.tags, selectedTaskDate, selectedTaskOption?.description, selectedTaskOption?.tags, selectedTaskOption?.deadline, selectedTaskOption?.priority, selectedTaskOption?.comments]);

  const focusSoon = (id: string) => {
    setPendingFocusId(id);
    requestAnimationFrame(() => {
      inputRefs.current.get(id)?.focus();
      setPendingFocusId(null);
    });
  };

  const applyWholeMap = (next: MindMap, focusId?: string) => {
    onChange({ nodes: next.nodes, edges: next.edges });
    if (focusId) {
      onSelect(focusId);
      focusSoon(focusId);
    }
  };

  const moveSelected = (nodeId: string, direction: -1 | 1) => {
    const next = moveOutlineNode(map, nodeId, direction);
    applyWholeMap(next, nodeId);
  };

  return (
    <section className={`flex h-full min-h-0 flex-col bg-white/75 backdrop-blur-xl ${layout === 'split' ? 'w-[420px] shrink-0 border-r border-border/70' : 'w-full'}`} data-testid="mindmap-outline" data-layout={layout}>
      <div className="shrink-0 border-b border-border/60 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-text-heading">{language === 'zh' ? '脑图大纲' : 'Mind map outline'}</h2>
            <p className="mt-0.5 text-[11px] text-text-muted">{language === 'zh' ? '像写文档一样编辑，脑图实时生成' : 'Edit like a document; the map follows'}</p>
          </div>
          <span className="rounded-md bg-black/[0.035] px-2 py-1 text-[10px] text-text-muted">Enter {language === 'zh' ? '同级' : 'sibling'} · ⌘Enter {language === 'zh' ? '子节点' : 'child'}</span>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={`px-3 py-5 ${layout === 'document' ? 'mx-auto w-full max-w-[860px]' : ''}`}>
        {rows.map(({ node, depth }) => {
          const isRoot = node.id === map.rootId;
          const isTask = node.kind === 'task' && !!node.taskId;
          const hasChildren = map.edges.some((edge) => edge.source === node.id);
          return (
            <div
              key={node.id}
              className={`group mb-0.5 flex min-h-9 items-center rounded-lg border transition-colors ${selectedId === node.id ? 'border-[var(--color-accent)]/20 bg-[var(--color-accent-light)]' : 'border-transparent hover:bg-black/[0.025]'}`}
              style={{ paddingLeft: 6 + Math.min(depth, 8) * 20 }}
              data-testid={`outline-row-${node.id}`}
            >
              <span className={`mr-2 h-1.5 w-1.5 shrink-0 rounded-full ${isRoot ? 'bg-[var(--color-accent)]' : 'bg-text-muted/30'}`} />
              {hasChildren ? (
                <button
                  type="button"
                  onClick={() => onChange({ nodes: map.nodes.map((item) => item.id === node.id ? { ...item, collapsed: !item.collapsed } : item) })}
                  className="mr-1 rounded p-0.5 text-text-muted hover:bg-black/5"
                  aria-label={language === 'zh' ? '折叠节点' : 'Collapse node'}
                >
                  {node.collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
              ) : <span className="mr-1 w-[18px]" />}
              {!isRoot && (
                <button
                  type="button"
                  onClick={() => {
                    onSelect(node.id);
                    if (!isTask) onEnsureTask(node.id);
                    else {
                      const status: MindMapNodeStatus = node.status === 'done' ? 'todo' : 'done';
                      onChange({ nodes: map.nodes.map((item) => item.id === node.id ? { ...item, status } : item) });
                      onTaskStatusChange(node, status);
                    }
                  }}
                  className={`mr-1.5 shrink-0 rounded p-0.5 transition-colors ${isTask ? (node.status === 'done' ? 'text-[var(--color-success)]' : 'text-[var(--color-accent)]') : 'text-text-muted/30 hover:text-[var(--color-accent)]'}`}
                  title={isTask ? (language === 'zh' ? '已在 Today，点击切换完成状态' : 'In Today; click to toggle') : (language === 'zh' ? '添加到 Today（⌘⇧Enter）' : 'Add to Today (⌘⇧Enter)')}
                  data-testid={`outline-task-${node.id}`}
                >
                  {isTask && node.status === 'done' ? <Check className="h-4 w-4" /> : isTask ? <ListTodo className="h-4 w-4" /> : <Circle className="h-3.5 w-3.5" />}
                </button>
              )}
              <input
                ref={(element) => { if (element) inputRefs.current.set(node.id, element); else inputRefs.current.delete(node.id); }}
                value={node.text}
                onFocus={() => {
                  focusStartText.current.set(node.id, node.text);
                  onSelect(node.id);
                }}
                onChange={(event) => onChange({ nodes: map.nodes.map((item) => item.id === node.id ? { ...item, text: event.target.value } : item) })}
                onBlur={(event) => {
                  const title = event.currentTarget.value.trim();
                  const previousTitle = focusStartText.current.get(node.id) ?? node.text;
                  focusStartText.current.delete(node.id);
                  if (isTask && title && title !== previousTitle) {
                    // Preserve the pre-edit title so the parent can restore it
                    // if the Task write fails.
                    onTaskTitleChange({ ...node, text: previousTitle }, title);
                  }
                }}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key === 'Enter' && !isRoot) {
                    event.preventDefault();
                    if (!isTask) onEnsureTask(node.id);
                    else {
                      const status: MindMapNodeStatus = node.status === 'done' ? 'todo' : 'done';
                      onChange({ nodes: map.nodes.map((item) => item.id === node.id ? { ...item, status } : item) });
                      onTaskStatusChange(node, status);
                    }
                  } else if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                    event.preventDefault();
                    const result = addOutlineChild(map, node.id);
                    applyWholeMap(result.map, result.nodeId);
                  } else if (event.key === 'Enter') {
                    event.preventDefault();
                    const result = addOutlineNode(map, node.id);
                    applyWholeMap(result.map, result.nodeId);
                  } else if (event.key === 'Tab') {
                    event.preventDefault();
                    const next = event.shiftKey ? outdentOutlineNode(map, node.id) : indentOutlineNode(map, node.id);
                    applyWholeMap(next, node.id);
                  } else if (event.altKey && event.key === 'ArrowUp') {
                    event.preventDefault();
                    moveSelected(node.id, -1);
                  } else if (event.altKey && event.key === 'ArrowDown') {
                    event.preventDefault();
                    moveSelected(node.id, 1);
                  } else if (event.key === 'Backspace' && !isRoot && node.text === '') {
                    event.preventDefault();
                    if (node.taskId) onDelete(node.id);
                    else {
                      const index = rows.findIndex((row) => row.node.id === node.id);
                      const focusId = rows[Math.max(0, index - 1)]?.node.id;
                      applyWholeMap(removeEmptyOutlineNode(map, node.id), focusId);
                    }
                  }
                }}
                placeholder={isRoot ? (language === 'zh' ? '中心主题' : 'Central topic') : (language === 'zh' ? '输入想法…' : 'Type an idea…')}
                className={`min-w-0 flex-1 bg-transparent py-2 pr-1 outline-none placeholder:text-text-muted/45 ${isRoot ? 'text-[15px] font-semibold text-text-heading' : node.status === 'done' ? 'text-sm text-text-muted line-through' : 'text-sm text-text-main'}`}
                data-pending-focus={pendingFocusId === node.id || undefined}
              />
              <div className="mr-1 flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                <button
                  type="button"
                  onClick={() => {
                    const result = isRoot ? addOutlineNode(map, node.id) : addOutlineChild(map, node.id);
                    applyWholeMap(result.map, result.nodeId);
                  }}
                  className="rounded p-1 text-text-muted hover:bg-black/5 hover:text-text-heading"
                  title={isRoot ? (language === 'zh' ? '添加一级主题' : 'Add top-level topic') : (language === 'zh' ? '添加子节点（⌘Enter）' : 'Add child (⌘Enter)')}
                  aria-label={isRoot ? (language === 'zh' ? '添加一级主题' : 'Add top-level topic') : (language === 'zh' ? '添加子节点' : 'Add child')}
                  data-testid={isRoot ? 'outline-add-top-level-root' : `outline-add-child-${node.id}`}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
                {!isRoot && (
                  <button
                    type="button"
                    onClick={() => { const result = addOutlineNode(map, node.id); applyWholeMap(result.map, result.nodeId); }}
                    className="rounded p-1 text-text-muted hover:bg-black/5 hover:text-text-heading"
                    title={language === 'zh' ? '添加同级节点（Enter）' : 'Add sibling (Enter)'}
                    aria-label={language === 'zh' ? '添加同级节点' : 'Add sibling'}
                    data-testid={`outline-add-sibling-${node.id}`}
                  >
                    <Rows3 className="h-3.5 w-3.5" />
                  </button>
                )}
                {!isRoot && <button type="button" onClick={() => onDelete(node.id)} className="rounded p-1 text-text-muted hover:bg-[var(--color-danger-light)] hover:text-[var(--color-danger)]" title={language === 'zh' ? '删除' : 'Delete'}><Trash2 className="h-3.5 w-3.5" /></button>}
              </div>
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => { const result = addOutlineNode(map, map.rootId); applyWholeMap(result.map, result.nodeId); }}
          className="ml-7 mt-2 flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-text-muted hover:bg-black/[0.03] hover:text-text-heading"
        >
          <CornerDownRight className="h-3.5 w-3.5" />
          {language === 'zh' ? '添加一级主题' : 'Add top-level topic'}
        </button>
        </div>
      </div>
      {selectedNode && selectedNode.id !== map.rootId ? (
        <div className="relative shrink-0 border-t border-border/70 bg-white/90 px-4 py-2.5 shadow-[0_-8px_24px_rgba(0,0,0,0.025)]" data-testid="outline-node-toolbar">
          <div className={`flex items-center gap-2 ${layout === 'document' ? 'mx-auto max-w-[840px]' : ''}`}>
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-text-heading">{selectedNode.text || (language === 'zh' ? '空节点' : 'Empty node')}</span>
            <button type="button" onClick={() => moveSelected(selectedNode.id, -1)} className="rounded-md p-1.5 text-text-muted hover:bg-black/5 hover:text-text-heading" title={language === 'zh' ? '上移（⌥↑）' : 'Move up (Alt+↑)'}><ArrowUp className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => moveSelected(selectedNode.id, 1)} className="rounded-md p-1.5 text-text-muted hover:bg-black/5 hover:text-text-heading" title={language === 'zh' ? '下移（⌥↓）' : 'Move down (Alt+↓)'}><ArrowDown className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => setDetailsOpen((open) => !open)} className={`rounded-md px-2 py-1 text-[11px] ${detailsOpen ? 'bg-black/[0.05] text-text-heading' : 'text-text-muted hover:bg-black/[0.03] hover:text-text-heading'}`}>{language === 'zh' ? '详情' : 'Details'}</button>
            {selectedNode.taskId ? (
              <>
                <span className="inline-flex items-center gap-1 rounded-md bg-[var(--color-accent-light)] px-2 py-1 text-[11px] font-medium text-[var(--color-accent)]"><ListTodo className="h-3.5 w-3.5" />{language === 'zh' ? '已在 Today' : 'In Today'}{selectedTaskDate ? ` · ${selectedTaskDate}` : ''}</span>
                {onOpenTask && selectedTaskDate && <button type="button" onClick={() => onOpenTask(selectedNode.taskId!, selectedTaskDate)} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-text-muted hover:bg-black/[0.03] hover:text-text-heading"><ExternalLink className="h-3 w-3" />{language === 'zh' ? '打开' : 'Open'}</button>}
              </>
            ) : (
              <>
                <button type="button" onClick={() => onEnsureTask(selectedNode.id)} className="inline-flex items-center gap-1 rounded-md bg-[var(--color-accent)] px-2.5 py-1.5 text-[11px] font-medium text-white hover:opacity-90"><ListTodo className="h-3.5 w-3.5" />{language === 'zh' ? '添加到 Today' : 'Add to Today'}</button>
                {onLinkTask && taskOptions.length > 0 && <button type="button" onClick={() => setLinkPickerOpen((open) => !open)} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-[11px] text-text-muted hover:bg-black/[0.03] hover:text-text-heading"><Link2 className="h-3.5 w-3.5" />{language === 'zh' ? '关联已有' : 'Link existing'}</button>}
              </>
            )}
          </div>
          {detailsOpen && selectedNode.taskId && selectedTaskDate && onTaskFieldsChange ? (
            <div className={`mt-2 rounded-xl border border-border/70 bg-black/[0.015] p-3 ${layout === 'document' ? 'mx-auto max-w-[840px]' : ''}`} data-testid="outline-task-editor">
              <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
                <label className="flex flex-col gap-1 text-[10px] font-medium uppercase tracking-wide text-text-muted">
                  <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" />{language === 'zh' ? '任务日期' : 'Task date'}</span>
                  <input type="date" value={taskDraft.date} onChange={(event) => setTaskDraft((draft) => ({ ...draft, date: event.target.value }))} className="h-8 rounded-lg border border-border bg-white px-2 text-xs font-medium text-text-heading outline-none focus:border-accent/40" data-testid="outline-task-date" />
                </label>
                <label className="flex flex-col gap-1 text-[10px] font-medium uppercase tracking-wide text-text-muted">
                  <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" />{language === 'zh' ? '截止日期' : 'Deadline'}</span>
                  <input type="date" value={taskDraft.deadline} onChange={(event) => setTaskDraft((draft) => ({ ...draft, deadline: event.target.value }))} className="h-8 rounded-lg border border-border bg-white px-2 text-xs font-medium text-text-heading outline-none focus:border-accent/40" data-testid="outline-task-deadline" />
                </label>
                <label className="flex flex-col gap-1 text-[10px] font-medium uppercase tracking-wide text-text-muted">
                  <span className="inline-flex items-center gap-1"><Flag className="h-3 w-3" />{language === 'zh' ? '优先级' : 'Priority'}</span>
                  <select value={taskDraft.priority} onChange={(event) => setTaskDraft((draft) => ({ ...draft, priority: event.target.value as OutlineTaskUpdates['priority'] }))} className="h-8 rounded-lg border border-border bg-white px-2 text-xs font-medium text-text-heading outline-none focus:border-accent/40" data-testid="outline-task-priority">
                    <option value="">{language === 'zh' ? '无' : 'None'}</option>
                    <option value="high">{language === 'zh' ? '高' : 'High'}</option>
                    <option value="medium">{language === 'zh' ? '中' : 'Medium'}</option>
                    <option value="low">{language === 'zh' ? '低' : 'Low'}</option>
                  </select>
                </label>
              </div>
              <div className="mt-2.5">
                <TagInput tags={taskDraft.tags} onChange={(tags) => setTaskDraft((draft) => ({ ...draft, tags }))} availableTags={availableTags} language={language} placeholder={language === 'zh' ? '添加标签，回车确认…' : 'Add tags; press Enter…'} />
              </div>
              <textarea value={taskDraft.description} onChange={(event) => setTaskDraft((draft) => ({ ...draft, description: event.target.value }))} rows={3} placeholder={language === 'zh' ? '任务描述…' : 'Task description…'} className="mt-2.5 w-full resize-none rounded-lg border border-border bg-white px-3 py-2 text-xs leading-5 text-text-main outline-none placeholder:text-text-muted/55 focus:border-accent/40" data-testid="outline-task-description" />
              <div className="mt-2.5 rounded-lg border border-border/70 bg-white/70 p-2.5" data-testid="outline-task-comments">
                <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted"><MessageSquare className="h-3 w-3" />{selectedNode.status === 'done' ? (language === 'zh' ? '完成备注' : 'Resolution notes') : (language === 'zh' ? '任务备注' : 'Task notes')}</div>
                <div className="space-y-1.5">
                  {selectedTaskOption?.comment && taskDraft.comments.length === 0 && <div className="rounded-md border-l-2 border-border bg-black/[0.02] px-2.5 py-1.5 text-[11px] text-text-muted">{selectedTaskOption.comment}</div>}
                  {taskDraft.comments.map((comment, index) => (
                    <div key={`${comment.timestamp}-${index}`} className="group/comment relative rounded-md border-l-2 border-border bg-black/[0.02] px-2.5 py-1.5 pr-7 text-[11px] text-text-muted">
                      {comment.timestamp && <span className="mr-2 font-mono text-[9px] opacity-55">{comment.timestamp}</span>}{comment.text}
                      <button type="button" onClick={() => setTaskDraft((draft) => ({ ...draft, comments: draft.comments.filter((_, itemIndex) => itemIndex !== index) }))} className="absolute right-1 top-1 rounded p-1 opacity-0 transition-opacity hover:bg-black/5 group-hover/comment:opacity-100" aria-label={language === 'zh' ? '删除这条备注' : 'Delete this note'}><X className="h-3 w-3" /></button>
                    </div>
                  ))}
                </div>
                <textarea value={taskCommentDraft} onChange={(event) => setTaskCommentDraft(event.target.value)} rows={2} placeholder={selectedNode.status === 'done' ? (language === 'zh' ? '这件事是怎么解决的？' : 'How did you resolve this?') : (language === 'zh' ? '添加备注…' : 'Add a note…')} className="mt-2 min-h-[48px] w-full resize-none rounded-md border border-border bg-white px-2.5 py-1.5 text-xs text-text-main outline-none placeholder:text-text-muted/55 focus:border-accent/40" data-testid="outline-task-comment-input" />
              </div>
              <div className="mt-2.5 flex items-center justify-between gap-3">
                <p className="text-[10px] text-text-muted">{language === 'zh' ? '保存后会立即同步到 Today' : 'Changes sync to Today immediately after saving'}</p>
                <button
                  type="button"
                  disabled={taskSaving || !taskDraft.date}
                  onClick={async () => {
                    setTaskSaving(true);
                    try {
                      if (taskDraft.date !== selectedTaskDate) await onTaskDateChange?.(selectedNode, selectedTaskDate, taskDraft.date);
                      const comments = taskCommentDraft.trim()
                        ? [...taskDraft.comments, { text: taskCommentDraft.trim(), timestamp: taskTimestampNow() }]
                        : taskDraft.comments;
                      await onTaskFieldsChange({ ...selectedNode, taskDate: taskDraft.date }, {
                        description: taskDraft.description,
                        tags: taskDraft.tags,
                        deadline: taskDraft.deadline,
                        priority: taskDraft.priority,
                        comments,
                      }, taskDraft.date);
                      setTaskCommentDraft('');
                    } finally {
                      setTaskSaving(false);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-[11px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  data-testid="outline-task-save"
                >
                  {taskSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}{language === 'zh' ? '保存任务' : 'Save task'}
                </button>
              </div>
            </div>
          ) : detailsOpen && (
            <div className={`mt-2 ${layout === 'document' ? 'mx-auto max-w-[840px]' : ''}`} data-testid="outline-node-details">
              <textarea
                value={selectedNode.note ?? ''}
                onFocus={() => { noteFocusStart.current = selectedNode.note ?? ''; }}
                onChange={(event) => onChange({ nodes: map.nodes.map((node) => node.id === selectedNode.id ? { ...node, note: event.target.value } : node) })}
                onBlur={(event) => {
                  const note = event.currentTarget.value;
                  if (selectedNode.taskId && note !== noteFocusStart.current) onTaskNoteChange?.({ ...selectedNode, note: noteFocusStart.current }, note);
                }}
                rows={3}
                placeholder={selectedNode.taskId ? (language === 'zh' ? '补充说明，将同步到 Task 描述…' : 'Add details; synced to Task description…') : (language === 'zh' ? '补充这个想法的背景和细节…' : 'Add context and details…')}
                className="w-full resize-none rounded-lg border border-border bg-black/[0.018] px-3 py-2 text-xs leading-5 text-text-main outline-none transition-colors placeholder:text-text-muted/55 focus:border-[var(--color-accent)]/35 focus:bg-white"
              />
            </div>
          )}
          {linkPickerOpen && onLinkTask && (
            <div className="absolute bottom-full right-4 z-30 mb-2 w-80 rounded-xl border border-border bg-white/95 p-2 shadow-xl backdrop-blur-xl" data-testid="outline-link-picker">
              <div className="flex items-center gap-2 rounded-lg border border-border bg-black/[0.02] px-2.5 py-2"><Search className="h-3.5 w-3.5 text-text-muted" /><input autoFocus value={linkQuery} onChange={(event) => setLinkQuery(event.target.value)} placeholder={language === 'zh' ? '搜索已有 Task…' : 'Search tasks…'} className="min-w-0 flex-1 bg-transparent text-xs outline-none" /><button type="button" onClick={() => setLinkPickerOpen(false)} className="text-text-muted hover:text-text-heading"><X className="h-3.5 w-3.5" /></button></div>
              <div className="mt-1 max-h-60 overflow-y-auto">
                {filteredTasks.length === 0 ? <p className="px-2 py-4 text-center text-xs text-text-muted">{language === 'zh' ? '没有匹配的 Task' : 'No matching tasks'}</p> : filteredTasks.map((task) => <button key={`${task.id}-${task.date}`} type="button" onClick={() => { onLinkTask(selectedNode.id, task.id, task.date); setLinkPickerOpen(false); setLinkQuery(''); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-black/[0.035]" data-testid={`outline-link-task-${task.id}`}><span className={`h-3 w-3 shrink-0 rounded-full border ${task.status === 'done' ? 'border-[var(--color-success)] bg-[var(--color-success)]' : 'border-border-strong'}`} /><span className="min-w-0 flex-1 truncate text-xs text-text-main">{task.title}</span><span className="shrink-0 text-[10px] text-text-muted">{task.date}</span></button>)}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="shrink-0 border-t border-border/60 px-4 py-2 text-center text-[10px] leading-4 text-text-muted">{language === 'zh' ? 'Enter 同级 · ⌘Enter 子节点 · Tab 调层级 · ⌥↑↓ 排序 · ⌘⇧Enter 添加到 Today' : 'Enter sibling · ⌘Enter child · Tab indent · Alt+↑↓ reorder · ⌘⇧Enter add to Today'}</div>
      )}
    </section>
  );
}
