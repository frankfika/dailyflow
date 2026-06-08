import { readDailyNote, writeDailyNote, listDailyNotes } from './fileSystem.js';
import { generateMarkdown, appendTaskToMarkdown, updateTaskInMarkdown } from './parser.js';
import { withDateLock } from './lock.js';
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

    // 过滤未完成任务（排除已完成、已迁移、no-rollover 标签）
    const tasksToMigrate = fromNote.tasks.filter(task => {
      if (task.status === 'done') return false;
      if (task.status === 'migrated') return false;
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
          source_date: task.source_date || fromDate,
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
 *
 * 关键防重复策略（解决历史 bug：2026-06-08 出现 16 批重复任务）：
 *  1. 整个流程用 withDateLock(toDate) 包裹，并发调用序列化
 *  2. **保留原任务 ID**（不重新生成），让跨日期任务有稳定身份
 *  3. **按 (id) 去重**：目标文件中已有同 ID 任务则跳过
 *  4. **按 (source_date + 标题) 二次去重**：防御 ID 漂移（早期版本可能用不同 ID 写入了同一任务）
 */
export async function applyRollover(
  toDate: string,
  config: Config
): Promise<{ success: boolean; migratedCount: number }> {
  return withDateLock(`rollover:${toDate}`, async () => {
    const allDates = await listDailyNotes(config);
    const previousDates = allDates.filter(date => date < toDate).sort();

    if (previousDates.length === 0) {
      return { success: true, migratedCount: 0 };
    }

    // 读取目标日期的文件（如果存在）
    const toNote = await readDailyNote(toDate, config);
    let newContent = toNote?.content || '';

    // 在目标文件中已存在的任务 ID 和 (source_date+title) 集合，用于去重
    const existingIds = new Set<string>();
    const existingKeys = new Set<string>(); // "source_date|title" 形式
    for (const t of toNote?.tasks || []) {
      if (t.id) existingIds.add(t.id);
      if (t.source_date) existingKeys.add(`${t.source_date}|${t.title.trim()}`);
    }

    let totalMigrated = 0;

    for (const fromDate of previousDates) {
      const fromNote = await readDailyNote(fromDate, config);
      if (!fromNote) continue;

      // 过滤未完成任务（排除已完成、已迁移、no-rollover 标签）
      const tasksToMigrate = fromNote.tasks.filter(task => {
        if (task.status === 'done') return false;
        if (task.status === 'migrated') return false;
        if (task.tags?.some(tag => config.rolloverSkipTags.includes(tag))) return false;
        return true;
      });

      if (tasksToMigrate.length === 0) continue;

      // 构建迁移任务：
      // - **保留原 ID**（关键）：让任务跨日期可追踪
      // - deadline 已过的添加 delayed 标签
      // - 跳过目标文件里已存在的任务（ID 去重 + source_date+title 二次去重）
      const migratedTasks: Task[] = [];
      for (const task of tasksToMigrate) {
        const needsDelayed = !task.deadline || task.deadline < toDate;
        const tags = needsDelayed
          ? [...(task.tags || []).filter(t => t !== 'delayed'), 'delayed']
          : (task.tags || []);
        const migratedId = task.id;
        const sourceDate = task.source_date || fromDate;
        const key = `${sourceDate}|${task.title.trim()}`;

        if (existingIds.has(migratedId) || existingKeys.has(key)) {
          // 已存在，不重复追加
          continue;
        }
        migratedTasks.push({
          ...task,
          id: migratedId,
          source_date: sourceDate,
          tags
        });
        existingIds.add(migratedId);
        existingKeys.add(key);
      }

      if (migratedTasks.length === 0) continue;

      // 追加到目标内容
      if (!newContent.trim()) {
        newContent = generateMarkdown(migratedTasks, toDate);
      } else {
        for (const task of migratedTasks) {
          newContent = appendTaskToMarkdown(newContent, task, toDate);
        }
      }

      // 在源文件中将已迁移的任务标记为 migrated（[>]），并记录迁移目标日期
      let fromContent = fromNote.content;
      // 按行号从大到小排序，确保修改不会影响其他任务的行号
      const sortedTasks = [...tasksToMigrate].sort((a, b) => (b.line ?? 0) - (a.line ?? 0));
      for (const task of sortedTasks) {
        if (task.line !== undefined) {
          // 先标记为 migrated
          fromContent = updateTaskInMarkdown(fromContent, task.line, 'migrated');
          // 再在行末追加迁移目标日期
          const lines = fromContent.split('\n');
          if (!lines[task.line].includes('↗ migrated:')) {
            lines[task.line] = lines[task.line].trimEnd() + ` ↗ migrated:${toDate}`;
          }
          fromContent = lines.join('\n');
        }
      }
      await writeDailyNote(fromDate, fromContent, config);

      totalMigrated += migratedTasks.length;
    }

    // 只有在有任务迁移时才写入目标文件
    if (totalMigrated > 0) {
      await writeDailyNote(toDate, newContent, config);
    }

    return {
      success: true,
      migratedCount: totalMigrated
    };
  });
}
