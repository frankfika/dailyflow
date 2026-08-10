# DailyFlow Event-first 实施 Runbook

> 版本：2026-08-10  
> 状态：可执行工程计划，尚未授权实施  
> 受众：低成本 AI 编码模型、代码审查者、测试执行者  
> 产品依据：[`EVENT_FIRST_PRODUCT_UPGRADE_PLAN.md`](./EVENT_FIRST_PRODUCT_UPGRADE_PLAN.md)  
> 执行方式：严格按任务编号串行推进；一个任务一个提交；不得自行扩大范围。

---

## 0. 这份文档怎么用

这不是方向讨论稿，而是编码操作手册。执行模型每次只接收一个 `EFP-*` 任务，完成、测试并交接后，才可领取下一个任务。

每次给编码模型的提示词必须包含：

```text
请执行 docs/EVENT_FIRST_IMPLEMENTATION_RUNBOOK.md 中的任务 EFP-xxx。
只执行该任务，不提前做后续任务。
遵守“全局执行协议”“冻结契约”和该任务的 Allowed files / Forbidden changes。
完成后按“标准交接模板”报告；没有测试证据不得声称完成。
```

不得只把整份文档扔给模型并要求“一次做完”。本计划有意把工作拆成小提交，以降低模型遗漏、误删和跨层双写的概率。

### 0.1 任务状态

- `TODO`：未开始；
- `DOING`：当前唯一执行中的任务；
- `BLOCKED`：契约或现状冲突，停止写代码并报告；
- `DONE`：代码、测试、证据全部齐全。

任何时刻最多一个任务处于 `DOING`。

### 0.2 标准交接模板

执行模型完成每个任务后必须原样填写：

```text
Task ID:
Result: DONE | BLOCKED
Files changed:
- path

Contract checks:
- [ ] 没有修改本任务禁止修改的接口
- [ ] 没有删除或重写用户旧数据
- [ ] 没有顺手实现后续任务

Tests run:
- command -> PASS/FAIL（数量）

Acceptance evidence:
- 验收项 -> 对应测试名、截图路径或响应样例

Known risks / unrelated failures:
Next allowed task:
```

---

## 1. 全局执行协议

以下规则适用于所有任务，优先级高于单个任务里的模糊描述。

### 1.1 开始前必须做

1. 阅读当前任务的 `Read first` 文件全文；
2. 运行 `git status --short`，把现有改动视为用户资产；
3. 运行任务指定的基线测试；
4. 确认依赖任务均为 `DONE`；
5. 只将当前任务列出的文件设为可修改范围。

### 1.2 修改规则

- 使用 `apply_patch` 修改源码；格式化器产生的机械改动除外；
- 保留用户已有未提交修改，不覆盖、不回滚、不重排无关代码；
- 不新增数据库，不把 Markdown 改成唯一以外的数据源；
- 不重命名 `.dailyflow/mindmaps`、Topic Space 文件或 Daily Markdown 路径；
- 不复制 `TopicSpace`、`MindMap`、Task 的读写逻辑到 React 组件；
- Event-derived Task 的所有写操作最终只能经过 `EventExecutionService`；
- 旧 `/api/topic-spaces`、`/api/mindmaps`、`/api/tasks` 在 EFP-502 前必须继续工作；
- 不删除未知 JSON 字段或 Markdown 标记；
- 不把日期、状态、Work/Life、Event 路径写成标签；
- 不引入新的状态管理库、UI 组件库或数据库依赖；
- 不新增渐变、重阴影、全屏动画。延续当前 Native Minimal 视觉：低对比、紧凑、边框分区、200–350ms 克制动效；
- 核心交互必须支持键盘，动画必须尊重 `prefers-reduced-motion`。

### 1.3 禁止“顺手优化”

执行模型不得：

- 清理与当前任务无关的 TypeScript 警告；
- 统一全仓命名或格式；
- 提前删除旧 UI；
- 把 `App.tsx` 全量重构；
- 修改现有测试使失败消失，但不修复行为；
- 用 mock 替代本应验证的真实文件读写；
- 因为接口难实现而改变本文件冻结的字段名或状态码。

### 1.4 必须停止并报告的情况

出现以下任一情况，任务标记为 `BLOCKED`，不得自行改契约：

1. `Read first` 文件已经被其他提交大幅改写，任务步骤无法对应；
2. 需要修改 `Allowed files` 之外的生产文件才能完成；
3. 需要删除、覆盖或批量重写真实用户数据；
4. 目标接口与已完成任务的契约测试冲突；
5. 基线测试在修改前已失败，且失败会掩盖本任务结果；
6. 迁移 dry-run 与实际计数不一致；
7. 同一节点可能生成两个活动 Task，且无法由现有标记判定真相。

允许在交接报告中提出“需要新增哪个文件、为什么”，由上一级模型或人确认后再修订任务范围。

---

## 2. 不可重新解释的产品契约

### 2.1 用户模型

```text
Event = 一件需要持续思考和拆解的事情
Mind Map = Event 的主要工作界面，不是独立产品入口
Today = 某一天的执行投影视图
Event-derived Task = 已安排日期的 Event Node 投影，不是第二份用户实体
Standalone Task = 不需要 Event 上下文的一次性小事
```

固定闭环：

```text
创建 Event → 导图拆解 → 节点安排 Today/Date
→ Today 完成 → 原节点完成 → Event 进度变化
```

### 2.2 页面职责

| 页面 | 只回答 | 默认允许显示 | 默认禁止显示 |
|---|---|---|---|
| Today | 今天做什么 | checkbox、标题、Event 路径、必要日期状态 | 规划卡片、导图预览、标签墙、绑定关系 |
| Events | 我正在推进什么 | Event 标题、进度、更新时间、最多 2 个标签 | TopicSpace、MindMap 技术概念 |
| Event Detail | 这件事如何拆解 | 一个主画布、Child、Today、Date、More | Topic Tabs、Map List、导图/列表切换、Promote/Link/Unlink |

### 2.3 导航

一级入口顺序固定：

```text
Today
Events
Notes
Ask AI
```

`More` 中只放 `Calendar / Memory / Settings`。产品切换完成后不再出现 `Mind Map` 一级入口。

### 2.4 过渡期真相来源

首轮不改物理存储，采用适配：

```text
Event.id                  = TopicSpace.id
Event.rootNodeId          = TopicSpace.mindmapId 对应 MindMap.rootId
EventNode                 = MindMapNode
Event-derived execution   = MindMapNode.taskId/taskDate + 带 origin markers 的 Daily Task
Standalone Task           = 没有 originMindmapId/originNodeId 的 Daily Task
```

领域真相规则：

1. 用户可见的标题、完成状态、安排日期以 Event Node 为领域真相；
2. Daily Task 是兼容存储所需的执行投影；
3. React 不得先写 Node、再写 Task，或反过来；
4. `EventExecutionService` 在一次命令里维护两边；
5. 读取时发现冲突，返回 `integrity` 信息，不静默造一份新 Task。

