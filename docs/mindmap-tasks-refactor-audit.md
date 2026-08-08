# DailyFlow 思维导图 × Tasks 工作流重构 — 现状审计与实施计划

> 本文档基于对当前代码的逐行审计，所有结论均标注了文件路径与行号作为证据。本轮只分析，不修改代码。

---

## 一、正确的产品工作流（我的理解）

DailyFlow 的核心不是「Tasks + 一个附属的思维导图」，而是 **目标 → 思考 → 拆解 → 执行** 的单向流，思维导图位于执行之前：

```
目标 / Topic Space
        │
        ▼
  在思维导图中思考、拆解、归类、排序
        │
        ▼
  把可执行节点升级为 Tasks（节点保留为"规划投影"）
        │
        ▼
  在 Tasks 中安排日期、执行、跟踪
        │
        ▼
  Task 状态与结果同步回思维导图
```

只有非常明确的临时事项，才直接在 Tasks 中新建。这意味着：

1. **思维导图是主要的规划空间**，不是辅助视图。
2. **节点升级为 Task 后不消失**，它继续留在导图中，作为 Task 的"规划投影"——承载父子结构、位置、折叠、颜色、规划备注；Task 则承载标题、完成状态、日期、截止时间、优先级、提醒。
3. **两者通过稳定的关联字段双向同步**：节点标题/状态的修改要回写到 Task；Task 标题/状态的修改要回显到节点。

这与当前代码的认知存在根本差异——当前代码把 `kind: 'task'` 节点当作"已经变成 Task"，只做了单向一次性绑定，没有把它当作持续的投影关系。

---

## 二、证据化问题清单（按代码定位）

### A. 关联生命周期不完整

#### A1. 节点改标题不会更新关联 Task
- **证据**：`src/components/MindMap/MindMapCanvas.tsx:371-376` `onCommitEdit` 只调用 `onChangeRef.current({ nodes: next })`，把新 text 写进 map 节点；没有任何路径调用 `tasksApi.edit(taskId, date, { title })`。
- **影响**：用户在导图中改了节点标题，Task 标题仍是旧的，两边数据漂移。

#### A2. 节点状态变化不会更新关联 Task
- **证据**：`MindMapCanvas.tsx:480-486` `onCycleStatus` 只改 `node.status`；`MindMapNode.tsx:269-298` 状态按钮的 `onClick` 只调 `d.onCycleStatus(id)`。没有任何路径触发 `tasksApi.updateStatus`。
- **影响**：在导图里把节点标记成 ✓，对应的 Task 仍是 ☐。

#### A3. Task 的修改只在"今日日期的任务列表"加载时才回显
- **证据**：`MindMapView.tsx:722-749` 的镜像 effect 依赖 `linkableTasks`；而 `src/App.tsx:1609-1614` 传入的 `linkableTasks` 来自 `tasks` 状态，即当前选中日期（通常今日）的任务。跨日期任务不在其中，节点不会被镜像更新。
- **影响**：把昨天的 Task 标记完成，今天打开导图，对应节点仍显示未完成。

#### A4. 删除 Task 会留下孤儿节点
- **证据**：`server/routes/tasks.ts:163-190` DELETE 只删 markdown 行，不调用任何 mindmap 服务清理 `taskId` / `kind`。
- **影响**：节点仍带着失效的 `taskId`，`kind: 'task'` 但指向不存在的 Task。

#### A5. 删除节点不处理关联 Task
- **证据**：`MindMapCanvas.tsx:428-446` `onDelete` 只从 map 删节点和边，不区分该节点是否已关联 Task，也不询问"保留 Task 还是同时删除"。
- **影响**：删节点静默丢失规划上下文；或反之，留下没有规划投影的 Task。

