import { X, ExternalLink } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getContext, getJob, getNote, getProposal, getSource } from '../features/v2/api/client';

export interface EntityRef {
  workspaceId: string;
  type: string;
  id: string;
  label?: string;
}

export function openEntity(ref: EntityRef): void {
  window.dispatchEvent(new CustomEvent('df:open-entity', { detail: ref }));
}

export function EntityContextDrawer({ ref, onClose }: { ref: EntityRef | null; onClose: () => void }) {
  const detail = useQuery({
    queryKey: ref ? ['workspace', ref.workspaceId, 'entity-context', ref.type, ref.id] : ['entity-context', 'closed'],
    queryFn: async () => {
      if (!ref) return null;
      switch (ref.type) {
        case 'commitment': return getContext(ref.id);
        case 'source': return getSource(ref.id);
        case 'proposal': return getProposal(ref.id);
        case 'job': return getJob(ref.id);
        case 'note': return getNote(ref.id);
        default: return { ref };
      }
    },
    enabled: Boolean(ref),
  });
  if (!ref) return null;
  return (
    <aside
      role="dialog"
      aria-label="Entity context"
      className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-border bg-surface-elevated shadow-lg"
    >
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-text-muted">{ref.type}</div>
          <h2 className="truncate text-sm font-semibold text-text-heading">{ref.label || ref.id}</h2>
        </div>
        <button onClick={onClose} className="rounded-md p-2 text-text-muted hover:bg-black/5" aria-label="Close context">
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 text-sm">
        <div className="rounded-lg border border-border bg-background/60 p-3">
          <div className="text-xs text-text-muted">实体 ID</div>
          <code className="mt-1 block break-all text-xs text-text-main">{ref.id}</code>
        </div>
        {detail.isLoading && <div className="text-xs text-text-muted">正在加载实体上下文…</div>}
        {detail.error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{(detail.error as Error).message}</div>}
        {detail.data && (
          <div className="space-y-2 rounded-lg border border-border bg-background/60 p-3">
            {Object.entries(flattenSummary(detail.data)).map(([key, value]) => (
              <div key={key} className="grid grid-cols-[110px_1fr] gap-2 text-xs">
                <span className="text-text-muted">{key}</span>
                <span className="break-words text-text-main">{value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <footer className="border-t border-border p-4">
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('df:entity-open-original', { detail: ref }))}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-text-main hover:bg-black/5"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          在原位置打开
        </button>
      </footer>
    </aside>
  );
}

function flattenSummary(value: unknown): Record<string, string> {
  const entity = unwrapEntity(value);
  if (!entity || typeof entity !== 'object') return { value: String(entity ?? '') };
  const source = entity as Record<string, unknown>;
  const preferred = ['title', 'state', 'status', 'outcome', 'nextAction', 'processingStatus', 'kind', 'updatedAt', 'createdAt'];
  const result: Record<string, string> = {};
  for (const key of preferred) {
    const item = source[key];
    if (item !== undefined && item !== null && item !== '') result[key] = typeof item === 'string' ? item : JSON.stringify(item);
  }
  if (Object.keys(result).length === 0) result.details = JSON.stringify(source, null, 2).slice(0, 2000);
  return result;
}

function unwrapEntity(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  return record.commitment ?? record.source ?? record.proposal ?? record.job ?? record.note ?? record;
}
