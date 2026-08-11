import type { MeetingTranscriptionRequest } from '../api/client';
import {
  loadMeetingTranscriptionModelSettings,
  saveMeetingTranscriptionModelSettings,
} from '../../../types/models';

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
