# Topic Space 改造 — Phase 1 落地 Spec

> 来源: 2026-08-07 整体方案 (用户原话"执行这个方案，多 agent 去做")
> 本轮目标: **只做 Phase 1 + Phase 2 数据模型**。Phase 3-5 留 TODO，下一轮接续。

---

## 0. 背景

现状 dailyflow 已经有:
- `ThinkingWorkspace` (server `server/services/thinkingWorkspaces.ts` + 客户端 `src/api/client.ts:560`)
- `MindMap` v1 (server `server/types/mindmap.ts` + 客户端 `src/api/client.ts:998`)
- Task (在 markdown 行里，有 `id`/`tags`/`project`，但**没有** `spaceId`)
- Work/Life 上下文切换

整体方案要把它升级成:

```
Work / Life
  └── Topic Space (界面上叫"主题")
        ├── Mind Map (一张主导图)
        │     └── Node { kind: root | branch | tag | task, taskId? }
        └── Todo List (按 taskId 关联真实 Task)
```

**关键三原则** (用户原话):
1. Topic Tab ↔ Topic Space ↔ 主导图，三者**同一个对象**的 3 种表现
2. 节点默认不是 Task，必须显式 "转为待办"
3. Task 状态**只存一份** (在 markdown 行)，导图和列表只是视图

---

## 1. 本轮 (Phase 1) 范围

| 阶段 | 内容 | 本轮 |
|------|------|------|
| **Phase 1** | Topic Space 基础数据 + 主题 Tabs UI + "未分类" 兜底 | ✅ 做 |
| **Phase 2** | MindMap v2 + node.kind + 转为待办/关联已有 | 🟡 只做数据模型 + service，UI 留 TODO |
| **Phase 3** | Tag 末端化 (节点 → Tag 标记、继承、Tags 页面分组) | ❌ TODO |
| **Phase 4** | 迁移引导 (让用户选 Work/Life, 批量转待办) | ❌ TODO (本轮只做数据迁移，UI 引导下一轮) |
| **Phase 5** | AI 辅助整理 | ❌ TODO |

---

## 2. 数据模型 (本轮落地)

### 2.1 TopicSpace (扩展 ThinkingWorkspace)

`server/types/task.ts` (或新文件 `server/types/topicSpace.ts`) 新增:

```ts
export type TopicSpaceContext = 'work' | 'life' | 'unclassified';
export type TopicSpaceDefaultView = 'mindmap' | 'list';

export interface TopicSpace {
  id: string;                       // 复用 ThinkingWorkspace id
  title: string;
  kind: 'topic-space';              // 新 discriminator，区别老的 'workspace'
  context: TopicSpaceContext;       // 新增，默认 'unclassified' (迁移期)
  mindmapId: string;                // 新增，关联主导图
  order: number;                    // 新增，同 context 内的排序
  defaultView: TopicSpaceDefaultView;// 新增
  status: 'active' | 'paused' | 'completed' | 'archived';
  tags: string[];                   // 跨域标签 (老 ThinkingWorkspace 已有)
  taskIds: string[];                // 兼容老字段
  linkedNoteIds: string[];
  intent: string;
  scratchpad: string;
  brief: string;
  journey: string;
  tasksMarkdown: string;
  mindmapMarkdown: string;
  timeline: WorkspaceTimelineEntry[];
  createdAt: string;
  updatedAt: string;
  filePath?: string;
}
```

**兼容策略**:
- 老 `ThinkingWorkspaceData` 保留 (type alias 指向 TopicSpace)，不删
- 新文件落盘时 frontmatter 多 `kind: topic-space` + 4 个新字段
- 老文件 (没有新字段) 读时自动**回填默认值**写入 (forward-migrate 一次)
- 严格**不**自动覆盖用户老数据 (kind 保留为 'workspace'，但 UI 把它当 TopicSpace 渲染；新写回时才升级 kind)

> 这条兼容是 Frank 反复强调的 "迁移必须保守" 的体现。

### 2.2 MindMap v2 (扩展 MindMap)

`server/types/mindmap.ts` 新增:

```ts
export type MindMapNodeKind = 'root' | 'branch' | 'tag' | 'task';

export interface MindMapNode {
  id: string;
  text: string;
  color?: MindMapNodeColor;
  position: { x: number; y: number };
  collapsed?: boolean;
  note?: string;
  status?: MindMapNodeStatus;       // 老字段 (本轮保留；Phase 2 后改由 taskId 派生)
  /** v2 新增 */
  kind?: MindMapNodeKind;           // 缺省视为 'branch' (兼容老数据)
  tag?: string;                     // kind === 'tag' 时使用
  taskId?: string;                  // kind === 'task' 时使用
}

export interface MindMap {
  id: string;
  title: string;
  rootId: string;
  nodes: MindMapNode[];
  edges: MindMapEdge[];
  version: 1 | 2;                   // v1 兼容读；新写为 2
  spaceId?: string;                 // v2 新增，反向引用 TopicSpace
  createdAt: string;
  updatedAt: string;
}
```

