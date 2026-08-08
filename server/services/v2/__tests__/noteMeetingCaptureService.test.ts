import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { V2Repository } from '../../../repositories/v2/repository';
import { NoteService } from '../noteService';
import { captureNoteMeeting } from '../noteMeetingCaptureService';
import { resolveNoteMeetingAudio } from '../noteMeetingCaptureService';
import { transcribeStoredMeetingAudio } from '../noteMeetingCaptureService';

describe('note meeting capture service', () => {
  let root: string;
  let repo: V2Repository;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'df-note-meeting-'));
    repo = new V2Repository({ root, workspaceId: 'ws_meeting' });
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('saves audio first and links it to the existing NoteDocument', async () => {
    const note = await new NoteService(repo).create({
      body: '手写会议记录',
      title: '产品周会',
      tagIds: ['产品', '周会'],
    });
    const bytes = Buffer.from('fake-webm-audio');
    const result = await captureNoteMeeting(repo, note.id, {
      audio: {
        data: bytes.toString('base64'),
        mimeType: 'audio/webm',
        filename: 'weekly.webm',
      },
      durationSeconds: 42,
      language: 'zh',
    });

    expect(result.transcriptionMode).toBe('saved-only');
    expect(result.note.kind).toBe('meeting');
    expect(result.note.tagIds).toEqual(['产品', '周会']);
    expect(result.note.body).toBe('手写会议记录');
    expect(result.note.sourceIds).toContain(result.audioSource.id);
    expect(result.audioSource.kind).toBe('meeting_audio');
    expect(result.audioSource.filePath).toMatch(
      new RegExp(`^Attachments/Notes/${note.id}/audio/src_[A-Z0-9]+\\.webm$`),
    );
    expect(path.isAbsolute(result.audioSource.filePath!)).toBe(false);
    expect(await fs.readFile(path.join(root, result.audioSource.filePath!))).toEqual(bytes);
  });

  it('creates a transcript SourceItem and file after remote transcription', async () => {
    const note = await new NoteService(repo).create({ body: '', kind: 'meeting' });
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({
      text: '你好，今天讨论发布计划。',
      segments: [{ start: 1, end: 5, speaker: '方辰', text: '今天讨论发布计划。' }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const fetchImpl = fetchMock as unknown as typeof fetch;

    const result = await captureNoteMeeting(repo, note.id, {
      audio: { data: Buffer.from('audio').toString('base64'), mimeType: 'audio/mpeg' },
      transcriptionConfig: {
        apiKey: 'secret',
        baseUrl: 'https://speech.example.test/v1',
        model: 'whisper-large-v3',
      },
    }, fetchImpl);

    expect(result.transcriptionMode).toBe('remote');
    expect(result.text).toBe('你好，今天讨论发布计划。');
    expect(result.transcriptSource?.kind).toBe('meeting_transcript');
    expect(result.transcriptSource?.body).toContain('[00:01–00:05] 方辰: 今天讨论发布计划。');
    expect(result.note.sourceIds).toEqual(expect.arrayContaining([
      result.audioSource.id,
      result.transcriptSource!.id,
    ]));
    const transcriptFile = await fs.readFile(
      path.join(root, result.transcriptSource!.filePath!),
      'utf8',
    );
    expect(transcriptFile).toContain('[00:01–00:05] 方辰: 今天讨论发布计划。');
    const request = fetchMock.mock.calls[0]!;
    expect(request[0]).toBe('https://speech.example.test/v1/audio/transcriptions');
    expect((request[1]?.headers as Record<string, string>).Authorization).toBe('Bearer secret');
  });

  it('uses OpenAI diarized JSON for speaker-aware meeting transcripts', async () => {
    const note = await new NoteService(repo).create({ body: '', kind: 'meeting' });
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({
      text: '先做原型。下周评审。',
      segments: [
        { start: 0, end: 2, speaker: 'A', text: '先做原型。' },
        { start: 2, end: 4, speaker: 'B', text: '下周评审。' },
      ],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    const result = await captureNoteMeeting(repo, note.id, {
      audio: { data: Buffer.from('audio').toString('base64'), mimeType: 'audio/webm' },
      transcription: {
        mode: 'remote',
        provider: 'openai',
        apiKey: 'secret',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o-transcribe-diarize',
        diarize: true,
      },
    }, fetchMock as unknown as typeof fetch);

    expect(result.segments?.map(segment => segment.speaker)).toEqual(['A', 'B']);
    const form = fetchMock.mock.calls[0]![1]?.body as FormData;
    expect(form.get('response_format')).toBe('diarized_json');
    expect(form.get('chunking_strategy')).toBe('auto');
  });

  it('normalizes Deepgram utterances into timestamped speaker segments', async () => {
    const note = await new NoteService(repo).create({ body: '', kind: 'meeting' });
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({
      results: {
        channels: [{ alternatives: [{ transcript: '先做原型。下周评审。' }] }],
        utterances: [
          { start: 0, end: 2, speaker: 0, transcript: '先做原型。' },
          { start: 2, end: 4, speaker: 1, transcript: '下周评审。' },
        ],
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    const result = await captureNoteMeeting(repo, note.id, {
      audio: { data: Buffer.from('audio').toString('base64'), mimeType: 'audio/webm' },
      transcription: {
        mode: 'remote', provider: 'deepgram', apiKey: 'secret',
        baseUrl: 'https://api.deepgram.com/v1', model: 'nova-3', language: 'zh', diarize: true,
        keyterms: ['DailyFlow'],
      },
    }, fetchMock as unknown as typeof fetch);

    expect(result.transcriptSource?.body).toContain('Speaker 0: 先做原型。');
    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(url.pathname).toBe('/v1/listen');
    expect(url.searchParams.get('diarize_model')).toBe('latest');
    expect(url.searchParams.get('keyterm')).toBe('DailyFlow');
    expect((fetchMock.mock.calls[0]![1]?.headers as Record<string, string>).Authorization).toBe('Token secret');
  });

  it('normalizes ElevenLabs word-level speaker labels', async () => {
    const note = await new NoteService(repo).create({ body: '', kind: 'meeting' });
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({
      text: 'Ship Friday. Agreed.',
      words: [
        { start: 0, end: 1, speaker_id: 'speaker_0', text: 'Ship', type: 'word' },
        { start: 1, end: 2, speaker_id: 'speaker_0', text: 'Friday.', type: 'word' },
        { start: 2, end: 3, speaker_id: 'speaker_1', text: 'Agreed.', type: 'word' },
      ],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    const result = await captureNoteMeeting(repo, note.id, {
      audio: { data: Buffer.from('audio').toString('base64'), mimeType: 'audio/webm' },
      transcription: {
        mode: 'remote', provider: 'elevenlabs', apiKey: 'secret',
        baseUrl: 'https://api.elevenlabs.io/v1', model: 'scribe_v2', diarize: true, speakerCount: 2,
      },
    }, fetchMock as unknown as typeof fetch);

    expect(result.segments).toHaveLength(2);
    expect(result.transcriptSource?.body).toContain('speaker_0: Ship Friday.');
    expect((fetchMock.mock.calls[0]![1]?.headers as Record<string, string>)['xi-api-key']).toBe('secret');
  });

  it('returns saved-only with an understandable error when remote transcription fails', async () => {
    const note = await new NoteService(repo).create({ body: '不要丢失', kind: 'meeting' });
    const fetchImpl = vi.fn(async () => new Response('provider unavailable', { status: 503 })) as typeof fetch;
    const result = await captureNoteMeeting(repo, note.id, {
      audio: { data: Buffer.from('important audio').toString('base64'), mimeType: 'audio/wav' },
      transcriptionConfig: {
        apiKey: 'secret',
        baseUrl: 'https://speech.example.test',
        model: 'whisper-1',
      },
    }, fetchImpl);

    expect(result.transcriptionMode).toBe('saved-only');
    expect(result.transcriptionError).toContain('503');
    expect(result.note.sourceIds).toContain(result.audioSource.id);
    expect(await fs.readFile(path.join(root, result.audioSource.filePath!), 'utf8'))
      .toBe('important audio');
    expect((await repo.listSourceItems()).filter(s => s.kind === 'meeting_transcript')).toHaveLength(0);
  });

  it('rejects mismatched extensions and traversal-shaped note ids', async () => {
    const note = await new NoteService(repo).create({ body: '' });
    await expect(captureNoteMeeting(repo, note.id, {
      audio: {
        data: Buffer.from('audio').toString('base64'),
        mimeType: 'audio/webm',
        filename: '../recording.mp3',
      },
    })).rejects.toMatchObject({ name: 'ZodError' });

    await expect(captureNoteMeeting(repo, '../outside', {
      audio: { data: Buffer.from('audio').toString('base64'), mimeType: 'audio/webm' },
    })).rejects.toMatchObject({ name: 'ZodError' });
  });

  it('preserves all source ids across concurrent captures', async () => {
    const note = await new NoteService(repo).create({
      body: '并发会议',
      sourceIds: ['src_EXISTING123'],
    });
    const inputs = Array.from({ length: 4 }, (_, index) => captureNoteMeeting(repo, note.id, {
      audio: {
        data: Buffer.from(`audio-${index}`).toString('base64'),
        mimeType: 'audio/webm',
      },
    }));
    const results = await Promise.all(inputs);
    const persisted = await repo.getNoteDocument(note.id);
    expect(persisted?.sourceIds).toEqual(expect.arrayContaining([
      'src_EXISTING123',
      ...results.map(result => result.audioSource.id),
    ]));
    expect(persisted?.sourceIds).toHaveLength(5);
  });

  it('resolves only linked audio stored under the note attachment directory', async () => {
    const note = await new NoteService(repo).create({ body: '', kind: 'meeting' });
    const otherNote = await new NoteService(repo).create({ body: '', kind: 'meeting' });
    const captured = await captureNoteMeeting(repo, note.id, {
      audio: { data: Buffer.from('audio').toString('base64'), mimeType: 'audio/webm' },
    });

    const playable = await resolveNoteMeetingAudio(repo, note.id, captured.audioSource.id);
    expect(playable.mimeType).toBe('audio/webm');
    expect(await fs.readFile(playable.absolutePath, 'utf8')).toBe('audio');
    await expect(resolveNoteMeetingAudio(repo, otherNote.id, captured.audioSource.id))
      .rejects.toMatchObject({ code: 'audio_source_not_linked', status: 403 });

    await repo.saveSourceItem({
      ...captured.audioSource,
      filePath: '../outside.webm',
      updatedAt: new Date().toISOString(),
    });
    await expect(resolveNoteMeetingAudio(repo, note.id, captured.audioSource.id))
      .rejects.toMatchObject({ code: 'invalid_audio_path', status: 403 });
  });

  it('blocks private and loopback transcription endpoints after saving audio', async () => {
    const note = await new NoteService(repo).create({ body: '', kind: 'meeting' });
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => (
      new Response('{}', { status: 200 })
    ));
    const result = await captureNoteMeeting(repo, note.id, {
      audio: { data: Buffer.from('private').toString('base64'), mimeType: 'audio/webm' },
      transcriptionConfig: {
        apiKey: 'secret',
        baseUrl: 'http://127.0.0.1:8000/v1',
        model: 'whisper',
      },
    }, fetchMock as unknown as typeof fetch);

    expect(result.transcriptionMode).toBe('saved-only');
    expect(result.transcriptionError).toContain('private');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await fs.readFile(path.join(root, result.audioSource.filePath!), 'utf8')).toBe('private');
  });

  it('transcribes through a loopback OpenAI-compatible local endpoint', async () => {
    const note = await new NoteService(repo).create({ body: '', kind: 'meeting' });
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => (
      new Response(JSON.stringify({ text: '这是本机转写结果' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    ));

    const result = await captureNoteMeeting(repo, note.id, {
      audio: { data: Buffer.from('audio').toString('base64'), mimeType: 'audio/webm' },
      transcription: {
        mode: 'local-endpoint',
        baseUrl: 'http://127.0.0.1:8080/v1',
        model: 'whisper',
        language: 'zh',
      },
    }, fetchMock as unknown as typeof fetch);

    expect(result.transcriptionMode).toBe('local-endpoint');
    expect(result.transcriptSource?.body).toBe('这是本机转写结果');
    expect(fetchMock).toHaveBeenCalledOnce();
    const request = fetchMock.mock.calls[0]!;
    expect(request[0]).toBe('http://127.0.0.1:8080/v1/audio/transcriptions');
    expect(request[1]?.headers).toBeUndefined();
  });

  it('can transcribe an already-saved recording later without recapturing audio', async () => {
    const note = await new NoteService(repo).create({ body: 'manual notes', kind: 'meeting' });
    const captured = await captureNoteMeeting(repo, note.id, {
      audio: { data: Buffer.from('durable audio').toString('base64'), mimeType: 'audio/webm' },
      transcription: { mode: 'save-only' },
    });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ text: 'deferred transcript' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    const result = await transcribeStoredMeetingAudio(repo, note.id, {
      sourceId: captured.audioSource.id,
      transcription: {
        mode: 'local-endpoint',
        baseUrl: 'http://127.0.0.1:8080/v1',
        model: 'whisper',
      },
      language: 'en',
    }, fetchMock as unknown as typeof fetch);

    expect(result.audioSource.id).toBe(captured.audioSource.id);
    expect(result.transcriptSource?.body).toBe('deferred transcript');
    expect(result.note.body).toBe('manual notes');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('rejects non-loopback hosts for local endpoint transcription while preserving audio', async () => {
    const note = await new NoteService(repo).create({ body: '', kind: 'meeting' });
    const fetchMock = vi.fn();

    const result = await captureNoteMeeting(repo, note.id, {
      audio: { data: Buffer.from('important audio').toString('base64'), mimeType: 'audio/webm' },
      transcription: {
        mode: 'local-endpoint',
        baseUrl: 'http://192.168.1.20:8080/v1',
        model: 'whisper',
      },
    }, fetchMock as unknown as typeof fetch);

    expect(result.transcriptionMode).toBe('saved-only');
    expect(result.transcriptionError).toMatch(/localhost|127\.0\.0\.1|::1/i);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await fs.readFile(path.join(root, result.audioSource.filePath!), 'utf8'))
      .toBe('important audio');
  });
});
