import type { Task } from '../types/task.js';

function hashStr(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    const chr = s.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * 解析 Markdown 内容为任务列表
 * 复用自 parse_test.cjs 的逻辑
 */
export function parseMarkdown(md: string): Task[] {
  const lines = md.split('\n');
  const tasks: Task[] = [];
  let currentCategory = 'Tasks';

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // 解析分类标题（## Work, ## Personal 等）
    const categoryMatch = line.match(/^##\s+(.+)$/);
    if (categoryMatch) {
      currentCategory = categoryMatch[1].trim().toLowerCase();
      i++;
      continue;
    }

    // 解析任务行：- [ ] 或 - [x]
    const taskMatch = line.match(/^\s*[-*]\s+\[([xX ]+)\]\s+(.*)$/);
    if (taskMatch) {
      const taskLineIndex = i;
      const isDone = taskMatch[1].toLowerCase() === 'x';
      let content = taskMatch[2];

      // 提取稳定 ID 标记 (^id-...)
      const idMatch = content.match(/\^id-([a-zA-Z0-9_-]+)/);
      const explicitId = idMatch ? idMatch[1] : undefined;
      content = content.replace(/\^id-[a-zA-Z0-9_-]+/, '').trim();

      // 提取 priority
      const priorityMatch = content.match(/#priority:(high|medium|low)/);
      const priority = priorityMatch ? (priorityMatch[1] as 'high' | 'medium' | 'low') : undefined;
      content = content.replace(/#priority:(high|medium|low)/, '').trim();

      // 提取 deadline
      const deadlineMatch = content.match(/#deadline:([^\s]+)/);
      const deadline = deadlineMatch ? deadlineMatch[1] : undefined;
      content = content.replace(/#deadline:[^\s]+/, '').trim();

      // 提取 project
      const projectMatch = content.match(/#project:([^\s]+)/);
      const project = projectMatch ? projectMatch[1].replace(/_/g, ' ') : undefined;
      content = content.replace(/#project:[^\s]+/, '').trim();

      // 提取 migrated 标记
      const migratedMatch = content.match(/↗ migrated:([^\s]+)/);
      let source_date = undefined;
      if (migratedMatch) {
        source_date = migratedMatch[1];
        content = content.replace(/↗ migrated:[^\s]+/, '').trim();
      }

      // 提取其他标签
      const tagsMatch = content.match(/#([a-zA-Z0-9_\u4e00-\u9fa5-]+)/g);
      const extractedTags = tagsMatch ? tagsMatch.map(t => t.slice(1).toLowerCase()) : [];
      content = content.replace(/#([a-zA-Z0-9_\u4e00-\u9fa5-]+)/g, '').trim();

      // 合并分类和标签
      const tags = new Set<string>();
      if (currentCategory && currentCategory !== 'tasks' && currentCategory !== 'inbox') {
        tags.add(currentCategory);
      }
      extractedTags.forEach(t => tags.add(t));

      // 解析描述（支持空行分隔的多段落）
      let descriptionLines = [];
      let descIdx = i + 1;
      const descEnd = findDescriptionEnd(lines, descIdx);
      for (let d = descIdx; d < descEnd; d++) {
        descriptionLines.push(lines[d].trim());
      }
      const description = descriptionLines.length > 0 ? descriptionLines.join('\n') : undefined;

      tasks.push({
        id: explicitId || `t${taskLineIndex}_${hashStr(content)}`,
        title: content,
        description,
        status: isDone ? 'done' : 'todo',
        tags: Array.from(tags),
        project,
        deadline,
        priority,
        source_date,
        line: taskLineIndex
      });

      i = descIdx;
    } else {
      i++;
    }
  }

  return tasks;
}

/**
 * 找到任务描述块的结束索引（descEnd 指向第一个不属于 description 的行）
 * 支持多段落描述（缩进行 + 段落间空行）
 * 规则：
 *   - 新任务行 -> 停止
 *   - 缩进行 -> 属于描述
 *   - 空行 -> 向前看：下一个非空行是缩进则属于描述，否则停止
 *   - 非空非缩进 -> 停止
 *   - 文件末尾 -> 停止
 */
function findDescriptionEnd(lines: string[], startIdx: number): number {
  let idx = startIdx;
  while (idx < lines.length) {
    const line = lines[idx];
    if (line.match(/^\s*[-*]\s+\[/)) break;

    const isEmpty = line.trim() === '';
    const isIndented = line.match(/^\s{2,}/);

    if (!isEmpty && !isIndented) break;

    if (isIndented) {
      idx++;
      continue;
    }

    // 空行：向前看判断
    let nextIdx = idx + 1;
    while (nextIdx < lines.length && lines[nextIdx].trim() === '') nextIdx++;

    if (nextIdx >= lines.length) break;
    if (lines[nextIdx].match(/^\s*[-*]\s+\[/)) break;
    if (!lines[nextIdx].match(/^\s{2,}/)) break;

    idx++;
  }
  return idx;
}

/**
 * 将单个任务序列化为一行 Markdown
 */
function taskToLine(task: Task, currentDate?: string): string {
  let line = `- [${task.status === 'done' ? 'x' : ' '}] ${task.title}`;

  if (task.tags && task.tags.length > 0) {
    const filteredTags = task.tags.filter(t => t && t !== 'tasks');
    if (filteredTags.length > 0) {
      line += ` ${filteredTags.map(t => `#${t.replace(/\s+/g, '-')}`).join(' ')}`;
    }
  }

  if (task.project) line += ` #project:${task.project.replace(/ /g, '_')}`;
  if (task.deadline) line += ` #deadline:${task.deadline}`;
  if (task.priority) line += ` #priority:${task.priority}`;
  if (task.source_date && task.source_date !== currentDate) {
    line += ` ↗ migrated:${task.source_date}`;
  }
  if (task.id) {
    line += ` ^id-${task.id}`;
  }

  if (task.description) {
    const descLines = task.description.split('\n').map(d => `  ${d}`);
    line += '\n' + descLines.join('\n');
  }

  return line;
}

/**
 * 将任务列表生成为 Markdown 内容
 */
export function generateMarkdown(tasks: Task[], currentDate?: string): string {
  let md = '## Tasks\n\n';
  tasks.forEach(task => {
    md += taskToLine(task, currentDate) + '\n';
  });
  return md;
}

/**
 * 更新 Markdown 文件中的单个任务（仅切换勾选状态）
 */
export function updateTaskInMarkdown(md: string, taskLine: number, newStatus: 'todo' | 'done'): string {
  const lines = md.split('\n');
  if (taskLine >= 0 && taskLine < lines.length) {
    const line = lines[taskLine];
    const taskMatch = line.match(/^\s*[-*]\s+\[([xX ])\]\s+(.*)$/);
    if (taskMatch) {
      const checkbox = newStatus === 'done' ? 'x' : ' ';
      lines[taskLine] = line.replace(/\[([xX ])\]/, `[${checkbox}]`);
    }
  }
  return lines.join('\n');
}

/**
 * 编辑任务的标题（保留所有元数据）和可选的描述
 */
export function editTaskInMarkdown(
  md: string,
  taskLine: number,
  newTitle: string,
  newDescription?: string
): string {
  const lines = md.split('\n');
  if (taskLine < 0 || taskLine >= lines.length) return md;

  const line = lines[taskLine];
  const taskMatch = line.match(/^(\s*)([-*])\s+\[([xX ])\]\s+(.*)$/);
  if (!taskMatch) return md;

  const indent = taskMatch[1];
  const bullet = taskMatch[2];
  const checkbox = taskMatch[3];
  const originalContent = taskMatch[4];

  // 提取所有元数据片段以保留：tags, project, deadline, priority, migrated, id
  const metaRegex = /(#priority:(?:high|medium|low)|#deadline:\S+|#project:\S+|↗\s*migrated:\S+|\^id-[a-zA-Z0-9_-]+|#[a-zA-Z0-9_\u4e00-\u9fa5-]+)/g;
  const metaParts = originalContent.match(metaRegex) || [];

  const metaSuffix = metaParts.length ? ' ' + metaParts.join(' ') : '';
  lines[taskLine] = `${indent}${bullet} [${checkbox}] ${newTitle}${metaSuffix}`;

  // 处理描述：如果显式提供了 newDescription，则替换原有描述行
  const descEnd = findDescriptionEnd(lines, taskLine + 1);

  const before = lines.slice(0, taskLine + 1);
  const after = lines.slice(descEnd);

  if (newDescription === undefined) {
    // 不动描述
    return [...before, ...lines.slice(taskLine + 1, descEnd), ...after].join('\n');
  }

  const descLines = newDescription
    ? newDescription.split('\n').map(d => `  ${d}`)
    : [];
  return [...before, ...descLines, ...after].join('\n');
}

/**
 * 完整编辑任务（包括所有属性：title, description, tags, deadline, priority, project）
 */
export function editTaskFullInMarkdown(
  md: string,
  taskLine: number,
  updates: {
    title?: string;
    description?: string;
    tags?: string[];
    deadline?: string;
    priority?: 'high' | 'medium' | 'low';
    project?: string;
  },
  currentDate?: string
): string {
  const lines = md.split('\n');
  if (taskLine < 0 || taskLine >= lines.length) return md;

  const line = lines[taskLine];
  const taskMatch = line.match(/^(\s*)([-*])\s+\[([xX ])\]\s+(.*)$/);
  if (!taskMatch) return md;

  const indent = taskMatch[1];
  const bullet = taskMatch[2];
  const checkbox = taskMatch[3];
  const originalContent = taskMatch[4];

  // 提取原有的ID和migrated标记
  const idMatch = originalContent.match(/\^id-([a-zA-Z0-9_-]+)/);
  const taskId = idMatch ? idMatch[1] : undefined;

  const migratedMatch = originalContent.match(/↗\s*migrated:(\S+)/);
  const sourceDateFromMigrated = migratedMatch ? migratedMatch[1] : undefined;

  // 构建新的任务行
  const title = updates.title !== undefined ? updates.title : originalContent.replace(/\s*(#[^\s]+|\^id-[^\s]+|↗\s*migrated:\S+)/g, '').trim();

  let newLine = `${indent}${bullet} [${checkbox}] ${title}`;

  // 添加tags
  if (updates.tags && updates.tags.length > 0) {
    const filteredTags = updates.tags.filter(t => t && t !== 'tasks');
    if (filteredTags.length > 0) {
      newLine += ` ${filteredTags.map(t => `#${t.replace(/\s+/g, '-')}`).join(' ')}`;
    }
  }

  // 添加project
  if (updates.project) {
    newLine += ` #project:${updates.project.replace(/ /g, '_')}`;
  }

  // 添加deadline
  if (updates.deadline) {
    newLine += ` #deadline:${updates.deadline}`;
  }

  // 添加priority
  if (updates.priority) {
    newLine += ` #priority:${updates.priority}`;
  }

  // 保留migrated标记
  if (sourceDateFromMigrated && sourceDateFromMigrated !== currentDate) {
    newLine += ` ↗ migrated:${sourceDateFromMigrated}`;
  }

  // 保留ID
  if (taskId) {
    newLine += ` ^id-${taskId}`;
  }

  lines[taskLine] = newLine;

  // 处理描述
  const descEnd = findDescriptionEnd(lines, taskLine + 1);

  const before = lines.slice(0, taskLine + 1);
  const after = lines.slice(descEnd);

  if (updates.description === undefined) {
    // 保留原有描述
    return [...before, ...lines.slice(taskLine + 1, descEnd), ...after].join('\n');
  }

  const descLines = updates.description
    ? updates.description.split('\n').map(d => `  ${d}`)
    : [];
  return [...before, ...descLines, ...after].join('\n');
}

/**
 * 在文件末尾追加一个新任务行（保留原文档其余内容）
 */
export function appendTaskToMarkdown(md: string, task: Task, currentDate?: string): string {
  const line = taskToLine(task, currentDate);
  if (!md || md.length === 0) {
    return line + '\n';
  }
  return md.replace(/\n*$/, '') + '\n' + line + '\n';
}

/**
 * 从 Markdown 中删除指定行的任务以及它后面缩进的描述行
 */
export function removeTaskFromMarkdown(md: string, taskLine: number): string {
  const lines = md.split('\n');
  if (taskLine < 0 || taskLine >= lines.length) return md;
  const end = findDescriptionEnd(lines, taskLine + 1);
  return [...lines.slice(0, taskLine), ...lines.slice(end)].join('\n');
}