---

## 3. 冻结 TypeScript 契约

EFP-001 必须按以下字段建立服务端和客户端类型。后续任务不得改名；只能在评审后增加可选字段。

```ts
export type EventContext = 'work' | 'life';
export type EventStatus = 'active' | 'completed' | 'archived';
export type ExecutionStatus = 'todo' | 'done';
export type TagSuggestionState = 'suggested' | 'accepted' | 'rejected';

export interface SuggestedTag {
  value: string;
  source: 'ai';
  confidence: number;
  state: TagSuggestionState;
}

export interface EventSummary {
  id: string;
  title: string;
  context: EventContext;
  status: EventStatus;
  progress: { done: number; total: number };
  effectiveTags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface EventExecution {
  taskId: string;
  status: ExecutionStatus;
  scheduledDate: string;
  deadline?: string;
  priority?: 'high' | 'medium' | 'low';
  completedAt?: string;
}

export interface EventNode {
  id: string;
  eventId: string;
  parentId?: string;
  text: string;
  note?: string;
  position: { x: number; y: number };
  collapsed?: boolean;
  manualTags: string[];
  aiTags: SuggestedTag[];
  execution?: EventExecution;
}

export interface EventDetail extends EventSummary {
  /** Compatibility storage id. Never render this value or label it as MindMap in Event UI. */
  mindmapId: string;
  rootNodeId: string;
  nodes: EventNode[];
  edges: Array<{ id: string; source: string; target: string }>;
  manualTags: string[];
  aiTags: SuggestedTag[];
  integrity: {
    missingMap: boolean;
    sourceContextWasUnclassified: boolean;
    orphanTaskIds: string[];
    duplicateNodeTaskIds: string[];
  };
}

export interface StandaloneTask {
  id: string;
  title: string;
  status: ExecutionStatus;
  scheduledDate: string;
  deadline?: string;
  note?: string;
  manualTags: string[];
  aiTags: SuggestedTag[];
}

export type TodayItem =
  | {
      kind: 'event-node';
      id: string; // `event-node:${eventId}:${nodeId}`
      eventId: string;
      nodeId: string;
      taskId: string;
      title: string;
      status: ExecutionStatus;
      scheduledDate: string;
      eventTitle: string;
      path: Array<{ id: string; text: string }>;
      effectiveTags: string[];
      deadline?: string;
      priority?: 'high' | 'medium' | 'low';
    }
  | {
      kind: 'standalone';
      id: string; // `standalone:${taskId}`
      taskId: string;
      title: string;
      status: ExecutionStatus;
      scheduledDate: string;
      effectiveTags: string[];
      deadline?: string;
      priority?: 'high' | 'medium' | 'low';
    };
```

### 3.1 适配规则

- `TopicSpace.status === 'paused'` 在 Event API 中映射为 `active`，不回写；
- `unclassified` Topic Space 读取时使用 `loadConfig().activeContext ?? 'work'` 作为 Event context，并设置 `integrity.sourceContextWasUnclassified = true`；不得把该推导值写回；
- MindMap root node 必须作为 Event root，root 不可安排；
- `MindMapNode.tags` 映射为 `manualTags`，缺失时返回 `[]`；
- 首轮 `aiTags` 返回 `[]`，EFP-402 才持久化；
- `kind: 'tag'` 仍渲染为普通 Event Node，其 `tag` 值加入该节点 `manualTags`，不在 UI 暴露 kind；
- 节点同时具有 `taskId` 与可解析 Task 时才返回 `execution`；
- 节点有 `taskId` 但 Task 不存在时，不返回 execution，并将 taskId 放入 `orphanTaskIds`；
- 同一 taskId 被多个节点引用时，全部列入 `duplicateNodeTaskIds`，写命令返回 409；
- Event 进度只统计存在 `execution` 的非 root 节点；`total === 0` 时 UI 显示“尚未安排”，不能显示 `0%`。

---

## 4. 冻结 HTTP 契约

所有错误保持现有 v1 风格：`{ "error": "message" }`。路径参数一律 `encodeURIComponent`。日期必须匹配 `/^\d{4}-\d{2}-\d{2}$/`，还必须能被解析为真实日历日期。

### 4.1 Event 读取与编辑

```text
GET    /api/events?context=work|life&status=active|completed|archived&query=text
POST   /api/events
GET    /api/events/:eventId
PUT    /api/events/:eventId
```

```ts
// POST
{ title: string; context: EventContext; manualTags?: string[] }
// -> 201 EventDetail

// PUT，只允许以下字段
{ title?: string; status?: EventStatus; context?: EventContext; manualTags?: string[] }
// -> 200 EventDetail

// GET list -> 200 EventSummary[]
// GET detail -> 200 EventDetail
```

状态码：400 输入错误；404 Event/Map 不存在；409 数据关系冲突；500 未知错误。

### 4.2 Node 执行命令

```text
PUT    /api/events/:eventId/nodes/:nodeId/schedule
DELETE /api/events/:eventId/nodes/:nodeId/schedule
PUT    /api/events/:eventId/nodes/:nodeId/status
```

```ts
// schedule / reschedule
{ date: string }
// -> 200 { event: EventDetail; node: EventNode; todayItem: TodayItem }

// unschedule DELETE，无 body
// -> 200 { event: EventDetail; node: EventNode }

// complete / reopen
{ status: 'todo' | 'done' }
// -> 200 { event: EventDetail; node: EventNode }
```

幂等规则：

- 同一节点重复安排到同一天：返回 200，复用原 taskId，不新增 Markdown 行；
- 已安排节点改到另一日期：移动同一 taskId，不复制；
- 未安排节点取消安排：返回当前 Event，200；
- 同一状态重复完成/恢复：200；
- root 安排：400；
- Event、node 或投影 Task 缺失：404；
- 重复关联或关系冲突：409，不自动修复。

### 4.3 Today 读取

```text
GET /api/today/:date?context=work|life
```

```ts
{
  date: string;
  items: TodayItem[];
  integrity: { orphanDerivedTaskIds: string[] };
}
```

排序固定：deadline 升序（缺失最后）；priority 按 high/medium/low/缺失；Event-derived 再按 eventTitle 和树前序；Standalone 最后按 Daily 文件原顺序。

### 4.4 Standalone 转 Event

```text
POST /api/tasks/:taskId/convert-to-event
{ date: string; context: EventContext }
// -> 201 { event: EventDetail; conversionId: string; undoUntil: string }

POST /api/task-event-conversions/:conversionId/undo
// -> 200 { restoredTaskId: string; date: string }
```

撤销过期或新 Event 已发生用户编辑时返回 409，绝不覆盖新内容。

---

## 5. 缓存键和失效规则

在 `src/queryKeys.ts` 增加且只增加：

```ts
eventsRoot: () => ['events'] as const,
events: (filters: object = {}) => ['events', 'list', filters] as const,
event: (id: string) => ['events', 'detail', id] as const,
todayItems: (date: string, context: string) => ['today-items', date, context] as const,
```

