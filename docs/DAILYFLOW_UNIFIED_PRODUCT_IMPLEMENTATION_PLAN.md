# DailyFlow 统一产品与状态机制实施总方案

> 版本：2026-07-28
> 状态：已实施并完成自动化验收（2026-07-28）
> 用途：这是后续实现任务的唯一执行入口，尤其用于能力较弱、容易自行发挥的模型。
> 本文同时记录最终产品约束和已经落地的实现。后续模型不得重新恢复已删除的旧壳、旧事件或重复状态机制。

## 实施结果（后续模型先读）

本轮已经完成 DFU-101 至 DFU-902 的代码收口，结果如下：

- 一级入口统一为 Today、Notes、AI Chat、Memory；Calendar、Inbox、Review 分别并入 Today 或 Notes；
- AI Workspace、v2 standalone、重复 QueryClient、旧 Notes 壳和无引用悬浮 AI 入口已删除；
- Today/Notes/Memory/AI Chat 共用 workspace scope、Query key 工厂和实体 Context Drawer；
- 页面读取与每日初始化分离，每日初始化为幂等服务端命令；
- 配置改为带版本的部分 PATCH，冲突返回 409，不再整页刷新；
- 日历和 AI Provider 使用 typed domain events，旧 `df:feishu-synced` 已清零；
- Source analysis、transcription、calendar sync、import 使用持久化 Job，可查询、取消和重试；
- AI 会话按 workspace 隔离，相关 Note 会话可复用，历史重试使用 fork；
- AI 创建事项只生成 Proposal，确认前不写入事项；不支持 Proposal 的写工具不再向模型暴露；
- 全量验证：TypeScript 检查通过，42 个测试文件 / 346 个测试通过，生产构建通过，`git diff --check` 通过。

真实飞书账号、真实外部模型和生产数据的联网验收不属于自动化测试；后续如发现外部服务兼容问题，只修对应 adapter，不得恢复整页刷新、重复线程或独立 AI Workspace。

## 0. 先读：不可自行改变的产品结论

本方案以用户 2026-07-28 的最新反馈为最高优先级。以下结论覆盖旧文档中与之冲突的内容：

1. 恢复主导航中的 **AI Chat / AI 对话**。
2. 取消独立的 **AI Workspace / 智能工作台** 产品壳。
3. 不删除 AI Workspace 中有价值的能力，而是迁回用户已有心智：
   - Today 吸收计划、日历和待决策复盘；
   - Notes 吸收 Inbox 和来源处理；
   - AI Chat 承担对话、上下文理解和方案生成；
   - Memory 承担跨时间检索、证据和关系回看。
4. 用户不应该为了完成一个闭环，在多个互不知晓的页面之间手工搬运信息。
5. 所有后台处理都必须可恢复、可追踪、可去重，不允许产生无主结果、重复任务或“报废线程”。
6. AI 不能绕过预览直接修改用户数据。AI 产出先成为 Proposal，由用户确认后再执行领域命令。

与上述结论冲突时，不执行以下旧方向：

- `docs/ROADMAP.md` 中“Thinking Workspace / Workspaces 顶级入口”的表述；
- `docs/AI_NATIVE_PRODUCT_DEVELOPMENT_SPEC.md` 中“通用 AI Chat 不作为默认主入口”的表述；
- 任何要求继续扩展 AI Workspace 独立导航、独立状态或独立数据模型的任务。

旧文档中关于数据安全、Evidence、Proposal、Markdown 可读性、写入前校验的原则继续有效。

---

## 1. 用户问题与目标状态

### 1.1 当前问题

当前产品不是“功能少”，而是同一件事被拆到了多个缺少连续性的入口：

- Today、Calendar、Review 分别表达“现在做什么”，但状态和刷新来源不同；
- Notes 与 Inbox 都在接收信息，但处理结果和原内容之间缺少稳定回链；
- AI Chat 曾是明确入口，后来又出现 AI Workspace，用户不知道 AI 正在什么范围内工作；
- AI Workspace 内再次出现 Today、Inbox、Memory、Review，形成“应用里的另一套应用”；
- React Query、组件本地状态、浏览器事件和定时器同时负责刷新，容易互相覆盖；
- Source 分析、AI 会话和同步任务缺少统一身份与幂等机制，离开页面后可能成为无主任务。

### 1.2 最终一级导航

最终只保留：

1. **Today**
2. **Notes**
3. **AI Chat**
4. **Memory**
5. **Settings**（底部，不属于工作流一级页面）

不得再增加功能同义的一级入口。

### 1.3 各入口唯一职责

| 入口 | 用户问题 | 包含能力 | 不应包含 |
|---|---|---|---|
| Today | 我现在做什么、接下来怎么安排？ | Focus、Plan/Calendar、Needs decision、完成和等待 | 全量资料库、独立 AI 工作台 |
| Notes | 我记录了什么、还有什么没处理？ | 写作、会议记录、Inbox、来源处理、Proposal 审核 | 第二套任务系统 |
| AI Chat | 我想和 AI 一起理解、推演或生成方案 | 连续对话、显式上下文、Proposal 预览、会话历史 | 无确认写入、隐藏运行任务 |
| Memory | 以前发生了什么、依据在哪里、彼此如何关联？ | 搜索、Evidence、实体关系、历史回看 | 新的捕获入口、重复编辑器 |

