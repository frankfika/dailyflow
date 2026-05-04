# DailyFlow 视觉参考：DINQ 风格转译

> 参考页面：https://dinq.me/  
> 参考目的：借鉴它的现代、克制、编辑感和轻微玩具感，而不是复制品牌、图形或文案。

---

## 1. DINQ 的可借鉴特征

从 dinq.me 的真实页面可以提炼出这些视觉特征：

- **黑白为主**：大面积白底、核心文字 `#171717`，主 CTA 是黑底白字。
- **细网格背景**：hero 背后有淡灰网格，增加技术感和空间感，但不抢内容。
- **编辑感大标题**：超大 serif display 字体，字重厚、字距紧，局部 italic 强调。
- **胶囊输入框/按钮**：圆角很大，边框较粗，按钮像可执行命令。
- **线框图标**：装饰图标用黑色细线，像手绘符号，分散在页面周围。
- **漂浮卡片**：信息卡有轻微旋转、阴影和黑色描边，形成活泼但不花哨的层次。
- **少量高饱和色块**：主体黑白，局部用亮蓝、浅紫、浅绿、浅粉做模块区分。
- **大留白与长滚动叙事**：每个 section 只表达一件事，视觉焦点明确。
- **Tab/FAQ 轻交互**：tab 是黑色滑块，FAQ 是大字号问题 + 圆形加减号。

## 2. 转译到 DailyFlow

DailyFlow 是日程管理工具，不适合完全营销站风格。转译策略：

| DINQ 元素 | DailyFlow 转译 |
|---|---|
| One Card, All About Me | One Day, All Tasks Flow Forward |
| Claim your DINQ 输入框 | Command Bar：`dailyflow / today / rollover` |
| 个人档案卡片 | 日期任务卡、项目卡、迁移预览卡 |
| 漂浮作品卡 | 漂浮的任务片段、项目进度片、附件片 |
| AI Career Agent tabs | Today / Projects / Mindmap 三段切换 |
| 黑白 FAQ | 设置页和帮助页使用大问题列表 |
| 明亮蓝 CTA section | 迁移成功、首次设置引导、开源贡献 CTA |

## 3. DailyFlow 新视觉方向

名称：**Editorial Productivity OS**

一句话：像一张高级杂志封面打开的任务操作系统，黑白克制，但有网格、线框、漂浮任务卡带来的现代感。

### 关键词

- Editorial：大标题、强排版、少而准的文案。
- Grid：淡灰网格、结构化空间、可视化任务坐标。
- Command：黑色 CTA、命令栏、明确动作。
- Floating Cards：任务、项目、附件像卡片一样可拖动和关联。
- Monochrome + Sparks：黑白主体，少量亮色只用于状态和重点。

## 4. 颜色建议

```css
:root {
  --df-black: #171717;
  --df-white: #FFFFFF;
  --df-paper: #F7F7F2;
  --df-grid: #E8E8E3;
  --df-muted: #6D6D68;
  --df-line: #171717;

  --df-blue: #1E90FF;      /* 迁移成功 / 主强调块 */
  --df-lilac: #D8B4FE;     /* 思维导图 */
  --df-mint: #C9F7A7;      /* 已完成 */
  --df-rose: #FFD6D6;      /* 风险 / 逾期 */
  --df-amber: #FFC53D;     /* 今日重点 */
}
```

## 5. 字体建议

```css
:root {
  --font-display: "Fraunces", "DM Serif Display", "Source Han Serif SC", serif;
  --font-body: "Satoshi", "Avenir Next", "Noto Sans SC", sans-serif;
  --font-mono: "JetBrains Mono", "Maple Mono", monospace;
}
```

使用规则：

- landing 和空状态标题用 display serif。
- 应用内部任务正文用 sans，保证长时间阅读舒适。
- 日期、路径、Git commit、任务元数据用 mono。
- 允许少量 italic，用在关键词：`Flow`, `Today`, `Done`。

## 6. 关键界面草图

```text
┌───────────────────────────────────────────────────────────────┐
│ ◈ DailyFlow       Today   Projects   Mindmap        Sync  ⏎    │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│              One Day, All Tasks Flow Forward.                 │
│                                                               │
│      ┌─────────────────────────────────────────────────┐      │
│      │ dailyflow / today / 2026-05-03        Rollover → │      │
│      └─────────────────────────────────────────────────┘      │
│                                                               │
│   ╭──────────────╮       ╭──────────────────╮                 │
│   │ Personal     │  -6°  │ Project: 投资搞定 │  +4°            │
│   │ 4 open tasks │       │ 40% done          │                 │
│   ╰──────────────╯       ╰──────────────────╯                 │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

## 7. 注意边界

- 不复制 DINQ logo、插图、文案和具体图形资产。
- DailyFlow 的产品界面不能为了风格牺牲任务密度和可读性。
- 大标题主要用于 landing、空状态、引导页；日常任务流要更克制。
- 明亮色块只用于状态分组，不把整个应用做成花哨看板。
