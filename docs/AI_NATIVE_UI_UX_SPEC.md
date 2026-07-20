# DailyFlow AI-Native UI / UX 总规范

> 版本:1.0
> 状态:下一代主应用界面的权威规范
> 依赖:`docs/AI_NATIVE_PRODUCT_DEVELOPMENT_SPEC.md`
> 适用范围:桌面端主应用、所有 v2 能力整合、核心响应式体验
> 最后更新:2026-07-20

---

## 1. 设计结论

DailyFlow 不应该像一个由 Todo、Notes、AI Chat、Settings 和多个实验页面拼成的 SaaS Dashboard。

它应该像一个安静、连续的桌面工作台:

- Today 是行动桌面。
- Notes 是思考桌面。
- Memory 是回忆桌面。
- AI 不占据独立房间,而是在三个桌面中理解上下文并提出可审阅的行动。

目标感受:

> 安静、可信、直接、连续。打开以后知道从哪里开始,写作时不被打断,执行时不需要重新找上下文。

不追求:

- 大量玻璃卡片。
- 渐变和发光效果。
- “AI 魔法”视觉。
- 每个对象一个白色浮卡。
- Dashboard 指标。
- 为展示功能而增加入口。

---

## 2. 当前 UI 的系统性问题

### 2.1 产品被拆成多个互不连续的工具

- Today 像传统 Todo。
- Notes 像内容管理后台。
- AI Chat 像另一个聊天产品。
- Settings 像网页模态框。
- v2 又使用独立 standalone 页面。

用户在不同区域之间切换时,不仅换页面,还要重新理解一套交互模型。

### 2.2 卡片层级过度

当前大量使用:

- 大圆角。
- 浮卡。
- 卡片套卡片。
- 每张卡独立阴影。
- 标签 pill。
- 悬浮按钮。

结果不是“现代”,而是所有内容都像同等重要,信息密度低,扫描速度慢。

### 2.3 视觉语言互相冲突

代码中同时存在:

- Native minimal。
- 蓝紫渐变。
- 暖色渐变。
- 发光阴影。
- 玻璃态。
- 大号斜体标题。
- 不同圆角和按钮密度。

这些元素各自可能成立,但组合后缺少一个稳定人格。

### 2.4 页面围绕数据类型,不是用户意图

Notes 页面先展示 All / Notes / Meetings / Summaries / Person / Tags;Today 展示日期、分类、迁移标签;AI Chat 展示模型、技能和上下文选择。

这些都是系统内部结构。用户真正想做的是:

- 开始今天。
- 写一段东西。
- 继续上次工作。
- 找到某个决定。
- 处理 AI 发现的变化。

### 2.5 AI 被做成入口,没有成为交互能力

独立 AI Chat、AI Assist、AI Summary Generator、Prompt Library 和模型选择同时出现,导致用户需要先决定“该用哪个 AI 功能”。

正确做法是用户先做事,AI 根据当前对象提供少量、明确、可确认的帮助。

### 2.6 空间使用失衡

- 侧栏承载日期、归档、模式、功能入口,过重。
- 主区域很宽,内容却集中在大型卡片中。
- AI Chat 使用双侧栏,但主内容缺少真实工作对象。
- Notes 列表浪费大量纵向空间。
- Settings 模态框过大,层级和主应用不一致。

### 2.7 状态表达依赖标签

`migrated`、`delayed`、日期、tag、type 等都被做成 pill。用户看到的是系统元数据,不是“为什么现在需要处理”。

状态应该使用自然语言和位置表达:

- 等待 Alex,周三复查。
- 已经 12 天没有推进。
- 来自周一的客户会议。
- AI 找到 2 项需要确认。

---

## 3. 统一设计语言

### 3.1 设计风格

采用 **Quiet Native Workspace**:

- 接近原生 macOS 工作应用。
- 系统字体。
- 紧凑但不拥挤。
- 平面结构优先,用 hairline border 分区。
- 大部分背景中性。
- 颜色只表示选择、风险和状态。
- 动效只解释状态变化。

可以理解为:

> Apple Notes 的直接书写 + Linear 的扫描效率 + Granola 的上下文增强,但不照搬任何一个产品。

### 3.2 颜色

