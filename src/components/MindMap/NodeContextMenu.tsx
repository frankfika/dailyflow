/**
 * NodeContextMenu — the right-click menu on a mind map node.
 *
 * The menu is controlled (parent owns `open` / `position`) and only
 * renders the actions that make sense for the node's current `kind`:
 *   - `root`  — no menu; the root is the space's anchor and can't be
 *                converted, linked, or re-classified.
 *   - `task`  — Link / Tag / Branch apply; promoting again would duplicate a task.
 *   - `tag`   — Tag is greyed out; Branch / Link apply.
 *   - `branch`— all four actions are live.
 *
 * Click outside / Escape closes the menu (the parent is responsible for
 * wiring the `onClose` handler — this component is presentational).
 */
import { useEffect, useRef, useState } from 'react';
import {
  CheckSquare,
  Link2,
  Tag as TagIcon,
  XCircle,
  Check,
} from 'lucide-react';
import type { MindMapNodeKind } from '../../api/client';
import type { TaskInput } from '../../api/client';

export interface NodeContextMenuTaskOption {
  id: string;
  title: string;
  status: TaskInput['status'];
  date: string;
}

export interface NodeContextMenuProps {
  open: boolean;
  position: { x: number; y: number } | null;
  /** Current kind of the node the menu is acting on. */
  kind: MindMapNodeKind;
  language: 'en' | 'zh';
  /**
   * Tasks to offer in the "关联已有 Task" inline picker. The parent
   * typically passes the tasks of the active space; the menu itself
   * just renders a filterable list.
   */
  taskOptions?: ReadonlyArray<NodeContextMenuTaskOption>;
  onPromote: () => void;
  onLink: (taskId: string, date: string) => void;
  onSetTag: () => void;
  onUnclassify: () => void;
  onClose: () => void;
}

const LANG = {
  zh: {
    promote: '转为待办',
    link: '关联已有 Task',
    setTag: '设为 Tag',
    unclassify: '取消分类',
    searchTasks: '搜索任务…',
    empty: '该主题下没有任务',
    close: '关闭',
  },
  en: {
    promote: 'Convert to Task',
    link: 'Link to existing Task',
    setTag: 'Mark as Tag',
    unclassify: 'Unclassify',
    searchTasks: 'Search tasks…',
    empty: 'No tasks in this space',
    close: 'Close',
  },
};

export function NodeContextMenu({
  open,
  position,
  kind,
  language,
  taskOptions = [],
  onPromote,
  onLink,
  onSetTag,
  onUnclassify,
  onClose,
}: NodeContextMenuProps) {
  const L = LANG[language];
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [linkMode, setLinkMode] = useState(false);
  const [linkQuery, setLinkQuery] = useState('');

  // Reset the inline link picker whenever the menu re-opens.
  useEffect(() => {
    if (open) {
      setLinkMode(false);
      setLinkQuery('');
    }
  }, [open]);

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open || !position || kind === 'root') return null;

  // The "tag" action is a no-op for nodes that are already tags (their
  // `tag` label is the node text). We still render the row but disabled,
  // so the user can see why it doesn't fire.
  const setTagDisabled = kind === 'tag';

  const filtered = linkQuery.trim()
    ? taskOptions.filter((t) =>
        t.title.toLowerCase().includes(linkQuery.trim().toLowerCase()),
      )
    : taskOptions;

  return (
    <div
      ref={rootRef}
      role="menu"
      data-testid="node-context-menu"
      data-kind={kind}
      style={{
        position: 'fixed',
        top: position.y,
        left: position.x,
        zIndex: 1000,
      }}
      className="min-w-[200px] max-w-[280px] rounded-md border border-border bg-white/95 p-1 shadow-lg"
      onClick={(e) => e.stopPropagation()}
    >
      {!linkMode ? (
        <>
          {kind === 'branch' && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onPromote();
                onClose();
              }}
              data-testid="node-context-menu-promote"
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] text-text-main transition-colors hover:bg-black/[0.05]"
            >
              <CheckSquare className="h-3.5 w-3.5 text-text-muted" />
              <span className="flex-1">{L.promote}</span>
            </button>
          )}

          <button
            type="button"
            role="menuitem"
            onClick={() => setLinkMode(true)}
            data-testid="node-context-menu-link"
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] text-text-main transition-colors hover:bg-black/[0.05]"
          >
            <Link2 className="h-3.5 w-3.5 text-text-muted" />
            <span className="flex-1">{L.link}</span>
          </button>

          <button
              type="button"
              role="menuitem"
              onClick={() => {
                if (setTagDisabled) return;
                onSetTag();
                onClose();
              }}
              disabled={setTagDisabled}
              data-testid="node-context-menu-set-tag"
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] text-text-main transition-colors hover:bg-black/[0.05] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <TagIcon className="h-3.5 w-3.5 text-text-muted" />
              <span className="flex-1">{L.setTag}</span>
              {kind === 'tag' && <Check className="h-3 w-3 text-[var(--color-accent)]" />}
          </button>

          <button
              type="button"
              role="menuitem"
              onClick={() => {
                onUnclassify();
                onClose();
              }}
              data-testid="node-context-menu-unclassify"
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] text-text-main transition-colors hover:bg-black/[0.05]"
            >
              <XCircle className="h-3.5 w-3.5 text-text-muted" />
              <span className="flex-1">{L.unclassify}</span>
          </button>
        </>
      ) : (
        <div data-testid="node-context-menu-link-picker" className="p-1">
          <input
            autoFocus
            value={linkQuery}
            onChange={(e) => setLinkQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                // Returning to the main menu is NOT the same as closing
                // the menu. We intentionally don't call onClose here —
                // the user pressed Escape inside the picker to back out.
                setLinkMode(false);
              }
            }}
            placeholder={L.searchTasks}
            className="w-full rounded border border-border bg-white/60 px-1.5 py-1 text-[12px] outline-none focus:border-[var(--color-accent)]"
            data-testid="node-context-menu-link-input"
          />
          <ul
            className="mt-1 max-h-48 overflow-y-auto"
            data-testid="node-context-menu-link-list"
          >
            {filtered.length === 0 ? (
              <li className="px-2 py-1 text-[11px] text-text-muted">{L.empty}</li>
            ) : (
              filtered.slice(0, 20).map((t) => (
                <li key={`${t.id}-${t.date}`}>
                  <button
                    type="button"
                    onClick={() => {
                      onLink(t.id, t.date);
                      onClose();
                    }}
                    data-testid={`node-context-menu-link-option-${t.id}`}
                    className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[12px] text-text-main transition-colors hover:bg-black/[0.05]"
                  >
                    {t.status === 'done' ? (
                      <Check className="h-3 w-3 text-[var(--color-success)]" />
                    ) : (
                      <span className="h-3 w-3 rounded-full border border-border" />
                    )}
                    <span className="min-w-0 flex-1 truncate">{t.title}</span>
                    <span className="shrink-0 text-[10px] text-text-muted">{t.date}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
