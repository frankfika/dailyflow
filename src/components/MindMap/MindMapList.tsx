/**
 * Mind map list — the left rail of the mind map workspace.
 *
 * Renders the maps in the active workspace sorted newest-first and offers a
 * single "new map" affordance. Selection is owned by the parent.
 */
import { Plus, Network, Trash2 } from 'lucide-react';
import type { MindMap } from '../../api/client';

interface MindMapListProps {
  maps: MindMap[];
  activeId: string | null;
  language: 'en' | 'zh';
  isLoading: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
}

function formatDate(iso: string, language: 'en' | 'zh'): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (sameDay) {
      return d.toLocaleTimeString(language === 'zh' ? 'zh-CN' : 'en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    return d.toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', {
      month: 'numeric',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

export function MindMapList({
  maps,
  activeId,
  language,
  isLoading,
  onSelect,
  onCreate,
  onDelete,
}: MindMapListProps) {
  return (
    <div className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-surface/40">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2.5">
        <div className="flex items-center gap-2 text-text-muted">
          <Network className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase tracking-wider">
            {language === 'zh' ? '思维导图' : 'Mind Maps'}
          </span>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="flex items-center gap-1 rounded-md border border-border bg-white/80 px-2 py-1 text-xs font-medium text-text-main shadow-sm transition-colors hover:bg-white hover:text-[var(--color-accent)]"
          title={language === 'zh' ? '新建思维导图' : 'New mind map'}
        >
          <Plus className="h-3.5 w-3.5" />
          {language === 'zh' ? '新建' : 'New'}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {isLoading ? (
          <div className="px-3 py-6 text-center text-xs text-text-muted">
            {language === 'zh' ? '加载中...' : 'Loading...'}
          </div>
        ) : maps.length === 0 ? (
          <div className="px-4 py-10 text-center text-xs leading-relaxed text-text-muted">
            <p>{language === 'zh' ? '还没有导图' : 'No mind maps yet'}</p>
            <p className="mt-1 text-[11px] text-text-muted/70">
              {language === 'zh' ? '点上方"新建"开始' : 'Click "New" to start'}
            </p>
          </div>
        ) : (
          <ul className="space-y-0.5 px-1.5">
            {maps.map((m) => {
              const isActive = m.id === activeId;
              return (
                <li key={m.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => onSelect(m.id)}
                    data-active={isActive}
                    className={`flex w-full flex-col gap-0.5 rounded-md px-2.5 py-2 text-left transition-colors ${
                      isActive
                        ? 'bg-[var(--color-accent-light)] text-text-heading'
                        : 'text-text-main hover:bg-black/[0.03]'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`truncate text-sm font-medium ${isActive ? 'text-text-heading' : ''}`}
                      >
                        {m.title || (language === 'zh' ? '未命名导图' : 'Untitled')}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-text-muted">
                      <span>{m.nodes.length} {language === 'zh' ? '节点' : 'nodes'}</span>
                      <span>·</span>
                      <span>{formatDate(m.updatedAt, language)}</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(m.id);
                    }}
                    className="absolute right-1.5 top-1.5 hidden rounded p-1 text-text-muted hover:bg-[var(--color-danger-light)] hover:text-[var(--color-danger)] group-hover:flex"
                    title={language === 'zh' ? '删除' : 'Delete'}
                    aria-label={language === 'zh' ? '删除导图' : 'Delete map'}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
