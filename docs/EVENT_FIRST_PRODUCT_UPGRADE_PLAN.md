# DailyFlow Event-first 产品升级规划

> 版本：2026-08-10  
> 状态：产品方向已确认，待进入原型与实施  
> 核心决策：以 Event（事件）及其思维导图为组织核心，Today Tasks 是事件行动节点与独立任务的每日执行视图。
>
> 工程执行请使用 [`EVENT_FIRST_IMPLEMENTATION_RUNBOOK.md`](./EVENT_FIRST_IMPLEMENTATION_RUNBOOK.md)。该 Runbook 将本文拆成可交给低成本 AI 模型逐项执行的原子任务，并冻结了接口、文件范围、测试与交接格式。

## 0. 本文的优先级

本文记录 2026-08-10 确认的新产品方向，覆盖以下旧结论中与本文冲突的部分：

- `docs/PRODUCT.md` 中“项目、思考工作台、思维导图、Task 并列为多套一级对象”的信息架构；
- `docs/topic-spaces/SPEC.md` 中面向用户暴露 Topic Space、Mind Map、List View、Task 绑定关系的交互；
- `docs/DAILYFLOW_UNIFIED_PRODUCT_IMPLEMENTATION_PLAN.md` 中“一级导航不得增加 Events”的限制。

旧文档中的本地优先、Markdown 可读、稳定 ID、AI 写入需预览、迁移保守、操作可恢复等原则继续有效。

---

## 1. 产品重新定义

### 1.1 一句话

> DailyFlow 用事件组织工作和生活，用思维导图持续拆解事件，把明确的下一步安排到每一天。

### 1.2 核心分工

| 概念 | 用户用它解决什么问题 | 是否核心数据 |
|---|---|---:|
| Event | 这件事是什么，如何逐步完成 | 是 |
| Event Node | 目标、阶段、问题、资料、步骤和行动 | 是 |
| Today | 我今天具体做什么 | 否，是执行视图 |
| Event-derived Task | 某个 Event Node 被安排到某一天后的投影 | 否，是节点的执行状态 |
| Standalone Task | 不值得创建 Event 的临时小事 | 是，但保持轻量 |

产品核心与默认首页不冲突：

- **组织层 Event-first**：长期上下文、拆解和进度都属于 Event；
- **使用层 Today-first**：用户每天打开应用，默认只看当天要执行的 Tasks。

### 1.3 产品闭环

```text
创建 Event
  → 在思维导图中拆解
  → 某个节点已经可执行
  → 点击“今天”或选择日期
  → 节点出现在对应日期的 Tasks
  → 完成 Task
  → 原节点同步完成
  → Event 进度更新
```

对于临时小事：

```text
快速记录
  → 创建 Standalone Task
  → 当天完成

如果事情变复杂：
Standalone Task
  → “展开为事件”
  → 进入思维导图继续拆解
```

---

## 2. 需要解决的现状问题

当前实现已经具备 Topic Space、Mind Map、Node、Task 和跨日期读取，但用户需要同时理解：

1. Workspace 与 Work/Life；
2. Topic Space 与 Mind Map；
3. 一张 Space 的导图视图与列表视图；
4. Branch、Tag、Task 等节点类型；
5. “转为待办”“关联已有 Task”“解除关联”；
6. Today 中的 Task、Focus、关联计划和截止日期分组。

技术能力不是问题，问题是系统内部关系直接暴露成了产品结构。

本次升级不再继续增强“双向绑定 UI”，而是将关系收进领域层：

- Topic Space 与主 Mind Map 在产品中合并为一个 Event；
- Event-derived Task 不再作为第二份用户可管理对象；
- Today 只显示执行投影，不承担项目组织；
- 系统仍可使用现有 Task、MindMap 和 TopicSpace 文件作为兼容存储。

---

## 3. 新的信息架构

### 3.1 一级导航

```text
Today
Events
Notes
Ask AI

More
├── Calendar
├── Memory
└── Settings
```

说明：

- Today 是默认首页；
- Events 是核心规划入口，替代当前 Mind Map 与 Topic Space 的多层入口；
- Calendar 是 Tasks 的日期视图，不是独立任务系统；
- Memory 是搜索和历史回看能力，降为次级入口；
- 不再出现独立的 Mind Map 一级入口。

### 3.2 Events 首页

Events 首页只回答“我正在推进哪些事情”：

