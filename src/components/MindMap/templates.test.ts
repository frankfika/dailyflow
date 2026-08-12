import { describe, expect, it } from 'vitest';
import { MINDMAP_TEMPLATES, getTemplate } from './templates';

describe('MINDMAP_TEMPLATES', () => {
  it('exposes 4 built-in templates', () => {
    expect(MINDMAP_TEMPLATES.length).toBe(4);
  });

  it('each template has a unique id and non-empty title/hint', () => {
    const ids = new Set<string>();
    for (const t of MINDMAP_TEMPLATES) {
      expect(t.id).toBeTruthy();
      expect(t.title).toBeTruthy();
      expect(t.titleEn).toBeTruthy();
      expect(t.hint).toBeTruthy();
      expect(t.hintEn).toBeTruthy();
      expect(ids.has(t.id)).toBe(false);
      ids.add(t.id);
    }
  });

  it('builds localized English template content', () => {
    const map = getTemplate('decision-tree')!.build('en');
    expect(map.title).toBe('Decision Tree');
    expect(map.nodes.some(node => node.text === 'Option A')).toBe(true);
  });

  it('getTemplate returns the right template or undefined', () => {
    expect(getTemplate('swot')?.title).toBe('SWOT 分析');
    expect(getTemplate('nope')).toBeUndefined();
  });

  it('built maps are well-formed: every edge points at an existing node, root exists', () => {
    for (const t of MINDMAP_TEMPLATES) {
      const map = t.build();
      const ids = new Set(map.nodes.map((n) => n.id));
      expect(ids.has(map.rootId)).toBe(true);
      for (const e of map.edges) {
        expect(ids.has(e.source)).toBe(true);
        expect(ids.has(e.target)).toBe(true);
      }
      // No duplicate ids.
      expect(ids.size).toBe(map.nodes.length);
    }
  });

  it('built maps have at least one branch beyond the root', () => {
    for (const t of MINDMAP_TEMPLATES) {
      const map = t.build();
      const nonRoot = map.nodes.length - 1;
      expect(nonRoot).toBeGreaterThan(0);
    }
  });
});
