import fs from 'fs/promises';
import path from 'path';
import { loadConfig } from './config.js';
import type { PromptTemplate } from '../types/task.js';

const DEFAULT_PROMPTS: Omit<PromptTemplate, 'createdAt'>[] = [
  {
    id: 'weekly-review',
    name: '周报总结',
    description: '基于一段时间的任务数据生成周报总结',
    systemPrompt: '总结本周完成的任务和关键进展，列出未完成事项和下周重点。',
    scope: 'date-range',
    icon: 'BarChart',
  },
  {
    id: 'project-status',
    name: '项目进度',
    description: '梳理指定项目的当前状态和待办',
    systemPrompt: '梳理项目当前状态、已完成里程碑、风险点和下一步行动计划。',
    scope: 'project',
    icon: 'Folder',
  },
  {
    id: 'person-followup',
    name: '人员跟进',
    description: '整理与某个人的沟通和待办',
    systemPrompt: '整理与此人所有沟通记录中的待办事项、承诺和关键决策。',
    scope: 'person',
    icon: 'Users',
  },
  {
    id: 'decision-log',
    name: '决策记录',
    description: '提取并记录关键决策',
    systemPrompt: '提取所有已做的决策及其原因，标注待确认的事项。',
    scope: 'custom',
    icon: 'FileText',
  },
  {
    id: 'format-polish',
    name: '润色优化',
    description: '润色和优化笔记表达',
    systemPrompt: '请对以下笔记进行润色和优化。修正语法错误，提升表达清晰度，保持原意不变。返回完整的 Markdown 格式笔记，保留原标题作为一级标题。',
    scope: 'format',
    icon: 'Edit3',
  },
  {
    id: 'format-structure',
    name: '结构化整理',
    description: '把笔记整理成清晰的结构',
    systemPrompt: '请将以下笔记整理成清晰的结构化 Markdown 格式。使用合适的标题层级、列表和段落组织内容，使其更易读。返回完整的 Markdown 格式笔记，保留原标题作为一级标题。',
    scope: 'format',
    icon: 'List',
  },
  {
    id: 'format-todo',
    name: '提取待办',
    description: '从笔记中提取行动项',
    systemPrompt: '请从以下笔记中提取所有待办事项、行动项和承诺，整理成清晰的 Markdown 任务列表格式。保留原始笔记中的上下文信息。返回完整的 Markdown 格式笔记，保留原标题作为一级标题。',
    scope: 'format',
    icon: 'CheckSquare',
  },
  {
    id: 'format-meeting',
    name: '整理会议纪要',
    description: '把会议记录整理成标准纪要',
    systemPrompt: '请将以下会议记录整理为标准会议纪要格式，包括：会议信息、参会人员、会议要点、待办事项（标注负责人和截止日期）、下次会议安排。返回完整的 Markdown 格式笔记，保留原标题作为一级标题。',
    scope: 'format',
    icon: 'Mic',
  },
];

async function getPromptsDir(): Promise<string> {
  const config = await loadConfig();
  const promptsDir = path.join(config.workspaceRoot, 'Notes', '.prompts');
  try {
    await fs.access(promptsDir);
  } catch {
    await fs.mkdir(promptsDir, { recursive: true });
  }
  return promptsDir;
}

function assertSafePromptId(id: string): void {
  if (!id || id === '.' || id === '..' || /[\\/\0]/.test(id)) {
    throw Object.assign(new Error('Invalid prompt id'), { status: 400 });
  }
}

function parseFrontmatterArray(value: string): string[] | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      return JSON.parse(trimmed.replace(/'/g, '"')) as string[];
    } catch {
      // fall through to comma split
    }
  }
  return trimmed
    .split(/,\s*/)
    .map(s => s.trim())
    .filter(Boolean);
}

function parsePromptFile(content: string, filePath: string): PromptTemplate {
  const lines = content.split('\n');
  const meta: Record<string, string> = {};
  let bodyStart = 0;

  if (lines[0]?.trim() === '---') {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '---') {
        bodyStart = i + 1;
        break;
      }
      const colonIdx = lines[i].indexOf(':');
      if (colonIdx !== -1) {
        const key = lines[i].slice(0, colonIdx).trim();
        const value = lines[i].slice(colonIdx + 1).trim();
        meta[key] = value;
      }
    }
  }

  const rawBody = lines.slice(bodyStart).join('\n').trim();
  const fileName = path.basename(filePath, '.md');

  // Backward compatibility: older files use `prompt` as the body field.
  const systemPrompt = meta.systemPrompt || meta.prompt || rawBody;
  const description = meta.description || '';

  return {
    id: meta.id || fileName,
    name: meta.name || fileName,
    prompt: systemPrompt,
    systemPrompt,
    description,
    scope: meta.scope || 'custom',
    icon: meta.icon || undefined,
    version: meta.version || undefined,
    author: meta.author || undefined,
    tags: parseFrontmatterArray(meta.tags),
    createdAt: meta.created || new Date().toISOString(),
    updatedAt: meta.updatedAt || undefined,
  };
}

