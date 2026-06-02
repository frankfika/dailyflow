/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type WorkflowInputSource = 'today-tasks' | 'week-tasks' | 'notes' | 'custom';
export type WorkflowOutputFormat = 'markdown' | 'text' | 'json' | 'tags';

export interface WorkflowStep {
  id: string;
  type: 'input' | 'ai-process' | 'output';
  config: {
    // Input step
    source?: WorkflowInputSource;
    dateRange?: { start: string; end: string };

    // AI process step
    promptId?: string;
    promptText?: string;
    modelId?: string;

    // Output step
    outputFormat?: WorkflowOutputFormat;
    saveToNotes?: boolean;
  };
}

export interface Workflow {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  descriptionEn: string;
  icon: string;
  category: 'report' | 'analysis' | 'automation' | 'custom';
  steps: WorkflowStep[];
  isPreset: boolean;
  createdAt: string;
  updatedAt: string;
}

export const PRESET_WORKFLOWS: Workflow[] = [
  {
    id: 'daily-report',
    name: '日报生成器',
    nameEn: 'Daily Report Generator',
    description: '自动读取今日任务，生成结构化日报',
    descriptionEn: 'Auto-generate daily report from today\'s tasks',
    icon: '📝',
    category: 'report',
    isPreset: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    steps: [
      {
        id: 'step-1',
        type: 'input',
        config: { source: 'today-tasks' },
      },
      {
        id: 'step-2',
        type: 'ai-process',
        config: {
          promptText: '请将以下任务列表整理成日报格式，包含：\n1. 今日完成的任务\n2. 进行中的任务\n3. 遇到的问题\n4. 明日计划\n\n使用 Markdown 格式输出。',
        },
      },
      {
        id: 'step-3',
        type: 'output',
        config: { outputFormat: 'markdown', saveToNotes: true },
      },
    ],
  },
  {
    id: 'weekly-summary',
    name: '周报生成器',
    nameEn: 'Weekly Summary',
    description: '汇总本周任务，生成周报',
    descriptionEn: 'Generate weekly summary from this week\'s tasks',
    icon: '📊',
    category: 'report',
    isPreset: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    steps: [
      {
        id: 'step-1',
        type: 'input',
        config: { source: 'week-tasks' },
      },
      {
        id: 'step-2',
        type: 'ai-process',
        config: {
          promptText: '请将以下本周任务整理成周报，包含：\n1. 本周工作总结（按项目分类）\n2. 完成的关键任务\n3. 数据和成果\n4. 遇到的挑战\n5. 下周计划\n\n使用专业的 Markdown 格式。',
        },
      },
      {
        id: 'step-3',
        type: 'output',
        config: { outputFormat: 'markdown', saveToNotes: true },
      },
    ],
  },
  {
    id: 'smart-tagging',
    name: '智能标签',
    nameEn: 'Smart Tagging',
    description: '分析笔记内容，推荐相关标签',
    descriptionEn: 'Analyze notes and suggest relevant tags',
    icon: '🏷️',
    category: 'analysis',
    isPreset: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    steps: [
      {
        id: 'step-1',
        type: 'input',
        config: { source: 'notes' },
      },
      {
        id: 'step-2',
        type: 'ai-process',
        config: {
          promptText: '分析以下笔记内容，提取 3-5 个最相关的标签关键词。\n要求：\n1. 标签应简洁（1-3个字）\n2. 涵盖主题、领域、类型\n3. 只返回标签列表，用逗号分隔\n\n示例输出：技术,前端,React,性能优化',
        },
      },
      {
        id: 'step-3',
        type: 'output',
        config: { outputFormat: 'tags' },
      },
    ],
  },
  {
    id: 'task-breakdown',
    name: '任务拆解',
    nameEn: 'Task Breakdown',
    description: '将大任务拆解为可执行的子任务',
    descriptionEn: 'Break down large tasks into actionable subtasks',
    icon: '📋',
    category: 'automation',
    isPreset: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    steps: [
      {
        id: 'step-1',
        type: 'input',
        config: { source: 'custom' },
      },
      {
        id: 'step-2',
        type: 'ai-process',
        config: {
          promptText: '请将以下大任务拆解为具体的子任务：\n\n要求：\n1. 每个子任务应该是可独立完成的\n2. 按优先级排序\n3. 估算每个子任务的时间\n4. 使用 Markdown 任务列表格式\n\n示例输出：\n- [ ] 子任务1 (2h)\n- [ ] 子任务2 (1h)',
        },
      },
      {
        id: 'step-3',
        type: 'output',
        config: { outputFormat: 'markdown', saveToNotes: false },
      },
    ],
  },
];

export function getWorkflowById(id: string): Workflow | undefined {
  return PRESET_WORKFLOWS.find(w => w.id === id);
}

export function getWorkflowsByCategory(category: string): Workflow[] {
  if (category === 'all') return PRESET_WORKFLOWS;
  return PRESET_WORKFLOWS.filter(w => w.category === category);
}

