import type { Task } from '../types/task.js';
import {
  spaceIdToMarker,
  markerToSpaceId,
  extractTaskId,
  markerToMindmapId,
  markerToNodeId,
  mindmapIdToMarker,
  nodeIdToMarker,
} from './taskMetadata.js';

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
  const seenIds = new Set<string>();
  let currentCategory: string | null = null;

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

    // 解析任务行：- [ ] 或 - [x] 或 - [>]（migrated）
    const taskMatch = line.match(/^\s*[-*]\s+\[([xX >])\]\s+(.*)$/);
    if (taskMatch) {
      const taskLineIndex = i;
      const checkboxChar = taskMatch[1].toLowerCase();
      const isDone = checkboxChar === 'x';
      const isMigrated = checkboxChar === '>';
      let content = taskMatch[2];

      // 提取稳定 ID 标记 (^id-...)
      const idMatch = content.match(/\^id-([a-zA-Z0-9_-]+)/);
      const explicitId = idMatch ? idMatch[1] : undefined;
      content = content.replace(/\^id-[a-zA-Z0-9_-]+/, '').trim();

      // 提取 topic-space 系统标记 (^space:<id>) — Topic Spaces Phase 2
      const spaceIdFromLine = markerToSpaceId(content);
      if (spaceIdFromLine) {
        content = content.replace(/\^space:\S+/, '').trim();
      }

      // 提取 mindmap-origin 系统标记 (^mm:<id> 和 ^node:<id>) — Phase 3
      // 这些标记让 Task→Node 的反向关联在重启 / 跨日期加载后仍然可靠。
      const originMindmapId = markerToMindmapId(content);
      if (originMindmapId) {
        content = content.replace(/\^mm:\S+/, '').trim();
      }
      const originNodeId = markerToNodeId(content);
      if (originNodeId) {
        content = content.replace(/\^node:\S+/, '').trim();
      }

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
      if (currentCategory && currentCategory.toLowerCase() !== 'tasks' && currentCategory.toLowerCase() !== 'inbox') {
        tags.add(currentCategory);
      }
      extractedTags.forEach(t => tags.add(t));

      // 解析描述和评论（支持空行分隔的多段落）
      let descriptionLines = [];
      let comments: { timestamp: string; text: string }[] = [];
      let currentComment: { timestamp: string; text: string } | null = null;
      let descIdx = i + 1;
      const descEnd = findDescriptionEnd(lines, descIdx);
      for (let d = descIdx; d < descEnd; d++) {
        const trimmed = lines[d].trim();
        if (trimmed.startsWith('> ')) {
          const content = trimmed.slice(2);
          const timeMatch = content.match(/^\[([^\]]+)\]\s+(.*)$/);
          if (timeMatch) {
            if (currentComment) comments.push(currentComment);
            currentComment = { timestamp: timeMatch[1], text: timeMatch[2] };
          } else {
            if (currentComment) {
              currentComment.text += '\n' + content;
            } else {
              currentComment = { timestamp: '', text: content };
            }
          }
        } else {
          descriptionLines.push(trimmed);
        }
      }
      if (currentComment) comments.push(currentComment);
      const description = descriptionLines.length > 0 ? descriptionLines.join('\n') : undefined;

        let taskId = explicitId || `t_${hashStr(content)}`;
        // 同名任务去重：加序号后缀
        if (seenIds.has(taskId)) {
          let n = 2;
          while (seenIds.has(`${taskId}_${n}`)) n++;
          taskId = `${taskId}_${n}`;
        }
        seenIds.add(taskId);

      tasks.push({
        id: taskId,
        title: content,
        description,
        comments,
        status: isDone ? 'done' : isMigrated ? 'migrated' : 'todo',
        tags: Array.from(tags),
        project,
        deadline,
        priority,
        source_date,
        spaceId: spaceIdFromLine,
        originMindmapId,
        originNodeId,
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
 *
 * Tag layout (Topic Spaces Phase 3):
 *   - The task's own `task.tags` are written first, with any
 *     `inheritedTags` (from ancestor `kind: 'tag'` nodes in the source
 *     mindmap) merged in and de-duplicated. Inherited tags appear
 *     alongside user tags; the spec example shows them interleaved.
 *   - System metadata (`#project:`, `#deadline:`, `#priority:`,
 *     `↗ migrated:`, `^space:`, `^id-`) comes AFTER all `#user-tag`
 *     content. `^space:` is the topic-space system marker and is written
 *     between the migrated marker and the id marker.
 */
function taskToLine(
  task: Task,
  currentDate?: string,
  options: { inheritedTags?: string[] } = {},
): string {
  let line = `- [${task.status === 'done' ? 'x' : ' '}] ${task.title}`;

  // Merge user tags with inherited tags, dedupe (case-insensitive on the
  // raw token — the markdown representation lowercases, so we compare on
  // the post-normalized form to avoid #Work / #work collisions).
  const userTags = (task.tags || []).filter(t => t && t !== 'tasks');
  const inherited = options.inheritedTags || [];
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const t of [...userTags, ...inherited]) {
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(t);
  }
  if (merged.length > 0) {
    line += ` ${merged.map(t => `#${t.replace(/\s+/g, '-')}`).join(' ')}`;
  }

  if (task.project) line += ` #project:${task.project.replace(/ /g, '_')}`;
  if (task.deadline) line += ` #deadline:${task.deadline}`;
  if (task.priority) line += ` #priority:${task.priority}`;
  if (task.source_date && task.source_date !== currentDate) {
    line += ` ↗ migrated:${task.source_date}`;
  }
  if (task.spaceId) {
    line += ` ${spaceIdToMarker(task.spaceId)}`;
  }
  // Phase 3: write mindmap-origin markers so the task→node reverse
  // link survives a reload. Order: ^mm: then ^node: then ^id-.
  if (task.originMindmapId) {
    line += ` ${mindmapIdToMarker(task.originMindmapId)}`;
  }
  if (task.originNodeId) {
    line += ` ${nodeIdToMarker(task.originNodeId)}`;
  }
  if (task.id) {
    line += ` ^id-${task.id}`;
  }

  if (task.description) {
    const descLines = task.description.split('\n').map(d => `  ${d}`);
    line += '\n' + descLines.join('\n');
  }

  if (task.comments && task.comments.length > 0) {
    const lines = task.comments.flatMap(c => {
      const parts = c.text.split('\n');
      if (c.timestamp) {
        return [
          `  > [${c.timestamp}] ${parts[0]}`,
          ...parts.slice(1).map(p => `  > ${p}`)
        ];
      } else {
        return parts.map(p => `  > ${p}`);
      }
    });
    line += '\n' + lines.join('\n');
  } else if (task.comment) {
    const commentLines = task.comment.split('\n').map(c => `  > ${c}`);
    line += '\n' + commentLines.join('\n');
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
export function updateTaskInMarkdown(md: string, taskLine: number, newStatus: 'todo' | 'done' | 'migrated'): string {
  const lines = md.split('\n');
  if (taskLine >= 0 && taskLine < lines.length) {
    const line = lines[taskLine];
    const taskMatch = line.match(/^\s*[-*]\s+\[([xX> ])\]\s+(.*)$/);
    if (taskMatch) {
      const checkbox = newStatus === 'done' ? 'x' : newStatus === 'migrated' ? '>' : ' ';
      lines[taskLine] = line.replace(/\[([xX> ])\]/, `[${checkbox}]`);
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
  const taskMatch = line.match(/^(\s*)([-*])\s+\[([xX> ])\]\s+(.*)$/);
  if (!taskMatch) return md;

  const indent = taskMatch[1];
  const bullet = taskMatch[2];
  const checkbox = taskMatch[3];
  const originalContent = taskMatch[4];

  // 提取所有元数据片段以保留：tags, project, deadline, priority, migrated,
  // space marker, origin markers, id。Phase 3 新增 ^space: ^mm: ^node:。
  const metaRegex = /(#priority:(?:high|medium|low)|#deadline:\S+|#project:\S+|↗\s*migrated:\S+|\^space:\S+|\^mm:\S+|\^node:\S+|\^id-[a-zA-Z0-9_-]+|#[a-zA-Z0-9_\u4e00-\u9fa5-]+)/g;
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
 * 把单行任务文本拆成结构化字段。供 editTaskFullInMarkdown 在 partial-update
 * 时读取"现有值"使用 —— updates 里 undefined 的字段保留原值，避免静默丢数据。
 *
 * 与 parseMarkdown 的差别：这里只处理一行、不做去重/分类合并，纯粹解析行内 token。
 */
function parseTaskLine(rawLine: string): {
  indent: string;
  bullet: string;
  checkbox: string;
  title: string;
  tags: string[];
  project?: string;
  deadline?: string;
  priority?: 'high' | 'medium' | 'low';
  sourceDateFromMigrated?: string;
  id?: string;
  spaceId?: string;
  originMindmapId?: string;
  originNodeId?: string;
} | null {
  const m = rawLine.match(/^(\s*)([-*])\s+\[([xX> ])\]\s+(.*)$/);
  if (!m) return null;
  let content = m[4];

  // Topic Spaces Phase 2: extract the ^space:<id> system marker before
  // the other token parsers strip it. We use the helper from
  // taskMetadata so the regex stays in one place.
  const spaceId = markerToSpaceId(content);
  if (spaceId) {
    content = content.replace(/\^space:\S+/, '').trim();
  }

  // Phase 3: extract origin markers (^mm: / ^node:) so they survive a
  // title/tags edit and are re-emitted by editTaskFullInMarkdown.
  const originMindmapId = markerToMindmapId(content);
  if (originMindmapId) {
    content = content.replace(/\^mm:\S+/, '').trim();
  }
  const originNodeId = markerToNodeId(content);
  if (originNodeId) {
    content = content.replace(/\^node:\S+/, '').trim();
  }

  const id = extractTaskId(content);
  if (id) {
    content = content.replace(/\^id-\S+/, '').trim();
  }

  const priorityMatch = content.match(/#priority:(high|medium|low)/);
  const priority = priorityMatch ? (priorityMatch[1] as 'high' | 'medium' | 'low') : undefined;
  content = content.replace(/#priority:(high|medium|low)/, '').trim();

  const deadlineMatch = content.match(/#deadline:(\S+)/);
  const deadline = deadlineMatch ? deadlineMatch[1] : undefined;
  content = content.replace(/#deadline:\S+/, '').trim();

  const projectMatch = content.match(/#project:(\S+)/);
  const project = projectMatch ? projectMatch[1].replace(/_/g, ' ') : undefined;
  content = content.replace(/#project:\S+/, '').trim();

  const migratedMatch = content.match(/↗\s*migrated:(\S+)/);
  const sourceDateFromMigrated = migratedMatch ? migratedMatch[1] : undefined;
  content = content.replace(/↗\s*migrated:\S+/, '').trim();

  const tagsMatches = content.match(/#([a-zA-Z0-9_一-龥-]+)/g) || [];
  const tags = tagsMatches.map(t => t.slice(1).toLowerCase());
  content = content.replace(/#([a-zA-Z0-9_一-龥-]+)/g, '').trim();

  return {
    indent: m[1],
    bullet: m[2],
    checkbox: m[3],
    title: content,
    tags,
    project,
    deadline,
    priority,
    sourceDateFromMigrated,
    id,
    spaceId,
    originMindmapId,
    originNodeId,
  };
}

/**
 * 完整编辑任务（包括所有属性：title, description, tags, deadline, priority, project）
 *
 * **Partial-update 语义**：updates 中的字段为 undefined 时保留任务行的现有值，
 * 仅当显式传入新值（包括 [] 或 ''）时才覆盖。这避免了"只想加条 comment 却把
 * tags/deadline/priority 全清空"的静默数据丢失。
 *
 * 清除字段的约定：tags: [] / project: '' / deadline: '' 表示删除。
 */
export function editTaskFullInMarkdown(
  md: string,
  taskLine: number,
  updates: {
    title?: string;
    description?: string;
    comment?: string;
    comments?: { text: string; timestamp: string }[];
    tags?: string[];
    deadline?: string;
    priority?: 'high' | 'medium' | 'low' | '';
    project?: string;
  },
  currentDate?: string
): string {
  const lines = md.split('\n');
  if (taskLine < 0 || taskLine >= lines.length) return md;

  const parsed = parseTaskLine(lines[taskLine]);
  if (!parsed) return md;

  // Merge: updates.X if explicitly provided, else keep existing parsed value.
  // Explicit '' / [] count as "clear this field".
  const title = updates.title !== undefined ? updates.title : parsed.title;
  const tags = updates.tags !== undefined ? updates.tags : parsed.tags;
  const project = updates.project !== undefined ? updates.project : parsed.project;
  const deadline = updates.deadline !== undefined ? updates.deadline : parsed.deadline;
  const priority = updates.priority !== undefined ? updates.priority : parsed.priority;

  // Build the new task line
  let newLine = `${parsed.indent}${parsed.bullet} [${parsed.checkbox}] ${title}`;

  if (tags && tags.length > 0) {
    const filteredTags = tags.filter(t => t && t !== 'tasks');
    if (filteredTags.length > 0) {
      newLine += ` ${filteredTags.map(t => `#${t.replace(/\s+/g, '-')}`).join(' ')}`;
    }
  }

  if (project) {
    newLine += ` #project:${project.replace(/ /g, '_')}`;
  }

  if (deadline) {
    newLine += ` #deadline:${deadline}`;
  }

  if (priority) {
    newLine += ` #priority:${priority}`;
  }

  // 保留 migrated 标记（用户编辑不会改变迁移来源）
  if (parsed.sourceDateFromMigrated && parsed.sourceDateFromMigrated !== currentDate) {
    newLine += ` ↗ migrated:${parsed.sourceDateFromMigrated}`;
  }

  // 保留 topic-space system marker (Topic Spaces Phase 2)
  if (parsed.spaceId) {
    newLine += ` ${spaceIdToMarker(parsed.spaceId)}`;
  }

  // Phase 3: preserve mindmap-origin markers so a title/tags edit does
  // not silently detach the task from its source node. They sit between
  // ^space: and ^id- (see taskMetadata.ts marker order).
  if (parsed.originMindmapId) {
    newLine += ` ${mindmapIdToMarker(parsed.originMindmapId)}`;
  }
  if (parsed.originNodeId) {
    newLine += ` ${nodeIdToMarker(parsed.originNodeId)}`;
  }

  // 保留 ID
  if (parsed.id) {
    newLine += ` ^id-${parsed.id}`;
  }

  lines[taskLine] = newLine;

  // 处理描述和评论
  const descEnd = findDescriptionEnd(lines, taskLine + 1);

  const before = lines.slice(0, taskLine + 1);
  const after = lines.slice(descEnd);

  if (updates.description === undefined && updates.comment === undefined && updates.comments === undefined) {
    // 保留原有描述和评论
    return [...before, ...lines.slice(taskLine + 1, descEnd), ...after].join('\n');
  }

  // Rebuild the indented block: separate existing desc/comment lines
  const existingBlock = lines.slice(taskLine + 1, descEnd);
  const existingDescLines: string[] = [];
  const existingCommentLines: string[] = [];
  for (const bl of existingBlock) {
    if (bl.trim().startsWith('> ')) {
      existingCommentLines.push(bl);
    } else {
      existingDescLines.push(bl);
    }
  }

  const descLines = updates.description !== undefined
    ? (updates.description ? updates.description.split('\n').map(d => `  ${d}`) : [])
    : existingDescLines;

  let commentLines = existingCommentLines;
  if (updates.comments !== undefined) {
    commentLines = updates.comments.flatMap(c => {
      const parts = c.text.split('\n');
      if (c.timestamp) {
        return [
          `  > [${c.timestamp}] ${parts[0]}`,
          ...parts.slice(1).map(p => `  > ${p}`)
        ];
      }
      return parts.map(p => `  > ${p}`);
    });
  } else if (updates.comment !== undefined) {
    commentLines = updates.comment ? updates.comment.split('\n').map(c => `  > ${c}`) : [];
  }

  return [...before, ...descLines, ...commentLines, ...after].join('\n');
}

/**
 * 在文件末尾追加一个新任务行（保留原文档其余内容）
 */
export function appendTaskToMarkdown(
  md: string,
  task: Task,
  currentDate?: string,
  options: { inheritedTags?: string[] } = {},
): string {
  const line = taskToLine(task, currentDate, options);
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
