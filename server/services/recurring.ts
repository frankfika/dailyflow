import fs from 'fs/promises';
import path from 'path';
import os from 'os';

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