| 命令 | 直接写缓存 | 必须失效 |
|---|---|---|
| create/update Event | `event(id)` | `eventsRoot()` |
| schedule/reschedule | `event(id)` | `eventsRoot()`、旧/新日期 `todayItems`、`tasksRoot()` |
| complete/reopen | `event(id)` | `eventsRoot()`、节点日期 `todayItems`、`tasksRoot()` |
| unschedule | `event(id)` | `eventsRoot()`、旧日期 `todayItems`、`tasksRoot()` |
| standalone create/edit/delete | 无 | 对应日期 `todayItems`、`tasksRoot()` |
| standalone convert/undo | 转换时写 `event(id)` | `eventsRoot()`、对应日期 `todayItems`、`tasksRoot()` |

不得使用 `queryClient.clear()`；不得失效整个 workspace 的 Notes、AI 或 Calendar 缓存。

---

## 6. 文件与架构边界

### 6.1 新增文件目标

```text
server/types/event.ts
server/services/eventAdapter.ts
server/services/eventExecution.ts
server/services/today.ts
server/routes/events.ts
server/routes/today.ts
server/routes/__tests__/events.test.ts
server/routes/__tests__/eventExecution.test.ts
server/services/__tests__/eventAdapter.test.ts
server/services/__tests__/eventExecution.test.ts
server/services/__tests__/today.test.ts

src/hooks/useEvents.ts
src/components/Events/EventsIndex.tsx
src/components/Events/EventDetail.tsx
src/components/Events/EventNodeActions.tsx
src/components/Events/*.test.tsx
```

### 6.2 复用而非重写

- Event 创建复用 `createTopicSpace`，由它创建 1:1 MindMap；
- 树和布局存储复用 `server/services/mindmaps.ts`；
- Daily 文件读写复用 `readDailyNote`、`writeDailyNote`、parser 与 `withDateLock`；
- 画布先复用 `MindMapCanvas`，不要复制一份 EventCanvas；
- Standalone Task 继续复用 `/api/tasks`；
- 旧 `TopicTabs`、`TaskListView`、`MindMapList` 先保留文件，只从新 Event 路径断开。

---

## 7. 依赖图与发布门

```text
EFP-000
  ↓
EFP-001 → EFP-002 → EFP-003 → EFP-004
                              ↓
EFP-101 → EFP-102 → EFP-103 → EFP-104 → EFP-105
                                          ↓
EFP-201 → EFP-202 → EFP-203 → EFP-204 → EFP-205
                                          ↓
EFP-301 → EFP-302 → EFP-303
                         ↓
EFP-401 → EFP-402
              ↓
EFP-501 → EFP-502 → EFP-503
```

- Gate A（EFP-004 后）：Event adapter/API 在 flag 关闭时不影响旧 UI；
- Gate B（EFP-105 后）：可创建、浏览、编辑 Event，但旧入口仍可回退；
- Gate C（EFP-205 后）：Node → Today → Complete 闭环幂等；
- Gate D（EFP-303 后）：Today 完成极简化，Standalone 可升级；
- Gate E（EFP-402 后）：标签不增加默认视觉噪声，AI 失败不阻塞；
- Gate F（EFP-503 后）：迁移报告通过，才默认开启并移除旧入口。

---

## 8. 原子任务卡

## EFP-000 — 冻结基线与测试清单

**Goal**：记录实施前仓库和数据能力，不改产品代码。  
**Depends on**：无。

**Read first**：`package.json`、产品升级规划、`server/types/{topicSpace,mindmap,task}.ts`、`server/routes/{topicSpaces,mindmaps,tasks}.ts`、本文第 1–7 节。

**Allowed files**

- 新建 `docs/event-first/BASELINE.md`
- 新建 `docs/event-first/ACCEPTANCE_CHECKLIST.md`

**Forbidden changes**：所有 `src/`、`server/`、`e2e/` 文件；不读取用户真实正文到文档。

**Steps**

1. 记录当前分支、commit hash、Node/npm 版本；
2. 记录现有相关测试文件及测试数；
3. 运行并记录下面命令；
4. 在 checklist 中逐项抄录 Gate A–F，不增删验收含义；
5. 不把临时路径、API key、任务正文写进文档。

```bash
npm run lint
npx vitest run server/services/__tests__/mindmap-v2.test.ts server/routes/__tests__/mindmapNodeTask.test.ts server/routes/__tests__/tasksSpace.test.ts src/hooks/useMindMapActions.test.tsx src/components/MindMap/NodeContextMenu.test.tsx src/__tests__/components/TodayBacklog.test.tsx
npm run build
```

**Done when**：两份文档存在，三个命令均有日期、PASS/FAIL、数量记录；无生产代码 diff。

---

## EFP-001 — 建立 Event 类型、feature flag 与查询键

**Goal**：只建立契约，不添加路由或 UI。  
**Depends on**：EFP-000。

**Read first**：`server/types/task.ts`、`server/services/v2/featureFlags.ts`、`src/api/client.ts` 顶部类型区、`src/features/v2/api/client.ts` 的 `V2Status`、`src/queryKeys.ts`、本文第 3、5 节。

**Allowed files**

- 新建 `server/types/event.ts`
- `server/types/task.ts`
- `server/services/v2/featureFlags.ts`
- `src/api/client.ts`
- `src/features/v2/api/client.ts`
- `src/queryKeys.ts`
- 新建或修改 feature flag 单测

**Steps**

1. 将第 3 节服务端类型原样放入 `server/types/event.ts`；
2. 在 `Config.v2`、`V2Flags`、`V2Status.flags` 增加 `eventFirst?: boolean` / `eventFirst: boolean`；
3. 默认值设为 `false`，直到 EFP-503；
4. 在 `src/api/client.ts` 添加同形 Event/Today 类型与 `ConfigData.v2`，不删除旧类型；
5. 添加第 5 节四个 query key；
6. 加测试证明旧 config 缺字段时为 false，显式 true 时为 true。

**Forbidden changes**：不渲染 Events；不新增 fetch；不改其他 v2 flag 默认值；不把 eventFirst 放到 localStorage。

```bash
npx vitest run server/services/v2/__tests__/featureFlags.test.ts
npm run lint
```

**Done when**：类型编译通过；flag 默认 false；旧 config fixture 不报错。

---

## EFP-002 — 实现只读 Event Adapter

**Goal**：将 TopicSpace + MindMap + 跨日期 Task 组合为 Event read model，零写盘。  
**Depends on**：EFP-001。

**Read first**：`server/services/topicSpaces.ts`、`mindmaps.ts`、`taskIndex.ts`、`server/types/event.ts`、`mindmap-v2.test.ts`。

**Allowed files**

- 新建 `server/services/eventAdapter.ts`
- 新建 `server/services/__tests__/eventAdapter.test.ts`

**Required exports**

