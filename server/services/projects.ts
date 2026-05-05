import fs from 'fs/promises';
import path from 'path';
import { loadConfig } from './config.js';
import type { Project } from '../types/task.js';

/**
 * 获取项目目录路径
 */
async function getProjectsDir(): Promise<string> {
  const config = await loadConfig();
  const projectsDir = path.join(config.workspaceRoot, 'Projects');

  // 确保目录存在
  try {
    await fs.access(projectsDir);
  } catch {
    await fs.mkdir(projectsDir, { recursive: true });
  }

  return projectsDir;
}

/**
 * 解析项目 Markdown 文件
 */
function parseProjectFile(content: string, filePath: string): Project {
  const lines = content.split('\n');
  const project: Partial<Project> = {
    filePath,
  };

  // 解析标题（第一行 # 开头）
  const titleMatch = lines[0]?.match(/^#\s+(.+)$/);
  if (titleMatch) {
    project.name = titleMatch[1].trim();
  }

  // 解析元数据
  let inMetadata = false;
  let description = '';

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line === '---') {
      inMetadata = !inMetadata;
      continue;
    }

    if (inMetadata) {
      const [key, ...valueParts] = line.split(':');
      const value = valueParts.join(':').trim();

      if (key === 'status') {
        project.status = value as 'active' | 'completed' | 'archived';
      } else if (key === 'created') {
        project.createdAt = value;
      } else if (key === 'updated') {
        project.updatedAt = value;
      } else if (key === 'deadline') {
        project.deadline = value;
      } else if (key === 'tags') {
        project.tags = value.split(',').map(t => t.trim());
      }
    } else if (!inMetadata && line && !line.startsWith('#')) {
      description += line + '\n';
    }
  }

  project.description = description.trim();

  // 从文件名提取 ID
  const fileName = path.basename(filePath, '.md');
  project.id = fileName;

  return project as Project;
}

/**
 * 生成项目 Markdown 文件内容
 */
function generateProjectFile(project: Project): string {
  const lines = [
    `# ${project.name}`,
    '',
    '---',
    `status: ${project.status}`,
    `created: ${project.createdAt}`,
    `updated: ${project.updatedAt}`,
  ];

  if (project.deadline) {
    lines.push(`deadline: ${project.deadline}`);
  }

  if (project.tags && project.tags.length > 0) {
    lines.push(`tags: ${project.tags.join(', ')}`);
  }

  lines.push('---');
  lines.push('');

  if (project.description) {
    lines.push(project.description);
  }

  return lines.join('\n');
}

/**
 * 获取所有项目
 */
export async function getAllProjects(): Promise<Project[]> {
  const projectsDir = await getProjectsDir();
  const files = await fs.readdir(projectsDir);
  const projects: Project[] = [];

  for (const file of files) {
    if (file.endsWith('.md')) {
      const filePath = path.join(projectsDir, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const project = parseProjectFile(content, filePath);
      projects.push(project);
    }
  }

  return projects.sort((a, b) =>
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

/**
 * 根据 ID 获取项目
 */
export async function getProjectById(id: string): Promise<Project | null> {
  const projectsDir = await getProjectsDir();
  const filePath = path.join(projectsDir, `${id}.md`);

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return parseProjectFile(content, filePath);
  } catch {
    return null;
  }
}

/**
 * 创建新项目
 */
export async function createProject(
  projectData: Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'filePath'>
): Promise<Project> {
  const projectsDir = await getProjectsDir();
  const id = projectData.name.toLowerCase().replace(/\s+/g, '-');
  const now = new Date().toISOString();

  const project: Project = {
    ...projectData,
    id,
    createdAt: now,
    updatedAt: now,
    status: projectData.status || 'active',
  };

  const filePath = path.join(projectsDir, `${id}.md`);
  const content = generateProjectFile(project);
  await fs.writeFile(filePath, content, 'utf-8');

  project.filePath = filePath;
  return project;
}

/**
 * 更新项目
 */
export async function updateProject(
  id: string,
  updates: Partial<Omit<Project, 'id' | 'createdAt' | 'filePath'>>
): Promise<Project | null> {
  const project = await getProjectById(id);
  if (!project) return null;

  const updatedProject: Project = {
    ...project,
    ...updates,
    id: project.id,
    createdAt: project.createdAt,
    updatedAt: new Date().toISOString(),
  };

  const content = generateProjectFile(updatedProject);
  await fs.writeFile(project.filePath!, content, 'utf-8');

  return updatedProject;
}

/**
 * 删除项目
 */
export async function deleteProject(id: string): Promise<boolean> {
  const project = await getProjectById(id);
  if (!project || !project.filePath) return false;

  try {
    await fs.unlink(project.filePath);
    return true;
  } catch {
    return false;
  }
}