```css
:root {
  --app-bg: #f5f5f4;
  --sidebar-bg: rgba(247, 247, 246, 0.92);
  --pane-bg: rgba(252, 252, 251, 0.94);
  --canvas-bg: #ffffff;

  --text-primary: #18181b;
  --text-secondary: #52525b;
  --text-muted: #a1a1aa;

  --border-subtle: rgba(24, 24, 27, 0.08);
  --border-strong: rgba(24, 24, 27, 0.14);

  --accent: #2563eb;
  --accent-soft: rgba(37, 99, 235, 0.09);
  --success: #15803d;
  --warning: #b45309;
  --danger: #b91c1c;
}
```

规则:

- 主应用不使用装饰性渐变。
- 不使用 accent glow。
- 同一屏幕最多一个高饱和主按钮。
- 普通对象不使用彩色标签。
- 颜色不作为唯一状态信号。

### 3.3 字体

```css
font-family:
  -apple-system,
  BlinkMacSystemFont,
  "SF Pro Text",
  "Segoe UI",
  sans-serif;
```

层级:

| 用途 | 字号 | 字重 |
|---|---:|---:|
| 页面标题 | 22-24px | 650 |
| 文档标题 | 28-32px | 650 |
| 区域标题 | 13-15px | 600 |
| 正文 | 14-16px | 400 |
| 导航与列表 | 13px | 450-550 |
| 辅助信息 | 11-12px | 400-500 |

规则:

- 页面标题不使用斜体。
- 不使用全大写标题作为主要层级。
- 正文行高 1.55-1.7。
- 中文和英文使用同一视觉层级。

### 3.4 几何

| 元素 | 圆角 |
|---|---:|
| 普通按钮/输入 | 6-8px |
| 列表选中态 | 6px |
| Popover | 10px |
| Modal / Drawer | 12px |
| 重要 Proposal | 10px |

禁止把每个列表行做成 16-24px 大圆角浮卡。

### 3.5 阴影与分隔

- 常规布局不用阴影。
- Pane 使用 1px hairline border。
- Popover、菜单、Modal 才使用阴影。
- hover 通过背景色和文字色变化表达,不做卡片上浮。

### 3.6 动效

- 150-220ms。
- 使用 opacity、background、轻微 translate。
- 不在任务列表、Note 列表中做逐项大幅进入动画。
- Proposal 接受后,对应对象平滑进入目标区域。
- 尊重 `prefers-reduced-motion`。

---

## 4. 唯一应用壳

### 4.1 禁止双壳

主应用只能存在一个 App Shell。v1 和 v2 不允许通过:

- 独立 standalone 页面。
- AI-Native mode。
- 新旧模式切换。
- 两套导航。

来长期并存。

新能力必须逐步进入主壳,旧页面通过 feature flag 替换,最后删除旧入口。

### 4.2 桌面布局

```text
┌──────────────┬──────────────────────────────────────────────────────┐
│ Global Rail  │ Top Bar                                              │
│ 220px        ├──────────────────────────────────────────────────────┤
│              │                                                      │
│ Today        │ Main Workspace                                       │
│ Notes        │                                                      │
│ Memory       │                                                      │
│              │                                      Context Drawer  │
│              │                                      320px on demand │
│              │                                                      │
│ Settings     │                                                      │
└──────────────┴──────────────────────────────────────────────────────┘
```

Notes 和 Memory 可以在主区域内部打开第二级列表 Pane:

```text
┌────────────┬───────────────┬──────────────────────┬───────────────┐
│ Global Rail│ Notes List    │ Editor / Detail      │ AI Review     │
│ 220        │ 280           │ flexible             │ 320 optional  │
└────────────┴───────────────┴──────────────────────┴───────────────┘
```

### 4.3 Global Rail

固定内容:

- Workspace 名称。
- Today。
- Notes。
- Memory。
- 一个全局 New / Capture 按钮。
- 底部 Settings。

不放:

- 日期时间线。
- 月份归档树。
- Work / Life 顶级开关。
- AI Chat。
- Capsules。
- Models & Skills。
- Git 状态。

日期、项目和筛选属于对应页面内部。

### 4.4 Top Bar

