/**
 * AI Tool Executor — evaluates parsed tool calls against the real app APIs.
 *
 * v2 (AI-operated CRUD): read tools answer from live data; write tools call
 * the same API clients the UI uses (tasksApi / notesApi / eventsApi). Every
 * executed write is tagged with a `mutated` data scope so the send pipeline
 * can refresh the affected queries, keeping the chat and the UI consistent.
 *
 * Safety model:
 * - destructive tools (delete_*) are gated by a HUMAN confirmation: any
 *   `confirm: true` the model passes is ignored. Without
 *   `ToolContext.userConfirmed` (set only after the user clicks confirm in
 *   AiConfirmDialog) they return a `pendingConfirmation` result and never
 *   touch the API;
 * - every write checks the caller's AbortSignal first, so a stopped request
 *   cannot keep mutating data;
 * - title-based lookups must be unique — ambiguity returns candidate lists
 *   instead of guessing, so the model asks the user to disambiguate.
 */

import { tasksApi, notesApi, eventsApi, type EditNodeTaskInput } from '../api/client';
import type { AIToolCall, AIToolResult } from '../types/ai-tools';

export type DataScope = 'tasks' | 'notes' | 'events';

export interface ToolContext {
  currentDate: string;
  activeContext: 'work' | 'life';
  language: 'en' | 'zh';
  tasks: any[];
  notes: any[];
  /** Event summaries for the current workspace (optional; enables event tools). */
  events?: any[];
  showToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
  /** Called (aggregated) by the send pipeline after any tool mutated data. */
  onDataChanged?: (scope: DataScope) => void;
  /**
   * C1: set to true ONLY after the user confirmed in AiConfirmDialog. The
   * model's own `confirm: true` argument is always ignored for delete_*.
   */
  userConfirmed?: boolean;
  /** C5: abort signal from the send pipeline — abort stops further writes. */
  signal?: AbortSignal;
}

interface TaskLike {
  id?: string;
  taskId?: string;
  title: string;
  status?: string;
  tags?: string[];
  deadline?: string;
  priority?: string;
  source_date?: string;
  host_date?: string;
  scheduledDate?: string;
  /** 'event-node' for canvas-bound tasks, otherwise standalone daily-note tasks. */
  kind?: 'event-node' | 'standalone' | string;
  mindmapId?: string;
  originMindmapId?: string;
  nodeId?: string;
  originNodeId?: string;
  eventId?: string;
}

type TaskLookup =
  | { kind: 'ok'; task: TaskLike }
  | { kind: 'not-found' }
  | { kind: 'ambiguous'; candidates: TaskLike[] };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeDate(input: unknown, fallback: string): string {
  return typeof input === 'string' && DATE_RE.test(input) ? input : fallback;
}

function taskHostDate(task: TaskLike, fallback: string): string {
  return (
    (typeof task.source_date === 'string' && DATE_RE.test(task.source_date) && task.source_date) ||
    (typeof task.host_date === 'string' && DATE_RE.test(task.host_date) && task.host_date) ||
    (typeof task.scheduledDate === 'string' && DATE_RE.test(task.scheduledDate) && task.scheduledDate) ||
    fallback
  );
}

function taskLabel(t: TaskLike, language: 'en' | 'zh'): string {
  const done = t.status === 'done' ? (language === 'zh' ? '[已完成] ' : '[done] ') : '';
  const tags = t.tags?.length ? ` (${t.tags.join(', ')})` : '';
  const date = taskHostDate(t, '');
  const prefix = t.kind === 'event-node' ? (language === 'zh' ? '[事件] ' : '[event] ') : '';
  return `${prefix}${done}${t.title}${tags}${date ? ` · ${date}` : ''}`;
}

/** True for tasks bound to an event canvas node (use node-task APIs, not legacy). */
function isEventNodeTask(t: TaskLike): boolean {
  return t.kind === 'event-node' || Boolean((t.originMindmapId || t.mindmapId) && (t.originNodeId || t.nodeId));
}

