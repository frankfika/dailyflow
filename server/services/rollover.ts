import { readDailyNote, writeDailyNote } from './fileSystem.js';
import { parseMarkdown, generateMarkdown } from './parser.js';
import type { Task, Config, RolloverPreview } from '../types/task.js';

/**
 * 获取前一天的日期
 */
function getPreviousDate(date: string): string {
  const d = new Date(date);
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

/**
 * 预览任务迁移
 */
export async function previewRollover(
  toDate: string,
  config: Config
): Promise<RolloverPreview | null> {
  const fromDate = getPreviousDate(toDate);
  const fromNote = await readDailyNote(fromDate, config);

  if (!fromNote) {
    return null;
  }

  // 过滤未完成任务（排除 no-rollover 标签）
  const tasksToMigrate = fromNote.tasks.filter(task => {
    if (task.status === 'done') return false;
    if (task.tags?.some(tag => config.rolloverSkipTags.includes(tag))) return false;
    return true;
  });

  // 生成目标内容
  const migratedTasks = tasksToMigrate.map(task => ({
    ...task,
    source_date: fromDate
  }));

  const targetContent = generateMarkdown(migratedTasks, toDate);

  return {
    fromDate,
    toDate,
    tasksToMigrate,
    targetContent
  };
}

/**
 * 执行任务迁移
 */
export async function applyRollover(
  toDate: string,
  config: Config
): Promise<{ success: boolean; migratedCount: number }> {
  const preview = await previewRollover(toDate, config);

  if (!preview || preview.tasksToMigrate.length === 0) {
    return { success: true, migratedCount: 0 };
  }

  // 读取目标日期的文件（如果存在）
  const toNote = await readDailyNote(toDate, config);

  // 合并任务
  const migratedTasks = preview.tasksToMigrate.map(task => ({
    ...task,
    source_date: preview.fromDate
  }));

  const allTasks = toNote ? [...migratedTasks, ...toNote.tasks] : migratedTasks;
  const newContent = generateMarkdown(allTasks, toDate);

  // 写入文件
  await writeDailyNote(toDate, newContent, config);

  return {
    success: true,
    migratedCount: preview.tasksToMigrate.length
  };
}
