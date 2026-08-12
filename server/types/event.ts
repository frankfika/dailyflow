export type EventContext = 'work' | 'life';
export type EventStatus = 'active' | 'completed' | 'archived';
export type ExecutionStatus = 'todo' | 'done';
export type TagSuggestionState = 'suggested' | 'accepted' | 'rejected';

export interface SuggestedTag {
  value: string;
  source: 'ai';
  confidence: number;
  state: TagSuggestionState;
}

export interface EventSummary {
  id: string;
  /** Internal compatibility join key. Never render this identifier. */
  mindmapId?: string;
  title: string;
  context: EventContext;
  status: EventStatus;
  progress: { done: number; total: number };
  effectiveTags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface EventExecution {
  taskId: string;
  status: ExecutionStatus;
  scheduledDate: string;
  deadline?: string;
  priority?: 'high' | 'medium' | 'low';
  completedAt?: string;
}

export interface EventNode {
  id: string;
  eventId: string;
  parentId?: string;
  text: string;
  note?: string;
  position: { x: number; y: number };
  collapsed?: boolean;
  manualTags: string[];
  aiTags: SuggestedTag[];
  execution?: EventExecution;
}

export interface EventDetail extends EventSummary {
  /** Compatibility storage id. Never render this value or label it as MindMap in Event UI. */
  mindmapId: string;
  rootNodeId: string;
  nodes: EventNode[];
  edges: Array<{ id: string; source: string; target: string }>;
  manualTags: string[];
  aiTags: SuggestedTag[];
  integrity: {
    missingMap: boolean;
    sourceContextWasUnclassified: boolean;
    orphanTaskIds: string[];
    duplicateNodeTaskIds: string[];
  };
}

export interface StandaloneTask {
  id: string;
  title: string;
  status: ExecutionStatus;
  scheduledDate: string;
  deadline?: string;
  note?: string;
  manualTags: string[];
  aiTags: SuggestedTag[];
}

export type TodayItem =
  | {
      kind: 'event-node';
      id: string; // `event-node:${eventId}:${nodeId}`
      eventId: string;
      nodeId: string;
      taskId: string;
      title: string;
      status: ExecutionStatus;
      scheduledDate: string;
      eventTitle: string;
      path: Array<{ id: string; text: string }>;
      effectiveTags: string[];
      deadline?: string;
      priority?: 'high' | 'medium' | 'low';
    }
  | {
      kind: 'standalone';
      id: string; // `standalone:${taskId}`
      taskId: string;
      title: string;
      status: ExecutionStatus;
      scheduledDate: string;
      effectiveTags: string[];
      deadline?: string;
      priority?: 'high' | 'medium' | 'low';
    };
