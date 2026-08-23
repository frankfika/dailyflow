# DailyFlow 2.2：DeepSeek Harness 驱动的 AI Event Operator 完整开发实施计划

> 文档版本：2.0  
> 日期：2026-08-22  
> 文档状态：可直接交给实现型 AI 执行  
> 目标仓库：`/Users/fangchen/Baidu/GitHub/dailyflow`  
> 当前基线：`main` / `f62a878` / DailyFlow `2.1.1`  
> 目标版本：DailyFlow `2.2`  
> 主 Runtime：DeepSeek Harness（DSH）  
> 可选专家子代理：Codex（通过 DSH 官方 Codex subagent plugin）  

---

## 0. 给接手 AI 的执行指令

这是一份实施规格，不是灵感文档。接手 AI 必须遵守以下顺序：

1. 完整阅读本文、`docs/AI_NATIVE_PRODUCT_DEVELOPMENT_SPEC.md`、`docs/DAILYFLOW_UNIFIED_PRODUCT_IMPLEMENTATION_PLAN.md`、`docs/EVENT_FIRST_IMPLEMENTATION_RUNBOOK.md`。
2. 运行 `git status --short`，保留用户已有改动，不覆盖不属于本任务的文件。
3. 一次只领取本文一个任务 ID；先补测试或契约，再写实现。
4. 每个阶段完成后运行该阶段要求的测试；未达到验收条件，不进入下一阶段。
5. 不得把 DeepSeek Harness 默认的 Bash、文件写入、Terminal、任意 MCP 暴露给产品 Agent。
6. AI 对 DailyFlow 正式数据的任何修改必须先形成 Proposal，用户确认前不得写入 Event、Mindmap、Commitment、Today 或外部系统。
7. 不得 Fork 或直接修改 DeepSeek Harness 核心源码；使用 Profile、Bundle、Tool、Hook、Protocol Driver 等插件扩展点。
8. 不得另建一套与现有 Proposal、Job、Audit、React Query、Event/Mindmap 平行的状态系统。
9. 若 DSH API 与本文示例不同，以锁定版本的官方源码为准，并把差异记录在 ADR；不得绕过 `AgentRuntime` 适配层让业务代码直接依赖 DSH 内部类型。
10. 每个任务提交结果时必须报告：修改文件、测试结果、尚存风险、是否改变用户数据格式。

### 0.1 冲突处理优先级

1. 用户在实现会话中的最新明确要求。
2. 本文档。
3. `docs/DAILYFLOW_UNIFIED_PRODUCT_IMPLEMENTATION_PLAN.md` 中已经落地的统一状态机制。
4. 当前测试表达的兼容行为。
5. 其他历史文档。

### 0.2 本轮不可改变的产品结论

- Event 是一个真实事项的工作容器。
- Mindmap 是用户与 AI 共同理解、拆解和推进 Event 的工作现场，不是 Event 的附属插图。
- Note、会议转录和 Source 提供 Evidence；它们不会被 AI 静默拆散或覆盖。
- Commitment 是执行状态的唯一真相；Mindmap 和 Today 只持有引用或投影。
- AI 写入的唯一入口是 Proposal。
- DeepSeek Harness 是底层 Agent Runtime，不拥有 DailyFlow 领域模型。
- Codex 是可选的专家子代理，不是另一套主 Runtime，也不是用户必须配置的依赖。

---

## 1. 版本目标与成功定义

### 1.1 一句话目标

DailyFlow 2.2 要让用户在一个 Event Mindmap 中调用 AI，AI 能读取该 Event 的地图、笔记、证据和承诺，提出带证据的结构化 Graph Patch；用户在画布上审阅后，系统再把接受的行动同步为 Commitment，并持续投影到 Today 直至 Outcome 闭环。

### 1.2 首个纵向闭环

```text
会议 Note / 新 Evidence
        ↓
关联到目标 Event
        ↓
DeepSeek Harness 启动 AI Event Operator
        ↓
读取 Event + Mindmap + Evidence + Commitments
        ↓
生成 Graph Patch Proposal（零正式写入）
        ↓
Mindmap 半透明预览 + 用户逐项审阅
        ↓
幂等应用 Proposal
        ↓
Mindmap 节点 + Commitment/Decision/Outcome 正式落地
        ↓
Today 投影行动；完成后回写 Commitment
        ↓
Mindmap 显示结果，Event 可建议关闭
```

### 1.3 发布成功指标

- 10 个真实 Event 样本中至少 8 个能生成结构合法、可审阅的 Graph Proposal。
- 用户确认前正式业务数据写入次数为 0。
- 所有事实性 Decision、Commitment 和 Outcome 建议均带有效 Evidence，或明确标记为“AI 推断/待确认”。
- Proposal 双击接受、网络重试或前端重复提交不会产生重复节点或 Commitment。
- Run 可取消、可恢复、可查看阶段和失败原因。
- 受控产品 Session 中，任意 Shell、文件写入、Terminal、外部消息、外部日历写入调用次数为 0。
- 常规 Event Run 的 P50 首个可见进度小于 3 秒，P50 完整建议小于 60 秒，P95 小于 120 秒。
- Mindmap 和 Today 对同一 Commitment 的完成状态一致。

### 1.4 本版本明确不做

- 不自研通用 Agent Harness。
- 不复制 DSH Web UI 到 DailyFlow。
- 不让 DSH 直接扫描整个用户工作区。
- 不做多 Agent 团队、Agent Marketplace 或复杂 Workflow 编辑器。
- 不自动删除节点或大规模重排整张 Mindmap。
- 不自动发邮件、消息或修改外部日历。
- 不同时实现 DSH、Codex App Server、LangGraph 三套主 Runtime。
- 不把每个页面都改成独立聊天入口。
- 不在本轮彻底消灭旧 Task/Topic Space 兼容层。

---

## 2. 现状盘点与复用策略

### 2.1 当前可直接复用的能力

| 现有能力 | 当前文件 | 2.2 用法 |
|---|---|---|
| V2 领域对象与 Zod Schema | `server/domain/v2/types.ts` | 扩展 Proposal、AgentRun 和 Event 关联，不另建平行模型 |
| Job 状态机 | `server/domain/v2/jobs.ts` | 复用 queued/running/waiting_review/succeeded 等语义 |
| Proposal 幂等应用 | `server/services/v2/proposalService.ts` | 增加 graph 变更应用器，不另做确认系统 |
| AgentRun 雏形 | `server/services/v2/agentService.ts` | 升级为真实 Runtime 驱动并保留旧接口兼容 |
| V2 Repository 与原子写 | `server/repositories/v2/*` | 保存 Run、Proposal、审计和领域实体 |
| Event 查询与适配 | `server/services/eventAdapter.ts`、`server/routes/events.ts` | 构建 Event Session Projection |
| Mindmap 持久化 | `server/services/mindmaps.ts` | 由 Proposal 应用器调用，禁止 Agent 直接调用 |
| EventCanvas | `src/features/v2/events/EventCanvas.tsx` | 增加 AI 入口和 Proposal Overlay |
| Event 交互 mutations | `src/features/v2/hooks/useEvents.ts` | Proposal 应用后精准更新缓存 |
| ProposalReview | `src/features/v2/proposals/ProposalReview.tsx` | 抽取通用审阅能力，增加 Graph 视图 |
| React Query key 工厂 | `src/queryKeys.ts` | 增加 agentRuns 和 graphProposals key |
| 审计日志 | `server/repositories/v2/audit.ts` | 记录 Run、工具、审批和应用结果 |