### 1.4 页面间连续性规则

所有主要实体必须使用稳定 ID。用户在任意页面看到实体后，都能：

- 打开同一个实体，而不是打开复制品；
- 查看它来自哪篇 Note、哪个 Source、哪次 AI Chat；
- 查看它影响了 Today、Calendar 或 Memory 的哪个位置；
- 返回上一步；
- 对后台运行中的任务查看状态、失败原因和重试入口。

推荐在应用根部建立共享 **Context Drawer / 上下文侧栏**。Today、Notes、AI Chat、Memory 均调用同一个抽屉，不各自实现详情弹窗。

---

## 2. 统一概念与数据边界

### 2.1 用户语言

- 界面统一称“事项”；
- 后端现有 `Commitment` 可继续保留，不要求一次性迁表；
- 旧 `Task` 仍须可用；
- 前端使用 `WorkItem` 适配层将 `Task` 与 `Commitment` 映射为一致展示模型。

建议接口：

```ts
type WorkItemKind = 'task' | 'commitment';

interface WorkItem {
  id: string;
  kind: WorkItemKind;
  workspaceId: string;
  title: string;
  status: 'open' | 'in_progress' | 'waiting' | 'done' | 'cancelled';
  scheduledDate?: string;
  reviewAt?: string;
  sourceRefs: EntityRef[];
  version: number;
  updatedAt: string;
}
```

适配层只统一 UI 行为，不得静默改变底层 Markdown 或数据库含义。

### 2.2 统一实体引用

```ts
type EntityType =
  | 'note'
  | 'source'
  | 'task'
  | 'commitment'
  | 'proposal'
  | 'evidence'
  | 'calendar_event'
  | 'ai_session'
  | 'job';

interface EntityRef {
  workspaceId: string;
  type: EntityType;
  id: string;
  label?: string;
}
```

禁止用标题、数组下标或当前页面状态代替实体 ID。

### 2.3 Proposal 是 AI 写入的唯一入口

AI 可以读取用户明确提供的上下文并生成 Proposal，但不得直接调用 `create_note`、`create_task`、`mark_task_done` 等写命令。

统一过程：

```text
AI 生成建议
  -> 创建 Proposal
  -> UI 展示目标实体、具体变化、影响位置
  -> 用户接受 / 编辑后接受 / 拒绝
  -> 服务端领域命令执行
  -> 返回 canonical entities + affected surfaces
  -> 精准更新缓存
```

每次接受 Proposal 必须携带 `idempotencyKey`。重复提交返回第一次结果，不创建重复事项。

### 2.4 持久化 Job

所有超过一次普通请求生命周期的工作统一为 Job：

```ts
type JobStatus =
  | 'queued'
  | 'running'
  | 'waiting_review'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

interface Job {
  id: string;
  workspaceId: string;
  kind: 'source_analysis' | 'transcription' | 'calendar_sync' | 'import';
  entityRef: EntityRef;
  idempotencyKey: string;
  status: JobStatus;
  progress?: number;
  resultRef?: EntityRef;
  error?: { code: string; message: string; retryable: boolean };
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
}
```

Job 规则：

- 服务端先创建或取得 Job，再调用外部 AI/同步服务；
- 相同 `idempotencyKey` 的运行中或已成功 Job 必须返回原 Job；
- UI 只在 `queued/running` 时轮询；
- 页面隐藏时暂停轮询，恢复可见时按 Job ID 继续；
- 用户离开页面后 Job 仍可在原 Source/Note 和全局运行状态中找到；
- 失败 Job 保留错误，重试创建新的 attempt，但关联原 Job；
- 禁止把唯一结果只保存在 React 组件本地 state。

Source 分析建议的幂等键：

```text
source-analysis:{workspaceId}:{sourceId}:{contentHash}:{extractorVersion}
```

---

## 3. 统一刷新与反应机制

### 3.1 单一事实来源

服务端持久化数据是事实来源；React Query 是服务端状态缓存；组件本地 state 只保存临时 UI 状态。

组件本地 state 不得长期保存：

- Proposal 最终状态；
- Job 最终状态；
- 当前 workspace 的实体列表；
- 其他页面也需要读取的 AI 运行结果。

### 3.2 Query key 工厂

新建唯一 Query key 工厂。所有 key 必须包含 `workspaceId`：