```ts
listEvents(filters: { context?: EventContext; status?: EventStatus; query?: string }): Promise<EventSummary[]>
getEvent(eventId: string): Promise<EventDetail | null>
computeEventProgress(nodes: EventNode[]): { done: number; total: number }
buildNodePath(event: EventDetail, nodeId: string): Array<{ id: string; text: string }>
```

**Steps**

1. 使用 `listTopicSpaces/getTopicSpace`，不要直接解析 workspace 文件；
2. 使用 `getMindMap` 读取唯一主图；
3. 使用 `resolveTasksWithDates(space.taskIds)` 建 taskId 索引；
4. 按第 3.1 节映射节点、execution、integrity；
5. parentId 只由第一条 `edge.target === node.id` 的边计算；检测环时停止路径，不无限循环；
6. summary 的 effectiveTags 此阶段只返回 Event manualTags 去重结果；
7. list 排序：active 在前、updatedAt 降序、title 兜底；
8. 所有函数只读，测试对文件内容前后相等。

**Required tests**：v1 map；正常聚合；linked execution；orphan；duplicate taskId；missing map；progress；路径环；读取零写盘。

```bash
npx vitest run server/services/__tests__/eventAdapter.test.ts server/services/__tests__/mindmap-v2.test.ts
npm run lint
```

**Done when**：所有映射和 integrity 测试通过，adapter 无写调用。

---

## EFP-003 — 新增 Event REST 读取/创建/编辑 facade

**Goal**：UI 可以只说 Event，不接触 TopicSpace API。  
**Depends on**：EFP-002。

**Read first**：`server/routes/topicSpaces.ts`、`server/index.ts`、event adapter、TopicSpace create/update。

**Allowed files**

- 新建 `server/routes/events.ts`
- 新建 `server/routes/__tests__/events.test.ts`
- `server/index.ts`
- `server/services/eventAdapter.ts`（只可增加创建/更新 facade）

**Steps**

1. 在 `/api/events` 挂载 router，位置邻近 mindmaps/topic-spaces；
2. 实现第 4.1 节四个 endpoint；
3. create 调 `createTopicSpace({ title, context, tags })`，再 `getEvent` 返回 EventDetail；
4. update 只白名单映射 title/status/context/tags；
5. 严格校验空标题、context、status、manualTags 字符串数组；
6. 不接受客户端 id、mindmapId、nodes、edges；
7. route 测试采用现有 in-process Express + 临时 workspace 模式。

**Required tests**：list filters；create 201 有 root；detail；update；invalid 400；missing 404；注入 id/mindmapId 被忽略；旧 routes 测试继续通过。

```bash
npx vitest run server/routes/__tests__/events.test.ts server/routes/__tests__/mindmapNodeTask.test.ts server/routes/__tests__/tasksSpace.test.ts
npm run lint
```

**Done when**：Event facade 可用，旧 route 未改契约。

---

## EFP-004 — 客户端 eventsApi 与 useEvents

**Goal**：React 获得稳定 Event 读取/编辑接口；尚不改页面。  
**Depends on**：EFP-003。

**Read first**：`src/api/client.ts` 的 topicSpacesApi/mindmapsApi、`src/hooks/useTopicSpaces.ts`、`useMindMapActions.test.tsx`、本文第 4.1、5 节。

**Allowed files**

- `src/api/client.ts`
- 新建 `src/hooks/useEvents.ts`
- 新建 `src/hooks/useEvents.test.tsx`

**Required exports**：`eventsApi.list/get/create/update`、`useEvents`、`useEvent`、`useCreateEvent`、`useUpdateEvent`。

**Steps**

1. fetch 路径和错误处理沿用 `httpError`；
2. query key 使用第 5 节，不复用 topicSpaces key；
3. create/update 成功按第 5 节写 detail cache、失效 list；
4. flag 判断不放在 hook 内；
5. hook 测试验证 exact query key 和失效范围。

```bash
npx vitest run src/hooks/useEvents.test.tsx src/hooks/useMindMapActions.test.tsx
npm run lint
npm run build
```

**Gate A**：flag false 时无页面变化；旧全量单测通过。

---

## EFP-101 — 导航增加 Events 与受控 surface

**Goal**：flag true 时出现 Events；flag false 时行为保持旧版。  
**Depends on**：EFP-004。

**Read first**：`src/App.tsx` 的 config/activeTab/render、`Sidebar.tsx`、Sidebar tests、smoke E2E。

**Allowed files**：`src/App.tsx`、`src/components/Sidebar.tsx`、Sidebar 单测、`e2e/smoke.spec.ts`。

**Steps**

1. activeTab union 增加 `'events'`；
2. App 从 `config.v2?.eventFirst === true` 得到布尔值，不另建本地开关；
3. flag true：一级导航顺序 Today、Events、Notes、Ask AI；More 为 Calendar、Memory、Settings；不显示 Mind Map；
4. flag false：保持当前导航；
5. Events render 分支先显示静态空壳：标题和 loading/empty 占位；
6. 添加 `nav-events`、`events-surface` testid；
7. 移动端沿用已有 sidebar 收起规则。

**Forbidden changes**：不删除 mindmap render 分支；不改 Today；本任务不请求 events API。

```bash
npx vitest run src/__tests__/components/Sidebar.test.tsx
npx playwright test e2e/smoke.spec.ts --workers=1
npm run lint
```

**Done when**：测试同时覆盖 flag true/false 导航。

---

## EFP-102 — Events 首页

**Goal**：列出、创建和打开 Event。  
**Depends on**：EFP-101。

**Allowed files**

- 新建 `src/components/Events/EventsIndex.tsx` 与 `.test.tsx`
- `src/App.tsx`
- `src/index.css`（只加 `.events-*` scoped styles）

**UI contract**：顶部 `Events + New Event`；Active 卡片只含 title、进度或“尚未安排”、updatedAt、最多 2 tags；Completed 折叠；Archived 不在首屏；空态唯一 CTA；创建成功立即打开详情。

**Steps**

1. 组件接收 context/language/onOpenEvent，不直接读取 App 全局 state；
2. 使用 `useEvents({ context })`；
3. 覆盖 loading/error/empty/data 四态；
4. 创建只收 title，context 取当前 context；
5. 禁止显示 TopicSpace、MindMap、taskIds、kind；
6. 使用现有 CSS variables、8–12px radius、hairline border，无渐变/大阴影。

```bash
npx vitest run src/components/Events/EventsIndex.test.tsx
npm run lint
```

**Done when**：四态与创建自动打开均有测试。

---

## EFP-103 — Event 详情壳与单画布

**Goal**：进入 Event 后只看到一个主导图，不出现双层导航。  
**Depends on**：EFP-102。

**Read first**：`MindMapView.tsx`、`MindMapCanvas.tsx`、`MindMapList.tsx`、App 当前 mindmap render。

**Allowed files**

- 新建 `src/components/Events/EventDetail.tsx` 与 `.test.tsx`
- `src/components/MindMap/MindMapView.tsx`
- `src/App.tsx`
- `src/index.css` scoped Event styles