### 2.2 当前主要缺口

- `AgentRun` 只描述空运行/模型调用，未接真实 Harness 生命周期。
- Mindmap node kind 目前只有 `root/branch/tag/task/question/resource/risk`，缺少 `decision/waiting/outcome`。
- `EventNode` 没有稳定 `entityRef`，执行关联主要依赖 Task 镜像。
- 现有 `organizeMindmap` 是确定性分组建议，不等于 Agent Graph Proposal。
- 现有 Proposal 只处理 V2 实体变更，未处理 Mindmap graph operation。
- EventCanvas 没有 AI 候选节点、候选边、before/after 或逐项审阅。
- 没有 DSH Sidecar 生命周期、协议适配、版本锁定和可用性诊断。

### 2.3 迁移原则

- 旧数据继续可读；新增字段全部可选并提供默认值。
- 不立即删除旧 `taskId`/`execution` 关系；新增 `entityRefs` 后双读，写新格式。
- 旧 `AgentRun.schemaVersion = 1` 继续可读取；新 Event Operator Run 使用 schemaVersion 2。
- 旧 `organize` 入口保留，命名和 UI 上与“AI 推进 Event”明确区分。

---

## 3. 总体技术架构

### 3.1 运行结构

```text
┌──────────────────────────────────────────────────────────────┐
│ DailyFlow React UI                                           │
│ EventCanvas / Proposal Overlay / AgentRunPanel               │
└───────────────────────┬──────────────────────────────────────┘
                        │ HTTP + SSE（现有本地 server）
┌───────────────────────▼──────────────────────────────────────┐
│ DailyFlow Domain Server                                      │
│ Run Orchestrator / Proposal Validator / Apply Service / Audit│
└───────────────────────┬──────────────────────────────────────┘
                        │ AgentRuntime 标准事件
┌───────────────────────▼──────────────────────────────────────┐
│ DeepSeek Harness Sidecar                                     │
│ custom `dailyflow` profile + dailyflow bundle + ACP/stdio    │
│ 仅暴露 DailyFlow typed tools                                 │
└───────────────────────┬──────────────────────────────────────┘
                        │ 受控工具调用（进程内 HTTP/IPC）
┌───────────────────────▼──────────────────────────────────────┐
│ DailyFlow Tool Gateway                                       │
│ read projection / search evidence / propose graph patch      │
└───────────────────────┬──────────────────────────────────────┘
                        │ Repository + existing services
┌───────────────────────▼──────────────────────────────────────┐
│ Local Markdown / JSON / V2 entities / Mindmaps / Audit       │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 为什么以 DSH 为主 Runtime

DSH 已提供 Agent Loop、模型适配、Tool Registry、Session Event、持久化、取消、审批、子代理等通用能力，而且这些能力都是插件。DailyFlow 的价值不在重复这些基础设施，而在把 Event、Mindmap、Evidence、Commitment、Proposal 与 Today 组成可信闭环。

### 3.3 必须保留 AgentRuntime 边界

业务层只依赖以下接口，不直接 import DSH 内部包：

```ts
export interface AgentRuntime {
  readonly runtimeId: string;
  health(): Promise<RuntimeHealth>;
  start(spec: RuntimeRunSpec): Promise<RuntimeRunHandle>;
  send(runId: string, input: RuntimeUserInput): Promise<void>;
  cancel(runId: string): Promise<void>;
  dispose(runId: string): Promise<void>;
  events(runId: string, cursor?: string): AsyncIterable<RuntimeEvent>;
}

export type RuntimeEvent =
  | { type: 'run.started'; runId: string; at: string }
  | { type: 'phase.changed'; phase: EventOperatorPhase; at: string }
  | { type: 'assistant.delta'; text: string; at: string }
  | { type: 'tool.started'; callId: string; tool: string; safeArgs: unknown; at: string }
  | { type: 'tool.completed'; callId: string; summary: unknown; at: string }
  | { type: 'approval.required'; approval: RuntimeApproval; at: string }
  | { type: 'proposal.ready'; proposalId: string; at: string }
  | { type: 'run.completed'; result: RuntimeResult; at: string }
  | { type: 'run.failed'; error: RuntimeError; at: string }
  | { type: 'run.cancelled'; at: string };
```

第一版实现：

- `DeepSeekHarnessRuntime`：生产候选。
- `FakeEventOperatorRuntime`：确定性测试替身。
- 不实现第二套生产 Runtime；接口存在是为了隔离 DSH 开发者预览期的破坏性变化。

### 3.4 DSH Profile 组成

创建独立 `dailyflow` Profile，不使用默认 coding profile：

```text
dsh-base（裁剪后）
  + DailyFlow system prompt plugin
  + DailyFlow typed tool bundle
  + DailyFlow tool restriction / monotonic guard
  + DailyFlow session projection plugin
  + DailyFlow telemetry bridge
  + ACP/stdio protocol driver
  + optional Codex subagent provider（默认关闭）
```

必须禁用或不挂载：

- Bash/Shell
- 任意文件系统读写工具
- Terminal/PTY
- 任意 MCP 自动发现
- Web 浏览工具
- 定时任务
- 默认 coding skills
- 能创建或修改插件/Profile 的能力

### 3.5 集成方式

优先顺序：

1. 使用官方 ACP 能力或其稳定可嵌入包，通过 JSON-RPC stdio 连接。
2. 若当前锁定版本未暴露可直接嵌入的 ACP launcher，则按官方 external protocol driver 形态实现 `dailyflow-protocol-stdio` 插件。
3. 不通过解析 CLI 人类可读输出集成。
4. 不嵌入 DSH Web UI。

Tauri/本地 server 负责启动、监控和结束 Sidecar。Sidecar stdout 只能输出协议消息，日志写 stderr 或指定日志文件。

### 3.6 版本与供应链策略

- 把 DSH 固定到明确 npm 版本和 lockfile，不使用 `latest`。
- 把 DSH package 及其 Node runtime 纳入现有 server bundle/sidecar 打包流程。
- 在 `docs/adr/ADR-0022-deepseek-harness-runtime.md` 记录锁定版本、包列表、协议能力和已知差异。
- 升级 DSH 必须先运行 runtime contract tests 和 10 个 golden samples。
- 不修改 DSH 源码；若必须临时 patch，停止发布并先评估能否改为插件或上游贡献。

---

## 4. 产品领域模型

### 4.1 Event

Event 是 AI Run 的最小授权范围。每次 Run 必须绑定：

```ts
interface EventOperatorScope {
  workspaceId: string;
  eventId: string;
  mindmapId: string;
  trigger: 'event_canvas' | 'meeting_note' | 'new_evidence';
  triggerEntityRef?: EntityRef;
  selectedContextRefs: EntityRef[];
  contextBudgetBytes: number;
}
```

Agent 不允许自行扩大 `workspaceId/eventId`；搜索工具的 filter 由 Tool Gateway 注入，模型不能覆盖。

### 4.2 Mindmap 节点语义

扩展 `MindMapNodeKind`：

```ts
type MindMapNodeKind =
  | 'root'
  | 'branch'
  | 'tag'
  | 'task'
  | 'question'
  | 'resource'
  | 'risk'
  | 'decision'
  | 'waiting'
  | 'outcome';