```ts
export const queryKeys = {
  workspace: (workspaceId: string) => ['workspace', workspaceId] as const,
  today: (workspaceId: string, date: string) =>
    ['workspace', workspaceId, 'today', date] as const,
  notes: (workspaceId: string, filters: object) =>
    ['workspace', workspaceId, 'notes', filters] as const,
  note: (workspaceId: string, noteId: string) =>
    ['workspace', workspaceId, 'note', noteId] as const,
  commitments: (workspaceId: string, filters?: object) =>
    ['workspace', workspaceId, 'commitments', filters ?? {}] as const,
  commitment: (workspaceId: string, id: string) =>
    ['workspace', workspaceId, 'commitment', id] as const,
  plan: (workspaceId: string, date: string) =>
    ['workspace', workspaceId, 'plan', date] as const,
  inbox: (workspaceId: string) =>
    ['workspace', workspaceId, 'inbox'] as const,
  proposals: (workspaceId: string, filters?: object) =>
    ['workspace', workspaceId, 'proposals', filters ?? {}] as const,
  memory: (workspaceId: string, query: string) =>
    ['workspace', workspaceId, 'memory', query] as const,
  calendar: (workspaceId: string, range: object) =>
    ['workspace', workspaceId, 'calendar', range] as const,
  jobs: (workspaceId: string, filters?: object) =>
    ['workspace', workspaceId, 'jobs', filters ?? {}] as const,
  job: (workspaceId: string, jobId: string) =>
    ['workspace', workspaceId, 'job', jobId] as const,
};
```

不得在组件中继续发明 `['v2-commitments']`、`['v2-memory-commitments']` 等平行 key。

### 3.3 允许触发刷新的三类来源

只允许：

1. 用户显式点击刷新；
2. mutation 成功后，根据服务端返回的 `affectedSurfaces` 精准更新或 invalidate；
3. 页面从后台恢复且数据已过 stale window 时刷新读请求。

不得：

- 使用 `window.location.reload()` 同步状态；
- 用含义模糊的全局事件要求多个页面全部重载；
- 用固定 interval 周期性重写相同 Markdown；
- 因切换 Tab 的卸载/重挂载而重复执行写操作；
- 在 GET 页面加载过程中调用 rollover、instantiate 等写命令。

### 3.4 Mutation 返回契约

所有领域 mutation 返回：

```ts
interface MutationResult {
  commandId: string;
  updated: Array<{ ref: EntityRef; entity: unknown }>;
  removed: EntityRef[];
  affectedSurfaces: Array<
    'today' | 'notes' | 'inbox' | 'proposals' | 'memory' | 'calendar'
  >;
}
```

前端 mutation adapter 先写入 `updated` 中的 canonical entity，再只 invalidate `affectedSurfaces`。

### 3.5 Typed domain events

仅用于不能由当前 mutation 直接传播的跨模块变化：

- `workspace.changed`
- `task.updated`
- `note.updated`
- `proposal.applied`
- `commitment.updated`
- `plan.updated`
- `calendar.connectionChanged`
- `calendar.eventsChanged`
- `ai.providerChanged`

事件 payload 必须含 `workspaceId`、实体 ID、`version` 和 `originCommandId`。接收方忽略其他 workspace、旧 version 和自己已处理的 command。

现有 `df:feishu-synced` 必须拆除，不能换一个同样模糊的新名字。

### 3.6 请求竞态和重试

- 日期、workspace、搜索词变化时取消旧请求，或用 request revision 丢弃旧响应；
- Memory 搜索至少 250–400ms debounce；
- GET 最多自动重试 1 次，指数退避；
- 4xx 不重试；
- mutation 默认不自动重试；
- 只有服务端支持幂等键的 mutation 才允许显式重试；
- React StrictMode 必须保持开启，代码需在 StrictMode 下正确；
- 页面读请求不得有写副作用。

---

## 4. 分阶段执行顺序

必须按阶段顺序实施。一个任务未验收，不开始依赖它的后续任务。

### Phase 0：执行边界与基线

#### DFU-000 建立实施基线

**目标**

让后续模型只依赖本文和当前代码，不从旧文档自行推导产品方向。

**允许修改**

- 本文；
- 新增测试清单或迁移记录文档。

**禁止**

- 修改运行代码；
- 修改用户当前未提交的文件；
- 更新 `docs/ROADMAP.md`，直到最终阶段单独处理。

**步骤**

1. 记录当前分支、commit、`git status --short`。
2. 将本文任务 ID 复制到 issue 或执行记录中。
3. 每次只领取一个 DFU 任务。
4. 开始任务前重新运行 `git status --short`，不得覆盖非本任务改动。

**完成标准**

- [ ] 执行者明确记录基线 commit。
- [ ] 执行者明确当前领取的唯一任务 ID。
- [ ] 没有运行代码变更。

---

### Phase 1：先消除状态冲突

#### DFU-101 停止 Today 的危险定时写回

**目标**

页面停留、切换日期或切换 workspace 时，不再把当前内容写进旧日期。

**主要检查文件**

- `src/App.tsx`
- 对应 API client 和测试文件

**步骤**

1. 删除或禁用 `src/App.tsx` 中 interval 内嵌 timeout 的自动 Markdown 写回。
2. 保留显式保存路径。
3. 如果产品确需自动保存，使用单独后续任务实现：
   - 捕获 `workspaceId + fileDate + contentVersion`；
   - 比较内容 hash，无变化不请求；
   - 旧请求可取消；
   - 服务端写入要求 expected version/hash；
   - 409 冲突展示给用户，不能静默覆盖。
