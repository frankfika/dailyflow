import fs from 'fs/promises';
import path from 'path';
import { loadConfig } from './config.js';
import { readDailyNote } from './fileSystem.js';
import type { Config, Note, NoteType } from '../types/task.js';

export interface NoteFilters {
  type?: NoteType;
  context?: 'work' | 'life';
  startDate?: string;
  endDate?: string;
  mention?: string;
  tag?: string;
  project?: string;
}

async function getNotesDir(): Promise<string> {
  const config = await loadConfig();
  const notesDir = path.join(config.workspaceRoot, 'Notes');
  try {
    await fs.access(notesDir);
  } catch {
    await fs.mkdir(notesDir, { recursive: true });
  }
  return notesDir;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w一-龥-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

export function extractMentions(body: string): string[] {
  const matches = body.match(/@([\w一-龥-]+)/g);
  if (!matches) return [];
  return [...new Set(matches.map(m => m.slice(1)))];
}

function parseFrontmatter(content: string): { meta: Record<string, any>; body: string } {
  const lines = content.split('\n');
  if (lines[0]?.trim() !== '---') {
    return { meta: {}, body: content };
  }

  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    return { meta: {}, body: content };
  }

  const meta: Record<string, any> = {};
  for (let i = 1; i < endIndex; i++) {
    const line = lines[i];
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    let value: any = line.slice(colonIdx + 1).trim();

    if (value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map((s: string) => s.trim().replace(/^["']|["']$/g, ''));
    } else if (value === 'true') {
      value = true;
    } else if (value === 'false') {
      value = false;
    } else if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }

    meta[key] = value;
  }

  const body = lines.slice(endIndex + 1).join('\n').trim();
  return { meta, body };
}

function generateFrontmatter(note: Omit<Note, 'body' | 'filePath'>): string {
  const lines = ['---'];
  lines.push(`type: ${note.type}`);
  lines.push(`date: ${note.date}`);
  if (note.time) lines.push(`time: "${note.time}"`);
  if (note.endTime) lines.push(`end_time: "${note.endTime}"`);
  lines.push(`context: ${note.context}`);
  if (note.tags.length > 0) lines.push(`tags: [${note.tags.join(', ')}]`);
  if (note.mentions.length > 0) lines.push(`mentions: [${note.mentions.join(', ')}]`);
  if (note.linkedTaskIds.length > 0) lines.push(`linked_tasks: [${note.linkedTaskIds.join(', ')}]`);
  if (note.linkedProjectIds.length > 0) lines.push(`linked_projects: [${note.linkedProjectIds.join(', ')}]`);
  if (note.participants && note.participants.length > 0) {
    lines.push(`participants: [${note.participants.join(', ')}]`);
  }
  if (note.recordingPath) lines.push(`recording: ${note.recordingPath}`);
  if (note.transcriptPath) lines.push(`transcript: ${note.transcriptPath}`);
  if (note.scope) lines.push(`scope: ${note.scope}`);
  if (note.prompt) lines.push(`prompt: "${note.prompt.replace(/"/g, '\\"')}"`);
  if (note.model) lines.push(`model: ${note.model}`);
  lines.push(`created: ${note.createdAt}`);
  lines.push(`updated: ${note.updatedAt}`);
  lines.push('---');
  return lines.join('\n');
}

function parseNoteFile(content: string, filePath: string): Note {
  const { meta, body } = parseFrontmatter(content);
  const fileName = path.basename(filePath, '.md');

  const bodyMentions = extractMentions(body);
  const frontmatterMentions = Array.isArray(meta.mentions) ? meta.mentions : [];
  const participants = Array.isArray(meta.participants) ? meta.participants : [];
  const allMentions = [...new Set([...frontmatterMentions, ...bodyMentions])];

  return {
    id: fileName,
    title: body.split('\n').find(l => l.startsWith('# '))?.replace(/^#\s+/, '') || fileName,
    body,
    type: (meta.type as NoteType) || 'note',
    date: meta.date || fileName.slice(0, 10),
    time: meta.time,
    endTime: meta.end_time,
    context: meta.context || 'work',
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    mentions: allMentions,
    linkedTaskIds: Array.isArray(meta.linked_tasks) ? meta.linked_tasks : [],
    linkedProjectIds: Array.isArray(meta.linked_projects) ? meta.linked_projects : [],
    participants,
    recordingPath: meta.recording,
    transcriptPath: meta.transcript,
    scope: meta.scope,
    prompt: meta.prompt,
    model: meta.model,
    createdAt: meta.created || new Date().toISOString(),
    updatedAt: meta.updated || new Date().toISOString(),
    filePath,
  };
}

async function scanNotesRecursive(dir: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const sub = await scanNotesRecursive(fullPath);
        results.push(...sub);
      } else if (entry.name.endsWith('.md')) {
        results.push(fullPath);
      }
    }
  } catch {
    // directory doesn't exist yet
  }
  return results;
}

