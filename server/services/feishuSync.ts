import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { loadConfig } from './config.js';
import { listDailyNotes, readDailyNote, writeDailyNote } from './fileSystem.js';
import { getAllNotes } from './notes.js';
import {
  appendTaskToMarkdown,
  editTaskFullInMarkdown,
  updateTaskInMarkdown,
} from './parser.js';
import { withDateLock } from './lock.js';
import type { Task } from '../types/task.js';

const execFileAsync = promisify(execFile);
const CLI = process.env.LARK_CLI_PATH || 'lark-cli';
const CLI_ENV = {
  ...process.env,
  LARKSUITE_CLI_NO_UPDATE_NOTIFIER: '1',
  LARKSUITE_CLI_NO_SKILLS_NOTIFIER: '1',
};

type JsonObject = Record<string, any>;

export interface FeishuAuthStatus {
  cliAvailable: boolean;
  appConfigured: boolean;
  appName?: string;
  authorized: boolean;
  userName?: string;
  openId?: string;
  reason?: string;
}

interface TaskLink {
  localId: string;
  localDate: string;
  remoteGuid: string;
  lastLocalHash: string;
  lastRemoteHash: string;
  syncedAt: string;
}

interface EventLink {
  noteId: string;
  remoteEventId: string;
  lastLocalHash: string;
  syncedAt: string;
}

interface SyncState {
  version: 1;
  tasks: Record<string, TaskLink>;
  events: Record<string, EventLink>;
  lastTaskSyncAt?: string;
  lastCalendarSyncAt?: string;
}

export interface FeishuAgendaEvent {
  id: string;
  title: string;
  description?: string;
  start: string;
  end: string;
  allDay: boolean;
  status: 'confirmed' | 'tentative' | 'cancelled';
  location?: string;
  url?: string;
}

export interface FeishuTaskSyncResult {
  ok: boolean;
  pushed: number;
  pulled: number;
  updatedRemote: number;
  updatedLocal: number;
  linked: number;
  skipped: number;
  conflicts: Array<{ localId: string; remoteGuid: string; title: string }>;
  errors: string[];
  syncedAt: string;
}

function hash(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24);
}

function unwrapEnvelope(parsed: JsonObject): JsonObject {
  if (parsed?.ok === false) {
    const err = parsed.error || {};
    const e = new Error(err.message || 'Feishu command failed') as Error & {
      code?: string;
      missingScopes?: string[];
      consoleUrl?: string;
    };
    e.code = err.subtype || err.type;
    e.missingScopes = err.missing_scopes;
    e.consoleUrl = err.console_url;
    throw e;
  }
  return parsed?.data ?? parsed;
}

async function runLark(args: string[], timeout = 60_000): Promise<JsonObject> {
  try {
    const { stdout } = await execFileAsync(CLI, args, {
      env: CLI_ENV,
      timeout,
      maxBuffer: 16 * 1024 * 1024,
    });
    const text = stdout.trim();
    if (!text) return {};
    return unwrapEnvelope(JSON.parse(text));
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      throw Object.assign(new Error('未找到 lark-cli，请先安装或随 DailyFlow 一起打包。'), { code: 'cli_missing' });
    }
    const raw = String(error?.stderr || '').trim();
    if (raw) {
      try {
        unwrapEnvelope(JSON.parse(raw));
      } catch (parsedError) {
        throw parsedError;
      }
    }
    throw error;
  }
}

export async function getFeishuAuthStatus(): Promise<FeishuAuthStatus> {
  try {
    const status = await runLark(['auth', 'status', '--json', '--verify']);
    const bot = status.identities?.bot;
    const user = status.identities?.user;
    return {
      cliAvailable: true,
      appConfigured: Boolean(status.appId && bot?.available && bot?.verified),
      appName: bot?.appName,
      authorized: Boolean(user?.available && user?.verified),
      userName: user?.userName,
      openId: user?.openId,
      reason: user?.message || status.note,
    };
  } catch (error: any) {
    return {
      cliAvailable: error?.code !== 'cli_missing',
      appConfigured: false,
      authorized: false,
      reason: error?.message || String(error),
    };
  }
}