#### A6. 解除 Topic Space 关联的前后端契约不一致 ⚠️
- **证据**：
  - 前端 `src/api/client.ts:220-228` `updateSpace(taskId, spaceId)` **不传 `date`**。
  - 服务端 `server/routes/tasks.ts:213-291` 强制要求 `date`：`if (typeof date !== 'string' || !date) return res.status(400).json({ error: 'date is required' });`（226-229 行），并用 `date` 定位 daily note 文件改 `^space:` 标记。
- **影响**：`TaskListView` 的"解除关联"按钮（`App.tsx:1594` `onUnlinkTask` → `handleUnlinkTask` → `updateTaskSpaceMut.mutateAsync({ taskId, spaceId: null })`）**必然返回 400**。这是一个当前就存在的破坏性 bug。

#### A7. Task 来源字段未持久化解析
- **证据**：`server/types/task.ts:20-23` `Task` 有 `originMindmapId` 和 `originNodeId`，`mindmaps.ts` 的 promote 路由确实写入（`mindmaps.ts:226-227`）。但 `server/services/parser.ts` 的 `parseMarkdown` 并不从 markdown 行读取这两个字段——它们只在创建时存在于内存对象里，下一次重新 parse 时丢失。
- **影响**：重启或切换日期后，Task 与节点的反向关联只能靠 `MindMapNode.taskId` 单向维持，且依赖跨日期定位。

### B. 跨日期数据源缺失

#### B1. Topic Space 任务列表只基于当前选中日期
- **证据**：`src/App.tsx:339-344` `tasksInActiveSpace` 直接从 `tasks` 过滤，而 `tasks` 是当日 daily note 的任务。代码注释自己承认："a future Phase 4 enhancement will scan across days"。
- **影响**：一个 Topic Space 里分散在多天的 Tasks 无法在同一列表里看到，规划视图断裂。

#### B2. 导图节点的 `taskSourceDate` 也只来自今日列表
- **证据**：`MindMapView.tsx:104-116` `buildTaskSourceDateByNodeId` 从传入的 `tasks`（今日）构建 `dateByTaskId`。跨日期任务的节点查不到 date，"打开 Task"按钮不会显示（`MindMapNode.tsx:437` 要求 `d.sourceDate` 存在）。
- **影响**：昨天升级的节点，今天无法跳转回 Task。

### C. 沉浸模式不存在

#### C1. 导图被多层 UI 包裹
- **证据**：`App.tsx:1524-1619` mindmap 容器结构为：`<main>` → 主侧栏 `ml-[60px]` → `<TopicTabs>` → view switcher（导图/列表） → `<TagFilterRow>` → `<MindMapView>`；而 `MindMapView` 内部又分 `<MindMapList>` 左栏（`MindMapView.tsx:1054-1064`）+ header（`1099-1216`）+ canvas。
- **影响**：画布被至少四层 UI 压缩，远非"占满应用窗口的沉浸式画布"。

#### C2. 没有任何沉浸模式状态
- **证据**：全项目搜索 `immersive|focusMode|沉浸` 在 MindMap 相关文件中无命中。
- **影响**：验收要求里的 `Esc` 退出、隐藏侧栏/Topic Tabs/导图列表/视图切换栏/AI 浮按，全部要从零实现。

### D. 缩放与平移体验

#### D1. 已有配置
- `MindMapCanvas.tsx:638-649`：`minZoom 0.1 / maxZoom 2`、`zoomOnScroll`、`panOnDrag`、`panOnScroll={false}`、`nodesConnectable={false}`、`disableKeyboardA11y`。

#### D2. 缺失配置
- 未设 `zoomOnPinch`（触控板捏合）、`zoomOnDoubleClick`、`panOnScrollSpeed`。
- 未实现"鼠标指针位置缩放"——React Flow 默认 `zoomOnScroll` 以视口中心缩放，不是指针位置。
- 未暴露"一键适应全部内容"按钮（虽有内部 `fitToBounds`，但只在布局变化时自动触发，用户无主动入口）。
- 未实现"聚焦当前分支"（选中节点所在子树自动居中并隐藏其他）。

