# DailyFlow UI 设计规范

> 视觉方向：Editorial Productivity OS。参考 dinq.me 的黑白网格、编辑感大标题、胶囊命令框、粗线框卡片与少量高饱和色块，转译为适合日常高频使用的任务操作系统。

---

## 1. 设计原则

1. **先有记忆点，再有工具感**：首页和空状态要像一张杂志封面；进入任务流后立刻回到高效操作。
2. **黑白骨架，亮色点火**：主体只用黑白灰，状态和模块用少量明亮色块。
3. **网格即秩序**：淡灰网格表达日程坐标、项目结构和任务流动。
4. **命令感操作**：迁移、创建、同步等核心动作使用胶囊命令框，像输入一条清晰指令。
5. **卡片可漂浮，列表要克制**：概览页允许卡片倾斜和错落；任务列表不牺牲密度。
6. **所有批量动作可预览**：迁移、节点转任务、Git 同步必须先展示结果，再执行。

## 2. 参考风格提炼

| 参考特征 | DailyFlow 转译 |
|---|---|
| 大面积白底 + `#171717` 黑字 | 应用默认黑白主色，减少 SaaS 模板感 |
| 细网格背景 | 今日页和项目概览页使用 grid canvas |
| 超大 serif 标题 | landing、空状态、项目封面标题 |
| 胶囊输入框和黑色按钮 | Command Bar 和主 CTA |
| 线框小图标 | 日期、附件、项目、迁移状态的 icon 系统 |
| 漂浮卡片和轻微旋转 | 首页 hero、项目概览、思维导图结果预览 |
| 鲜蓝大色块 | 首次设置、迁移完成、开源贡献区 |
| FAQ 大折叠列表 | 设置说明、迁移规则、帮助中心 |

## 3. 色彩系统

```css
:root {
  /* Core monochrome */
  --df-black: #171717;
  --df-white: #FFFFFF;
  --df-paper: #F7F7F2;
  --df-grid: #E8E8E3;
  --df-muted: #6D6D68;
  --df-faint: #A7A7A0;
  --df-line: #171717;

  /* Sparks */
  --df-blue: #1E90FF;      /* 主强调 / 迁移成功 */
  --df-lilac: #D8B4FE;     /* 思维导图 */
  --df-mint: #C9F7A7;      /* 已完成 */
  --df-rose: #FFD6D6;      /* 逾期 / 风险 */
  --df-amber: #FFC53D;     /* 今日重点 */
  --df-sky: #BFD4DF;       /* Footer / 次级背景 */
}
```

### 使用规则

| 场景 | 颜色 |
|---|---|
| 页面背景 | `--df-white` + 淡灰 grid |
| 主文字和边框 | `--df-black` |
| 次级文字 | `--df-muted` |
| 主 CTA | 黑底白字 |
| 迁移成功 | `--df-blue` 或黑白卡片中的蓝色 badge |
| 已完成 | `--df-mint` badge + 删除线 |
| 思维导图 | `--df-lilac` |
| 逾期风险 | `--df-rose` + 黑色描边 |
| 今日重点 | `--df-amber` 小面积强调 |

## 4. 字体与排版

```css
:root {
  --font-display: "Fraunces", "DM Serif Display", "Source Han Serif SC", serif;
  --font-body: "Satoshi", "Avenir Next", "Noto Sans SC", sans-serif;
  --font-mono: "JetBrains Mono", "Maple Mono", monospace;
}
```

| 类型 | 大小 | 字重 | 用途 |
|---|---:|---:|---|
| Marketing Hero | 72-96px | 700 | 首页大标题 |
| App Hero | 44-64px | 700 | 空状态、项目封面 |
| H1 | 32-40px | 650 | 页面标题 |
| H2 | 22-28px | 650 | 分类标题 |
| Task Body | 15-16px | 450 | 任务正文 |
| Meta | 12-13px | 550 | 标签、路径、Git 状态 |

排版规则：

- serif display 只用于大标题和强调短语；任务正文不用 serif。
- 标题字距略紧，允许 italic 强调一个关键词，如 `Flow`。
- 日期、文件路径、commit hash 用 mono，形成技术可信感。
- 中文正文行高 1.65；任务标题最多两行，长内容进入详情面板。

