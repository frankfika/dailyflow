/**
 * AI Tool definitions for DailyFlow function calling (frontend-parsed mode).
 * These are injected into the system prompt; the model outputs <tool_call> tags,
 * which the frontend parses and executes locally.
 *
 * v2 (AI-operated CRUD): the registry now covers the app's primary write and
 * read surfaces — tasks (create/search/update/complete/delete), notes
 * (create/search/delete), and events / topic spaces (create/add-task/rename/
 * complete/delete). Writes execute against the real APIs; the executor tags
 * every mutation with a data scope so the send pipeline can refresh the UI.
 *
 * Safety model (C1): delete_* tools NEVER trust the model. Any `confirm`
 * argument the model passes is ignored — the executor returns a
 * `pendingConfirmation` result instead, the send pipeline shows the human a
 * confirmation dialog (aiConfirmBus → AiConfirmDialog), and the call is only
 * re-executed with `userConfirmed: true` after the user agrees.
 */

export interface AIToolParameter {
  type: string;
  description: string;
  enum?: string[];
}

export interface AITool {
  name: string;
  description: string;
  parameters: Record<string, AIToolParameter>;
  required?: string[];
}

export interface AIToolCall {
  name: string;
  arguments: Record<string, any>;
}

/**
 * A destructive tool refused to run because the human has not confirmed yet.
 * The send pipeline turns this into an AiConfirmDialog request; on user
 * agreement the same call is re-executed with `userConfirmed: true`.
 */
export interface AIPendingConfirmation {
  tool: string;
  /** Human-readable target, e.g. `任务「Doomed task」` or a note/event title. */
  targetSummary: string;
  /** Original call arguments, re-used verbatim for the confirmed retry. */
  args: Record<string, unknown>;
}

export interface AIToolResult {
  success: boolean;
  message: string;
  data?: any;
  /** Which UI dataset the write touched, so the caller can refresh it. */
  mutated?: 'tasks' | 'notes' | 'events' | null;
  /** Set when a delete_* call is waiting for the human confirmation gate. */
  pendingConfirmation?: AIPendingConfirmation;
}

/**
 * Tools whose execution is gated behind an explicit human confirmation.
 * The model cannot satisfy this gate — `confirm: true` from the model is
 * always ignored; only `ToolContext.userConfirmed` (set after the user clicks
 * "confirm" in AiConfirmDialog) lets these run.
 */
const CONFIRM_REQUIRED_TOOLS = new Set(['delete_task', 'delete_note', 'delete_event']);

export function requiresConfirmation(toolName: string): boolean {
  return CONFIRM_REQUIRED_TOOLS.has(toolName);
}

