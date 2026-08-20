/**
 * A deliberately small mind-map node.
 *
 * Product model: the root is the topic; ordinary branch nodes hold thinking
 * structure; only nodes explicitly promoted/linked as `kind: task` are tasks.
 */
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  AlertTriangle,
  CheckCircle2,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Circle,
  ExternalLink,
  FileText,
  HelpCircle,
  ListTodo,
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
  onMakeTask?: (id: string) => void;
  onOpenTask?: (taskId: string, date: string) => void;
  // Legacy callbacks remain optional so old saved maps/tests stay compatible.
  onCycleColor?: (id: string) => void;
  onCommitNote?: (id: string, note: string) => void;
  onStartNote?: (id: string) => void;
  isNoteEditing?: boolean;
}

const ROOT_CARD = 'min-w-[180px] max-w-[280px] px-4 py-3 text-base font-semibold';
const TASK_CARD = 'min-w-[170px] max-w-[260px] px-3 py-2.5 text-sm font-medium';

/**
 * Sprint 1 / Gap 1 — visual differentiation for the three Phase-2
 * semantic kinds. Each kind gets:
 *   - a colored left border to mark it as a label-only role;
 *   - a lucide icon used inside the metadata badge;
 *   - a label for the badge (zh / en);
 *   - the design token name used as the badge background tint.
 *
 * Colors are deliberately distinct from `task` (accent / teal) so a
 * single glance can separate "do this work" from "look at this
 * question / find this reference / watch out for this risk".
 */
type SemanticKind = 'question' | 'resource' | 'risk';

interface KindVisual {
  /** Lucide icon component (rendered at h-3 w-3). */
  Icon: typeof HelpCircle;
  /** Border / accent color (CSS var token, used inline). */
  colorVar: string;
  /** Tint for the metadata badge background. */
  bgVar: string;
  /** Foreground color for the metadata badge. */
  fgVar: string;
}

const KIND_VISUALS: Record<SemanticKind, KindVisual> = {
  question: {
    Icon: HelpCircle,
    colorVar: '--color-info',
    bgVar: '--color-info-light',
    fgVar: '--color-info',
  },
  resource: {
    Icon: FileText,
    colorVar: '--color-text-muted',
    bgVar: '--color-border',
    fgVar: '--color-text-muted',
  },
  risk: {
    Icon: AlertTriangle,
    colorVar: '--color-warning',
    bgVar: '--color-warning-light',
    fgVar: '--color-warning',
  },
};