## 5. 背景与空间

### 5.1 Grid Canvas

```css
.df-grid-bg {
  background-color: var(--df-white);
  background-image:
    linear-gradient(var(--df-grid) 1px, transparent 1px),
    linear-gradient(90deg, var(--df-grid) 1px, transparent 1px);
  background-size: 32px 32px;
}
```

使用场景：

- 首页 hero。
- 今日视图顶部区域。
- 思维导图编辑器。
- 项目概览封面。

不用于：长任务列表的正文背景，避免阅读疲劳。

### 5.2 Section Rhythm

- Landing：每个 section 高度更大，表达一件事。
- App：顶部 160-220px 有视觉风格；主任务流回归紧凑。
- 设置/帮助：使用 FAQ 风格大折叠项，减少表单堆砌感。

## 6. 布局

### 6.1 Landing Hero

```text
┌──────────────────────────────────────────────────────────────────┐
│ ◈ DailyFlow          Product   Roadmap   GitHub          Sign in  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│             One Day, All Tasks                                   │
│             Flow Forward.                                        │
│                                                                  │
│        Tasks roll over. Projects stay alive.                     │
│        Markdown remains yours.                                   │
│                                                                  │
│   ┌──────────────────────────────────────────────────────────┐   │
│   │ dailyflow / your-vault                         Start →   │   │
│   └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│      ╭────────────╮      ╭──────────────╮      ╭───────────╮     │
│      │ 5 tasks ↗  │ -7°  │ 投资搞定 40% │ +5°  │ Git clean │     │
│      ╰────────────╯      ╰──────────────╯      ╰───────────╯     │
└──────────────────────────────────────────────────────────────────┘
```

### 6.2 App Shell

```text
┌──────────────────────────────────────────────────────────────────┐
│ ◈ DailyFlow       Today   Projects   Mindmap       Search  Sync   │
├───────────────┬──────────────────────────────────┬───────────────┤
│ Date Rail     │ Today · 2026-05-03               │ Inspector     │
│               │ ┌ dailyflow / rollover → ┐       │               │
│ 05/01         │                                  │ Task details  │
│ 05/02         │ Personal                         │ Attachments   │
│ 05/03 active  │ ○ 完成 secondplanet 上线          │ Git status    │
│ 05/04         │ ◆ 投资搞定  40%                  │               │
│               │ Company                          │               │
│               │ ○ WAIC 评委确认                  │               │
└───────────────┴──────────────────────────────────┴───────────────┘
```

- 左侧 Date Rail：像时间坐标轴。
- 中间 Task Stream：主内容区，黑白为主。
- 右侧 Inspector：详情、附件、Git 状态、迁移历史。
- 顶部 Command Bar：当前日期最重要的动作入口。

### 6.3 移动端

```text
┌────────────────────────────┐
│ Today · May 3        Sync   │
├────────────────────────────┤
│ dailyflow / rollover →      │
├────────────────────────────┤
│ Personal                   │
│ ○ Complete secondplanet    │
│ ◆ 投资搞定                 │
│                            │
│ Company                    │
│ ○ WAIC judge confirmation  │
├────────────────────────────┤
│ Today Projects Map Settings│
└────────────────────────────┘
```

- 单列任务流。
- 详情面板改为底部抽屉。
- 底部导航保持 44px 以上触控目标。

## 7. 组件规范

### 7.1 顶部导航

- 白底或半透明白底，底部 1px 灰线。
- Logo 使用黑色符号 + 粗体 wordmark。
- 导航 hover 用底部黑线展开，不用彩色 hover。
- 主按钮黑底白字，圆角 8-12px。

### 7.2 Command Pill

```text
┌────────────────────────────────────────────────┐
│ dailyflow / 2026-05-03 / rollover      Run →   │
└────────────────────────────────────────────────┘
```

规则：

- 外框 2px 黑线，圆角 999px。
- 左侧是路径/命令，右侧是黑色执行按钮。
- 用于迁移、创建今日、搜索、快速添加任务。

### 7.3 任务项