高度 44px,只提供当前上下文需要的能力:

- 返回 / 前进。
- 当前对象标题或日期。
- Search / Command。
- 同步或保存状态。
- 少量页面级动作。

不使用页面内重复的大标题加顶栏标题。

---

## 5. 全局交互

### 5.1 Command Palette

快捷键 `Cmd/Ctrl + K`。

优先动作:

- New note。
- Quick capture。
- Go to Today。
- Search memory。
- Start meeting note。
- Open project / person / commitment。

Command Palette 不是功能目录,最多先显示 6-8 个高频动作。

### 5.2 Quick Capture

快捷键可直接打开单行/多行 capture:

```text
┌──────────────────────────────────────────────┐
│ What changed, what did you promise, or       │
│ what do you want to remember?                │
│                                              │
│                              Save to Inbox ↵ │
└──────────────────────────────────────────────┘
```

- 输入后立即落本地。
- AI 处理异步。
- 不要求分类。
- 保存后不强制跳转页面。

### 5.3 Context Drawer

右侧 Drawer 是全应用统一的上下文容器,根据对象显示:

- AI Suggestions。
- Evidence。
- Relations。
- History。

不为每种对象重新设计独立右侧栏。

### 5.4 Proposal Review

Proposal 不使用大模态框阻断工作。默认在 Context Drawer 中:

```text
AI found 2 changes

[✓] Commitment
    Send revised proposal by Friday
    Owner: You · Due: Fri
    “我来修改,周五前发你”

[ ] Decision
    Keep the current pricing model

Reject all                    Apply 1
```

高风险批量修改和外部发送才使用 Modal。

### 5.5 对象打开方式

- 单击:在当前 Pane 打开。
- `Cmd/Ctrl + click`:在应用内新临时标签或并排上下文打开,后期能力。
- hover 只出现 1-2 个高频动作。
- 更多操作进入 `…` 菜单。

---

## 6. Today 详细布局

### 6.1 Today 的工作

Today 不是每日 Task 文件的可视化,而是当前工作的控制面。

第一屏只回答:

- 今天的现实约束是什么?
- 现在推进哪几件事?
- 第一件下一步是什么?
- 哪些变化需要处理?

### 6.2 页面结构

```text
Today                                      Mon, Jul 20
────────────────────────────────────────────────────────
You have about 3h 30m of focus time.
Two meetings this afternoon. One commitment is at risk.

FOCUS
1  Revise Acme proposal
   Next: update pricing section             45 min
   Due Fri · from Monday client meeting

2  Review hiring plan
   Next: leave comments on v3               30 min

3  Prepare investor update
   Next: confirm June revenue numbers       40 min

                         Tell AI what changed…

NEEDS ATTENTION
Waiting on Alex · review today
One stale commitment · decide what to do

RECENT OUTCOMES
Sent product brief to design team
```

### 6.3 Today 规则

- Focus 使用紧凑行或分组,不是三张大卡。
- “三件事”是默认计划容量,不是视觉口号和游戏化终点。
- 计划理由显示一行自然语言,不堆 priority/tag pills。
- 第一项可以展开为执行状态,其余保持紧凑。
- `Tell AI what changed…` 是自然语言 re-plan 入口。
- 完整积压不出现在 Today。
- 历史日期是 Review,不伪装成 Today。

### 6.4 执行状态

展开 Focus Item 后显示:

- Intended Outcome。
- Next Action。
- 3 条以内相关 Context。
- Start / Waiting / Complete。

不在 Task 卡片内部塞入标签编辑、日期编辑、评论、删除、Notes 按钮和多个 hover icon。

---

## 7. Notes 详细布局

### 7.1 Notes 首页

```text
Notes
┌──────────────────────┬────────────────────────────────────┐
│ Search notes…        │ Select a note, or start writing    │
│ + New note           │                                    │
│                      │ Recent                             │
│ Inbox            3   │ Project launch notes               │
│ Recent               │ Investor meeting                   │
│ Daily                │ Product thoughts                   │
│ Meetings             │                                    │
│ Projects             │                                    │
│ Favorites            │                                    │
└──────────────────────┴────────────────────────────────────┘
```

Notes 的二级导航是 smart views,不是用户必须维护的文件夹树。

