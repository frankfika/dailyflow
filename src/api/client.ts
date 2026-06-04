/// <reference types="vite/client" />
const API_BASE = import.meta.env.DEV ? '/api' : 'http://localhost:3003/api';

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
  deepseekApiKey?: string;
  aiProvider?: 'deepseek' | 'anthropic' | 'openai' | 'custom';
  aiApiKey?: string;
  aiModel?: string;
  aiBaseUrl?: string;
  aiFormat?: 'openai' | 'anthropic';
  ipfsEnabled?: boolean;
  ipfsProvider?: 'pinata';
  ipfsApiKey?: string;
  ipfsGateway?: string;
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
    if (!res.ok) throw new Error('Failed to fetch file');
    return res.json();
  },

  async create(date: string, content: string): Promise<void> {
    const res = await fetch(`${API_BASE}/files/${date}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) throw new Error('Failed to create file');
  },

  async update(date: string, content: string): Promise<void> {
    const res = await fetch(`${API_BASE}/files/${date}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) throw new Error('Failed to update file');
  },

  async list(): Promise<string[]> {
    const res = await fetch(`${API_BASE}/files/list`);
    if (!res.ok) throw new Error('Failed to list files');
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
    if (!res.ok) throw new Error('Failed to fetch tasks');
    const data = await res.json();
    return data.tasks;
  },

  async updateStatus(taskId: string, date: string, status: 'todo' | 'done'): Promise<void> {
    const res = await fetch(`${API_BASE}/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, date }),
    });
    if (!res.ok) throw new Error('Failed to update task');
  },

  async create(date: string, task: Record<string, unknown>): Promise<void> {
    const res = await fetch(`${API_BASE}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, task }),
    });
    if (!res.ok) throw new Error('Failed to create task');
  },

  async edit(
    taskId: string,
    date: string,
    updates: {
      title?: string;
      description?: string;
      comment?: string;
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
    if (!res.ok) throw new Error('Failed to edit task');
  },

  async delete(taskId: string, date: string): Promise<void> {
    const res = await fetch(`${API_BASE}/tasks/${taskId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date }),
    });
    if (!res.ok) throw new Error('Failed to delete task');
  },
};

/**
 * 任务迁移 API
 */
export const rolloverApi = {
  async preview(toDate: string): Promise<RolloverPreviewData | null> {
    const res = await fetch(`${API_BASE}/rollover/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toDate }),
    });
    if (!res.ok) throw new Error('Failed to preview rollover');
    return res.json();
  },

  async apply(toDate: string): Promise<{ success: boolean; migratedCount: number }> {
    const res = await fetch(`${API_BASE}/rollover/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toDate }),
    });
    if (!res.ok) throw new Error('Failed to apply rollover');
    return res.json();
  },
};

/**
 * 配置管理 API
 */
export const configApi = {
  async get(): Promise<ConfigData> {
    const res = await fetch(`${API_BASE}/config`);
    if (!res.ok) throw new Error('Failed to fetch config');
    return res.json();
  },

  async update(config: ConfigData): Promise<void> {
    const res = await fetch(`${API_BASE}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!res.ok) throw new Error('Failed to update config');
  },
};