```text
Events                                      + New Event

Active
  完成 Pre-A 融资                    6 / 12
  发布 DailyFlow 2.0                 8 / 15
  AI Academy 招生                    3 / 9

Completed
  去年融资资料整理
```

默认卡片只显示：

- Event 标题；
- 由行动节点计算出的进度；
- 最近更新时间；
- 少量继承标签，默认最多两个。

### 3.3 Event 详情

点开 Event 后直接进入沉浸式思维导图：

```text
← Events    完成 Pre-A 融资                         Search  ···

                         [全屏思维导图]
```

默认不显示：

- 第二个 Mind Map 左侧列表；
- Topic Tabs；
- “全部 / 未分类”；
- 导图/列表切换；
- Import / Export；
- Task、Branch、Tag 类型徽标；
- Task 来源日期和绑定状态。

Import、Export、历史版本和高级整理进入 `···`。

### 3.4 Today

Today 只回答“今天做什么”：

```text
Today                                        + Add

○ 整理投资人反馈
  Pre-A 融资 › 投资人沟通

○ 完成登录页测试
  DailyFlow 2.0 › 产品 › 测试

○ 给物业打电话
  Standalone

Completed  2
```

默认任务行只展示：

- checkbox；
- 标题；
- Event 路径或 Standalone 来源；
- 必要时显示时间或逾期状态。

评论、标签、优先级、笔记、删除等操作统一进入 `···` 或详情抽屉。Today 不显示关联计划卡片，不再同时出现 Focus 与 Open Tasks 两套概念。

是否限制“每天三件事”作为硬规则，先不在本轮强制。可在验证阶段观察后决定是否增加可选的 Top 3，而不重新引入 Focus 子系统。

---

## 4. 核心交互

### 4.1 创建 Event

1. 用户点击 `New Event`；
2. 只输入标题；
3. 系统创建 Event 和根节点；
4. 立即进入导图并聚焦根节点；
5. AI 标签、描述、模板均为后置能力，不阻塞创建。

目标：从点击创建到输入第一个子节点不超过 10 秒。

### 4.2 拆解 Event

核心键盘操作：

- `Enter`：添加同级节点；
- `Tab`：添加子节点；
- `Shift + Tab`：提升层级；
- `Delete`：删除当前节点；
- `Space` 或双击：编辑节点；
- `⌘/Ctrl + Z`：撤销。

选中节点后的操作条只保留：

```text
+ Child    Today    Date    ···
```

`···` 内包含备注、颜色、标签、删除等低频操作。

### 4.3 节点安排到每日 Tasks

- 点击 `Today`：设置 `scheduledDate = today`，节点进入 Today；
- 点击 `Date`：选择日期，节点进入对应日期；
- 安排后的节点显示 checkbox；
- 点击已安排日期可重新安排；
- 点击 `Remove from day` 只取消安排，不删除节点。

用户界面禁止使用：

- Promote to Task / 转为任务；
- Link Task / 关联任务；
- Unlink Task / 解除关联；
- Task Node / 任务节点。

### 4.4 完成

- 在 Today 勾选：直接更新来源节点的 execution status；
- 在导图勾选：Today 同一项立即完成；
- 完成节点仍保留在 Event 中，作为事件历史和上下文；
- Event 进度只统计拥有 execution 状态的行动节点，普通思考节点不进入分母；
- 当全部行动节点完成时，提示用户是否结束 Event，不自动关闭。

### 4.5 Standalone Task

Today 的快速输入默认创建 Standalone Task，适合：

- 电话、回复、购买、报销；
- 不需要持续上下文的短动作；
- 一次即可完成的临时事项。

Standalone Task 支持：完成、改日期、加备注、删除和“展开为事件”。

“展开为事件”采用带撤销的显式转换：

1. 创建同名 Event；
2. 将原 Task 的描述、备注和标签写入 Event；
3. 原 Standalone Task 从 Today 移除但保留迁移记录；
4. 打开新 Event 的思维导图；
5. 用户从根节点继续拆解并安排真正的下一步。

---

## 5. 自动标签设计

### 5.1 标签分层

| 层级 | 示例 | 存储/计算方式 |
|---|---|---|
| Event 标签 | `融资`、`产品` | Event 上存储 |
| Node 手动标签 | `材料` | Node 上存储，仅表达例外 |
| AI 标签 | `投资人`、`公众号` | Event/Node 上存储，标记来源与置信度 |
| 有效标签 | `融资 + 材料 + 投资人` | 读取时计算，不重复写入 |

