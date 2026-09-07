import type { MeetingTranscriptionRequest } from '../api/client';
import {
  loadMeetingTranscriptionModelSettings,
  saveMeetingTranscriptionModelSettings,
} from '../../../types/models';
import { transcriptionApi, type LocalTranscriptionConfigInput } from '../../../api/client';

export interface MeetingTranscriptionSettings {
  mode: MeetingTranscriptionRequest['mode'];
  audioLanguage: 'auto' | 'zh' | 'en';
  remoteProvider: NonNullable<MeetingTranscriptionRequest['provider']>;
  modelId: string;
  installedModels: string[];
  remoteBaseUrl: string;
  remoteApiKey: string;
  remoteModel: string;
  diarize: boolean;
  speakerCount: number;
  keyterms: string;
  localEndpointBaseUrl: string;
  localEndpointModel: string;
}

const DEFAULT_SETTINGS: MeetingTranscriptionSettings = {
  mode: 'save-only',
  audioLanguage: 'auto',
  remoteProvider: 'openai',
  modelId: 'small',
  installedModels: [],
  remoteBaseUrl: 'https://api.openai.com/v1',
  remoteApiKey: '',
  remoteModel: 'gpt-4o-transcribe-diarize',
  diarize: true,
  speakerCount: 0,
  keyterms: '',
  localEndpointBaseUrl: 'http://127.0.0.1:8080/v1',
  localEndpointModel: 'whisper',
};

export function loadMeetingTranscriptionSettings(): MeetingTranscriptionSettings {
  try {
    const parsed = loadMeetingTranscriptionModelSettings<Partial<MeetingTranscriptionSettings>>({});
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      installedModels: Array.isArray(parsed.installedModels) ? parsed.installedModels : DEFAULT_SETTINGS.installedModels,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export const MEETING_TRANSCRIPTION_PRESETS = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-transcribe-diarize',
  },
  deepgram: {
    baseUrl: 'https://api.deepgram.com/v1',
    model: 'nova-3',
  },
  elevenlabs: {
    baseUrl: 'https://api.elevenlabs.io/v1',
    model: 'scribe_v2',
  },
  'siliconflow': {
    // 硅基流动 SiliconFlow — OpenAI-Whisper 兼容 ASR。
    // 中文会议首选，注册送 ¥9.9 体验金，Key 在 https://cloud.siliconflow.cn/account/ak 申请。
    // SenseVoiceSmall 多语种 + 中文识别强；TeleAI/TeleASR 中文为主。
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'FunAudioLLM/SenseVoiceSmall',
  },
  'openai-compatible': {
    baseUrl: 'https://api.openai.com/v1',
    model: 'whisper-1',
  },
} as const;

export function saveMeetingTranscriptionSettings(settings: MeetingTranscriptionSettings): void {
  saveMeetingTranscriptionModelSettings(settings);
}

export function isMeetingModelInstalled(modelId: string): boolean {
  return loadMeetingTranscriptionSettings().installedModels.includes(modelId);
}

// ---------------------------------------------------------------------------
// Sprint 1 — Gap 5: user-facing toggle for the meeting transcription backend.
// The settings panel flips between 'openai' (cloud Whisper) and 'local'
// (whisper.cpp on disk). Defaults to 'openai' so existing recordings still work.
// ---------------------------------------------------------------------------

export type TranscriptionBackend = 'openai' | 'local';

export const TRANSCRIPTION_BACKEND_STORAGE_KEY = 'dailyflow.transcription.backend';

export const LOCAL_WHISPER_CONFIG_STORAGE_KEY = 'dailyflow.transcription.local';

export interface LocalWhisperConfig {
  executablePath: string;
  modelPath: string;
  ffmpegPath: string;
  language: string;
}

export const DEFAULT_LOCAL_WHISPER_CONFIG: LocalWhisperConfig = {
  executablePath: 'whisper-cli',
  modelPath: '',
  ffmpegPath: 'ffmpeg',
  language: 'auto',
};

function safeStorageGet(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function safeStorageSet(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  } catch {
    /* ignore quota / privacy mode failures */
  }
}

/**
 * Returns the user's preferred meeting transcription backend. Defaults to
 * 'openai' to preserve the previous behaviour for users who never open the
 * settings panel.
 */
export function loadTranscriptionBackend(): TranscriptionBackend {
  const raw = safeStorageGet(TRANSCRIPTION_BACKEND_STORAGE_KEY);
  return raw === 'local' ? 'local' : 'openai';
}

export function saveTranscriptionBackend(backend: TranscriptionBackend): void {
  safeStorageSet(TRANSCRIPTION_BACKEND_STORAGE_KEY, backend);
}

