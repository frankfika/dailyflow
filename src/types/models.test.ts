import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getActiveAiConfig,
  loadMeetingTranscriptionModelSettings,
  loadProviderConfigs,
  saveMeetingTranscriptionModelSettings,
  saveProviderConfigs,
  type ProviderConfig,
} from './models';

function provider(id: string, model: string): ProviderConfig {
  return {
    id,
    name: id,
    apiKey: `${id}-key`,
    baseUrl: `https://${id}.example/v1`,
    model,
    createdAt: '2026-08-08T00:00:00.000Z',
    updatedAt: '2026-08-08T00:00:00.000Z',
  };
}

describe('Model Center', () => {
  let storage: Map<string, string>;

  beforeEach(() => {
    storage = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
  });

  it('migrates the two legacy stores into one model center without losing speech settings', () => {
    storage.set('df_provider_configs', JSON.stringify({ configs: [provider('chat', 'chat-model')], activeId: 'chat' }));
    storage.set('df_meeting_transcription_settings', JSON.stringify({ mode: 'remote', remoteModel: 'speech-model' }));

    const center = loadProviderConfigs();

    expect(center.roles).toEqual({ chatProviderId: 'chat', meetingSummaryProviderId: 'chat' });
    expect(center.meetingTranscription).toMatchObject({ mode: 'remote', remoteModel: 'speech-model' });
    expect(storage.has('df_model_center')).toBe(true);
    expect(storage.has('df_provider_configs')).toBe(false);
    expect(storage.has('df_meeting_transcription_settings')).toBe(false);
  });

  it('resolves chat and meeting-summary roles independently', () => {
    saveProviderConfigs({
      configs: [provider('chat', 'chat-model'), provider('summary', 'summary-model')],
      activeId: 'chat',
      roles: { chatProviderId: 'chat', meetingSummaryProviderId: 'summary' },
    });

    expect(getActiveAiConfig('chat')?.model).toBe('chat-model');
    expect(getActiveAiConfig('meetingSummary')?.model).toBe('summary-model');
  });

  it('updates speech settings without overwriting provider role assignments', () => {
    saveProviderConfigs({
      configs: [provider('chat', 'chat-model')],
      activeId: 'chat',
      roles: { chatProviderId: 'chat', meetingSummaryProviderId: 'chat' },
    });
    saveMeetingTranscriptionModelSettings({ mode: 'local-managed', modelId: 'small' });

    expect(loadMeetingTranscriptionModelSettings({ mode: 'save-only', modelId: 'base' })).toEqual({
      mode: 'local-managed',
      modelId: 'small',
    });
    expect(loadProviderConfigs().roles?.chatProviderId).toBe('chat');
  });
});
