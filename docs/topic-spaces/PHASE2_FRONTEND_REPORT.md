# Topic Space Phase 2-4 (frontend) — Client Agent Report

> **Branch:** main
> **Commits:**
> - `b691d2f` test(mindmap): consolidate task-mirror Open button test
> - `f396efa` feat(topic-spaces/phase-2-frontend): dual view, node kind editing, task mirror, tag filter
> - (preceding) `f1eb3d2` server work landed first

## Files created (this round)

| File | What it does |
|------|--------------|
| `src/components/MindMap/NodeContextMenu.tsx` | Right-click menu on a node (4 actions; root hides 2). Inline search-driven task picker for the Link action. |
| `src/components/MindMap/NodeContextMenu.test.tsx` | 9 cases (all 4 actions, root kind, tag-disabled state, link picker, Escape behavior, outside click, no-render when closed, EN labels). |
| `src/components/TopicSpaceView/TaskListView.tsx` | List view of a space's bound tasks. Header with stats, "已绑定到 [Space]" indicator, unlink button (two-step confirm), empty state, tag-aware filter. |
| `src/components/TopicSpaceView/TaskListView.test.tsx` | 5 cases (header, empty, unlink flow, tag filter, click-to-open). |
| `src/components/TopicSpaceView/TagFilterRow.tsx` | Chip-style tag filter. Multi-select. "Clear" pill on the right. Empty state placeholder. |
| `src/components/TopicSpaceView/TagFilterRow.test.tsx` | 4 cases (empty state, chip toggle, dedupe input, clear pill). |
| `src/hooks/useMindMapActions.ts` | 4 React Query mutations: `usePromoteNodeToTask`, `useLinkNodeToTask`, `useUpdateNodeKind`, `useUpdateTaskSpace`. Each updates only the relevant query key. |
| `src/hooks/useMindMapActions.test.tsx` | 4 cases (cache updates, tag extra passes through, tasks invalidation). |
| `src/components/MindMap/MindMapView.mirror.test.tsx` | 3 cases (task title + status sync on data refresh, Open task button visibility by kind, callback wiring). |

## Files modified

| File | What changed |
|------|--------------|
| `src/api/client.ts` | Added `mindmapsApi.promoteNodeToTask`, `linkNodeToTask`, `updateNodeKind`, `tasksApi.updateSpace`, `tasksApi.filterBySpace`. |
| `src/queryKeys.ts` | Added `mindmap(id)`, `tasksRoot()` keys for the new mutation cache writes. |
| `src/components/MindMap/MindMapNode.tsx` | Right-click handler (with `e.preventDefault()` to suppress the browser menu). `onContextMenu`/`onOpenTask`/`language`/`sourceDate` added to the data type. "Open task" link button in the action strip (kind === 'task' only). |
| `src/components/MindMap/MindMapCanvas.tsx` | Three new props plumbed: `onNodeContextMenu`, `onNodeOpenTask`, `taskSourceDateByNodeId`. Each is held in a ref so the per-node data factory can close over fresh values without churning the memo. `language` threaded into per-node data. |
| `src/components/MindMap/MindMapView.tsx` | 6 new props: `activeContext`, `todayDate`, `linkableTasks`, `onOpenTask` (plus the existing `activeSpaceId`, `topicSpaces`). Context-menu state, 4 mutation handlers with toasts, task-mirror `useEffect` that one-way-syncs node `text` + `status` from the latest `linkableTasks`. Mirror skips the undo stack and runs through the existing debounced save. |
| `src/components/TaskCard.tsx` | Phase 4: "已绑定到 [Space]" indicator + unlink × on task cards. New props `spaceTitle`, `onUnlinkFromSpace`. |
| `src/App.tsx` | View switcher (mindmap / list) above the canvas. `activeSpace` derivation, `viewOverride` for optimistic local flip, `tagFilter` state. Three new callbacks: `handleSetView` (persists via `useUpdateTopicSpace`), `handleOpenTask` (switches to Today tab on the right date), `handleUnlinkTask` (clears the binding). Local `Task` type extended with optional `spaceId`. |

## Test count

- **25 new test cases** across 5 files
- **All 550 project tests pass** (525 pre-existing + 25 new)
- `npm run lint` (tsc --noEmit): clean
- `npm run build`: clean

## Open issues / TODOs

- The `^space:xxx` markdown marker (Phase 4 of SPEC §2.3) is server-side only; the client reads `task.spaceId` straight from the API response. If the server later needs to surface the marker, we can extend the indicator.
- The list view's task source is `tasksApi.getByDate(currentFileDate)` filtered by `spaceId` — i.e. today's tasks only. SPEC §2.4 acknowledges this Phase 2 simplification; a Phase 4 enhancement could scan across days.
- The `defaultView` mutation is optimistic (local flip + persist) with revert on error. The revert sets `viewOverride` back to `null` so the server's `defaultView` re-takes effect.
- The mirror effect's `scheduleSave` call uses the existing debounced autosave so mirror changes piggyback on the same write batch. No special persistence path.

## Things I did NOT touch (per instructions)

- `e2e/*` (verifier's territory — `e2e/mindmap-visual.spec.ts` was already modified when I started, I left it alone)
- `server/*` (server agent's territory)
- Demo files: `_demo-audio/`, `_demo-compose.py`, `_demo-out/`, `_demo-record.mjs`, `scripts/_demo-record.mjs`, `scripts/_df-mmt-debug.mjs`
- Frank's WIP templates: `src/components/MindMap/templates.{ts,test.ts}`
- Visual assets modified by other agents' test runs: `visual-mindmap-*.png`, `visual-topic-spaces-1-created.png`

## Commit message used

```
b691d2f test(mindmap): consolidate task-mirror Open button test to one render
```
and (the larger phase commit that was made by the parent session with my work):
```
f396efa feat(topic-spaces/phase-2-frontend): dual view, node kind editing, task mirror, tag filter
```
