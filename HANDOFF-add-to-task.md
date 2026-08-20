# Handoff: Events "Add to Task" UX 改造

> **2026-08-19 更新（第二位 AI）**：「逻辑还是不对」的根源已定位并修复——上一个 AI 加了节点上的日期浮层，但**忘了删底部工具栏里旧的「今天」一键排期按钮**（`EventCanvas.tsx` 工具栏，`onSchedule(activeNode, today)` 硬编码今天、不弹日期选择），这正是需求 A 反对的东西。修复内容：
> 1. 工具栏删掉一键「今天」和即选即生效的「日期」输入，统一成一个入口：非 task 节点显示「Add to Task」，task 节点显示「日期 · MM-DD」（可改期），都打开同一个 `ScheduleDatePopover`（新增 `placement="up"` 向上弹出），必须点「安排」确认才生效。
> 2. 修复 outline 浮层中文模式下「Today」预设硬编码英文的 bug（`EventOutline.tsx` 的 `pickDateCopy`）。
> 3. 修复测试环境 localStorage 是空对象导致的 EventsView 测试崩溃（`src/test/setup.ts` 加了 MemoryStorage ponyfill）——这是测试基建问题，与 UI 无关。
> 4. `EventCanvas.test.tsx` 工具栏测试重写：断言没有一键 Today、走浮层确认、task 节点浮层默认当前日期。
> 事件测试 59/59 通过，tsc 通过，浏览器端已端到端验证（Add to Task → 选明天 → 确认 → 节点变 Task → Date · 08-20 可改期 → Remove from day 还原）。改动未提交，dev server 在跑（端口 47831），用户刷新即可看到。

---

> 交接上下文：用户在 `2026-08-19` 跟当前 AI 协作时，要求把 Events 里的「Add to Today」交互重做。当前 AI 收尾时用户表示「你这个逻辑还是不对」，要换一个 AI 继续。**下一位 AI 请先读完这份文档再动手**，避免重复走弯路。

---

## 1. 项目基本信息

- **项目路径**：`/Users/fangchen/Baidu/GitHub/dailyflow`
- **技术栈**：React 19 + Vite 6 + TypeScript 5 + Tailwind 4 + lucide-react + ulid + tanstack/react-query
- **事件相关代码位置**：
  - `src/features/v2/events/` — Event UI 表面（v2）
  - `src/features/v2/hooks/useEvents.ts` — 节点 mutation hooks
  - `src/components/MindMap/` — **v1 旧版本，已不在 App 渲染树中**，仅供历史参考
- **本地运行**：`npm run dev:all`（同时启动 vite 客户端 + tsx 后端），默认端口 vite=47831, server=47832
- **构建**：`npx vite build`
- **测试**：`npx vitest run <path>`；事件测试在 `src/features/v2/events/`
- **package 脚本**：注意 `npm run dev` 是 `vite --host=0.0.0.0`（自动选端口）；后台启动用 Bash run_in_background

---

## 2. 用户的明确需求（按出现顺序整理）

> 注意：用户是用中文口述的，下面是去口音后的原意。每条都附了上下文，方便理解为什么这么要求。

### 需求 A — **「Add to Today」按钮不应该硬塞今天**
> 「add to today直接跳转什么意思？而且不是每个都是task啊，只有我希望的是。。而且为什么要add to today啊。。我意思是添加到task，然后可以指定时间」

**关键词拆解**：
- 「Add to Today」→ 改名为「Add to Task」（不要硬编码「Today」）
- 「不是每个都是task啊」→ **节点不是默认 task**，用户主动选才变
- 「可以指定时间」→ **必须能让用户选日期**，不能直接调成今天

### 需求 B — **不要从节点跳到 Today**
> 「你这个跳转啥意思」 / 「去啊。留这个干嘛」

- 不要在节点上挂「Open in Today」按钮
- 不要做从 canvas 跳到 Today tab 的反向 deep-link
- 要去 Today 就走应用的标准 tab 切换，不要在 Event 内部硬塞跳转

### 需求 C — **Today 上能看清来源**
> 「怎么跳回主页了，我读不知道发啥了，哪个是task」

- Today 上的 task 卡要能看出来源（event + 节点路径）
- 节点本身变成 task 后要有明显的视觉标记

> **注**：需求 C 的早期实现里我加了任务反向跳转的按钮（Open in Today），用户拒绝后全部回滚；Today 上 `task.sourcePath` 面包屑**保留纯展示**（来自 `App.tsx:272` 的 `item.path.map(s => s.text)` 投影），不可点击。

### 需求 D — **子节点能不能嵌套 task**
> 「每个task里面不能加task吗」

