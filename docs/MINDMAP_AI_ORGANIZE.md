# AI 整理脑图节点

> Sprint 1 缺口 2 · Slide 04 第 2 步"AI 整理零散节点成结构"

## 3 个 fallback 策略

本期**不调 AI 模型**，使用确定性本地分类：

| 策略 | 行为 | 适合场景 |
|---|---|---|
| `by_topic` | 按 `kind` 分组：task / question / resource / risk / branch / tag 各一组 | 节点类型混在一起时 |
| `by_priority` | 按 `status` 分组：in-progress / todo / done | 节点堆积，需要分清执行优先级时 |
| `by_time` | 按 `tags` 里的日期字符串（YYYY-MM-DD）分组 | 节点带时间标签，需要按 deadline 排序时 |

## 行为

- 永远给"撤销"按钮（用户拒绝 → 没有任何变化）
- 不直接落盘 — 仅返回 OrganizeSuggestion
- 用户点"应用"才会写入脑图

## 未来接 AI 的 hook 位置

`server/services/v2/organizeMindmap.ts` 的 `organizeMindmap()` 函数。当前是纯函数（无副作用），未来可以在内部加：

```ts
// 未来钩子
if (config.aiProvider && config.aiProvider !== 'local-deterministic') {
  return await callLlmOrganizer(input, config.aiProvider);
}
return localFallback(input.strategy, input.nodes);
```

3 个 strategy 函数（`groupByTopic` / `groupByPriority` / `groupByTime`）本身是 pure 的，可以直接当 fallback。

## API

```
POST /api/v2/mindmaps/:id/organize
Body: { "strategy": "by_topic" | "by_priority" | "by_time" }
Response: OrganizeSuggestion { groups, suggestedEdges, rationale }
```

## 相关文件

- `server/services/v2/organizeMindmap.ts`
- `server/services/v2/__tests__/organizeMindmap.test.ts`（5 tests）
- `src/components/MindMap/OrganizeSuggestionModal.tsx`
- `src/components/MindMap/OrganizeSuggestionModal.test.tsx`（5 tests）
- `src/api/client.ts` — `organizeApi.organize()`
- `server/routes/v2/index.ts` — `/v2/mindmaps/:id/organize` 路由
