import fs from 'fs/promises';
import path from 'path';
import type { Dirent } from 'node:fs';
import { parseMarkdown } from './parser.js';
import type { DailyNote, Config } from '../types/task.js';

/**
 * 获取日记文件的完整路径
 */
export function getDailyNotePath(date: string, config: Config): string {
  const [year, month, day] = date.split('-');
  const filePath = config.dailyPathTemplate
    .replace('{year}', year)
    .replace('{month}', month)
    .replace('{date}', date);

  return path.join(config.workspaceRoot, filePath);
}

/**
 * 验证路径安全性（防止路径遍历攻击）
 */
export function validatePath(filePath: string, workspaceRoot: string): boolean {
  const resolvedPath = path.resolve(filePath);
  const resolvedRoot = path.resolve(workspaceRoot);
  return resolvedPath.startsWith(resolvedRoot);
}

/**
 * 读取指定日期的日记文件
 */
export async function readDailyNote(date: string, config: Config): Promise<DailyNote | null> {
  const filePath = getDailyNotePath(date, config);

  if (!validatePath(filePath, config.workspaceRoot)) {
    throw new Error('Invalid file path');
  }

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const stats = await fs.stat(filePath);
    let tasks = parseMarkdown(content);

    // Deduplicate: remove tasks whose raw markdown line is identical
    const lines = content.split('\n');
    const seen = new Set<string>();
    const duplicateLines: number[] = [];
    const uniqueTasks: typeof tasks = [];
    for (const task of tasks) {
      if (task.line === undefined) {
        uniqueTasks.push(task);
        continue;
      }
      const rawLine = lines[task.line];
      if (seen.has(rawLine)) {
        duplicateLines.push(task.line);
      } else {
        seen.add(rawLine);
        uniqueTasks.push(task);
      }
    }

    // If duplicates found, remove them from the file
    if (duplicateLines.length > 0) {
      const linesToRemove = new Set(duplicateLines);
      const cleanedLines = lines.filter((_, idx) => !linesToRemove.has(idx));
      const cleanedContent = cleanedLines.join('\n');
      await writeDailyNote(date, cleanedContent, config);
      tasks = uniqueTasks;
      return {
        date,
        content: cleanedContent,
        tasks,
        lastModified: stats.mtime
      };
    }

    return {
      date,
      content,
      tasks,
      lastModified: stats.mtime
    };
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * 写入日记文件（原子写入）
 */
export async function writeDailyNote(date: string, content: string, config: Config): Promise<void> {
  const filePath = getDailyNotePath(date, config);

  if (!validatePath(filePath, config.workspaceRoot)) {
    throw new Error('Invalid file path');
  }

  // 确保目录存在
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  // 原子写入：先写临时文件，再重命名
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, content, 'utf-8');
  await fs.rename(tempPath, filePath);
}

/**
 * 列出所有日记文件
 */
export async function listDailyNotes(config: Config): Promise<string[]> {
  // Take the directory part before any template variable
  const parts = config.dailyPathTemplate.split('/');
  const baseDir = parts.slice(0, -1).join('/');
  // Stop at first template variable to get the actual base directory
  const baseDirNoTemplates = baseDir.split('/').filter(p => !p.includes('{')).join('/');
  const fullPath = path.join(config.workspaceRoot, baseDirNoTemplates || '.');

  try {
    const results: string[] = [];
    const walk = async (dir: string) => {
      let entries: Dirent[];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const entryPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(entryPath);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          const basename = path.basename(entry.name, '.md');
          if (/^\d{4}-\d{2}-\d{2}$/.test(basename)) {
            results.push(basename);
          }
        }
      }
    };
    await walk(fullPath);
    return results.sort().reverse();
  } catch (error: any) {
    return [];
  }
}