有效标签：

```text
Event manualTags
+ Event acceptedAiTags
+ ancestorNode manualTags
+ currentNode manualTags
+ currentNode acceptedAiTags
```

### 5.2 不应该成为 Tag 的字段

以下信息使用结构化字段，不污染标签：

- Event 来源；
- 节点路径；
- Work / Life；
- 日期与截止日期；
- 状态、优先级；
- Today、Overdue、Completed。

### 5.3 AI 自动标签规则

- AI 关闭时，继承标签仍完整工作；
- Event 创建后可异步建议最多两个标签；
- Node 只有在文本足够具体、置信度达到阈值时才自动建议；
- 低置信度结果只显示为 suggestion，不直接写入；
- 用户删除的 AI 标签进入 suppression 列表，后续不反复推荐；
- AI 标签不得阻塞创建、编辑、安排或完成；
- 发送给外部模型前遵循现有 AI 授权和 Proposal 原则。

### 5.4 Today 的显示原则

自动标签主要服务搜索、过滤和 AI 上下文，不默认铺满任务行。

Today 默认显示 Event 路径；标签只在以下位置出现：

- 搜索/筛选；
- Task 详情抽屉；
- AI 新建议需要确认时；
- 用户主动开启“显示标签”。

---

## 6. 目标领域模型

```ts
type EventStatus = 'active' | 'completed' | 'archived';

interface Event {
  id: string;
  workspaceId: string;
  title: string;
  status: EventStatus;
  context: 'work' | 'life';
  rootNodeId: string;
  manualTags: string[];
  aiTags: SuggestedTag[];
  createdAt: string;
  updatedAt: string;
  version: number;
}

interface EventNode {
  id: string;
  eventId: string;
  parentId?: string;
  text: string;
  note?: string;
  position: { x: number; y: number };
  collapsed?: boolean;
  manualTags: string[];
  aiTags: SuggestedTag[];
  execution?: {
    status: 'todo' | 'done';
    scheduledDate: string;
    deadline?: string;
    priority?: 'high' | 'medium' | 'low';
    completedAt?: string;
  };
}

interface StandaloneTask {
  id: string;
  workspaceId: string;
  title: string;
  status: 'todo' | 'done';
  scheduledDate: string;
  deadline?: string;
  note?: string;
  manualTags: string[];
  aiTags: SuggestedTag[];
}

type TodayItem =
  | { kind: 'event-node'; event: Event; node: EventNode; path: EventNode[] }
  | { kind: 'standalone'; task: StandaloneTask };

interface SuggestedTag {
  value: string;
  source: 'ai';
  confidence: number;
  state: 'suggested' | 'accepted' | 'rejected';
}
```

关键约束：

1. Event-derived Task 的标题、状态和日期以 EventNode 为领域真相；
2. TodayItem 只是查询结果，不创建第三份实体；
3. Standalone Task 保持独立，因为它没有 Event 上下文；
4. UI 不根据 `kind: task` 判断节点，而根据 `execution` 是否存在；
5. 路径由 Event 树结构计算，不存成标签；
6. 所有写操作经过一个 Event domain service，禁止组件自行做双向同步。

---

## 7. 与当前存储的兼容策略

### 7.1 过渡期不立即重写全部文件

当前已有：

- `TopicSpace` Markdown 文件；
- `MindMap` JSON 文件；
- Daily Markdown 中的 Task；
- `spaceId`、`originMindmapId`、`originNodeId`、`taskDate` 等关系字段。

第一阶段通过 Event Adapter 组合现有数据：

```text
Event = TopicSpace + 它的一张主 MindMap
EventNode = MindMapNode
Event-derived Task = 带 originMindmapId/originNodeId 的 Task
Standalone Task = 没有 originMindmapId/originNodeId 的 Task
```

这样可以先验证新 UX，而不是把产品升级与高风险数据迁移绑在一起。

### 7.2 过渡期写入规则

在底层完全收敛前，建立唯一 `EventExecutionService`：

- `scheduleNode(eventId, nodeId, date)`；
- `rescheduleNode(eventId, nodeId, fromDate, toDate)`；
- `completeNode(eventId, nodeId)`；
- `reopenNode(eventId, nodeId)`；
- `unscheduleNode(eventId, nodeId)`；
- `convertStandaloneTaskToEvent(taskId, date)`。