export async function startFeishuAuthorization(): Promise<{
  verificationUrl: string;
  deviceCode: string;
  expiresIn?: number;
}> {
  const data = await runLark([
    'auth', 'login',
    '--domain', 'calendar,task',
    '--no-wait',
    '--json',
  ]);
  const verificationUrl =
    data.verification_url || data.verification_uri_complete || data.verification_uri;
  const deviceCode = data.device_code;
  if (!verificationUrl || !deviceCode) {
    throw new Error('飞书授权命令没有返回授权链接。');
  }
  return { verificationUrl, deviceCode, expiresIn: data.expires_in };
}

export async function finishFeishuAuthorization(deviceCode: string): Promise<FeishuAuthStatus> {
  if (!deviceCode || deviceCode.length > 512) throw new Error('无效的飞书授权码。');
  await runLark(['auth', 'login', '--device-code', deviceCode, '--json'], 120_000);
  return getFeishuAuthStatus();
}

async function getStatePath(): Promise<string> {
  const config = await loadConfig();
  if (!config.workspaceRoot) throw new Error('请先选择 DailyFlow 工作区。');
  return path.join(config.workspaceRoot, '.dailyflow', 'feishu-sync.json');
}

async function loadState(): Promise<SyncState> {
  const file = await getStatePath();
  try {
    const raw = JSON.parse(await fs.readFile(file, 'utf8'));
    return {
      version: 1,
      tasks: raw.tasks || {},
      events: raw.events || {},
      lastTaskSyncAt: raw.lastTaskSyncAt,
      lastCalendarSyncAt: raw.lastCalendarSyncAt,
    };
  } catch (error: any) {
    if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
    return { version: 1, tasks: {}, events: {} };
  }
}

async function saveState(state: SyncState): Promise<void> {
  const file = await getStatePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tmp, file);
}

function localTaskValue(task: Task) {
  return {
    title: task.title,
    description: task.description || '',
    deadline: task.deadline || '',
    completed: task.status === 'done',
  };
}

function remoteTaskValue(task: JsonObject) {
  return {
    title: task.summary || task.title || '',
    description: stripMarker(task.description || ''),
    deadline: remoteDueDate(task.due),
    completed: Boolean(task.completed_at || task.completed),
  };
}

function stripMarker(text: string): string {
  return text.replace(/\n?\[DailyFlow-ID:[^\]]+\]\s*$/m, '').trim();
}

function marker(localId: string): string {
  return `[DailyFlow-ID:${localId}]`;
}

function dateInShanghai(timestampMs: string | number | undefined): string | undefined {
  if (timestampMs === undefined || timestampMs === null || timestampMs === '') return undefined;
  const d = new Date(Number(timestampMs));
  if (Number.isNaN(d.getTime())) return undefined;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (type: string) => parts.find(p => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function todayInShanghai(): string {
  return dateInShanghai(Date.now())!;
}

function allDayDue(date: string): { timestamp: string; is_all_day: true } {
  const timestamp = new Date(`${date}T00:00:00+08:00`).getTime();
  if (Number.isNaN(timestamp)) throw new Error(`无效的截止日期：${date}`);
  return { timestamp: String(timestamp), is_all_day: true };
}

function remoteDueDate(due: any): string | undefined {
  if (!due) return undefined;
  return dateInShanghai(typeof due === 'object' ? due.timestamp : due);
}

function taskGuid(task: JsonObject): string {
  return task.guid || task.task_guid || task.id || '';
}

function taskItems(data: JsonObject): JsonObject[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.tasks)) return data.tasks;
  if (Array.isArray(data.data?.items)) return data.data.items;
  return [];
}

async function getRemoteTasks(): Promise<JsonObject[]> {
  const data = await runLark([
    'task', '+get-my-tasks',
    '--as', 'user',
    '--complete=false',
    '--page-all',
    '--json',
  ], 120_000);
  return taskItems(data);
}

async function loadLocalTasks(): Promise<Array<{ date: string; task: Task }>> {
  const config = await loadConfig();
  const dates = await listDailyNotes(config);
  const out: Array<{ date: string; task: Task }> = [];
  for (const date of dates) {
    const note = await readDailyNote(date, config);
    for (const task of note?.tasks || []) {
      if (task.status !== 'migrated') out.push({ date, task });
    }
  }
  return out;
}

