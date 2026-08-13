/// <reference types="vite/client" />
const API_BASE = import.meta.env.DEV
  ? '/api'
  : `${import.meta.env.VITE_API_ORIGIN ?? 'http://127.0.0.1:47832'}/api`;

/**
 * Build an Error that carries the HTTP status code so call sites can decide
 * whether to retry, resync, or surface the error. Server-supplied error
 * messages are preferred when present.
 */
async function httpError(res: Response, fallback: string): Promise<Error> {
  let message = fallback;
  try {
    const body = await res.json();
    if (body && typeof body.error === 'string') {
      message = body.error;
    }
  } catch {
    // body was not JSON; stick with the fallback message
  }
  const err = new Error(message) as Error & { status?: number };
  err.status = res.status;
  return err;
}

// Inline types that match the server API responses
export interface TaskInput {
  id: string;
  title: string;
  description?: string;
  comment?: string;
  comments?: { text: string; timestamp: string }[];
  status: string;
  tags?: string[];
  project?: string;
  deadline?: string;
  priority?: string;
  source_date?: string;
  /** Date of the Daily note that currently contains this task. */
  host_date?: string;
  spaceId?: string;
  originMindmapId?: string;
  originNodeId?: string;
  parentTaskId?: string;
  planOrder?: number;
}

export interface DailyNoteData {
  date: string;
  content: string;
  tasks: TaskInput[];
  lastModified?: string;
}

export interface ConfigData {
  version: string;
  workspaceRoot: string;
  workspaces?: Workspace[];
  activeWorkspaceId?: string;
  dailyPathTemplate: string;
  rolloverTrigger: 'manual' | 'on_app_open';
  rolloverSkipTags: string[];
  githubRepo?: string;
  activeContext?: 'work' | 'life';
  ipfsEnabled?: boolean;
  ipfsProvider?: 'pinata';
  ipfsApiKey?: string;
  ipfsGateway?: string;
  providerConfigs?: string;
  /** Unified model registry and role assignments. `providerConfigs` is read
   * only as a one-time migration fallback. */
  modelCenter?: string;
  feishuSyncEnabled?: boolean;
  feishuSyncIntervalMinutes?: number;
  feishuTaskSyncEnabled?: boolean;
  feishuCalendarSyncEnabled?: boolean;
  v2?: { enabled?: boolean; inboxV2?: boolean; todayV2?: boolean; memoryV2?: boolean; connectorsV2?: boolean; eventFirst?: boolean; aiEnabled?: boolean; contextBudgetBytes?: number; };
}

export type ConfigPatch = Partial<Omit<ConfigData, 'version'>> & {
  [K in keyof Omit<ConfigData, 'version'>]?: Omit<ConfigData, 'version'>[K] | null;
};

  export type EventContext = 'work' | 'life';
  export type EventStatus = 'active' | 'completed' | 'archived';
  export type ExecutionStatus = 'todo' | 'done';
  export type TagSuggestionState = 'suggested' | 'accepted' | 'rejected';
  export interface SuggestedTag { value: string; source: 'ai'; confidence: number; state: TagSuggestionState; }
  export interface EventSummary { id: string; mindmapId?: string; title: string; context: EventContext; status: EventStatus; progress: { done: number; total: number }; effectiveTags: string[]; createdAt: string; updatedAt: string; }
  export interface EventExecution { taskId: string; status: ExecutionStatus; scheduledDate: string; deadline?: string; priority?: 'high' | 'medium' | 'low'; completedAt?: string; }
  export interface EventNode { id: string; eventId: string; parentId?: string; text: string; note?: string; position: { x: number; y: number }; collapsed?: boolean; manualTags: string[]; aiTags: SuggestedTag[]; execution?: EventExecution; }
  export interface EventDetail extends EventSummary { mindmapId: string; rootNodeId: string; nodes: EventNode[]; edges: Array<{ id: string; source: string; target: string }>; manualTags: string[]; aiTags: SuggestedTag[]; integrity: { missingMap: boolean; sourceContextWasUnclassified: boolean; orphanTaskIds: string[]; duplicateNodeTaskIds: string[] }; }
  export interface StandaloneTask { id: string; title: string; status: ExecutionStatus; scheduledDate: string; deadline?: string; note?: string; manualTags: string[]; aiTags: SuggestedTag[]; }
  export type TodayItem = { kind: 'event-node'; id: string; eventId: string; mindmapId: string; spaceId?: string; nodeId: string; taskId: string; title: string; status: ExecutionStatus; scheduledDate: string; eventTitle: string; path: Array<{ id: string; text: string }>; effectiveTags: string[]; deadline?: string; priority?: 'high' | 'medium' | 'low' } | { kind: 'standalone'; id: string; taskId: string; title: string; status: ExecutionStatus; scheduledDate: string; effectiveTags: string[]; deadline?: string; priority?: 'high' | 'medium' | 'low' };

export const DOMAIN_EVENTS = {
  calendarConnectionChanged: 'calendar.connectionChanged',
  calendarEventsChanged: 'calendar.eventsChanged',
  aiProviderChanged: 'ai.providerChanged',
  workspaceChanged: 'workspace.changed',
  tasksChanged: 'tasks.changed',
} as const;

export type DomainEventName = typeof DOMAIN_EVENTS[keyof typeof DOMAIN_EVENTS];

export function dispatchDomainEvent(
  name: DomainEventName,
  detail: Record<string, unknown> = {},
): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }
}

export interface Workspace {
  id: string;
  name: string;
  path: string;
  createdAt: string;
}

export interface RolloverPreviewData {
  fromDate: string;
  toDate: string;
  tasksToMigrate: TaskInput[];
  targetContent: string;
}

/**
 * 文件操作 API
 */
