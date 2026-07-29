/**
 * Native meeting capture for NoteDocument.
 *
 * A meeting is not a separate entity: the NoteDocument remains the owner,
 * while the original recording and optional transcript are SourceItems
 * referenced by note.sourceIds. The recording is durably written before any
 * remote transcription is attempted.
 */
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { newId } from '../../domain/v2/ulid.js';
import {
  NoteDocumentSchema,
  SourceItemSchema,
  type NoteDocument,
  type SourceItem,
} from '../../domain/v2/types.js';
import type { V2Repository } from '../../repositories/v2/repository.js';
import {
  ConcurrentModificationError,
  sha256 as fileSha256,
} from '../../repositories/v2/atomicWrite.js';
import { serializeNoteDocument } from '../../repositories/v2/markdownSerializer.js';
import { NoteNotFoundError } from './noteService.js';

const AudioSchema = z.object({
  data: z.string().min(1).max(140_000_000),
  mimeType: z.string().trim().min(1).max(100),
  filename: z.string().trim().min(1).max(255).optional(),
});

const EndpointTranscriptionSchema = z.object({
  baseUrl: z.string().trim().min(1).max(2_000),
  model: z.string().trim().min(1).max(200),
  apiKey: z.string().max(20_000).optional(),
  language: z.string().trim().min(1).max(30).optional(),
});

export const NoteMeetingCaptureInputSchema = z.object({
  audio: AudioSchema,
  durationSeconds: z.number().nonnegative().max(86_400).optional(),
  language: z.enum(['zh', 'en']).optional(),
  transcriptionConfig: z.object({
    apiKey: z.string().min(1).max(20_000),
    baseUrl: z.string().trim().min(1).max(2_000),
    model: z.string().trim().min(1).max(200),
    language: z.string().trim().min(1).max(30).optional(),
  }).optional(),
  transcription: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('save-only') }),
    EndpointTranscriptionSchema.extend({ mode: z.literal('remote'), apiKey: z.string().min(1).max(20_000) }),
    EndpointTranscriptionSchema.extend({ mode: z.literal('local-endpoint') }),
    z.object({ mode: z.literal('local-managed'), engine: z.literal('whisper.cpp').optional(), modelId: z.string().optional() }),
  ]).optional(),
});
export type NoteMeetingCaptureInput = z.infer<typeof NoteMeetingCaptureInputSchema>;

export interface TranscriptSegment {
  start: number;
  end: number;
  speaker?: string;
  text: string;
}

export interface NoteMeetingCaptureResult {
  note: NoteDocument;
  audioSource: SourceItem;
  transcriptSource?: SourceItem;
  segments?: TranscriptSegment[];
  text?: string;
  transcriptionMode: 'remote' | 'local-endpoint' | 'saved-only';
  transcriptionError?: string;
}

export class MeetingAudioAccessError extends Error {
  constructor(
    public code: 'audio_source_not_found' | 'audio_source_not_linked' | 'invalid_audio_path',
    message: string,
    public status: 404 | 403 = 404,
  ) {
    super(message);
    this.name = 'MeetingAudioAccessError';
  }
}

interface TranscriptionResponse {
  text?: unknown;
  segments?: unknown;
}

type Fetch = typeof fetch;

const AUDIO_TYPES: Record<string, string> = {
  'audio/webm': '.webm',
  'audio/ogg': '.ogg',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/mp4': '.m4a',
  'audio/x-m4a': '.m4a',
  'audio/aac': '.aac',
  'audio/flac': '.flac',
};

const AUDIO_MIME_BY_EXTENSION: Record<string, string> = Object.fromEntries(
  Object.entries(AUDIO_TYPES).map(([mimeType, extension]) => [extension, mimeType]),
);

