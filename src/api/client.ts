const API_BASE = '/api';

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
  dailyPathTemplate: string;
  rolloverTrigger: string;
  rolloverSkipTags: string[];
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

  async edit(taskId: string, date: string, title: string, description?: string): Promise<void> {
    const res = await fetch(`${API_BASE}/tasks/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, title, description }),
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