**Steps**

1. 给 MindMapView 增加 `mode: 'legacy' | 'event'`，默认 legacy；
2. event mode 接收固定 mindmapId，只加载这一张图；
3. event mode 不渲染 MindMapList、模板选择、第二地图选择；
4. EventDetail 顶栏只显示 Back、Event title、Search、More；
5. 不挂载 TopicTabs、TagFilterRow、TaskListView；
6. 保留 autosave、undo/redo、布局和 node edit，不复制实现；
7. App 保存 activeEventId；返回或切 context 时清空；
8. 缺 map 显示 integrity error，不自动创建图。

```bash
npx vitest run src/components/Events/EventDetail.test.tsx src/components/MindMap/MindMapView.autosave.test.tsx src/components/MindMap/MindMapView.mirror.test.tsx
npm run lint
```

**Done when**：Event 首屏只有顶栏和一个 canvas；legacy 测试不变。

---

## EFP-104 — 节点操作改为用户语义

**Goal**：Event mode 不暴露 Promote/Link/Unlink/Tag kind。本任务只改 UI 语义。  
**Depends on**：EFP-103。

**Allowed files**

- 新建 `src/components/Events/EventNodeActions.tsx` 与 `.test.tsx`
- `MindMapCanvas.tsx`、`MindMapNode.tsx`
- `NodeContextMenu.tsx`（仅增加 mode 分支，legacy 行为不变）

**UI contract**

- 非 root：`Child / Today / Date / More`；root：`Child / More`；
- 已安排节点：checkbox + 日期；More 为 Reschedule、Unschedule、Delete node；
- 普通节点不显示 Branch/Tag/Task 徽标；
- Today/Date 暂由父组件传 stub，显示未接通 info toast；不得调用旧 promote endpoint 冒充新命令。

```bash
npx vitest run src/components/Events/EventNodeActions.test.tsx src/components/MindMap/NodeContextMenu.test.tsx src/components/MindMap/MindMapView.mirror.test.tsx
npm run lint
```

**Done when**：event mode 零旧术语，legacy context menu 原测试全过。

---

## EFP-105 — Gate B 视觉与响应式验收

**Goal**：只补 Event UI E2E/视觉证据，不加功能。  
**Depends on**：EFP-104。

**Allowed files**：新建 `e2e/events.spec.ts`、`e2e/event-detail-visual.spec.ts`；如定位器缺失，只可在 Event 组件加 testid/aria-label。

**Scenarios**

1. flag true：打开 Events、创建 Event、自动进入详情；
2. 添加三层节点并保存，刷新后仍存在；
3. 详情不存在 Topic Tabs、Map List、view switch、Promote/Link；
4. 1440×900、1024×768、390×844 均看到 Back 和核心节点操作；
5. flag false：旧 Mind Map smoke 仍可运行。

```bash
npx playwright test e2e/events.spec.ts e2e/event-detail-visual.spec.ts --workers=1
npm test
npm run build
```

**Gate B**：场景全过，截图路径写入交接报告。

---

## EFP-201 — EventExecutionService：schedule / reschedule / unschedule

**Goal**：建立唯一投影写服务，保证一个 node 最多一个活动 Task。  
**Depends on**：EFP-105。

**Read first**：`server/routes/mindmaps.ts` 的 promote、`server/routes/tasks.ts` 的 delete/status、`server/services/{parser,taskMetadata,taskIndex,lock,fileSystem,mindmaps,topicSpaces}.ts`、本文第 4.2 节。

**Allowed files**

- 新建 `server/services/eventExecution.ts`
- 新建 `server/services/__tests__/eventExecution.test.ts`
- `server/services/lock.ts`（仅在确需有序双日期锁时增加 helper 与测试）

**Required exports**

```ts
scheduleNode(eventId: string, nodeId: string, date: string): Promise<EventCommandResult>
rescheduleNode(eventId: string, nodeId: string, date: string): Promise<EventCommandResult>
unscheduleNode(eventId: string, nodeId: string): Promise<EventCommandResult>
```

**Algorithm: schedule**

1. 所有 schedule/reschedule/unschedule/status 命令先进入以 `${eventId}:${nodeId}` 为 key 的进程内 promise queue；检查与写入都必须在该锁内；
2. 校验日期；重新读取 Event；拒绝 root/missing/duplicate integrity；
3. execution 日期相同：返回现有结果，不写盘；
4. execution 日期不同：调用同一锁内的 reschedule 私有实现，不能再次获取相同 node lock；
5. 无 execution：只生成一次 `t_${ulid()}`；
6. 在日期锁内保存 Daily Note 原内容，再 append Task 并写 space/origin markers；
7. 更新 node 的 `kind:'task'`、taskId、taskDate、status、planOrder，再把 taskId 幂等加入 TopicSpace；
8. 第 7 步任一写入失败时，按逆序补偿 TopicSpace、Node、Daily Note；补偿失败抛出 message 以 `integrity_repair_required:` 开头的 500 错误；
9. 成功或补偿完成后 invalidate index；任何失败都不得用第二个 taskId 重试。

**Algorithm: reschedule**

1. 相同日期直接返回；
2. 以字典序获取两个日期锁，避免 A→B 与 B→A 死锁；
3. 读取完整 Task；目标文件已有同 id 则 409；
4. 目标 append 同一 id/metadata，原文件删除对应行；
5. 两文件成功后更新 node.taskDate；
6. 文件写失败用内存原内容补偿；补偿失败抛 message 以 `integrity_repair_required:` 开头的 500 错误，不伪装成功；
7. invalidate index。

**Algorithm: unschedule**

1. 无 execution 直接 200 no-op；
2. 从 taskDate 删除 Task 行；
3. 保留 node，清 taskId/taskDate/planOrder，status 回 todo，kind 回 branch；
4. 从 TopicSpace.taskIds 移除；invalidate index。

**Required tests**：新 schedule；同日重复；跨日保持 taskId/内容；目标冲突；并发 schedule；unschedule 保留 node；重复 no-op；root/日期/orphan/duplicate；写失败补偿。

```bash
npx vitest run server/services/__tests__/eventExecution.test.ts server/services/__tests__/mindmap-v2.test.ts server/routes/__tests__/mindmapNodeTask.test.ts server/routes/__tests__/tasksSpace.test.ts
npm run lint
```

**Done when**：并发和补偿测试通过；服务外没有新增双写。

---

## EFP-202 — 执行 routes、client mutations 与节点接线

**Goal**：Today/Date/Reschedule/Unschedule 从 Event 详情真实工作。  
**Depends on**：EFP-201。

**Allowed files**

- `server/routes/events.ts`
- 新建 `server/routes/__tests__/eventExecution.test.ts`
- `src/api/client.ts`
- `src/hooks/useEvents.ts` 与测试
- `src/components/Events/EventDetail.tsx`
- `src/components/Events/EventNodeActions.tsx`

