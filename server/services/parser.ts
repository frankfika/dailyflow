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

  lines.forEach((line, index) => {
    // 解析分类标题（## Work, ## Personal 等）
    const categoryMatch = line.match(/^##\s+(.+)$/);
    if (categoryMatch) {
      currentCategory = categoryMatch[1].trim().toLowerCase();
      return;
    }

    // 解析任务行：- [ ] 或 - [x]
    const taskMatch = line.match(/^\s*[-*]\s+\[([xX ]+)\]\s+(.*)$/);
    if (taskMatch) {
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

      tasks.push({
        id: explicitId || `t${index}_${hashStr(content)}`,
        title: content,
        status: isDone ? 'done' : 'todo',
        tags: Array.from(tags),
        project,
        deadline,
        priority,
        source_date,
        line: index
      });
    }
  });

  return tasks;
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
  let descEnd = taskLine + 1;
  while (descEnd < lines.length && lines[descEnd].match(/^\s{2,}/) && !lines[descEnd].match(/^\s*[-*]\s+\[/)) {
    descEnd++;
  }

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
  let end = taskLine + 1;
  while (end < lines.length && lines[end].match(/^\s{2,}/) && !lines[end].match(/^\s*[-*]\s+\[/)) {
    end++;
  }
  return [...lines.slice(0, taskLine), ...lines.slice(end)].join('\n');
}