export async function getAllNotes(filters?: NoteFilters): Promise<Note[]> {
  const notesDir = await getNotesDir();
  const files = await scanNotesRecursive(notesDir);
  let notes: Note[] = [];

  for (const filePath of files) {
    const content = await fs.readFile(filePath, 'utf-8');
    const note = parseNoteFile(content, filePath);
    notes.push(note);
  }

  if (filters) {
    if (filters.type) notes = notes.filter(n => n.type === filters.type);
    if (filters.context) notes = notes.filter(n => n.context === filters.context);
    if (filters.startDate) notes = notes.filter(n => n.date >= filters.startDate!);
    if (filters.endDate) notes = notes.filter(n => n.date <= filters.endDate!);
    if (filters.mention) notes = notes.filter(n => n.mentions.includes(filters.mention!));
    if (filters.tag) notes = notes.filter(n => n.tags.includes(filters.tag!));
    if (filters.project) notes = notes.filter(n => n.linkedProjectIds.includes(filters.project!));
  }

  return notes.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return (b.time || '').localeCompare(a.time || '');
  });
}

/**
 * Drop `linkedTaskIds` that don't exist in the referenced date's daily file.
 *
 * Notes store forward references to tasks (see the model comment on the
 * `Note` interface). When a task is deleted, rolled, or never existed, the
 * note's stored ID becomes stale. Rather than mutating the on-disk file
 * (which would race with concurrent edits), we filter the IDs at read time
 * so the UI only ever sees real links.
 *
 * We also count how many IDs were dropped so callers can detect the drift
 * without paying an extra read.
 */
export async function pruneStaleTaskLinks(notes: Note[]): Promise<{ notes: Note[]; prunedCount: number }> {
  if (notes.length === 0) return { notes, prunedCount: 0 };

  const config = await loadConfig();
  // Cache (date -> set of valid task ids) so we only read each day's file once.
  const idCache = new Map<string, Set<string>>();

  async function getValidIds(date: string): Promise<Set<string>> {
    let set = idCache.get(date);
    if (set) return set;
    const dailyNote = await readDailyNote(date, config);
    set = new Set((dailyNote?.tasks || []).map(t => t.id));
    idCache.set(date, set);
    return set;
  }

  let prunedCount = 0;
  const out: Note[] = [];
  for (const note of notes) {
    if (note.linkedTaskIds.length === 0) {
      out.push(note);
      continue;
    }
    const valid = await getValidIds(note.date);
    const filtered = note.linkedTaskIds.filter(id => valid.has(id));
    if (filtered.length !== note.linkedTaskIds.length) {
      prunedCount += note.linkedTaskIds.length - filtered.length;
    }
    out.push(filtered.length === note.linkedTaskIds.length
      ? note
      : { ...note, linkedTaskIds: filtered });
  }

  return { notes: out, prunedCount };
}

export async function getNotesForDate(date: string): Promise<Note[]> {
  return getAllNotes({ startDate: date, endDate: date });
}

export async function getNoteById(id: string): Promise<Note | null> {
  const notesDir = await getNotesDir();
  const files = await scanNotesRecursive(notesDir);
  for (const filePath of files) {
    if (path.basename(filePath, '.md') === id) {
      const content = await fs.readFile(filePath, 'utf-8');
      return parseNoteFile(content, filePath);
    }
  }
  return null;
}

export async function createNote(
  data: Omit<Note, 'id' | 'createdAt' | 'updatedAt' | 'filePath' | 'mentions'>
): Promise<Note> {
  const notesDir = await getNotesDir();
  const now = new Date().toISOString();
  const slug = slugify(data.title);
  const id = `${data.date}-${slug}`;

  const [year, month] = data.date.split('-');
  const dirPath = path.join(notesDir, year, month);
  await fs.mkdir(dirPath, { recursive: true });

  const mentions = extractMentions(data.body);
  const allMentions = [...new Set([...mentions, ...(data.participants || [])])];

  const note: Note = {
    ...data,
    id,
    mentions: allMentions,
    createdAt: now,
    updatedAt: now,
  };

  const frontmatter = generateFrontmatter(note);
  const fileContent = `${frontmatter}\n\n${data.body}\n`;
  const filePath = path.join(dirPath, `${id}.md`);

  await fs.writeFile(filePath, fileContent, 'utf-8');
  note.filePath = filePath;
  return note;
}

export async function updateNote(
  id: string,
  updates: Partial<Omit<Note, 'id' | 'createdAt' | 'filePath'>>
): Promise<Note | null> {
  const existing = await getNoteById(id);
  if (!existing || !existing.filePath) return null;

  const updated: Note = {
    ...existing,
    ...updates,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
    filePath: existing.filePath,
  };

  if (updates.body) {
    const bodyMentions = extractMentions(updates.body);
    const allMentions = [...new Set([...bodyMentions, ...(updated.participants || [])])];
    updated.mentions = allMentions;
  }

  const frontmatter = generateFrontmatter(updated);
  const fileContent = `${frontmatter}\n\n${updated.body}\n`;
  await fs.writeFile(existing.filePath, fileContent, 'utf-8');
  return updated;
}

export async function deleteNote(id: string): Promise<boolean> {
  const note = await getNoteById(id);
  if (!note || !note.filePath) return false;
  try {
    await fs.unlink(note.filePath);
    return true;
  } catch {
    return false;
  }
}

export async function getMentionsList(): Promise<string[]> {
  const notes = await getAllNotes();
  const mentions = new Set<string>();
  for (const note of notes) {
    for (const m of note.mentions) {
      mentions.add(m);
    }
  }
  return [...mentions].sort();
}
