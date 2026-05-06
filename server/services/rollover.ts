import { readDailyNote, writeDailyNote, listDailyNotes } from './fileSystem.js';
import { generateMarkdown, appendTaskToMarkdown, updateTaskInMarkdown } from './parser.js';
import type { Task, Config, RolloverPreview } from '../types/task.js';

/**
 * 预览任务迁移（收集所有早于目标日期的未完成任务）
 */
export async function previewRollover(
  toDate: string,
  config: Config
): Promise<RolloverPreview | null> {
  const allDates = await listDailyNotes(config);
  const previousDates = allDates.filter(date => date < toDate).sort();

  if (previousDates.length === 0) {
    return null;
  }

  let allTasksToMigrate: Task[] = [];
  let earliestFromDate = previousDates[0];

  for (const fromDate of previousDates) {
    const fromNote = await readDailyNote(fromDate, config);
    if (!fromNote) continue;

    // 过滤未完成任务（排除 no-rollover 标签）
    const tasksToMigrate = fromNote.tasks.filter(task => {
      if (task.status === 'done') return false;
      if (task.tags?.some(tag => config.rolloverSkipTags.includes(tag))) return false;
      return true;
    });

    if (tasksToMigrate.length > 0) {
      allTasksToMigrate = [...allTasksToMigrate, ...tasksToMigrate.map(task => {
        const needsDelayed = !task.deadline || task.deadline < toDate;
        const tags = needsDelayed
          ? [...(task.tags || []).filter(t => t !== 'delayed'), 'delayed']
          : (task.tags || []);
        return {
          ...task,
          id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          source_date: fromDate,
          tags
        };
      })];
    }
  }

  if (allTasksToMigrate.length === 0) {
    return null;
  }

  // 生成目标内容预览
  const targetContent = generateMarkdown(allTasksToMigrate, toDate);

  return {
    fromDate: earliestFromDate,
    toDate,
    tasksToMigrate: allTasksToMigrate,
    targetContent
  };
}

/**
 * 执行任务迁移
 * - 将所有之前日期的未完成任务迁移到目标日期
 * - 在源文件中将已迁移的任务标记为 done（防止重复迁移）
 */
export async function applyRollover(
  toDate: string,
  config: Config
): Promise<{ success: boolean; migratedCount: number }> {
  const allDates = await listDailyNotes(config);
  const previousDates = allDates.filter(date => date < toDate).sort();

  if (previousDates.length === 0) {
    return { success: true, migratedCount: 0 };
  }

  // 读取目标日期的文件（如果存在）
  const toNote = await readDailyNote(toDate, config);
  let newContent = toNote?.content || '';

  let totalMigrated = 0;

  for (const fromDate of previousDates) {
    const fromNote = await readDailyNote(fromDate, config);
    if (!fromNote) continue;

    // 过滤未完成任务（排除 no-rollover 标签）
    const tasksToMigrate = fromNote.tasks.filter(task => {
      if (task.status === 'done') return false;
      if (task.tags?.some(tag => config.rolloverSkipTags.includes(tag))) return false;
      return true;
    });

    if (tasksToMigrate.length === 0) continue;

    // 构建迁移任务（没有 deadline 或 deadline 已过期的任务添加 delayed tag）
    const migratedTasks = tasksToMigrate.map(task => {
      const needsDelayed = !task.deadline || task.deadline < toDate;
      const tags = needsDelayed
        ? [...(task.tags || []).filter(t => t !== 'delayed'), 'delayed']
        : (task.tags || []);
      return {
        ...task,
        id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        source_date: fromDate,
        tags
      };
    });

    // 追加到目标内容
    if (!newContent.trim()) {
      newContent = generateMarkdown(migratedTasks, toDate);
    } else {
      for (const task of migratedTasks) {
        newContent = appendTaskToMarkdown(newContent, task, toDate);
      }
    }

    // 在源文件中将已迁移的任务标记为 done
    let fromContent = fromNote.content;
    // 按行号从大到小排序，确保修改不会影响其他任务的行号
    const sortedTasks = [...tasksToMigrate].sort((a, b) => (b.line ?? 0) - (a.line ?? 0));
    for (const task of sortedTasks) {
      if (task.line !== undefined) {
        fromContent = updateTaskInMarkdown(fromContent, task.line, 'done');
      }
    }
    await writeDailyNote(fromDate, fromContent, config);

    totalMigrated += tasksToMigrate.length;
  }

  // 只有在有任务迁移时才写入目标文件
  if (totalMigrated > 0) {
    await writeDailyNote(toDate, newContent, config);
  }

  return {
    success: true,
    migratedCount: totalMigrated
  };
}