export const filesApi = {
  async get(date: string): Promise<DailyNoteData | null> {
    const res = await fetch(`${API_BASE}/files/${date}`);
    if (res.status === 404) return null;
    if (!res.ok) throw await httpError(res, 'Failed to fetch file');
    return res.json();
  },

  async create(date: string, content: string): Promise<void> {
    const res = await fetch(`${API_BASE}/files/${date}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) throw await httpError(res, 'Failed to create file');
  },

  async update(date: string, content: string): Promise<void> {
    const res = await fetch(`${API_BASE}/files/${date}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) throw await httpError(res, 'Failed to update file');
  },

  async list(): Promise<string[]> {
    const res = await fetch(`${API_BASE}/files/list`);
    if (!res.ok) throw await httpError(res, 'Failed to list files');
    const data = await res.json();
    return data.files;
  },
};

/**
 * 任务操作 API
 */
export const tasksApi = {
  async getByDate(date: string): Promise<TaskInput[]> {
    const res = await fetch(`${API_BASE}/tasks/${date}`);
    if (!res.ok) throw await httpError(res, 'Failed to fetch tasks');
    const data = await res.json();
    return data.tasks;
  },

  async updateStatus(taskId: string, date: string, status: 'todo' | 'done'): Promise<void> {
    const res = await fetch(`${API_BASE}/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, date }),
    });
    if (!res.ok) throw await httpError(res, 'Failed to update task');
  },

  async create(date: string, task: Record<string, unknown>): Promise<void> {
    const res = await fetch(`${API_BASE}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, task }),
    });
    if (!res.ok) throw await httpError(res, 'Failed to create task');
  },

  async edit(
    taskId: string,
    date: string,
    updates: {
      title?: string;
      description?: string;
      /** Legacy: single inline comment. New code should use `comments`. */
      comment?: string;
      /** Timestamped comment list rendered as `> [ts] text` lines under the task. */
      comments?: { text: string; timestamp: string }[];
      tags?: string[];
      deadline?: string;
      priority?: 'high' | 'medium' | 'low';
      project?: string;
    }
  ): Promise<void> {
    const res = await fetch(`${API_BASE}/tasks/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, ...updates }),
    });
    if (!res.ok) throw await httpError(res, 'Failed to edit task');
  },

  async delete(taskId: string, date: string): Promise<void> {
    const res = await fetch(`${API_BASE}/tasks/${taskId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date }),
    });
    if (!res.ok) throw await httpError(res, 'Failed to delete task');
  },

  // -------------------------------------------------------------------------
  // Phase 2 (Topic Spaces): space binding.
  //
  // The server writes / clears the `^space:<id>` marker on the task's
  // daily-note line, so every call MUST pass the `date` of the file that
  // hosts the task. The list view queries this when scoping to a space;
  // the unlink button clears it. Omitting `date` makes the server 400
  // because it cannot locate the markdown line to mutate.
  // -------------------------------------------------------------------------

  /**
   * Move a task into a Topic Space (or out of one, when `spaceId` is
   * `null`). `date` is the daily note date that hosts the task — the
   * server needs it to read-modify-write the `^space:` marker on the
   * task line.
   */
  async updateSpace(
    taskId: string,
    spaceId: string | null,
    date: string,
  ): Promise<TaskInput> {
    const res = await fetch(`${API_BASE}/tasks/${encodeURIComponent(taskId)}/space`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spaceId, date }),
    });
    if (!res.ok) throw await httpError(res, 'Failed to update task space');
    return res.json();
  },

  /**
   * Helper: filter a flat task list to those bound to a given space.
   * Tasks fetched via `getByDate` carry `spaceId`; we keep the
   * filtering client-side so we don't need a new server endpoint.
   */
  filterBySpace(tasks: ReadonlyArray<TaskInput>, spaceId: string): TaskInput[] {
    return tasks.filter((t) => (t as { spaceId?: string }).spaceId === spaceId);
  },

  /**
   * Topic Space v2 (Phase 1): move a task to a different space. Pass
   * `null` to send it back to "未分类". `date` is the daily note date
   * that hosts the task (required by the server to mutate the
   * `^space:` marker on the task line).
   */
  async setSpace(taskId: string, spaceId: string | null, date: string): Promise<void> {
    const res = await fetch(`${API_BASE}/tasks/${taskId}/space`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spaceId, date }),
    });
    if (!res.ok) throw await httpError(res, 'Failed to set task space');
  },

  /**
   * Pure-client filter helper (Phase 1 stub). Given a list of tasks and
   * a `spaceId`, return the tasks that belong to that space. `null`
   * returns unclassified tasks (those with no `spaceId`). This is a
   * placeholder until the server exposes a dedicated endpoint.
   */
  tasksBySpace<T extends { spaceId?: string }>(
    tasks: T[],
    spaceId: string | null,
  ): T[] {
    if (spaceId === null) {
      return tasks.filter((t) => !t.spaceId);
    }
    return tasks.filter((t) => t.spaceId === spaceId);
  },
};

/**
 * 任务迁移 API
 */
export const rolloverApi = {
  async preview(toDate: string, context: 'work' | 'life' = 'work'): Promise<RolloverPreviewData | null> {
    const res = await fetch(`${API_BASE}/rollover/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toDate, context }),
    });
    if (!res.ok) throw await httpError(res, 'Failed to preview rollover');
    return res.json();
  },

  async apply(toDate: string, context: 'work' | 'life' = 'work'): Promise<{ success: boolean; migratedCount: number }> {
    const res = await fetch(`${API_BASE}/rollover/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toDate, context }),
    });
    if (!res.ok) throw await httpError(res, 'Failed to apply rollover');
    return res.json();
  },
};

