import type { MeetingTranscriptionRequest } from '../api/client';

const STORAGE_KEY = 'df_meeting_transcription_settings';

export interface MeetingTranscriptionSettings {
  mode: MeetingTranscriptionRequest['mode'];
  modelId: string;
  installedModels: string[];
  remoteBaseUrl: string;
  remoteApiKey: string;
  remoteModel: string;
  localEndpointBaseUrl: string;
  localEndpointModel: string;
}

const DEFAULT_SETTINGS: MeetingTranscriptionSettings = {
  mode: 'save-only',
  modelId: 'small',
  installedModels: [],
  remoteBaseUrl: 'https://api.openai.com/v1',
  remoteApiKey: '',
  remoteModel: 'whisper-1',
  localEndpointBaseUrl: 'http://127.0.0.1:8080/v1',
  localEndpointModel: 'whisper',
};

export function loadMeetingTranscriptionSettings(): MeetingTranscriptionSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as Partial<MeetingTranscriptionSettings> | null;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      installedModels: Array.isArray(parsed?.installedModels) ? parsed!.installedModels! : DEFAULT_SETTINGS.installedModels,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveMeetingTranscriptionSettings(settings: MeetingTranscriptionSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function isMeetingModelInstalled(modelId: string): boolean {
  return loadMeetingTranscriptionSettings().installedModels.includes(modelId);
}
