# ADR-0022：DeepSeek Harness 作为 DailyFlow 的 AI Event Operator Runtime

> 状态：已接受（accepted）
> 日期：2026-08-23
> 决策者：DailyFlow 主架构 + AI 实施
> 关联计划：`docs/DAILYFLOW_2_2_DEEPSEEK_HARNESS_IMPLEMENTATION_PLAN.md`（第 3.2–3.6 节、第 14.1 节）
> 注：本仓库此前无 ADR 序列，这是首个 ADR，编号沿用计划中的 `0022`。

## 背景与问题

DailyFlow 2.2 需要在 Event Mindmap 中唤醒 AI（AI Event Operator），让它读取受限的 Event 上下文，产出「带证据的 Graph Patch Proposal」，再由用户在画布上审阅后原子落地为 Commitment/Today。

我们面临一个选择：是自己从头写一套 Agent Harness（Agent Loop、模型适配、Tool Registry、会话事件、取消、审批、子代理），还是复用现成的 Runtime。

选项：

1. 自研通用 Agent Harness。
2. Fork 一个现成 Harness 并深度改造。
3. 以 DeepSeek Harness（DSH）为主 Runtime，DailyFlow 只通过插件扩展点接入，不持有领域模型之外的基础设施。

## 决策

采用**选项 3**：

- **DeepSeek Harness（DSH）是主 Agent Runtime**，不是"DeepSeek 模型"的代称。DSH 提供 Agent Loop、模型适配、Tool Registry、Session Event、持久化、取消、审批、子代理等通用能力，且这些能力都以插件形式存在。
- **DailyFlow 拥有产品领域模型**（Event、Mindmap、Evidence、Commitment、Proposal、Today）。这些不属于 DSH，也不迁入 DSH。
- **不 Fork、不直接修改 DSH 源码**。只通过 Profile、Bundle、Tool、Hook、Protocol Driver 等官方插件扩展点接入。
- **Codex 是可选的专家子代理**，默认关闭；它不是另一套主 Runtime，也不进入发布必需路径。
- 本版本**不引入第二套生产 Runtime**（不并行实现 DSH、Codex App Server、LangGraph 三套主 Runtime）。

## 约束 / 边界

### AgentRuntime 隔离边界

业务层与 DSH 之间必须经过一个稳定的接口层，业务代码**不得直接 `import` DSH 内部包、不得依赖 DSH 内部类型**：

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
```

实现类：

- `DeepSeekHarnessRuntime`：生产候选。
- `FakeEventOperatorRuntime`：确定性测试替身。

用途：把 DSH 开发者预览期的破坏性 API 变化挡在适配层内，使 DailyFlow 业务逻辑与恢复逻辑不随 DSH 升级而重写。

### Profile 白名单能力

独立 `dailyflow` Profile，不沿用默认 coding profile。**禁用 / 不挂载**：Shell、文件系统读写、Terminal/PTY、任意 MCP 自动发现、Web 浏览、定时任务、默认 coding skills、以及能创建/修改插件或 Profile 的能力。

**必须挂载**：DailyFlow system prompt 插件、DailyFlow typed tool bundle、DailyFlow tool restriction / monotonic guard、DailyFlow session projection 插件、DailyFlow telemetry bridge、ACP/stdio protocol driver、可选 Codex provider（默认关）。

### 归属判断口径（供后续实现查阅）

本 ADR 的验收标准是：**任何后续实现都应能从本节判断"该逻辑属于 DSH 还是 DailyFlow"。**

| 逻辑 | 归属 |
|---|---|
| Agent Loop、模型调用、Tool Registry、Session Event、子代理 | DSH |
| Event / Mindmap / Evidence / Commitment / Proposal / Today 领域模型 | DailyFlow |
| 从 EventId 组装上下文投影（Event Session Projection） | DailyFlow |
| 白名单、scope 注入、result redaction、graph patch 校验 | DailyFlow（Tool Gateway / guard） |
| Proposal 的幂等原子 Apply、revision 冲突、Today 投影 | DailyFlow 服务端 |
| 把 DSH 私有结构映射为 DailyFlow RuntimeEvent | DailyFlow 适配层 |

### 版本锁定与升级门槛

- DSH 固定到明确 npm 版本和 lockfile，**不使用 `latest`**。
- **已核实（2026-08-23）：npm 上的 `deepseek-harness@0.0.1` 是无代码的占位名**（package 体积 438 字节，README 声明 "Reserved package name … The real package will be published here when development completes."）。因此**真实锁定对象不是 `deepseek-harness`**，而是以下真实交付物：
  - `@deepseek-ai/dsh` CLI（profile boot / 插件管理）——锁定 `0.1.1-rc.2`
  - 主仓库 `deepseek-ai/deepseek-harness`（pnpm + cordis-plugin monorepo，约 50 个 `packages/*`），以 `@deepseek-ai/dsh-*` 发布 rc 版本：`dsh-agent`（Agent 接口 / 事件词表）、`dsh-tools`（工具注册）、`dsh-session`（事件溯源会话存储）、`dsh-llm` / `dsh-llm-deepseek`（模型 seam）。
  - `packages/acp` 存在 → 计划第 3.5 节"优先 ACP/stdio"路径成立。
  - `@deepseek-ai/dsh-subagent-codex`（Codex 子代理）。
- DSH 及其 Node runtime 纳入现有 server bundle / sidecar 打包流程。
- 升级 DSH 必须先跑过 runtime contract tests 与 10 个 golden samples。
- 不修改 DSH 源码；若必须临时 patch，停止发布并先评估能否改为插件或上游贡献。
- **供应链前置**：DSH 官方明确标注 Developer Preview，预计存在破坏性变化。若 0.0.1 实际暴露的集成面（ACP/stdio launcher）与计划第 3.5 节示例不一致，以锁定版本官方源码为准，并回写本 ADR，不得把 DSH 私有结构泄漏到业务层。

### 集成方式优先级

1. 官方 ACP 能力或其稳定可嵌入包，通过 JSON-RPC stdio 连接。
2. 若无稳定可嵌入 launcher，按官方 external protocol driver 形态实现 `dailyflow-protocol-stdio` 插件。
3. 不通过解析 CLI 人类可读输出集成；不嵌入 DSH Web UI。

## 后果

### 正向

- 不重复造通用 Harness 基础设施，聚焦 DailyFlow 的可信闭环价值。
- AgentRuntime 契约 + 双实现（Fake / DSH）让 UI 与服务逻辑可离线确定性测试。
- 三层工具防线（Profile → Tool Registry → Execution Guard）挡住 DSH 默认能力过强的风险。

### 负向 / 风险

- DSH 0.0.1 尚处早期：Phase 0 的 sidecar spike（DFH-003/004）是硬性 go/no-go 闸门，其结果直接决定是否继续投入后续阶段。
- Sidecar 打包与进程树管理复杂度偏高，须在 Phase 0 提前验证。
- 依赖 DSH 版本锁定：升级路径受限，需 contract tests + golden 双门槛。

## 参见

- 实施计划：`docs/DAILYFLOW_2_2_DEEPSEEK_HARNESS_IMPLEMENTATION_PLAN.md`
- 官方仓库：<https://github.com/deepseek-ai/deepseek-harness>
- 基线：`docs/implementation/dsh-baseline.md`