**回答（已经成立）**：可以。`EventNode.parentId` + `execution` 共存，事件本身是递归思维导图结构。TodayItem.path 已经走 parent 链构造。**UI 还没渲染子树展开，但数据层支持。**

---

## 3. 当前实现状态（2026-08-19 收尾时）

### 3.1 已完成

✅ **`Add to Task` 按钮 + 日期选择浮层**
- 文件：`src/features/v2/events/ScheduleDatePopover.tsx`（**新文件**，可复用）
- 4 个快速预设：Today / Tomorrow / +3d / Next week
- 原生 `<input type="date">` 任意日期
- `Cancel` / `Schedule` 确认按钮（默认选中 Today）
- 点外面自动关闭（mousedown listener + 0ms setTimeout 防止点击立即关闭）

✅ **Canvas 节点改造**（`src/features/v2/events/EventCanvas.tsx`）
- 文案：`Add to Today` → `Add to Task`
- 浮动按钮在节点右上方（`data-testid="event-node-add-task-{nodeId}"`）
- 点击打开浮层，**用户必须选日期 + 点「安排」才真的发起 `onSchedule(node, date)`**
- 已经 scheduled 的节点（`node.execution` 存在）不显示此按钮

✅ **Outline 行改造**（`src/features/v2/events/EventOutline.tsx`）
- hover 时显示 `Add to Task` 按钮（`data-testid="outline-add-task-{nodeId}"`）
- 同样的浮层；选中状态由 `schedulePicker` 状态控制（单 picker，复用）

✅ **Task 节点视觉标记**（canvas + outline 都做了）
- accent 绿色左边条（3px canvas / 0.5px outline）
- 浅绿底色
- canvas 上持久显示 `ListTodo` 图标 + 「Task」+ MM-DD 日历 chip
- outline 上没文字 chip，但有左边条 + 底色 + `data-task-row` 属性

✅ **i18n**（中英双份）
- 新增 copy keys：`addToTask`、`tomorrow`、`nextWeek`、`pickDate`、`confirm`、`cancel`

### 3.2 已删除（用户明确要求去掉）

❌ Canvas 上的 `Open in Today` 按钮（ExternalLink 图标）— 删除
❌ Outline 上的 `Open in Today` 小图标按钮 — 删除
❌ `onOpenInToday` / `onJumpToToday` / `handleOpenInToday` — 全部从 EventsView / App / TaskCard 移除
❌ `requestedNodeId` state + Today→节点 deep-link 链路 — 删除
❌ TaskCard 上面包屑最后一段可点击 — 回到纯展示
❌ `ExternalLink` 图标 import — 清理

### 3.3 没动 / 仍存在

- `useScheduleEventNode` / `mindmapsApi.promoteNodeToTask` API 不变（这本来就是对的）
- `task.sourcePath` 在 Today 上**纯展示**，数据来自 `App.tsx:272`
- 节点结构操作（add child / sibling / rename / delete / outdent / move / reorder / collapse）全部 OK
- 顶栏的 outline toggle + Cmd/Ctrl+B 保留

---

## 4. 用户对当前状态的不满（你接手的起点）

用户最后一句：「**你这个逻辑还是不对**」

**当前 AI 的猜测**（**不保证准确**，请直接问用户）：
1. 「Add to Task」按钮位置 / 触发方式不对 — 比如：节点右上角浮动按钮太突兀、hover 才出现不够明显、或者用户希望有别的入口（比如顶部 toolbar）
2. 日期预设不够灵活 — 用户可能希望有「这周末」「下周一」「自定义项目截止日」之类
3. 视觉标记还是不够明显 — 觉得 Task 节点和普通节点区别不大
4. 「Add to Task」之后缺少确认反馈 — 调了 API 但 UI 没明显变化
5. 当前弹出浮层位置 / 样式 / 交互细节不满意

> **强烈建议**：直接问用户「你说的逻辑不对是指哪里？是按钮位置、日期选择器、视觉标记还是别的？」不要瞎猜。

---

## 5. 关键文件路径速查

```
src/features/v2/events/
├── ScheduleDatePopover.tsx         # 新增 — 日期选择浮层（可复用）
├── EventCanvas.tsx                 # canvas 节点渲染 + Add to Task 按钮 + 浮层触发
├── EventOutline.tsx                # outline 行渲染 + Add to Task 按钮 + 浮层触发
└── EventsView.tsx                  # 容器：组合 outline + canvas + 所有 mutation handler

src/features/v2/hooks/
└── useEvents.ts                    # 所有节点 mutation hooks（add child/sibling/rename/delete/outdent/move/reorder/schedule/unschedule/complete/reopen）

src/components/
├── TodayBacklog.tsx                # Today 主视图（注意：仍用 v1 TaskCard）
├── TaskCard.tsx                    # Today 上的 task 卡片；sourcePath 渲染存在但不可点击
├── MindMap/                        # v1 旧实现，已不在 App 渲染树中（仅历史参考）
└── ... 

src/App.tsx                        # 主应用；requestedEventId + todayItemsQuery + 状态切换

server/                              # 后端 API
├── routes/events.ts                # create-task-for-node / promote-to-task 等
└── types/event.ts                  # EventNode / EventDetail 类型定义

.workbuddy/memory/2026-08-19.md     # 详细的工作日志（之前的修改记录）
```