### 7.2 编辑器

```text
Project launch notes                          Saved locally
July 20, 2026

We agreed to keep the first release focused on...

The remaining question is whether...

                                                    ┌───────────────┐
                                                    │ AI found 2    │
                                                    │ suggestions   │
                                                    └───────────────┘
```

规则:

- 默认显示正文,元数据隐藏到 Info。
- 标题可空。
- 自动保存。
- 阅读/编辑不使用完全不同页面。
- 宽度 680-780px,长文居中。
- 支持 Markdown 快捷语法,但工具栏保持克制。
- 选中文本后出现轻量浮动菜单。

### 7.3 Meeting Note

同一个 Note 编辑器增加会议上下文:

- 顶部显示会议标题、时间和参与人。
- 会前可以显示 Previous context。
- 会中持续写作。
- 会后出现 Enhance / Review proposals。

不创建完全不同的 MeetingCapture 产品壳。

---

## 8. Memory 详细布局

### 8.1 Memory 不是 Dashboard

进入 Memory 后首先是统一搜索:

```text
Memory
[ Search people, decisions, projects, meetings…             ]

Recently useful
Acme · last meeting Monday · 2 open commitments
Pricing decision · updated Jul 12
Fundraising project · 3 active commitments
```

### 8.2 搜索结果

每条结果显示:

- 直接答案或匹配片段。
- 对象类型。
- 时间。
- 来源。
- Evidence 数量或最强引用。

不要只显示 ID、文件路径和技术类型。

### 8.3 对象详情

统一详情骨架:

- Summary。
- Current state。
- Related commitments。
- Decisions。
- Sources / Notes。
- Timeline。

Person、Project、Meeting 和 Commitment 共享结构,按内容调整优先级。

---

## 9. Settings

Settings 使用主应用内的 Preference 页面或紧凑 Sheet,不是占据大部分屏幕的网页 Modal。

分类:

1. General。
2. Workspace & Files。
3. AI & Privacy。
4. Connections。
5. Backup & Export。
6. Advanced。
7. About。

普通用户首页不出现:

- Provider 模型库。
- Prompt Library。
- Git 命令。
- IPFS。
- 钱包。

AI Provider 使用一个明确流程:

1. Choose provider。
2. 输入凭据。
3. Test connection。
4. 解释哪些内容会发送。

---

## 10. 组件规范

### 10.1 核心组件

必须统一实现:

- `AppShell`
- `GlobalRail`
- `TopBar`
- `SplitPane`
- `ContextDrawer`
- `CommandPalette`
- `QuickCapture`
- `EntityRow`
- `FocusRow`
- `NoteListRow`
- `ProposalReview`
- `EvidenceQuote`
- `StatusLine`
- `EmptyState`
- `ErrorState`
- `ConfirmDialog`
- `Toast`

业务页面不得各自重新拼装不同风格的按钮、卡片和状态。

### 10.2 EntityRow

优先使用行,不是卡:

```text
● Send revised proposal             Waiting on Alex · Wed
  Acme partnership                  Updated 2h ago
```

只在以下情况使用卡片:

- Proposal 需要作为一个整体审阅。
- 空状态指导。
- 关键警告。
- Onboarding。

### 10.3 Pill

允许:

- 一个短状态。
- 筛选条件。
- 人物/项目选择结果。

禁止:

- 把来源、迁移日期、截止日期、类型、标签全部做成并排 pills。

### 10.4 主按钮

一个 Pane 内同时最多一个 Primary Action。

“New”“Save”“AI Assist”“Generate”“Add”不能在同一视觉层级竞争。

---

## 11. 响应式

### >= 1180px

- Global Rail 220px。
- Notes / Memory 可显示二级 Pane。
- Context Drawer 按需常驻。

### 800-1179px

- Global Rail 可折叠为 64px。
- 二级 Pane 与主内容同时显示。
- Context Drawer 覆盖式打开。

### < 800px

- 单 Pane 导航。
- Global Rail 变为 Drawer。
- Context Drawer 全屏 Sheet。
- 保持 capture、阅读、审阅和完成能力。
- 不要求完整桌面多栏布局。

---

## 12. 可访问性