export const dailyApi = {
  async initialize(date: string, context: 'work' | 'life'): Promise<{
    commandId: string;
    recurringCreated: number;
    migratedCount: number;
  }> {
    const res = await fetch(`${API_BASE}/daily/${date}/initialize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context }),
    });
    if (!res.ok) throw await httpError(res, 'Failed to initialize day');
    return res.json();
  },
};

export interface CreateTaskForNodeInput {
  mindmapId: string;
  nodeId: string;
  title: string;
  scheduledDate: string;
  deadline?: string;
  priority?: 'high' | 'medium' | 'low';
}
export interface EditNodeTaskInput {
  taskId: string;
  scheduledDate: string;
  updates: {
    title?: string;
    description?: string;
    comment?: string;
    comments?: { text: string; timestamp: string }[];
    tags?: string[];
    deadline?: string;
    priority?: 'high' | 'medium' | 'low' | '';
  };
}
export interface CompleteNodeTaskInput { taskId: string; scheduledDate: string; }
export interface UndoCompleteNodeTaskInput { taskId: string; scheduledDate: string; }
export interface ConvertStandaloneToEventNodeTaskInput {
  taskId: string;
  scheduledDate: string;
  mindmapId: string;
  nodeId: string;
}
export interface UndoConvertStandaloneToEventNodeTaskInput {
  taskId: string;
  scheduledDate: string;
}
export interface UnscheduleNodeTaskInput {
  taskId: string;
  scheduledDate: string;
  mindmapId: string;
  nodeId: string;
}
export interface RescheduleNodeTaskInput {
  taskId: string;
  fromDate: string;
  toDate: string;
  mindmapId: string;
  nodeId: string;
}

export const eventsApi = {
  async create(input: { title: string; context: EventContext }): Promise<EventDetail> {
    const res = await fetch(`${API_BASE}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw await httpError(res, 'Failed to create event');
    return res.json();
  },
  async list(from?: string, to?: string): Promise<{ events: EventSummary[] }> {
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    const qs = q.toString();
    const res = await fetch(`${API_BASE}/events${qs ? `?${qs}` : ''}`);
    if (!res.ok) throw await httpError(res, 'Failed to fetch events');
    const payload = await res.json();
    return { events: Array.isArray(payload) ? payload : (payload?.events ?? []) };
  },
  async getById(eventId: string): Promise<{ event: EventDetail } | { event: null }> {
    const res = await fetch(`${API_BASE}/events/${encodeURIComponent(eventId)}`);
    if (res.status === 404) return { event: null };
    if (!res.ok) throw await httpError(res, 'Failed to fetch event');
    const payload = await res.json();
    return { event: payload?.event ?? payload };
  },
  async listTodayItems(date: string, context?: EventContext): Promise<{ items: TodayItem[] }> {
    const query = new URLSearchParams({ date });
    if (context) query.set('context', context);
    const res = await fetch(`${API_BASE}/events/today-items?${query.toString()}`);
    if (!res.ok) throw await httpError(res, 'Failed to fetch today items');
    const payload = await res.json();
    return { items: Array.isArray(payload) ? payload : (payload?.items ?? []) };
  },
  async listStandaloneTasks(from?: string, to?: string): Promise<{ tasks: StandaloneTask[] }> {
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    const qs = q.toString();
    const res = await fetch(`${API_BASE}/events/standalone-tasks${qs ? `?${qs}` : ''}`);
    if (!res.ok) throw await httpError(res, 'Failed to fetch standalone tasks');
    const payload = await res.json();
    return { tasks: Array.isArray(payload) ? payload : (payload?.tasks ?? []) };
  },
  async createTaskForNode(input: CreateTaskForNodeInput): Promise<{ taskId: string; appended: boolean; alreadyPresent: boolean }> {
    const res = await fetch(`${API_BASE}/events/actions/create-task-for-node`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw await httpError(res, 'Failed to create task for node');
    return res.json();
  },
  async editNodeTask(input: EditNodeTaskInput): Promise<{ updated: boolean; taskLine?: string }> {
    const res = await fetch(`${API_BASE}/events/actions/edit-node-task`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw await httpError(res, 'Failed to edit node task');
    return res.json();
  },
  async completeNodeTask(input: CompleteNodeTaskInput): Promise<{ completed: boolean; alreadyDone: boolean }> {
    const res = await fetch(`${API_BASE}/events/actions/complete-node-task`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw await httpError(res, 'Failed to complete node task');
    return res.json();
  },
  async undoCompleteNodeTask(input: UndoCompleteNodeTaskInput): Promise<{ undone: boolean; alreadyTodo: boolean }> {
    const res = await fetch(`${API_BASE}/events/actions/undo-complete-node-task`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw await httpError(res, 'Failed to undo complete node task');
    return res.json();
  },
  async convertStandaloneToEventNodeTask(input: ConvertStandaloneToEventNodeTaskInput): Promise<{ converted: boolean; alreadyConverted: boolean; spaceLinked: boolean }> {
    const res = await fetch(`${API_BASE}/events/actions/convert-standalone-to-event-node-task`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw await httpError(res, 'Failed to convert standalone to event node task');
    return res.json();
  },
  async undoConvertStandaloneToEventNodeTask(input: UndoConvertStandaloneToEventNodeTaskInput): Promise<{ reverted: boolean; alreadyStandalone: boolean; removedFromSpace: boolean }> {
    const res = await fetch(`${API_BASE}/events/actions/undo-convert-standalone-to-event-node-task`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw await httpError(res, 'Failed to undo convert standalone to event node task');
    return res.json();
  },
  async unscheduleNodeTask(input: UnscheduleNodeTaskInput): Promise<{ unscheduled: boolean; alreadyUnscheduled: boolean }> {
    const res = await fetch(`${API_BASE}/events/actions/unschedule-node-task`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
    });
    if (!res.ok) throw await httpError(res, 'Failed to remove node from day');
    return res.json();
  },
  async rescheduleNodeTask(input: RescheduleNodeTaskInput): Promise<{ rescheduled: boolean; alreadyScheduled: boolean }> {
    const res = await fetch(`${API_BASE}/events/actions/reschedule-node-task`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
    });
    if (!res.ok) throw await httpError(res, 'Failed to reschedule node');
    return res.json();
  },
};

/**
 * 配置管理 API
 */
export const configApi = {
  async get(): Promise<ConfigData> {
    const res = await fetch(`${API_BASE}/config`);
    if (!res.ok) throw await httpError(res, 'Failed to fetch config');
    return res.json();
  },

  async update(
    patchOrConfig: ConfigPatch | ConfigData,
    expectedVersion?: string,
  ): Promise<ConfigData> {
    const embeddedVersion = 'version' in patchOrConfig ? patchOrConfig.version : undefined;
    const version = expectedVersion || embeddedVersion;
    if (!version) throw new Error('Config version is required');
    const { version: _ignored, ...patch } = patchOrConfig as ConfigData;
    const res = await fetch(`${API_BASE}/config`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version, patch }),
    });
    if (!res.ok) throw await httpError(res, 'Failed to update config');
    return res.json();
  },
};

export interface FeishuStatus {
  cliAvailable: boolean;
  appConfigured: boolean;
  appName?: string;
  authorized: boolean;
  userName?: string;
  openId?: string;
  reason?: string;
  lastTaskSyncAt?: string;
  lastCalendarSyncAt?: string;
}

export interface FeishuAgendaEvent {
  id: string;
  title: string;
  description?: string;
  start: string;
  end: string;
  allDay: boolean;
  status: 'confirmed' | 'tentative' | 'cancelled';
  location?: string;
  url?: string;
}

export interface CalendarWorkspaceItem {
  id: string;
  kind: 'task' | 'event';
  source: 'dailyflow' | 'feishu' | 'google' | string;
  title: string;
  description?: string;
  start: string;
  end?: string;
  allDay: boolean;
  status: 'todo' | 'done' | 'confirmed' | 'tentative';
  location?: string;
  url?: string;
  localDate?: string;
  localTaskId?: string;
  localNoteId?: string;
  delayed?: boolean;
  originalDate?: string;
}

export interface CalendarWorkspaceData {
  items: CalendarWorkspaceItem[];
  connectors: Array<{
    id: string;
    displayName: string;
    connected: boolean;
    color: string;
    accountLabel?: string;
    reason?: string;
    error?: string;
  }>;
}

export const calendarApi = {
  async getWorkspace(start: string, end: string): Promise<CalendarWorkspaceData> {
    const params = new URLSearchParams({ start, end });
    const res = await fetch(`${API_BASE}/calendar?${params}`);
    if (!res.ok) throw await httpError(res, 'Failed to load calendar');
    return res.json();
  },

  async listPlugins(): Promise<{
    items: Array<{
      id: string;
      displayName: string;
      provider: string;
      icon: string;
      capabilities: string[];
      accountType: 'enterprise' | 'personal' | 'both';
      status: 'available' | 'coming_soon';
      connection: { connected: boolean; accountLabel?: string; reason?: string };
    }>;
  }> {
    const res = await fetch(`${API_BASE}/calendar/plugins`);
    if (!res.ok) throw await httpError(res, 'Failed to load calendar plugins');
    return res.json();
  },
};

export const feishuApi = {
  async status(): Promise<FeishuStatus> {
    const res = await fetch(`${API_BASE}/feishu/status`);
    if (!res.ok) throw await httpError(res, 'Failed to read Feishu status');
    return res.json();
  },

  async startAuth(): Promise<{ verificationUrl: string; deviceCode: string; expiresIn?: number; qrDataUrl: string }> {
    const res = await fetch(`${API_BASE}/feishu/auth/start`, { method: 'POST' });
    if (!res.ok) throw await httpError(res, 'Failed to start Feishu authorization');
    return res.json();
  },

  async startSetup(): Promise<{ verificationUrl: string; qrDataUrl: string }> {
    const res = await fetch(`${API_BASE}/feishu/setup/start`, { method: 'POST' });
    if (!res.ok) throw await httpError(res, 'Failed to prepare Feishu connection');
    return res.json();
  },

  async finishSetup(): Promise<FeishuStatus> {
    const res = await fetch(`${API_BASE}/feishu/setup/finish`, { method: 'POST' });
    if (!res.ok) throw await httpError(res, 'Failed to finish Feishu connection setup');
    return res.json();
  },

  async finishAuth(deviceCode: string): Promise<FeishuStatus> {
    const res = await fetch(`${API_BASE}/feishu/auth/finish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceCode }),
    });
    if (!res.ok) throw await httpError(res, 'Failed to finish Feishu authorization');
    return res.json();
  },

  async logout(): Promise<FeishuStatus> {
    const res = await fetch(`${API_BASE}/feishu/auth/logout`, { method: 'POST' });
    if (!res.ok) throw await httpError(res, 'Failed to disconnect Feishu');
    return res.json();
  },

  async syncTasks(taskIds?: string[]): Promise<{
    ok: boolean;
    pushed: number;
    pulled: number;
    updatedRemote: number;
    updatedLocal: number;
    linked: number;
    skipped: number;
    conflicts: Array<{ localId: string; remoteGuid: string; title: string }>;
    errors: string[];
    syncedAt: string;
  }> {
    const res = await fetch(`${API_BASE}/feishu/sync/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(taskIds?.length ? { taskIds } : {}),
    });
    if (!res.ok) throw await httpError(res, 'Failed to sync Feishu tasks');
    return res.json();
  },

  async syncCalendar(): Promise<{ created: number; updated: number; skipped: number; errors: string[] }> {
    const res = await fetch(`${API_BASE}/feishu/sync/calendar`, { method: 'POST' });
    if (!res.ok) throw await httpError(res, 'Failed to sync Feishu calendar');
    return res.json();
  },

  async createCalendarEvent(input: {
    title: string;
    description?: string;
    start: string;
    end: string;
  }): Promise<FeishuAgendaEvent> {
    const res = await fetch(`${API_BASE}/feishu/calendar/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw await httpError(res, 'Failed to create Feishu calendar event');
    return res.json();
  },

  async agenda(start: string, end: string): Promise<FeishuAgendaEvent[]> {
    const params = new URLSearchParams({ start, end });
    const res = await fetch(`${API_BASE}/feishu/agenda?${params}`);
    if (!res.ok) throw await httpError(res, 'Failed to load Feishu agenda');
    const data = await res.json();
    return data.events;
  },
};

export interface GoogleCalendarStatus {
  configured: boolean;
  connected: boolean;
  accountEmail?: string;
  reason?: string;
}

export const googleCalendarApi = {
  async status(): Promise<GoogleCalendarStatus> {
    const res = await fetch(`${API_BASE}/google-calendar/status`);
    if (!res.ok) throw await httpError(res, 'Failed to read Google Calendar status');
    return res.json();
  },
  async configure(clientId: string): Promise<GoogleCalendarStatus> {
    const res = await fetch(`${API_BASE}/google-calendar/configure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId }),
    });
    if (!res.ok) throw await httpError(res, 'Failed to configure Google Calendar');
    return res.json();
  },
  async startAuth(): Promise<{ authorizationUrl: string }> {
    const res = await fetch(`${API_BASE}/google-calendar/auth/start`, { method: 'POST' });
    if (!res.ok) throw await httpError(res, 'Failed to start Google authorization');
    return res.json();
  },
};

