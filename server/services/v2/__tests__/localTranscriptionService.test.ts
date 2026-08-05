import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { V2Repository } from '../../../repositories/v2/repository';
import { NoteService } from '../noteService';
import { captureNoteMeeting } from '../noteMeetingCaptureService';
import { getLocalTranscriptionConfig, localTranscriptionStatus, saveLocalTranscriptionConfig, transcribeMeetingAudio } from '../localTranscriptionService';

describe('local transcription service', () => {
  let root: string;
  let repo: V2Repository;
  beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'df-local-asr-')); repo = new V2Repository({ root, workspaceId: 'ws_local' }); });
  afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

  it('persists local whisper.cpp config without API credentials', async () => {
    const config = await saveLocalTranscriptionConfig(repo, { executablePath: '/usr/local/bin/whisper-cli', modelPath: '/models/ggml-small.bin', language: 'zh', extraArgs: [] });
    expect(await getLocalTranscriptionConfig(repo)).toEqual(config);
    expect(JSON.parse(await fs.readFile(path.join(root, '.dailyflow/transcription.json'), 'utf8'))).toEqual(config);
  });

  it('creates a durable transcript SourceItem through an injected runner', async () => {
    const note = await new NoteService(repo).create({ kind: 'meeting', body: '' });
    const capture = await captureNoteMeeting(repo, note.id, { audio: { data: Buffer.from('wav').toString('base64'), mimeType: 'audio/wav', filename: 'meeting.wav' } });
    const runner = vi.fn(async () => ({ text: '本地转写结果' }));
    const result = await transcribeMeetingAudio(repo, note.id, capture.audioSource.id, { executablePath: 'whisper-cli', modelPath: '/models/small.bin', language: 'zh', extraArgs: [] }, runner);
    expect(runner).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('/audio/'));
    expect(result.source.kind).toBe('meeting_transcript');
    expect(result.source.processingStatus).toBe('processed');
    expect((await repo.getNoteDocument(note.id))?.sourceIds).toContain(result.source.id);
    expect(await fs.readFile(path.join(root, result.source.filePath!), 'utf8')).toContain('本地转写结果');
  });

  it('detects executable names through PATH instead of requiring absolute paths', async () => {
    const modelPath = path.join(root, 'small.bin');
    await fs.writeFile(modelPath, 'model');
    const status = await localTranscriptionStatus({
      executablePath: 'node',
      modelPath,
      ffmpegPath: 'node',
      language: 'auto',
      extraArgs: [],
    });
    expect(status).toEqual({ executable: true, model: true, ffmpeg: true });
  });
});
