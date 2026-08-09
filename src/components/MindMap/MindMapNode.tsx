/**
 * A deliberately small mind-map node.
 *
 * Product model: the root is the topic; every other node is a task. Tags are
 * task metadata, not a separate node kind. Advanced storage fields remain
 * backward-compatible but are intentionally not exposed as competing modes.
 */
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  ExternalLink,
  Pencil,
  Plus,
  Rows3,
  Tags,
  Trash2,
} from 'lucide-react';
import type { MindMapNodeColor, MindMapNodeKind, MindMapNodeStatus } from '../../api/client';

export interface MindMapNodeData extends Record<string, unknown> {
  text: string;
  tags?: string[];
  color: MindMapNodeColor;
  isRoot: boolean;
  isSelected: boolean;
  isEditing: boolean;
  hasChildren?: boolean;
  hasHiddenChildren: boolean;
  collapsed: boolean;
  note: string;
  status: MindMapNodeStatus;
  isSearchMatch: boolean;
  isFocusedMatch: boolean;
  kind: MindMapNodeKind;
  tag?: string;
  taskId?: string;
  sourceDate?: string;
  language?: 'en' | 'zh';
  onStartEdit: (id: string) => void;
  onCommitEdit: (id: string, text: string) => void;
  onCancelEdit: () => void;
  onAddChild: (id: string) => void;
  onAddSibling: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleCollapsed: (id: string) => void;
  onCommitTags?: (id: string, tags: string[]) => void;
  onCycleStatus: (id: string) => void;
  onOpenTask?: (taskId: string, date: string) => void;
  // Legacy callbacks remain optional so old saved maps/tests stay compatible.
  onCycleColor?: (id: string) => void;
  onCommitNote?: (id: string, note: string) => void;
  onStartNote?: (id: string) => void;
  isNoteEditing?: boolean;
}

const ROOT_CARD = 'min-w-[180px] max-w-[280px] px-4 py-3 text-base font-semibold';
const TASK_CARD = 'min-w-[170px] max-w-[260px] px-3 py-2.5 text-sm font-medium';

function parseTags(value: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of value.split(/[\s,，]+/)) {
    const tag = raw.trim().replace(/^#+/, '');
    if (!tag) continue;
    const key = tag.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
  }
  return result;
}

