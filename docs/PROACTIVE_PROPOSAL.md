# Proactive Proposal — Gap 3（Sprint 1）

> "发现关联任务已逾期 5 天，主动问：要不要排进今天？"

## 设计目的

Sprint 1 路演的三条核心叙事之一。V2 承诺：**当 AI 注意到一个
Commitment 已经逾期 ≥ 5 天时，主动推一张卡片到 Today**——而不是
被动等用户打开 Today 触发 `rollover`。

配合 `proposalService.ts` 与 `reviewerService.ts` 现有的「逾期检测」
能力，本组件只补齐「主动问」这一段——所有写操作仍走 Proposal
口径（用户审批，AI 不直接落库）。

## 三条限制（防骚扰）

任意一条不满足，**直接返回 `[]`，不渲染卡片**：

1. **全局开关** — `config.enabled === false` → 立刻关闭。
2. **静默时段** — `quietHours = { start: 22, end: 8 }`；
   当前本地小时落在窗口内（22:00–08:00）→ 不触发。
3. **每周上限** — `maxPerWeek = 3`；本周已发出的 P2P 提案 ≥ 3
   → 阻塞本轮扫描。

> 这三条是 `docs/ROADSHOW_VS_PRODUCT_GAP.md` 提到的「容易让人觉得
> 太烦」的风险点。设计文档里就已圈定——三种限制缺一不可。

## 触发条件

扫描由客户端在以下时机发起：

```
client ── GET /api/v2/proactive/scan?channel=today_load ──▶ server
server ── loadProactiveConfig + loadProactiveState ──▶ disk
server ── listCommitments + getWaitingOverdue ──▶ repo
server ── scanProactiveProposals(...) ──▶ ProactiveProposal[]
```

触发源（任一）：

| kind               | 触发条件                                                  |
| ------------------ | --------------------------------------------------------- |
| `overdue_task`     | `commitment.dueAt` ≤ now − `overdueTaskDays`（默认 5 天） |
| `stale_commitment` | `waiting` 状态的 `reviewAt` ≤ now − `overdueTaskDays`     |
| `unreviewed_outcome` | 预留（当前 Sprint 未启用）                              |

每条扫描仅按需触发；**服务器启动时不做任何扫描**。

## 触发流程

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 用户打开 Today 主屏幕（仅 today_load 频道）                              │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
        ┌───────────────────────────────────────────┐
        │  TodayProactiveBanner                      │
        │   - activeTab === 'today' && isToday       │
        │   - useEffect → proactiveApi.scan()        │
        └────────────────┬───────────────────────────┘
                         │
                         ▼
        ┌───────────────────────────────────────────┐
        │  GET /api/v2/proactive/scan?channel=...    │
        │   → loadProactiveConfig                    │
        │   → loadProactiveState                     │
        │   → scanProactiveProposals(repo, cfg, ...) │
        └────────────────┬───────────────────────────┘
                         │
              ┌──────────┴──────────┐
              │  3 条限制通过？      │
              └──────────┬──────────┘
              no         │
              ▼          ▼
        ┌──────────┐   ┌─────────────────────────────────────┐
        │  return  │   │  1. 遍历 Commitment：                │
        │  []      │   │     过滤 dueAt ≤ now − overdueDays   │
        └──────────┘   │  2. 遍历 Waiting 超期：              │
                       │     过滤 reviewAt ≤ now − overdueDays │
                       │  3. 过滤本周已 accepted/dismissed    │
                       │  4. 截断到 maxPerWeek 剩余名额       │
                       └───────────────┬─────────────────────┘
                                       │
                                       ▼
                       ┌─────────────────────────────────────┐
                       │  ProactiveProposal[] = {            │
                       │    id, kind, title, body,           │
                       │    severity, suggestions[]          │
                       │  }                                  │
                       └───────────────┬─────────────────────┘
                                       │
                                       ▼
                       ┌─────────────────────────────────────┐
                       │  服务端 bookkeeping：                │
                       │  把 proposalId 写入 history（按周） │
                       └───────────────┬─────────────────────┘
                                       │
                                       ▼
                       ┌─────────────────────────────────────┐
                       │  ProactiveSuggestionsCard 渲染：     │
                       │  - 0 张 → null                      │
                       │  - 1 张 → 单卡                       │
                       │  - 2–3 张 → 全展开                   │
                       │  - 4+ 张 → 折叠 + 「展开其余 N」     │
                       └───────────────┬─────────────────────┘
                                       │
                                       ▼
        ┌───────────────────────────────────────────────────────┐
        │ 用户点击 × （关闭建议）  → POST /proactive/:id/action │
        │                       action = 'dismissed'           │
        │ 用户点击「排进今天」     → 父级 callback                │
        │                       → POST /proactive/:id/action   │
        │                          action = 'accepted'         │
        └───────────────────────────────────────────────────────┘
