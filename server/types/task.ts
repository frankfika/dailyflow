export interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'todo' | 'done' | 'migrated';
  tags?: string[];
  project?: string;
  deadline?: string;
  priority?: 'high' | 'medium' | 'low';
  source_date?: string;
  line?: number; // 任务在文件中的行号
}

export interface DailyNote {
  date: string;
  content: string;
  tasks: Task[];
  lastModified?: Date;
}

export interface Config {
  workspaceRoot: string;
  dailyPathTemplate: string;
  rolloverTrigger: 'manual' | 'on_app_open';
  rolloverSkipTags: string[];
  githubRepo?: string;
  githubToken?: string;
  activeContext?: 'work' | 'life';
  // AI Configuration
  aiProvider?: 'deepseek' | 'anthropic' | 'openai' | 'custom';
  aiApiKey?: string;
  aiModel?: string;
  aiBaseUrl?: string; // For custom providers
  aiFormat?: 'openai' | 'anthropic'; // Protocol format for custom providers
}

export interface RolloverPreview {
  fromDate: string;
  toDate: string;
  tasksToMigrate: Task[];
  targetContent: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'completed' | 'archived';
  createdAt: string;
  updatedAt: string;
  tags?: string[];
  deadline?: string;
  filePath?: string; // 项目文件的路径
}