export const workspacesApi = {
  async validatePath(path: string): Promise<{ valid: boolean; created?: boolean; error?: string }> {
    const res = await fetch(`${API_BASE}/config/validate-path`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, create: true }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw await httpError(res, data.error || 'Failed to validate workspace path');
    return data;
  },

  async list(): Promise<{ workspaces: Workspace[]; activeWorkspaceId: string }> {
    const res = await fetch(`${API_BASE}/config/workspaces`);
    if (!res.ok) throw await httpError(res, 'Failed to list workspaces');
    return res.json();
  },

  async create(name: string, path: string): Promise<Workspace> {
    const res = await fetch(`${API_BASE}/config/workspaces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, path }),
    });
    const data = await res.json();
    // 409 = already exists (server returns the existing workspace) — return it instead of throwing.
    if (res.status === 409 && data.duplicate && data.workspace) {
      return data.workspace as Workspace;
    }
    if (!res.ok) throw await httpError(res, 'Failed to create workspace');
    return data.workspace;
  },

  async rename(id: string, name: string): Promise<void> {
    const res = await fetch(`${API_BASE}/config/workspaces/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw await httpError(res, data.error || 'Failed to rename workspace');
    }
  },

  async remove(id: string): Promise<{ activeWorkspaceId: string; cleared?: boolean }> {
    const res = await fetch(`${API_BASE}/config/workspaces/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw await httpError(res, 'Failed to delete workspace');
    return data;
  },

  async activate(id: string): Promise<Workspace> {
    const res = await fetch(`${API_BASE}/config/workspaces/${id}/activate`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw await httpError(res, 'Failed to activate workspace');
    return data.workspace;
  },

  async pickFolder(): Promise<string | null> {
    const res = await fetch(`${API_BASE}/config/choose-folder`);
    if (res.status === 400) return null;
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw await httpError(res, data.error || 'Failed to open folder picker');
    }
    const data = await res.json();
    return data.path || null;
  },

  async discover(): Promise<{ candidates: { path: string; name: string }[] }> {
    const res = await fetch(`${API_BASE}/config/workspaces/discover`);
    if (!res.ok) return { candidates: [] };
    return res.json();
  },
};


export interface WorkspaceTimelineEntryData {
  id: string;
  date: string;
  body: string;
  type: 'log' | 'decision' | 'blocker' | 'ai_review';
}

// ---------------------------------------------------------------------------
// Topic Space (Phase 1) — superset of ThinkingWorkspace with a 1:1
// mindmapId binding and a context discriminator. `kind: 'topic-space'`
// separates new files from legacy 'workspace' (or missing) ones; the UI
// reads both and labels legacy tabs as "（旧版）".
// ---------------------------------------------------------------------------

export type TopicSpaceContext = 'work' | 'life' | 'unclassified';
export type TopicSpaceDefaultView = 'mindmap' | 'list';
export type TopicSpaceStatus = 'active' | 'paused' | 'completed' | 'archived';

export interface TopicSpace {
  id: string;
  title: string;
  /** New files use `topic-space`; the same API reads legacy `workspace`
   * files without rewriting them until the user explicitly edits one. */
  kind: 'topic-space' | 'workspace';
  /** Which context this space lives under. Defaults to 'unclassified'
   *  during the migration window. */
  context: TopicSpaceContext;
  /** Mind map that this space is bound to (1:1). The server creates
   *  a blank map on POST and binds them in both directions. */
  mindmapId: string;
  /** Stable position among siblings in the same context. */
  order: number;
  defaultView: TopicSpaceDefaultView;
  status: TopicSpaceStatus;
  tags: string[];
  taskIds: string[];
  linkedNoteIds: string[];
  intent: string;
  scratchpad: string;
  brief: string;
  journey: string;
  tasksMarkdown: string;
  mindmapMarkdown: string;
  timeline: WorkspaceTimelineEntryData[];
  createdAt: string;
  updatedAt: string;
  filePath?: string;
}

/** Filters accepted by `topicSpacesApi.list`. */
export interface TopicSpaceFilters {
  context?: TopicSpaceContext;
  status?: TopicSpaceStatus;
  query?: string;
}

/**
 * One entry in a Topic Space's cross-date task list. `date` is the
 * daily-note date that hosts the task — the client uses it to
 * navigate to the right day when the user opens the task.
 */
export interface TopicSpaceTaskItem {
  task: TaskInput & { spaceId?: string; originMindmapId?: string; originNodeId?: string };
  date: string;
}

export interface TopicSpaceCreateInput {
  title: string;
  context?: TopicSpaceContext;
  defaultView?: TopicSpaceDefaultView;
  status?: TopicSpaceStatus;
  tags?: string[];
  intent?: string;
  scratchpad?: string;
  brief?: string;
  journey?: string;
}

export type TopicSpaceUpdate = Partial<
  Omit<
    TopicSpace,
    'id' | 'kind' | 'createdAt' | 'updatedAt' | 'filePath' | 'mindmapId'
  >
>;

export const topicSpacesApi = {
  async list(filters?: TopicSpaceFilters): Promise<TopicSpace[]> {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
      });
    }
    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`${API_BASE}/topic-spaces${query}`);
    if (!res.ok) throw await httpError(res, 'Failed to fetch topic spaces');
    return res.json();
  },

  async get(id: string): Promise<TopicSpace> {
    const res = await fetch(`${API_BASE}/topic-spaces/${id}`);
    if (!res.ok) throw await httpError(res, 'Failed to fetch topic space');
    return res.json();
  },

  /**
   * Cross-date task source (Phase 3). Returns the space's tasks across
   * ALL daily notes as `{ task, date }[]`. Use this instead of
   * filtering the current day's tasks — the old approach silently
   * dropped any task that wasn't on the open date.
   */
  async getTasks(id: string): Promise<TopicSpaceTaskItem[]> {
    const res = await fetch(`${API_BASE}/topic-spaces/${encodeURIComponent(id)}/tasks`);
    if (!res.ok) throw await httpError(res, 'Failed to fetch topic-space tasks');
    const data = await res.json();
    return (data?.items ?? []) as TopicSpaceTaskItem[];
  },

  async create(input: TopicSpaceCreateInput): Promise<TopicSpace> {
    const res = await fetch(`${API_BASE}/topic-spaces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw await httpError(res, 'Failed to create topic space');
    return res.json();
  },

  async update(id: string, patch: TopicSpaceUpdate): Promise<TopicSpace> {
    const res = await fetch(`${API_BASE}/topic-spaces/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw await httpError(res, 'Failed to update topic space');
    return res.json();
  },

  async delete(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/topic-spaces/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok && res.status !== 404) {
      throw await httpError(res, 'Failed to delete topic space');
    }
  },

  /**
   * Reorder spaces within a context. The server persists the new `order`
   * based on the position in `orderedIds`.
   */
  async reorder(context: TopicSpaceContext, orderedIds: string[]): Promise<void> {
    const res = await fetch(`${API_BASE}/topic-spaces/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context, orderedIds }),
    });
    if (!res.ok) throw await httpError(res, 'Failed to reorder topic spaces');
  },
};