### E. "设为任务"入口隐蔽且不支持多选

#### E1. 仅右键菜单
- **证据**：`NodeContextMenu.tsx:147-161` 只在 `kind === 'branch'` 时显示"转为待办"，且整个菜单只由 `MindMapNode.tsx:232-239` 的 `onContextMenu` 触发。`MindMapNode.tsx:351-429` 的选中态浮动操作条里**没有**"设为任务"按钮。
- **影响**：用户必须知道右键才能升级节点，与"主要交互"的目标相反。

#### E2. 单节点操作
- **证据**：promote/link 的所有 mutation 都是 `{ mapId, nodeId, ... }`（`useMindMapActions.ts:36-41, 68-73`），服务端路由也是单节点路径参数（`mindmaps.ts:174, 293`）。
- **影响**：无法框选 10 个节点一次性升级。

### F. 规划顺序未持久化

#### F1. 没有 `planOrder` 字段
- **证据**：`server/types/mindmap.ts:25-56` 和 `src/api/client.ts:1009-1032` 的 `MindMapNode` 都没有 `planOrder`。`MindMap` 类型也没有同层顺序的显式字段——顺序仅靠 `nodes` 数组顺序隐含。
- **影响**：用户在导图调整同层顺序后，无法可靠地映射到 Topic Space 列表的"规划顺序"视图。

#### F2. 拖动节点不更新顺序
- **证据**：`MindMapView.tsx:658-672` `handlePositionsChange` 只更新 `position` 字段并保存，不改 `nodes` 数组顺序，也不写任何 order 字段。

### G. 进度统计错误

#### G1. 所有非根节点都被当作任务
- **证据**：`MindMapView.tsx:689-699` `progress` 遍历除 root 外所有节点，`total += 1`，不检查 `kind === 'task'`。
- **影响**：普通想法、阶段、分类节点全部计入任务总数，完成率永远偏低。

### H. 父子任务关系未建立

- **证据**：导图的父子结构（edges）和 Task 之间没有"父任务/子任务"映射。`task.ts` 的 `Task` 类型没有 `parentId`。当前规则下，即使父子节点都升级为 Task，它们之间也没有任务层级的关联。

---

## 三、建议的数据模型与同步规则

### 3.1 关联契约（前后端共用一份）

在 `MindMapNode` 上显式化关联元数据，避免靠 `kind === 'task'` 隐式判断：

```typescript
// server/types/mindmap.ts（新增字段，向后兼容）
interface MindMapNode {
  // ...现有字段...
  /** 当节点关联到 Task 时存在。kind === 'task' 的判据。 */
  taskId?: string;
  /** Task 所在的 daily note 日期（YYYY-MM-DD）。跨日期定位的锚点。 */
  taskDate?: string;
  /** 同层规划顺序。缺失时回退到 nodes 数组顺序。 */
  planOrder?: number;
}

// server/types/task.ts（新增字段）
interface Task {
  // ...现有字段...
  /** 来源导图 id（promote 时写入，需被 parser 持久化） */
  originMindmapId?: string;
  /** 来源节点 id */
  originNodeId?: string;
  /** 父任务 id，建立任务层级（可选，Phase 4） */
  parentTaskId?: string;
}
```

**关键决策点**：`originMindmapId` / `originNodeId` 当前只在内存对象里，`parser.ts` 不解析它们。要让反向关联可靠，必须在 markdown 行落盘并解析。建议用系统标记 `^mm:<mindmapId>` 和 `^node:<nodeId>`（与 `^space:` 同风格，UI 不可见）。

### 3.2 字段职责划分

| 实体 | 负责字段 | 不负责 |
|------|---------|--------|
| **Task** | 标题、完成状态、日期、截止时间、优先级、提醒、parentTaskId | 父子结构、位置、颜色 |
| **MindMapNode** | 父子结构（edges）、position、collapsed、color、note、planOrder、taskId、taskDate | 任务标题的权威性（以 Task 为准） |
| **关联** | taskId、taskDate、originMindmapId、originNodeId、planOrder | — |

