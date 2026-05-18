import fs from 'fs/promises';
import path from 'path';
import { loadConfig } from './config.js';
import type { PromptTemplate } from '../types/task.js';

const DEFAULT_PROMPTS: Omit<PromptTemplate, 'createdAt'>[] = [
  {
    id: 'weekly-review',
    name: '周报总结',
    prompt: '总结本周完成的任务和关键进展，列出未完成事项和下周重点。',
    scope: 'date-range',
  },
  {
    id: 'project-status',
    name: '项目进度',
    prompt: '梳理项目当前状态、已完成里程碑、风险点和下一步行动计划。',
    scope: 'project',
  },
  {
    id: 'person-followup',
    name: '人员跟进',
    prompt: '整理与此人所有沟通记录中的待办事项、承诺和关键决策。',
    scope: 'person',
  },
  {
    id: 'decision-log',
    name: '决策记录',
    prompt: '提取所有已做的决策及其原因，标注待确认的事项。',
    scope: 'custom',
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

  const body = lines.slice(bodyStart).join('\n').trim();
  const fileName = path.basename(filePath, '.md');

  return {
    id: meta.id || fileName,
    name: meta.name || fileName,
    prompt: body,
    scope: meta.scope || 'custom',
    createdAt: meta.created || new Date().toISOString(),
  };
}

function generatePromptFile(template: PromptTemplate): string {
  const lines = [
    '---',
    `id: ${template.id}`,
    `name: ${template.name}`,
    `scope: ${template.scope}`,
    `created: ${template.createdAt}`,
    '---',
    '',
    template.prompt,
  ];
  return lines.join('\n');
}

async function seedDefaults(promptsDir: string): Promise<void> {
  const files = await fs.readdir(promptsDir);
  if (files.length > 0) return;

  for (const prompt of DEFAULT_PROMPTS) {
    const template: PromptTemplate = {
      ...prompt,
      createdAt: new Date().toISOString(),
    };
    const content = generatePromptFile(template);
    await fs.writeFile(path.join(promptsDir, `${template.id}.md`), content, 'utf-8');
  }
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
    ...data,
    id,
    createdAt: new Date().toISOString(),
  };

  const content = generatePromptFile(template);
  await fs.writeFile(path.join(promptsDir, `${id}.md`), content, 'utf-8');
  return template;
}

export async function updatePrompt(
  id: string,
  updates: Partial<Omit<PromptTemplate, 'id' | 'createdAt'>>
): Promise<PromptTemplate | null> {
  const existing = await getPromptById(id);
  if (!existing) return null;

  const updated: PromptTemplate = { ...existing, ...updates, id: existing.id, createdAt: existing.createdAt };
  const promptsDir = await getPromptsDir();
  const content = generatePromptFile(updated);
  await fs.writeFile(path.join(promptsDir, `${id}.md`), content, 'utf-8');
  return updated;
}

export async function deletePrompt(id: string): Promise<boolean> {
  const promptsDir = await getPromptsDir();
  try {
    await fs.unlink(path.join(promptsDir, `${id}.md`));
    return true;
  } catch {
    return false;
  }
}