```

节点职责：

| kind | 含义 | 接受 Proposal 后的领域行为 |
|---|---|---|
| branch | 结构分支 | 仅写 Mindmap |
| task | 可执行下一步 | 创建或绑定 Commitment；可进入 Today |
| waiting | 等待某人/某事 | 创建或更新 Waiting Commitment；必须有 `waitingOn`、`reviewAt` |
| decision | 已作出或待确认决定 | 创建 Decision，并连接 Evidence |
| question | 待澄清问题 | 保留在 Event，供后续 Run 追踪 |
| resource | 资料或来源引用 | 绑定 Note/Source/Evidence，不复制原文 |
| risk | 风险或假设 | 记录到 Event 图，不自动生成任务 |
| outcome | 真实结果 | 创建或连接 Outcome；可参与 Event 关闭判断 |

### 4.3 节点实体引用

在 `MindMapNode` 增加可选字段：

```ts
interface MindMapEntityRef {
  type: 'commitment' | 'decision' | 'outcome' | 'note' | 'source' | 'evidence';
  id: string;
}

interface MindMapNode {
  // existing fields...
  entityRefs?: MindMapEntityRef[];
  provenance?: {
    origin: 'user' | 'ai' | 'migration';
    proposalId?: string;
    agentRunId?: string;
    acceptedAt?: string;
  };
}
```

兼容规则：

- 旧 `taskId/execution` 继续可读。
- 新 task/waiting 节点必须同时写 `entityRefs: [{type:'commitment', id}]`。
- 查询层优先读 Commitment 引用，缺失时回退旧 Task 镜像。
- 不把 Commitment 的 status、due、owner 完整复制进节点。

### 4.4 AgentRun V2

```ts
type EventOperatorPhase =
  | 'collect'
  | 'retrieve'
  | 'extract'
  | 'resolve'
  | 'prepare'
  | 'review';

type AgentRunStatus =
  | 'queued'
  | 'starting'
  | 'running'
  | 'waiting_review'
  | 'applying'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

interface EventOperatorRun {
  id: string;
  schemaVersion: 2;
  workspaceId: string;
  eventId: string;
  mindmapId: string;
  runtimeId: 'deepseek-harness';
  runtimeVersion: string;
  runtimeSessionId?: string;
  modelProvider: string;
  model: string;
  promptVersion: string;
  scope: EventOperatorScope;
  phase: EventOperatorPhase;
  status: AgentRunStatus;
  contextManifest: ContextManifestItem[];
  proposalId?: string;
  lastEventCursor?: string;
  error?: { code: string; message: string; retryable: boolean; stage: string };
  metrics: {
    startedAt?: string;
    firstProgressAt?: string;
    finishedAt?: string;
    durationMs?: number;
    modelRequests: number;
    toolCalls: number;
    inputTokens?: number;
    outputTokens?: number;
    estimatedCost?: number;
  };
}
```

### 4.5 Graph Proposal

新增 `event_graph_patch` Proposal kind。业务 Proposal 仍是唯一审批对象。

```ts
interface EventGraphProposal {
  id: string;
  schemaVersion: 1;
  workspaceId: string;
  eventId: string;
  mindmapId: string;
  agentRunId: string;
  baseRevision: string;
  status: 'pending' | 'partially_accepted' | 'accepted' | 'rejected' | 'expired';
  operations: GraphOperation[];
  summary: string;
  riskLevel: 'low' | 'medium' | 'high';
  createdAt: string;
  expiresAt?: string;
}

type GraphOperation =
  | {
      changeId: string;
      op: 'add_node';
      tempId: string;
      parentId: string;
      node: { kind: MindMapNodeKind; text: string; note?: string };
      domainDraft?: DomainEntityDraft;
      evidenceIds: string[];
      confidence: number;
      reason: string;
    }
  | {
      changeId: string;
      op: 'update_node';
      nodeId: string;
      patch: { text?: string; note?: string; kind?: MindMapNodeKind };
      evidenceIds: string[];
      confidence: number;
      reason: string;
    }
  | {
      changeId: string;
      op: 'move_node';
      nodeId: string;
      newParentId: string;
      confidence: number;
      reason: string;
    }
  | {
      changeId: string;
      op: 'link_entity';
      nodeId: string;
      entityRef: MindMapEntityRef;
      reason: string;
    };
```

首版不允许 AI 提出 `delete_node`。用户若要删除，继续走现有手动操作。

### 4.6 Revision 与冲突

`baseRevision` 由下列内容的规范化 hash 组成：

- mindmap id、updatedAt、nodes、edges；
- 关联 Commitment 的 id、updatedAt、state；
- Event 状态。

应用时 revision 不一致：

- 不自动覆盖。
- 逐项检查是否仍可安全应用。
- 无冲突项可保留；冲突项标记 `stale` 并要求重新生成或人工调整。

---

## 5. DailyFlow Harness Bundle

### 5.1 建议目录

```text
packages/dailyflow-harness/
├── package.json
├── tsconfig.json
├── cordis.patch.yml
└── src/
    ├── index.ts
    ├── profile.ts
    ├── prompt/
    │   ├── eventOperatorPrompt.ts
    │   └── eventOperatorPolicy.ts
    ├── projection/
    │   └── eventSessionProjection.ts
    ├── tools/
    │   ├── readEvent.ts
    │   ├── readMindmap.ts
    │   ├── readEvidence.ts
    │   ├── searchEvidence.ts
    │   ├── listCommitments.ts
    │   ├── proposeGraphPatch.ts
    │   └── completeEventRun.ts
    ├── policy/
    │   ├── toolRestriction.ts
    │   ├── scopeGuard.ts
    │   └── resultRedaction.ts
    ├── protocol/
    │   └── dailyflowStdioDriver.ts
    └── telemetry/
        └── dailyflowTelemetry.ts
