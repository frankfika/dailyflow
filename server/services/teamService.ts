/**
 * Team read service — leader read-only view of member data.
 *
 * Uses direct file reads + parseMarkdown; never calls readDailyNote because
 * that helper rewrites files when it detects duplicate task lines.
 */
import fs from 'fs/promises';
import path from 'path';
import { parseMarkdown } from './parser.js';
import { parseNoteFile, scanNotesRecursive } from './notes.js';
import { listDailyNotes } from './fileSystem.js';
import { gitLog } from './gitSync.js';
import type { Config, DailyNote, Note, Task } from '../types/task.js';

export interface TaskTimelineEntry {
  date: string;
  author: string;
  message: string;
  change: 'created' | 'updated' | 'completed' | 'reopened' | 'migrated' | 'unknown';
}

function memberConfig(base: Config, memberId: string): Config {
  return {
    ...base,
    workspaceRoot: path.join(base.workspaceRoot, 'members', memberId),
  };
}

function getDailyFilePath(config: Config, date: string): string {
  const template = config.dailyPathTemplate
    .replace('{year}', date.slice(0, 4))
    .replace('{month}', date.slice(5, 7))
    .replace('{date}', date);
  return path.join(config.workspaceRoot, template);
}

export async function readMemberDailyNote(
  baseConfig: Config,
  memberId: string,
  date: string,
): Promise<DailyNote | null> {
  const config = memberConfig(baseConfig, memberId);
  const filePath = getDailyFilePath(config, date);
  const rel = path.relative(path.resolve(config.workspaceRoot), path.resolve(filePath));
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Invalid member daily note path');
  }
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const stats = await fs.stat(filePath);
    const tasks = parseMarkdown(content);
    return { date, content, tasks, lastModified: stats.mtime };
  } catch (error: any) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function listMemberDates(baseConfig: Config, memberId: string): Promise<string[]> {
  const config = memberConfig(baseConfig, memberId);
  return listDailyNotes(config);
}

export async function listMemberTasks(
  baseConfig: Config,
  memberId: string,
  date: string,
): Promise<Task[]> {
  const note = await readMemberDailyNote(baseConfig, memberId, date);
  return note?.tasks ?? [];
}

export async function listMemberNotes(baseConfig: Config, memberId: string): Promise<Note[]> {
  const notesDir = path.join(memberConfig(baseConfig, memberId).workspaceRoot, 'Notes');
  const files = await scanNotesRecursive(notesDir);
  const notes: Note[] = [];
  for (const filePath of files) {
    const content = await fs.readFile(filePath, 'utf-8');
    notes.push(parseNoteFile(content, filePath));
  }
  return notes.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getMemberNote(baseConfig: Config, memberId: string, noteId: string): Promise<Note | null> {
  const notesDir = path.join(memberConfig(baseConfig, memberId).workspaceRoot, 'Notes');
  const filePath = path.join(notesDir, `${noteId}.md`);
  const rel = path.relative(path.resolve(notesDir), path.resolve(filePath));
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return parseNoteFile(content, filePath);
  } catch (error: any) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function buildTaskTimeline(
  baseConfig: Config,
  memberId: string,
  date: string,
  _taskId: string,
): Promise<TaskTimelineEntry[]> {
  const config = memberConfig(baseConfig, memberId);
  const filePath = getDailyFilePath(config, date);
  const relPath = path.relative(path.resolve(config.workspaceRoot), path.resolve(filePath));
  if (!relPath || relPath.startsWith('..') || path.isAbsolute(relPath)) {
    return [];
  }
  const log = await gitLog(config.workspaceRoot, relPath, 50);
  return log.map((entry) => {
    const message = entry.message.toLowerCase();
    let change: TaskTimelineEntry['change'] = 'unknown';
    if (message.includes('migrat') || message.includes('rollover')) change = 'migrated';
    else if (message.includes('complet') || message.includes('done')) change = 'completed';
    else if (message.includes('reopen')) change = 'reopened';
    else if (message.includes('create') || message.includes('add')) change = 'created';
    else change = 'updated';
    return {
      date: entry.date,
      author: entry.author_name,
      message: entry.message,
      change,
    };
  });
}