function sameTask(a: ReturnType<typeof localTaskValue>, b: ReturnType<typeof remoteTaskValue>): boolean {
  return a.title.trim().toLocaleLowerCase() === b.title.trim().toLocaleLowerCase()
    && (a.deadline || '') === (b.deadline || '');
}

async function createRemoteTask(task: Task, openId: string): Promise<string> {
  const description = [task.description?.trim(), marker(task.id)].filter(Boolean).join('\n\n');
  const args = [
    'task', '+create',
    '--as', 'user',
    '--summary', task.title,
    '--description', description,
    '--assignee', openId,
    '--idempotency-key', `dailyflow-${task.id}`.slice(0, 64),
    '--json',
  ];
  if (task.deadline) args.push('--due', task.deadline);
  const data = await runLark(args);
  const guid = data.guid || data.task?.guid;
  if (!guid) throw new Error(`飞书没有返回任务 GUID：${task.title}`);
  if (task.status === 'done') {
    await runLark(['task', '+complete', '--as', 'user', '--task-id', guid, '--json']);
  }
  return guid;
}

async function updateRemoteTask(guid: string, task: Task): Promise<void> {
  const description = [task.description?.trim(), marker(task.id)].filter(Boolean).join('\n\n');
  const remoteTask: JsonObject = {
    summary: task.title,
    description,
  };
  if (task.deadline) remoteTask.due = allDayDue(task.deadline);
  await runLark([
    'task', 'tasks', 'patch',
    '--as', 'user',
    '--task-guid', guid,
    '--data', JSON.stringify({
      task: remoteTask,
      // Including due while omitting task.due is the API-defined way to
      // clear a deadline, so removing a date locally converges remotely.
      update_fields: ['summary', 'description', 'due'],
    }),
    '--json',
  ]);
  await runLark([
    'task',
    task.status === 'done' ? '+complete' : '+reopen',
    '--as', 'user',
    '--task-id', guid,
    '--json',
  ]);
}

async function createLocalTask(remote: JsonObject): Promise<{ id: string; date: string; task: Task }> {
  const value = remoteTaskValue(remote);
  const guid = taskGuid(remote);
  const date = value.deadline || todayInShanghai();
  const id = `fs_${guid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 28)}`;
  const task: Task = {
    id,
    title: value.title || '飞书任务',
    description: value.description || undefined,
    status: value.completed ? 'done' : 'todo',
    deadline: value.deadline,
    tags: ['feishu'],
    source_date: date,
  };
  const config = await loadConfig();
  await withDateLock(date, async () => {
    const note = await readDailyNote(date, config);
    const next = appendTaskToMarkdown(note?.content || '', task, date);
    await writeDailyNote(date, next, config);
  });
  return { id, date, task };
}

async function updateLocalTask(date: string, id: string, remote: JsonObject): Promise<Task> {
  const config = await loadConfig();
  const value = remoteTaskValue(remote);
  let result: Task | undefined;
  await withDateLock(date, async () => {
    const note = await readDailyNote(date, config);
    const task = note?.tasks.find(t => t.id === id);
    if (!note || !task || task.line === undefined) throw new Error(`本地任务不存在：${id}`);
    let content = editTaskFullInMarkdown(note.content, task.line, {
      title: value.title,
      description: value.description,
      deadline: value.deadline || '',
    }, date);
    if ((task.status === 'done') !== value.completed) {
      content = updateTaskInMarkdown(content, task.line, value.completed ? 'done' : 'todo');
    }
    await writeDailyNote(date, content, config);
    result = { ...task, ...value, status: value.completed ? 'done' : 'todo' };
  });
  return result!;
}