4. 清理所有 timer，组件卸载后不得执行写操作。

**测试**

- fake timers：切换日期后推进时间，旧日期和新日期均没有意外写入；
- 卸载后推进时间，无 API 调用；
- 无变化内容不触发保存。

**完成标准**

- [ ] 不存在定时全量重写。
- [ ] 日期切换测试通过。
- [ ] StrictMode 下无重复写入。

#### DFU-102 分离页面读取与每日初始化写命令

**目标**

打开 Today 只读数据，不因 effect 重跑而重复 instantiate/rollover。

**步骤**

1. 审查 `loadTasksForDate` 中所有 API 调用。
2. 把纯读取保留在 query/load function。
3. 把 recurring instantiate 和 rollover 组合为服务端幂等命令，例如：

```text
POST /api/workspaces/:workspaceId/days/:date/initialize
Idempotency-Key: daily-initialize:{workspaceId}:{date}:{rulesVersion}
```

4. 命令重复执行返回相同结果。
5. 前端只在明确条件下调用一次；StrictMode 重放仍由服务端去重。
6. 修正 callback dependency，必须包含 `activeContext/workspaceId`，语言变化不能触发业务初始化。

**测试**

- StrictMode 双 effect 只产生一个初始化结果；
- 快速切换 workspace 不读取或写入旧 workspace；
- 改语言不触发 rollover；
- 重复 idempotency key 返回同一 command/result。

#### DFU-103 修复日期、日历和同步请求竞态

**目标**

快速切换日期或范围时，旧响应不能覆盖新页面。

**步骤**

1. 为 Today、Calendar、Feishu loader 使用 React Query signal 或 `AbortController`。
2. 若底层请求无法取消，引入递增 request revision，只接受最新 revision。
3. loading/error 必须绑定 query key，不能使用跨日期的单个布尔值。
4. 写测试模拟 A 请求慢、B 请求快，最终只能显示 B。

**完成标准**

- [ ] Today 日期竞态测试通过。
- [ ] Calendar 范围竞态测试通过。
- [ ] workspace 切换竞态测试通过。

#### DFU-104 统一 QueryClient 默认策略

**目标**

主应用只使用一个 QueryClient 配置，避免 Tab 重挂载造成请求风暴。

**步骤**

1. 在主入口定义唯一 QueryClient factory。
2. 删除 v2 独立入口依赖的第二套运行时配置，或先让其引用同一 factory。
3. 默认建议：
   - 普通列表 `staleTime` 30 秒；
   - refetch on window focus 只对 stale query 生效；
   - GET retry 1；
   - mutation retry 0。
4. 个别实时数据显式覆盖，不得反向修改全局默认。

**测试**

- 切换 Today → Notes → Today，在 stale window 内不重复请求；
- 请求失败不会循环重试；
- mutation 失败不自动再提交。

---

### Phase 2：恢复可理解的产品入口

#### DFU-201 恢复 AI Chat 一级入口

**目标**

用户在侧栏直接看到“AI 对话”，不需要理解 AI Workspace。

**允许修改**

- `src/components/Sidebar.tsx`
- `src/App.tsx`
- `src/components/AIChat.tsx`
- 导航相关测试

**步骤**

1. 在主侧栏恢复 `ai-chat`。
2. 文案从“AI 工作台 / AI Workspace”改为“AI 对话 / AI Chat”。
3. 保持现有 AIChat 组件和历史会话兼容。
4. AI Chat 首屏明确显示：
   - 当前 workspace；
   - 当前显式上下文；
   - AI 可做什么；
   - 产生修改时会先预览。
5. 不在本任务删除 AI Workspace 代码。

**手工验收**

1. 启动应用。
2. 从任意一级页面一键进入 AI Chat。
3. 返回原页面后状态仍在。
4. 老会话可见，无法解析的旧引用显示“来源已不可用”，不能崩溃。

#### DFU-202 从侧栏移除 AI Workspace 壳

**前置**

- DFU-201 已完成。
- 必须列出 AI Workspace 内 Today/Inbox/Memory/Review 的能力迁移去向。

**步骤**

1. 从主导航移除 `ai-native` 可见入口。
2. 暂时保留内部 route/component，作为迁移期间兼容入口。
3. 若旧 deep link 进入 AI Workspace：
   - Today 子页重定向到主 Today；
   - Inbox 重定向到 Notes 的 Inbox 筛选；
   - Memory 重定向到主 Memory；
   - Review 重定向到 Today 的 Needs decision。
4. 不允许重定向后丢失 entity/query 参数。

**完成标准**

- [ ] 主界面不存在 AI Workspace。
- [ ] 旧链接有明确去向。
- [ ] 原能力未因隐藏入口而不可达。

#### DFU-203 建立统一实体导航与 Context Drawer

**目标**

用户从 Note、AI Chat、Today、Memory 打开同一对象时，看到同一个详情和关系。

