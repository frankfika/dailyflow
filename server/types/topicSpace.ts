/**
 * Topic Space data model.
 *
 * A Topic Space is the v2 successor of `ThinkingWorkspace`: it groups
 * one dominant MindMap and a list of Tasks under a single Work/Life
 * bucket. See `docs/topic-spaces/SPEC.md` for the full design.
 *
 * Backwards compatibility:
 *   - Existing `ThinkingWorkspace` files (frontmatter `kind: workspace`,
 *     or no kind) are read tolerantly: the four new fields are filled
 *     with defaults at parse time and the file is left untouched.
 *   - A file is only written with `kind: topic-space` when the user
 *     either creates a new TopicSpace or updates an existing one via
 *     `updateTopicSpace` (which is the explicit upgrade point per
 *     SPEC §2.1).
 */
import type {
  ThinkingWorkspace,
  ThinkingWorkspaceStatus,
  WorkspaceTimelineEntry,
} from './task.js';

export type TopicSpaceContext = 'work' | 'life' | 'unclassified';

export type TopicSpaceDefaultView = 'mindmap' | 'list';

/**
 * A Topic Space.
 *
 * Extends the shape of a ThinkingWorkspace with four new fields. New
 * fields are intentionally read-tolerant: see SPEC §2.1.
 */
export interface TopicSpace {
  id: string;
  title: string;
  /** New discriminator; old files keep `kind: 'workspace'`. */
  kind: 'topic-space' | 'workspace';
  type: ThinkingWorkspace['type'];
  status: ThinkingWorkspaceStatus;
  context: TopicSpaceContext;
  mindmapId: string;
  order: number;
  defaultView: TopicSpaceDefaultView;
  projectId?: string;
  tags: string[];
  intent: string;
  scratchpad: string;
  brief: string;
  journey: string;
  tasksMarkdown: string;
  mindmapMarkdown: string;
  taskIds: string[];
  linkedNoteIds: string[];
  timeline: WorkspaceTimelineEntry[];
  createdAt: string;
  updatedAt: string;
  filePath?: string;
}

/**
 * Allowed filters for `listTopicSpaces`.
 *
 *   - `context`  — 'work' | 'life' | 'unclassified'
 *   - `query`    — substring match on title / intent / scratchpad
 */
export interface TopicSpaceFilters {
  context?: TopicSpaceContext;
  query?: string;
}

/** Patch shape accepted by `updateTopicSpace`. All fields optional. */
export interface TopicSpaceUpdate {
  title?: string;
  context?: TopicSpaceContext;
  defaultView?: TopicSpaceDefaultView;
  order?: number;
  status?: ThinkingWorkspaceStatus;
  tags?: string[];
  intent?: string;
  scratchpad?: string;
  brief?: string;
  journey?: string;
  tasksMarkdown?: string;
  mindmapMarkdown?: string;
  taskIds?: string[];
  linkedNoteIds?: string[];
  mindmapId?: string;
  type?: ThinkingWorkspace['type'];
  projectId?: string | null;
}

/** Body for `POST /api/topic-spaces/:id/reorder`. */
export interface TopicSpaceReorderBody {
  context: TopicSpaceContext;
  orderedIds: string[];
}

/** Defaults used when a legacy workspace file is read. */
export const TOPIC_SPACE_DEFAULTS = {
  context: 'unclassified' as TopicSpaceContext,
  order: 0,
  defaultView: 'mindmap' as TopicSpaceDefaultView,
} as const;
