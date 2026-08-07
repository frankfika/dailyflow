/**
 * Custom React Flow node for the mind map canvas.
 *
 * The node renders a rounded card that matches DailyFlow's "native minimal"
 * surface treatment. The card hosts:
 *   - a status badge (☐/◐/✓) on the left, clickable to cycle
 *   - the node text (editable when `isEditing` is true)
 *   - a small footer of contextual actions when selected
 *   - a note editor that appears beside the card when the node is selected
 *
 * Color comes from a named token, not raw hex, so the rest of the app
 * keeps a consistent palette.
 */
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  Pencil,
  Plus,
  Trash2,
  Type,
  Palette,
  ChevronDown,
  ChevronRight,
  StickyNote,
  Circle,
  CircleDot,
  CheckCircle2,
  Tag as TagIcon,
  Link2,
  ExternalLink,
} from 'lucide-react';
import type { MindMapNodeColor, MindMapNodeKind, MindMapNodeStatus } from '../../api/client';

export interface MindMapNodeData extends Record<string, unknown> {
  text: string;
  color: MindMapNodeColor;
  isRoot: boolean;
  isSelected: boolean;
  isEditing: boolean;
  /** True when this node has hidden descendants (so the user can re-expand). */
  hasHiddenChildren: boolean;
  collapsed: boolean;
  note: string;
  status: MindMapNodeStatus;
  /** True when this node matches the current in-map search query. */
  isSearchMatch: boolean;
  /** True when this node is the currently focused search match. */
  isFocusedMatch: boolean;
  // Topic Space v2 (Phase 1): node kind drives the visual treatment.
  // Defaulted to 'branch' in the parent so this is always defined for
  // v2+ maps; legacy maps without `kind` will see 'branch' as well.
  kind: MindMapNodeKind;
  /** Set when `kind === 'tag'`. */
  tag?: string;
  /** Set when `kind === 'task'` (link to a real Task). */
  taskId?: string;
  /**
   * When the node is mirrored from a real Task (kind === 'task'), this is
   * the source date the task lives on. We use it to power the "Open task"
   * link in the floating action strip.
   */
  sourceDate?: string;
  onStartEdit: (id: string) => void;
  onCommitEdit: (id: string, text: string) => void;
  onCancelEdit: () => void;
  onAddChild: (id: string) => void;
  onAddSibling: (id: string) => void;
  onDelete: (id: string) => void;
  onCycleColor: (id: string) => void;
  onToggleCollapsed: (id: string) => void;
  onCommitNote: (id: string, note: string) => void;
  onStartNote: (id: string) => void;
  onCycleStatus: (id: string) => void;
  /**
   * Phase 2: right-click on a node opens the kind-mutating context menu.
   * The handler is owned by the parent (MindMapView) which keeps the
   * cursor coords + selected node id in its own state.
   */
  onContextMenu?: (id: string, position: { x: number; y: number }) => void;
  /**
   * Phase 2: open the linked task in TodayView. Only fired for nodes with
   * `kind === 'task'` (the floating action strip shows the button only
   * then).
   */
  onOpenTask?: (taskId: string, date: string) => void;
  /** Phase 2: localized labels for the new actions. */
  language?: 'en' | 'zh';
  isNoteEditing: boolean;
}

const COLOR_CLASSES: Record<MindMapNodeColor, { bg: string; border: string; text: string; handle: string }> = {
  default: {
    bg: 'bg-white/95',
    border: 'border-border-strong',
    text: 'text-text-heading',
    handle: '!bg-text-muted',
  },
  accent: {
    bg: 'bg-[var(--color-accent-light)]',
    border: 'border-[var(--color-accent)]/40',
    text: 'text-text-heading',
    handle: '!bg-[var(--color-accent)]',
  },
  warm: {
    bg: 'bg-[var(--color-warning-light)]',
    border: 'border-[var(--color-warning)]/40',
    text: 'text-text-heading',
    handle: '!bg-[var(--color-warning)]',
  },
  success: {
    bg: 'bg-[var(--color-success-light)]',
    border: 'border-[var(--color-success)]/40',
    text: 'text-text-heading',
    handle: '!bg-[var(--color-success)]',
  },
  warning: {
    bg: 'bg-[var(--color-warning-light)]',
    border: 'border-[var(--color-warning)]/40',
    text: 'text-text-heading',
    handle: '!bg-[var(--color-warning)]',
  },
  danger: {
    bg: 'bg-[var(--color-danger-light)]',
    border: 'border-[var(--color-danger)]/40',
    text: 'text-text-heading',
    handle: '!bg-[var(--color-danger)]',
  },
};

const ROOT_CARD =
  'min-w-[180px] max-w-[280px] px-4 py-2.5 text-base font-semibold shadow-md whitespace-pre-wrap break-words';
const CHILD_CARD =
  'min-w-[140px] max-w-[240px] px-3 py-2 text-sm font-medium shadow-sm whitespace-pre-wrap break-words';

