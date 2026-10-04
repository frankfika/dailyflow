import { describe, expect, it } from 'vitest';
import { classifyAiError, getFriendlyAiErrorMessage } from './aiErrorMessage';

describe('getFriendlyAiErrorMessage', () => {
  it.each([
    ['fetch failed', 'Network connection failed'],
    ['Failed to fetch', 'Network connection failed'],
    ['HTTP 401 unauthorized', 'API Key is invalid'],
    ['HTTP 429 rate limit', 'rate limit exceeded'],
    ['request timed out', 'Request timed out'],
  ])('maps %s to actionable English guidance', (raw, expected) => {
    expect(getFriendlyAiErrorMessage(raw, 'en', 'MiniMax')).toContain(expected);
  });

  it('maps a sanitized 404 (status or text) to Model ID / Base URL guidance (C6)', () => {
    const withStatus = getFriendlyAiErrorMessage('Upstream AI error (404)', 'en', 'MiniMax', 404);
    expect(withStatus).toContain('Model ID or Base URL is wrong');
    expect(withStatus).toContain('/v1');

    const fromText = getFriendlyAiErrorMessage('Upstream AI error (404)', 'zh', 'MiniMax');
    expect(fromText).toContain('模型 ID 或 Base URL 错误');
    expect(fromText).toContain('/v1');
  });

  it('maps the model-not-found wording without a status code', () => {
    expect(getFriendlyAiErrorMessage('model does not exist', 'en', 'MiniMax'))
      .toContain('Model ID or Base URL is wrong');
  });

  it('uses the upstream status carried by httpError even without keywords', () => {
    expect(getFriendlyAiErrorMessage('Upstream AI error (401)', 'en', 'MiniMax', 401))
      .toContain('API Key is invalid');
    expect(getFriendlyAiErrorMessage('Upstream AI error (429)', 'en', 'MiniMax', 429))
      .toContain('rate limit');
  });

  it('classifies browser and node network failures identically', () => {
    expect(classifyAiError('TypeError: Failed to fetch').category).toBe('network');
    expect(classifyAiError('fetch failed').category).toBe('network');
    expect(classifyAiError('getaddrinfo ENOTFOUND api.example.com').category).toBe('network');
  });

  it('covers the contract-3 category vocabulary', () => {
    expect(classifyAiError('x', 401).category).toBe('auth');
    expect(classifyAiError('x', 404).category).toBe('not_found');
    expect(classifyAiError('x', 429).category).toBe('rate_limit');
    expect(classifyAiError('Invalid AI request', 400).category).toBe('bad_request');
    expect(classifyAiError('something odd', 500).category).toBe('unknown');
  });

  it('keeps the provider and raw detail in the generic Chinese fallback', () => {
    expect(getFriendlyAiErrorMessage('unexpected shape', 'zh', 'MiniMax'))
      .toContain('调用 MiniMax 时出错：\nunexpected shape');
  });
});