- 所有主要操作可用键盘完成。
- 焦点状态清晰。
- 正文、辅助文字、边框满足对比度。
- 不能只用颜色区分风险和完成。
- 图标按钮有 accessible name 和 tooltip。
- Modal 和 Drawer 管理焦点并支持 Escape。
- 动效支持 reduced motion。
- 中文状态不能依赖英文缩写。

---

## 13. 删除与降级清单

从主产品 UI 删除:

- 独立 AI Chat 导航。
- AI Assist 悬浮按钮。
- v2 standalone / AI-Native mode 入口。
- 左侧日期时间线。
- Work / Life 顶级 toggle。
- Capsules。
- Workspaces 思考入口。
- AI Summary Generator 大卡。
- Prompt Library 普通入口。
- 每个 Task 上长期可见的大量编辑按钮。
- 装饰性渐变和 glow。

保留但迁移:

- 日期回顾 → Today 内日期选择或 Command。
- Work / Life → Workspace 或过滤条件。
- AI Chat → 对象内 Ask AI / Context Drawer。
- Meeting Capture → Meeting Note 模式。
- Tags → 搜索和高级筛选。
- Models & Skills → Advanced Settings。
- Git → Backup & Export。

---

## 14. 实施顺序

### UI-00:建立视觉基线

- 新 tokens。
- typography。
- button/input/menu/dialog 基础。
- Story/Test 页面。

验收:同一组件在 Today、Notes、Memory 中一致。

### UI-01:统一 AppShell

- GlobalRail。
- TopBar。
- 主区域。
- ContextDrawer。
- 移除 v2 standalone 依赖。

验收:所有 v2 功能进入主应用,不存在第二套导航。

### UI-02:Notes 优先重构

- NoteList Pane。
- document-first Editor。
- autosave 状态。
- AI Review Drawer。

验收:无标题创建到开始写作只需一次操作。

### UI-03:Today 重构

- Morning context。
- FocusRows。
- Attention。
- Execution state。
- re-plan input。

验收:第一屏能在 10 秒内回答“现在做什么和为什么”。

### UI-04:Memory 重构

- Search-first。
- Results。
- Unified detail。
- Evidence。

验收:用户无需理解 entity ID 即可找到一个历史决定及来源。

### UI-05:Settings 与全局交互

- Command Palette。
- Quick Capture。
- Preferences。
- Connections。

### UI-06:一致性清理

- 删除旧路由和旧组件。
- 删除重复 tokens。
- 删除 gradients/glows/floating-card 滥用。
- 响应式与可访问性。

---

## 15. 验收标准

### 15.1 五秒测试

新用户看到任意核心页面 5 秒后能回答:

- 这是哪个区域?
- 主要内容是什么?
- 下一步最可能做什么?

### 15.2 交互路径

- 从启动到开始写 Note <= 2 次主要操作。
- 从启动到 Quick Capture <= 1 个快捷键。
- 从 Today 到执行第一项 <= 1 次点击。
- 查看 AI 建议的 Evidence <= 1 次点击。
- 接受一个 Proposal <= 2 次主要操作。
- 找到一个历史决定及原文 <= 3 次主要操作。

### 15.3 视觉

- 任意核心屏幕不超过一个 Primary Button。
- 不存在卡片套卡片超过一层。
- 普通列表不使用独立阴影。
- 同一屏幕不超过三种圆角。
- 不使用装饰性渐变。
- AI 建议与已确认事实有明确视觉区别。
- 1366×768 下核心动作无需滚动即可看到。

### 15.4 产品整合

- 主应用中真实使用 v2 API 和对象。
- 不存在 standalone 演示页作为正式入口。
- Today / Notes / Memory 使用同一 Shell。
- 所有空、错、加载、冲突状态使用统一组件。
- 旧数据能在新 UI 中正常读取。

---

## 16. 最终界面判断

DailyFlow 的优秀 UI 不应该让评委或用户说:

> 功能很多,看起来挺完整。

而应该让人立刻感受到:

> 它知道我现在在做什么。我可以直接写、直接做,AI 在旁边把遗漏的承诺接住。

UI 的差异化不是更像未来,而是让复杂的 AI 系统在使用时几乎不需要被理解。