服务负责原子地维护当前 MindMapNode 与 Markdown Task 投影；前端不得直接分别写两处。

### 7.3 迁移规则

| 当前数据 | 新产品表现 | 处理方式 |
|---|---|---|
| Topic Space + 主 MindMap | Event | 无损组合，保留原 ID |
| 独立 MindMap | Event | 自动创建兼容 Event 外壳 |
| 已绑定 Node/Task | 已安排 Event Node | 恢复 execution 字段，保留原日期 |
| 未绑定 Node | 普通 Event Node | 原样保留 |
| 无来源 Task | Standalone Task | 原样保留 |
| 孤儿 Task/Node 关系 | Standalone 或普通 Node | 迁移报告中列出，不静默删除 |
| `kind: tag` 节点 | 普通节点 + manualTag 候选 | 用户确认后转换 |

迁移必须满足：

- 先生成备份；
- dry-run 输出数量和异常；
- 同一迁移可重复执行，结果幂等；
- 不删除旧文件，直到新版本完成至少一个发布周期；
- 提供回滚到旧读取器的能力。

### 7.4 长期存储方向

验证 UX 成功后，再决定是否将 Event 收敛为单一 Markdown 文档 + layout sidecar。此项不是首轮前置条件，避免为了模型纯度延迟产品验证。

---

## 8. 分阶段实施

### Milestone 0：产品契约与安全底座

目标：冻结术语和迁移边界。

工作项：

- 建立 `Event` / `EventNode` / `TodayItem` 前端适配类型；
- 添加 `eventFirst` feature flag；
- 建立迁移 dry-run 与备份命令；
- 建立当前数据数量基线：spaces、maps、nodes、linked tasks、standalone tasks、orphans；
- 为旧数据读取建立 fixture。

验收：

- 开关关闭时现有版本行为不变；
- dry-run 不写盘；
- 所有旧 fixture 均可转换为 Event 读取模型；
- 异常关系有明确报告。

### Milestone 1：Event-first 信息架构与沉浸导图

目标：用户只感知 Event，不感知 Topic Space 与 Mind Map 的双层结构。

工作项：

- 主导航加入 Events，Mind Map 从 More 移除；
- 新建 Events 首页；
- TopicSpace + MindMap 经 adapter 渲染为 Event；
- Event 详情采用全屏画布；
- 移除默认显示的 Topic Tabs、MindMapList、List View、Tag Filter；
- 节点操作条收敛为 Child、Today、Date、More；
- Import、Export、搜索和布局工具进入 More。

验收：

- 新用户无需说明即可创建 Event、添加三层节点；
- Event 详情首屏只有一个主画布；
- 界面中不出现 Topic Space、Task Node、Promote、Link、Unlink；
- 现有 Event 数据无损打开、编辑和保存。

### Milestone 2：Node → Today 执行闭环

目标：节点安排后自然进入当天，完成后回到原 Event。

工作项：

- 实现 `EventExecutionService`；
- 节点支持 Today、Date、Reschedule、Unschedule；
- Today API 返回 event-node 与 standalone union；
- Today 行显示 Event breadcrumb；
- Today 完成/恢复直写统一领域服务；
- Event 进度只统计 execution nodes；
- 删除与取消安排语义分离。

验收：

- 从 Event 新建节点到 Today 可见不超过两次点击；
- Today 完成后 Event 节点状态立即一致；
- 改日期不会复制 Task；
- 取消安排不会删除节点；
- 连续重试不产生重复 Daily Task；
- 跨日期节点能够稳定打开来源 Event。

### Milestone 3：Today 极简化与 Standalone Task

目标：Today 成为无组织负担的执行列表。

工作项：

- Task 行收敛为 checkbox、标题、来源、必要时间状态；
- 移除 Today 的关联计划模块；
- 取消 Focus 与 Open Tasks 双层结构；
- 快速输入创建 Standalone Task；
- Standalone Task 支持“展开为事件”与撤销；
- 高级字段进入详情抽屉。

验收：

- Today 首屏不存在规划组件、导图卡片和标签墙；
- 用户可在 5 秒内创建独立 Task；
- Event Task 与 Standalone Task 可被清楚区分但不需要不同操作；
- Standalone → Event 转换不丢标题、描述、标签和历史。

