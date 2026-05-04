export interface Task {
  id: string;
  title: string;
  status: 'todo' | 'done';
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
}

export interface RolloverPreview {
  fromDate: string;
  toDate: string;
  tasksToMigrate: Task[];
  targetContent: string;
}
