export type Task = {
  id: string;
  title: string;
  description?: string;
  comment?: string; // Legacy
  comments?: { text: string; timestamp: string }[];
  status: 'todo' | 'done' | 'migrated';
  tags?: string[];
  project?: string;
  deadline?: string;
  priority?: 'high' | 'medium' | 'low';
  source_date?: string;
  // Topic Space v2 (Phase 1): the task's home topic space, if any. A task
  // with no spaceId belongs to "未分类" (unclassified). Kept in memory only
  // for now; markdown rows do not get a `^space:xxx` annotation until
  // Phase 4 decides on a round-trippable format.
  spaceId?: string;
  /** Origin mind map this task was promoted from, if any. */
  originMindmapId?: string;
  /** Origin mind map node this task was promoted from, if any. */
  originNodeId?: string;
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
  feishuSyncEnabled?: boolean;
  feishuSyncIntervalMinutes?: number;
  feishuTaskSyncEnabled?: boolean;
  feishuCalendarSyncEnabled?: boolean;
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

/**
 * Data Model: Task vs Note
 * ------------------------
 * Tasks and Notes are independent first-class entities. A task is a single
 * markdown line inside a daily file; a note is its own file under `Notes/`.
 *
 * The ONLY relationship is a one-way forward reference stored on the note:
 *
 *     Note.linkedTaskIds : string[]   (Note -> Task)
 *
 * Tasks do NOT store a back-reference to notes. The "notes for this task"
 * count (`taskLinkedNotesCount` in App.tsx) is computed at render time, and
 * the server prunes any `linkedTaskIds` that no longer point to a real task
 * before responding. This is why the relationship is one-way: avoiding the
 * two-way sync problem keeps the data honest.
 */
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
  /** Forward reference to task IDs. May be pruned at read time on the server. */
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
};