export function loadLocalWhisperConfig(): LocalWhisperConfig {
  const raw = safeStorageGet(LOCAL_WHISPER_CONFIG_STORAGE_KEY);
  if (!raw) return { ...DEFAULT_LOCAL_WHISPER_CONFIG };
  try {
    const parsed = JSON.parse(raw) as Partial<LocalWhisperConfig>;
    return {
      executablePath: parsed.executablePath?.trim() || DEFAULT_LOCAL_WHISPER_CONFIG.executablePath,
      modelPath: parsed.modelPath?.trim() || DEFAULT_LOCAL_WHISPER_CONFIG.modelPath,
      ffmpegPath: parsed.ffmpegPath?.trim() || DEFAULT_LOCAL_WHISPER_CONFIG.ffmpegPath,
      language: parsed.language?.trim() || DEFAULT_LOCAL_WHISPER_CONFIG.language,
    };
  } catch {
    return { ...DEFAULT_LOCAL_WHISPER_CONFIG };
  }
}

export function saveLocalWhisperConfig(config: LocalWhisperConfig): void {
  safeStorageSet(LOCAL_WHISPER_CONFIG_STORAGE_KEY, JSON.stringify(config));
}

export function localWhisperConfigToApiInput(config: LocalWhisperConfig): LocalTranscriptionConfigInput {
  return {
    executablePath: config.executablePath,
    modelPath: config.modelPath,
    ffmpegPath: config.ffmpegPath || 'ffmpeg',
    language: config.language || 'auto',
    extraArgs: [],
  };
}

// ---------------------------------------------------------------------------
// transcribeMeeting — Sprint 1 Gap 5 unified wrapper
//
// Reads the user's preferred backend from localStorage and dispatches to
// either the local whisper.cpp seam or the existing OpenAI-compatible
// `transcribeNoteMeeting` flow. Returns a small unified shape that the UI
// can render as a single badge ("使用本地 Whisper" / "使用 OpenAI Whisper")
// without caring which route actually served the transcript.
// ---------------------------------------------------------------------------

export type TranscriptionResult = {
  text: string;
  backend: TranscriptionBackend;
  durationMs?: number;
  jobId?: string;
};

export type TranscribeMeetingOptions = {
  /** Override the storage-resolved backend. Useful for tests. */
  backend?: TranscriptionBackend;
  /** Forwarded to the remote provider when `backend === 'openai'`. */
  language?: 'auto' | 'zh' | 'en';
  /** Optional override for the local whisper.cpp config (e.g. in tests). */
  localConfig?: LocalWhisperConfig;
};

interface TranscribeNoteMeetingFn {
  (noteId: string, input: {
    sourceId: string;
    transcription: MeetingTranscriptionRequest;
  }): Promise<{
    text?: string;
    transcriptSource?: { body?: string };
    source?: { body?: string };
    job?: { id: string };
  }>;
}

async function loadTranscribeNoteMeeting(): Promise<TranscribeNoteMeetingFn> {
  // Dynamic import so unit tests can mock this module without circular deps.
  const mod = await import('../api/client');
  return mod.transcribeNoteMeeting as TranscribeNoteMeetingFn;
}

export async function transcribeMeeting(
  noteId: string,
  sourceId: string,
  options: TranscribeMeetingOptions = {},
): Promise<TranscriptionResult> {
  const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const elapsed = () =>
    (typeof performance !== 'undefined' ? performance.now() : Date.now()) - started;
  const backend = options.backend ?? loadTranscriptionBackend();
  if (backend === 'local') {
    const config = options.localConfig ?? loadLocalWhisperConfig();
    const response = await transcriptionApi.transcribeLocal(
      noteId,
      sourceId,
      localWhisperConfigToApiInput(config),
    );
    const text = response.source?.body ?? '';
    return {
      text,
      backend: 'local',
      durationMs: elapsed(),
      jobId: response.job?.id,
    };
  }

  const settings = loadMeetingTranscriptionSettings();
  const language = options.language ?? settings.audioLanguage;
  const transcription: MeetingTranscriptionRequest = {
    mode: 'remote',
    provider: settings.remoteProvider,
    apiKey: settings.remoteApiKey,
    baseUrl: settings.remoteBaseUrl,
    model: settings.remoteModel,
    language,
    diarize: settings.diarize,
    speakerCount: settings.speakerCount || undefined,
    keyterms: settings.keyterms.split(/[,，\n]/).map(term => term.trim()).filter(Boolean),
  };

  const transcribe = await loadTranscribeNoteMeeting();
  const response = await transcribe(noteId, { sourceId, transcription });
  const text = response.text ?? response.transcriptSource?.body ?? response.source?.body ?? '';
  return {
    text,
    backend: 'openai',
    durationMs: elapsed(),
    jobId: response.job?.id,
  };
}
