import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { loadConfig } from './config.js';
import type { ThinkingWorkspace, WorkspaceTimelineEntry } from '../types/task.js';

export interface WorkspaceFilters {
  status?: ThinkingWorkspace['status'];
  projectId?: string;
  tag?: string;
  query?: string;
}

function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^\w一-龥-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
  return slug || `workspace-${Date.now()}`;
}

async function getWorkspacesDir(): Promise<string> {
  const config = await loadConfig();
  const dir = path.join(config.workspaceRoot, 'Workspaces');
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function scanMarkdownFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        out.push(...await scanMarkdownFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        out.push(fullPath);
      }
    }
  } catch {
    // Empty workspace directory is fine.
  }
  return out;
}

function parseScalar(value: string): any {
  const trimmed = value.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map(v => v.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  }
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed.slice(1, -1);
  return trimmed;
}

function parseFrontmatter(content: string): { meta: Record<string, any>; body: string } {
  const lines = content.split('\n');
  if (lines[0]?.trim() !== '---') return { meta: {}, body: content };
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      end = i;
      break;
    }
  }
  if (end === -1) return { meta: {}, body: content };

  const meta: Record<string, any> = {};
  for (let i = 1; i < end; i++) {
    const line = lines[i];
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1);
    meta[key] = parseScalar(value);
  }
  return { meta, body: lines.slice(end + 1).join('\n').trim() };
}

function extractSection(body: string, heading: string): string {
  const lines = body.split('\n');
  const start = lines.findIndex(line => line.trim().toLowerCase() === `## ${heading}`.toLowerCase());
  if (start === -1) return '';
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).join('\n').trim();
}