**兼容策略**:
- 老 `version: 1` 文件照常读
- 任何更新 (`PUT /api/mindmaps/:id`) 自动升 `version: 2`
- 缺省 `kind === 'branch'` (兼容老节点)
- `status` 老字段保留 (本轮不删)，由 UI 把"老 status 节点" 渲染成 `kind: 'task'` 候选

### 2.3 Task 扩展

`server/types/task.ts` Task 加可选字段:

```ts
export type Task = {
  id: string;
  title: string;
  description?: string;
  comment?: string;
  comments?: { text: string; timestamp: string }[];
  status: 'todo' | 'done' | 'migrated';
  tags?: string[];
  project?: string;
  deadline?: string;
  priority?: 'high' | 'medium' | 'low';
  source_date?: string;
  /** v2 新增: 归属主题空间 */
  spaceId?: string;
  /** v2 新增: 来源导图节点 */
  originMindmapId?: string;
  originNodeId?: string;
};
```

**markdown 任务行** 增加系统元数据 (不作为普通 tag 展示):

```md
- [ ] 准备投资人名单 #投资人 ^id-task01
```

- 老的 `^id-xxx` 已存在 → 保留
- 新增可选 `^space:xxx` `^map:xxx` `^node:xxx` 注释 (本轮不写进 markdown，只在内存 data model)

> **取舍**: 选 "不写 markdown 元数据"，因为:
> 1. 现有 markdown 是真相，UI 写多系统标记容易脏
> 2. Task ↔ Space 关系从 in-memory map + UI 层维护足够
> 3. Phase 4 迁移引导再做"按规则反推"

### 2.4 TopicSpace ↔ MindMap 关系

- 1:1 (一个 TopicSpace 对应一张主导图)
- TopicSpace.mindmapId 引用 MindMap.id
- MindMap.spaceId 反向引用 TopicSpace.id
- 创建 TopicSpace 时**自动** create 一张空白 MindMap 并互绑

---

## 3. API 契约

### 3.1 新增 `/api/topic-spaces`

```
GET    /api/topic-spaces?context=work|life|unclassified  — 列表 (支持过滤)
GET    /api/topic-spaces/:id                              — 单个
POST   /api/topic-spaces                                   — 创建 (自动建 mindmap)
PUT    /api/topic-spaces/:id                               — 部分更新
DELETE /api/topic-spaces/:id                               — 删除 (mindmap 标 archived 不删)
POST   /api/topic-spaces/:id/reorder                      — 调整同 context 内的 order
```

请求/响应直接用 §2.1 的 `TopicSpace` 类型，不包 envelope。

### 3.2 老 ThinkingWorkspace 读取兼容

- `/api/topic-spaces` 是唯一 API；旧 `/api/thinking-workspaces` 写入器已下线。
- 老文件的 `kind: workspace`（或缺省 kind）由 Topic Space service 容错读取。
- 只读不会改盘；用户明确更新该主题时才写成 `kind: topic-space`。

### 3.3 扩展 `/api/mindmaps`

- 创建 MindMap 时**允许**带 `spaceId` (本轮不强制，由 TopicSpace POST 内部调用)
- PUT 时**自动**升 `version: 2`，缺省补 `kind: 'branch'`
- **新增** `POST /api/mindmaps/:id/nodes/:nodeId/promote-to-task`  — 创 Task + 绑 node (Phase 2 本轮 stub)
- **新增** `POST /api/mindmaps/:id/nodes/:nodeId/link-task`       — 把 node 绑到已有 task (Phase 2 stub)

### 3.4 扩展 `/api/tasks`

- 列表/单读响应里加 `spaceId`/`originMindmapId`/`originNodeId` (如果 markdown 里有 `^space:xxx` 注释就解析；本轮简化为**永远 undefined**，等 Phase 4 写注释时再启用)
- 新增 `PUT /api/tasks/:id/space` — `{ spaceId | null }` 改归属 (本轮实现)

---

## 4. 存储 (本轮落地)

### 4.1 TopicSpace 落盘

复用现有 `Workspaces/<year>/<month>/<id>.md` 路径，frontmatter 增加:

```yaml
---
id: tw_xxx
kind: topic-space              # 新增
title: ...
type: general
status: active
context: unclassified          # 新增
mindmapId: mm_xxx              # 新增
order: 0                       # 新增
defaultView: mindmap           # 新增
tags: []
taskIds: []
linkedNoteIds: []
createdAt: ...
updatedAt: ...
---
```

### 4.2 MindMap 落盘 (v2)

