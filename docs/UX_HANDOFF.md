# DailyFlow UX 改造 · 交接词（给接手 AI）

> 交接时间：2026-08-31
> 交接人：上一轮 UX review + 设计 agent
> 接手人：下一个 AI
> 状态：**设计已定稿（v3.1）并通过用户确认，尚未开始写代码。你从 S1 开始实施。**

---

## 一、你接手的项目是什么

DailyFlow（`/Users/fangchen/Baidu/GitHub/dailyflow`）：本地优先的任务/笔记/日历/AI 工作台桌面应用。

- 技术栈：React 19 + Vite + Tauri + Express 后端；`App.tsx` 1965 行（god component，70+ useState）
- 版本 v2.4.1；现有测试 645 单测 + 13 个 e2e
- 用户（中文沟通）诉求一句话：**"UX 极差，太复杂，操作不顺；理论上最好的 UX 就是一个对话框或一个页面；功能要很好的融入，而不是搞没了。"**

用户特别在意、**反复强调不能砍/不能缩没**的能力：**Events / 脑图（Mind Map）/ DeepSeek Harness AI 推进**——这是用户投入 v2.2-v2.3 两个 sprint 的核心能力。

## 二、你已经有的产物（都在 docs/ 下）

| 文件 | 内容 | 状态 |
|---|---|---|
| **`docs/UX_DESIGN.md`** | **唯一权威设计定稿 v3.1** | ✅ 已确认，按它实施 |
| `docs/ux-prototype-home.html` | 主页交互原型（真实 token 渲染） | ✅ 用户已确认 |
| `docs/ux-prototype-home.png` | 原型截图 | ✅ |
| `docs/UX_REDESIGN_V2_REVIEW.md` | 独立 review（P0×4/P1×5） | 已并入定稿，可参考 |
| `docs/UX_REDESIGN_V2.md` / `UX_REVIEW_WIREFRAMES.md` / `UX_REDESIGN.md` | 早期版本 | **已弃用，不要参考**（避免方向反复） |

**先读 `docs/UX_DESIGN.md` 全文（约 500 行），再看一眼 `docs/ux-prototype-home.html` 确认视觉方向。**

## 三、设计核心（一句话版）

**两页模型 + 浮层：**
- 第 1 页 = **Today 主页**：日期 + 主动建议(1行) + 焦点3件(折叠1行) + **任务按事件/脑图分组** + 底部固定输入框
- 第 2 页 = **Events 画布（即脑图）**：点事件组头进入，全屏沉浸
- 其余（笔记/AI/日历/记忆/设置）= 浮层，esc 回主页
- 导航 = **60px 图标栏**（⌘K/今日/事件/笔记/AI），不是 230px 侧边栏也不砍到 0
- ⌘K 命令面板（分层：搜索跳转 / 管理命令）
- 任务行点开 → 行内展开所有动作（改日期/tag/重复/描述/关联/AI/删除/完成）

**关键代码事实（v3.1 新增，务必理解）：**
1. **事件 = 脑图**：每个 Event 绑定 `mindmapId`，`EventCanvas` 本身就是脑图
2. **孤儿组件**：`MindMapView`（独立脑图：7 节点/AI 整理 3 策略/模板/撤销重做）**有功能有测试但无任何页面渲染**——需并入 EventsView 画布（消灭孤儿）
3. Today 按事件分组：`App.tsx` 已有 `todayMindmapOptions`/`planningGroups` 逻辑可复用

## 四、用户已确认的 6 项决策

1. ✅ 两页模型（主页 + Events）+ 60px 图标栏（不砍到 0）
2. ✅ 主动建议（1 行）+ 焦点（折叠 1 行）放回主页默认态
3. ✅ 复盘改安静提示条（不自动弹窗）
4. ✅ **Today 按事件/脑图分组**（组头=画布入口，独立任务单独一组）—— v3.1 核心
5. ✅ **事件即脑图** + 消灭孤儿 MindMapView
6. ✅ 画布 ↔ 今日双向桥接 + 进画布/回主页状态不丢

## 五、实施顺序（从 S1 开始，每步独立可回滚）

> 完整表在 `docs/UX_DESIGN.md` §14。要点：
> - S1：主页减负 + 按事件分组（App.tsx / TodayBacklog / TodayScopeTabs）
> - S2：底部固定输入框（TaskInputPanel → InputBar）
> - S3：任务行内展开（TaskCard + TaskInlineActions）
> - S4：⌘K 命令面板（**全新组件**，现有代码无 CommandPalette）
> - S5：浮层化（笔记/AI/日历/记忆/设置/团队）
> - S6：AI 行动（脑暴界面/`?`问答/拆解改写，**新增后端**）
> - S7：任务→转成项目（**新增反向 API**，现有只有 事件→任务）
> - S8：Today↔Events chip + 事件组头进画布
> - S9：**消灭孤儿 MindMapView**（AI 整理/模板并入 EventsView）
> - S10：60px 图标栏（重构 Sidebar）—— **唯一破坏 e2e 的步骤（`sidebar-viewports.spec.ts` 3 例），放中后期**
> - S11：AI 推进 Context 预览弹层
> - S12：复盘安静提示条
> - S13：App.tsx 拆分 + 状态机重构（技术债）

**建议你第一件事**：跑 `npm run lint`（tsc --noEmit）确认基线干净，然后从 S1 开始，每步做完跑相关测试 + `npm run test:e2e` 的相关 spec，确认无回归再进下一步。

## 六、给用户的沟通提醒

- 用户是中文沟通，在意"极简但不砍功能、不藏功能"
- 用户对"脑图/Events/Harness"特别敏感——任何改动都不能让它看起来像被降级
- 定稿前用户已经否过 4 版方向（v0.1→v0.4 都是"功能分门别类"，被批"把功能搞没了"）——**不要重走老路，严格按 v3.1 实施**
- 改 UI 前先给用户看示意图/原型确认，用户喜欢先确认再动手

## 七、交接词（可直接粘贴给下一个 AI）

> 你好，这是 DailyFlow UX 改造的交接。
>
> 背景：用户反馈 UX 极差、太复杂，要求极简——但核心诉求是"功能很好融入，不是搞没了"。用户特别在意 Events/脑图/DeepSeek Harness AI 推进这三个核心能力，反复强调不能砍。
>
> 我已完成：完整 review（4 个 P0 + 5 个 P1 问题）+ 设计定稿 v3.1 + 主页交互原型，**全部经用户确认**。唯一权威文档是 `docs/UX_DESIGN.md`（v3.1），原型在 `docs/ux-prototype-home.html`。早期版本文档（UX_REDESIGN_V2 等）已弃用，不要参考。
>
> 设计核心：两页模型 + 浮层。Today 主页按事件/脑图分组（组头=画布入口），Events 画布即脑图（事件绑定 mindmapId），60px 图标栏导航，底部固定输入框，⌘K 命令面板，任务行内展开。关键代码事实：`MindMapView` 是孤儿组件（无页面渲染），需把其能力（AI 整理 3 策略/模板）并入 EventsView 消灭孤儿。
>
> 下一步：从 `docs/UX_DESIGN.md` §14 的 S1（主页减负+按事件分组）开始实施，每步独立可回滚。先跑 `npm run lint` 确认基线，完成后跑相关测试。S10（60px 图标栏）会破坏 `sidebar-viewports.spec.ts`，放中后期。
>
> 沟通注意：用户中文，先确认后动手，别让脑图/Events/Harness 看起来被降级。
