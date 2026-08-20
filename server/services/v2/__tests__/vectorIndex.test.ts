/**
 * Vector index (Sprint 1 Gap 8).
 */
import { describe, expect, it } from 'vitest';
import { InMemoryVectorIndex, LazyVectorIndex } from '../vectorIndex.js';

describe('InMemoryVectorIndex', () => {
  it('upsert + query finds the closest match', async () => {
    const idx = new InMemoryVectorIndex();
    await idx.upsert({ id: 'a', entityType: 'note', entityId: 'a', text: 'release roadmap for Q3' });
    await idx.upsert({ id: 'b', entityType: 'note', entityId: 'b', text: 'grocery list for tonight' });
    const hits = await idx.query('roadmap planning', 5);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].item.id).toBe('a');
  });

  it('remove clears an item', async () => {
    const idx = new InMemoryVectorIndex();
    await idx.upsert({ id: 'a', entityType: 'task', entityId: 'a', text: 'unique keyword zorglub' });
    expect((await idx.query('zorglub', 5)).length).toBe(1);
    await idx.remove('a');
    expect((await idx.query('zorglub', 5)).length).toBe(0);
  });

  it('size reflects upserts', async () => {
    const idx = new InMemoryVectorIndex();
    expect(idx.size()).toBe(0);
    await idx.upsert({ id: 'a', entityType: 'note', entityId: 'a', text: 'hello' });
    await idx.upsert({ id: 'b', entityType: 'note', entityId: 'b', text: 'world' });
    expect(idx.size()).toBe(2);
  });

  it('clear wipes everything', async () => {
    const idx = new InMemoryVectorIndex();
    await idx.upsert({ id: 'a', entityType: 'note', entityId: 'a', text: 'foo' });
    await idx.clear();
    expect(idx.size()).toBe(0);
  });

  it('returns empty for stop-word-only query', async () => {
    const idx = new InMemoryVectorIndex();
    await idx.upsert({ id: 'a', entityType: 'note', entityId: 'a', text: 'real content here' });
    const hits = await idx.query('的 了', 5);
    expect(hits).toEqual([]);
  });

  it('handles Chinese tokens via Unicode property escapes', async () => {
    const idx = new InMemoryVectorIndex();
    await idx.upsert({ id: "a", entityType: "note", entityId: "a", text: "路演稿承诺的功能" });
    await idx.upsert({ id: 'b', entityType: 'note', entityId: 'b', text: 'grocery list' });
    const hits = await idx.query('路演', 5);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].item.id).toBe('a');
  });
});

describe('LazyVectorIndex', () => {
  it('emits a single warning when crossing threshold', async () => {
    const idx = new LazyVectorIndex();
    const warnings: string[] = [];
    const origWarn = console.warn;
    console.warn = (msg: string) => warnings.push(msg);
    try {
      // Push past LAZY_THRESHOLD (1000). Add 1005 items.
      for (let i = 0; i < 1005; i++) {
        await idx.upsert({
          id: `item_${i}`,
          entityType: 'note',
          entityId: `item_${i}`,
          text: `document number ${i} with distinct keyword ${i}`,
        });
      }
    } finally {
      console.warn = origWarn;
    }
    const lazyWarnings = warnings.filter((w) => w.includes('[vector-index]'));
    expect(lazyWarnings.length).toBe(1);
  });
});