**步骤**

1. 定义 `EntityRef` 和唯一 `openEntity(ref)`。
2. 在 App root 挂载一个 Context Drawer。
3. Drawer 至少显示：
   - 标题、状态、更新时间；
   - 来源与去向；
   - 当前运行 Job；
   - 相关 Proposal/Evidence；
   - “在原位置打开”。
4. 浏览历史使用实体引用栈，不复制实体内容。
5. 所有跨页面链接改用 `openEntity`。

**测试**

- 同一 commitment 从 Today 和 Memory 打开时 ID 相同；
- 返回操作回到上一个实体；
- workspace 不同的实体不可串开。

---

### Phase 3：统一缓存、事件和配置反应

#### DFU-301 落地 Query key 工厂

**目标**

替换所有手写 v2 key，消除 Today 更新而 Memory 不更新的问题。

**步骤**

1. 新建 `queryKeys` 模块。
2. 逐一迁移 Today、CommitmentContext、Inbox、Memory、Notes、Calendar。
3. 所有 key 加 `workspaceId`。
4. Mutation 使用统一 helper 应用 `MutationResult`。
5. 删除旧 key 前用 `rg` 确认零引用。

**必须覆盖的回归**

- 接受 Inbox Proposal 后，Notes、Today、Memory 在需要时同步；
- 完成 Today 事项后，Drawer 和 Memory 不显示旧状态；
- workspace 切换后不展示上个 workspace 缓存。

#### DFU-302 替换模糊刷新事件

**目标**

连接日历、完成同步和修改设置不再触发含义不明的相同刷新。

**检查文件**

- `src/components/SettingsModal.tsx`
- `src/components/FeishuAgenda.tsx`
- `src/components/CalendarWorkspace.tsx`

**步骤**

1. 列出每个 `df:feishu-synced` dispatch 的真实含义。
2. 连接变化发 `calendar.connectionChanged`。
3. 事件数据变化发 `calendar.eventsChanged`。
4. 若 dispatch 来自当前 mutation，优先直接更新 query cache，不发事件。
5. 删除 `window.location.reload()`。
6. 删除旧监听器和旧事件名。

**测试**

- 连接状态变化只刷新连接信息及必要日历 query；
- 单条事件更新不会重载 Settings 或整个应用；
- 重复 command event 被忽略。

#### DFU-303 配置使用部分更新和版本控制

**目标**

切换 Work/Life scope 或 AI provider 时，不覆盖用户并发修改的其他设置。

**接口**

```text
PATCH /api/config
If-Match: {version}
Body: { activeContext: "work" }
```

服务端返回新 config 和 version。版本冲突返回 409。

**禁止**

- GET 全量配置后改一个字段再 POST 全量；
- 发生 409 后自动覆盖；
- 切 workspace 时用刷新页面代替状态更新。

---

### Phase 4：消灭重复后台任务和无主结果

#### DFU-401 建立 Job 存储与 API

**目标**

为 Source 分析、转录、同步、导入提供统一可恢复状态。

**最低 API**

```text
POST /api/v2/jobs
GET  /api/v2/jobs/:id
GET  /api/v2/jobs?workspaceId=...&status=...
POST /api/v2/jobs/:id/retry
POST /api/v2/jobs/:id/cancel
```

**要求**

- 数据库存储，不用进程内 Map；
- `(workspaceId, idempotencyKey)` 唯一；
- 状态转换由服务端校验；
- cancelled/succeeded Job 不得重新进入 running；
- retry 创建 attempt 关系，不能抹掉旧错误；
- API 不暴露密钥、完整 prompt 或敏感日志。

**测试**

- 并发两个相同创建请求只产生一个 Job；
- 服务重启后可查询；
- 非法状态转换返回 409；
- 不同 workspace 不可访问彼此 Job。

#### DFU-402 Source processing 改用 Job

**目标**

重复点击处理、页面离开或刷新，不再产生多份 AgentRun/Evidence/Proposal。

**步骤**

1. 计算 Source content hash。
2. 在调用 AI 之前创建/取得 Job 并把 Source 标为 processing。
3. 已有相同成功 Job 时直接返回 resultRef。
4. 产出 Evidence 和 Proposal 后，在一个事务内：
   - 保存结果；
   - 更新 Source；
   - Job 转为 waiting_review 或 succeeded。
5. UI 保存 Job ID，不把 Proposal 只放在 SourceCard 本地 state。
6. 返回页面时从 Source 或 Job 恢复结果。

**手工验收**

1. 连续双击“处理”，只出现一个任务。
2. 处理中离开 Notes，再返回，进度仍在。
3. 刷新浏览器，结果仍可恢复。
4. 失败后可看原因并显式重试。

#### DFU-403 迁移其他长任务

按顺序迁移：

1. meeting transcription；
2. calendar sync；
3. bulk import。

每种 job 单独提交和验收，不一次大改。

---

### Phase 5：整合 Today、Calendar 和 Review

#### DFU-501 引入 WorkItem 适配层

**目标**