### Milestone 4：标签继承与 AI 辅助

目标：系统自动获得组织能力，但不增加视觉噪声。

工作项：

- Event 标签继承；
- Node 层 additive tags；
- effective tags 查询与搜索；
- Standalone Task 的轻量自动标签；
- AI tag suggestion、置信度与 suppression；
- Today 默认隐藏标签，筛选和详情按需展示。

验收：

- 修改 Event 标签后所有后代 effective tags 即时更新，不批量改写节点；
- AI 关闭时核心功能不受影响；
- 每次自动建议不超过两个标签；
- 被用户拒绝的标签不重复建议；
- “今天/过期/完成”等结构状态不会出现在标签列表。

### Milestone 5：迁移、清理与正式切换

目标：安全移除旧产品壳和重复路径。

工作项：

- 执行 migration dry-run 并处理异常；
- 将 standalone maps 包装为 Events；
- 清理旧 Topic Tabs、TaskListView、promote/link/unlink UI；
- 删除不再使用的状态与请求路径；
- 更新 README、PRODUCT、架构和数据格式文档；
- feature flag 默认开启，保留一个版本回退窗口。

验收：

- 迁移前后 Event、Node、Task 数量可解释；
- 无静默删除、无重复 Task、无失联 Event；
- 旧文件仍可由回退版本读取；
- 全量单测、集成测试、E2E、生产构建通过；
- 产品中不存在旧术语和重复入口。

---

## 9. 测试与验证矩阵

### 9.1 领域测试

- schedule 同一节点两次保持幂等；
- reschedule 只移动，不复制；
- complete / reopen 在 Today 与 Event 保持一致；
- unschedule 保留节点；
- 删除节点正确移除执行投影并可撤销；
- Event 进度忽略普通节点；
- effective tags 正确继承且不重复；
- Standalone → Event 转换保留数据。

### 9.2 数据测试

- v1 MindMap；
- v2 MindMap；
- TopicSpace + map；
- standalone map；
- linked task；
- cross-date task；
- orphan node/task；
- 中文标题、重复标题、特殊字符；
- migration repeat-run。

### 9.3 E2E 核心旅程

1. 创建 Event → 添加节点 → 安排今天 → Today 完成 → Event 状态更新；
2. Event Node 安排未来日期 → Calendar 可见 → 改到今天；
3. Today 快速创建 Standalone → 完成；
4. Standalone → Event → 拆解 → 安排新节点；
5. Event 标签继承 → Today 搜索命中；
6. AI 标签关闭/失败时，创建和安排不受影响；
7. 老数据迁移后逐项抽样核对。

### 9.4 UX 验收

- 未读说明的测试用户能在 60 秒内完成“创建事件—拆解—安排—完成”；
- Event 页面首屏不存在第二层导航和重复列表；
- Today 首屏只承担执行；
- 任意 Today Event Task 一次操作可回到来源节点；
- 手机、默认桌面窗口和大屏下主操作均不被隐藏；
- 键盘可完成核心导图编辑；
- `prefers-reduced-motion` 下无必要动画。

---

## 10. 成功指标

产品验证不以功能数量为指标，关注闭环是否自然：

| 指标 | 目标信号 |
|---|---|
| Event 创建后首个子节点时间 | 持续下降 |
| 有节点被安排到日期的 Event 占比 | 持续上升 |
| 安排节点到 Today 的成功率 | 接近 100% |
| 重复 Task / 孤儿关联数量 | 0 |
| Today 中能找到来源 Event 的比例 | 100% |
| Standalone Task 占比 | 保持存在，但复杂任务逐步进入 Event |
| Promote/Link/Unlink 相关求助 | 归零 |
| AI 标签被接受率 | 用于调阈值，不追求数量 |

遥测必须是可选、本地可查看且不上传任务正文；没有遥测时使用本地测试和访谈验证。

---

## 11. 非目标

本轮不做：

- 多人协作与任务分配；
- 任意图结构和复杂依赖管理；
- 甘特图、OKR、企业项目管理套件；
- 自动把所有叶子节点变成 Task；
- AI 自动替用户安排日期或完成 Event；
- 为追求模型纯度立即重写全部本地文件；
- 将标签重新做成新的重型组织系统。

---

## 12. 实施原则

