import { afterEach, describe, expect, it, vi } from 'vitest';

const { loadConfig } = vi.hoisted(() => ({ loadConfig: vi.fn() }));
vi.mock('../../config.js', () => ({ loadConfig }));

import { loadV2AIConfig } from '../ai/provider';

describe('v2 Model Center provider selection', () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.V2_AI_PROVIDER;
    delete process.env.V2_AI_API_KEY;
    delete process.env.V2_AI_BASE_URL;
    delete process.env.V2_AI_MODEL;
  });

  it('uses the provider assigned to meeting summary instead of the chat default', async () => {
    loadConfig.mockResolvedValue({
      modelCenter: JSON.stringify({
        configs: [
          { id: 'chat', apiKey: 'chat-key', baseUrl: 'https://chat.example/v1', model: 'chat-model' },
          { id: 'summary', apiKey: 'summary-key', baseUrl: 'https://summary.example/v1', model: 'summary-model' },
        ],
        activeId: 'chat',
        roles: { chatProviderId: 'chat', meetingSummaryProviderId: 'summary' },
      }),
    });

    await expect(loadV2AIConfig('meetingSummary')).resolves.toEqual({
      provider: 'openai-compatible',
      apiKey: 'summary-key',
      baseUrl: 'https://summary.example/v1',
      model: 'summary-model',
      format: 'openai',
    });
  });

  it('keeps explicit environment configuration as the headless override', async () => {
    process.env.V2_AI_PROVIDER = 'openai-compatible';
    process.env.V2_AI_API_KEY = 'env-key';
    process.env.V2_AI_BASE_URL = 'https://env.example/v1';
    process.env.V2_AI_MODEL = 'env-model';

    await expect(loadV2AIConfig()).resolves.toMatchObject({
      apiKey: 'env-key',
      baseUrl: 'https://env.example/v1',
      model: 'env-model',
    });
    expect(loadConfig).not.toHaveBeenCalled();
  });
});
