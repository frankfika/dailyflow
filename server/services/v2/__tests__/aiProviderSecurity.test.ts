import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildProvider } from '../ai/provider';

const request = {
  systemPrompt: 'system',
  prompt: 'synthetic prompt',
  jsonSchema: {},
};

describe('OpenAI-compatible provider security boundary', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('rejects insecure remote targets before fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const provider = buildProvider({
      provider: 'openai-compatible',
      apiKey: 'secret',
      baseUrl: 'http://example.com/v1',
      model: 'test-model',
    });

    const result = await provider.complete(request);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ fallback: true, fallbackReason: 'network_error' });
    expect(result.text).toBe('Model provider request failed.');
  });

  it('never exposes a provider error body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      'secret prompt and hidden reasoning',
      { status: 500 }
    )));
    const provider = buildProvider({
      provider: 'openai-compatible',
      apiKey: 'secret',
      baseUrl: 'http://127.0.0.1:11434/v1',
      model: 'test-model',
    });

    const result = await provider.complete(request);

    expect(result.text).toBe('Model provider request failed (500).');
    expect(result.text).not.toContain('secret prompt');
  });

  it('fails closed when a successful response exceeds 2 MiB', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('x'.repeat(2 * 1024 * 1024 + 1))));
    const provider = buildProvider({
      provider: 'openai-compatible',
      apiKey: 'secret',
      baseUrl: 'http://localhost:11434/v1',
      model: 'test-model',
    });

    const result = await provider.complete(request);

    expect(result).toMatchObject({
      fallback: true,
      fallbackReason: 'network_error',
      text: 'Model provider request failed.',
    });
  });
});