1. **一个页面一个问题**：Event 负责思考，Today 负责执行；
2. **复杂度后置**：高级字段、导入导出和 AI 建议按需出现；
3. **用户不管理关系**：绑定、同步和投影由领域服务负责；
4. **默认动作可撤销**：转换、删除和批量安排必须可恢复；
5. **先验证 UX，再收敛存储**：避免一次性高风险重构；
6. **保守迁移**：不静默删除，不覆盖未知字段；
7. **本地优先**：AI、云同步和遥测均不是核心闭环的依赖。

## 13. 当前代码到目标架构的改造地图

| 当前模块 | 目标动作 | 备注 |
|---|---|---|
| `src/App.tsx` | 新增 `events` surface，移除面向用户的 `mindmap` surface | Today 继续作为默认页 |
| `src/components/Sidebar.tsx` | Events 升为一级入口，Mind Maps 从 More 移除 | Calendar、Memory 保持次级 |
| `src/components/TopicTabs/TopicTabs.tsx` | 从 Event 详情移除 | Event 切换发生在 Events 首页或轻量顶部切换器 |
| `src/components/TopicSpaceView/TaskListView.tsx` | 删除产品入口，能力并入 Today 查询 | 不保留导图/列表双视图 |
| `src/components/MindMap/MindMapList.tsx` | 从 Event 画布移除 | Import/Export 进入 More |
| `src/components/MindMap/MindMapView.tsx` | 拆为 Event 容器与可复用 Canvas 状态层 | 去除 space/map 双重选择 |
| `src/components/MindMap/MindMapCanvas.tsx` | 增加 Today/Date 操作，保留编辑、布局与撤销 | 调用 Event domain command，不直接写 Task API |
| `src/components/MindMap/MindMapNode.tsx` | 移除 kind/task 元信息，execution 存在时才显示 checkbox | 默认节点保持纯思考状态 |
| `src/components/MindMap/NodeContextMenu.tsx` | 删除 promote/link/unlink，保留低频节点操作 | 高频操作进入选中态工具条 |
| `src/components/TodayBacklog.tsx` | 改为渲染 `TodayItem` union | 移除 planningGroups 与 Event 组织逻辑 |
| `src/components/TaskInputPanel.tsx` | 默认创建 Standalone Task | 高级字段继续渐进披露 |
| `src/hooks/useTopicSpaces.ts` | 新建 `useEvents` adapter，迁移完成后替换 | 首轮可以复用原 query 与缓存 |
| `src/hooks/useMindMapActions.ts` | 替换 promote/link mutation 为 schedule/reschedule/unschedule | 方法名必须使用用户语义 |
| `server/services/topicSpaces.ts` | 首轮由 `eventAdapter` 组合读取，后续决定是否重命名 | 不在原型期高风险搬文件 |
| `server/services/mindmaps.ts` | 继续负责树与布局数据 | execution 写入统一领域服务 |
| `server/routes/tasks.ts` | Standalone Task 继续使用；Event-derived 写入转交领域服务 | 禁止新增页面级双写逻辑 |
| `server/services/parser.ts` | 保持旧 Markdown 兼容与稳定关联 marker | 迁移期用于恢复 origin 关系 |
| 新建 `server/services/events.ts` | Event 聚合读取、状态、标签与进度 | 对 UI 隐藏 TopicSpace/MindMap 组合 |
| 新建 `server/services/eventExecution.ts` | 节点安排、改期、完成、恢复、取消安排 | 全部命令要求幂等 |
| 新建 `/api/events` | Event-facing API facade | 旧 API 在迁移窗口继续存在 |
| 新建 `/api/today` 聚合读取 | 返回 Event Node 与 Standalone Task | 统一排序但不复制实体 |

推荐开发顺序严格遵循：领域 adapter → Event 只读 UI → Event 编辑 → 安排命令 → Today 聚合 → 旧入口删除。不得先删除旧读取路径再补迁移。

## 14. 最终产品判断

升级后的 DailyFlow 不是“Task 软件加一张思维导图”，也不是“Mind Map 与 Tasks 双向同步的两套系统”。

它的结构是：

> Event 是事情本身，Mind Map 是事情的思考方式，Tasks 是事情落到每一天的行动视图。

只要这一关系在数据、交互和页面层都保持一致，产品会明显变轻，同时保留复杂事项管理的真正差异化价值。
