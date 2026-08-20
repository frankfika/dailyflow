/**
 * Vector index (Sprint 1 Gap 8) — basic in-memory TF-IDF + cosine
 * similarity implementation. The interface is shaped to match a
 * future `lancedb`/`sqlite-vss` backend so we can swap without
 * changing callers.
 *
 * Heuristic caps:
 *   - InMemoryVectorIndex holds the entire dictionary in RAM.
 *   - LazyVectorIndex wraps it and emits a structured warning when
 *     size crosses LAZY_THRESHOLD so the user knows to switch to a
 *     real vector backend.
 */

export type VectorEntityType = 'note' | 'task' | 'commitment' | 'mindmap';

export interface VectorIndexItem {
  id: string;
  entityType: VectorEntityType;
  entityId: string;
  text: string;
  vector?: number[];
}

export interface VectorIndexHit {
  item: VectorIndexItem;
  score: number;
}

export interface VectorIndex {
  upsert(item: VectorIndexItem): Promise<void>;
  remove(id: string): Promise<void>;
  query(text: string, topK: number): Promise<VectorIndexHit[]>;
  size(): number;
  clear(): Promise<void>;
  backend(): 'memory';
}

// ---------------------------------------------------------------------------
// In-memory TF-IDF index
// ---------------------------------------------------------------------------

const TOKEN_RE = /[\p{L}\p{N}]+/gu;
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  '的', '了', '是', '在', '我', '你', '他', '她', '它', '们',
  '和', '与', '或', '但', '就', '也', '都', '这', '那', '一个', '一些',
]);

function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const lower = text.toLowerCase();
  for (const m of lower.matchAll(TOKEN_RE)) {
    const t = m[0];
    if (t.length < 2) continue;
    if (STOP_WORDS.has(t)) continue;
    tokens.push(t);
  }
  // Add 2-character CJK bigrams so partial-CJK queries still match.
  // 一-鿿 covers the common CJK Unified Ideographs block.
  const cjk = /[一-鿿]{2,}/g;
  for (const m of lower.matchAll(cjk)) {
    const word = m[0];
    for (let i = 0; i < word.length - 1; i++) {
      tokens.push(word.slice(i, i + 2));
    }
  }
  return tokens;
}

function termFreq(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) {
    tf.set(t, (tf.get(t) ?? 0) + 1);
  }
  return tf;
}

function l2norm(vec: Map<string, number>): number {
  let s = 0;
  for (const v of vec.values()) s += v * v;
  return Math.sqrt(s) || 1;
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  for (const [k, v] of small) {
    const u = large.get(k);
    if (u !== undefined) dot += v * u;
  }
  return dot / (l2norm(a) * l2norm(b));
}

export class InMemoryVectorIndex implements VectorIndex {
  private items = new Map<string, VectorIndexItem>();
  private vectors = new Map<string, Map<string, number>>();

  backend(): 'memory' {
    return 'memory';
  }

  size(): number {
    return this.items.size;
  }

  async upsert(item: VectorIndexItem): Promise<void> {
    const tokens = tokenize(item.text);
    if (tokens.length === 0) {
      this.items.set(item.id, item);
      this.vectors.set(item.id, new Map());
      return;
    }
    const tf = termFreq(tokens);
    this.items.set(item.id, item);
    this.vectors.set(item.id, tf);
  }

  async remove(id: string): Promise<void> {
    this.items.delete(id);
    this.vectors.delete(id);
  }

  async clear(): Promise<void> {
    this.items.clear();
    this.vectors.clear();
  }

  async query(text: string, topK: number): Promise<VectorIndexHit[]> {
    const qTokens = tokenize(text);
    if (qTokens.length === 0) return [];
    const qVec = termFreq(qTokens);
    const hits: VectorIndexHit[] = [];
    for (const [id, vec] of this.vectors) {
      if (vec.size === 0) continue;
      const score = cosine(qVec, vec);
      if (score > 0) {
        const item = this.items.get(id)!;
        hits.push({ item, score });
      }
    }
    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, Math.max(0, topK));
  }
}

// ---------------------------------------------------------------------------
// Lazy wrapper that emits a one-shot warning when the index is "too big"
// ---------------------------------------------------------------------------

const LAZY_THRESHOLD = 1000;

export class LazyVectorIndex implements VectorIndex {
  private inner = new InMemoryVectorIndex();
  private warned = false;

  backend(): 'memory' {
    return 'memory';
  }

  size(): number {
    return this.inner.size();
  }

  async upsert(item: VectorIndexItem): Promise<void> {
    await this.inner.upsert(item);
    this.maybeWarn();
  }

  async remove(id: string): Promise<void> {
    await this.inner.remove(id);
  }

  async clear(): Promise<void> {
    this.warned = false;
    await this.inner.clear();
  }

  async query(text: string, topK: number): Promise<VectorIndexHit[]> {
    return this.inner.query(text, topK);
  }

  private maybeWarn(): void {
    if (this.warned) return;
    if (this.inner.size() > LAZY_THRESHOLD) {
      this.warned = true;
      console.warn(
        `[vector-index] memory index size=${this.inner.size()} > ${LAZY_THRESHOLD}; ` +
        'consider switching to a persistent vector backend (lancedb/sqlite-vss).',
      );
    }
  }
}

// Default instance for the application to import.
export const defaultVectorIndex: VectorIndex = new LazyVectorIndex();
