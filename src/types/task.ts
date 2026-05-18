export type Task = {
  id: string;
  title: string;
  description?: string;
  status: 'todo' | 'done' | 'migrated';
  tags?: string[];
  project?: string;
  deadline?: string;
  priority?: 'high' | 'medium' | 'low';
  source_date?: string;
};

export type DailyNoteData = {
  date: string;
  content: string;
  tasks: Task[];
  lastModified?: string;
};

export type ConfigData = {
  workspaceRoot: string;
  dailyPathTemplate: string;
  rolloverTrigger: string;
  rolloverSkipTags: string[];
  githubRepo?: string;
};

export type Project = {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'completed' | 'archived';
  createdAt: string;
  updatedAt: string;
  tags?: string[];
  deadline?: string;
  filePath?: string;
};

export type NoteType = 'note' | 'meeting_note' | 'summary';

export type Note = {
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
};

export type PromptTemplate = {
  id: string;
  name: string;
  prompt: string;
  scope: string;
  createdAt: string;
};
