# AI Event Operator — 垂直切片 (vertical slice) 状态

Branch: `claude/beautiful-goldstine-8a684f`。
状态：**全栈可见切片已完成并通过测试**（113 文件 / 881 用例，lint/build 绿）。
本文件是给接手的 AI 的交接记录，不是规范。

## 这一轮交付了什么（用户能用的东西）

一个真实可点的 "AI 推进" 流程，端到端跑通 **Run → 生成建议 → 审阅 → 接受 → 生成真实承诺 + 更新画布**：

- **入口**：打开任意 Event，右上角出现绿色 **「AI 推进」** 按钮
  ([EventCanvas 详情头](src/features/v2/events/EventsView.tsx))。
- **面板**：[AgentRunPanel.tsx](src/features/v2/events/AgentRunPanel.tsx) —
  无待审建议时给「开始 AI 拆解」按钮；有建议时逐条列卡片（节点文案、类型、实体、置信度、理由），
  可勾选部分接受，底部「接受并生成 / 拒绝」。诚实标注：**「模板模式 · 尚未接入真实模型」**。
- **确认前零写入**：所有改动先落成 pending `EventGraphProposal`，用户接受后由服务端原子 Apply。
- **接受后真实落数据**：经既有 `proposalService.applyProposal` 创建**真的 Commitment**（进 Today / Commitments），
  并把节点写回 v1 事件导图、挂上 entityRef + AI provenance。

## 新增/修改文件

服务器侧（核心，带测试）：
- `server/domain/v2/eventOperator.ts` — 域模型（Run / GraphOp / EventGraphProposal / Scope）。
- `server/domain/v2/eventGraphValidator.ts` — baseRevision(stableHash FNV-1a) / 图校验。
- `server/domain/v2/eventGraphApplier.ts` — `buildGraphApplyPlan`（纯函数，stale 检测）。
- `server/domain/v2/eventRuntimeState.ts` — Run 状态机（补了 `waiting_review→succeeded` 拒绝后收尾）。
- `server/domain/v2/ulid.ts` — 加了 `eval` 前缀。
- `server/services/v2/eventOperatorService.ts` — **编排服务**（本轮核心）+ 模板生成器 `buildTemplateProposal`。
- `server/services/v2/eventGraphMindmapBridge.ts` — 服务 ↔ v1 导图的接缝（只有这里碰 v1 mindmap）。
- `server/services/harness/{AgentRuntime,FakeEventOperatorRuntime}.ts` — 运行时边界（DFH-201）。
- `server/repositories/v2/{repository,paths,audit}.ts` — Run/图提案 JSON 持久化 + 布局 + 审计 kind。
- `server/routes/v2/index.ts` — 新 HTTP 路由（见下）。

前端：
- `src/features/v2/api/client.ts` — 新 API 客户端函数 + 类型。
- `src/features/v2/events/AgentRunPanel.tsx` + `.test.tsx` — 用户面板 + 4 个测试。

## 新 HTTP 路由（/api/v2，均有拦截器）

| 方法 | 路径 | 作用 |
|---|---|---|
| POST | `/events/:id/agent-runs` | 开始 AI Run（Fake 同步落提案） |
| GET | `/agent-runs/:id` | 读 Run |
| GET | `/events/:id/agent-runs` | 列某事件的 Runs |
| POST | `/agent-runs/:id/cancel` | 取消 Run |
| GET | `/events/:id/graph-proposals/pending` | 取待审提案 |
| GET | `/events/:id/graph-proposals` | 列提案 |
| POST | `/events/:id/graph-proposals/:pid/apply` | 接受并 Apply |
| POST | `/events/:id/graph-proposals/:pid/reject` | 拒绝 |
| GET | `/agent-runtime/health` | 运行时健康（Fake 模式） |

## 关键设计决定

- **模板模式是诚实占位**：`buildTemplateProposal` 从真实事件内容（节点文本/树形）确定性生成"拆解下一步"，
  不假装是模型推理（面板明确标注）。DSH 接入后**只换 Proposal 来源**，持久化/审阅/Apply 路径不变。
- **§1.3 不造假引用**：带实体的 op 必须引用 `knownEvidenceIds` 里的真实 Evidence，否则模板退化为纯结构建议，
  绝不为模板编造 citation（不要为了演示去削弱 validator，它是有测试的安全核心）。
- **stale 安全**：Apply 前用当前快照重算 baseRevision，事件变了就 409 `proposal_stale`，绝不静默覆盖。
- **服务可测**：runtime/snapshot/writer 都注入，服务测试用临时 V2Repository + 内存 seam，不依赖 v1 全局导图。

## 已知边界 / 下一步

- 模板只产 commitment(+waiting) 与 decision **结构**建议；outcome、真实 DSH 推理、SSE 事件流、分页 cursor
  events 端点、以及把 proposals 串成"恢复上次 Run"是后续（Phase 3+）。
- 需要**你给一个可用模型 key**，才能把 Fake 换成真 DSH 产真推理（见 ADR-0022）。

## 发布前对抗性 Review（2026-08-23）已修复

发布前对该切片做了一次对抗性 code review，确认并修复 5 个问题（全部有回归测试）：
1. **HTTP 路径曾完全不产提案（最关键）**：默认 Fake 只发 `run.started`，`buildTemplateProposal` 只在
   `proposal.ready` handler 里跑 → "AI 推进"实际是空转（返回 proposal:null 且 run 卡在 starting）。
   单元测试此前因注入了配置好的 runtime 而掩盖了它。修复：默认 runtime 改为"模板航班"脚本（phases + proposal.ready + result），
   并加回归测试。
2. **Apply 非原子导致重试重复建 Commitment**：`applyProposal` 先建实体，`writeGraph` 后写图；图写失败时提案仍 pending，
   重试建新 wrapper + 新 idempotencyKey → 重复实体。修复：写图**前**持久化 `entityApplyKey` + `createdEntities` 声明，
   重试复用已有实体（加失败+重试回归测试，断言零重复）。
3. **实体引用错位**：createChanges 与 applyProposal 返回的 created（仅 commitment）按下标 zip；若 decision 与
   commitment 交错/reject，引用错配。修复：只对 `entity==='commitment'` 且未被 reject 的 create 消耗一个 created 槽位。
4. **run 无提案即完成会崩**（运行期/starting→succeeded 非法 → 500）：状态机补 `running/starting→succeeded` 合法弧。
5. **畸形 run id 返回 500 而非 404**：`eventRunPath` 校验抛出在 try 外；改为 try 内判空返回 null，并移除无人用的 `rl_` 前缀。

review 后基线：**113 文件 / 883 用例绿，lint + 生产 build 绿**。