在不强制迁移旧数据的前提下，Today 用一致方式展示 Task 与 Commitment。

**步骤**

1. 实现纯函数 `taskToWorkItem`、`commitmentToWorkItem`。
2. UI mutation 根据 `kind` 路由到原领域服务。
3. 保留原始实体引用。
4. 不允许把 Task 自动复制为 Commitment。

**测试**

- 相同标题的 Task 和 Commitment 仍是两个不同实体；
- 完成操作写回正确后端；
- 来源回链保留。

#### DFU-502 Calendar 进入 Today 的 Plan 子视图

**目标**

“今天要做的事”和“今天什么时候做”在一个入口内连续完成。

**布局**

- Focus：当前行动；
- Plan：时间轴/日历；
- Needs decision：等待、过期、冲突和待确认 Proposal。

Calendar 不再作为一级导航，但周/月视图仍可从 Plan 内进入。

**要求**

- 切换 Focus/Plan 不卸载或丢失当前日期；
- 日历事件转 Note、转 Proposal 后有回链；
- Calendar 连接设置仍在 Settings；
- 不把外部日历事件静默转成事项。

#### DFU-503 Review 进入 Needs decision

**目标**

Review 不再是另一个工作台 Tab，而是 Today 中需要用户决策的队列。

队列包含：

- 到达 `reviewAt` 的 waiting item；
- 逾期但未完成事项；
- 计划冲突；
- 等待用户确认的 Proposal；
- 失败且可重试的关键 Job。

每张卡只能提供与当前原因相关的操作，不显示无关按钮。

---

### Phase 6：整合 Notes、Inbox 和 Proposal

#### DFU-601 Notes 成为唯一捕获与写作入口

**目标**

用户不再判断“这是写 Note 还是放 Inbox”。

**规则**

- 新内容统一进入 Notes；
- 未处理 Source 使用 `processingStatus` 或 Inbox filter 表达；
- Inbox 是 Notes 的一个筛选视图，不是独立产品；
- `SourceItem` 是来源记录，不是第二份用户内容。

**禁止**

- 同时创建一份 Note 和一份没有引用关系的 Inbox 文本；
- 新建另一套编辑器；
- 删除旧 Notes 前未完成数据兼容。

#### DFU-602 在 Note 内完成处理闭环

Note 详情必须能看见：

- 原始内容；
- Sources；
- 正在运行或已结束的 Job；
- Evidence；
- 待确认 Proposal；
- Proposal 接受后的事项和去向。

接受 Proposal 后显示：

```text
已创建 2 个事项
• “准备客户回访” → Today / 7 月 29 日
• “等待法务回复” → Needs decision / 8 月 2 日复查
```

不得只显示“成功”。

#### DFU-603 统一 Proposal 审核组件

Today、Notes、AI Chat 使用同一个 Proposal Review 组件。

组件必须显示：

- AI 建议做什么；
- 将修改哪个实体；
- 修改前后差异；
- 结果将出现在哪里；
- 接受、编辑后接受、拒绝。

---

### Phase 7：把 AI Chat 做回可信赖的主入口

#### DFU-701 修正会话创建和 workspace 隔离

**目标**

不再因每次从 Note 打开 AI 而创建空会话，不再跨 workspace 串上下文。

**规则**

- 空白页不立即持久化 session；
- 用户发送第一条消息时才持久化；
- session 必须含 `workspaceId`；
- 从同一实体再次进入时，默认恢复最近相关会话；
- 只有用户点击“新对话”才强制新建；
- 空 session 自动清理；
- 旧 `df_ai_chat_store` 做一次兼容迁移，不能直接丢弃。

**测试**

- 打开/关闭 AI Chat 十次，不新增十个空 session；
- workspace A 的 session 不出现在 B；
- Note → AI → Note → AI 可恢复同一相关会话。

#### DFU-702 修正 retry 语义

**目标**

重试失败消息不会静默删除其后的有效对话。

**规则**

- 仅最后一次失败可原位 retry；
- 重试较早消息时创建 fork，并明确提示；
- 每条 assistant message 保存 run status；
- provider 切换只影响新 run；
- 失败原因可见，敏感内容需脱敏。

#### DFU-703 AI 写操作全部转 Proposal

**目标**

移除 `useAiSessionSend` 中对写工具的直接执行。

**步骤**

1. 将工具调用解析为 typed proposal draft。
2. 服务端验证目标实体、workspace 和版本。
3. 前端展示统一 Proposal Review。
4. 用户确认后发送带 idempotency key 的领域命令。
5. 应用统一 `MutationResult`。

**测试**

- AI 建议创建事项时，确认前数据库无新增；
- 双击接受只产生一个事项；
- 拒绝后不产生写入；
- 目标版本已变化时提示重新生成/重新确认。

#### DFU-704 显式展示 AI 当前上下文

输入框上方显示可移除的 context chips：

- 当前 Note；
- 选中的事项；
- 日历范围；
- 用户手工添加的 Memory evidence。

禁止默认把整个 workspace、全部历史或不可见页面状态发送给模型。