export async function syncFeishuTasks(): Promise<FeishuTaskSyncResult> {
  const status = await getFeishuAuthStatus();
  if (!status.authorized || !status.openId) throw Object.assign(new Error('请先连接飞书企业账号。'), { status: 401 });

  const result: FeishuTaskSyncResult = {
    ok: true,
    pushed: 0,
    pulled: 0,
    updatedRemote: 0,
    updatedLocal: 0,
    linked: 0,
    skipped: 0,
    conflicts: [],
    errors: [],
    syncedAt: new Date().toISOString(),
  };
  const state = await loadState();
  const [localRows, remoteRows] = await Promise.all([loadLocalTasks(), getRemoteTasks()]);
  const localById = new Map(localRows.map(r => [r.task.id, r]));
  const remoteByGuid = new Map<string, JsonObject>(
    remoteRows
      .map((t): [string, JsonObject] => [taskGuid(t), t])
      .filter(([id]) => Boolean(id))
  );
  const usedRemote = new Set<string>();

  for (const row of localRows) {
    try {
      const link = state.tasks[row.task.id];
      if (link) {
        const remote = remoteByGuid.get(link.remoteGuid);
        if (!remote) {
          result.skipped++;
          continue;
        }
        usedRemote.add(link.remoteGuid);
        const lh = hash(localTaskValue(row.task));
        const rh = hash(remoteTaskValue(remote));
        const localChanged = lh !== link.lastLocalHash;
        const remoteChanged = rh !== link.lastRemoteHash;
        if (localChanged && remoteChanged) {
          result.conflicts.push({ localId: row.task.id, remoteGuid: link.remoteGuid, title: row.task.title });
          continue;
        }
        if (localChanged) {
          await updateRemoteTask(link.remoteGuid, row.task);
          result.updatedRemote++;
          link.lastLocalHash = lh;
          link.lastRemoteHash = lh;
        } else if (remoteChanged) {
          const updated = await updateLocalTask(row.date, row.task.id, remote);
          result.updatedLocal++;
          link.lastLocalHash = hash(localTaskValue(updated));
          link.lastRemoteHash = rh;
        }
        link.syncedAt = result.syncedAt;
        continue;
      }

      const match = remoteRows.find(remote =>
        !usedRemote.has(taskGuid(remote)) && sameTask(localTaskValue(row.task), remoteTaskValue(remote))
      );
      if (match) {
        const guid = taskGuid(match);
        usedRemote.add(guid);
        state.tasks[row.task.id] = {
          localId: row.task.id,
          localDate: row.date,
          remoteGuid: guid,
          lastLocalHash: hash(localTaskValue(row.task)),
          lastRemoteHash: hash(remoteTaskValue(match)),
          syncedAt: result.syncedAt,
        };
        result.linked++;
        continue;
      }

      // Initial sync only pushes active tasks. Historical completed tasks stay local.
      if (row.task.status === 'done') {
        result.skipped++;
        continue;
      }
      const guid = await createRemoteTask(row.task, status.openId);
      usedRemote.add(guid);
      const taskHash = hash(localTaskValue(row.task));
      state.tasks[row.task.id] = {
        localId: row.task.id,
        localDate: row.date,
        remoteGuid: guid,
        lastLocalHash: taskHash,
        lastRemoteHash: taskHash,
        syncedAt: result.syncedAt,
      };
      result.pushed++;
    } catch (error: any) {
      result.errors.push(`${row.task.title}: ${error?.message || String(error)}`);
    }
  }

  for (const remote of remoteRows) {
    const guid = taskGuid(remote);
    if (!guid || usedRemote.has(guid)) continue;
    try {
      const markerMatch = String(remote.description || '').match(/\[DailyFlow-ID:([^\]]+)\]/);
      const marked = markerMatch ? localById.get(markerMatch[1]) : undefined;
      if (marked) {
        state.tasks[marked.task.id] = {
          localId: marked.task.id,
          localDate: marked.date,
          remoteGuid: guid,
          lastLocalHash: hash(localTaskValue(marked.task)),
          lastRemoteHash: hash(remoteTaskValue(remote)),
          syncedAt: result.syncedAt,
        };
        result.linked++;
        continue;
      }
      const created = await createLocalTask(remote);
      state.tasks[created.id] = {
        localId: created.id,
        localDate: created.date,
        remoteGuid: guid,
        lastLocalHash: hash(localTaskValue(created.task)),
        lastRemoteHash: hash(remoteTaskValue(remote)),
        syncedAt: result.syncedAt,
      };
      result.pulled++;
    } catch (error: any) {
      result.errors.push(`${remote.summary || guid}: ${error?.message || String(error)}`);
    }
  }

  result.ok = result.errors.length === 0 && result.conflicts.length === 0;
  state.lastTaskSyncAt = result.syncedAt;
  await saveState(state);
  return result;
}