function isSemanticKind(kind: MindMapNodeKind): kind is SemanticKind {
  return kind === 'question' || kind === 'resource' || kind === 'risk';
}

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
  const nodeKind: MindMapNodeKind = d.isRoot ? 'root' : (d.kind ?? 'branch');
  const isTask = nodeKind === 'task';
  // Sprint 1 / Gap 1: a semantic kind (question / resource / risk) gets
  // its own colored left border + iconified metadata badge. Tasks still
  // take precedence in any visual rule that overlaps (e.g. status cycle).
  const kindVisual = isSemanticKind(nodeKind) ? KIND_VISUALS[nodeKind] : null;
  // A label is matched 1:1 with the kind, so a tiny switch is clearer
  // than indexing a record that would need a fallback for the other
  // four kinds.
  const kindLabel: string | null = (() => {
    if (nodeKind === 'question') return language === 'zh' ? '疑问' : 'Question';
    if (nodeKind === 'resource') return language === 'zh' ? '资料' : 'Resource';
    if (nodeKind === 'risk') return language === 'zh' ? '风险' : 'Risk';
    return null;
  })();

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
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key === 'Enter') {
      event.preventDefault();
      commit();
      d.onMakeTask?.(id);
    } else if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      commit();
      d.onAddChild(id);
    } else if (event.key === 'Enter' && !event.shiftKey) {
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
    <div className="relative" data-testid={`mindmap-node-${id}`} data-kind={nodeKind}>
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
                : isTask
                  ? 'border-[var(--color-accent)]/35 hover:border-[var(--color-accent)]/60 hover:shadow-md'
                  : 'border-border-strong hover:border-border-strong hover:shadow-md'
        } ${
          isTask
            ? 'border-l-[3px] border-l-[var(--color-accent)]'
            : kindVisual
              ? 'border-l-[3px]'
              : ''
        }`}
        style={kindVisual ? { borderLeftColor: `var(${kindVisual.colorVar})` } : undefined}
        onDoubleClick={(event) => {
          event.stopPropagation();
          d.onStartEdit(id);
        }}
      >
        <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-text-muted" />
        <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-text-muted" />

        {isTask && (
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

          {isTask && (
            <div className="mt-1.5 flex items-center gap-1.5 text-[10px] font-medium text-text-muted" data-testid={`mindmap-task-meta-${id}`}>
              <span className="inline-flex items-center gap-1 rounded bg-[var(--color-accent-light)] px-1.5 py-0.5 text-[var(--color-accent)]">
                <ListTodo className="h-3 w-3" />
                {language === 'zh' ? '任务' : 'Task'}
              </span>
              {d.sourceDate && (
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <CalendarDays className="h-3 w-3" />
                  {d.sourceDate}
                </span>
              )}
            </div>
          )}

          {kindVisual && kindLabel && (
            <div
              className="mt-1.5 flex items-center gap-1.5 text-[10px] font-medium text-text-muted"
              data-testid={`mindmap-${nodeKind}-meta-${id}`}
            >
              <span
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5"
                style={{
                  background: `var(${kindVisual.bgVar})`,
                  color: `var(${kindVisual.fgVar})`,
                }}
              >
                <kindVisual.Icon className="h-3 w-3" />
                {kindLabel}
              </span>
            </div>
          )}

          {isTask && (d.tags ?? []).length > 0 && (
            <div className="mt-1.5 flex max-w-[220px] flex-wrap gap-1" data-testid={`mindmap-tags-${id}`}>
              {(d.tags ?? []).map((tag) => (
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
            title={d.collapsed ? (language === 'zh' ? '展开子节点' : 'Expand child nodes') : (language === 'zh' ? '折叠子节点' : 'Collapse child nodes')}
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
            <Plus className="h-3.5 w-3.5" />{d.isRoot ? (language === 'zh' ? '一级主题' : 'Top-level') : (language === 'zh' ? '子节点' : 'Child')}
          </button>
          {!d.isRoot && (
            <button type="button" onClick={() => d.onAddSibling(id)} className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-text-muted hover:bg-black/5 hover:text-text-heading" title={language === 'zh' ? '添加同级节点' : 'Add sibling node'} data-testid={`mindmap-add-sibling-${id}`}>
              <Rows3 className="h-3.5 w-3.5" />{language === 'zh' ? '同级' : 'Sibling'}
            </button>
          )}
          {!d.isRoot && !isTask && d.onMakeTask && (
            <button type="button" onClick={() => d.onMakeTask?.(id)} className="flex items-center gap-1 rounded-md bg-[var(--color-accent-light)] px-2 py-1 text-[11px] font-medium text-[var(--color-accent)] hover:brightness-95" data-testid={`mindmap-make-task-${id}`}>
              <ListTodo className="h-3.5 w-3.5" />{language === 'zh' ? '添加到 Today' : 'Add to Today'}
            </button>
          )}
          <button type="button" onClick={() => d.onStartEdit(id)} className="rounded-md p-1 text-text-muted hover:bg-black/5 hover:text-text-heading" title={language === 'zh' ? '编辑标题' : 'Edit title'}>
            <Pencil className="h-3.5 w-3.5" />
          </button>
          {isTask && (
            <button type="button" onClick={() => setTagEditing((value) => !value)} className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium ${tagEditing ? 'bg-black/5 text-text-heading' : 'text-text-muted hover:bg-black/5 hover:text-text-heading'}`} data-testid={`mindmap-edit-tags-${id}`}>
              <Tags className="h-3.5 w-3.5" />{language === 'zh' ? '标签' : 'Tags'}
            </button>
          )}
          {!d.isRoot && (
            <button type="button" onClick={() => d.onDelete(id)} className="rounded-md p-1 text-text-muted hover:bg-[var(--color-danger-light)] hover:text-[var(--color-danger)]" title={language === 'zh' ? '删除节点' : 'Delete node'}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {tagEditing && isTask && (
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