export interface NoteData {
  id: string;
  title: string;
  body: string;
  type: 'note' | 'meeting_note' | 'summary';
  date: string;
  time?: string;
  endTime?: string;
  context: 'work' | 'life';
  tags: string[];
  mentions: string[];
  linkedTaskIds: string[];
  linkedProjectIds: string[];
  participants?: string[];
  recordingPath?: string;
  transcriptPath?: string;
  scope?: string;
  prompt?: string;
  model?: string;
  createdAt: string;
  updatedAt: string;
  filePath?: string;
}

export interface PromptTemplateData {
  id: string;
  name: string;
  // `prompt` is kept for backward compatibility; new code should use `systemPrompt`.
  prompt?: string;
  systemPrompt: string;
  description: string;
  scope: string;
  icon?: string;
  version?: string;
  author?: string;
  tags?: string[];
  createdAt: string;
  updatedAt?: string;
  // Skill type: 'prompt' = system-prompt based (legacy), 'agent' = knowledge-base / Codex-style
  type?: 'prompt' | 'agent';
  // Slash commands that trigger this skill (e.g. ['/weekly', '/wr'])
  commands?: string[];
  // File patterns that auto-trigger this skill (e.g. ['*.test.ts'])
  filePatterns?: string[];
}

/**
 * Client-side skill usage tracking. Stored in localStorage as a map of
 * skill id → { count, lastUsedAt }.
 *
 * Skills are ranked by a combined score (see `sortSkillsByUsage`):
 *   score = log(count + 1) * 0.4 + recency * 0.6
 * where recency is a 0..1 decay based on how recently the skill was used
 * (1.0 if just used, decays to 0 over ~30 days).
 */