export const workspacesApi = {
  async list(): Promise<{ workspaces: Workspace[]; activeWorkspaceId: string }> {
    const res = await fetch(`${API_BASE}/config/workspaces`);
    if (!res.ok) throw new Error('Failed to list workspaces');
    return res.json();
  },

  async create(name: string, path: string): Promise<Workspace> {
    const res = await fetch(`${API_BASE}/config/workspaces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, path }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create workspace');
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
      throw new Error(data.error || 'Failed to rename workspace');
    }
  },

  async remove(id: string): Promise<{ activeWorkspaceId: string }> {
    const res = await fetch(`${API_BASE}/config/workspaces/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete workspace');
    return data;
  },

  async activate(id: string): Promise<Workspace> {
    const res = await fetch(`${API_BASE}/config/workspaces/${id}/activate`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to activate workspace');
    return data.workspace;
  },

  async pickFolder(): Promise<string | null> {
    const res = await fetch(`${API_BASE}/config/choose-folder`);
    if (res.status === 400) return null;
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to open folder picker');
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
    if (!res.ok) throw new Error('Failed to fetch projects');
    return res.json();
  },

  async getById(id: string): Promise<ProjectData> {
    const res = await fetch(`${API_BASE}/projects/${id}`);
    if (!res.ok) throw new Error('Failed to fetch project');
    return res.json();
  },

  async create(project: Omit<ProjectData, 'id' | 'createdAt' | 'updatedAt' | 'filePath'>): Promise<ProjectData> {
    const res = await fetch(`${API_BASE}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    });
    if (!res.ok) throw new Error('Failed to create project');
    return res.json();
  },

  async update(id: string, updates: Partial<Omit<ProjectData, 'id' | 'createdAt' | 'filePath'>>): Promise<ProjectData> {
    const res = await fetch(`${API_BASE}/projects/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('Failed to update project');
    return res.json();
  },

  async delete(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/projects/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete project');
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
    if (!res.ok) throw new Error('Failed to get git status');
    return res.json();
  },

  async sync(message: string): Promise<GitSyncResult> {
    const res = await fetch(`${API_BASE}/git/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    if (!res.ok) throw new Error('Failed to sync');
    return res.json();
  },

  async init(): Promise<{ success: boolean; error?: string }> {
    const res = await fetch(`${API_BASE}/git/init`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Failed to init git repo');
    return res.json();
  },

  async setRemote(): Promise<{ success: boolean; error?: string }> {
    const res = await fetch(`${API_BASE}/git/set-remote`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Failed to set remote');
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
  prompt: string;
  scope: string;
  createdAt: string;
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
    if (!res.ok) throw new Error('Failed to fetch notes');
    return res.json();
  },

  async getByDate(date: string): Promise<NoteData[]> {
    const res = await fetch(`${API_BASE}/notes/date/${date}`);
    if (!res.ok) throw new Error('Failed to fetch notes for date');
    return res.json();
  },

  async getById(id: string): Promise<NoteData> {
    const res = await fetch(`${API_BASE}/notes/${id}`);
    if (!res.ok) throw new Error('Failed to fetch note');
    return res.json();
  },

  async create(note: Omit<NoteData, 'id' | 'createdAt' | 'updatedAt' | 'filePath' | 'mentions'>): Promise<NoteData> {
    const res = await fetch(`${API_BASE}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(note),
    });
    if (!res.ok) throw new Error('Failed to create note');
    return res.json();
  },

  async update(id: string, updates: Partial<Omit<NoteData, 'id' | 'createdAt' | 'filePath'>>): Promise<NoteData> {
    const res = await fetch(`${API_BASE}/notes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('Failed to update note');
    return res.json();
  },

  async delete(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/notes/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete note');
  },

  async getMentions(): Promise<string[]> {
    const res = await fetch(`${API_BASE}/notes/mentions`);
    if (!res.ok) throw new Error('Failed to fetch mentions');
    return res.json();
  },
};

/**
 * 提示词模板 API
 */
export const promptsApi = {
  async getAll(): Promise<PromptTemplateData[]> {
    const res = await fetch(`${API_BASE}/prompts`);
    if (!res.ok) throw new Error('Failed to fetch prompts');
    return res.json();
  },

  async create(data: Omit<PromptTemplateData, 'id' | 'createdAt'>): Promise<PromptTemplateData> {
    const res = await fetch(`${API_BASE}/prompts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to create prompt');
    return res.json();
  },

  async update(id: string, updates: Partial<Omit<PromptTemplateData, 'id' | 'createdAt'>>): Promise<PromptTemplateData> {
    const res = await fetch(`${API_BASE}/prompts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('Failed to update prompt');
    return res.json();
  },

  async delete(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/prompts/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete prompt');
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
    if (!res.ok) throw new Error('Failed to fetch recurring tasks');
    return res.json();
  },

  async create(data: Omit<RecurringTaskData, 'id' | 'createdAt'>): Promise<RecurringTaskData> {
    const res = await fetch(`${API_BASE}/recurring`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to create recurring task');
    return res.json();
  },

  async delete(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/recurring/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete recurring task');
  },

  async instantiate(date: string): Promise<{ created: number }> {
    const res = await fetch(`${API_BASE}/recurring/instantiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date }),
    });
    if (!res.ok) throw new Error('Failed to instantiate recurring tasks');
    return res.json();
  },
};

export interface AISummarizeRequest {
  provider: 'deepseek' | 'anthropic' | 'openai' | 'custom';
  apiKey: string;
  model?: string;
  baseUrl?: string;
  systemPrompt?: string;
  userPrompt: string;
  maxTokens?: number;
  format?: 'openai' | 'anthropic';
}

export interface AISummarizeResponse {
  summary: string;
  model: string;
  provider: string;
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
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || data.detail || `AI request failed (${res.status})`);
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
    if (!res.ok) throw new Error('Failed to list IPFS backups');
    return res.json();
  },
};