### 3.3 同步规则

| 触发动作 | 同步行为 |
|---------|---------|
| 节点改标题（已关联 Task） | 调 `tasksApi.edit(taskId, taskDate, { title })` |
| 节点切换 status（已关联 Task） | 调 `tasksApi.updateStatus(taskId, taskDate, status)` |
| Task 标题被改（任意日期） | 通过跨日期数据源找到节点，更新 `node.text` |
| Task 状态被改（任意日期） | 同上，更新 `node.status` |
| 删除节点（已关联 Task） | 弹窗：①保留 Task 并解除关联 ②同时删除 Task |
| 删除 Task | 默认保留节点，清空 `taskId/taskDate/kind` 回退为 branch |
| 解除关联 | 清理 node.taskId/taskDate、Task.originMindmapId/originNodeId、TopicSpace.taskIds 中对应项 |
| 移动同层节点 | 重算同层 planOrder 并持久化 |

### 3.4 删除规则的明确语义

```
删除节点 N（已关联 Task T）:
  ├─ 用户选"保留 Task": 清 N.taskId/taskDate/kind → 'branch'；清 T.originMindmapId/originNodeId
  └─ 用户选"同时删除": 删 T 的 markdown 行；删 N（及其子树，子树里的 Task 同理处理）

删除 Task T（已关联节点 N）:
  └─ 默认: N.taskId/taskDate 清空，N.kind → 'branch'；从 TopicSpace.taskIds 移除 T

解除 Topic Space 关联:
  └─ 前端必须传 date；服务端用 date 定位文件，移除 ^space: 标记；
     清 Task.spaceId；从 TopicSpace.taskIds 移除。
     （当前前端不传 date，必须修复）
```

---

## 四、分阶段实施计划

### 阶段 1：修复数据关联与跨日期读取（保证不丢关系、不产生孤儿）

**目标**：让现有的 promote / link 真正可用，修复 A6 这种已存在的破坏性 bug。

1. **修复解除关联的 date 契约**
   - `src/api/client.ts` 的 `updateSpace` / `setSpace` 增加 `date` 参数。
   - `handleUnlinkTask`（App.tsx:317）传入 `t.source_date ?? currentFileDate`。
   - 增加 e2e 测试：在列表视图解除关联不再 400。

2. **持久化 `originMindmapId` / `originNodeId`**
   - `taskMetadata.ts` 增加 `^mm:` / `^node:` 标记的读写。
   - `parser.ts` 解析这两个标记回填到 `Task`。
   - `appendTaskToMarkdown` 写入标记。
   - 迁移脚本：扫所有 daily note，对已有 `^id-` 但无 `^mm:` 的任务，尝试从 mindmap 文件反查补齐（best-effort）。

3. **新增跨日期 Topic Space 任务源**
   - 新增服务端端点 `GET /api/topic-spaces/:id/tasks`：遍历 `space.taskIds`，对每个 taskId 反查它在哪个 daily note（利用 `^id-` 全局扫描缓存或新建索引），返回 `{ task, date }[]`。
   - `tasksInActiveSpace` 改用此端点，不再依赖今日 `tasks`。
   - `linkableTasks` 与 `buildTaskSourceDateByNodeId` 也改用此数据源，修复 B1/B2。

4. **节点标题/状态回写 Task**
   - `MindMapCanvas.onCommitEdit` / `onCycleStatus` 在节点 `kind === 'task'` 时，额外触发 `tasksApi.edit` / `updateStatus`（用 `node.taskDate`）。
   - 失败时回滚节点本地状态并 toast。

5. **孤儿清理**
   - 加载导图时，对每个 `kind === 'task'` 节点，用跨日期源校验 taskId 是否存在；不存在则清字段并标记为"孤儿已修复"。
   - 删 Task 时，服务端反查节点并清理（新增 `unlinkNodeTaskBinding` helper）。