```

如果仓库暂不适合 workspace package，可先放在 `server/harness/dailyflow-profile/`，但最终必须是可独立版本化的插件 bundle。

### 5.2 System Prompt 的职责

Prompt 只定义产品角色与输出纪律，不承载确定性业务规则。必须包含：

- 当前 Run 仅可处理一个 Event。
- 先读现状，再提出变更。
- 事实结论必须引用 Evidence。
- 不知道 owner/due 时保留 unknown，不编造。
- 优先更新已有节点，避免重复新增。
- 不生成坐标。
- 不请求 Shell、文件或网络工具。
- 最终必须调用 `propose_graph_patch`，不得只返回自然语言计划。
- `complete_event_run` 只能在 Proposal 验证成功后调用。

环检测、同 Event 校验、等待字段完整性、幂等和权限必须在服务端验证，不可只靠 Prompt。

### 5.3 模型可见上下文

启动时只注入短摘要和实体索引：

- Event 标题、目标、状态。
- Mindmap 根和一级分支摘要。
- 选中的触发 Note/Evidence。
- 关联实体数量和可用工具说明。

完整内容通过只读工具按需获取。模型看到的所有内容必须可从 DSH Session Event 重建；DailyFlow 另外保存 `contextManifest`，只记录实体 ID、版本、hash 和字节数，不复制敏感全文到审计日志。

---

## 6. Agent 工具契约

### 6.1 通用规则

- 每个工具调用由 server 根据 runId 注入 workspaceId/eventId，模型参数中不接受任意 workspaceId。
- 输入输出使用 Zod/JSON Schema 双重校验。
- 默认最大返回 32 KB；超限分页或摘要。
- Evidence quote 最多返回必要片段。
- 日志只存安全摘要，不存 API Key、全文 Note 或原始转录。
- 任一写型工具实际只创建草稿或 Proposal，不修改正式实体。

### 6.2 `read_event`

```ts
input: { include?: ('participants' | 'links' | 'recent_activity')[] }
output: {
  event: { id; title; status; context; progress; tags; createdAt; updatedAt };
  linked: { mindmapId; noteIds; sourceIds; commitmentIds; decisionIds };
}
```

只返回当前 Run 的 Event。

### 6.3 `read_mindmap`

```ts
input: { rootNodeId?: string; depth?: number; cursor?: string; includeEntityRefs?: boolean }
output: {
  revision: string;
  nodes: Array<{ id; parentId?; text; kind; entityRefs? }>;
  edges: Array<{ id; source; target }>;
  nextCursor?: string;
}
```

不向模型提供 x/y 坐标；布局由前端决定。

### 6.4 `read_evidence`

```ts
input: { evidenceIds: string[] }
output: Array<{
  id; sourceId; quote; locator; stale; sourceContentHash;
}>
```

只允许读取已在 Event scope 或 search 结果中的 Evidence。

### 6.5 `search_evidence`

```ts
input: {
  query: string;
  entityTypes?: ('note' | 'source' | 'decision' | 'commitment' | 'outcome')[];
  limit?: number;
}
output: Array<{
  evidenceId; entityRef; title; quote; locator; score; updatedAt;
}>
```

服务端强制追加当前 workspace 和 Event 关联范围；跨 Event 召回默认只返回摘要且必须明确“来自关联记忆”。

### 6.6 `list_commitments`

```ts
input: { states?: CommitmentState[]; query?: string; limit?: number }
output: Array<{
  id; title; state; ownerText?; dueAt?; waitingOnText?; reviewAt?;
  evidenceIds; updatedAt;
}>
```

用于查重和判断执行状态。

### 6.7 `propose_graph_patch`

```ts
input: {
  baseRevision: string;
  summary: string;
  operations: GraphOperationDraft[];
}
output:
  | { ok: true; proposalId: string; acceptedOperationCount: number; warnings: ValidationIssue[] }
  | { ok: false; issues: ValidationIssue[] };
```

该工具只保存 pending Proposal。若校验失败，返回稳定 error code，让模型修正一次；最多允许 2 次完整重提，避免无限循环。

### 6.8 `complete_event_run`

```ts
input: { proposalId: string; userFacingSummary: string }
output: { status: 'waiting_review'; proposalId: string }
```

调用后使用 DSH 的 terminal/conclude-turn 机制结束本轮，不允许继续调用其他工具。

### 6.9 禁止工具回归测试

每次启动 Profile 后读取实际工具清单并断言只包含白名单。若出现 `bash`、`shell`、`fs_*`、`terminal`、`mcp_*`、`web_*`，健康检查直接失败，UI 禁止启动 Run。

---

## 7. Event Operator 运行流程

### 7.1 Collect

- 读取 Event、Mindmap revision、触发实体和用户选中的上下文。
- 生成 `contextManifest`。
- 若 Event/Mindmap 不存在或不一致，Run 失败且零写入。

### 7.2 Retrieve

- 读取当前图结构。
- 按节点、参与者、关键词召回关联 Evidence、Commitment、Decision。
- 达到预算时优先保留触发证据、未完成 Commitment、最近 Decision。

### 7.3 Extract

从新增信息中识别：

- 新 Decision。
- 新 Commitment / Next Action。
- Waiting 项。
- Open Question。
- Risk。
- Resource 引用。
- Outcome。

### 7.4 Resolve

- 与现有节点和 Commitment 查重。
- 判断新增、更新、移动或链接实体。
- 校验 owner、due、waitingOn、reviewAt 的可信度。
- 不确定信息保留字段空值并在 reason 中说明。

### 7.5 Prepare

- 生成 GraphOperation。
- 调用 `propose_graph_patch`。
- 按验证错误修正，最多两轮。

### 7.6 Review

- 调用 `complete_event_run`。
- Run 状态变为 `waiting_review`。
- 前端展示 Proposal Overlay；此时才允许用户选择接受/修改/拒绝。

### 7.7 Apply

Apply 不由 Agent 执行。用户提交后，DailyFlow 服务端：

1. 校验 Proposal 状态、selection、idempotencyKey、baseRevision。
2. 为选中的 tempId 生成真实 ULID。
3. 先创建/更新 V2 领域实体，再组装最终节点 entityRefs。
4. 原子更新 Mindmap。
5. 写 apply receipt 和 audit。
6. 返回 canonical entities、updated map 和 affected surfaces。
7. 前端精准更新 Event、Mindmap、Today、Proposal、AgentRun 缓存。

若第 3 或 4 步失败，整体回滚或恢复到可重试状态，不允许出现只有 Commitment、没有节点的半完成结果。

---

## 8. Mindmap 体验规格

### 8.1 主入口

EventCanvas 工具栏增加唯一主入口：`AI 推进这个 Event`。

点击后先打开 Context Preview：

- 当前 Event 和 Mindmap。
- 将读取的关联 Notes/Evidence 数量。
- 将读取的开放 Commitment 数量。
- 可取消选中的额外上下文。
- 显示模型提供方和隐私提示。

确认后启动 Run。不要让用户先进入一个空白 Chat 页面。

### 8.2 Proposal Overlay

| 状态 | 视觉 | 行为 |
|---|---|---|
| add_node | 紫色半透明节点 + 虚线边 | 可接受、编辑、拒绝 |
| update_node | 原节点黄色描边 | 侧栏显示 before/after |
| move_node | 原位置到候选父节点的虚线路径 | 确认后再移动 |
| stale/conflict | 红色描边和警告 | 禁止批量接受，需处理 |
| accepted locally | 绿色轻高亮 | 提交前可撤销选择 |
| rejected locally | 降低透明度 | 提交前可恢复 |

候选节点坐标由现有 layout/`nextChildPosition` 计算，只用于预览；Agent 不控制坐标。

### 8.3 节点审阅侧栏

必须显示：

- 类型、标题、父节点。
- AI reason。
- confidence。
- Evidence 列表及“打开原文”。
- 对 task/waiting：owner、due、waitingOn、reviewAt。
- 对 update：before/after。
- 接受、编辑后接受、拒绝。

### 8.4 批量操作

- `接受低风险建议`：只选择 confidence ≥ 0.85、无 warning、非 update/move、非 waiting 的项。
- `全部接受` 不作为默认主按钮。
- 高风险或 stale 项必须逐项处理。
- 最终提交按钮显示将创建/更新的节点与实体数量。

### 8.5 AgentRunPanel

展示：

- Collect/Retrieve/Extract/Resolve/Prepare/Review 六阶段。
- 当前阶段和已完成阶段。
- 已读取的实体类型和数量。
- 工具名称与安全摘要。
- 停止按钮。
- 失败原因、是否写入、是否可重试。

不展示隐藏思维链；可以展示模型生成的简短用户可见说明。

### 8.6 从会议 Note 进入

`AI 推进会议` 的行为：

- 已关联一个 Event：显示“将更新 X Event”，确认后跳到 EventCanvas 并启动。
- 关联多个 Event：用户选择一个。
- 未关联：用户选择现有 Event、创建新 Event、或只做摘要；默认推荐关联/创建 Event。
- 不直接生成一批孤立 Task。

### 8.7 Mindmap 与 Today 同步

```text
接受 task/waiting 节点
  → 创建/绑定 Commitment
  → 有 scheduledDate 的 Next Action 出现在 Today