function eventNodeIds(t: TaskLike): { mindmapId: string; nodeId: string } | null {
  const mindmapId = t.originMindmapId || t.mindmapId;
  const nodeId = t.originNodeId || t.nodeId;
  return mindmapId && nodeId ? { mindmapId, nodeId } : null;
}

/**
 * Resolve a task by explicit id or by title query. Title matching prefers
 * exact (case-insensitive) matches, then unique substring matches; multiple
 * matches are returned as candidates instead of guessing.
 *
 * The visible projection only covers today, so when a local lookup misses
 * we consult the server's cross-date task index — an id or title returned
 * by search_tasks is always actionable afterwards.
 */
async function resolveTask(args: Record<string, any>, ctx: ToolContext): Promise<TaskLookup> {
  const localPool: TaskLike[] = (ctx.tasks || []).map((t: any) => ({
    id: t.taskId ?? t.id,
    title: String(t.title ?? ''),
    status: t.status,
    tags: t.tags,
    deadline: t.deadline,
    priority: t.priority,
    // Projection tasks live in today's note: stamp the current date so
    // ambiguity cards and search results always show where a hit lives.
    source_date: t.source_date || ctx.currentDate,
    host_date: t.host_date,
    scheduledDate: t.scheduledDate,
    kind: t.kind,
    mindmapId: t.mindmapId,
    originMindmapId: t.originMindmapId,
    nodeId: t.nodeId,
    originNodeId: t.originNodeId,
    eventId: t.eventId,
  })).filter(t => t.id && t.title);

  const match = (pool: TaskLike[]): TaskLookup => {
    const taskId = typeof args.task_id === 'string' ? args.task_id.trim() : '';
    if (taskId) {
      // Task ids are deterministic per date file, so the same id can exist
      // on several dates — more than one hit is ambiguity, not a target.
      const byId = pool.filter(t => t.id === taskId);
      if (byId.length === 1) return { kind: 'ok', task: byId[0] };
      if (byId.length > 1) return { kind: 'ambiguous', candidates: byId };
      return { kind: 'not-found' };
    }
    const query = typeof args.title_query === 'string' ? args.title_query.trim().toLowerCase() : '';
    if (!query) return { kind: 'not-found' };
    const exact = pool.filter(t => t.title.toLowerCase() === query);
    if (exact.length === 1) return { kind: 'ok', task: exact[0] };
    if (exact.length > 1) return { kind: 'ambiguous', candidates: exact };
    const partial = pool.filter(t => t.title.toLowerCase().includes(query));
    if (partial.length === 1) return { kind: 'ok', task: partial[0] };
    if (partial.length > 1) return { kind: 'ambiguous', candidates: partial };
    return { kind: 'not-found' };
  };

  const local = match(localPool);

  // Cross-date resolution via the server's task index: an id or title
  // returned by search_tasks is always actionable afterwards.
  //
  // Neither a local id hit nor a local title hit is authoritative: task ids
  // are deterministic per date file, so the same id can exist on several
  // dates. Always merge the cross-date hits — duplicates collapse on the
  // id@source_date key, and a real collision turns the lookup ambiguous
  // instead of silently resolving to today's copy.
  const taskId = typeof args.task_id === 'string' ? args.task_id.trim() : '';

  try {
    const query = typeof args.title_query === 'string' ? args.title_query.trim() : '';
    if (!taskId && !query) return local;
    const remote = await (taskId ? tasksApi.searchById(taskId) : tasksApi.search(query));
    const remotePool: TaskLike[] = (remote || []).map((t: any) => ({
      id: t.id,
      title: String(t.title ?? ''),
      status: t.status,
      tags: t.tags,
      deadline: t.deadline,
      priority: t.priority,
      source_date: t.source_date,
    })).filter(t => t.id && t.title);
    // Same id can live on multiple dates — dedupe on id + source_date so
    // same-titled tasks on other dates survive the merge and trip the
    // ambiguity check instead of being silently swallowed.
    const key = (t: TaskLike) => `${t.id}@${t.source_date ?? ''}`;
    const known = new Set(localPool.map(key));
    const merged = [...localPool, ...remotePool.filter(t => !known.has(key(t)))];
    if (merged.length === localPool.length) return local;
    return match(merged);
  } catch {
    return local;
  }
}

