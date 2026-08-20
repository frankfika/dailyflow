# AI 整理脑图节点（Mind-map "AI organize"）

> Sprint 1 缺口 2 · Slide 04 第 2 步"AI 帮你把零散节点整理成结构"

本期落地一个**确定性本地分类**的版本（不调真实 AI），目的是先把
产品流程跑通：用户在脑图工具栏里点 "AI 整理" → 选策略 → 看推荐 →
确认才落盘。下一期在标注好的 hook 上接入 LLM planner，**对外接口和
UX 不变**。

---

## 1. 三个 fallback 策略

| 策略 | 行为 | 适合场景 |
|---|---|---|
| `by_topic` | 按 `kind` 分组：task / question / resource / risk / branch / tag 各成一组。语义类型（question / resource / risk）保留视觉标签。 | 节点类型混在一起，需要先按"是什么"分门别类 |
| `by_priority` | 按 `status` 分组：in-progress / todo / done。`status` 缺失时默认 `todo`。 | 节点堆积，需要按"现在推进什么"分清优先级 |
| `by_time` | 按节点 `tags` 里的时间字符串（`YYYY-MM-DD` / `YYYY-MM-DD` / `YYYY-MM` / `YYYY-W32` / 月份名 `Sep` 等）聚合。无时间标签的节点归入"❔ 未分配时间"桶。 | 节点已经被打上日期 / 截止时间，想按时间线整理 |

每个策略只挑"零散节点"（即没有任何入边的非根节点）参与分组——已经挂在
某个父节点下的节点保持原位，不会被二次搬运。

---

## 2. 端到端流程

```
[Toolbar: AI 整理 ▼]
        │
        ▼
[策略下拉: by_topic / by_priority / by_time]
        │
        ▼ runOrganize(strategy)
POST /api/v2/mindmaps/:id/organize
        │
        ▼ OrganizeSuggestion（groups + rationale + stats）
[OrganizeSuggestionModal]
  ├─ 头部：策略徽章 + 关闭
  ├─ 理由（rationale）
  ├─ 统计：分组数 / 已覆盖节点 / 未分组节点
  ├─ 建议分组列表（每组：parentText + parentKind + nodeIds + per-group 理由）
  └─ 底部：[拒绝] [应用]
              │
              ▼ applyOrganizeSuggestion
  1. 为每个 group 创建 parent branch 节点（kind 跟随 group.parentKind）
  2. 加边 root → parent 和 parent → group.nodeIds
  3. 走 handleChange → 自动进入撤销历史（一条 undo 记录）
```

**不落盘的承诺**：`POST /api/v2/mindmaps/:id/organize` 只读脑图快照
+ 返回建议；服务端**从不写文件**。所有持久化都由用户在 modal 里点
"应用"后经 `PUT /api/mindmaps/:id`（`mindmapsApi.update`）触发。

---

## 3. 服务端 API

```
POST /api/v2/mindmaps/:id/organize
Body  : {
          strategy: "by_topic" | "by_priority" | "by_time",
          nodes:   [{ id, text, kind?, status?, tags? }, …],
          edges:   [{ id, source, target }, …]
        }
200   : { suggestion: OrganizeSuggestion }
4xx   : { error: { code, message, issues? } }  // Zod 校验 / not_found
```

`OrganizeSuggestion` 形状：

```ts
{
  strategy: OrganizeStrategy;
  rationale: string;          // 策略级别的人类可读理由
  groups: Array<{
    parentText: string;
    parentKind: 'branch' | 'question' | 'resource' | 'risk' | 'tag';
    nodeIds: string[];
  }>;
  suggestedEdges: Array<{ source: string; target: string }>;  // 本期恒为空
  groupRationale: Record<string, string>;  // 每个 parentText 一行理由
  stats: {
    looseNodes: number;
    organizedNodes: number;
    groupCount: number;
  };
}
```

---

## 4. 客户端流程（`MindMapView.tsx`）

新增的 state：

```ts
const [organizeOpen, setOrganizeOpen]               = useState(false);
const [organizeStrategy, setOrganizeStrategy]       = useState<OrganizeStrategy | null>(null);
const [organizeSuggestion, setOrganizeSuggestion]   = useState<OrganizeSuggestion | null>(null);
const [organizeLoading, setOrganizeLoading]         = useState(false);
const [organizeDropdownOpen, setOrganizeDropdownOpen] = useState(false);
const [organizeError, setOrganizeError]             = useState<string | null>(null);
```