export interface SkillUsageStat {
  count: number;
  lastUsedAt: number; // ms epoch
}

export type SkillUsageMap = Record<string, SkillUsageStat>;

const SKILL_USAGE_KEY = 'df_skill_usage';

export function loadSkillUsage(): SkillUsageMap {
  try {
    const raw = localStorage.getItem(SKILL_USAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

export function recordSkillUse(skillId: string): void {
  const map = loadSkillUsage();
  const prev = map[skillId] || { count: 0, lastUsedAt: 0 };
  map[skillId] = { count: prev.count + 1, lastUsedAt: Date.now() };
  try {
    localStorage.setItem(SKILL_USAGE_KEY, JSON.stringify(map));
  } catch {}
}

/**
 * Rank skills by combined "recently used" + "frequently used" score.
 * Unused skills fall to the bottom but still respect their natural order
 * (e.g. by name or createdAt).
 */
export function sortSkillsByUsage(
  skills: PromptTemplateData[],
  usage: SkillUsageMap,
  now: number = Date.now()
): PromptTemplateData[] {
  const HALF_LIFE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
  const score = (s: PromptTemplateData): number => {
    const u = usage[s.id];
    if (!u) return 0; // unused: bottom (but keep stable order via index)
    const recency = Math.pow(0.5, (now - u.lastUsedAt) / HALF_LIFE_MS);
    const freq = Math.log(u.count + 1);
    return recency * 0.6 + freq * 0.4;
  };
  return [...skills]
    .map((s, idx) => ({ s, idx, score: score(s) }))
    .sort((a, b) => {
      // Primary: higher score first
      if (b.score !== a.score) return b.score - a.score;
      // Tie: stable by original index
      return a.idx - b.idx;
    })
    .map(x => x.s);
}

/**
 * 笔记操作 API
 */
export const notesApi = {
  async getAll(filters?: {
    type?: string;
    context?: string;
    startDate?: string;
    endDate?: string;
    mention?: string;
    tag?: string;
    project?: string;
  }): Promise<NoteData[]> {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
    }
    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`${API_BASE}/notes${query}`);
    if (!res.ok) throw await httpError(res, 'Failed to fetch notes');
    return res.json();
  },

  async getByDate(date: string): Promise<NoteData[]> {
    const res = await fetch(`${API_BASE}/notes/date/${date}`);
    if (!res.ok) throw await httpError(res, 'Failed to fetch notes for date');
    return res.json();
  },

  async getById(id: string): Promise<NoteData> {
    const res = await fetch(`${API_BASE}/notes/${id}`);
    if (!res.ok) throw await httpError(res, 'Failed to fetch note');
    return res.json();
  },

  async create(note: Omit<NoteData, 'id' | 'createdAt' | 'updatedAt' | 'filePath' | 'mentions'>): Promise<NoteData> {
    const res = await fetch(`${API_BASE}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(note),
    });
    if (!res.ok) throw await httpError(res, 'Failed to create note');
    return res.json();
  },

  async update(id: string, updates: Partial<Omit<NoteData, 'id' | 'createdAt' | 'filePath'>>): Promise<NoteData> {
    const res = await fetch(`${API_BASE}/notes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw await httpError(res, 'Failed to update note');
    return res.json();
  },

  async delete(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/notes/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw await httpError(res, 'Failed to delete note');
  },

  async getMentions(): Promise<string[]> {
    const res = await fetch(`${API_BASE}/notes/mentions`);
    if (!res.ok) throw await httpError(res, 'Failed to fetch mentions');
    return res.json();
  },
};

/**
 * 提示词模板 API
 */
export const promptsApi = {
  async getAll(): Promise<PromptTemplateData[]> {
    const res = await fetch(`${API_BASE}/prompts`);
    if (!res.ok) throw await httpError(res, 'Failed to fetch prompts');
    return res.json();
  },

  async create(data: Omit<PromptTemplateData, 'id' | 'createdAt'>): Promise<PromptTemplateData> {
    const res = await fetch(`${API_BASE}/prompts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw await httpError(res, 'Failed to create prompt');
    return res.json();
  },

  async update(id: string, updates: Partial<Omit<PromptTemplateData, 'id' | 'createdAt'>>): Promise<PromptTemplateData> {
    const res = await fetch(`${API_BASE}/prompts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw await httpError(res, 'Failed to update prompt');
    return res.json();
  },

  async delete(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/prompts/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw await httpError(res, 'Failed to delete prompt');
  },
};

/**
 * Mind map types and API.
 *
 * The client treats a mind map as a graph: nodes (with explicit positions)
 * plus edges. Auto-layout runs in the UI; positions are persisted so the
 * canvas restores exactly where the user left it.
 */
export type MindMapNodeColor = 'default' | 'accent' | 'warm' | 'success' | 'warning' | 'danger';

/**
 * Topic Space v2 (Phase 1): semantic kind for a mind map node. The
 * default for legacy nodes is `'branch'` — anything older is treated as
 * a regular branch node until Phase 2 lets the user re-classify it.
 */
export type MindMapNodeKind = 'root' | 'branch' | 'tag' | 'task';

export const MINDMAP_NODE_COLORS: readonly MindMapNodeColor[] = [
  'default',
  'accent',
  'warm',
  'success',
  'warning',
  'danger',
] as const;

export type MindMapNodeStatus = 'todo' | 'in-progress' | 'done';

export const MINDMAP_NODE_STATUSES: readonly MindMapNodeStatus[] = [
  'todo',
  'in-progress',
  'done',
] as const;

export interface MindMapNode {
  id: string;
  text: string;
  /** User-facing task labels. Every non-root node behaves like a task. */
  tags?: string[];
  color?: MindMapNodeColor;
  position: { x: number; y: number };
  /** When true, the node's subtree is collapsed in the canvas. */
  collapsed?: boolean;
  /** Optional elaboration note shown when the node is selected. */
  note?: string;
  /** Three-state task marker: `todo` (default), `in-progress`, `done`. */
  status?: MindMapNodeStatus;
  // ---------------------------------------------------------------------
  // Topic Space v2 (Phase 1): node semantics. `kind` defaults to 'branch'
  // when missing (legacy maps). Phase 2 will let the UI mutate `kind`
  // (right-click → "转为待办" / "关联已有 Task" / "设为 Tag"). For now
  // these are read-only display hints.
  // ---------------------------------------------------------------------
  /** Default 'branch' if missing. */
  kind?: MindMapNodeKind;
  /** Tag label, used when `kind === 'tag'`. */
  tag?: string;
  /** Linked Task id, used when `kind === 'task'`. */
  taskId?: string;
  /** Daily-note date that owns the linked Task (YYYY-MM-DD). */
  taskDate?: string;
  /** Stable sibling planning order. Lower values are planned first. */
  planOrder?: number;
}

export interface MindMapEdge {
  id: string;
  source: string;
  target: string;
}

export interface MindMap {
  id: string;
  title: string;
  rootId: string;
  nodes: MindMapNode[];
  edges: MindMapEdge[];
  /** v1 = legacy (no `spaceId`, nodes may lack `kind`). v2 = topic-space aware. */
  version: 1 | 2;
  /** Back-reference to the owning TopicSpace, set when this map was created
   *  by `POST /api/topic-spaces`. May be missing on legacy / orphan maps. */
  spaceId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MindMapInput {
  title?: string;
  rootId?: string;
  nodes?: MindMapNode[];
  edges?: MindMapEdge[];
}

export interface MindMapUpdate {
  title?: string;
  rootId?: string;
  nodes?: MindMapNode[];
  edges?: MindMapEdge[];
}

/**
 * 思维导图 API
 */
export const mindmapsApi = {
  async list(): Promise<MindMap[]> {
    const res = await fetch(`${API_BASE}/mindmaps`);
    if (!res.ok) throw await httpError(res, 'Failed to list mind maps');
    return res.json();
  },

  async get(id: string): Promise<MindMap> {
    const res = await fetch(`${API_BASE}/mindmaps/${id}`);
    if (!res.ok) throw await httpError(res, 'Failed to get mind map');
    return res.json();
  },

  async create(input: MindMapInput = {}): Promise<MindMap> {
    const res = await fetch(`${API_BASE}/mindmaps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw await httpError(res, 'Failed to create mind map');
    return res.json();
  },

  async update(id: string, patch: MindMapUpdate): Promise<MindMap> {
    const res = await fetch(`${API_BASE}/mindmaps/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw await httpError(res, 'Failed to update mind map');
    return res.json();
  },

  async delete(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/mindmaps/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok && res.status !== 404) {
      throw await httpError(res, 'Failed to delete mind map');
    }
  },

  async deleteNodeSubtree(
    mapId: string,
    nodeId: string,
    taskPolicy: 'keep-tasks' | 'delete-tasks',
  ): Promise<MindMap> {
    const res = await fetch(`${API_BASE}/mindmaps/${encodeURIComponent(mapId)}/nodes/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeId, taskPolicy }),
    });
    if (!res.ok) throw await httpError(res, 'Failed to delete mind-map node');
    const data = await res.json();
    return data.mindmap as MindMap;
  },

  // -------------------------------------------------------------------------
  // Phase 2 (Topic Spaces): node-kind mutations.
  //
  // Each endpoint mutates ONE node on a single mind map and returns the
  // updated map. The canvas + parent state will resync from the response
  // (no need to splice locally — the server is the source of truth for
  // `kind` / `tag` / `taskId`).
  // -------------------------------------------------------------------------

  /**
   * Promote a node to a Task: creates a real Task on `date`, binds it to
   * this node, and sets `kind: 'task'` + `taskId` on the node. Parent tag
   * nodes along the path (Phase 3) will be folded into the new task's
   * `tags` server-side.
   */
  async promoteNodeToTask(
    mapId: string,
    nodeId: string,
    opts: { date: string; context?: string },
  ): Promise<MindMap> {
    const res = await fetch(
      `${API_BASE}/mindmaps/${encodeURIComponent(mapId)}/nodes/${encodeURIComponent(nodeId)}/promote-to-task`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opts),
      },
    );
    if (!res.ok) throw await httpError(res, 'Failed to promote node to task');
    const payload = await res.json() as { mindmap: MindMap };
    return payload.mindmap;
  },

  /**
   * Bind an existing node to an existing Task. Sets `kind: 'task'` and
   * `taskId` on the node; the task itself is not modified. `date` is the
   * date the task was created on (so the server can resolve it).
   */
  async linkNodeToTask(
    mapId: string,
    nodeId: string,
    taskId: string,
    date: string,
  ): Promise<MindMap> {
    const res = await fetch(
      `${API_BASE}/mindmaps/${encodeURIComponent(mapId)}/nodes/${encodeURIComponent(nodeId)}/link-task`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, date }),
      },
    );
    if (!res.ok) throw await httpError(res, 'Failed to link node to task');
    const payload = await res.json() as { mindmap: MindMap };
    return payload.mindmap;
  },

  /**
   * Re-classify a node's `kind`. Used by the right-click context menu for
   * "设为 Tag" (kind: 'tag', tag: text) and "取消分类" (kind: 'branch',
   * clear tag/taskId). The server is responsible for clearing the
   * counterpart fields; the client just sends the new `kind`.
   */
  async updateNodeKind(
    mapId: string,
    nodeId: string,
    kind: MindMapNodeKind,
    extras: { tag?: string } = {},
  ): Promise<MindMap> {
    const res = await fetch(
      `${API_BASE}/mindmaps/${encodeURIComponent(mapId)}/nodes/${encodeURIComponent(nodeId)}/kind`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, ...extras }),
      },
    );
    if (!res.ok) throw await httpError(res, 'Failed to update node kind');
    return res.json();
  },
};

export type RecurrenceRule =
  | { type: 'daily' }
  | { type: 'weekly'; weekdays: number[] }
  | { type: 'monthly'; dayOfMonth: number };

export interface RecurringTaskData {
  id: string;
  title: string;
  description?: string;
  tags?: string[];
  priority?: 'high' | 'medium' | 'low';
  project?: string;
  recurrence: RecurrenceRule;
  createdAt: string;
}

/**
 * 循环任务 API
 */
export const recurringApi = {
  async getAll(): Promise<RecurringTaskData[]> {
    const res = await fetch(`${API_BASE}/recurring`);
    if (!res.ok) throw await httpError(res, 'Failed to fetch recurring tasks');
    return res.json();
  },

  async create(data: Omit<RecurringTaskData, 'id' | 'createdAt'>): Promise<RecurringTaskData> {
    const res = await fetch(`${API_BASE}/recurring`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw await httpError(res, 'Failed to create recurring task');
    return res.json();
  },

  async delete(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/recurring/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw await httpError(res, 'Failed to delete recurring task');
  },

  async instantiate(date: string): Promise<{ created: number }> {
    const res = await fetch(`${API_BASE}/recurring/instantiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date }),
    });
    if (!res.ok) throw await httpError(res, 'Failed to instantiate recurring tasks');
    return res.json();
  },
};

export interface AISummarizeRequest {
  apiKey: string;
  model?: string;
  baseUrl: string;
  systemPrompt?: string;
  userPrompt: string;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface AISummarizeResponse {
  summary: string;
  model: string;
}

/**
 * AI 代理 API（避免前端直接调用 LLM 暴露 key + CORS 问题）
 */
export const aiApi = {
  async summarize(req: AISummarizeRequest): Promise<AISummarizeResponse> {
    const res = await fetch(`${API_BASE}/ai/summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal: req.signal,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw await httpError(res, data.error || data.detail || `AI request failed (${res.status})`);
    }
    return res.json();
  },
};

export interface IpfsBackupRecord {
  cid: string;
  pinName: string;
  size: number;
  fileCount: number;
  createdAt: string;
  gateway?: string;
}

export interface IpfsBackupResult {
  success: boolean;
  cid?: string;
  pinName?: string;
  size?: number;
  fileCount?: number;
  gateway?: string;
  error?: string;
}

export interface IpfsTestResult {
  ok: boolean;
  message: string;
}

export const ipfsApi = {
  async test(apiKey: string): Promise<IpfsTestResult> {
    const res = await fetch(`${API_BASE}/ipfs/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey }),
    });
    return res.json();
  },

  async backup(): Promise<IpfsBackupResult> {
    const res = await fetch(`${API_BASE}/ipfs/backup`, { method: 'POST' });
    return res.json();
  },

  async list(): Promise<{ records: IpfsBackupRecord[] }> {
    const res = await fetch(`${API_BASE}/ipfs/backups`);
    if (!res.ok) throw await httpError(res, 'Failed to list IPFS backups');
    return res.json();
  },
};
