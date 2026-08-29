import { describe, expect, it } from 'vitest';
import { getFriendlyAiErrorMessage } from './aiErrorMessage';

describe('getFriendlyAiErrorMessage', () => {
  it.each([
    ['fetch failed', 'Network connection failed'],
    ['HTTP 401 unauthorized', 'API Key is invalid'],
    ['HTTP 429 rate limit', 'rate limit exceeded'],
    ['model does not exist', 'Model ID not found'],
    ['request timed out', 'Request timed out'],
  ])('maps %s to actionable English guidance', (raw, expected) => {
    expect(getFriendlyAiErrorMessage(raw, 'en', 'MiniMax')).toContain(expected);
  });

  it('keeps the provider and raw detail in the generic Chinese fallback', () => {
    expect(getFriendlyAiErrorMessage('unexpected shape', 'zh', 'MiniMax'))
      .toContain('调用 MiniMax 时出错：\nunexpected shape');
  });
});
