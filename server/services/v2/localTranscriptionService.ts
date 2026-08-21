/** Local speech-to-text adapter for meeting audio.
 *
 * The service deliberately owns no model files. It invokes a user-provided
 * whisper.cpp executable/model and keeps the same SourceItem contract as the
 * remote capture path. Tests can inject `runner`, so CI never needs a model.
 */
import crypto from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { z } from 'zod';
import { newId } from '../../domain/v2/ulid.js';
import { SourceItemSchema, type SourceItem } from '../../domain/v2/types.js';
import type { V2Repository } from '../../repositories/v2/repository.js';
import {
  ConcurrentModificationError,
  sha256 as fileSha256,
} from '../../repositories/v2/atomicWrite.js';
import { serializeNoteDocument } from '../../repositories/v2/markdownSerializer.js';
import { NoteNotFoundError } from './noteService.js';

export const LocalTranscriptionConfigSchema = z.object({
  executablePath: z.string().trim().min(1).max(2000),
  modelPath: z.string().trim().min(1).max(4000),
  ffmpegPath: z.string().trim().min(1).max(2000).default('ffmpeg'),
  language: z.string().trim().min(1).max(20).default('auto'),
  extraArgs: z.array(z.string().max(500)).max(32).default([]),
});
// Resolve defaults (ffmpegPath/language/extraArgs) so the runner never has to
// handle undefined fields — every schema value is a concrete string/array.
export type LocalTranscriptionConfig = z.output<typeof LocalTranscriptionConfigSchema>;

export interface LocalTranscriptionRunner {
  (config: LocalTranscriptionConfig, audioPath: string): Promise<{ text: string }>;
}

