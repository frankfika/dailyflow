import { describe, expect, it } from 'vitest';
import { resolveAiUrl } from '../ai';

describe('AI provider URL policy', () => {
  it('allows exact loopback providers such as Ollama', () => {
    expect(resolveAiUrl('http://127.0.0.1:11434/v1'))
      .toBe('http://127.0.0.1:11434/v1/chat/completions');
    expect(resolveAiUrl('http://localhost:1234/v1'))
      .toBe('http://localhost:1234/v1/chat/completions');
  });

  it('continues to block LAN and wildcard internal addresses', () => {
    expect(() => resolveAiUrl('http://192.168.1.20:11434/v1')).toThrow(/internal/i);
    expect(() => resolveAiUrl('http://0.0.0.0:11434/v1')).toThrow(/internal/i);
  });
});
