export interface Task {
  id: string;
  title: string;
  description?: string;
  comment?: string;
  comments?: { text: string; timestamp: string }[];
  status: 'todo' | 'done' | 'migrated';
  tags?: string[];
  project?: string;
  deadline?: string;
  priority?: 'high' | 'medium' | 'low';
  source_date?: string;
  /** Daily note that currently owns the task. Used by read-only backlog previews. */
  host_date?: string;
  line?: number;
  /**
   * v2 (Topic Spaces): owning topic space. Optional — most tasks predate
   * the migration and remain unattached. Backed in-memory only for now;
   * markdown persistence is intentionally deferred to Phase 4 (SPEC §2.3).
   */
  spaceId?: string;
  /** v2: source mindmap if this task was promoted from a node. */
  originMindmapId?: string;
  /** v2: source mindmap node id if this task was promoted from a node. */
  originNodeId?: string;
  /** Optional parent Task id derived from a task-node parent in the map. */
  parentTaskId?: string;
  /** Planning order inherited from the source mindmap node. */
  planOrder?: number;
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
  // AI Provider Configs (JSON string for durability across updates)
  providerConfigs?: string;
  /** Unified model registry (chat, meeting summary, and transcription). */
  modelCenter?: string;
  // Feishu enterprise sync. OAuth tokens are owned by lark-cli / the OS
  // credential store and are never persisted in DailyFlow's config.
  feishuSyncEnabled?: boolean;
  feishuSyncIntervalMinutes?: number;
  feishuTaskSyncEnabled?: boolean;
  feishuCalendarSyncEnabled?: boolean;
  googleCalendarClientId?: string;
  /** Team collaboration config. Members share a git repo; leader has read-only view. */
  team?: {
    role: 'leader' | 'member';
    memberId: string;
    members: { id: string; name: string; path: string }[];
  };
  /** v2 (AI-Native) feature flags. Independent of the v1 config. */
  v2?: {
    enabled?: boolean;
    inboxV2?: boolean;
    todayV2?: boolean;
    memoryV2?: boolean;
    connectorsV2?: boolean;
    eventFirst?: boolean;
    aiEnabled?: boolean;
    contextBudgetBytes?: number;
  };
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


export type ThinkingWorkspaceType = 'goal' | 'problem' | 'research' | 'product_design' | 'project_phase' | 'general';
export type ThinkingWorkspaceStatus = 'active' | 'paused' | 'completed' | 'archived';

export interface WorkspaceTimelineEntry {
  id: string;
  date: string;
  body: string;
  type: 'log' | 'decision' | 'blocker' | 'ai_review';
}

export interface ThinkingWorkspace {
  id: string;
  title: string;
  kind: 'workspace';
  type?: ThinkingWorkspaceType;
  status: ThinkingWorkspaceStatus;
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
  timeline: WorkspaceTimelineEntry[];
  createdAt: string;
  updatedAt: string;
  filePath?: string;
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

/**
 * Data Model: Task vs Note
 * ------------------------
 * Tasks and Notes are independent first-class entities:
 *  - A Task is a single markdown line inside a daily file
 *    (`Daily/YYYY/MM/YYYY-MM-DD.md`). Its stable identity is the
 *    `^id-XXX` marker on that line.
 *  - A Note is its own file under `Notes/YYYY/MM/<id>.md`. Its stable
 *    identity is the file path / `id` field.
 *
 * A task is NOT a note and never becomes one. The only relationship between
 * the two is a **forward reference** stored on the note:
 *
 *     Note.linkedTaskIds : string[]   (Note -> Task, *one-way*)
 *
 * Tasks do NOT store a back-reference to notes. The "notes for this task"
 * view is derived at query time (see `taskLinkedNotesCount` in App.tsx and
 * the read-time link pruning in services/notes.ts).
 *
 * Stale IDs (e.g. the task was deleted or rolled past) are filtered out at
 * read time — never propagated, never silently lost. This is why the
 * relationship is one-way: it avoids the two-way sync problem.
 */
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
  /** IDs of tasks this note references. Forward reference only. */
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
}