复用 `<workspaceRoot>/.dailyflow/mindmaps/<id>.json`，`version: 2` 时加 `spaceId`。

### 4.3 启动迁移 (`server/scripts/migrate-to-topic-spaces.ts`)

一次性脚本，启动时 (或 npm script 调) 跑:

1. 扫所有 `Workspaces/**/*.md`
2. 老的 (`kind` 缺省 / `kind === 'workspace'`) **只补 4 个新字段默认值**，不改 kind
3. 扫所有 `mindmaps/*.json`，**只补 `version: 2` 字段** (如果还是 1)
4. 输出报告: X 个 TopicSpace、Y 个 MindMap 已升级、Z 个新字段缺失
5. 幂等 (重复跑无副作用)

**注意**: 不删除任何老数据。

---

## 5. UI 改动 (本轮)

### 5.1 主题 Tabs 组件

新组件 `src/components/TopicTabs/TopicTabs.tsx`:

- 接收 `context: 'work' | 'life'` 和 `spaces: TopicSpace[]` + `onSelect(spaceId | null)`
- 渲染: `[全部] [未分类] [space1] [space2] ... [更多...] [+ 新主题]`
- "全部" 选 `null` (本期实现为"全 context 内聚合")
- "未分类" 选 `spaceId = '__unclassified__'`
- 主题过多 (>6) 时进 "更多" 折叠
- 选中态视觉: 主色背景 + 圆角
- 受控组件，App.tsx 持有 activeSpaceId state

### 5.2 App.tsx 集成

- Work/Life 切换保持现状
- 在 MindMap 视图顶部加 `<TopicTabs context={...} spaces={...} activeSpaceId={...} onSelect={...} />`
- MindMapView 接 `activeSpaceId` prop，按 spaceId 过滤显示主导图
- 新建主题: 弹小输入框 → 调 POST → 切到新 tab
- 没有 TopicSpace 时显示"未分类"占位 + "新建主题" 按钮

### 5.3 MindMapNode 显示 kind

`src/components/MindMap/MindMapNode.tsx`:

- 读 `node.kind`，缺省 'branch'
- 渲染时:
  - `root`: 居中大圆
  - `branch`: 普通节点
  - `tag`: 标签样式 (虚线边、字号小)
  - `task`: 任务样式 (左 checkbox 圆点、hover 显示 `taskId` 关联)
- 本轮 `kind` 只在节点上**显式标注**，UI 不能改 kind (要等 Phase 2 改)

### 5.4 Task 过滤 (本轮 stub)

`src/api/client.ts` `tasksApi` 新增 `tasksBySpace(spaceId)` helper (返回空间下的 taskIds 对应任务)，本轮**只在前端过滤**，不调新接口。

---

## 6. 验收标准 (本轮)

按方案"分阶段技术计划 - 第一阶段 验收标准"扩展:

- [x] Work 和 Life 拥有各自独立的主题列表
- [x] 切换 Work/Life 不会串数据
- [ ] 主题 Tabs UI 可用 (本轮必须) — 验收: Playwright e2e 跑过截图
- [ ] 新建主题后能切到新 tab — 验收: e2e
- [ ] 未分类兜底，没 TopicSpace 时也能用 — 验收: 删 space 后 UI 不崩
- [ ] MindMap v2 数据兼容老 v1 — 验收: 老 JSON 读出来不变
- [ ] 启动迁移脚本幂等 — 验收: 跑两次结果一样

---

## 7. 风险 & 注意点

1. **不破坏老数据**:
   - `/api/topic-spaces` 继续读取旧 ThinkingWorkspace 文件
   - 老 MindMap 节点 status 字段保留
   - 升级时 frontmatter 不重写顺序 (避免 git diff 噪音)

2. **不破坏 markdown 任务**:
   - 任务元数据 (spaceId etc) 只在内存 data model 层
   - 不写 `^space:xxx` 进 markdown 行 (等 Phase 4 决定)

3. **回归测试**:
   - 跑 `npm run lint` `npm run test` `npm run build`
   - 启 server 真实 hit 几个端点 (不能只信 unit test)

4. **Frank 的 GH Actions push 触发不工作 (memory)**:
   - 不要依赖 push 触发的 CI
   - 本地跑全验证再 commit

---

## 8. 不在本轮 (留给下一轮)

- Phase 2 UI 完整版 (节点右键"转为待办"、双视图、task-mirror 节点)
- Phase 3 节点 → Tag 标记、Tag 继承、Tags 页面分组
- Phase 4 迁移引导弹窗 (让用户选 Work/Life、批量转待办)
- Phase 5 AI 辅助

完成 Phase 1 后，**所有**这些留 `// TODO(topic-spaces/phase-N): ...` 标记 + 一个 `docs/topic-spaces/PHASE2_PLAN.md` 简版大纲。