Today 完成
  → 更新 Commitment/Outcome
  → Event 查询层重新投影
  → Mindmap 节点显示 done/outcome
```

节点不得成为另一套执行状态源。

---

## 9. 服务端 API

### 9.1 Agent Run

```http
POST   /api/v2/events/:eventId/agent-runs
GET    /api/v2/agent-runs/:runId
GET    /api/v2/agent-runs/:runId/events?cursor=...
POST   /api/v2/agent-runs/:runId/cancel
POST   /api/v2/agent-runs/:runId/retry
```

创建请求：

```json
{
  "trigger": "event_canvas",
  "triggerEntityRef": null,
  "selectedContextRefs": [],
  "idempotencyKey": "event-run:<eventId>:<client-ulid>"
}
```

创建响应返回 `202`：

```json
{
  "run": { "id": "...", "status": "queued", "phase": "collect" },
  "eventsUrl": "/api/v2/agent-runs/.../events"
}
```

事件端点优先使用 SSE。必须支持 `Last-Event-ID` 或 cursor 断线续传；事件来自 DailyFlow 持久化 Run Event，不直接把 DSH 内存事件暴露给 UI。

### 9.2 Graph Proposal

```http
GET    /api/v2/event-graph-proposals/:proposalId
POST   /api/v2/event-graph-proposals/:proposalId/validate
POST   /api/v2/event-graph-proposals/:proposalId/apply
POST   /api/v2/event-graph-proposals/:proposalId/reject
```

Apply 请求：

```json
{
  "idempotencyKey": "graph-apply:<proposalId>:<client-ulid>",
  "selection": ["chg_01", "chg_02"],
  "overrides": {
    "chg_02": { "text": "给投资人发送更新材料", "dueAt": "2026-08-25" }
  }
}
```

Apply 响应：

```json
{
  "proposal": { "id": "...", "status": "partially_accepted" },
  "mindmap": { "id": "...", "updatedAt": "..." },
  "created": [{ "type": "commitment", "id": "..." }],
  "updated": [],
  "rejected": [],
  "affectedSurfaces": ["events", "today", "proposals", "memory"]
}
```

### 9.3 Runtime 诊断

```http
GET /api/v2/agent-runtime/health
```

返回：runtime version、profile version、protocol version、模型配置状态、工具白名单校验、sidecar 状态。不得返回密钥。

---

## 10. 建议代码结构

```text
server/services/harness/
├── AgentRuntime.ts
├── DeepSeekHarnessRuntime.ts
├── FakeEventOperatorRuntime.ts
├── runtimeProcessManager.ts
├── runtimeProtocol.ts
├── runtimeEventStore.ts
├── runtimeHealth.ts
└── __tests__/

server/services/v2/event-operator/
├── eventOperatorService.ts
├── eventSessionProjection.ts
├── eventOperatorSchemas.ts
├── eventOperatorTools.ts
├── eventGraphProposalService.ts
├── eventGraphProposalValidator.ts
├── eventGraphProposalApplier.ts
├── eventRunRecovery.ts
└── __tests__/

server/routes/v2/
├── agentRuns.ts
└── eventGraphProposals.ts

src/features/v2/agents/
├── AgentRunPanel.tsx
├── AgentRunTimeline.tsx
├── AgentRunRecoveryBanner.tsx
├── EventOperatorContextPreview.tsx
├── EventGraphProposalOverlay.tsx
├── EventGraphProposalReview.tsx
├── GraphProposalNodeInspector.tsx
└── hooks/
    ├── useEventOperatorRun.ts
    ├── useAgentRunEvents.ts
    └── useEventGraphProposal.ts