const defaultRunner: LocalTranscriptionRunner = async (config, audioPath) => {
  const extension = path.extname(audioPath).toLowerCase();
  const supported = new Set(['.wav', '.mp3', '.ogg', '.flac']);
  let inputPath = audioPath;
  let convertedPath: string | undefined;
  if (!supported.has(extension)) {
    convertedPath = path.join(os.tmpdir(), `dailyflow-transcription-${process.pid}-${Date.now()}.wav`);
    await new Promise<void>((resolve, reject) => {
      const converter = spawn(config.ffmpegPath, ['-y', '-i', audioPath, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', convertedPath!], { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      converter.stderr.setEncoding('utf8');
      converter.stderr.on('data', (value: string) => { stderr += value; });
      converter.once('error', reject);
      converter.once('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}: ${stderr.trim()}`)));
    });
    inputPath = convertedPath;
  }
  try {
    const args = ['-m', config.modelPath, '-f', inputPath, '--no-timestamps'];
    if (config.language !== 'auto') args.push('-l', config.language);
    args.push(...config.extraArgs);
    const result = await new Promise<{ text: string }>((resolve, reject) => {
      const child = spawn(config.executablePath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', (value: string) => { stdout += value; });
  child.stderr.on('data', (value: string) => { stderr += value; });
  child.once('error', reject);
  child.once('close', code => {
    if (code !== 0) return reject(new Error(`whisper.cpp exited with ${code}: ${stderr.trim()}`));
    const text = stdout.trim();
    if (!text) return reject(new Error('whisper.cpp returned an empty transcript.'));
    resolve({ text });
  });
    });
    return result;
  } finally {
    if (convertedPath) await fs.unlink(convertedPath).catch(() => {});
  }
};

export async function getLocalTranscriptionConfig(repo: V2Repository): Promise<LocalTranscriptionConfig | null> {
  try {
    const raw = JSON.parse(await fs.readFile(path.join(repo.layout.internal.config.replace(/config\.json$/, 'transcription.json')), 'utf8'));
    return LocalTranscriptionConfigSchema.parse(raw);
  } catch { return null; }
}

export async function saveLocalTranscriptionConfig(repo: V2Repository, input: LocalTranscriptionConfig): Promise<LocalTranscriptionConfig> {
  const config = LocalTranscriptionConfigSchema.parse(input);
  const filePath = path.join(path.dirname(repo.layout.internal.config), 'transcription.json');
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temp, filePath);
  return config;
}

function relative(root: string, absolute: string): string { return path.relative(root, absolute).split(path.sep).join('/'); }
function hash(text: string): string { return crypto.createHash('sha256').update(text).digest('hex'); }

export async function transcribeMeetingAudio(
  repo: V2Repository,
  noteId: string,
  sourceId: string,
  config: LocalTranscriptionConfig,
  runner: LocalTranscriptionRunner = defaultRunner,
): Promise<{ source: SourceItem; text: string }> {
  const note = await repo.getNoteDocument(noteId);
  if (!note) throw new NoteNotFoundError(noteId);
  if (!note.sourceIds.includes(sourceId)) throw new Error('Audio source is not attached to this note.');
  const audio = await repo.getSourceItem(sourceId);
  if (!audio || audio.kind !== 'meeting_audio' || !audio.filePath) throw new Error('Meeting audio source not found.');
  const audioPath = path.resolve(repo.layout.root, audio.filePath);
  const root = path.resolve(repo.layout.root);
  if (audioPath !== root && !audioPath.startsWith(`${root}${path.sep}`)) throw new Error('Audio path escapes workspace.');
  await fs.access(audioPath);
  const parsed = LocalTranscriptionConfigSchema.parse(config);
  const result = await runner(parsed, audioPath);
  const text = result.text.trim();
  if (!text) throw new Error('Local transcription returned an empty transcript.');
  const now = new Date().toISOString();
  const transcriptId = newId('src');
  const transcriptPath = path.join(repo.layout.attachments, 'Notes', note.id, 'transcripts', `${transcriptId}.md`);
  const body = `# Meeting transcript\n\n${text}\n`;
  await fs.mkdir(path.dirname(transcriptPath), { recursive: true });
  await fs.writeFile(transcriptPath, body, 'utf8');
  const source = SourceItemSchema.parse({
    id: transcriptId, schemaVersion: 1, createdAt: now, updatedAt: now, createdBy: 'user',
    workspaceId: note.workspaceId, kind: 'meeting_transcript', title: `Local transcript ${now.slice(0, 19).replace('T', ' ')}`,
    body: text, occurredAt: now, filePath: relative(repo.layout.root, transcriptPath), contentHash: hash(text),
    processingStatus: 'processed', sensitivity: 'private', language: audio.language,
    meta: audio.meta,
  });
  await repo.saveSourceItem(source, { auditKind: 'capture', auditActor: 'user', auditEntity: { type: 'source', id: source.id }, auditData: { noteId, audioSourceId: sourceId, provider: 'local' }, occurredAt: now });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const current = await repo.getNoteDocument(noteId);
    if (!current || current.sourceIds.includes(source.id)) break;
    try {
      await repo.saveNoteDocument(
        {
          ...current,
          sourceIds: [...current.sourceIds, source.id],
          updatedAt: now,
          autoSaveVersion: current.autoSaveVersion + 1,
        },
        {
          expectedHash: fileSha256(serializeNoteDocument(current)),
          auditKind: 'capture',
          auditActor: 'user',
          auditEntity: { type: 'note', id: current.id },
          auditData: { sourceId: source.id },
        },
      );
      break;
    } catch (err) {
      if (!(err instanceof ConcurrentModificationError) || attempt === 1) throw err;
    }
  }
  return { source, text };
}

async function executableAvailable(command: string): Promise<boolean> {
  if (path.isAbsolute(command) || command.includes(path.sep)) {
    return fs.access(command).then(() => true, () => false);
  }
  const pathEntries = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const directory of pathEntries) {
    if (await fs.access(path.join(directory, command)).then(() => true, () => false)) return true;
  }
  return false;
}

export async function localTranscriptionStatus(config: LocalTranscriptionConfig): Promise<{ executable: boolean; model: boolean; ffmpeg: boolean }> {
  const parsed = LocalTranscriptionConfigSchema.parse(config);
  const [executable, model, ffmpeg] = await Promise.all([
    executableAvailable(parsed.executablePath),
    fs.access(parsed.modelPath).then(() => true, () => false),
    executableAvailable(parsed.ffmpegPath),
  ]);
  return { executable, model, ffmpeg };
}

export const localTranscriptionDefaults = { executablePath: 'whisper-cli', modelPath: path.join(os.homedir(), 'Library/Application Support/DailyFlow/models/whisper/ggml-small.bin'), ffmpegPath: 'ffmpeg', language: 'auto', extraArgs: [] } satisfies LocalTranscriptionConfig;