const BLOCKED_HOSTS = [
  /^localhost$/i,
  /\.localhost$/i,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^\[?::1\]?$/,
  /^\[?f[cd][0-9a-f]{2}:/i,
  /^\[?fe[89ab][0-9a-f]:/i,
];

function isBlockedHost(url: URL): boolean {
  return BLOCKED_HOSTS.some(pattern => pattern.test(url.hostname));
}

function normalizeMimeType(raw: string): string {
  return raw.toLowerCase().split(';', 1)[0]!.trim();
}

function audioExtension(mimeType: string, filename?: string): string {
  const ext = AUDIO_TYPES[normalizeMimeType(mimeType)];
  if (!ext) throw new z.ZodError([{
    code: z.ZodIssueCode.custom,
    path: ['audio', 'mimeType'],
    message: `Unsupported audio type: ${mimeType}`,
  }]);
  if (filename) {
    const supplied = path.extname(path.basename(filename)).toLowerCase();
    if (supplied && supplied !== ext && !(supplied === '.mp4' && ext === '.m4a')) {
      throw new z.ZodError([{
        code: z.ZodIssueCode.custom,
        path: ['audio', 'filename'],
        message: `Filename extension ${supplied} does not match ${normalizeMimeType(mimeType)}`,
      }]);
    }
  }
  return ext;
}

function decodeBase64(data: string): Buffer {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(data);
  const payload = match ? match[2]! : data;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(payload) || payload.length % 4 === 1) {
    throw new z.ZodError([{
      code: z.ZodIssueCode.custom,
      path: ['audio', 'data'],
      message: 'Audio data must be valid base64.',
    }]);
  }
  const bytes = Buffer.from(payload, 'base64');
  if (bytes.length === 0) {
    throw new z.ZodError([{
      code: z.ZodIssueCode.custom,
      path: ['audio', 'data'],
      message: 'Audio payload is empty.',
    }]);
  }
  return bytes;
}

function hashBytes(bytes: Uint8Array): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function workspaceRelative(root: string, absolutePath: string): string {
  const relative = path.relative(root, absolutePath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Attachment path escaped the workspace.');
  }
  return relative.split(path.sep).join('/');
}

async function atomicWriteBytes(filePath: string, bytes: Buffer): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${crypto.randomUUID()}.tmp`,
  );
  const handle = await fs.open(tempPath, 'wx');
  let tempExists = true;
  try {
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    await fs.rename(tempPath, filePath);
    tempExists = false;
  } catch (error) {
    await handle.close().catch(() => undefined);
    throw error;
  } finally {
    if (tempExists) await fs.unlink(tempPath).catch(() => undefined);
  }
}

function transcriptionUrl(baseUrl: string, allowLoopback = false): string {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error('Transcription base URL is invalid.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Transcription base URL must use http or https.');
  }
  const loopback = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(parsed.hostname.toLowerCase());
  if (allowLoopback && !loopback) {
    throw new Error('Local transcription endpoint must use localhost, 127.0.0.1, or ::1.');
  }
  if (!allowLoopback && isBlockedHost(parsed)) {
    throw new Error('Transcription base URL must not target localhost, private, or link-local networks.');
  }
  const clean = baseUrl.replace(/\/+$/, '');
  if (/\/audio\/transcriptions$/i.test(clean)) return clean;
  return /\/v\d+$/i.test(clean)
    ? `${clean}/audio/transcriptions`
    : `${clean}/v1/audio/transcriptions`;
}

function normalizeSegments(value: unknown): TranscriptSegment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): TranscriptSegment[] => {
    if (!entry || typeof entry !== 'object') return [];
    const item = entry as Record<string, unknown>;
    const text = typeof item.text === 'string' ? item.text.trim() : '';
    if (!text) return [];
    return [{
      start: typeof item.start === 'number' && item.start >= 0 ? item.start : 0,
      end: typeof item.end === 'number' && item.end >= 0 ? item.end : 0,
      speaker: typeof item.speaker === 'string' && item.speaker.trim()
        ? item.speaker.trim()
        : undefined,
      text,
    }];
  });
}

function transcriptMarkdown(text: string, segments: TranscriptSegment[]): string {
  if (segments.length === 0) return text.trim();
  return segments.map((segment) => {
    const stamp = `${formatTime(segment.start)}–${formatTime(segment.end)}`;
    const speaker = segment.speaker ? ` ${segment.speaker}` : '';
    return `- [${stamp}]${speaker}: ${segment.text}`;
  }).join('\n');
}

function formatTime(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours > 0
    ? [hours, minutes, remainder].map(v => String(v).padStart(2, '0')).join(':')
    : [minutes, remainder].map(v => String(v).padStart(2, '0')).join(':');
}

async function transcribe(
  bytes: Buffer,
  mimeType: string,
  extension: string,
  config: { baseUrl: string; model: string; apiKey?: string; language?: string },
  language: 'zh' | 'en' | undefined,
  fetchImpl: Fetch,
  allowLoopback = false,
): Promise<{ text: string; segments: TranscriptSegment[] }> {
  const form = new FormData();
  form.append('file', new Blob([Uint8Array.from(bytes)], { type: mimeType }), `recording${extension}`);
  form.append('model', config.model);
  form.append('response_format', 'verbose_json');
  const languageHint = config.language ?? language;
  if (languageHint) form.append('language', languageHint);
  const response = await fetchImpl(transcriptionUrl(config.baseUrl, allowLoopback), {
    method: 'POST',
    headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : undefined,
    body: form,
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300).replace(/\s+/g, ' ').trim();
    throw new Error(`Transcription provider returned ${response.status}${detail ? `: ${detail}` : ''}`);
  }
  const payload = await response.json() as TranscriptionResponse;
  const segments = normalizeSegments(payload.segments);
  const text = typeof payload.text === 'string' && payload.text.trim()
    ? payload.text.trim()
    : segments.map(s => `${s.speaker ? `${s.speaker}: ` : ''}${s.text}`).join('\n');
  if (!text) throw new Error('Transcription provider returned no text.');
  return { text, segments };
}

async function withNoteCaptureLock<T>(
  repo: V2Repository,
  noteId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const lockDir = path.join(repo.layout.root, '.dailyflow', 'locks');
  await fs.mkdir(lockDir, { recursive: true });
  const lockPath = path.join(lockDir, `note-capture-${crypto.createHash('sha256').update(noteId).digest('hex')}.lock`);
  let handle: fs.FileHandle | undefined;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      handle = await fs.open(lockPath, 'wx');
      break;
    } catch (error: any) {
      if (error?.code !== 'EEXIST') throw error;
      try {
        const stat = await fs.stat(lockPath);
        if (Date.now() - stat.mtimeMs > 30_000) await fs.unlink(lockPath);
      } catch {
        // The owner may have released the lock between stat and unlink.
      }
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
  if (!handle) throw new Error('Timed out waiting for note capture lock.');
  try {
    return await operation();
  } finally {
    await handle.close();
    await fs.unlink(lockPath).catch(() => undefined);
  }
}

async function appendSourcesToNote(
  repo: V2Repository,
  noteId: string,
  sourceIds: string[],
): Promise<NoteDocument> {
  return withNoteCaptureLock(repo, noteId, async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const current = await repo.getNoteDocument(noteId);
      if (!current) throw new NoteNotFoundError(noteId);
      const now = new Date().toISOString();
      const note = NoteDocumentSchema.parse({
        ...current,
        kind: 'meeting',
        sourceIds: Array.from(new Set([...current.sourceIds, ...sourceIds])),
        updatedAt: now,
        autoSaveVersion: current.autoSaveVersion + 1,
      });
      try {
        await repo.saveNoteDocument(note, {
          expectedHash: fileSha256(serializeNoteDocument(current)),
          auditKind: 'capture',
          auditActor: 'user',
          auditEntity: { type: 'note', id: note.id },
          auditData: { sourceIds },
        });
        return note;
      } catch (err) {
        if (!(err instanceof ConcurrentModificationError) || attempt === 1) throw err;
      }
    }
    throw new Error('Unable to attach meeting sources after concurrent note updates.');
  });
}

function makeSource(input: {
  id: string;
  note: NoteDocument;
  kind: 'meeting_audio' | 'meeting_transcript';
  title: string;
  body?: string;
  filePath: string;
  contentHash: string;
  durationSeconds?: number;
  language?: 'zh' | 'en';
  now: string;
}): SourceItem {
  return SourceItemSchema.parse({
    id: input.id,
    schemaVersion: 1,
    createdAt: input.now,
    updatedAt: input.now,
    createdBy: 'user',
    workspaceId: input.note.workspaceId,
    kind: input.kind,
    title: input.title,
    body: input.body,
    occurredAt: input.now,
    filePath: input.filePath,
    contentHash: input.contentHash,
    processingStatus: 'saved',
    sensitivity: 'private',
    language: input.language,
    meta: input.durationSeconds === undefined
      ? undefined
      : { durationSeconds: input.durationSeconds },
  });
}

export async function captureNoteMeeting(
  repo: V2Repository,
  noteId: string,
  input: NoteMeetingCaptureInput,
  fetchImpl: Fetch = fetch,
): Promise<NoteMeetingCaptureResult> {
  const parsed = NoteMeetingCaptureInputSchema.parse(input);
  if (!/^[A-Za-z0-9_-]+$/.test(noteId)) {
    throw new z.ZodError([{
      code: z.ZodIssueCode.custom,
      path: ['id'],
      message: 'Invalid note id.',
    }]);
  }
  const originalNote = await repo.getNoteDocument(noteId);
  if (!originalNote) throw new NoteNotFoundError(noteId);

  const mimeType = normalizeMimeType(parsed.audio.mimeType);
  const extension = audioExtension(mimeType, parsed.audio.filename);
  const bytes = decodeBase64(parsed.audio.data);
  const now = new Date().toISOString();
  const audioId = newId('src');
  const audioAbsolute = path.join(
    repo.layout.attachments,
    'Notes',
    originalNote.id,
    'audio',
    `${audioId}${extension}`,
  );

  // This must complete before creating metadata or contacting a provider.
  await atomicWriteBytes(audioAbsolute, bytes);
  const audioSource = makeSource({
    id: audioId,
    note: originalNote,
    kind: 'meeting_audio',
    title: parsed.audio.filename
      ? path.basename(parsed.audio.filename)
      : `Meeting recording ${now.slice(0, 19).replace('T', ' ')}`,
    filePath: workspaceRelative(repo.layout.root, audioAbsolute),
    contentHash: hashBytes(bytes),
    durationSeconds: parsed.durationSeconds,
    language: parsed.language,
    now,
  });
  await repo.saveSourceItem(audioSource, {
    auditKind: 'capture',
    auditActor: 'user',
    auditEntity: { type: 'source', id: audioSource.id },
    auditData: { kind: audioSource.kind, bytes: bytes.length, noteId },
    occurredAt: now,
  });
  let note = await appendSourcesToNote(repo, noteId, [audioSource.id]);

  const requested = parsed.transcription;
  const endpointConfig: { baseUrl: string; model: string; apiKey?: string; language?: string } | undefined =
    requested?.mode === 'remote' || requested?.mode === 'local-endpoint'
      ? {
          baseUrl: requested.baseUrl!,
          model: requested.model!,
          apiKey: requested.apiKey,
          language: requested.language,
        }
      : parsed.transcriptionConfig
        ? {
            baseUrl: parsed.transcriptionConfig.baseUrl!,
            model: parsed.transcriptionConfig.model!,
            apiKey: parsed.transcriptionConfig.apiKey,
            language: parsed.transcriptionConfig.language,
          }
        : undefined;
  const endpointMode = requested?.mode === 'local-endpoint' ? 'local-endpoint' : 'remote';
  if (!endpointConfig || requested?.mode === 'save-only' || requested?.mode === 'local-managed') {
    return { note, audioSource, transcriptionMode: 'saved-only' };
  }

  let remote: { text: string; segments: TranscriptSegment[] };
  try {
    remote = await transcribe(
      bytes,
      mimeType,
      extension,
      endpointConfig,
      parsed.language,
      fetchImpl,
      endpointMode === 'local-endpoint',
    );
  } catch (error) {
    return {
      note,
      audioSource,
      transcriptionMode: 'saved-only',
      transcriptionError: error instanceof Error ? error.message : String(error),
    };
  }

  const transcriptBody = transcriptMarkdown(remote.text, remote.segments);
  const transcriptId = newId('src');
  const transcriptAbsolute = path.join(
    repo.layout.attachments,
    'Notes',
    originalNote.id,
    'transcripts',
    `${transcriptId}.md`,
  );
  await atomicWriteBytes(transcriptAbsolute, Buffer.from(transcriptBody, 'utf8'));
  const transcriptSource = makeSource({
    id: transcriptId,
    note: originalNote,
    kind: 'meeting_transcript',
    title: `Meeting transcript ${now.slice(0, 19).replace('T', ' ')}`,
    body: remote.text,
    filePath: workspaceRelative(repo.layout.root, transcriptAbsolute),
    contentHash: hashBytes(Buffer.from(remote.text, 'utf8')),
    durationSeconds: parsed.durationSeconds,
    language: parsed.language,
    now: new Date().toISOString(),
  });
  await repo.saveSourceItem(transcriptSource, {
    auditKind: 'capture',
    auditActor: 'user',
    auditEntity: { type: 'source', id: transcriptSource.id },
    auditData: { kind: transcriptSource.kind, noteId, audioSourceId: audioSource.id },
    occurredAt: now,
  });
  note = await appendSourcesToNote(repo, noteId, [transcriptSource.id]);
  return {
    note,
    audioSource,
    transcriptSource,
    segments: remote.segments,
    text: remote.text,
    transcriptionMode: endpointMode,
  };
}

export async function resolveNoteMeetingAudio(
  repo: V2Repository,
  noteId: string,
  sourceId: string,
): Promise<{ absolutePath: string; mimeType: string }> {
  const note = await repo.getNoteDocument(noteId);
  if (!note) throw new NoteNotFoundError(noteId);
  const source = await repo.getSourceItem(sourceId);
  if (!source || source.kind !== 'meeting_audio' || !source.filePath) {
    throw new MeetingAudioAccessError('audio_source_not_found', 'Meeting audio source not found.');
  }
  if (!note.sourceIds.includes(source.id)) {
    throw new MeetingAudioAccessError(
      'audio_source_not_linked',
      'This audio source is not linked to the requested note.',
      403,
    );
  }

  const expectedBase = path.resolve(repo.layout.attachments, 'Notes', note.id);
  const candidate = path.resolve(repo.layout.root, source.filePath);
  if (candidate !== expectedBase && !candidate.startsWith(`${expectedBase}${path.sep}`)) {
    throw new MeetingAudioAccessError(
      'invalid_audio_path',
      'Meeting audio path is outside this note attachment directory.',
      403,
    );
  }
  const extension = path.extname(candidate).toLowerCase();
  const mimeType = AUDIO_MIME_BY_EXTENSION[extension];
  if (!mimeType) {
    throw new MeetingAudioAccessError('invalid_audio_path', 'Meeting audio file type is not supported.', 403);
  }
  try {
    const [realBase, realCandidate] = await Promise.all([
      fs.realpath(expectedBase),
      fs.realpath(candidate),
    ]);
    if (realCandidate !== realBase && !realCandidate.startsWith(`${realBase}${path.sep}`)) {
      throw new MeetingAudioAccessError(
        'invalid_audio_path',
        'Meeting audio path resolves outside this note attachment directory.',
        403,
      );
    }
  } catch (error) {
    if (error instanceof MeetingAudioAccessError) throw error;
    throw new MeetingAudioAccessError('audio_source_not_found', 'Meeting audio file not found.');
  }
  return { absolutePath: candidate, mimeType };
}