**Steps**

1. 实现第 4.2 节 schedule/DELETE endpoints；
2. eventsApi 增加 scheduleNode/unscheduleNode；同 endpoint 的新 date 即 reschedule；
3. hooks 增加 `useScheduleEventNode/useUnscheduleEventNode`；
4. mutation 接收 oldDate/newDate，准确失效第 5 节缓存；
5. Today 按钮使用父组件传入的本地今天日期，组件内部不得用 UTC `toISOString()`；
6. Date 用原生 date input 或现有控件；取消不发请求；
7. 成功用响应 EventDetail 写缓存；失败保持选中并 toast；
8. 删除 EFP-104 的 stub toast。

```bash
npx vitest run server/routes/__tests__/eventExecution.test.ts src/hooks/useEvents.test.tsx src/components/Events/EventNodeActions.test.tsx
npm run lint
```

**Done when**：UI 不调用 promote/link；网络测试证明重复点击只有一个 taskId。

---

## EFP-203 — complete / reopen 与 Event 进度

**Goal**：节点与 Today 将来都调用同一完成命令。  
**Depends on**：EFP-202。

**Allowed files**

- `server/services/eventExecution.ts`
- `server/services/__tests__/eventExecution.test.ts`
- `server/routes/events.ts`
- `server/routes/__tests__/eventExecution.test.ts`
- `src/api/client.ts`
- `src/hooks/useEvents.ts`
- `src/hooks/useEvents.test.tsx`
- `src/components/Events/EventDetail.tsx`

**Required export**

```ts
setNodeExecutionStatus(eventId: string, nodeId: string, status: 'todo' | 'done'): Promise<EventCommandResult>
```

**Steps**

1. 未安排节点完成返回 409；
2. 在 taskDate 锁内更新 Task checkbox；
3. 更新 node.status；相同状态 no-op；
4. 更新失败时采用 EFP-201 的补偿/repair error；
5. route 实现 `PUT .../status`；
6. hooks 按第 5 节失效缓存；
7. EventDetail checkbox 调该命令；
8. summary progress 由 adapter 实时计算，不存百分比。

```bash
npx vitest run server/services/__tests__/eventExecution.test.ts server/routes/__tests__/eventExecution.test.ts src/hooks/useEvents.test.tsx
npm run lint
```

**Done when**：complete/reopen 双端一致、重复请求幂等、progress 正确。

---

## EFP-204 — Today 聚合服务与 API

**Goal**：按日期返回 TodayItem union，不让前端自己 join Event。  
**Depends on**：EFP-203。

**Read first**：tasks GET route、eventAdapter、parser、本文第 4.3 节。

**Allowed files**

- 新建 `server/services/today.ts` 与测试
- 新建 `server/routes/today.ts` 与测试
- `server/index.ts`

**Steps**

1. 读取目标日期 Daily Note；
2. 有两个 origin markers 的 Task 尝试解析 Event，成功返回 event-node；
3. 无 origin markers 返回 standalone；
4. 只有一个 marker 或找不到 Event/node：不丢失，降级 standalone，并记录 orphan id；
5. path 使用 `buildNodePath`，首项 root、末项当前 node；
6. context 过滤：derived 依 Event context；Standalone 必须复用 `server/utils/contextFilter.ts` 的 `taskMatchesContext`，不复制另一套 Work/Life 规则；
7. 排序严格使用第 4.3 节；
8. 只读，测试前后文件不变。

**Required tests**：混合列表；breadcrumb；context；排序；completed；orphan 降级；中文/重复标题；空日。

```bash
npx vitest run server/services/__tests__/today.test.ts server/routes/__tests__/today.test.ts
npm run lint
```

**Done when**：前端无需 topicSpaces/mindmaps 数据即可渲染 Today。

---

## EFP-205 — Today client、TodayItem UI 与闭环 E2E

**Goal**：Today 显示来源路径，完成 Event item 通过 Event command。  
**Depends on**：EFP-204。

**Allowed files**

- `src/api/client.ts`
- 新建 `src/hooks/useTodayItems.ts` 与测试
- `src/components/TodayBacklog.tsx` 与测试
- `src/App.tsx`
- `src/components/Events/EventDetail.tsx`
- `src/components/MindMap/MindMapView.tsx`
- 新建 `e2e/event-today-loop.spec.ts`

**Steps**

1. `todayApi.get(date, context)` 调 `/api/today/:date`；
2. useTodayItems 只在 eventFirst true 的 Today 挂载；
3. TodayBacklog 使用明确 union 或拆 `TodayItemRow`，不得 `as Task`；
4. event-node 行显示 `eventTitle › ancestor…`，breadcrumb 打开 Event 并定位 node；
5. standalone 行无须显示“Standalone”徽章；
6. event-node toggle 调 Event status command；standalone 继续 tasksApi；
7. loading/error 时旧 tasks 不闪现；flag false 保持旧 Today；
8. E2E：创建 Event → 节点 → Today → 完成 → 回 Event 验证 → reopen。

```bash
npx vitest run src/hooks/useTodayItems.test.tsx src/__tests__/components/TodayBacklog.test.tsx
npx playwright test e2e/event-today-loop.spec.ts --workers=1
npm test
npm run build
```

**Gate C**：闭环通过；重试无重复 Task。

---

## EFP-301 — Today 最终极简化

**Goal**：flag true 时 Today 只保留一条执行路径。  
**Depends on**：EFP-205。

**Allowed files**

- `src/components/TodayBacklog.tsx`
- `src/__tests__/components/TodayBacklog.test.tsx`
- `src/App.tsx`
- `src/index.css`（仅 `.today-*`）
- `e2e/smoke.spec.ts`
- `e2e/event-today-loop.spec.ts`

**Steps**

1. eventFirst true 时移除 Focus panel、add-to-focus、planningGroups/关联计划；
2. open items 单列表，completed 为唯一折叠区；
3. 默认行只保留 checkbox、title、event breadcrumb、必要 deadline/overdue；
4. tags/project/notes count/priority 编辑不在主行铺开；
5. header 唯一主操作 `Add`；
6. flag false 旧行为继续存在，直到 EFP-502；
7. App 在 eventFirst 路径不再使用 planningGroups，但暂不删兼容代码。

```bash
npx vitest run src/__tests__/components/TodayBacklog.test.tsx
npx playwright test e2e/smoke.spec.ts e2e/event-today-loop.spec.ts --workers=1
npm run lint
```

**Done when**：eventFirst Today 首屏没有 Focus/Linked plans/tag wall。

---

## EFP-302 — Standalone 快速任务与转换/撤销

**Goal**：小事可直接记，复杂后可显式升级 Event。  
**Depends on**：EFP-301。

**Allowed files**

- 新建 `server/services/taskEventConversion.ts` 与测试
- `server/routes/tasks.ts`
- 新建 `server/routes/taskEventConversions.ts`
- `server/index.ts`
- `src/api/client.ts`
- `TaskInputPanel.tsx`、`TodayBacklog.tsx` 与相关测试
- 新建 `e2e/standalone-to-event.spec.ts`

