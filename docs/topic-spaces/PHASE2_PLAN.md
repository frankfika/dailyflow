# Topic Space 改造 — Phase 2 计划 (草稿)

> 上一轮落地见 `docs/topic-spaces/SPEC.md` (Phase 1 + 数据模型)。
> 本文件列 Phase 2 待办，便于下一轮接续。

## Phase 2 范围

| 模块 | 内容 | 类型 |
|------|------|------|
| Node kind 编辑 | 节点右键菜单: "转为待办" / "关联已有 Task" / "设为 Tag" | UI |
| 双向视图 | Topic Space 默认支持 mindmap / list 双视图切换 (defaultView) | UI |
| Task mirror 节点 | kind === 'task' 的节点, 状态/标题跟真实 Task 同步 | 数据 + UI |
| MindMap v2 PUT 升级 | 服务端 PUT /api/mindmaps/:id 自动升 version: 2, 缺省补 kind: 'branch' | 数据 (server) |
| Promote / link API | POST .../promote-to-task, POST .../link-task | 数据 (server) |
| Topic Space ↔ Task | Task.spaceId 写盘 (内存) → 列表视图过滤 | 数据 + UI |

## Phase 2 数据模型 (已就绪)

- `MindMapNode.kind` (`'root' | 'branch' | 'tag' | 'task'`) — 客户端已就绪, 服务端已识别
- `MindMapNode.tag` / `MindMapNode.taskId` — 客户端已就绪
- `MindMap.version: 1 | 2` — 客户端 `1`/`2` 都接受, 服务端 PUT 自动升 `2`
- `MindMap.spaceId` — 客户端已就绪
- `Task.spaceId` / `Task.originMindmapId` / `Task.originNodeId` — 客户端已就绪
- `TopicSpace.mindmapId` — 客户端 + 服务端
- `topicSpacesApi` / `useTopicSpaces` 钩子 — 客户端已就绪

## Phase 2 UI 待办 (前端)

### 1. 节点右键菜单

位置: `src/components/MindMap/MindMapNode.tsx` (或新建 `NodeContextMenu.tsx`)

菜单项:
- "转为待办" → 调 `mindmapsApi.promoteNodeToTask(mindmapId, nodeId)` → 节点 `kind = 'task'`, `taskId = newTaskId`
- "关联已有 Task" → 弹小选择器 (复用 `tasksApi.tasksBySpace` 过滤) → 调 `mindmapsApi.linkNodeToTask(mindmapId, nodeId, taskId)`
- "设为 Tag" → 节点 `kind = 'tag'`, `tag = text`
- "取消分类" → 节点 `kind = 'branch'` (清 tag/taskId)

> 当前 Phase 1 的 MindMapNode 只能在节点上**显式标注** kind.  Phase 2 加这个菜单.

### 2. 双视图切换

位置: `src/components/TopicTabs/TopicTabs.tsx` 旁边加 "视图" 切换器

`TopicSpace.defaultView = 'mindmap' | 'list'`:
- mindmap: 当前行为
- list: 显示该 space 下的 task 列表 (复用 `TodayBacklog` 的 card)

切换写回 `topicSpacesApi.update(id, { defaultView })`.

### 3. Task mirror 节点

`MindMapNode.taskId` 跟真实 `Task` 同步:
- 任务状态 (`todo` / `done`) → 节点 `status` 自动反映
- 任务标题变更 → 节点 `text` 同步 (单向即可)
- 节点选中时, 旁边显示 "Open task" 链接, 跳到 TodayView 对应日期

实现: 在 `MindMapView` 加一个 effect, 监听 `tasksApi.getByDate` 或新接口, 同步节点的视觉状态.

### 4. Service 端 (server/)

> 留给 server agent. 已定义 API 契约 (见 SPEC §3.3):
> - `POST /api/mindmaps/:id/nodes/:nodeId/promote-to-task`
> - `POST /api/mindmaps/:id/nodes/:nodeId/link-task`
> - `PUT /api/mindmaps/:id` 自动升 `version: 2`
> - 缺省补 `kind: 'branch'`

## Phase 2 验收

- 节点右键能改 `kind`
- `kind === 'task'` 节点能跟随 Task 状态
- 双视图切换在 `defaultView` 间切换, 状态写回
- MindMap v2 JSON 老 v1 文件能读, 写回升 v2
- `topicSpace.taskIds` 跟该 space 下 Task 数量一致 (含 promote 新建的)

## 不在 Phase 2 (留给后面)

- Phase 3: 节点 → Tag 标记 / Tag 继承 / Tags 页面分组
- Phase 4: 迁移引导弹窗
- Phase 5: AI 辅助整理