export const AVAILABLE_TOOLS: AITool[] = [
  // ── Tasks: read ──────────────────────────────────────────────────────────
  {
    name: 'list_today_tasks',
    description: 'List all tasks scheduled for today (the currently open daily note). Use this to ground answers about the user\'s day.',
    parameters: {},
  },
  {
    name: 'search_tasks',
    description: 'Search tasks by keyword in title or tags. Returns matching tasks with their ids, statuses and dates. Always search before updating or deleting so you can pass the exact task_id.',
    parameters: {
      query: { type: 'string', description: 'Search keyword (required)' },
    },
    required: ['query'],
  },
  // ── Tasks: write ─────────────────────────────────────────────────────────
  {
    name: 'create_task',
    description: 'Create a task on a daily note. Dates must be YYYY-MM-DD; omit date to use today.',
    parameters: {
      title: { type: 'string', description: 'Task title (required)' },
      date: { type: 'string', description: 'Target daily note date, YYYY-MM-DD. Omit for today.' },
      deadline: { type: 'string', description: 'Deadline, YYYY-MM-DD (optional)' },
      priority: { type: 'string', description: 'Priority (optional)', enum: ['high', 'medium', 'low'] },
      tags: { type: 'string', description: 'Comma-separated tags, e.g. "work,deep" (optional)' },
      project: { type: 'string', description: 'Project name (optional)' },
    },
    required: ['title'],
  },
  {
    name: 'update_task',
    description: 'Edit an existing task. Identify it by task_id (preferred, from search_tasks) or by an exact/unique title query. Only the fields you provide change.',
    parameters: {
      task_id: { type: 'string', description: 'Task id from search/list results (preferred)' },
      title_query: { type: 'string', description: 'Exact or unique substring of the task title (used when task_id is unknown)' },
      new_title: { type: 'string', description: 'New title (optional)' },
      deadline: { type: 'string', description: 'New deadline YYYY-MM-DD (optional)' },
      priority: { type: 'string', description: 'New priority (optional)', enum: ['high', 'medium', 'low'] },
      tags: { type: 'string', description: 'Comma-separated tags replacing existing ones (optional)' },
      project: { type: 'string', description: 'New project name (optional)' },
      description: { type: 'string', description: 'New description text (optional)' },
    },
  },
  {
    name: 'complete_task',
    description: 'Mark a task as done. Identify by task_id or unique title query.',
    parameters: {
      task_id: { type: 'string', description: 'Task id (preferred)' },
      title_query: { type: 'string', description: 'Exact or unique substring of the task title' },
    },
  },
  {
    name: 'delete_task',
    description: 'Permanently delete a task. The app always shows the user a confirmation dialog before this runs — call it once you know the exact target; never claim it succeeded before the tool result says so.',
    parameters: {
      task_id: { type: 'string', description: 'Task id (preferred)' },
      title_query: { type: 'string', description: 'Exact or unique substring of the task title' },
      confirm: { type: 'boolean', description: 'Ignored. Confirmation is requested from the user by the app itself.' },
    },
  },
  // ── Notes ────────────────────────────────────────────────────────────────
  {
    name: 'search_notes',
    description: 'Search the user\'s notes by keyword in title or body. Use before editing/deleting a note to get its id.',
    parameters: {
      query: { type: 'string', description: 'Search keyword (required)' },
    },
    required: ['query'],
  },
  {
    name: 'create_note',
    description: 'Create a note with a title and markdown body.',
    parameters: {
      title: { type: 'string', description: 'Note title (required)' },
      body: { type: 'string', description: 'Markdown body (required)' },
      type: { type: 'string', description: 'Note type (optional)', enum: ['note', 'idea', 'journal', 'meeting'] },
    },
    required: ['title', 'body'],
  },
  {
    name: 'delete_note',
    description: 'Permanently delete a note by id. The app always shows the user a confirmation dialog before this runs — call it once you know the exact note id.',
    parameters: {
      note_id: { type: 'string', description: 'Note id from search_notes (required)' },
      confirm: { type: 'boolean', description: 'Ignored. Confirmation is requested from the user by the app itself.' },
    },
    required: ['note_id'],
  },
  // ── Events / topic spaces ────────────────────────────────────────────────
  {
    name: 'create_event',
    description: 'Create an event (a topic canvas the user decomposes work into). Today view groups tasks by event.',
    parameters: {
      title: { type: 'string', description: 'Event title (required)' },
    },
    required: ['title'],
  },
  {
    name: 'add_task_to_event',
    description: 'Add a task to an existing event: it becomes a canvas node scheduled for the given date.',
    parameters: {
      event_title: { type: 'string', description: 'Exact or unique substring of the event title (required)' },
      title: { type: 'string', description: 'Task title (required)' },
      date: { type: 'string', description: 'Scheduled date YYYY-MM-DD. Omit for today.' },
    },
    required: ['event_title', 'title'],
  },
  {
    name: 'update_event',
    description: 'Rename an event or change its status.',
    parameters: {
      event_id: { type: 'string', description: 'Event id (preferred)' },
      title_query: { type: 'string', description: 'Exact or unique substring of the event title' },
      new_title: { type: 'string', description: 'New event title (optional)' },
      status: { type: 'string', description: 'New status (optional)', enum: ['active', 'completed', 'archived'] },
    },
  },
  {
    name: 'delete_event',
    description: 'Delete an event (its canvas stays on disk but it disappears from the UI). The app always shows the user a confirmation dialog before this runs.',
    parameters: {
      event_id: { type: 'string', description: 'Event id (preferred)' },
      title_query: { type: 'string', description: 'Exact or unique substring of the event title' },
      confirm: { type: 'boolean', description: 'Ignored. Confirmation is requested from the user by the app itself.' },
    },
  },
];

