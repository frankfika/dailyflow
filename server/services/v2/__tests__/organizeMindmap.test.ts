/**
 * AI organize mindmap (Sprint 1 Gap 2).
 */
import { describe, expect, it } from 'vitest';
import {
  organizeMindmap,
  type OrganizeInput,
  type OrganizeNode,
} from '../organizeMindmap.js';

const nodes: OrganizeNode[] = [
  { id: 'root', text: 'Project', kind: 'root' },
  { id: 'n1', text: 'write doc', kind: 'task', status: 'in-progress', tags: ['2026-08-25'] },
  { id: 'n2', text: 'why so late', kind: 'question', status: 'todo' },
  { id: 'n3', text: 'competitor doc', kind: 'resource', status: 'todo', tags: ['2026-08-30'] },
  { id: 'n4', text: 'data loss risk', kind: 'risk', status: 'in-progress' },
  { id: 'n5', text: 'misc idea', kind: 'branch', status: 'todo' },
];

function input(strategy: 'by_topic' | 'by_priority' | 'by_time'): OrganizeInput {
  return { mindmapId: 'm1', strategy, nodes, edges: [] };
}

describe('organizeMindmap', () => {
  it('by_topic groups by kind', () => {
    const r = organizeMindmap(null as never, input('by_topic'));
    const byText = Object.fromEntries(r.groups.map((g) => [g.parentText, g.nodeIds]));
    expect(byText['任务']).toEqual(['n1']);
    expect(byText['疑问']).toEqual(['n2']);
    expect(byText['资料']).toEqual(['n3']);
    expect(byText['风险']).toEqual(['n4']);
    expect(byText['其他想法']).toEqual(['n5']);
    expect(r.rationale).toContain('按主题分类');
  });

  it('by_priority groups by status (in-progress first)', () => {
    const r = organizeMindmap(null as never, input('by_priority'));
    expect(r.groups[0].parentText).toBe('进行中');
    expect(r.groups[0].nodeIds.sort()).toEqual(['n1', 'n4']);
    expect(r.groups[1].parentText).toBe('待开始');
    expect(r.groups[1].nodeIds.sort()).toEqual(['n2', 'n3', 'n5']);
    // 'done' bucket is empty => not in groups
    expect(r.groups.find((g) => g.parentText === '已完成')).toBeUndefined();
  });

  it('by_time groups by date-like tags and puts ungrouped under 无日期', () => {
    const r = organizeMindmap(null as never, input('by_time'));
    const byText = Object.fromEntries(r.groups.map((g) => [g.parentText, g.nodeIds]));
    expect(byText['📅 2026-08-25']).toEqual(['n1']);
    expect(byText['📅 2026-08-30']).toEqual(['n3']);
    expect(byText['无日期'].sort()).toEqual(['n2', 'n4', 'n5']);
  });

  it('returns empty groups for empty input', () => {
    const r = organizeMindmap(null as never, {
      mindmapId: 'm1', strategy: 'by_topic',
      nodes: [{ id: 'root', text: 'r', kind: 'root' }],
      edges: [],
    });
    expect(r.groups).toEqual([]);
  });

  it('always emits one suggested edge per group → root', () => {
    const r = organizeMindmap(null as never, input('by_topic'));
    // 5 non-root groups (task/question/resource/risk/branch), one root
    expect(r.suggestedEdges.length).toBe(r.groups.length);
  });
});
