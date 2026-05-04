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
};