function MindMapNodeImpl({ id, data, selected }: NodeProps) {
  const d = data as MindMapNodeData;
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(d.text);
  const [tagDraft, setTagDraft] = useState((d.tags ?? []).map((tag) => `#${tag}`).join(' '));
  const [tagEditing, setTagEditing] = useState(false);
  const language = d.language ?? 'zh';
  const active = selected || d.isSelected;

  useEffect(() => {
    if (!d.isEditing) setDraft(d.text);
  }, [d.text, d.isEditing]);

  useEffect(() => {
    if (!tagEditing) setTagDraft((d.tags ?? []).map((tag) => `#${tag}`).join(' '));
  }, [d.tags, tagEditing]);

  useEffect(() => {
    if (!d.isEditing || !inputRef.current) return;
    inputRef.current.focus();
    inputRef.current.select();
  }, [d.isEditing]);

  useEffect(() => {
    if (!tagEditing || !tagInputRef.current) return;
    tagInputRef.current.focus();
    tagInputRef.current.select();
  }, [tagEditing]);

  const commit = useCallback(() => {
    const next = draft.trim() || d.text;
    // Always commit: for a newly-added node this is also the moment the
    // parent creates its one corresponding Task.
    d.onCommitEdit(id, next);
  }, [draft, d, id]);

  const cancel = useCallback(() => {
    setDraft(d.text);
    d.onCancelEdit();
  }, [d]);

  const commitTags = useCallback(() => {
    d.onCommitTags?.(id, parseTags(tagDraft));
    setTagEditing(false);
  }, [d, id, tagDraft]);

  const onTitleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      commit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      commit();
      d.onAddChild(id);
    }
  };

  useEffect(() => {
    if (!inputRef.current) return;
    inputRef.current.style.height = 'auto';
    inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 180)}px`;
  }, [draft, d.isEditing]);

  return (
    <div className="relative" data-testid={`mindmap-node-${id}`} data-kind={d.isRoot ? 'root' : 'task'}>
      <div
        className={`group relative flex items-start gap-2 rounded-xl border bg-white/95 shadow-sm transition-[border-color,box-shadow] ${
          d.isRoot ? ROOT_CARD : TASK_CARD
        } ${
          d.isFocusedMatch
            ? 'border-[var(--color-warning)] ring-2 ring-[var(--color-warning)]/30'
            : active
              ? 'border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]/20 shadow-md'
              : d.isSearchMatch
                ? 'border-[var(--color-warning)]/50'
                : 'border-border-strong hover:border-border-strong hover:shadow-md'
        }`}
        onDoubleClick={(event) => {
          event.stopPropagation();
          d.onStartEdit(id);
        }}
      >
        <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-text-muted" />
        <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-text-muted" />

        {!d.isRoot && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              d.onCycleStatus(id);
            }}
            className={`nodrag mt-0.5 shrink-0 rounded p-0.5 ${
              d.status === 'done' ? 'text-[var(--color-success)]' : 'text-text-muted/60 hover:text-text-heading'
            }`}
            title={d.status === 'done' ? (language === 'zh' ? '已完成，点击恢复' : 'Done, click to reopen') : (language === 'zh' ? '标记完成' : 'Mark done')}
            data-testid={`mindmap-status-${id}`}
          >
            {d.status === 'done' ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
          </button>
        )}

        <div className="min-w-0 flex-1">
          {d.isEditing ? (
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onTitleKeyDown}
              onBlur={commit}
              onClick={(event) => event.stopPropagation()}
              rows={1}
              className="nodrag w-full resize-none bg-transparent text-text-heading outline-none"
              placeholder={d.isRoot ? (language === 'zh' ? '中心主题' : 'Topic') : (language === 'zh' ? '任务' : 'Task')}
            />
          ) : (
            <div className={`${d.isRoot ? 'text-center' : ''} text-text-heading ${d.status === 'done' ? 'opacity-55 line-through' : ''}`}>
              {d.text || <span className="italic text-text-muted">{language === 'zh' ? '未命名' : 'Untitled'}</span>}
            </div>
          )}

          {!d.isRoot && (d.tags ?? []).length > 0 && (
            <div className="mt-1.5 flex max-w-[220px] flex-wrap gap-1" data-testid={`mindmap-tags-${id}`}>
              {d.tags.map((tag) => (
                <span key={tag} className="rounded bg-black/[0.045] px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {d.hasChildren && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              d.onToggleCollapsed(id);
            }}
            className="nodrag -mr-1 mt-0.5 rounded p-0.5 text-text-muted hover:bg-black/5 hover:text-text-heading"
            title={d.collapsed ? (language === 'zh' ? '展开子任务' : 'Expand subtasks') : (language === 'zh' ? '折叠子任务' : 'Collapse subtasks')}
          >
            {d.collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>

      {active && !d.isEditing && (
        <div
          className="nodrag absolute left-1/2 top-full z-20 mt-2 flex -translate-x-1/2 items-center gap-0.5 whitespace-nowrap rounded-lg border border-border bg-white/95 p-1 shadow-md"
          onClick={(event) => event.stopPropagation()}
          data-testid={`mindmap-actions-${id}`}
        >
          <button type="button" onClick={() => d.onAddChild(id)} className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-text-main hover:bg-black/5" data-testid={`mindmap-add-child-${id}`}>
            <Plus className="h-3.5 w-3.5" />{language === 'zh' ? '子任务' : 'Subtask'}
          </button>
          {!d.isRoot && (
            <button type="button" onClick={() => d.onAddSibling(id)} className="rounded-md p-1 text-text-muted hover:bg-black/5 hover:text-text-heading" title={language === 'zh' ? '同级任务' : 'Sibling task'}>
              <Rows3 className="h-3.5 w-3.5" />
            </button>
          )}
          <button type="button" onClick={() => d.onStartEdit(id)} className="rounded-md p-1 text-text-muted hover:bg-black/5 hover:text-text-heading" title={language === 'zh' ? '编辑标题' : 'Edit title'}>
            <Pencil className="h-3.5 w-3.5" />
          </button>
          {!d.isRoot && (
            <button type="button" onClick={() => setTagEditing((value) => !value)} className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium ${tagEditing ? 'bg-black/5 text-text-heading' : 'text-text-muted hover:bg-black/5 hover:text-text-heading'}`} data-testid={`mindmap-edit-tags-${id}`}>
              <Tags className="h-3.5 w-3.5" />{language === 'zh' ? '标签' : 'Tags'}
            </button>
          )}
          {!d.isRoot && (
            <button type="button" onClick={() => d.onDelete(id)} className="rounded-md p-1 text-text-muted hover:bg-[var(--color-danger-light)] hover:text-[var(--color-danger)]" title={language === 'zh' ? '删除任务' : 'Delete task'}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {tagEditing && !d.isRoot && (
        <div className="nodrag absolute left-1/2 top-full z-30 mt-12 w-56 -translate-x-1/2 rounded-lg border border-border bg-white/95 p-2 shadow-lg" onClick={(event) => event.stopPropagation()}>
          <input
            ref={tagInputRef}
            value={tagDraft}
            onChange={(event) => setTagDraft(event.target.value)}
            onBlur={commitTags}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitTags();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                setTagEditing(false);
              }
            }}
            placeholder={language === 'zh' ? '#工作 #重要' : '#work #important'}
            className="w-full rounded-md border border-border bg-white px-2 py-1.5 text-xs text-text-main outline-none focus:border-[var(--color-accent)]"
            data-testid={`mindmap-tags-input-${id}`}
          />
          <p className="mt-1 text-[10px] text-text-muted">{language === 'zh' ? '空格或逗号分隔，回车保存' : 'Separate with spaces or commas'}</p>
        </div>
      )}

      {!d.isRoot && d.taskId && d.onOpenTask && d.sourceDate && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            d.onOpenTask?.(d.taskId!, d.sourceDate!);
          }}
          className="nodrag absolute -right-2 -top-2 rounded-full border border-border bg-white p-1 text-text-muted shadow-sm hover:text-[var(--color-accent)]"
          title={language === 'zh' ? '在 Today 中打开' : 'Open in Today'}
          data-testid={`mindmap-open-task-${id}`}
        >
          <ExternalLink className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

export const MindMapNode = memo(MindMapNodeImpl);
MindMapNode.displayName = 'MindMapNode';