function lookupFailure(lookup: TaskLookup, language: 'en' | 'zh'): AIToolResult {
  if (lookup.kind === 'not-found') {
    return {
      success: false,
      message: language === 'zh'
        ? '未找到匹配的任务。请先用 search_tasks 或 list_today_tasks 确认标题或 id。'
        : 'No matching task. Use search_tasks or list_today_tasks to confirm the title or id first.',
    };
  }
  if (lookup.kind === 'ambiguous') {
    return {
      success: false,
      message: (language === 'zh'
        ? `找到 ${lookup.candidates.length} 个同名/相似任务，无法确定目标。候选：\n`
        : `Found ${lookup.candidates.length} matching tasks — target is ambiguous. Candidates:\n`)
        + lookup.candidates.map(t => `- ${taskLabel(t, language)}`).join('\n')
        + (language === 'zh' ? '\n请让用户选择，或用 title_query 提供更精确的标题。' : '\nAsk the user to choose, or provide a more precise title_query.'),
      data: lookup.candidates,
    };
  }
  return {
    success: false,
    message: language === 'zh' ? '任务解析失败' : 'Task lookup failed',
  };
}

/**
 * C1: the refusal returned for any delete_* the human has not confirmed.
 * The model's `confirm` argument is deliberately never read here.
 */
function pendingUserConfirmation(
  tool: string,
  targetSummary: string,
  args: Record<string, unknown>,
  language: 'en' | 'zh'
): AIToolResult {
  return {
    success: false,
    message: language === 'zh'
      ? `等待用户确认：「${tool}」目标 ${targetSummary}。删除是破坏性操作，已弹出确认框等待用户决定，在用户确认前不会执行任何删除。`
      : `Waiting for user confirmation: "${tool}" on ${targetSummary}. Deletion is destructive — a confirmation dialog is open; nothing will be deleted until the user agrees.`,
    pendingConfirmation: { tool, targetSummary, args },
  };
}

/** C5: a stopped request must never keep writing. */
function abortedResult(language: 'en' | 'zh'): AIToolResult {
  return {
    success: false,
    message: language === 'zh' ? '请求已停止，未执行该操作' : 'Request stopped — action not executed',
  };
}

function parseTags(input: unknown): string[] | undefined {
  if (typeof input !== 'string') return undefined;
  const tags = input.split(/[,，]/).map(s => s.trim()).filter(Boolean);
  return tags.length ? tags : undefined;
}

function failure(error: unknown, fallback: string): AIToolResult {
  return { success: false, message: (error as Error)?.message || fallback };
}