```text
○  完成 secondplanet 上线                         high · 5月10日截止
   需要完成前端部署和域名配置                      2 subtasks · 1 attachment
```

状态符号：

- `○` 未完成。
- `✓` 已完成。
- `↗` 已迁移。
- `◆` 项目入口。
- `◇` 思维导图生成任务。

### 7.4 Floating Card

```text
╭────────────────────╮
│ Project            │
│ 投资搞定            │
│ 40% done           │
╰────────────────────╯
```

规则：

- 黑色 1.5-2px 描边。
- 圆角 20-28px。
- 可轻微旋转：`-8deg` 到 `8deg`。
- 只用于概览和引导，不用于长任务列表。

### 7.5 Tab Switcher

```text
[ Today ] [ Projects ] [ Mindmap ]
```

- 容器白底 40% 透明或浅灰。
- 当前项黑底白字。
- 切换时黑色滑块移动，180-240ms。

### 7.6 FAQ / Settings Row

```text
迁移规则如何工作？                                      ＋
────────────────────────────────────────────────────────
Git 冲突时会覆盖文件吗？                                ＋
────────────────────────────────────────────────────────
```

- 大字号问题，整行可点。
- 右侧圆形加减号。
- 展开内容用次级灰字，不放厚重卡片。

## 8. 页面设计

### 8.1 今日视图

重点：既有 DINQ 风格的顶部记忆点，又保证任务列表效率。

- 顶部：grid canvas + 大日期标题。
- 命令栏：`dailyflow / today / rollover`。
- 漂浮摘要：`5 open tasks`、`2 due soon`、`Git clean`。
- 主列表：回归简洁黑白，按分类展示。
- 右侧：任务详情和迁移历史。

### 8.2 项目视图

- 项目标题使用 serif，大而有封面感。
- 进度卡可以使用浅蓝/薄荷色块。
- 子任务树保持黑白线框。
- 每日记录像 FAQ/日志列表，按日期折叠。
- `Pin to Today` 是黑色 CTA。

### 8.3 思维导图视图

- 网格画布常驻。
- 节点采用黑线框 + 类型色块。
- 任务节点用实心黑角标。
- 节点转任务时出现迁移预览卡，而不是直接写入。

### 8.4 设置视图

- 不做传统 dense form。
- 采用「问题列表」组织：工作区在哪？迁移规则是什么？Git 如何同步？
- 高风险操作用黑线框确认卡 + diff 预览。

## 9. 动效

| 场景 | 动效 | 时长 |
|---|---|---:|
| Landing 进入 | 大标题 fade-up，漂浮卡片轻微错位进入 | 500ms |
| Command 执行 | 按钮轻微压缩，命令栏边框闪一次 | 180ms |
| 完成任务 | checkbox scale，任务移动到已完成区 | 220ms |
| 迁移成功 | 蓝色状态片滑入，显示迁移数量 | 320ms |
| Tab 切换 | 黑色滑块横向移动 | 200ms |
| 卡片 hover | 旋转归零 + 轻微上浮 | 180ms |

## 10. 文案风格

参考 DINQ 的短句风格，但改成任务管理语义。

| 场景 | 文案 |
|---|---|
| 首页标题 | One Day, All Tasks Flow Forward. |
| 首页副标题 | Tasks roll over. Projects stay alive. Markdown remains yours. |
| 今天无任务 | Your day is clear. Want to pull unfinished tasks forward? |
| 迁移成功 | Tomorrow is already drafted. |
| 项目空状态 | Give this project a next move. |
| Git 未配置 | Local first. Sync when you are ready. |

中文产品内文案：

- 今天很干净。要从昨天迁移未完成事项吗？
- 明天已经起草好了。
- 给这个项目指定下一步。
- 本地优先；准备好了再同步。

## 11. 可访问性和约束

- 黑白高对比是默认优势，但亮色状态必须配合文字和符号。
- 网格背景透明度要低，不能影响任务正文阅读。
- 大标题不用于高频任务列表，避免占用工作空间。
- 卡片旋转只在概览页使用，用户进入编辑状态后自动归正。
- 移动端禁用过多漂浮装饰，优先速度和触控。
