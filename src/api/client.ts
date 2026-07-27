/// <reference types="vite/client" />
const API_BASE = import.meta.env.DEV ? '/api' : 'http://localhost:3003/api';

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
  status: string;
  tags?: string[];
  project?: string;
  deadline?: string;
  priority?: string;
  source_date?: string;
}

export interface DailyNoteData {
  date: string;
  content: string;
  tasks: TaskInput[];
  lastModified?: string;
}

export interface ConfigData {
  workspaceRoot: string;
  workspaces?: Workspace[];
  activeWorkspaceId?: string;
  dailyPathTemplate: string;
  rolloverTrigger: 'manual' | 'on_app_open';
  rolloverSkipTags: string[];
  githubRepo?: string;
  githubToken?: string;
  activeContext?: 'work' | 'life';
  ipfsEnabled?: boolean;
  ipfsProvider?: 'pinata';
  ipfsApiKey?: string;
  ipfsGateway?: string;
  providerConfigs?: string;
  feishuSyncEnabled?: boolean;
  feishuSyncIntervalMinutes?: number;
  feishuTaskSyncEnabled?: boolean;
  feishuCalendarSyncEnabled?: boolean;
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

/**
 * 配置管理 API
 */
export const configApi = {
  async get(): Promise<ConfigData> {
    const res = await fetch(`${API_BASE}/config`);
    if (!res.ok) throw await httpError(res, 'Failed to fetch config');
    return res.json();
  },

  async update(config: ConfigData): Promise<void> {
    const res = await fetch(`${API_BASE}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!res.ok) throw await httpError(res, 'Failed to update config');
  },
};

export interface FeishuStatus {
  cliAvailable: boolean;
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
}

export interface CalendarWorkspaceData {
  items: CalendarWorkspaceItem[];
  connectors: Array<{
    id: string;
    displayName: string;
    connected: boolean;
    color: string;
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

  async startAuth(): Promise<{ verificationUrl: string; deviceCode: string; expiresIn?: number }> {
    const res = await fetch(`${API_BASE}/feishu/auth/start`, { method: 'POST' });
    if (!res.ok) throw await httpError(res, 'Failed to start Feishu authorization');
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

  async syncTasks(): Promise<{
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
    const res = await fetch(`${API_BASE}/feishu/sync/tasks`, { method: 'POST' });
    if (!res.ok) throw await httpError(res, 'Failed to sync Feishu tasks');
    return res.json();
  },

  async syncCalendar(): Promise<{ created: number; updated: number; skipped: number; errors: string[] }> {
    const res = await fetch(`${API_BASE}/feishu/sync/calendar`, { method: 'POST' });
    if (!res.ok) throw await httpError(res, 'Failed to sync Feishu calendar');
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

export const workspacesApi = {
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

export interface ThinkingWorkspaceData {
  id: string;
  title: string;
  kind: 'workspace';
  type?: 'goal' | 'problem' | 'research' | 'product_design' | 'project_phase' | 'general';
  status: 'active' | 'paused' | 'completed' | 'archived';
  projectId?: string;
  tags?: string[];
  intent: string;
  scratchpad: string;
  brief?: string;
  journey?: string;
  tasksMarkdown?: string;
  mindmapMarkdown?: string;
  taskIds: string[];
  linkedNoteIds: string[];
  timeline: WorkspaceTimelineEntryData[];
  createdAt: string;
  updatedAt: string;
  filePath?: string;
}

export const thinkingWorkspacesApi = {
  async getAll(filters?: { status?: string; projectId?: string; tag?: string; query?: string }): Promise<ThinkingWorkspaceData[]> {
    const params = new URLSearchParams();
    if (filters) Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`${API_BASE}/thinking-workspaces${query}`);
    if (!res.ok) throw await httpError(res, 'Failed to fetch workspaces');
    return res.json();
  },

  async getById(id: string): Promise<ThinkingWorkspaceData> {
    const res = await fetch(`${API_BASE}/thinking-workspaces/${id}`);
    if (!res.ok) throw await httpError(res, 'Failed to fetch workspace');
    return res.json();
  },

  async create(data: Partial<ThinkingWorkspaceData> & { title: string }): Promise<ThinkingWorkspaceData> {
    const res = await fetch(`${API_BASE}/thinking-workspaces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw await httpError(res, 'Failed to create workspace');
    return res.json();
  },

  async update(id: string, updates: Partial<Omit<ThinkingWorkspaceData, 'id' | 'createdAt' | 'filePath'>>): Promise<ThinkingWorkspaceData> {
    const res = await fetch(`${API_BASE}/thinking-workspaces/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw await httpError(res, 'Failed to update workspace');
    return res.json();
  },

  async delete(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/thinking-workspaces/${id}`, { method: 'DELETE' });
    if (!res.ok) throw await httpError(res, 'Failed to delete workspace');
  },
};

export interface ProjectData {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'completed' | 'archived';
  createdAt: string;
  updatedAt: string;
  tags?: string[];
  deadline?: string;
  filePath?: string;
}

/**
 * 项目管理 API
 */
export const projectsApi = {
  async getAll(): Promise<ProjectData[]> {
    const res = await fetch(`${API_BASE}/projects`);
    if (!res.ok) throw await httpError(res, 'Failed to fetch projects');
    return res.json();
  },

  async getById(id: string): Promise<ProjectData> {
    const res = await fetch(`${API_BASE}/projects/${id}`);
    if (!res.ok) throw await httpError(res, 'Failed to fetch project');
    return res.json();
  },

  async create(project: Omit<ProjectData, 'id' | 'createdAt' | 'updatedAt' | 'filePath'>): Promise<ProjectData> {
    const res = await fetch(`${API_BASE}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    });
    if (!res.ok) throw await httpError(res, 'Failed to create project');
    return res.json();
  },

  async update(id: string, updates: Partial<Omit<ProjectData, 'id' | 'createdAt' | 'filePath'>>): Promise<ProjectData> {
    const res = await fetch(`${API_BASE}/projects/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw await httpError(res, 'Failed to update project');
    return res.json();
  },

  async delete(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/projects/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw await httpError(res, 'Failed to delete project');
  },
};

export interface GitStatus {
  hasChanges: boolean;
  branch: string;
  ahead: number;
  behind: number;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  lastCommitTime?: string;
}

export interface GitSyncResult {
  success: boolean;
  commitHash?: string;
  message?: string;
  error?: string;
  stage?: string;
}

/**
 * Git 操作 API
 */
export const gitApi = {
  async getStatus(): Promise<GitStatus> {
    const res = await fetch(`${API_BASE}/git/status`);
    if (!res.ok) throw await httpError(res, 'Failed to get git status');
    return res.json();
  },

  async sync(message: string): Promise<GitSyncResult> {
    const res = await fetch(`${API_BASE}/git/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    if (!res.ok) throw await httpError(res, 'Failed to sync');
    return res.json();
  },

  async init(): Promise<{ success: boolean; error?: string }> {
    const res = await fetch(`${API_BASE}/git/init`, {
      method: 'POST',
    });
    if (!res.ok) throw await httpError(res, 'Failed to init git repo');
    return res.json();
  },

  async setRemote(): Promise<{ success: boolean; error?: string }> {
    const res = await fetch(`${API_BASE}/git/set-remote`, {
      method: 'POST',
    });
    if (!res.ok) throw await httpError(res, 'Failed to set remote');
    return res.json();
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

/**
 * Meetings API (Granola Phase 1).
 *
 * Transcribe takes raw text (Phase 1 mock) or audio (Phase 2 whisper.cpp)
 * and returns timestamped segments. Summarize takes the transcript plus the
 * user's provider config and returns a structured Markdown note + action
 * items, both proxied through the backend so the API key never reaches the
 * browser.
 */
export interface MeetingSegment {
  start: number;
  end: number;
  speaker?: string;
  text: string;
}

export interface MeetingTranscribeRequest {
  text: string;
  date?: string;
  participants?: string[];
}

export interface MeetingTranscribeResponse {
  segments: MeetingSegment[];
  text: string;
  date: string;
  participants: string[];
  recordingPath?: string;
  transcriptionMode?: 'whisper' | 'mock' | 'mock-with-audio';
  model?: string;
}

/**
 * Phase 2 audio request: MediaRecorder produces a Blob, we read it as
 * base64 and forward to the server. The server saves the file to
 * `~/.dailyflow/recordings/{date}/{uuid}.{ext}` and (when `whisperConfig`
 * is provided) forwards to an OpenAI-compatible `/audio/transcriptions`
 * endpoint.
 */
export interface MeetingAudioTranscribeRequest {
  audio: {
    /** Base64-encoded audio bytes (with or without the data: URL prefix). */
    data: string;
    /** MIME type as reported by MediaRecorder, e.g. "audio/webm". */
    mimeType: string;
    /** Original filename (used to pick the right extension on disk). */
    filename?: string;
  };
  date?: string;
  participants?: string[];
  /** When set, server forwards to the configured Whisper API. */
  whisperConfig?: {
    apiKey: string;
    baseUrl: string;
    model?: string;
    language?: string;
  };
  language?: 'zh' | 'en';
}

export interface MeetingActionItem {
  title: string;
  owner?: string;
  due?: string;
  priority?: 'high' | 'medium' | 'low';
}

export interface MeetingSummarizeRequest {
  apiKey: string;
  model?: string;
  baseUrl: string;
  transcript?: string;
  segments?: MeetingSegment[];
  title: string;
  participants?: string[];
  date?: string;
  time?: string;
  endTime?: string;
  maxTokens?: number;
  language?: 'zh' | 'en';
}

export interface MeetingSummarizeResponse {
  markdown: string;
  actionItems: MeetingActionItem[];
  model: string;
}

export interface MeetingExtractActionsRequest {
  apiKey: string;
  baseUrl: string;
  model?: string;
  markdown: string;
  language?: 'zh' | 'en';
  maxTokens?: number;
}

export interface MeetingExtractActionsResponse {
  actionItems: MeetingActionItem[];
  model: string;
}

export const meetingsApi = {
  async transcribe(req: MeetingTranscribeRequest): Promise<MeetingTranscribeResponse> {
    const res = await fetch(`${API_BASE}/meetings/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw await httpError(res, data.error || data.detail || `Meeting transcribe failed (${res.status})`);
    }
    return res.json();
  },
  /**
   * Phase 2: real audio transcription. Sends the MediaRecorder Blob to the
   * server, which saves it to `~/.dailyflow/recordings/{date}/` and (when
   * `whisperConfig` is provided) forwards to an OpenAI-compatible
   * `/audio/transcriptions` endpoint. Without `whisperConfig` the server
   * still saves the file and returns a mock scaffold.
   */
  async transcribeAudio(req: MeetingAudioTranscribeRequest): Promise<MeetingTranscribeResponse> {
    const res = await fetch(`${API_BASE}/meetings/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw await httpError(res, data.error || data.detail || `Meeting audio transcribe failed (${res.status})`);
    }
    return res.json();
  },
  async summarize(req: MeetingSummarizeRequest): Promise<MeetingSummarizeResponse> {
    const res = await fetch(`${API_BASE}/meetings/summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw await httpError(res, data.error || data.detail || `Meeting summarize failed (${res.status})`);
    }
    return res.json();
  },
  /**
   * Phase 2: re-run the LLM on a finalized meeting note to surface action
   * items. The frontend uses this to power the "Review N Action Items" card
   * before tasks land in the user's daily file.
   */
  async extractActions(req: MeetingExtractActionsRequest): Promise<MeetingExtractActionsResponse> {
    const res = await fetch(`${API_BASE}/meetings/extract-actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw await httpError(res, data.error || data.detail || `Meeting extract-actions failed (${res.status})`);
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

export interface Capsule {
  id: string;
  title: string;
  content: string;
  type: 'commitment' | 'secret' | 'milestone';
  status: 'sealed' | 'revealed' | 'failed' | 'extended';
  createdAt: string;
  unlockAt: string;
  revealedAt?: string;
  reflection?: string;
  isPublic: boolean;
  isEncrypted: boolean;
  tags: string[];
  linkedTaskId?: string;
  linkedNoteId?: string;
  proof?: CapsuleProof;
}

export interface CapsuleProof {
  provider: 'local' | 'arweave' | 'evm';
  txId?: string;
  chainId?: number;
  contractAddress?: string;
  onChainId?: number;
  contentHash?: string;
  gatewayUrl?: string;
}

export interface CapsuleInput {
  title: string;
  content: string;
  type: Capsule['type'];
  unlockAt: string;
  isPublic?: boolean;
  isEncrypted?: boolean;
  tags?: string[];
  linkedTaskId?: string;
  linkedNoteId?: string;
}

export interface CapsuleRevealInput {
  status: Extract<Capsule['status'], 'revealed' | 'failed' | 'extended'>;
  reflection?: string;
  newUnlockAt?: string;
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

export const capsulesApi = {
  async list(): Promise<Capsule[]> {
    const res = await fetch(`${API_BASE}/capsules`);
    if (!res.ok) throw await httpError(res, 'Failed to list capsules');
    const data = await res.json();
    return data.capsules;
  },

  async create(input: CapsuleInput): Promise<Capsule> {
    const res = await fetch(`${API_BASE}/capsules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw await httpError(res, 'Failed to create capsule');
    return res.json();
  },

  async reveal(id: string, input: CapsuleRevealInput): Promise<Capsule> {
    const res = await fetch(`${API_BASE}/capsules/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw await httpError(res, 'Failed to reveal capsule');
    return res.json();
  },

  async delete(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/capsules/${id}`, { method: 'DELETE' });
    if (!res.ok) throw await httpError(res, 'Failed to delete capsule');
  },

  async seal(id: string, provider: 'arweave' | 'evm', proof?: Partial<CapsuleProof>): Promise<Capsule> {
    const res = await fetch(`${API_BASE}/capsules/${id}/seal/${provider}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(proof ?? {}),
    });
    if (!res.ok) throw await httpError(res, `Failed to seal capsule to ${provider}`);
    return res.json();
  },
};