function parseTimeline(raw: string): WorkspaceTimelineEntry[] {
  if (!raw.trim()) return [];
  const lines = raw.split('\n');
  const entries: WorkspaceTimelineEntry[] = [];
  let current: WorkspaceTimelineEntry | null = null;
  for (const line of lines) {
    const heading = line.match(/^###\s+(\d{4}-\d{2}-\d{2})(?:\s+\[(\w+)\])?/);
    if (heading) {
      if (current) entries.push(current);
      current = {
        id: `tl_${heading[1]}_${entries.length}`,
        date: heading[1],
        type: (heading[2] as WorkspaceTimelineEntry['type']) || 'log',
        body: '',
      };
      continue;
    }
    if (current) {
      current.body += `${line}\n`;
    }
  }
  if (current) entries.push(current);
  return entries.map(entry => ({ ...entry, body: entry.body.trim().replace(/^-\s*/, '') }));
}

function generateTimeline(entries: WorkspaceTimelineEntry[]): string {
  if (!entries.length) return '';
  return entries.map(entry => {
    const type = entry.type && entry.type !== 'log' ? ` [${entry.type}]` : '';
    return `### ${entry.date}${type}\n\n- ${entry.body.trim()}`;
  }).join('\n\n');
}

function parseWorkspaceFile(content: string, filePath: string): ThinkingWorkspace {
  const { meta, body } = parseFrontmatter(content);
  const fileName = path.basename(filePath, '.md');
  const title = body.split('\n').find(line => line.startsWith('# '))?.replace(/^#\s+/, '').trim() || meta.title || fileName;
  const taskIds = Array.isArray(meta.taskIds) ? meta.taskIds : Array.isArray(meta.linkedTasks) ? meta.linkedTasks : [];
  const linkedNoteIds = Array.isArray(meta.linkedNoteIds) ? meta.linkedNoteIds : Array.isArray(meta.linkedNotes) ? meta.linkedNotes : [];

  return {
    id: meta.id || fileName,
    title,
    kind: 'workspace',
    type: meta.type || 'general',
    status: meta.status || 'active',
    projectId: meta.projectId || meta.project,
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    intent: extractSection(body, 'Intent'),
    scratchpad: extractSection(body, 'Scratchpad'),
    brief: extractSection(body, 'Brief'),
    journey: extractSection(body, 'Journey') || extractSection(body, 'Plan'),
    tasksMarkdown: extractSection(body, 'Tasks'),
    mindmapMarkdown: extractSection(body, 'Mind Map'),
    timeline: parseTimeline(extractSection(body, 'Timeline')),
    taskIds,
    linkedNoteIds,
    createdAt: meta.createdAt || meta.created || new Date().toISOString(),
    updatedAt: meta.updatedAt || meta.updated || new Date().toISOString(),
    filePath,
  };
}

function formatArray(values?: string[]): string {
  if (!values || values.length === 0) return '[]';
  return `[${values.map(v => String(v).replace(/,/g, '')).join(', ')}]`;
}

function generateWorkspaceFile(workspace: ThinkingWorkspace): string {
  const lines: string[] = [
    '---',
    `id: ${workspace.id}`,
    'kind: workspace',
    `type: ${workspace.type || 'general'}`,
    `status: ${workspace.status}`,
  ];
  if (workspace.projectId) lines.push(`projectId: ${workspace.projectId}`);
  if (workspace.tags?.length) lines.push(`tags: ${formatArray(workspace.tags)}`);
  if (workspace.taskIds?.length) lines.push(`taskIds: ${formatArray(workspace.taskIds)}`);
  if (workspace.linkedNoteIds?.length) lines.push(`linkedNoteIds: ${formatArray(workspace.linkedNoteIds)}`);
  lines.push(`createdAt: ${workspace.createdAt}`);
  lines.push(`updatedAt: ${workspace.updatedAt}`);
  lines.push('---');
  lines.push('');
  lines.push(`# ${workspace.title}`);
  lines.push('');
  lines.push('## Intent');
  lines.push('');
  lines.push(workspace.intent || '');
  lines.push('');
  lines.push('## Scratchpad');
  lines.push('');
  lines.push(workspace.scratchpad || '');
  lines.push('');
  lines.push('## Brief');
  lines.push('');
  lines.push(workspace.brief || '');
  lines.push('');
  lines.push('## Journey');
  lines.push('');
  lines.push(workspace.journey || '');
  lines.push('');
  lines.push('## Tasks');
  lines.push('');
  lines.push(workspace.tasksMarkdown || '');
  lines.push('');
  lines.push('## Mind Map');
  lines.push('');
  lines.push(workspace.mindmapMarkdown || '');
  lines.push('');
  lines.push('## Timeline');
  lines.push('');
  lines.push(generateTimeline(workspace.timeline || []));
  lines.push('');
  return lines.join('\n');
}

export async function getAllThinkingWorkspaces(filters?: WorkspaceFilters): Promise<ThinkingWorkspace[]> {
  const dir = await getWorkspacesDir();
  const files = await scanMarkdownFiles(dir);
  let workspaces: ThinkingWorkspace[] = [];
  for (const filePath of files) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      workspaces.push(parseWorkspaceFile(content, filePath));
    } catch (err) {
      console.error(`Skipping unreadable workspace file ${filePath}:`, err);
    }
  }
  if (filters) {
    if (filters.status) workspaces = workspaces.filter(w => w.status === filters.status);
    if (filters.projectId) workspaces = workspaces.filter(w => w.projectId === filters.projectId);
    if (filters.tag) workspaces = workspaces.filter(w => (w.tags || []).includes(filters.tag!));
    if (filters.query) {
      const q = filters.query.toLowerCase();
      workspaces = workspaces.filter(w => [w.title, w.intent, w.scratchpad, w.brief, w.journey].some(v => (v || '').toLowerCase().includes(q)));
    }
  }
  return workspaces.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getThinkingWorkspaceById(id: string): Promise<ThinkingWorkspace | null> {
  const all = await getAllThinkingWorkspaces();
  return all.find(w => w.id === id) || null;
}

export async function createThinkingWorkspace(data: Partial<ThinkingWorkspace> & { title: string; intent?: string }): Promise<ThinkingWorkspace> {
  // Ignore any client-supplied ID to prevent ID takeover / path traversal.
  const title = data.title.trim();
  if (!title) throw new Error('Title is required');

  const dir = await getWorkspacesDir();
  const now = new Date().toISOString();
  const id = `tw_${now.slice(0, 10).replace(/-/g, '')}_${slugify(title)}_${crypto.randomBytes(3).toString('hex')}`;
  const [year, month] = now.slice(0, 10).split('-');
  const targetDir = path.join(dir, year, month);
  await fs.mkdir(targetDir, { recursive: true });

  const workspace: ThinkingWorkspace = {
    id,
    title: data.title,
    kind: 'workspace',
    type: data.type || 'general',
    status: data.status || 'active',
    projectId: data.projectId,
    tags: data.tags || [],
    intent: data.intent || '',
    scratchpad: data.scratchpad || '',
    brief: data.brief || '',
    journey: data.journey || '',
    tasksMarkdown: data.tasksMarkdown || '',
    mindmapMarkdown: data.mindmapMarkdown || '',
    timeline: data.timeline || [{ id: `tl_${Date.now()}`, date: now.slice(0, 10), type: 'log', body: 'Workspace created.' }],
    taskIds: data.taskIds || [],
    linkedNoteIds: data.linkedNoteIds || [],
    createdAt: now,
    updatedAt: now,
  };
  const filePath = path.join(targetDir, `${id}.md`);
  await fs.writeFile(filePath, generateWorkspaceFile(workspace), 'utf-8');
  workspace.filePath = filePath;
  return workspace;
}

export async function updateThinkingWorkspace(id: string, updates: Partial<Omit<ThinkingWorkspace, 'id' | 'createdAt' | 'filePath'>>): Promise<ThinkingWorkspace | null> {
  const existing = await getThinkingWorkspaceById(id);
  if (!existing || !existing.filePath) return null;
  const updated: ThinkingWorkspace = {
    ...existing,
    ...updates,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
    filePath: existing.filePath,
    kind: 'workspace',
  };
  await fs.writeFile(existing.filePath, generateWorkspaceFile(updated), 'utf-8');
  return updated;
}

export async function deleteThinkingWorkspace(id: string): Promise<boolean> {
  const existing = await getThinkingWorkspaceById(id);
  if (!existing?.filePath) return false;
  await fs.unlink(existing.filePath);
  return true;
}