```

路由可暂时继续注册在现有 `server/routes/v2/index.ts`，但 handler 和业务逻辑必须拆到独立文件，避免继续扩张 2000+ 行路由文件。

---

## 11. 分阶段开发任务

## Phase 0：基线、ADR 与 DSH Spike

### DFH-001 建立执行基线

目标：确保后续 AI 不覆盖用户改动并留下可比较基线。

步骤：

1. 记录 branch、commit、`git status --short`。
2. 运行 `npm run lint`、相关单测和生产 build，记录既有失败。
3. 新建 `docs/implementation/dsh-baseline.md`。

验收：基线文档包含命令、结果、环境版本；不修改运行代码。

### DFH-002 编写架构决策记录

新增 `docs/adr/ADR-0022-deepseek-harness-runtime.md`，写清：

- DSH 主 Runtime、Codex 可选子代理。
- 不 Fork DSH。
- AgentRuntime 隔离边界。
- Profile 白名单能力。
- 版本锁定与升级门槛。

验收：所有后续实现可从 ADR 判断“该逻辑属于 DSH 还是 DailyFlow”。

### DFH-003 DSH Sidecar Spike

目标：在开发环境完成最小端到端运行，不接业务数据。

步骤：

1. 固定 DSH 版本。
2. 建立最小 `dailyflow-spike` Profile。
3. 通过 ACP/stdio 启动一个 Session、提交一句文本、收到事件和 final。
4. 验证 cancel、异常退出、重复启动、stdout/stderr 分离。
5. 记录 Tauri 打包所需 Node 和原生 payload。

验收：自动化测试可启动 sidecar 并在 30 秒内完成 echo 型 Run；取消后进程树退出；没有孤儿进程。

### DFH-004 Tool 白名单 Spike

只注册 `ping_dailyflow` 和 `complete_event_run` 两个测试工具，断言 Profile 不包含 Shell/FS/Terminal/MCP/Web。

验收：未知工具调用被单调 guard 拒绝；健康检查能列出实际工具并判定 pass/fail。

Phase 0 退出条件：DFH-003 和 DFH-004 通过。若 ACP/stdio 无法稳定运行，先实现窄协议 driver；不得开始 UI。

## Phase 1：领域契约与兼容迁移

### DFH-101 扩展 Mindmap Schema

修改：

- `server/types/mindmap.ts`
- `src/api/client.ts`
- Mindmap parser/serializer 相关测试

增加 `decision/waiting/outcome` 和可选 `entityRefs/provenance`。旧 JSON 无字段时正常读取。

验收：旧 fixture round-trip 不丢字段；新节点可持久化并重新读取。

### DFH-102 定义 AgentRun V2 与 Graph Proposal Schema

修改 `server/domain/v2/types.ts` 或拆出 `server/domain/v2/eventOperator.ts`，使用 Zod 定义本文第 4 节模型。

验收：包含有效/无效 fixture；拒绝缺 changeId、跨类型字段、非法 confidence、waiting 缺字段等情况。

### DFH-103 Repository 与路径

为 run event 和 graph proposal 增加稳定存储：

```text
.dailyflow/v2/agent-runs/<id>.json
.dailyflow/v2/agent-run-events/<id>.jsonl
.dailyflow/v2/event-graph-proposals/<id>.json
```

具体路径遵循现有 V2 repository 约定，不自行硬编码用户 HOME。

验收：原子写、并发锁、损坏文件错误、workspace 隔离测试通过。

### DFH-104 Revision 与 Validator

实现规范化 hash、环检测、实体存在性、同 Event、Evidence、waiting 字段、重复 tempId、受限 patch 字段检查。

验收：至少 20 个 validator 单测；所有失败返回稳定 error code 和 changeId。

Phase 1 退出条件：Schema、存储、validator 完成；仍未接模型。

## Phase 2：Runtime 适配与生命周期

### DFH-201 实现 AgentRuntime 接口

建立 `DeepSeekHarnessRuntime` 和 `FakeEventOperatorRuntime`。Fake Runtime 从 fixture 产生标准 RuntimeEvent，用于 UI/服务测试。

验收：同一 contract test suite 同时运行两个实现；至少覆盖 start/events/cancel/dispose/failure。

### DFH-202 Sidecar Process Manager

职责：

- 单实例或受控池化启动。
- readiness handshake。
- 崩溃检测和指数退避。
- 进程树结束。
- 应用退出清理。
- stdout 协议隔离、stderr 日志轮转。

验收：模拟 crash、协议损坏、超时、应用退出；无孤儿进程。

### DFH-203 Runtime Event 映射与持久化

把 DSH `session/event`、agent status、tool events 映射成 DailyFlow RuntimeEvent，并追加写 Run Event log。

验收：断线后从 cursor 重放；同一 DSH 事件不会重复写；敏感内容不进入 safeArgs。

### DFH-204 Run 状态机

实现合法转换：

```text
queued → starting → running → waiting_review → applying → succeeded
                         ↘ failed / cancelled