```

## 持久化

| 文件                                          | 内容                                          |
| --------------------------------------------- | --------------------------------------------- |
| `~/.dailyflow/proactive.json`                 | 用户配置（enabled / quietHours / maxPerWeek / overdueTaskDays） |
| `~/.dailyflow/proactive_history.json`         | 提案历史（proposalId / kind / entityId / channel / firedAt / outcome / resolvedAt），服务端 bookkeeping 用 |

测试可通过 `DAILYFLOW_PROACTIVE_CONFIG_FILE` /
`DAILYFLOW_PROACTIVE_HISTORY_FILE` 覆盖路径，避免污染主机上的真实
配置。

## 用户怎么关闭

三种独立手段，任意一种即可：

1. **设置面板** → 通用 → 「主动提案」区块 → 关掉「启用主动提案」开关。
2. **把 maxPerWeek 调到 0**（保留配置，仅关闭触发）。
3. **调大静默时段** 覆盖整个 24 小时（start = 0, end = 24）。

数据层不删除历史，已发出的 dismissed / accepted 记录保留，方便后续
做「每周回了 AI 几条建议」的统计。

## API 速查

```
GET    /api/v2/proactive/config
PUT    /api/v2/proactive/config
GET    /api/v2/proactive/scan?channel=today_load|ai_chat_open|app_start
POST   /api/v2/proactive/:id/action   { action: 'accepted' | 'dismissed' }
```

四个端点：

- 都不阻塞 v2 启动；
- 都不写 v1 数据；
- 都不影响现有 Proposal 系统的语义；
- 都是按需触发，服务器启动时是 idle 状态。

## 与现有 Proposal 系统的关系

| 维度              | 本组件（Proactive）                  | 现有 Proposal 系统                       |
| ----------------- | ------------------------------------ | ---------------------------------------- |
| 触发主体           | **AI 主动**（扫描仓库）              | 用户/AI 都可（多数是 AI 提取）            |
| 写入路径           | POST `/proactive/:id/action`         | POST `/proposals/:id/accept` + `applyProposal` |
| 应用对象           | 单一 commitment（move/dismiss）      | 任意 transition / create / update        |
| 写入引擎           | 父级回调，复用现有 Commitment 端点   | `applyProposal` 状态机                   |
| 历史保留           | `proactive_history.json`（轻量）     | `audit.log`（永久）                      |

两套系统**互不重叠**。Proactive 只负责「提出建议」，真实的写库仍走
`/proposals/:id/accept` 或 `/commitments/:id/...` 端点。

## 关键文件

- `server/services/v2/proactiveProposal.ts` — 扫描、配置、历史、行动记录
- `server/routes/v2/index.ts` — 4 个 v2 路由
- `src/api/client.ts` — `proactiveApi` + 类型
- `src/components/ProactiveSuggestionsCard.tsx` — 视觉卡片
- `src/components/TodayProactiveBanner.tsx` — 取数 + 状态封装
- `src/components/ProactiveSettingsSection.tsx` — 设置面板子区块
- `src/components/ProactiveSuggestionsCard.proactive.test.tsx` — 3 个 case
- `server/services/v2/__tests__/proactiveProposal.test.ts` — 7 个 case
