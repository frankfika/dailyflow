import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { readDailyNote, writeDailyNote } from './fileSystem.js';
import { appendTaskToMarkdown } from './parser.js';
import { loadConfig } from './config.js';
import type { Config } from '../types/task.js';

export interface RecurringTask {
  id: string;
  title: string;
  description?: string;
  tags?: string[];
  priority?: 'high' | 'medium' | 'low';
  project?: string;
  recurrence: RecurrenceRule;
  createdAt: string;
}

export type RecurrenceRule =
  | { type: 'daily' }
  | { type: 'weekly'; weekdays: number[] } // 0=Sun, 1=Mon, ..., 6=Sat
  | { type: 'monthly'; dayOfMonth: number };

const RECURRING_FILE = path.join(os.homedir(), '.dailyflow', 'recurring_tasks.json');

export async function loadRecurringTasks(): Promise<RecurringTask[]> {
  try {
    const content = await fs.readFile(RECURRING_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return [];
  }
}

export async function saveRecurringTasks(tasks: RecurringTask[]): Promise<void> {
  const dir = path.dirname(RECURRING_FILE);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(RECURRING_FILE, JSON.stringify(tasks, null, 2), 'utf-8');
}

export function shouldFireOnDate(rule: RecurrenceRule, dateStr: string): boolean {
  const date = new Date(`${dateStr}T00:00:00Z`);
  switch (rule.type) {
    case 'daily':
      return true;
    case 'weekly':
      return rule.weekdays.includes(date.getUTCDay());
    case 'monthly':
      return date.getUTCDate() === rule.dayOfMonth;
  }
}

export async function instantiateRecurringTasks(date: string, suppliedConfig?: Config): Promise<{ created: number }> {
  const config = suppliedConfig ?? await loadConfig();
  const recurringTasks = await loadRecurringTasks();
  const tasksToFire = recurringTasks.filter(rt => shouldFireOnDate(rt.recurrence, date));
  if (tasksToFire.length === 0) return { created: 0 };

  const note = await readDailyNote(date, config);
  const existingTasks = note?.tasks ?? [];
  let content = note?.content ?? '';
  let created = 0;
  for (const rt of tasksToFire) {
    if (existingTasks.some(t => t.title === rt.title && t.tags?.includes('recurring'))) continue;
    const tags = [...(rt.tags || [])];
    if (!tags.includes('recurring')) tags.push('recurring');
    if (!tags.some(t => ['work', 'life'].includes(t))) tags.push('work');
    content = appendTaskToMarkdown(content, {
      id: `t_${Date.now()}_${created}`,
      title: rt.title,
      description: rt.description,
      status: 'todo',
      tags,
      priority: rt.priority,
      project: rt.project,
      source_date: date,
    }, date);
    created++;
  }
  if (created > 0) await writeDailyNote(date, content, config);
  return { created };
}
