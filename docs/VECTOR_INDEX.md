# 向量索引（Vector Index）

> Sprint 1 缺口 8 · 商业模式配套 — 规模变大后的可选加速

## 现状

本期实现**内存版 TF-IDF + 余弦相似度**：

- 文件：`server/services/v2/vectorIndex.ts`
- 类：`InMemoryVectorIndex`（基础实现）、`LazyVectorIndex`（带阈值警告包装）
- 默认实例：`defaultVectorIndex`

## 接口设计（lancedb-ready）

```ts
interface VectorIndex {
  upsert(item: VectorIndexItem): Promise<void>;
  remove(id: string): Promise<void>;
  query(text: string, topK: number): Promise<VectorIndexHit[]>;
  size(): number;
  clear(): Promise<void>;
  backend(): 'memory'; // 未来加 'lancedb' | 'sqlite-vss'
}
```

未来接入 lancedb 时：
1. 新增 `LancedbVectorIndex` 实现同一接口
2. 工厂函数 `getVectorIndex()` 根据 `config.vectorBackend` 决定
3. 调用方不变

## 性能

- 1000 entity：< 50ms 查询
- 超过 1000：自动打 `console.warn` 提示升级

## API

- `GET /api/v2/vector/status` — `{ size, backend, indexable }`
- `POST /api/v2/vector/rebuild` — 重建（当前是 no-op）
- `POST /api/v2/vector/query` body: `{ text, topK }`

## 客户端

```ts
import { vectorApi } from './api/client';
const { size, backend } = await vectorApi.status();
const hits = await vectorApi.query('路演稿', 5);
```

## 已知限制

- **不持久化**：重启进程后索引清空（需要调用方在 upsert 时重新喂）
- **不支持英文停用词以外的复杂 NLP**
- **中文用 2-gram 切词**：精确度低于 jieba，但零依赖

## 升级路线

| 版本 | 后端 | 触发条件 |
|---|---|---|
| 内存版（现在）| TF-IDF | < 5000 entity |
| LanceDB | 嵌入向量 | ≥ 5000 entity |
| 云端 | pgvector / Pinecone | 多设备同步 + 隐私可放开时 |

## 升级路径

```ts
// 未来在 server/services/v2/vectorIndex.ts 增加：
export class LancedbVectorIndex implements VectorIndex { /* ... */ }

export function createVectorIndex(config: { backend: 'memory' | 'lancedb' }): VectorIndex {
  if (config.backend === 'lancedb') return new LancedbVectorIndex();
  return new LazyVectorIndex();
}
```

## 测试

- `server/services/v2/__tests__/vectorIndex.test.ts` — 7 tests
- 覆盖：upsert / remove / size / clear / 中文 bigram / 阈值警告