**Storage contract**

- 记录写入 `<workspace>/.dailyflow/migrations/task-event-conversions/<conversionId>.json`；
- 记录 schemaVersion、Task 原始完整行/描述块、date/line、eventId、创建时间、undoUntil、eventUpdatedAtAtCreation；
- 默认撤销窗口 10 分钟；temp + rename；不记录密钥或无关正文。

**Steps: convert**

1. 验证 Task 无 origin markers；derived Task 返回 409；
2. 用 title/context/tags 创建 Event，description/comments 写入 root note；
3. 原 Task 改 migrated tombstone 或移出 Today，记录足以恢复；
4. UI 自动打开 Event，toast 提供 Undo；
5. 失败时将新 Event 外壳标记 archived 并留下 repair record，不物理删除 TopicSpace/Map；不能同时显示 Task 和半个 Event。

**Steps: undo**

1. 校验时间窗口和 Event.updatedAt 未被用户编辑；
2. 恢复原 Task 原文到原日期；
3. Event 标记 archived，不物理删除 map；
4. conversion 标记 undone；重复 undo 返回同一结果。

**Required tests**：standalone 无 origin；完整字段保留；derived 被拒；undo/过期/已编辑/重复；失败补偿。

```bash
npx vitest run server/services/__tests__/taskEventConversion.test.ts src/__tests__/components/TodayBacklog.test.tsx
npx playwright test e2e/standalone-to-event.spec.ts --workers=1
npm run lint
```

**Done when**：快速创建不增加选择；转换和撤销不丢数据。

---

## EFP-303 — Today 详情抽屉与渐进披露

**Goal**：高级字段可用但不占主列表。  
**Depends on**：EFP-302。

**Allowed files**

- 新建 `src/components/Today/TodayItemDetails.tsx`
- 新建 `src/components/Today/TodayItemDetails.test.tsx`
- `src/components/TodayBacklog.tsx`
- `src/__tests__/components/TodayBacklog.test.tsx`
- `src/App.tsx`
- `src/index.css`（仅 drawer scoped styles）

**UI contract**

- 点击标题或 `···` 打开右侧 drawer；
- 显示 note、deadline、priority、effective tags；
- event-node：Open Event / Reschedule / Unschedule；
- standalone：Expand to Event / Delete；
- Escape、关闭按钮、焦点返回、移动端全宽；
- 不在 drawer 重做导图或完整 TaskCard。

```bash
npx vitest run src/components/Today/TodayItemDetails.test.tsx src/__tests__/components/TodayBacklog.test.tsx
npm run lint
```

**Gate D**：Today 主列表极简；必要高级动作仍可到达。

---

## EFP-401 — Effective tags 纯领域计算、搜索与筛选

**Goal**：先完成无 AI 的自动继承。  
**Depends on**：EFP-303。

**Allowed files**

- 新建 `server/services/eventTags.ts` 与测试
- `server/services/eventAdapter.ts`
- `server/services/today.ts`
- `server/routes/events.ts`
- `EventsIndex.tsx`、`TodayItemDetails.tsx` 与对应测试

**Frozen calculation**

```text
Event manualTags
+ Event accepted AI tags
+ 每个 ancestor manualTags（root → parent）
+ current node manualTags
+ current node accepted AI tags
```

去重：trim 后以 `toLocaleLowerCase()` 比较，首次出现的原始显示值胜出。空字符串、`today/overdue/completed/work/life` 及中文等价结构词不得进入 effectiveTags。

**Steps**

1. 建纯函数，不写回后代节点；
2. adapter/today 读取时计算；
3. Events query 同时搜索 title 与 effective tags；
4. Today 详情显示，主行默认隐藏；
5. 可选筛选放 Today header 次级 popover，不做常驻标签墙。

```bash
npx vitest run server/services/__tests__/eventTags.test.ts server/services/__tests__/eventAdapter.test.ts server/services/__tests__/today.test.ts
npm run lint
```

**Done when**：改 Event tag 后后代读取立即变化，节点文件没有批量改写。

---

## EFP-402 — AI tag suggestion、接受、拒绝与 suppression

**Goal**：AI 只提供可失败的辅助组织，不阻塞主闭环。  
**Depends on**：EFP-401。

**Read first**：`server/routes/ai.ts`、`server/services/v2/ai/*` 的 provider/proposal 模式、feature flags、现有模型授权设置。

**Allowed files**

- 新建 `server/services/eventTagSuggestions.ts` 与测试
- `server/types/mindmap.ts`、`topicSpace.ts`
- `server/services/topicSpaces.ts`
- `server/services/mindmaps.ts`
- `server/routes/events.ts`
- `src/api/client.ts`、`useEvents.ts`
- `TodayItemDetails.tsx`、`EventDetail.tsx` 与测试

**Persistence fields**

```ts
aiTags?: SuggestedTag[];
suppressedAiTags?: string[];
```

Event 字段存 TopicSpace；Node 字段存 MindMapNode。旧文件默认为空，未知字段保留。

**Rules**

- 每次返回 0–2 个；value 1–24 字符，confidence 0–1；
- confidence >= 0.85 可 accepted，0.60–0.849 为 suggested，低于 0.60 丢弃；
- 与 manual/effective/suppressed 重复的丢弃；
- 用户拒绝后 state=rejected 且 value 进入 suppression；
- AI 关闭、无 key、超时、非 JSON：返回空建议或 non-blocking 状态；
- 不自动安排日期；未经现有 AI 授权不外传正文。

**UI**：suggestion 只在 Event/Today details；提供 Accept/Dismiss；Today 主行隐藏 tags；不新增 modal。

```bash
npx vitest run server/services/__tests__/eventTagSuggestions.test.ts server/services/__tests__/eventTags.test.ts
npm test
npm run build
```

**Gate E**：AI 不可用时核心 E2E 全过；拒绝标签不再推荐。

---

## EFP-501 — 迁移 inventory、dry-run、backup 与 repair report

**Goal**：切换默认 UI 前证明旧数据可解释；默认只读。  
**Depends on**：EFP-402。

**Allowed files**

- 新建 `server/scripts/event-first-migration.ts` 与测试
- `package.json`（只加脚本）
- 新建 `docs/event-first/MIGRATION.md`

**CLI contract**

```bash
npm run migrate:event-first -- --dry-run
npm run migrate:event-first -- --apply --backup-dir /explicit/path
npm run migrate:event-first -- --verify
```

没有 `--apply` 绝对不写盘；`--apply` 没有显式 backup-dir 时拒绝。

**Report JSON**