**验收**：删除一个 Task 后节点自动回退 branch；跨日期改 Task 状态后导图刷新可见；解除关联不再报错。

### 阶段 2：沉浸模式 + 缩放/平移修复

**目标**：画布占满应用窗口，手势流畅。

1. **沉浸模式状态**
   - `MindMapView` 增加 `immersive: boolean`，支持 `Esc` 退出。
   - 沉浸时：App.tsx 隐藏主侧栏（或收起到 60px icon-only）、TopicTabs、view switcher、TagFilterRow、MindMapList 左栏、header 的多余按钮；只保留精简悬浮标题栏 + 边缘工具栏。
   - 通过 prop 把 `immersive` 从 MindMapView 透传到 App，让 App 控制全局 chrome 的显隐。

2. **缩放/平移**
   - `MindMapCanvas` 增加 `zoomOnPinch`、`zoomOnDoubleClick={false}`、`panOnScroll`（可选）。
   - 指针位置缩放：监听 `onWheel` 计算 `zoomToPoint(mousePosition, newZoom)`。
   - 边缘工具栏新增按钮：「适应全部内容」（调 `fitToBounds`）、「聚焦当前分支」（遍历选中节点的子树，fit 到子树 bounds，其他节点淡化）、「小地图显隐」。

3. **多选与框选**
   - React Flow `selectionOnDrag` 启用框选。
   - `MindMapCanvas` 维护 `selectedIds: Set<string>`（替换当前 `selectedId` 单值）。
   - 多选时浮动操作条显示「设为任务（N）」。

**验收**：进入沉浸模式后画布占满；触控板捏合缩放流畅；指针位置缩放正确；Esc 退出；框选多个节点后可批量升级。

### 阶段 3：把"设为任务"提升为主要交互

**目标**：选中节点即看到主操作，支持多选批量。

1. **浮动操作条增加主操作**
   - `MindMapNode.tsx` 选中态操作条里，在「+」之前加一个醒目的「设为任务」按钮（未关联时）；已关联时显示「打开任务」「解除关联」。
   - 多选时在画布角落显示批量操作条。

2. **批量 promote 端点**
   - 新增 `POST /api/mindmaps/:id/nodes/batch-promote` 接受 `nodeIds: string[]`，服务端循环创建 Task 并回填，返回更新后的 map + 创建的 tasks 列表。
   - 失败一半时：已成功的不回滚，返回部分成功结果，前端 toast 提示。

3. **快捷键**
   - 选中节点按 `Cmd/Ctrl+Enter`（或 `T`）升级为 Task。

**验收**：单击节点看到"设为任务"主按钮；框选 5 个节点一键全升级；快捷键可用。

### 阶段 4：规划顺序、父子任务、完整删除规则

**目标**：让导图顺序成为真正的规划顺序。

1. **planOrder 持久化**
   - 移动同层节点后，重算该层所有节点的 `planOrder` 并保存。
   - `TaskListView` 新增「按规划顺序」排序，与「按日期」「按截止时间」「按优先级」并列。

2. **父子任务关系**
   - 父子节点都升级为 Task 时，给子 Task 写 `parentTaskId = 父Task.id`。
   - TaskCard 渲染父子缩进；完成父 Task 时不自动完成子 Task（避免误操作），但显示子任务进度。

3. **删除确认弹窗**
   - 删节点时弹窗：「保留 Task 并解除关联 / 同时删除 Task / 取消」。
   - 删 Task 时默认保留节点（可勾选"同时删除节点"）。

4. **进度统计修正**
   - `MindMapView.progress` 只统计 `kind === 'task'` 的节点。

**验收**：移动节点后 planOrder 持久化；父子任务层级正确显示；删除弹窗三选项工作；进度只数真实 Task。

---

## 五、需要你确认的产品决策

在开始修改代码前，以下决策会影响实现方向，请逐项确认：