---

## 6. 相关 API & 类型（避免再绕路）

### 后端事件任务相关 API
- `POST /api/events/actions/create-task-for-node` — 把节点变成 task
- `POST /api/events/actions/unschedule-node-task` — 移出日程
- `POST /api/events/actions/complete-node-task` — 标记完成
- `POST /api/events/actions/undo-complete-node-task` — 撤销完成

### 关键 TypeScript 类型（`server/types/event.ts`）
```typescript
interface EventNode {
  id: string;
  eventId: string;
  parentId?: string;       // ← 子节点嵌套 task 走这里
  text: string;
  position: { x: number; y: number };
  execution?: {           // ← 存在 = 该节点是 task
    taskId: string;
    scheduledDate: string; // YYYY-MM-DD
    status: 'todo' | 'done';
    deadline?: string;
    priority?: 'high' | 'medium' | 'low';
    completedAt?: string;
  };
  manualTags: string[];
  aiTags: string[];
}

interface TodayItem {      // 今天「Event 来源」」 task 的形态
  kind: 'event-node' | 'standalone';
  taskId: string;
  title: string;
  eventId: string;
  eventTitle: string;       // ← TaskCard 上的「Event · X」chip 用这个
  nodeId: string;
  mindmapId: string;
  spaceId: string;
  scheduledDate: string;
  path: Array<{ id: string; text: string }>;  // ← 父→子链路，面包屑用
  // ...
}
```

---

## 7. i18n 约定

- 中英两份文案放 `Copy` 对象，按键访问
- 用户语言偏好：默认 zh / en 通过 `language` prop 切换
- 现有键参考 `EventCanvas.tsx:24-83` 和 `EventOutline.tsx:21-54`

---

## 8. 测试约定

- 测试用 vitest + @testing-library/react
- 每个组件有自己的 `.test.tsx` 文件
- i18n copy keys 改动 → 同步 `__tests__` 里的 toHaveTextContent 正则
- 关键 testid：
  - `event-node-add-task-{nodeId}` — Canvas 上的 Add to Task 按钮
  - `event-node-task-badge-{nodeId}` — Canvas 上的 Task 徽章
  - `event-node-schedule-popover` — 浮层
  - `event-node-schedule-popover-preset-{days}` — 浮层预设按钮
  - `event-node-schedule-popover-date-input` — 日期输入
  - `event-node-schedule-popover-confirm` / `cancel`
  - `outline-add-task-{nodeId}` — Outline 上的 Add to Task 按钮
  - `outline-schedule-popover` — Outline 的浮层

---

## 9. 接手 AI 应该做的第一件事

1. **读这份文档** ✅（你现在在做）
2. **直接问用户**：「你说的逻辑不对是指：①按钮位置 / ②日期选择器 / ③视觉标记 / ④别的？」— 不要瞎猜
3. **看一眼 dev server**：`http://localhost:47831/` 当前长啥样，用户正在看着这个交互
4. **看 git diff**：`git status` 看本会话改了什么；`git diff` 看具体改动
5. **不要重做需求 C**（跳转 / deep-link）— 用户明确拒绝过两次

---

## 10. 用户历史情绪记录（避免重复踩雷）

- 用户反复要求「做完」、「继续」、「为什么还有没做的」→ 说明对**半成品零容忍**，接手后要么做完整，要么明确告诉他做不了
- 用户喜欢 `@skill` 语法调用功能（这是用户的个人习惯，不是项目约定）
- 用户在多次对话里倾向于把「事件 + 任务」的整合当心智模型：事件 = 全局规划，task = 今天的执行；**节点变 task 是关键转折点**，UX 必须让人想清楚再操作
- 用户的反馈往往是「现在不够好 + 之前那个版本更好」模式 — 接手时可以直接问「之前哪个版本好在哪」，参考 `MindMap/MindMapNode.tsx` 的视觉处理

---

## 11. 状态：当前 dev server

- 仍在后台跑（启动命令：`cd /Users/fangchen/Baidu/GitHub/dailyflow && npm run dev:all`）
- 端口：vite=47831, server=47832
- Vite HMR 已加载所有当前改动；用户刷新页面就能看到

---

文档结束。祝顺利 🛠️