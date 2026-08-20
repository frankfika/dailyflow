/**
 * Tests for organizeMindmap (Sprint 1 / Gap 2 — AI organize mindmap).
 *
 * Coverage required by the spec:
 *   1. by_topic: groups loose nodes by kind, preserves semantic kinds.
 *   2. by_priority: groups loose nodes by status, status defaults to todo.
 *   3. by_time: groups by detected time tag, falls back to an unassigned
 *      bucket when no time tag is found.
 *   4. never persists: the planner is pure, called with `_repo: null`.
 *
 * Edge cases worth pinning:
 *   - v1 nodes without `kind` are treated as 'branch' under by_topic.
 *   - nodes that already have a parent edge are NOT loose (not reorganized).
 *   - stats.organizedNodes equals sum of group.nodeIds lengths.
 */
import { describe, expect, it } from 'vitest';
import {
  organizeMindmap,
  type OrganizeInput,
} from '../agentService.js';

const ROOT_ID = 'mm-root';
const SIBLING_ID = 'mm-sibling';

function makeInput(overrides: Partial<OrganizeInput> = {}): OrganizeInput {
  return {
    mindmapId: 'mm-1',
    strategy: 'by_topic',
    nodes: [
      { id: ROOT_ID, text: '中心', kind: 'root' },
      { id: SIBLING_ID, text: '已存在的子节点', kind: 'branch' },
    ],
    edges: [
      // SIBLING_ID has an incoming edge, so it's NOT loose.
      { id: 'edge-root-sibling', source: ROOT_ID, target: SIBLING_ID },
    ],
    ...overrides,
  };
}

describe('organizeMindmap — by_topic', () => {
  it('groups loose nodes by kind, skips nodes that already have a parent', () => {
    const input = makeInput({
      strategy: 'by_topic',
      nodes: [
        { id: ROOT_ID, text: '中心', kind: 'root' },
        { id: 'n-task', text: '发布 v2', kind: 'task' },
        { id: 'n-q', text: '什么时候发布?', kind: 'question' },
        { id: 'n-r', text: '设计稿', kind: 'resource' },
        { id: 'n-risk', text: '法务问题', kind: 'risk' },
        { id: 'n-branch', text: '零散想法', kind: 'branch' },
        { id: 'n-legacy', text: 'v1 节点' /* kind: undefined */ },
        // SIBLING_ID has a parent (root), so it must be skipped.
        { id: SIBLING_ID, text: '已挂载', kind: 'branch' },
      ],
      edges: [{ id: 'edge-1', source: ROOT_ID, target: SIBLING_ID }],
    });

    const suggestion = organizeMindmap(null, input);

    expect(suggestion.strategy).toBe('by_topic');
    // 6 loose nodes, 6 organized, 5 groups (Task / Question / Resource / Risk / Branches).
    expect(suggestion.stats.looseNodes).toBe(6);
    expect(suggestion.stats.organizedNodes).toBe(6);
    expect(suggestion.stats.groupCount).toBe(5);
    // No group should contain SIBLING_ID — it's not loose.
    for (const group of suggestion.groups) {
      expect(group.nodeIds).not.toContain(SIBLING_ID);
    }
    const byText = Object.fromEntries(suggestion.groups.map((g) => [g.parentText, g]));
    expect(byText['📌 Tasks']?.nodeIds).toEqual(['n-task']);
    expect(byText['❓ Questions']?.nodeIds).toEqual(['n-q']);
    expect(byText['📚 Resources']?.nodeIds).toEqual(['n-r']);
    expect(byText['⚠️ Risks']?.nodeIds).toEqual(['n-risk']);
    // v1 legacy + branch share the '🌿 Branches' bucket.
    expect(byText['🌿 Branches']?.nodeIds).toEqual(['n-branch', 'n-legacy']);
    expect(byText['🌿 Branches']?.parentKind).toBe('branch');
    // Suggested cross-edges stay empty for the fallback strategies.
    expect(suggestion.suggestedEdges).toEqual([]);
    expect(suggestion.rationale.length).toBeGreaterThan(0);
    expect(suggestion.groupRationale['📌 Tasks']).toMatch(/Task/);
  });

  it('returns an empty suggestion when there are no loose nodes', () => {
    const input = makeInput({ strategy: 'by_topic' });
    const suggestion = organizeMindmap(null, input);
    expect(suggestion.groups).toEqual([]);
    expect(suggestion.stats.organizedNodes).toBe(0);
    expect(suggestion.stats.groupCount).toBe(0);
  });
});

