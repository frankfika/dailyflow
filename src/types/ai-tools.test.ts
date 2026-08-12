import { describe, expect, it } from 'vitest';
import { AVAILABLE_TOOLS, parseToolCalls } from './ai-tools';

describe('AI tool exposure and parsing', () => {
  it('does not advertise write tools without a visible review flow', () => {
    expect(AVAILABLE_TOOLS.map(tool => tool.name)).toEqual(['search_tasks']);
  });

  it('preserves malformed tool markup instead of silently blanking the reply', () => {
    const malformed = '<tool_call>{not json}</tool_call>';
    expect(parseToolCalls(malformed)).toEqual({ text: malformed, calls: [] });
  });

  it('extracts valid tool calls', () => {
    expect(parseToolCalls('Found it <tool_call>{"name":"search_tasks","arguments":{"query":"x"}}</tool_call>')).toEqual({
      text: 'Found it',
      calls: [{ name: 'search_tasks', arguments: { query: 'x' } }],
    });
  });
});