---

### Phase 8：Memory 只做可追溯回看

#### DFU-801 统一 Memory 查询与实体打开

**目标**

Memory 搜索结果不是静态摘要，而是进入原实体和证据链的入口。

**步骤**

1. 搜索词 debounce 300ms。
2. 取消旧搜索。
3. 结果必须携带 `EntityRef` 和 evidence snippet。
4. 点击结果调用统一 `openEntity`。
5. Commitment 状态读取统一 query key，不使用独立 memory key。

**验收**

- 快速输入只显示最后关键词结果；
- Today 完成事项后，Memory 打开显示完成状态；
- Evidence 可回到原 Note/Source。

---

### Phase 9：清理旧壳与同步文档

#### DFU-901 删除已确认无引用的旧代码

只有前面阶段全部通过后，才检查并逐项删除：

- `FloatingAIPanel`；
- v2 standalone HTML/main 和 Vite 第二入口；
- `V2Shell`；
- 未使用的 `useV2Enabled`；
- 旧 Thinking Workspace 前端 API 和后端 route；
- 被新 Notes 完全替代的旧 `Notes.tsx/NoteCard.tsx`；
- `daily-focus-*` 死 CSS；
- 已禁用的危险 interval sync。

每项删除前必须：

1. `rg` 搜索静态引用；
2. 检查路由和动态 import；
3. 检查用户数据读取路径；
4. 提供迁移或兼容路径；
5. 单独提交；
6. 运行测试和 build。

“看起来没用”不是删除依据。

#### DFU-902 更新产品文档

前置：运行代码已经符合本文。

更新：

- `docs/ROADMAP.md`
- `docs/AI_NATIVE_PRODUCT_DEVELOPMENT_SPEC.md`
- 用户导航和数据流相关文档

必须删除或标记失效的描述：

- AI Workspace 顶级入口；
- Thinking Workspace 顶级入口；
- AI Chat 不是主入口；
- Calendar、Inbox、Review 作为孤立一级工作区。

---

## 5. 端到端验收场景

以下场景全部通过，才算整体完成。

### E2E-01 Note 到 Today

1. 在 Notes 新建会议记录。
2. 在 Note 内启动分析。
3. 离开页面再返回，仍能看到同一 Job。
4. AI 生成 Proposal，但未确认前 Today 无新增。
5. 接受 Proposal。
6. Note 显示事项去向。
7. Today 显示同一个实体 ID。
8. 完成事项。
9. Note 和 Memory 均显示完成状态及回链。

### E2E-02 Note 与 AI Chat 连续协作

1. 从 Note 进入 AI Chat。
2. 页面明确显示当前 Note 上下文。
3. 生成计划 Proposal。
4. 接受一部分，拒绝一部分。
5. 返回 Note，处理结果可见。
6. 再进入 AI Chat，恢复相关会话，不创建空线程。

### E2E-03 Waiting 与 Review

1. Today 将事项设为 waiting，并设置 `reviewAt`。
2. 它离开 Focus。
3. 到期后出现在 Needs decision。
4. 用户重新安排、完成或取消。
5. 各页面状态一致。

### E2E-04 Calendar 到 Note

1. 在 Today / Plan 打开日历事件。
2. 创建会议 Note。
3. Note 保存 calendar event ref。
4. 分析产生 Proposal。
5. 接受后事项进入 Today。
6. 从事项能回到会议 Note 和原日历事件。

### E2E-05 请求竞态

1. 快速依次切换三个日期。
2. 人为让第一个请求最后返回。
3. 页面仍显示第三个日期。
4. 无 rollover、重复写入或错误 toast。

### E2E-06 Job 去重与恢复

1. 同一 Source 连续双击分析。
2. 数据库只有一个幂等 Job 和一组结果。
3. 分析期间刷新页面。
4. 页面恢复同一 Job。
5. 完成后只有一个 Proposal。

### E2E-07 workspace 隔离

1. 在 workspace A 打开 Note、AI session 和 Job。
2. 切换到 workspace B。
3. B 不显示 A 的缓存、会话、事件或任务。
4. 切回 A 后可恢复。

---

## 6. 弱模型执行模板

后续给模型下任务时，必须完整复制以下模板，不要只说“做 DFU-xxx”：

```md
你只执行：DFU-[编号] [标题]

目标：
[从总方案原文复制]

前置条件：
- [列出依赖任务及其已完成证据]

允许修改：
- [精确文件或目录]

禁止修改：
- 与任务无关的文件
- 数据模型/导航/状态机制的自行扩展
- 用户已有未提交修改

执行步骤：
1. [从总方案复制并补充当前代码位置]
2. ...

必须新增或更新的测试：
- ...

必须运行：
- npm run lint
- [相关测试命令]
- npm run build

手工验收：
1. ...

停止条件：
- 发现需要修改允许范围之外的文件；
- 当前代码与方案前提不一致；
- 发现用户未提交修改与本任务冲突；
- API 需要做不兼容变更但没有迁移方案。

完成时只报告：
1. 改了什么；
2. 测试证据；
3. 未完成或风险；
4. 修改文件列表。
不要启动下一个 DFU 任务。
```

