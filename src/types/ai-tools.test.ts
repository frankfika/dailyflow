import { describe, expect, it } from 'vitest';
import { AVAILABLE_TOOLS, buildToolInstructions, parseToolCalls, requiresConfirmation } from './ai-tools';

describe('AI tool exposure and parsing', () => {
  it('advertises the full CRUD surface (read + write)', () => {
    const names = AVAILABLE_TOOLS.map(tool => tool.name);
    // Read
    expect(names).toEqual(expect.arrayContaining(['list_today_tasks', 'search_tasks', 'search_notes']));
    // Task writes
    expect(names).toEqual(expect.arrayContaining(['create_task', 'update_task', 'complete_task', 'delete_task']));
    // Notes
    expect(names).toEqual(expect.arrayContaining(['create_note', 'delete_note']));
    // Events
    expect(names).toEqual(expect.arrayContaining(['create_event', 'add_task_to_event', 'update_event', 'delete_event']));
  });

  it('gates destructive tools behind confirmation', () => {
    expect(requiresConfirmation('delete_task')).toBe(true);
    expect(requiresConfirmation('delete_note')).toBe(true);
    expect(requiresConfirmation('delete_event')).toBe(true);
    expect(requiresConfirmation('create_task')).toBe(false);
    expect(requiresConfirmation('complete_task')).toBe(false);
  });

  it('includes today\'s date and confirmation rules in the instructions', () => {
    const en = buildToolInstructions('en', '2026-07-28');
    expect(en).toContain('Today is 2026-07-28');
    expect(en).toContain('confirm:true');
    const zh = buildToolInstructions('zh', '2026-07-28');
    expect(zh).toContain('今天是 2026-07-28');
    expect(zh).toContain('confirm:true');
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
