/**
 * Custom React Flow node for the mind map canvas.
 *
 * The node renders a rounded card that matches DailyFlow's "native minimal"
 * surface treatment. The card hosts:
 *   - the node text (editable when `isEditing` is true)
 *   - a small footer of contextual actions when selected
 *   - a note editor that appears below the card when the node is selected
 *     and has a non-empty note (or the user just clicked the note button)
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
} from 'lucide-react';
import type { MindMapNodeColor } from '../../api/client';

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

  return (
    <div
      className="relative"
      data-testid={`mindmap-node-${id}`}
    >
      <div
        className={`group relative rounded-2xl border backdrop-blur-sm transition-all ${palette.bg} ${palette.border} ${
          d.isRoot ? ROOT_CARD : CHILD_CARD
        } ${selected || d.isSelected ? 'ring-2 ring-[var(--color-accent)] shadow-lg' : 'hover:shadow-md'}`}
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
          <div className={`${palette.text} ${d.isRoot ? 'text-center' : ''}`}>
            {d.text || <span className="italic text-text-muted">未命名</span>}
            {(d.note || d.isRoot) && d.note && (
              <div className="mt-1 text-[10px] font-normal text-text-muted">
                📝 已添加备注
              </div>
            )}
          </div>
        )}
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
