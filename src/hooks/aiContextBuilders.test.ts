import { describe, expect, it } from 'vitest';
import { buildAutoContextText, buildContextText } from './aiContextBuilders';
import type { ContextItem } from '../types/chat';

const args = {
  language: 'en' as const,
  tasks: [
    { id: 'open', title: 'Open task', status: 'todo', tags: ['alpha'], project: 'Launch' },
    { id: 'done', title: 'Done task', status: 'done', tags: ['Launch'] },
  ],
  notes: [{ id: 'note-1', title: 'Decision log', body: 'Approved.' }],
  filesMap: { '2026-08-25': '- [ ] Historical task' },
};

describe('AI context builders', () => {
  it('serializes every selectable context type without including completed Today tasks', () => {
    const items: ContextItem[] = [
      { id: 'today', type: 'today-tasks', label: 'Today', data: {} },
      { id: 'date', type: 'date-tasks', label: 'Date', data: { date: '2026-08-25' } },
      { id: 'note', type: 'note', label: 'Note', data: { noteId: 'note-1' } },
      { id: 'project', type: 'project', label: 'Project', data: { projectName: 'Launch' } },
      { id: 'custom', type: 'custom-text', label: 'Brief', data: { text: 'Synthetic context' } },
    ];

    const text = buildContextText(items, args);

    expect(text).toContain("## Today's Tasks\n- Open task [alpha]");
    expect(text).not.toContain('## Today\'s Tasks\n- Done task');
    expect(text).toContain('## Tasks (2026-08-25)\n- [ ] Historical task');
    expect(text).toContain('## Note: Decision log\nApproved.');
    expect(text).toContain('## Project: Launch');
    expect(text).toContain('## Brief\nSynthetic context');
  });

  it('uses localized empty states and focused-context labels', () => {
    const zhArgs = { ...args, language: 'zh' as const, tasks: [] };
    const project: ContextItem = { id: 'p', type: 'project', label: '项目', data: { projectName: '空项目' } };

    expect(buildContextText([project], zhArgs)).toBe('## 项目: 空项目\n（空）');
    expect(buildAutoContextText({ type: 'note', title: '当前', content: '正文' }, zhArgs))
      .toBe('## 当前笔记: 当前\n正文');
  });
});