/**
 * Build the tool-instruction appendix for the system prompt.
 */
export function buildToolInstructions(language: 'en' | 'zh', today?: string): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('---');
  lines.push(language === 'zh'
    ? '你可以使用以下工具来帮助用户执行真实操作。当你需要执行操作时，输出如下格式的 JSON：'
    : 'You can use the following tools to perform REAL actions on the user\'s data. When you need to perform an action, output JSON in this exact format:');
  lines.push('');
  lines.push('<tool_call>{"name": "TOOL_NAME", "arguments": {"key": "value"}}</tool_call>');
  lines.push('');
  lines.push(language === 'zh' ? '可用工具：' : 'Available tools:');
  for (const tool of AVAILABLE_TOOLS) {
    const params = Object.entries(tool.parameters)
      .map(([k, v]) => `${k}${tool.required?.includes(k) ? '*' : ''}: ${v.type} — ${v.description}`)
      .join('; ');
    lines.push(`- ${tool.name}: ${tool.description} (${params || 'no arguments'})`);
  }
  lines.push('');
  if (today) {
    lines.push(language === 'zh'
      ? `今天是 ${today}。所有日期一律用 YYYY-MM-DD；"今天/明天/下周三"等相对日期先换算成具体日期再传入工具。`
      : `Today is ${today}. All dates must be YYYY-MM-DD; resolve relative dates ("tomorrow", "next Wednesday") yourself before calling a tool.`);
  }
  lines.push(language === 'zh'
    ? [
        '操作规则：',
        '1. 工具会真实读写用户数据。执行写操作后，系统会把真实结果返回给你，你必须基于结果作答，不得编造或声称未发生的操作。',
        '2. 更新/完成/删除前先用 search 或 list 拿到准确的 task_id；按标题匹配时必须是唯一匹配，有歧义就列出候选让用户选择。',
        '3. delete_* 由应用自动向用户弹出确认框，你无法代替用户确认（confirm 参数会被忽略）。调用后以工具返回结果为准：等待确认时请告知用户正在等待其确认，用户拒绝则不得再尝试。',
        '4. 一次只输出工具调用所需的参数，不要输出多余字段。',
      ].join('\n')
    : [
        'Operating rules:',
        '1. Tools really read/write the user\'s data. After a write, the real result is returned to you — answer based on it; never fabricate or claim actions that did not happen.',
        '2. Before update/complete/delete, use search or list to obtain the exact task_id. When matching by title, it must be unique; if ambiguous, list candidates and ask the user to choose.',
        '3. delete_* tools trigger a confirmation dialog shown to the user by the app itself — you cannot confirm on their behalf (the confirm argument is ignored). Rely on the tool result: while confirmation is pending, tell the user you are waiting; if the user declines, do not retry.',
        '4. Only include the arguments a tool needs.',
      ].join('\n'));
  return lines.join('\n');
}

/**
 * Parse tool calls from assistant text.
 * Returns { text: cleaned text without tool calls, calls: parsed tool calls }
 */
export function parseToolCalls(text: string): { text: string; calls: AIToolCall[] } {
  const calls: AIToolCall[] = [];
  const pattern = /<tool_call>(.*?)<\/tool_call>/gs;
  const cleanedText = text.replace(pattern, (fullMatch, body: string) => {
    try {
      const raw = body.trim();
      const parsed = JSON.parse(raw);
      if (parsed.name && typeof parsed.arguments === 'object') {
        calls.push({ name: parsed.name, arguments: parsed.arguments });
        return '';
      }
    } catch {
      // Preserve malformed content so the user never receives a mysterious
      // blank answer when a model emits invalid tool JSON.
    }
    return fullMatch;
  }).trim();
  return { text: cleanedText, calls };
}