```ts
{
  schemaVersion: 1,
  mode: 'dry-run' | 'apply' | 'verify',
  counts: {
    topicSpaces: number,
    linkedMaps: number,
    standaloneMaps: number,
    nodes: number,
    derivedTasks: number,
    standaloneTasks: number,
    orphanTaskRefs: number,
    orphanNodeRefs: number,
    duplicateTaskRefs: number
  },
  actions: Array<{ type: string; sourceId: string; targetId?: string }>,
  issues: Array<{ code: string; ids: string[]; message: string }>
}
```

**Steps**

1. dry-run 仅调用读取层并生成 stdout/report；
2. backup 保留相对路径、内容、mtime manifest 和 sha256；
3. standalone map 的计划动作是创建兼容 Event 外壳，不改 map id；
4. orphan 只报告，不删除；
5. apply 使用 migration journal，重复运行不重复创建；
6. verify 对照 manifest 与 adapter 计数；
7. 测试只用临时 workspace，不触碰真实配置。

```bash
npx vitest run server/scripts/__tests__/event-first-migration.test.ts
npm run migrate:event-first -- --dry-run
npm run lint
```

**Done when**：dry-run 前后 workspace hash 相同；重复 apply fixture 幂等；backup 可校验。

---

## EFP-502 — 正式切换与旧入口清理

**Goal**：只在迁移 Gate 通过后移除用户可见旧产品壳。  
**Depends on**：EFP-501，且必须有人确认 dry-run 报告。

**Read first**：EFP-501 最新 report，以及 `rg -n "Topic Space|TopicSpace|Mind Map|promote|link-task|unlink|planningGroups" src e2e` 输出。

**Allowed files**

- `src/App.tsx`
- `src/components/Sidebar.tsx`
- `src/components/TodayBacklog.tsx`
- `src/components/MindMap/MindMapView.tsx`
- `src/components/MindMap/MindMapList.tsx`
- `src/components/MindMap/NodeContextMenu.tsx`
- `src/components/TopicTabs/TopicTabs.tsx`
- `src/components/TopicSpaceView/TaskListView.tsx`
- `src/components/TopicSpaceView/TagFilterRow.tsx`
- `src/hooks/useTopicSpaces.ts`
- `src/hooks/useMindMapActions.ts`
- 上述文件的现有单测
- `e2e/topic-spaces.spec.ts`、`e2e/mindmap-visual.spec.ts`、`e2e/smoke.spec.ts`

**Steps**

1. 先从 App 删除旧 mindmap surface、TopicTabs、list toggle、planningGroups 路径；
2. 删除不再被生产路径 import 的旧 UI 组件；
3. 后端旧 routes 仍保留一个发布周期；
4. 用 rg 证明产品文案无 Promote/Link/Unlink/Topic Space；技术兼容注释可保留；
5. focus 状态仅在无其他页面使用时删除；
6. 不删除 `.dailyflow` 文件，不执行真实迁移；
7. 更新旧 E2E 去断言 Events，不可简单删除覆盖。

```bash
rg -n "Topic Space|Promote|Link to existing|Unlink|关联已有 Task|转为待办|解除绑定" src
npm test
npx playwright test --workers=1
npm run lint
npm run build
```

**Done when**：无旧入口；所有能力经新闭环可达；旧后端兼容 API 仍通过测试。

---

## EFP-503 — 默认开启、文档与最终发布验收

**Goal**：通过全部门后才把 Event-first 设为默认。  
**Depends on**：EFP-502。

**Allowed files**

- `server/services/v2/featureFlags.ts`
- 对应 feature flag 单测
- `docs/PRODUCT.md`
- `docs/EVENT_FIRST_PRODUCT_UPGRADE_PLAN.md`
- `docs/event-first/*`
- `README.md`（仅相关用户说明）
- EFP-501/502 已建立的 release tests

**Steps**

1. eventFirst 默认从 false 改 true；显式 false 仍可回退一个版本；
2. 用户文档只使用 Event、Mind Map（Event 内界面）、Today、Standalone Task；
3. 记录旧 API 预计移除版本，本任务不删除；
4. 执行完整测试；
5. 人工抽样旧 TopicSpace、独立 Map、linked task、standalone、orphan；
6. 记录 migration report hash、测试数量和截图。

```bash
npm run lint
npm test
npx playwright test --workers=1
npm run build
npm run migrate:event-first -- --verify
git diff --check
```

**Gate F / Done when**

- 全量命令通过；migration counts 可解释且无静默丢失；
- 默认只看到 Today / Events / Notes / Ask AI；
- 60 秒人工任务“创建 Event—三层拆解—安排今天—Today 完成—回 Event”成功；
- flag=false 仍能打开旧入口和旧数据。

---

## 9. 每个 Milestone 的回归矩阵

| Gate | 必跑单测 | 必跑 E2E | 数据证明 |
|---|---|---|---|
| A | adapter/routes/hooks | smoke | 读取不写盘 |
| B | EventsIndex/EventDetail/MindMap autosave | events + visual | 旧 map 可编辑 |
| C | execution/today | event-today-loop | taskId 不复制 |
| D | Today/details/conversion | standalone-to-event + smoke | 转换可撤销 |
| E | eventTags/suggestions | 核心 E2E 在 AI off 下重跑 | suppression 持久化 |
| F | `npm test` 全量 | `playwright test` 全量 | dry-run/apply/verify + backup hash |

测试不得只断言“页面有文字”。核心测试至少验证一个稳定 id、一次真实文件写入和一次刷新后恢复。

---

## 10. 回滚方案

### 10.1 Gate A–E

- 将 `config.v2.eventFirst` 设为 false；
- 旧 UI 和旧 API 尚在，立即回到当前产品；
- Event facade 只是旧数据适配，不需要回滚用户文件；
- execution 命令失败时保留 repair report，不自动删两端数据。

### 10.2 Gate F 后一个发布周期内

- 保留 flag=false；
- 保留 `/api/topic-spaces`、`/api/mindmaps` 和旧 Task routes；
- migration journal 和 backup 只追加，不覆盖；
- 回退版本读取原 TopicSpace/MindMap/Daily Markdown；
- 不使用 Git 回滚代替用户数据恢复。

### 10.3 禁止的回滚方式

- 删除 `.dailyflow`；
- 用空 workspace 覆盖现有 workspaceRoot；
- 全量重写 Daily Markdown；
- 根据 title 猜测并删除重复 Task；
- 删除被判定为 orphan 的记录。

---

## 11. 最终“完成”定义

只有同时满足以下条件，整个 Event-first 升级才算完成：

1. 用户界面只有一套概念：Event 负责拆解，Today 负责执行；
2. 创建 Event 后直接进入单一思维导图；
3. 节点一次操作可安排今天，重复点击不创建重复 Task；
4. Today 完成/恢复与 Event 节点一致；
5. Standalone Task 可快速创建，并可安全展开为 Event；
6. 标签自动继承但默认不铺满 Today；
7. AI 关闭或失败不影响创建、安排、完成；
8. 旧数据有备份、dry-run、verify 和回退路径；
9. 全量 lint、unit、E2E、build 通过；
10. 没有任务仅凭“代码看起来对”被标为 DONE。