describe('organizeMindmap — by_priority', () => {
  it('groups loose nodes by status, defaults missing status to todo', () => {
    const input = makeInput({
      strategy: 'by_priority',
      nodes: [
        { id: ROOT_ID, text: '中心', kind: 'root' },
        { id: 'a', text: 'A', status: 'in-progress' },
        { id: 'b', text: 'B', status: 'in-progress' },
        { id: 'c', text: 'C', status: 'todo' },
        { id: 'd', text: 'D', status: 'done' },
        { id: 'e', text: 'E' /* status: undefined — defaults to todo */ },
        // SIBLING_ID has a parent → skipped.
        { id: SIBLING_ID, text: '挂载', status: 'in-progress' },
      ],
      edges: [{ id: 'edge-1', source: ROOT_ID, target: SIBLING_ID }],
    });

    const suggestion = organizeMindmap(null, input);
    expect(suggestion.stats.looseNodes).toBe(5);
    expect(suggestion.stats.organizedNodes).toBe(5);

    const byText = Object.fromEntries(suggestion.groups.map((g) => [g.parentText, g]));
    expect(byText['🟡 状态 · 进行中']?.nodeIds).toEqual(['a', 'b']);
    // 'todo' bucket should hold both explicit-todo + the undefined-status node.
    expect(byText['⚪ 状态 · 待办']?.nodeIds).toEqual(['c', 'e']);
    expect(byText['✅ 状态 · 已完成']?.nodeIds).toEqual(['d']);
    // Status groups always default to kind 'branch' (no semantic color).
    for (const group of suggestion.groups) {
      expect(group.parentKind).toBe('branch');
    }
  });
});

describe('organizeMindmap — by_time', () => {
  it('groups loose nodes by detected time tag and puts tag-less nodes in an unassigned bucket', () => {
    const input = makeInput({
      strategy: 'by_time',
      nodes: [
        { id: ROOT_ID, text: '中心', kind: 'root' },
        { id: 'iso', text: 'ISO 日期', tags: ['2026-08-20'] },
        { id: 'iso2', text: '另一个 ISO', tags: ['2026-08-15'] },
        { id: 'month', text: '月份', tags: ['#2026-09'] },
        { id: 'month-en', text: '月份英文', tags: ['Sep'] },
        { id: 'week', text: 'ISO 周', tags: ['2026-W32'] },
        { id: 'mixed', text: '混合', tags: ['#random', '2026-08-25'] },
        { id: 'plain', text: '没有时间标签' },
        { id: 'untagged', text: '完全没标签', tags: [] },
        // SIBLING_ID has a parent → skipped.
        { id: SIBLING_ID, text: '挂载', tags: ['2026-08-20'] },
      ],
      edges: [{ id: 'edge-1', source: ROOT_ID, target: SIBLING_ID }],
    });

    const suggestion = organizeMindmap(null, input);
    expect(suggestion.stats.looseNodes).toBe(8);
    expect(suggestion.stats.organizedNodes).toBe(8);

    const byText = Object.fromEntries(suggestion.groups.map((g) => [g.parentText, g]));
    expect(byText['📅 2026-08-15']?.nodeIds).toEqual(['iso2']);
    expect(byText['📅 2026-08-20']?.nodeIds).toEqual(['iso']);
    expect(byText['📅 2026-08-25']?.nodeIds).toEqual(['mixed']);
    expect(byText['📅 2026-09']?.nodeIds).toEqual(['month']);
    expect(byText['📅 Sep']?.nodeIds).toEqual(['month-en']);
    expect(byText['📅 2026-W32']?.nodeIds).toEqual(['week']);
    // Both 'plain' (no tags array — undefined) and 'untagged' (empty tags)
    // share the unassigned bucket.
    expect(byText['❔ 未分配时间']?.nodeIds).toEqual(['plain', 'untagged']);
  });
});

describe('organizeMindmap — purity', () => {
  it('never touches the repository argument (read-only by contract)', () => {
    let touched = false;
    const fakeRepo = new Proxy({}, {
      get() {
        touched = true;
        throw new Error('repo must not be read by organizeMindmap');
      },
    }) as any;
    const input = makeInput({ strategy: 'by_topic' });
    organizeMindmap(fakeRepo, input);
    expect(touched).toBe(false);
  });

  it('rejects invalid input via Zod (missing mindmapId / unknown strategy)', () => {
    const badStrategy = makeInput({ strategy: 'by_chocolate' as any });
    expect(() => organizeMindmap(null, badStrategy)).toThrow();

    const missingId = makeInput();
    (missingId as any).mindmapId = '';
    expect(() => organizeMindmap(null, missingId)).toThrow();
  });
});