export async function executeToolCall(
  call: AIToolCall,
  ctx: ToolContext
): Promise<AIToolResult> {
  const { language, currentDate, activeContext } = ctx;
  try {
    switch (call.name) {
      // ── Tasks: read ──────────────────────────────────────────────────────
      case 'list_today_tasks': {
        const pool = (ctx.tasks || []).filter((t: any) => (t.taskId ?? t.id));
        if (pool.length === 0) {
          return { success: true, message: language === 'zh' ? '今天没有任务' : 'No tasks for today', data: [] };
        }
        const list = pool.map((t: any) => `- ${taskLabel(t, language)}`).join('\n');
        return {
          success: true,
          message: (language === 'zh' ? `今天共 ${pool.length} 个任务：\n` : `${pool.length} task(s) today:\n`) + list,
          data: pool,
        };
      }

      case 'search_tasks': {
        const query = String(call.arguments.query ?? '').trim();
        if (!query) return { success: false, message: 'Query is required' };
        const q = query.toLowerCase();
        // Local matches live in today's file, so stamp them with today's date
        // — the cross-date list must show a date for every hit.
        const local: TaskLike[] = (ctx.tasks || [])
          .filter((t: any) =>
            t.title?.toLowerCase().includes(q) ||
            t.tags?.some((tag: string) => tag.toLowerCase().includes(q))
          )
          .map((t: any) => ({ ...t, source_date: taskHostDate(t, currentDate) }));
        // Cross-date contract: only today's tasks are in the visible
        // projection, so always ask the server for the historical matches and
        // merge them with the local ones (local wins on id collisions because
        // it carries the freshest status).
        let matches: TaskLike[] = local;
        try {
          const remote = await tasksApi.search(query);
          const remoteMatches: TaskLike[] = (remote || []).map((t: any) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            tags: t.tags,
            deadline: t.deadline,
            priority: t.priority,
            source_date: t.source_date,
          }));
          // Dedupe on id + date: task ids repeat across date files.
          const key = (t: TaskLike) => `${t.id}@${t.source_date ?? ''}`;
          const seen = new Set(local.map(key));
          matches = [...local, ...remoteMatches.filter(t => !seen.has(key(t)))];
        } catch { /* offline moment — local results only */ }
        if (matches.length === 0) {
          return { success: true, message: language === 'zh' ? '未找到匹配的任务' : 'No matching tasks found', data: [] };
        }
        const list = matches.map(t => `- ${taskLabel(t, language)}`).join('\n');
        return {
          success: true,
          message: (language === 'zh' ? `找到 ${matches.length} 个任务：\n` : `Found ${matches.length} task(s):\n`) + list,
          data: matches,
        };
      }

      // ── Tasks: write ─────────────────────────────────────────────────────
      case 'create_task': {
        if (ctx.signal?.aborted) return abortedResult(language);
        const title = String(call.arguments.title ?? '').trim();
        if (!title) return { success: false, message: language === 'zh' ? '任务标题不能为空' : 'Task title is required' };
        const date = normalizeDate(call.arguments.date, currentDate);
        const task: Record<string, unknown> = { title };
        if (typeof call.arguments.deadline === 'string' && DATE_RE.test(call.arguments.deadline)) task.deadline = call.arguments.deadline;
        if (['high', 'medium', 'low'].includes(call.arguments.priority)) task.priority = call.arguments.priority;
        if (typeof call.arguments.project === 'string' && call.arguments.project.trim()) task.project = call.arguments.project.trim();
        const tags = parseTags(call.arguments.tags);
        if (tags) task.tags = tags;
        await tasksApi.create(date, task);
        return {
          success: true,
          mutated: 'tasks',
          message: language === 'zh' ? `已创建任务「${title}」→ ${date}` : `Created task "${title}" → ${date}`,
          data: { title, date },
        };
      }

      case 'update_task': {
        if (ctx.signal?.aborted) return abortedResult(language);
        const lookup = await resolveTask(call.arguments, ctx);
        if (lookup.kind !== 'ok') return lookupFailure(lookup, language);
        const task = lookup.task;
        const date = taskHostDate(task, currentDate);
        const eventNode = isEventNodeTask(task) ? eventNodeIds(task) : null;
        // Node-task edits support a narrower field set than the legacy
        // standalone edit; map our args onto whichever contract applies.
        if (eventNode) {
          const updates: EditNodeTaskInput['updates'] = {};
          if (typeof call.arguments.new_title === 'string' && call.arguments.new_title.trim()) updates.title = call.arguments.new_title.trim();
          if (typeof call.arguments.description === 'string' && call.arguments.description.trim()) updates.description = call.arguments.description.trim();
          if (typeof call.arguments.deadline === 'string' && DATE_RE.test(call.arguments.deadline)) updates.deadline = call.arguments.deadline;
          if (['high', 'medium', 'low', ''].includes(call.arguments.priority)) updates.priority = call.arguments.priority;
          const tags = parseTags(call.arguments.tags);
          if (tags) updates.tags = tags;
          if (Object.keys(updates).length === 0) {
            return { success: false, message: language === 'zh' ? '没有提供任何要修改的字段' : 'No fields to update were provided' };
          }
          await eventsApi.editNodeTask({ taskId: task.id!, scheduledDate: date, updates });
          const changes = Object.keys(updates).join(', ');
          return {
            success: true,
            mutated: 'tasks',
            message: language === 'zh' ? `已更新「${task.title}」（${changes}）` : `Updated "${task.title}" (${changes})`,
            data: { id: task.id, updates },
          };
        }

        const updates: Record<string, unknown> = {};
        if (typeof call.arguments.new_title === 'string' && call.arguments.new_title.trim()) updates.title = call.arguments.new_title.trim();
        if (typeof call.arguments.deadline === 'string' && DATE_RE.test(call.arguments.deadline)) updates.deadline = call.arguments.deadline;
        if (['high', 'medium', 'low', ''].includes(call.arguments.priority)) updates.priority = call.arguments.priority;
        const tags = parseTags(call.arguments.tags);
        if (tags) updates.tags = tags;
        if (typeof call.arguments.project === 'string' && call.arguments.project.trim()) updates.project = call.arguments.project.trim();
        if (typeof call.arguments.description === 'string' && call.arguments.description.trim()) updates.description = call.arguments.description.trim();
        if (Object.keys(updates).length === 0) {
          return { success: false, message: language === 'zh' ? '没有提供任何要修改的字段' : 'No fields to update were provided' };
        }
        await tasksApi.edit(task.id!, date, updates as any);
        const changes = Object.keys(updates).join(', ');
        return {
          success: true,
          mutated: 'tasks',
          message: language === 'zh' ? `已更新「${task.title}」（${changes}）` : `Updated "${task.title}" (${changes})`,
          data: { id: task.id, updates },
        };
      }

      case 'complete_task': {
        if (ctx.signal?.aborted) return abortedResult(language);
        const lookup = await resolveTask(call.arguments, ctx);
        if (lookup.kind !== 'ok') return lookupFailure(lookup, language);
        const task = lookup.task;
        const date = taskHostDate(task, currentDate);
        if (isEventNodeTask(task)) {
          await eventsApi.completeNodeTask({ taskId: task.id!, scheduledDate: date });
        } else {
          await tasksApi.updateStatus(task.id!, date, 'done');
        }
        return {
          success: true,
          mutated: 'tasks',
          message: language === 'zh' ? `已完成「${task.title}」` : `Completed "${task.title}"`,
          data: { id: task.id, title: task.title },
        };
      }

      case 'delete_task': {
        if (ctx.signal?.aborted) return abortedResult(language);
        const lookup = await resolveTask(call.arguments, ctx);
        if (lookup.kind !== 'ok') return lookupFailure(lookup, language);
        const task = lookup.task;
        // C1 human gate — the model's confirm:true is ignored by design.
        if (!ctx.userConfirmed) {
          return pendingUserConfirmation('delete_task', task.title, { ...call.arguments }, language);
        }
        const date = taskHostDate(task, currentDate);
        if (isEventNodeTask(task)) {
          const eventNode = eventNodeIds(task)!;
          await eventsApi.unscheduleNodeTask({
            taskId: task.id!,
            scheduledDate: date,
            mindmapId: eventNode.mindmapId,
            nodeId: eventNode.nodeId,
          });
        } else {
          await tasksApi.delete(task.id!, date);
        }
        return {
          success: true,
          mutated: 'tasks',
          message: language === 'zh' ? `已删除「${task.title}」` : `Deleted "${task.title}"`,
          data: { id: task.id, title: task.title },
        };
      }

      // ── Notes ────────────────────────────────────────────────────────────
      case 'search_notes': {
        const query = String(call.arguments.query ?? '').trim().toLowerCase();
        if (!query) return { success: false, message: 'Query is required' };
        const matches = (ctx.notes || []).filter((n: any) =>
          n.title?.toLowerCase().includes(query) || n.body?.toLowerCase().includes(query)
        );
        if (matches.length === 0) {
          return { success: true, message: language === 'zh' ? '未找到匹配的笔记' : 'No matching notes found', data: [] };
        }
        const list = matches.map((n: any) => `- ${n.title}${n.date ? ` · ${n.date}` : ''}`).join('\n');
        return {
          success: true,
          message: (language === 'zh' ? `找到 ${matches.length} 篇笔记：\n` : `Found ${matches.length} note(s):\n`) + list,
          data: matches,
        };
      }

      case 'create_note': {
        if (ctx.signal?.aborted) return abortedResult(language);
        const title = String(call.arguments.title ?? '').trim();
        const body = String(call.arguments.body ?? '');
        if (!title || !body.trim()) {
          return { success: false, message: language === 'zh' ? '标题和正文都不能为空' : 'Title and body are required' };
        }
        const type = ['note', 'idea', 'journal', 'meeting'].includes(call.arguments.type) ? call.arguments.type : 'note';
        const note = await notesApi.create({
          title,
          body,
          type,
          date: currentDate,
          context: activeContext,
          tags: ['ai-generated'],
        } as any);
        return {
          success: true,
          mutated: 'notes',
          message: language === 'zh' ? `已创建笔记「${title}」` : `Created note "${title}"`,
          data: { id: note?.id, title },
        };
      }

      case 'delete_note': {
        if (ctx.signal?.aborted) return abortedResult(language);
        const noteId = String(call.arguments.note_id ?? '').trim();
        if (!noteId) return { success: false, message: language === 'zh' ? '缺少 note_id，请先用 search_notes 查询' : 'note_id is required; use search_notes first' };
        // C1 human gate — the model's confirm:true is ignored by design.
        if (!ctx.userConfirmed) {
          const known = (ctx.notes || []).find((n: any) => (n.id || n.noteId) === noteId);
          return pendingUserConfirmation('delete_note', known?.title ? known.title : noteId, { ...call.arguments }, language);
        }
        await notesApi.delete(noteId);
        return { success: true, mutated: 'notes', message: language === 'zh' ? '已删除该笔记' : 'Note deleted', data: { id: noteId } };
      }

      // ── Events / topic spaces ────────────────────────────────────────────
      case 'create_event': {
        if (ctx.signal?.aborted) return abortedResult(language);
        const title = String(call.arguments.title ?? '').trim();
        if (!title) return { success: false, message: language === 'zh' ? '事件标题不能为空' : 'Event title is required' };
        const detail = await eventsApi.create({ title, context: activeContext });
        return {
          success: true,
          mutated: 'events',
          message: language === 'zh' ? `已创建事件「${title}」` : `Created event "${title}"`,
          data: { id: detail?.id, title },
        };
      }

      case 'add_task_to_event': {
        if (ctx.signal?.aborted) return abortedResult(language);
        const eventQuery = String(call.arguments.event_title ?? '').trim().toLowerCase();
        const title = String(call.arguments.title ?? '').trim();
        if (!eventQuery || !title) {
          return { success: false, message: language === 'zh' ? '需要 event_title 和 title' : 'event_title and title are required' };
        }
        const pool = ctx.events || [];
        const exact = pool.filter((e: any) => (e.title || '').toLowerCase() === eventQuery);
        const event = exact[0] || pool.find((e: any) => (e.title || '').toLowerCase().includes(eventQuery));
        if (!event?.id) {
          return {
            success: false,
            message: language === 'zh'
              ? `未找到事件「${call.arguments.event_title}」。可用事件：${pool.map((e: any) => e.title).join('、') || '（无）'}`
              : `Event "${call.arguments.event_title}" not found. Available: ${pool.map((e: any) => e.title).join(', ') || '(none)'}`,
          };
        }
        const mindmapId = event.mindmapId || event.id;
        const nodeId = `node_ai_${Date.now().toString(36)}`;
        const date = normalizeDate(call.arguments.date, currentDate);
        const result = await eventsApi.createTaskForNode({ mindmapId, nodeId, title, scheduledDate: date });
        return {
          success: true,
          mutated: 'tasks',
          message: language === 'zh'
            ? `已将「${title}」加入事件「${event.title}」→ ${date}`
            : `Added "${title}" to event "${event.title}" → ${date}`,
          data: { taskId: result.taskId, eventId: event.id, date },
        };
      }

      case 'update_event': {
        if (ctx.signal?.aborted) return abortedResult(language);
        const eventId = String(call.arguments.event_id ?? '').trim();
        const titleQuery = String(call.arguments.title_query ?? '').trim().toLowerCase();
        let event: any = null;
        if (eventId) {
          event = (ctx.events || []).find((e: any) => e.id === eventId);
        } else if (titleQuery) {
          const exact = (ctx.events || []).filter((e: any) => (e.title || '').toLowerCase() === titleQuery);
          event = exact[0] || (ctx.events || []).find((e: any) => (e.title || '').toLowerCase().includes(titleQuery));
        }
        if (!event?.id) {
          return { success: false, message: language === 'zh' ? '未找到目标事件，请先提供准确的事件标题或 id' : 'Target event not found; provide an exact event title or id first' };
        }
        const patch: { title?: string; status?: 'active' | 'completed' | 'archived' } = {};
        if (typeof call.arguments.new_title === 'string' && call.arguments.new_title.trim()) patch.title = call.arguments.new_title.trim();
        if (['active', 'completed', 'archived'].includes(call.arguments.status)) patch.status = call.arguments.status;
        if (Object.keys(patch).length === 0) {
          return { success: false, message: language === 'zh' ? '没有提供任何要修改的字段' : 'No fields to update were provided' };
        }
        await eventsApi.update(event.id, patch);
        const changes = Object.keys(patch).join(', ');
        return {
          success: true,
          mutated: 'events',
          message: language === 'zh' ? `已更新事件「${event.title}」（${changes}）` : `Updated event "${event.title}" (${changes})`,
          data: { id: event.id, patch },
        };
      }

      case 'delete_event': {
        if (ctx.signal?.aborted) return abortedResult(language);
        const eventId = String(call.arguments.event_id ?? '').trim();
        const titleQuery = String(call.arguments.title_query ?? '').trim().toLowerCase();
        let event: any = null;
        if (eventId) {
          event = (ctx.events || []).find((e: any) => e.id === eventId);
        } else if (titleQuery) {
          const exact = (ctx.events || []).filter((e: any) => (e.title || '').toLowerCase() === titleQuery);
          event = exact[0] || (ctx.events || []).find((e: any) => (e.title || '').toLowerCase().includes(titleQuery));
        }
        if (!event?.id) {
          return { success: false, message: language === 'zh' ? '未找到目标事件，请先提供准确的事件标题或 id' : 'Target event not found; provide an exact event title or id first' };
        }
        // C1 human gate — the model's confirm:true is ignored by design.
        if (!ctx.userConfirmed) {
          return pendingUserConfirmation('delete_event', event.title || event.id, { ...call.arguments }, language);
        }
        await eventsApi.delete(event.id);
        return {
          success: true,
          mutated: 'events',
          message: language === 'zh' ? `已删除事件「${event.title}」` : `Deleted event "${event.title}"`,
          data: { id: event.id },
        };
      }

      default:
        return { success: false, message: `Unknown tool: ${call.name}` };
    }
  } catch (err: any) {
    return failure(err, `Tool ${call.name} failed`);
  }
}
