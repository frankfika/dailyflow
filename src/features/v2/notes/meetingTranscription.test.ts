import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// Mock the api/client module BEFORE importing the SUT so the dynamic
// import() inside transcribeMeeting() resolves to our mocks.
const transcribeNoteMeeting = vi.fn();
const transcribeLocal = vi.fn();

vi.mock('../../../api/client', async () => {
  const actual = await vi.importActual<typeof import('../../../api/client')>('../../../api/client');
  return {
    ...actual,
    transcriptionApi: {
      ...(actual.transcriptionApi as object),
      transcribeLocal: (...args: unknown[]) => transcribeLocal(...args),
      getLocalConfig: vi.fn(),
      setLocalConfig: vi.fn(),
      testLocalConfig: vi.fn(),
    },
  };
});

vi.mock('../api/client', () => ({
  transcribeNoteMeeting: (...args: unknown[]) => transcribeNoteMeeting(...args),
}));

import {
  DEFAULT_LOCAL_WHISPER_CONFIG,
  LOCAL_WHISPER_CONFIG_STORAGE_KEY,
  TRANSCRIPTION_BACKEND_STORAGE_KEY,
  loadLocalWhisperConfig,
  loadTranscriptionBackend,
  localWhisperConfigToApiInput,
  saveLocalWhisperConfig,
  saveTranscriptionBackend,
  transcribeMeeting,
} from './meetingTranscription';

describe('meetingTranscription backend dispatch (Sprint 1 Gap 5)', () => {
  beforeEach(() => {
    localStorage.clear();
    transcribeNoteMeeting.mockReset();
    transcribeLocal.mockReset();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('defaults to OpenAI when no backend preference is stored', async () => {
    expect(loadTranscriptionBackend()).toBe('openai');
    transcribeNoteMeeting.mockResolvedValue({ text: 'hello cloud' });

    const result = await transcribeMeeting('note_01', 'src_audio');

    expect(result.backend).toBe('openai');
    expect(result.text).toBe('hello cloud');
    expect(transcribeNoteMeeting).toHaveBeenCalledWith('note_01', expect.objectContaining({
      sourceId: 'src_audio',
      transcription: expect.objectContaining({ mode: 'remote' }),
    }));
    expect(transcribeLocal).not.toHaveBeenCalled();
  });

  it('routes to local whisper.cpp when backend preference is "local"', async () => {
    saveTranscriptionBackend('local');
    saveLocalWhisperConfig({
      ...DEFAULT_LOCAL_WHISPER_CONFIG,
      executablePath: '/opt/whisper/bin/whisper-cli',
      modelPath: '/opt/whisper/models/ggml-small.bin',
    });
    transcribeLocal.mockResolvedValue({
      job: { id: 'job_01', status: 'succeeded' },
      source: { id: 'src_text', body: 'hello local' },
    });

    const result = await transcribeMeeting('note_02', 'src_audio_2');

    expect(result.backend).toBe('local');
    expect(result.text).toBe('hello local');
    expect(result.jobId).toBe('job_01');
    expect(transcribeLocal).toHaveBeenCalledWith('note_02', 'src_audio_2',
      localWhisperConfigToApiInput(loadLocalWhisperConfig()),
    );
    expect(transcribeNoteMeeting).not.toHaveBeenCalled();
    expect(localStorage.getItem(TRANSCRIPTION_BACKEND_STORAGE_KEY)).toBe('local');
    expect(JSON.parse(localStorage.getItem(LOCAL_WHISPER_CONFIG_STORAGE_KEY)!)
      .modelPath).toBe('/opt/whisper/models/ggml-small.bin');
  });

  it('honors an explicit backend override regardless of stored preference', async () => {
    saveTranscriptionBackend('local'); // stored says local
    saveLocalWhisperConfig({ ...DEFAULT_LOCAL_WHISPER_CONFIG, modelPath: '/tmp/never.bin' });
    transcribeNoteMeeting.mockResolvedValue({ text: 'forced openai path' });

    const result = await transcribeMeeting('note_03', 'src_audio_3', { backend: 'openai' });

    expect(result.backend).toBe('openai');
    expect(result.text).toBe('forced openai path');
    expect(transcribeNoteMeeting).toHaveBeenCalledTimes(1);
    expect(transcribeLocal).not.toHaveBeenCalled();
  });
});