waiting_review → rejected/succeeded（按现有状态设计映射）
```

验收：非法转换抛稳定错误；cancel 幂等；终态不可恢复为 running。

### DFH-205 Runtime Health

实现 `/agent-runtime/health` 和 Settings 诊断卡片所需数据。

验收：缺模型配置、sidecar 未启动、工具污染、版本不匹配都有不同错误码。

Phase 2 退出条件：Fake 和 DSH 均能通过 contract tests，Run 可完整记录和取消。

## Phase 3：DailyFlow 工具与 Event Session Projection

### DFH-301 Event Session Projection

根据 eventId 组装：Event 摘要、Mindmap 索引、Note/Source refs、开放 Commitment、最近 Decision、预算信息。

验收：不跨 workspace；不泄露未选中的全文；同输入产生稳定 manifest hash。

### DFH-302 只读工具

实现：

- `read_event`
- `read_mindmap`
- `read_evidence`
- `search_evidence`
- `list_commitments`

验收：每个工具有 schema、scope、分页、大小限制、错误码和审计测试。

### DFH-303 Proposal 工具

实现 `propose_graph_patch` 与 `complete_event_run`。前者只写 pending Proposal，后者只改变 Run 为 waiting_review。

验收：调用前后 Mindmap/Commitment/Today 文件 hash 不变；Proposal 文件和审计日志发生预期变化。

### DFH-304 DSH Bundle 正式化

把 prompt、工具、guard、telemetry、protocol 组合为 `dailyflow` Profile；导出 resolved config snapshot 供测试。

验收：Profile 工具白名单快照通过；移除任一关键插件时 health fail closed。

### DFH-305 Event Operator Prompt 与 Golden Traces

用 5 个最小样本验证：新增 task、更新 decision、waiting、重复项、低证据场景。

验收：所有 Run 最终调用 Proposal 工具；无纯文本“完成”假成功。

Phase 3 退出条件：真实 DSH 能对 fixture Event 生成 pending Proposal，正式业务数据零写入。

## Phase 4：Proposal 应用与一致性

### DFH-401 Graph Proposal Service

实现 create/read/validate/reject/expire，复用现有 Proposal 状态和审计语义。

验收：状态转换、选择子集、过期、重复拒绝均有测试。

### DFH-402 Domain Draft Applier

按 node kind 应用：

- task → Commitment。
- waiting → Waiting Commitment。
- decision → Decision。
- outcome → Outcome。
- resource → entityRef。
- branch/question/risk → 只更新图。

验收：每种 kind 至少一个成功和一个失败用例。

### DFH-403 原子 Graph Apply

实现 tempId 解析、实体创建、节点 entityRefs、edge 创建、map update、apply receipt。

验收：故障注入到每一步；任何失败都不会产生孤立实体或半张图；重复 idempotencyKey 返回原结果。

### DFH-404 Revision 冲突处理

实现 stale 检测、无冲突子集保留和 UI 可读 conflict。

验收：用户在 Proposal 生成后手动改图，Apply 不会静默覆盖。

### DFH-405 Today 投影一致性

修改 Event/Today 查询层优先从 Commitment 引用投影状态，同时兼容旧 Task。

验收：接受 task → Today 可见；Today 完成 → Event/Mindmap 查询显示完成；无重复 Today item。

Phase 4 退出条件：无需 UI，通过 API 可完整生成、审阅选择、幂等应用和同步 Today。

## Phase 5：EventCanvas 与 Mindmap 审阅体验

### DFH-501 Context Preview

在 EventCanvas 增加 `AI 推进这个 Event` 和上下文预览 modal。

验收：用户取消时不创建 Run；确认时请求包含正确 eventId/context refs。

### DFH-502 AgentRunPanel

实现阶段、工具安全摘要、停止、错误、恢复入口。

验收：Fake Runtime 覆盖 loading/running/waiting_review/failed/cancelled；不显示思维链。

### DFH-503 Proposal Overlay

在 EventCanvas 现有自绘画布上实现候选节点/边；若决定复用 React Flow，必须先写 ADR，不能同时维护两套交互坐标。

验收：add/update/move/conflict 四类视觉状态；缩放和平移正常；候选节点不触发 autosave。

### DFH-504 Node Inspector 与局部选择

实现 evidence、reason、confidence、before/after、领域字段编辑。

验收：编辑只写本地 review state；最终 Apply 才写服务端。

### DFH-505 批量审阅与提交

实现“接受低风险建议”、选择统计、最终确认、提交中禁用重复操作。

验收：高风险项不被低风险批量选择；双击按钮只有一个请求；partial accepted 正确显示。

### DFH-506 缓存与页面同步

Proposal 应用后，根据 `affectedSurfaces` 精准更新/invalidate；不得整页 reload。

验收：EventCanvas、Today、Proposal 状态在同一交互后更新；无固定 interval 写操作。

Phase 5 退出条件：用户可在真实 EventCanvas 完成 Run → Overlay → 审阅 → Apply。

## Phase 6：Note 入口、恢复与可观测性

### DFH-601 会议 Note → Event

实现关联 Event 解析、选择/创建 Event、跳转和 Run trigger。

验收：未关联时不静默创建孤立 Task；已关联时定位正确 Event。

### DFH-602 重启恢复

应用启动时扫描 starting/running/waiting_review：

- running 但 sidecar session 不可恢复 → 标记可重试失败。
- waiting_review → 显示恢复横幅并打开 Proposal。
- applying → 根据 apply receipt/审计完成恢复判断。

验收：在三个阶段强制退出应用，重启后状态可解释且无重复写入。

### DFH-603 SSE 断线与重连

验收：断网/切换页面/睡眠恢复后从 cursor 继续；不重复阶段和 Proposal ready 通知。

### DFH-604 Telemetry 与隐私

记录 provider/model/runtime version、阶段耗时、工具次数、token/cost（可得时）、validation warnings、最终接受率。

验收：日志不含密钥、完整 Note/Transcript 或隐藏 reasoning；提供关闭遥测设置时仍保留本地审计必需字段。

### DFH-605 Settings 诊断

显示 Runtime 是否就绪、当前锁定版本、模型配置、Codex 子代理是否启用；提供“运行诊断”，不提供默认 DSH Web UI。

Phase 6 退出条件：核心闭环可恢复、可诊断、可审计。

## Phase 7：可选 Codex 子代理

### DFH-701 集成官方 Codex Provider

使用 `@deepseek-ai/dsh-subagent-codex` 安装到 DailyFlow Profile，但默认 tool disabled。

启用条件：

- 本机 Codex 配置和认证可用。
- 用户在 Settings 显式开启。
- 当前 Run 策略允许委派。

### DFH-702 限定 Codex 任务类型

首版只允许无业务写入的自包含专家任务，例如：

- 对一段材料给出结构化摘要建议。
- 对复杂分支给出备选拆解。
- 检查 Graph Proposal 的逻辑完整性。

不得让 Codex 直接接触 DailyFlow 数据工具；父 Agent 只传必要的脱敏文本任务。官方 provider 不继承父对话，因此任务必须自包含。

### DFH-703 降级行为

Codex 不可用、未认证、失败或超时时，主 Run 继续由 DSH 主 Agent 完成，不把整个 Run 判死。

验收：Codex enabled/disabled/unavailable 三种情况均有测试；Codex 进程取消后完整退出。

Phase 7 是可选增强，不阻塞 2.2 核心发布。

## Phase 8：评测、发布与文档

### DFH-801 Golden Dataset

建立 10 个去敏 Event fixture：

1. 简单任务提取。
2. 已有任务更新。
3. 明确 Decision。
4. Waiting 与 reviewAt。
5. 重复 Commitment。
6. Evidence 不足。
7. 冲突 deadline。
8. Outcome 闭环。
9. 大 Mindmap 分页。
10. Proposal 后用户改图造成 stale。

每个样本定义允许操作、禁止操作和最低 Evidence 要求，不要求模型逐字一致。

### DFH-802 安全评测

注入提示要求执行 Shell、读取其他 Event、跳过审批、伪造 Evidence、直接写文件，全部必须失败。

### DFH-803 性能与稳定性

连续运行 50 次 Fake Runtime 和至少 10 次真实 Runtime；记录 P50/P95、crash、孤儿进程、重连、内存。

### DFH-804 全量回归

至少运行：

```bash
npm run lint
npm test
npm run build
npm run test:e2e -- e2e/event-first-loop.spec.ts
```

新增 E2E：`e2e/event-operator.spec.ts`、`e2e/event-operator-recovery.spec.ts`。

### DFH-805 发布与用户文档

更新 README、CHANGELOG、隐私说明、模型配置、Runtime 诊断、如何关闭 AI、如何恢复 Run。

---

## 12. 测试矩阵

| 层级 | 必测内容 | 工具/方式 |
|---|---|---|
| Schema | 所有实体、operation、runtime event | Vitest + Zod fixtures |
| Validator | 环、跨 Event、Evidence、waiting、revision | table-driven tests |
| Runtime contract | start/events/cancel/dispose/failure | Fake + DSH adapter |
| Tool security | scope、白名单、大小、日志脱敏 | unit/integration |
| Proposal apply | partial、override、idempotency、rollback | service integration |
| Query consistency | Commitment → Event/Mindmap/Today | server tests |
| UI states | run、overlay、review、conflict | Testing Library |
| SSE | cursor、重连、重复事件 | integration |
| Sidecar | crash、timeout、process tree | process integration |
| E2E | Note/Event → Proposal → Today → done | Playwright |
| Golden eval | 10 个真实语义样本 | deterministic assertions |
| Security eval | prompt injection/越权 | adversarial fixtures |

### 12.1 必须保留的测试不变量

- Proposal 前后正式数据 hash 相同。
- Apply 相同 idempotencyKey 两次，实体数量不变。
- Runtime tool list 始终等于白名单。
- 任意 runId 不能读取其他 workspace/Event。
- stale Proposal 不会覆盖新 revision。
- 取消后没有后续工具调用。
- UI 候选图不会触发现有 autosave。

---

## 13. 错误码与用户提示

| error code | 用户提示 | retryable |
|---|---|---|
| `RUNTIME_NOT_READY` | AI Runtime 尚未就绪，请检查模型配置 | 是 |
| `RUNTIME_VERSION_MISMATCH` | AI Runtime 版本不兼容，请更新或恢复锁定版本 | 否 |
| `RUNTIME_TOOLSET_UNSAFE` | 检测到未授权工具，本次运行已阻止 | 否 |
| `EVENT_SCOPE_INVALID` | Event 或 Mindmap 已不存在/不一致 | 否 |
| `CONTEXT_TOO_LARGE` | 上下文过大，请减少选中资料 | 是 |
| `PROPOSAL_VALIDATION_FAILED` | AI 建议未通过规则校验，未写入数据 | 是 |
| `PROPOSAL_STALE` | 地图已变化，请重新检查建议 | 是 |
| `APPLY_CONFLICT` | 部分建议与当前数据冲突，未覆盖现有内容 | 是 |
| `RUNTIME_CANCELLED` | 已停止；未写入正式数据 | 是 |
| `MODEL_AUTH_REQUIRED` | 模型提供方需要配置或登录 | 是 |
| `SUBAGENT_UNAVAILABLE` | Codex 专家不可用，已由主 Agent 继续 | 是 |

任何失败提示必须明确：是否写入正式数据、可否重试、下一步是什么。

---

## 14. 安全、权限与隐私

### 14.1 三层防线

1. Profile 层：不挂载危险工具。
2. Tool Registry 层：`restrict` 只展示白名单。
3. Execution Guard 层：即使工具被意外挂载，也按 run scope 和白名单单调拒绝。

### 14.2 数据最小化

- 默认只传 Event 相关实体。
- Note/Transcript 按片段读取。
- 外部模型配置时，Context Preview 告知用户将发送的类别。
- Audit 记录 hash、ID 和摘要，不复制全文。

### 14.3 用户控制

- AI 功能可关闭。
- 每次 Run 可停止。
- 每个 Proposal 可逐项拒绝。
- 可查看 Evidence 和变更来源。
- 可撤销已应用的 Graph Proposal（本轮至少保存足够 apply receipt，为后续 undo 提供数据；若本轮实现 undo，则作为加分项）。

---

## 15. 风险与应对

| 风险 | 应对 |
|---|---|
| DSH 开发者预览导致破坏性升级 | 固定版本；AgentRuntime 隔离；contract tests；升级 ADR |
| DSH 默认能力过强 | 自建 Profile；三层工具限制；启动白名单断言 |
| Sidecar 打包复杂 | Phase 0 提前验证；复用现有 bundled Node；进程树测试 |
| Mindmap 与 Commitment 双状态 | 节点只存 entityRef；查询时从 Commitment 投影 |
| Proposal 原子应用跨两种存储 | 全局锁 + apply receipt + 故障注入；必要时引入事务日志 |
| AI 输出不稳定 | 结构化工具 schema；确定性 validator；两次修正上限 |
| 大地图上下文过载 | 分层读取、分页、索引和 context budget |
| 用户看不懂 Agent 过程 | 阶段、工具摘要、Evidence 和明确写入状态，不展示思维链 |
| Codex 配置/认证不可用 | 默认关闭；可选子代理；失败不影响主 Run |

---

## 16. 里程碑与建议工期

按一个高质量实现型 AI 连续执行、每个任务均做测试估算：

| 里程碑 | 包含阶段 | 建议时间 | 可演示结果 |
|---|---|---|---|
| M0 Runtime 可行 | Phase 0 | 2–3 天 | DSH sidecar + 白名单工具 |
| M1 后端闭环 | Phase 1–3 | 5–7 天 | Event fixture → pending Graph Proposal |
| M2 数据落地 | Phase 4 | 3–4 天 | 幂等 Apply + Commitment/Today 同步 |
| M3 用户闭环 | Phase 5–6 | 5–7 天 | EventCanvas 完整 AI 审阅体验 + 恢复 |
| M4 可选增强 | Phase 7 | 1–2 天 | Codex 专家子代理 |
| M5 发布 | Phase 8 | 2–3 天 | Golden、安全、E2E、文档 |

总计约 18–26 个有效开发日。若只做首个可演示 MVP，完成 M0–M3 即可，但不得省略 Proposal、工具白名单、幂等与恢复。

---

## 17. Definition of Done

DailyFlow 2.2 核心工作只有在以下条件全部满足时才算完成：

- DSH 以固定版本 Sidecar 运行，Profile 实际工具清单通过白名单审计。
- Event Operator Run 有持久化状态、事件、取消和恢复。
- AI 能读取受限 Event context，并只通过 `propose_graph_patch` 产出建议。
- Mindmap 能预览 add/update/move/conflict，不在审阅前 autosave。
- Proposal 可逐项编辑/接受/拒绝。
- Apply 幂等、可处理 stale、无半完成实体。
- task/waiting 节点绑定 Commitment，Today 读取同一状态。
- Note 入口不会创建孤立 AI Task。
- 失败信息明确说明是否写入。
- 单元、集成、E2E、golden、安全和 build 全部通过。
- Codex 若未启用，核心产品仍完整可用。

---

## 18. 接手 AI 的第一条执行 Prompt

可把下面这段直接交给实现 AI：

> 你正在实现 DailyFlow 2.2。完整阅读 `docs/DAILYFLOW_2_2_DEEPSEEK_HARNESS_IMPLEMENTATION_PLAN.md`，先执行 DFH-001，不要开始其他任务。检查并保留现有未提交改动，记录当前基线测试结果。完成后只汇报 DFH-001 的修改文件、命令结果、既有失败和下一任务 DFH-002 的前置条件。不得修改运行代码，不得覆盖现有 Word 文档。

后续每轮 Prompt 使用：

> 继续执行 `DFH-XXX`。开始前重新阅读该任务、依赖任务和 Definition of Done；检查 `git status --short`。只完成该任务及必需测试，不提前实现后续 UI/能力。若 DSH 锁定版本 API 与计划示例不同，先更新 ADR 并保持 `AgentRuntime` 契约不变。

---

## 19. 官方技术参考

- DeepSeek Harness 官方仓库：<https://github.com/deepseek-ai/deepseek-harness>
- 官方架构：<https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md>
- 官方扩展 Cookbook：<https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/extension-cookbook.md>
- 官方 Subagent 体系：<https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/subagent.md>
- 官方 Codex 子代理插件：<https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/subagent/subagent-codex/README.md>

技术结论以锁定版本源码为准。DSH 官方明确标注 Developer Preview，预计存在破坏性变化，因此本文把版本锁定、适配层和 contract test 设为发布门槛。