工具栏新增按钮（位置：`mindmap-redo` 与 `mindmap-search-open` 之间）：

- 触发器：`data-testid="mindmap-organize-trigger"` — 标题 `AI 整理` + 下拉箭头
- 下拉：`data-testid="mindmap-organize-menu"`，3 个 `menuitem`：
  - `mindmap-organize-option-by_topic`
  - `mindmap-organize-option-by_priority`
  - `mindmap-organize-option-by_time`
- 错误条：`data-testid="mindmap-organize-error"`

应用逻辑（`applyOrganizeSuggestion`）：

1. 对每个 group 用 `ulid()` 生成 `parentId`
2. 用 `nextChildPosition({...map, nodes: [...current, ...newNodes]}, rootId)` 算出 parent 的位置（保证不与既有 root 子节点重叠）
3. 写新 parent 节点 + 边 `root → parent` + 边 `parent → looseNode`
4. 调 `handleChange({ nodes, edges })`，自动进入 undo 历史

---

## 5. 未来接 AI 的 hook 位置

**`server/services/v2/agentService.ts → organizeMindmap()`**

```ts
export function organizeMindmap(
  _repo: V2Repository | null,   // ← AI 计划器可以在这里写 planner run / audit
  input: OrganizeInput,
): OrganizeSuggestion { ... }
```

- 当前实现是同步纯函数，没有任何 I/O
- 接入 LLM 时建议在 `STRATEGY_PLANNERS` 之前判断：
  ```ts
  if (config.aiProvider === 'remote-llm') {
    return await callLlmPlanner(input, config.model);  // 同样的输出形状
  }
  ```
- 三个 planner 函数（`planByTopic` / `planByPriority` / `planByTime`）保留为 fallback，
  保证 LLM 不可用时仍有建议
- `OrganizeInputSchema` / `OrganizeSuggestion` 接口冻结 —— 前端 modal
  和 route 都基于它，不破坏契约

---

## 6. 测试覆盖

| 文件 | 用例 |
|---|---|
| `server/services/v2/__tests__/agentService.organize.test.ts` | 6 tests · by_topic / by_priority / by_time / 空输入 / purity / Zod 校验 |
| `src/components/MindMap/OrganizeSuggestionModal.test.tsx` | 6 tests · 渲染 / stats / 应用 / 拒绝 / 关闭态 / 空建议 |

```
$ npx vitest run server/services/v2/__tests__/agentService.organize.test.ts \
                src/components/MindMap/OrganizeSuggestionModal.test.tsx
 Test Files  2 passed (2)
      Tests  12 passed (12)
```

---

## 7. 相关文件

| 角色 | 路径 |
|---|---|
| 纯函数 planner | `server/services/v2/agentService.ts` (`organizeMindmap`) |
| 路由 | `server/routes/v2/index.ts` (`POST /api/v2/mindmaps/:id/organize`) |
| API 客户端 | `src/api/client.ts` (`organizeApi.organize`) |
| 模态框 | `src/components/MindMap/OrganizeSuggestionModal.tsx` |
| 工具栏集成 | `src/components/MindMap/MindMapView.tsx` |
| 单元测试 | `server/services/v2/__tests__/agentService.organize.test.ts`<br>`src/components/MindMap/OrganizeSuggestionModal.test.tsx` |
| 文档 | `docs/MINDMAP_AI_ORGANIZE.md`（本文） |

---

## 8. 限制与已知 trade-offs

1. **不接管语义冲突**：如果一个 loose node 同时匹配多个 group（比如 kind: 'task' 且 status: 'in-progress'），`by_topic` 优先。本期不做 LLM 仲裁。
2. **`suggestedEdges` 字段保留**但恒为空：未来 AI 计划器可以基于内容相似度建议"跨组连接"。
3. **position 计算走 `nextChildPosition`**：保证新 parent 紧挨已有 root 子节点；用户后续拖拽后由 `MindMapCanvas` 自动 layout 接管。
4. **没有针对 v1 旧脑图特殊处理**：v1 节点没有 `kind` 字段，被 `by_topic` 的兜底 `'branch' | undefined` 规则接收，与 SPEC §2.2 一致。