function MindMapNodeImpl({ id, data, selected }: NodeProps) {
  const d = data as MindMapNodeData;
  const palette = COLOR_CLASSES[d.color] ?? COLOR_CLASSES.default;
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState(d.text);
  const [noteDraft, setNoteDraft] = useState(d.note);

  // Sync draft when the external text changes (e.g. another tab edited the map).
  useEffect(() => {
    if (!d.isEditing) setDraft(d.text);
  }, [d.text, d.isEditing]);
  useEffect(() => {
    if (!d.isNoteEditing) setNoteDraft(d.note);
  }, [d.note, d.isNoteEditing]);

  // Auto-focus the input when entering edit mode.
  useEffect(() => {
    if (d.isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [d.isEditing]);
  useEffect(() => {
    if (d.isNoteEditing && noteRef.current) {
      noteRef.current.focus();
    }
  }, [d.isNoteEditing]);

  const commit = useCallback(() => {
    const next = draft.trim();
    if (next !== d.text) {
      d.onCommitEdit(id, next || d.text);
    } else {
      d.onCancelEdit();
    }
  }, [draft, d, id]);

  const cancel = useCallback(() => {
    setDraft(d.text);
    d.onCancelEdit();
  }, [d]);

  const commitNote = useCallback(() => {
    const next = noteDraft;
    if (next !== d.note) {
      d.onCommitNote(id, next);
    }
  }, [noteDraft, d, id]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    } else if (e.key === 'Tab') {
      // Tab while editing inserts a child and continues editing it.
      e.preventDefault();
      d.onCommitEdit(id, draft.trim() || d.text);
      d.onAddChild(id);
    }
  };

  const onNoteKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      commitNote();
    }
  };

  // Auto-grow the textarea to fit content (up to a reasonable cap).
  useEffect(() => {
    if (!inputRef.current) return;
    inputRef.current.style.height = 'auto';
    inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 240)}px`;
  }, [draft, d.isEditing]);

  // Topic Space v2: kind drives the visual treatment. The defaults below
  // mean legacy maps (no `kind`) get the same look as `branch` — no
  // visual regression for v1 data.
  const kind: MindMapNodeKind = d.kind ?? 'branch';
  const kindClass =
    kind === 'tag'
      ? 'opacity-70 border-dashed text-[11px] py-1 px-2.5'
      : kind === 'task'
        ? 'border-l-[3px] border-l-[var(--color-accent)] pl-2.5'
        : kind === 'root'
          ? 'rounded-full'
          : '';

  return (
    <div
      className="relative"
      data-testid={`mindmap-node-${id}`}
      data-kind={kind}
      onContextMenu={(e) => {
        // Phase 2: right-click opens the kind-mutating context menu. The
        // browser's native menu would otherwise intercept the event and
        // print "Reload" / "Inspect", which is wrong inside an app.
        e.preventDefault();
        e.stopPropagation();
        d.onContextMenu?.(id, { x: e.clientX, y: e.clientY });
      }}
    >
      <div
        className={`group relative flex items-start gap-2 rounded-2xl border backdrop-blur-sm transition-all ${palette.bg} ${palette.border} ${kindClass} ${
          d.isRoot ? ROOT_CARD : CHILD_CARD
        } ${
          d.isFocusedMatch
            ? 'ring-2 ring-[var(--color-warning)] shadow-lg'
            : selected || d.isSelected
            ? 'ring-2 ring-[var(--color-accent)] shadow-lg'
            : d.isSearchMatch
            ? 'ring-1 ring-[var(--color-warning)]/50'
            : 'hover:shadow-md'
        }`}
        onDoubleClick={(e) => {
          e.stopPropagation();
          d.onStartEdit(id);
        }}
      >
        <Handle
          type="target"
          position={Position.Left}
          className={`!h-2 !w-2 !border-0 ${palette.handle}`}
        />
        <Handle
          type="source"
          position={Position.Right}
          className={`!h-2 !w-2 !border-0 ${palette.handle}`}
        />

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            d.onCycleStatus(id);
          }}
          className={`nodrag mt-0.5 shrink-0 rounded p-0.5 transition-colors ${
            d.status === 'done'
              ? 'text-[var(--color-success)]'
              : d.status === 'in-progress'
              ? 'text-[var(--color-warning)]'
              : 'text-text-muted/60 hover:text-text-muted'
          }`}
          title={
            d.status === 'done'
              ? '已完成 — 点击切换'
              : d.status === 'in-progress'
              ? '进行中 — 点击切换'
              : '待办 — 点击切换'
          }
          data-testid={`mindmap-status-${id}`}
        >
          {d.status === 'done' ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : d.status === 'in-progress' ? (
            <CircleDot className="h-4 w-4" />
          ) : (
            <Circle className="h-4 w-4" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          {d.isEditing ? (
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              onBlur={commit}
              onClick={(e) => e.stopPropagation()}
              rows={1}
              className={`nodrag w-full resize-none bg-transparent outline-none ${palette.text}`}
              placeholder={d.isRoot ? '中心主题' : '子主题'}
            />
          ) : (
            <div
              className={`${palette.text} ${d.isRoot ? 'text-center' : ''} ${
                d.status === 'done' ? 'line-through opacity-60' : ''
              }`}
            >
              {kind === 'tag' && (
                <TagIcon
                  className="mr-1 inline-block h-3 w-3 align-[-2px] text-text-muted"
                  aria-hidden="true"
                  data-testid={`mindmap-kind-tag-${id}`}
                />
              )}
              {kind === 'task' && d.taskId && (
                <span
                  className="mr-1 inline-flex items-center gap-0.5 text-[10px] text-text-muted"
                  title={`linked to task: ${d.taskId}`}
                  data-testid={`mindmap-kind-task-${id}`}
                >
                  <Link2 className="h-3 w-3" aria-hidden="true" />
                  <span className="font-mono">{d.taskId.slice(-6)}</span>
                </span>
              )}
              {/* TODO(topic-spaces/phase-2): Phase 2 will let the user
                  right-click a node to mutate its kind via the new
                  mindmapsApi.promoteNodeToTask / linkNodeToTask
                  endpoints. For now the kind is read-only. */}
              {d.text || <span className="italic text-text-muted">未命名</span>}
              {d.note && (
                <div className="mt-1 text-[10px] font-normal text-text-muted">
                  📝 已添加备注
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {(selected || d.isSelected) && !d.isEditing && (
        <div
          className="nodrag absolute -bottom-9 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full border border-border bg-white/95 px-1 py-0.5 shadow-md"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => d.onAddChild(id)}
            className="rounded-full p-1 text-text-muted hover:bg-black/5 hover:text-[var(--color-accent)]"
            title="添加子节点 (Tab)"
            data-testid={`mindmap-add-child-${id}`}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          {!d.isRoot && (
            <button
              type="button"
              onClick={() => d.onAddSibling(id)}
              className="rounded-full p-1 text-text-muted hover:bg-black/5 hover:text-[var(--color-accent)]"
              title="添加同级节点 (Enter)"
            >
              <Type className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => d.onStartEdit(id)}
            className="rounded-full p-1 text-text-muted hover:bg-black/5 hover:text-[var(--color-accent)]"
            title="编辑 (双击)"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => d.onStartNote(id)}
            className="rounded-full p-1 text-text-muted hover:bg-black/5 hover:text-[var(--color-accent)]"
            title="备注"
          >
            <StickyNote className="h-3.5 w-3.5" />
          </button>
          {d.hasHiddenChildren ? (
            <button
              type="button"
              onClick={() => d.onToggleCollapsed(id)}
              className="rounded-full p-1 text-text-muted hover:bg-black/5 hover:text-[var(--color-accent)]"
              title="展开子节点"
              data-testid={`mindmap-expand-${id}`}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => d.onToggleCollapsed(id)}
              className="rounded-full p-1 text-text-muted hover:bg-black/5 hover:text-[var(--color-accent)]"
              title="折叠子节点"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => d.onCycleColor(id)}
            className="rounded-full p-1 text-text-muted hover:bg-black/5 hover:text-[var(--color-accent)]"
            title="切换颜色"
          >
            <Palette className="h-3.5 w-3.5" />
          </button>
          {!d.isRoot && (
            <button
              type="button"
              onClick={() => d.onDelete(id)}
              className="rounded-full p-1 text-text-muted hover:bg-[var(--color-danger-light)] hover:text-[var(--color-danger)]"
              title="删除 (Backspace)"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Phase 2: "open the linked Task" affordance lives outside the
          selected-only action strip so the user can always jump from a
          `kind: 'task'` node to TodayView. The icon is small and dim
          until hovered; on selection it picks up the same accent ring
          as the rest of the node. */}
      {kind === 'task' && d.taskId && d.onOpenTask && d.sourceDate && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            d.onOpenTask!(d.taskId!, d.sourceDate!);
          }}
          className="nodrag absolute -right-2 -top-2 rounded-full border border-border bg-white/95 p-1 text-text-muted opacity-60 shadow-sm transition-opacity hover:bg-[var(--color-accent-light)] hover:text-[var(--color-accent)] hover:opacity-100"
          title={
            d.language === 'zh' ? '打开对应 Task' : 'Open linked Task'
          }
          data-testid={`mindmap-open-task-${id}`}
        >
          <ExternalLink className="h-3 w-3" />
        </button>
      )}

      {d.isNoteEditing && (
        <div
          className="nodrag absolute left-full top-0 ml-2 w-64 rounded-md border border-border bg-white/95 p-2 shadow-md"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              备注
            </span>
            <button
              type="button"
              onClick={commitNote}
              className="rounded px-1.5 py-0.5 text-[10px] text-[var(--color-accent)] hover:bg-[var(--color-accent-light)]"
            >
              完成
            </button>
          </div>
          <textarea
            ref={noteRef}
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            onBlur={commitNote}
            onKeyDown={onNoteKeyDown}
            rows={3}
            className="w-full resize-none rounded border border-border bg-white/60 p-1.5 text-xs text-text-main outline-none focus:border-[var(--color-accent)]"
            placeholder="写下更详细的说明、链接、灵感…"
          />
        </div>
      )}
    </div>
  );
}

export const MindMapNode = memo(MindMapNodeImpl);
MindMapNode.displayName = 'MindMapNode';