1. **跨日期任务定位的实现策略**
   - 方案 A（推荐）：新增 `GET /api/topic-spaces/:id/tasks`，服务端维护 `taskId → date` 的反向索引（启动时扫描一次 + 增量更新）。
   - 方案 B：每次请求实时扫描所有 daily note（简单但慢，任务多时明显）。
   - 方案 C：在 TopicSpace 文件里冗余 `taskIds` + 对应 `date`（需要同步维护两处）。

2. **`originMindmapId` / `originNodeId` 的持久化位置**
   - 方案 A（推荐）：写进 Task 的 markdown 行（`^mm:` / `^node:` 系统标记），parser 解析。优点：单文件自包含，删 Task 时关联自然消失。
   - 方案 B：只在导图节点侧维护 `taskId`，反向关系靠扫描导图文件重建。缺点：删 Task 后无法快速定位节点。

3. **节点改标题时的同步策略**
   - 方案 A（推荐）：双向同步——节点改标题回写 Task，Task 改标题回显节点。需要冲突处理（两边同时改）。
   - 方案 B：单向——Task 为权威源，节点标题只读（节点上的编辑框对 `kind === 'task'` 节点禁用）。实现简单但体验割裂。

4. **沉浸模式下 Topic Tabs 和导图列表的处理**
   - 方案 A（推荐）：全部隐藏，用悬浮的"当前 Topic 名"显示当前位置，点击可临时展开。
   - 方案 B：收起到 icon-only 的窄轨。

5. **多选批量升级的失败处理**
   - 方案 A（推荐）：部分成功，返回每个节点的成功/失败状态，toast 汇总。
   - 方案 B：全成功或全回滚（事务性）。如果第 8 个失败，前 7 个也撤销——数据更干净但用户工作量丢失。

6. **父子任务关系的启动时机**
   - 是否在阶段 1 就引入 `parentTaskId`，还是延后到阶段 4？（提前引入可以让阶段 1 的数据模型一次到位，但增加阶段 1 的范围。）

7. **删除节点的默认行为**
   - 当前你的描述里"删除节点"要弹窗选择保留还是删 Task。是否需要"记住选择，不再询问"的偏好设置？

8. **孤儿修复的自动化程度**
   - 加载导图时自动清理孤儿（静默），还是列出孤儿让用户确认？（自动清理更省心，但用户可能想保留数据。）

---

## 六、风险点

| 风险 | 影响 | 缓解 |
|------|------|------|
| markdown 行追加 `^mm:` / `^node:` 标记后，旧 daily note 不兼容 | parser 已有忽略未知标记的逻辑，读取安全；但旧任务的关联只能靠迁移脚本补齐 | best-effort 迁移脚本 + 允许孤儿手动修复 |
| 跨日期反向索引的增量维护 | 若 daily note 被外部编辑，索引可能过期 | 启动全量扫描 + 文件 mtime 监听；或接受"每次请求实时扫描"的简单方案 |
| 节点标题双向同步的冲突 | 两边同时改，last-writer-wins 会丢一边 | 以 Task 为准（Task 是执行实体），节点侧改动在保存前 diff |
| 沉浸模式与现有 sidebar 动画的耦合 | App.tsx 的 sidebar 用 margin 动画，强行隐藏可能闪烁 | 沉浸模式下用 `display:none` 而非 margin，避免过渡 |
| 批量升级中途失败 | 部分节点升级成功部分失败，map 状态不一致 | 服务端用 `withFileLock` 包整个批次；返回详细 per-node 结果 |

---

## 下一步

请确认：
- 第二节的问题清单是否准确（有无遗漏或误判）。
- 第四节的阶段划分是否符合你的优先级（特别是阶段 1 是否要先于沉浸模式）。
- 第五节需要你拍板的 8 个决策点。

确认后我将严格按阶段实施，每阶段交付测试 + 真实界面验证，不会只以单测通过为完成标准。