### 6.1 模型不得自行做的判断

- 不得创建新一级导航；
- 不得恢复或保留 AI Workspace 作为独立壳；
- 不得新增另一套 store、event bus、query key 或详情面板；
- 不得用 `window.reload`、定时全量刷新解决一致性；
- 不得用 mock/fixed result 伪装功能完成；
- 不得把 AI Proposal 改成自动执行；
- 不得因为迁移困难而复制一份数据；
- 不得在没有测试的情况下删除兼容代码；
- 不得顺手格式化或重构无关文件；
- 不得一次领取多个跨阶段任务。

---

## 7. 每个任务的通用完成定义

每个 DFU 任务都必须满足：

- [ ] 用户可感知结果与任务目标一致；
- [ ] 没有新增重复入口或重复状态源；
- [ ] workspace 隔离成立；
- [ ] 快速切换和 StrictMode 下无重复副作用；
- [ ] 错误有可理解提示，不使用整页刷新；
- [ ] 新 mutation 有幂等或明确不可重试策略；
- [ ] 自动测试覆盖成功、失败、竞态或重复请求中的相关项；
- [ ] `npm run lint` 通过；
- [ ] 相关测试通过；
- [ ] `npm run build` 通过；
- [ ] `git diff --check` 通过；
- [ ] 未覆盖用户已有改动；
- [ ] 文档中的任务状态和实际一致。

---

## 8. 推荐提交粒度

每个提交只对应一个任务或一个任务中的可回滚子步骤。推荐顺序：

```text
DFU-101 -> DFU-102 -> DFU-103 -> DFU-104
-> DFU-201 -> DFU-202 -> DFU-203
-> DFU-301 -> DFU-302 -> DFU-303
-> DFU-401 -> DFU-402 -> DFU-403
-> DFU-501 -> DFU-502 -> DFU-503
-> DFU-601 -> DFU-602 -> DFU-603
-> DFU-701 -> DFU-702 -> DFU-703 -> DFU-704
-> DFU-801
-> DFU-901 -> DFU-902
```

允许在同一阶段内调整无依赖任务顺序，但禁止越过以下门槛：

- 状态安全（Phase 1）未完成，不做大规模页面合并；
- AI Chat 未恢复，不隐藏 AI Workspace；
- Job 未落地，不扩大异步分析入口；
- Proposal 写入规则未落地，不新增 AI 写工具；
- E2E 未通过，不删旧兼容代码。

---

## 9. 本次代码审查定位清单

以下位置是制定本方案时观察到的具体风险。执行者必须重新核对最新行号，不能机械照抄行号：

- `src/App.tsx`
  - `loadTasksForDate` 的依赖与 workspace/context 不一致；
  - 页面读取夹带 instantiate/rollover 写副作用；
  - interval + timeout 自动写回可能捕获旧日期；
  - active tab 同时包含 `ai-chat` 与 `ai-native`。
- `src/main.tsx`
  - StrictMode 会暴露 effect 非幂等问题，应保留 StrictMode。
- `src/features/v2/v2-main.tsx`
  - 存在第二套 QueryClient 配置。
- `src/features/v2/today/TodayView.tsx`
  - 使用 `['v2-commitments']`。
- `src/features/v2/memory/MemoryView.tsx`
  - 使用另一套 `['v2-memory-commitments']`。
- `src/features/v2/inbox/InboxView.tsx`
  - mutation 刷新范围不足。
- `src/components/SettingsModal.tsx`
  - 多处派发 `df:feishu-synced`；
  - 存在 `window.location.reload()`。
- `src/components/CalendarWorkspace.tsx`
  - 监听和派发模糊同步事件。
- `src/components/FeishuAgenda.tsx`
  - 监听模糊同步事件。
- `src/components/AIChat.tsx`
  - 初始 draft 会创建 session；
  - UI 仍使用“AI 工作台”文案。
- `src/types/chat.ts`
  - `df_ai_chat_store` 未按 workspace 隔离。
- `src/hooks/useAiSessionSend.ts`
  - AI 工具可直接写数据；
  - retry 可能截断后续消息。
- Source process route/service
  - 处理前没有持久化锁与幂等 Job；
  - 重复调用可能生成重复 AgentRun/Evidence/Proposal。

此清单用于定位，不是允许一次性修改全部文件。仍须按 DFU 任务范围执行。

---

## 10. 最终产品判断标准

优化成功后，用户不需要理解 DailyFlow 内部存在 Task、Commitment、SourceItem、AgentRun 或 Query key。

用户只会感受到一条连续路径：

```text
记录在 Notes
  -> 与 AI Chat 一起理解
  -> 确认要做的变化
  -> 在 Today 安排和执行
  -> 在 Memory 找回依据与历史
```

任何新功能若不能明确进入这条路径，应先扩展现有入口，而不是再创建一个 Workspace、Tab、线程系统或刷新机制。
