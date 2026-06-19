import { describe, it, expect } from 'vitest';
import { buildWorkspaceContext, extractTaskTitles } from './ThinkingWorkspaces';
import type { ThinkingWorkspaceData } from '../api/client';

function makeWorkspace(partial: Partial<ThinkingWorkspaceData> = {}): ThinkingWorkspaceData {
  return {
    id: 'tw_test',
    title: 'Test Workspace',
    kind: 'workspace',
    status: 'active',
    intent: '',
    scratchpad: '',
    brief: '',
    journey: '',
    tasksMarkdown: '',
    mindmapMarkdown: '',
    timeline: [],
    taskIds: [],
    linkedNoteIds: [],
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...partial,
  };
}

describe('buildWorkspaceContext', () => {
  it('includes title and status', () => {
    const ws = makeWorkspace({ title: 'Plan Launch' });
    const ctx = buildWorkspaceContext(ws);
    expect(ctx).toContain('# Plan Launch');
    expect(ctx).toContain('Status: active');
  });

  it('includes non-empty sections', () => {
    const ws = makeWorkspace({
      intent: 'Grow to 1k users',
      brief: 'Goal: launch.',
      journey: 'Phase 1: build.',
      tasksMarkdown: '- [ ] task one',
    });
    const ctx = buildWorkspaceContext(ws);
    expect(ctx).toContain('## Intent\nGrow to 1k users');
    expect(ctx).toContain('## Brief\nGoal: launch.');
    expect(ctx).toContain('## Journey\nPhase 1: build.');
    expect(ctx).toContain('## Existing Tasks\n- [ ] task one');
  });

  it('omits empty sections', () => {
    const ws = makeWorkspace({ intent: 'Only intent' });
    const ctx = buildWorkspaceContext(ws);
    expect(ctx).not.toContain('## Brief');
    expect(ctx).not.toContain('## Journey');
    expect(ctx).not.toContain('## Existing Tasks');
  });
});

describe('extractTaskTitles', () => {
  it('extracts checkbox titles', () => {
    const md = '- [ ] Buy milk\n- [x] Done task\n* [ ] Star task\nplain line';
    expect(extractTaskTitles(md)).toEqual(['Buy milk', 'Done task', 'Star task']);
  });

  it('strips block references', () => {
    const md = '- [ ] Task with ref ^abc123';
    expect(extractTaskTitles(md)).toEqual(['Task with ref']);
  });

  it('returns empty array when no checkboxes', () => {
    expect(extractTaskTitles('no tasks here')).toEqual([]);
  });
});
