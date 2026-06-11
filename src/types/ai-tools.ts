/**
 * AI Tool definitions for DailyFlow function calling (frontend-parsed mode).
 * These are injected into the system prompt; the model outputs <tool_call> tags,
 * which the frontend parses and executes locally.
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

export interface AIToolResult {
  success: boolean;
  message: string;
  data?: any;
}

export const AVAILABLE_TOOLS: AITool[] = [
  {
    name: 'create_note',
    description: 'Create a new note in the note system. Use this when the user asks you to save something as a note, create a note, or write down information.',
    parameters: {
      title: { type: 'string', description: 'Note title (required)' },
      body: { type: 'string', description: 'Note body content in Markdown (required)' },
      type: { type: 'string', description: 'Note type', enum: ['note', 'meeting_note', 'summary'] },
      tags: { type: 'array', description: 'Array of tag strings' },
    },
    required: ['title', 'body'],
  },
  {
    name: 'create_task',
    description: 'Create a new task for today. Use this when the user asks you to create a task, add a todo, or remind them of something.',
    parameters: {
      title: { type: 'string', description: 'Task title (required)' },
      tags: { type: 'array', description: 'Array of tag strings, e.g. ["work", "urgent"]' },
      deadline: { type: 'string', description: 'Deadline in YYYY-MM-DD format' },
      description: { type: 'string', description: 'Optional task description' },
    },
    required: ['title'],
  },
  {
    name: 'mark_task_done',
    description: 'Mark a task as completed by its title or ID. Use when the user says a task is done.',
    parameters: {
      taskId: { type: 'string', description: 'Exact task ID (preferred)' },
      title: { type: 'string', description: 'Task title (fallback if ID unknown)' },
    },
    required: ['taskId'],
  },
  {
    name: 'search_tasks',
    description: 'Search for tasks by keyword in title or tags. Returns matching tasks.',
    parameters: {
      query: { type: 'string', description: 'Search keyword (required)' },
    },
    required: ['query'],
  },
];

/**
 * Build the tool-instruction appendix for the system prompt.
 */
export function buildToolInstructions(language: 'en' | 'zh'): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('---');
  lines.push(language === 'zh'
    ? '你可以使用以下工具来帮助用户。当你需要执行操作时，输出如下格式的 JSON：'
    : 'You can use the following tools to help the user. When you need to perform an action, output JSON in this exact format:');
  lines.push('');
  lines.push('<tool_call>{"name": "TOOL_NAME", "arguments": {"key": "value"}}</tool_call>');
  lines.push('');
  lines.push(language === 'zh' ? '可用工具：' : 'Available tools:');
  for (const tool of AVAILABLE_TOOLS) {
    const params = Object.entries(tool.parameters)
      .map(([k, v]) => `${k}${tool.required?.includes(k) ? '*' : ''}: ${v.type} — ${v.description}`)
      .join('; ');
    lines.push(`- ${tool.name}: ${tool.description} (${params})`);
  }
  lines.push('');
  lines.push(language === 'zh'
    ? '重要提示：只有在用户明确要求你执行操作时才使用工具。不要猜测用户的意图。'
    : 'Important: only use tools when the user explicitly asks you to perform an action. Do not guess intent.');
  return lines.join('\n');
}

/**
 * Parse tool calls from assistant text.
 * Returns { text: cleaned text without tool calls, calls: parsed tool calls }
 */
export function parseToolCalls(text: string): { text: string; calls: AIToolCall[] } {
  const calls: AIToolCall[] = [];
  const pattern = /<tool_call>(.*?)<\/tool_call>/gs;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    try {
      const raw = match[1].trim();
      const parsed = JSON.parse(raw);
      if (parsed.name && typeof parsed.arguments === 'object') {
        calls.push({ name: parsed.name, arguments: parsed.arguments });
      }
    } catch {
      // ignore malformed tool calls
    }
  }
  const cleanedText = text.replace(/<tool_call>.*?<\/tool_call>/gs, '').trim();
  return { text: cleanedText, calls };
}
