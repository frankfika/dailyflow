export interface Task {
  id: string;
  title: string;
  description?: string;
  comment?: string;
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

export interface Workspace {
  id: string;
  name: string;
  path: string;
  createdAt: string;
}

export interface Config {
  workspaceRoot: string;
  workspaces?: Workspace[];
  activeWorkspaceId?: string;
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
  // IPFS / Decentralized backup
  ipfsEnabled?: boolean;
  ipfsProvider?: 'pinata';
  ipfsApiKey?: string; // Pinata JWT token
  ipfsGateway?: string; // e.g. https://gateway.pinata.cloud or https://ipfs.io
}

export interface IpfsBackupRecord {
  cid: string;
  pinName: string;
  size: number;
  fileCount: number;
  createdAt: string;
  gateway?: string;
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

export type NoteType = 'note' | 'meeting_note' | 'summary';

export interface Note {
  id: string;
  title: string;
  body: string;
  type: NoteType;
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

export interface PromptTemplate {
  id: string;
  name: string;
  prompt: string;
  scope: string;
  createdAt: string;
}
