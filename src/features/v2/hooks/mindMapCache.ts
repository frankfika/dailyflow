import type { QueryClient } from '@tanstack/react-query';
import { mindmapsApi, type MindMap } from '../../../api/client';
import { queryKeys } from '../../../queryKeys';

// ---------------------------------------------------------------------------
// Lossless Mind-map snapshot cache, shared by the Events and MindMap surfaces.
//
// Every map-writing mutation builds its payload from a *full* `MindMap`
// document instead of the lossy `EventDetail` projection (the projection drops
// `kind` / `taskId` / `taskDate` / `status` / `color` / `planOrder`). Because
// `PUT /mindmaps/:id` overwrites the whole `nodes` array, feeding the
// projection back in would silently strip task bindings. Keeping the full
// document in the TanStack cache (keyed by `queryKeys.mindmap`) lets us read
// it back for the next write without re-GETting the map — which was the
// source of the "不丝滑" lag in the Events canvas.
// ---------------------------------------------------------------------------

// Kill switch: flipping this to `false` forces a GET before every mutation,
// restoring the original round-trip behavior. The (harmless) writeEventMap
// calls and scope serialization stay regardless.
const USE_MAP_SNAPSHOT = true;

// Serialize every map-writing mutation so two rapid edits (Tab/Enter node
// creation) can't each read the same snapshot and have the second full-
// overwrite PUT drop the first's node. TanStack Query v5 runs mutations
// sharing a `scope.id` strictly in order.
export const MAP_WRITE_SCOPE = { id: 'event-mindmap-write' } as const;

export function writeEventMap(qc: QueryClient, map: MindMap): void {
  qc.setQueryData<MindMap>(queryKeys.mindmap(map.id), map);
}

export function dropEventMap(qc: QueryClient, mindmapId: string): void {
  qc.removeQueries({ queryKey: queryKeys.mindmap(mindmapId) });
}

/**
 * Return the freshest full `MindMap` for `mindmapId`, pulling from the cache
 * when the snapshot is present and (if given) contains every required node id.
 * If the snapshot is missing / provably stale, GET once and cache it.
 */
export async function readEventMap(
  qc: QueryClient,
  mindmapId: string,
  requiredNodeIds?: string[],
): Promise<MindMap> {
  if (USE_MAP_SNAPSHOT) {
    const snapshot = qc.getQueryData<MindMap>(queryKeys.mindmap(mindmapId));
    if (snapshot) {
      const nodeIds = new Set(snapshot.nodes.map((n) => n.id));
      if (!requiredNodeIds || requiredNodeIds.every((id) => nodeIds.has(id))) return snapshot;
    }
  }
  const map = await mindmapsApi.get(mindmapId);
  writeEventMap(qc, map);
  return map;
}