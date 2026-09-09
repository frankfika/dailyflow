import { useQuery } from '@tanstack/react-query';
import type { MindMap, MindMapNode } from '../../../api/client';
import { mindmapsApi } from '../../../api/client';
import { queryKeys } from '../../../queryKeys';

// ---------------------------------------------------------------------------
// Gallery cover for an event card: a tiny read-only rendering of the event's
// mind map. Reads the lossless map cache (same key the canvas uses) and draws
// nodes as dots + edges as lines at their stored canvas positions, scaled to
// fit. Falls back to a monogram tile while loading / when the map is missing.
// ---------------------------------------------------------------------------

const W = 400;
const H = 200;
const PAD = 20;

const KIND_COLORS: Record<string, string> = {
  root: '#23877B',
  branch: '#94a3b8',
  tag: '#a8a29e',
  task: '#d97706',
  question: '#7c3aed',
  resource: '#0284c7',
  risk: '#dc2626',
};

function bounds(nodes: MindMapNode[]) {
  const xs = nodes.map((n) => n.position.x);
  const ys = nodes.map((n) => n.position.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { minX, minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
}

export function EventMapPreview({ mindmapId, title }: { mindmapId: string; title: string }) {
  const mapQ = useQuery({
    queryKey: queryKeys.mindmap(mindmapId),
    queryFn: () => mindmapsApi.get(mindmapId),
    staleTime: 10 * 60_000,
    retry: false,
  });

  const map: MindMap | undefined = mapQ.data;
  if (!map || map.nodes.length === 0) return <MapFallback title={title} loading={mapQ.isLoading} />;

  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  const { minX, minY, w, h } = bounds(map.nodes);
  const scale = w > 0 || h > 0 ? Math.min((W - PAD * 2) / Math.max(w, 1), (H - PAD * 2) / Math.max(h, 1), 1.5) : 0;
  const project = (n: MindMapNode) => {
    if (!scale) return { x: W / 2, y: H / 2 };
    const cx = (W - w * scale) / 2;
    const cy = (H - h * scale) / 2;
    return { x: cx + (n.position.x - minX) * scale, y: cy + (n.position.y - minY) * scale };
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" aria-hidden="true" data-testid="event-map-preview">
      {map.edges.map((edge) => {
        const from = byId.get(edge.source);
        const to = byId.get(edge.target);
        if (!from || !to) return null;
        const a = project(from);
        const b = project(to);
        return <line key={edge.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="currentColor" strokeWidth={1.5} className="text-black/10 dark:text-white/10" />;
      })}
      {map.nodes.map((node) => {
        const p = project(node);
        const kind = node.kind || 'branch';
        const isRoot = kind === 'root';
        return (
          <circle
            key={node.id}
            cx={p.x}
            cy={p.y}
            r={isRoot ? 10 : 6}
            fill={KIND_COLORS[kind] ?? KIND_COLORS.branch}
            opacity={node.status === 'done' ? 0.35 : 1}
          />
        );
      })}
    </svg>
  );
}

function MapFallback({ title, loading }: { title: string; loading: boolean }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#23877B]/10 via-transparent to-black/[0.02]" aria-hidden="true" data-testid="event-map-fallback">
      {loading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#23877B]/30 border-t-[#23877B]" />
      ) : (
        <span className="select-none text-2xl font-semibold text-[#23877B]/40">{title.trim().charAt(0).toUpperCase() || '·'}</span>
      )}
    </div>
  );
}
