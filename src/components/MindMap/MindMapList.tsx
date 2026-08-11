/**
 * Mind map list — the left rail of the mind map workspace.
 *
 * Renders the maps in the active workspace sorted newest-first and offers
 * create / import / export / delete affordances. Selection is owned by
 * the parent.
 */
import { Plus, Network, Trash2, Upload, Download } from 'lucide-react';
import type { MindMap } from '../../api/client';

interface MindMapListProps {
  maps: MindMap[];
  activeId: string | null;
  language: 'en' | 'zh';
  isLoading: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onImport: () => void;
  onExport: (id: string) => void;
  className?: string;
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
  onImport,
  onExport,
  className = '',
}: MindMapListProps) {
  return (
    <div className={`flex h-full w-full shrink-0 flex-col border-r border-border bg-surface/40 sm:w-60 ${className}`} data-testid="mindmap-list">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2.5">
        <div className="flex items-center gap-2 text-text-muted">
          <Network className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase tracking-wider">
            {language === 'zh' ? '思维导图' : 'Mind Maps'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onImport}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-border bg-white/80 text-text-muted shadow-sm transition-colors hover:bg-white hover:text-[var(--color-accent)] sm:min-h-0 sm:min-w-0 sm:p-1"
            title={language === 'zh' ? '从 JSON 导入' : 'Import from JSON'}
            data-testid="mindmap-list-import"
          >
            <Upload className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onCreate}
            className="flex min-h-[44px] items-center gap-1 rounded-md border border-border bg-white/80 px-3 py-1 text-xs font-medium text-text-main shadow-sm transition-colors hover:bg-white hover:text-[var(--color-accent)] sm:min-h-0 sm:px-2"
            title={language === 'zh' ? '新建思维导图' : 'New mind map'}
            data-testid="mindmap-list-new"
          >
            <Plus className="h-3.5 w-3.5" />
            {language === 'zh' ? '新建' : 'New'}
          </button>
        </div>
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
                    className={`flex min-h-14 w-full flex-col justify-center gap-0.5 rounded-md px-2.5 py-2 text-left transition-colors ${
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
                      onExport(m.id);
                    }}
                    className="absolute right-7 top-1.5 hidden rounded p-1 text-text-muted hover:bg-black/5 hover:text-[var(--color-accent)] group-hover:flex"
                    title={language === 'zh' ? '导出 JSON' : 'Export JSON'}
                    aria-label={language === 'zh' ? '导出导图' : 'Export map'}
                    data-testid={`mindmap-list-export-${m.id}`}
                  >
                    <Download className="h-3 w-3" />
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