function normalizeCalendarTime(value: any): { iso: string; allDay: boolean } | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : { iso: d.toISOString(), allDay: false };
  }
  if (value.date) return { iso: `${value.date}T00:00:00+08:00`, allDay: true };
  if (value.timestamp) {
    const n = Number(value.timestamp);
    const ms = n < 10_000_000_000 ? n * 1000 : n;
    return { iso: new Date(ms).toISOString(), allDay: false };
  }
  return null;
}

function agendaItems(data: JsonObject): JsonObject[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.events)) return data.events;
  return [];
}

export async function getFeishuAgenda(start: string, end: string): Promise<FeishuAgendaEvent[]> {
  const data = await runLark([
    'calendar', '+agenda',
    '--as', 'user',
    '--start', start,
    '--end', end,
    '--json',
  ], 120_000);
  return agendaItems(data).flatMap((event): FeishuAgendaEvent[] => {
    const s = normalizeCalendarTime(event.start_time || event.start);
    const e = normalizeCalendarTime(event.end_time || event.end);
    if (!s || !e) return [];
    return [{
      id: event.event_id || event.id,
      title: event.summary || event.title || '未命名日程',
      description: event.description,
      start: s.iso,
      end: e.iso,
      allDay: s.allDay,
      status: event.status === 'cancelled' ? 'cancelled' : event.status === 'tentative' ? 'tentative' : 'confirmed',
      location: event.location?.name || event.location,
      url: event.event_link || event.url || event.app_link,
    }];
  }).filter(e => e.status !== 'cancelled').sort((a, b) => a.start.localeCompare(b.start));
}

export async function pushTimedNotesToFeishu(): Promise<{
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}> {
  const status = await getFeishuAuthStatus();
  if (!status.authorized) throw Object.assign(new Error('请先连接飞书企业账号。'), { status: 401 });
  const state = await loadState();
  const notes = (await getAllNotes()).filter(n => n.time && n.endTime && n.date >= todayInShanghai());
  const result = { created: 0, updated: 0, skipped: 0, errors: [] as string[] };
  for (const note of notes) {
    const withSeconds = (value: string) => value.length === 5 ? `${value}:00` : value;
    const start = `${note.date}T${withSeconds(note.time!)}+08:00`;
    const end = `${note.date}T${withSeconds(note.endTime!)}+08:00`;
    const valueHash = hash({ title: note.title, body: note.body, start, end });
    const link = state.events[note.id];
    if (link?.lastLocalHash === valueHash) {
      result.skipped++;
      continue;
    }
    try {
      if (link) {
        await runLark([
          'calendar', '+update',
          '--as', 'user',
          '--event-id', link.remoteEventId,
          '--summary', note.title,
          '--description', `${note.body}\n\n[DailyFlow-Note:${note.id}]`,
          '--start', start,
          '--end', end,
          '--notify=false',
          '--json',
        ]);
        link.lastLocalHash = valueHash;
        link.syncedAt = new Date().toISOString();
        result.updated++;
      } else {
        const data = await runLark([
          'calendar', '+create',
          '--as', 'user',
          '--summary', note.title,
          '--description', `${note.body}\n\n[DailyFlow-Note:${note.id}]`,
          '--start', start,
          '--end', end,
          '--json',
        ]);
        const eventId = data.event_id || data.event?.event_id || data.id;
        if (!eventId) throw new Error('飞书没有返回日程 ID。');
        state.events[note.id] = {
          noteId: note.id,
          remoteEventId: eventId,
          lastLocalHash: valueHash,
          syncedAt: new Date().toISOString(),
        };
        result.created++;
      }
    } catch (error: any) {
      result.errors.push(`${note.title}: ${error?.message || String(error)}`);
    }
  }
  state.lastCalendarSyncAt = new Date().toISOString();
  await saveState(state);
  return result;
}

export async function getFeishuSyncState(): Promise<Pick<SyncState, 'lastTaskSyncAt' | 'lastCalendarSyncAt'>> {
  const state = await loadState();
  return {
    lastTaskSyncAt: state.lastTaskSyncAt,
    lastCalendarSyncAt: state.lastCalendarSyncAt,
  };
}