function generatePromptFile(template: PromptTemplate): string {
  const lines = [
    '---',
    `id: ${template.id}`,
    `name: ${template.name}`,
    `description: ${template.description || ''}`,
    `scope: ${template.scope}`,
  ];
  if (template.icon) lines.push(`icon: ${template.icon}`);
  if (template.version) lines.push(`version: ${template.version}`);
  if (template.author) lines.push(`author: ${template.author}`);
  if (template.tags && template.tags.length > 0) lines.push(`tags: [${template.tags.map(t => `"${t}"`).join(', ')}]`);
  lines.push(`created: ${template.createdAt}`);
  if (template.updatedAt) lines.push(`updatedAt: ${template.updatedAt}`);
  lines.push('---', '', template.systemPrompt || template.prompt || '');
  return lines.join('\n');
}

async function seedDefaults(promptsDir: string): Promise<void> {
  // Check if this is the first time seeding (no .prompts-initialized marker)
  const markerPath = path.join(promptsDir, '.prompts-initialized');
  let isFirstTime = false;

  try {
    await fs.access(markerPath);
  } catch {
    isFirstTime = true;
  }

  // Only seed defaults on first initialization
  if (!isFirstTime) return;

  const files = await fs.readdir(promptsDir);
  const existingIds = new Set(files.filter(f => f.endsWith('.md')).map(f => path.basename(f, '.md')));

  for (const prompt of DEFAULT_PROMPTS) {
    if (existingIds.has(prompt.id)) continue;

    const template: PromptTemplate = {
      ...prompt,
      createdAt: new Date().toISOString(),
    };
    const content = generatePromptFile(template);
    await fs.writeFile(path.join(promptsDir, `${template.id}.md`), content, 'utf-8');
  }

  // Create marker file to indicate initialization is complete
  await fs.writeFile(markerPath, new Date().toISOString(), 'utf-8');
}

export async function getAllPrompts(): Promise<PromptTemplate[]> {
  const promptsDir = await getPromptsDir();
  await seedDefaults(promptsDir);

  const files = await fs.readdir(promptsDir);
  const prompts: PromptTemplate[] = [];

  for (const file of files) {
    if (!file.endsWith('.md')) continue;
    const filePath = path.join(promptsDir, file);
    const content = await fs.readFile(filePath, 'utf-8');
    prompts.push(parsePromptFile(content, filePath));
  }

  return prompts.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getPromptById(id: string): Promise<PromptTemplate | null> {
  assertSafePromptId(id);
  const promptsDir = await getPromptsDir();
  const filePath = path.join(promptsDir, `${id}.md`);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return parsePromptFile(content, filePath);
  } catch {
    return null;
  }
}

export async function createPrompt(
  data: Omit<PromptTemplate, 'id' | 'createdAt'>
): Promise<PromptTemplate> {
  const promptsDir = await getPromptsDir();
  const id = data.name.toLowerCase().replace(/[^\w一-龥]/g, '-').replace(/-+/g, '-').slice(0, 40);

  const template: PromptTemplate = {
    tags: [],
    ...data,
    id,
    description: data.description ?? '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const content = generatePromptFile(template);
  await fs.writeFile(path.join(promptsDir, `${id}.md`), content, 'utf-8');
  return template;
}

export async function updatePrompt(
  id: string,
  updates: Partial<Omit<PromptTemplate, 'id' | 'createdAt'>>
): Promise<PromptTemplate | null> {
  assertSafePromptId(id);
  const existing = await getPromptById(id);
  if (!existing) return null;

  const updated: PromptTemplate = {
    ...existing,
    ...updates,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };
  const promptsDir = await getPromptsDir();
  const content = generatePromptFile(updated);
  await fs.writeFile(path.join(promptsDir, `${id}.md`), content, 'utf-8');
  return updated;
}

export async function deletePrompt(id: string): Promise<boolean> {
  assertSafePromptId(id);
  const promptsDir = await getPromptsDir();
  try {
    await fs.unlink(path.join(promptsDir, `${id}.md`));
    return true;
  } catch {
    return false;
  }
}
