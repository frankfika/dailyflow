# DailyFlow 路演 Deck · 截图占位规范与逐张体检

> 生成时间：2026-08-20 / 输入：`docs/ROADSHOW_DECK_V2_CONTENT.md` (v7) +
> `roadshow-deck-sv/DESIGN.md` + `build/output/slide-*.png` 16 张渲染
>
> 用户原话："screenshot positions don't flow out properly"——本来该留给真实产品截图的位置，目前被 mock（手画脑图 / 假目录树 / 假 CHANGELOG）填掉了。本次体检给出每张"是否是 reservation"+"该如何修"+"通用规范"。

---

## 总览：哪些位置应该是 reservation

| # | Slide | 应该是什么 | 当前状态 | 评分 |
| --- | --- | --- | --- | --- |
| 04 | Highlight 1（脑图→任务） | 左侧 mindmap 截图 reservation | ❌ 手画 6 节点 mindmap（"想法"中 + 疑问/资料/风险/想法/想法/行动项） | **完全不是 reservation** |
| 07 | Reality 1（产品实景一） | 2/3 MINDMAP 截图 reservation + 1/3 TODAY 截图 reservation | ❌ MINDMAP 是手画 7 节点；TODAY 是手画 3 task + 完成态 + overdue 角标 | **两个都不是 reservation** |
| 08 | Reality 2（产品实景二） | 2×2 网格：AI CHAT 已有、NOTES 已有、另 2 格是 reservation | 🟡 已经有"【占位】截图 ①/②"标 + 紫色描边，但缺尺寸/图位/层级语言 | **半 reservation（需对齐规范）** |
| 11 | Open Source | 左上：开源项目目录截图；右上：版本迭代记录截图；两个都 reservation | ❌ 全部用假目录树（src/server/src-tauri/e2e/docs/CHANGELOG.md）和假 CHANGELOG（v1.8.0→v1.0.0）填满 | **完全不是 reservation** |

独立扫描 16 张后，**只有这 4 张需要修**。其余页（1/2/3/5/6/9/10/12/13/14/15/16）的"主视觉"都是文本/SVG/表格/对比块，不属于产品截图，不需 reservation。

---

## Slide 04 · Highlight 1

**md 规范**："**逻辑（配 mindmap 截图）**" + 3 步走通 → 左侧应是真实 mindmap 截图。

**当前状态**：手画 mock。中央紫色 pill "想法"，周围 6 个白 pill（疑问·左上 / 资料·右上 / 风险·左下 / 想法·右下 / 行动项·底中 / 还有一条 MINDMAP·脑图 的小标签），用细线连到中心。

**问题**：
- 这是 PPT 自绘的 mindmap，不是 reserve slot。它假装"已经截好图了"，等用户拿到真实截图时无法替换（因为没有 screenshot 这张图层，而是 8 个 shape）。
- 米灰色 (#F8FAFC) 的卡片背景配上 hard-coded 节点文字，仿真度太高——投资人看完会以为这是真的产品截图。

**修复 Spec**（替换整个左侧卡片区为 reservation）：

| 项目 | 值 |
| --- | --- |
| 左 / 顶 / 宽 / 高 | (0.4 in, 2.0 in, 5.0 in, 2.85 in) |
| 画布尺寸 | 1280 × 720 px → 该 cell ≈ 470 × 268 px（实际显示） |
| Aspect ratio | **16:9**（≈1.78，PNG 标准） |
| 建议源文件尺寸 | **1600 × 900 px**（@2x）或 800 × 450 px（@1x） |
| 容器 | 圆角 `rectRadius: 0.1`，底色 `#F8FAFC`（`theme.light`） |
| 边框 | 1.5 px `#CBD5E1`（`theme.divider`）**，dashed** `dashType: 'dash'` |
| 边角 badge | 左上角 `📷 MINDMAP  ·  1600 × 900` —— 11 px / `theme.secondary` / 大写 + `letterSpacing: 2` |
| 中央图标 | 24 × 24 px SVG 图标 "mountain-image"（单色 `theme.secondary`，reservations 通用） |
| 中央说明 | "在此插入真实产品截图" / 14 px / `theme.secondary` |
| 副说明 | "建议：脑图节点 ≥ 6 个，包含至少 1 个 promoted-to-task" / 11 px / `theme.meta` |
| 内部实测区 | 在中央画一个略小的虚线辅助框（可选），提示"图片实际铺满到此" |

**伪代码（替换 `slide-04.js` 左侧 8 个 shape）**：

```js
const slot = { x: 0.4, y: 2.0, w: 5.0, h: 2.85 };
// 1) empty container
slide.addShape('rect', {
  x: slot.x, y: slot.y, w: slot.w, h: slot.h,
  fill: { color: theme.light },
  line: { color: 'CBD5E1', width: 1.5, dashType: 'dash' },
  rectRadius: 0.1
});
// 2) corner badge
slide.addText('MINDMAP  \u00b7  1600 \u00d7 900', {
  x: slot.x + 0.2, y: slot.y + 0.18, w: slot.w - 0.4, h: 0.3,
  fontSize: 11, fontFace: FONT_EN, bold: true, charSpacing: 3,
  color: theme.secondary, margin: 0
});
// 3) center icon + caption
const cx = slot.x + slot.w/2 - 0.5, cy = slot.y + slot.h/2 - 0.4;
slide.addShape('rect', { x: cx, y: cy, w: 1.0, h: 0.8,
  fill: { color: 'FFFFFF', transparency: 50 },
  line: { color: theme.secondary, width: 1, dashType: 'dash' },
  rectRadius: 0.06 });
slide.addText('SCREENSHOT', {
  x: cx, y: cy + 0.18, w: 1.0, h: 0.2,
  fontSize: 9, fontFace: FONT_EN, bold: true, charSpacing: 4,
  color: theme.secondary, align: 'center', margin: 0
});
slide.addText('\u5728\u6b64\u63d2\u5165\u8111\u56fe\u622a\u56fe', {
  x: cx, y: cy + 0.42, w: 1.0, h: 0.2,
  fontSize: 10, fontFace: FONT_CN, color: theme.secondary,
  align: 'center', margin: 0
});
// 4) helper line below
slide.addText('\u5efa\u8bae\uff1a\u8111\u56fe\u8282\u70b9 \u2265 6\uff0c\u81f3\u5c11 1 \u4e2a\u63d0\u5347\u4e3a task', {
  x: slot.x + 0.2, y: slot.y + slot.h - 0.3, w: slot.w - 0.4, h: 0.25,
  fontSize: 10, fontFace: FONT_CN, italic: true,
  color: theme.meta, margin: 0
});
```

> 注：emoji `📷` 在 DESIGN.md §5 禁用清单里，所以**不要用 emoji**，改用纯文本 `SCREENSHOT` / `[ 占位 ]`。

---

## Slide 07 · Reality 1 · 2 截图位

**md 规范**："**MINDMAP 大图占 2/3，TODAY 占 1/3**"——两个都是产品截图区。

**当前状态**：
- 左 6.0 in 是手画 mindmap，标题条 "MINDMAP · 想法摊开·拆解·节点一键变任务" 黑底白字 1.95 → 2.35 in；紫色 pill root "Q4 路线图" + 7 个节点（用户调研/竞品分析/技术选型/架构草图/POC Demo/风险清单/资源评估）。底部角注 "* = promoted to task . red = risk"。
- 右 3.0 in 是手画 TODAY 列表，3 个 task item 含 checkbox / 完成态 / overdue 红色标注；底部 "+ 捕获一个想法…" 输入框。

**问题**：
- 这整张 slide 是"`dailyflow-roadshow-sv` 仿真度最高的"——仿真 mock 反而最坑，因为投资人会以为真的就是这么用的。
- 没有给真实截图留任何插入锚点。

**修复 Spec**（两个独立 reservation，并排 2/3 : 1/3 比例）：

| 项目 | MINDMAP slot | TODAY slot |
| --- | --- | --- |
| 左 / 顶 | (0.4, 2.0) | (6.6, 2.0) |
| 宽 / 高 | 6.0 / 2.85 in | 3.0 / 2.85 in |
| 实际像素 | ≈ 576 × 274 px | ≈ 288 × 274 px |
| Aspect ratio | **21:10**（≈2.1，宽屏 mindmap） | **~1:1**（≈1.05，方形 TODAY） |
| 建议源文件尺寸 | **1920 × 900 px** @2x | **900 × 900 px** @2x |
| 容器边框 | 1.5 px `#CBD5E1` dashed | 同上 |
| 背景 | `#F8FAFC` | 同上 |
| Badge | `MINDMAP  ·  1920 × 900` | `TODAY  ·  900 × 900` |
| 中央占位 | `SCREENSHOT` + 一句说明 | `SCREENSHOT` + 一句说明 |
| 副建议 | "建议：节点带 * 标记（=task）" | "建议：含 1 条已办+1 条逾期" |

> 关键点：把 "MINDMAP · 想法摊开·…" 标题条（黑底白字那条）和 "TODAY · 今天" 标题条**保留**到 reservation 顶角，让版式 hierarchy 不断裂；badge 用浅描边字而不是再画一条色条，避免颜色超 2 处（DESIGN.md §2 硬规则）。

---

## Slide 08 · Reality 2 · 4 格网格（2 实 + 2 留位）

**md 规范**："**截图位（4 格，2 张已有 + 2 个占位）**"。上半 2 格已经有 AI CHAT 和 NOTES 卡片（看起来是真实截图或仿真实截图，有紫色 CTA 角标），下半 2 格已经标注"【占位】截图 ① / ②"+ "你后续提供的截图"。

**当前状态**：已经是 reservation pattern——下半 2 格有：
- 紫色 2px 描边（`theme.accent`）
- 左上 "【占位】截图 ① / ②" 角标
- 主文案 "你后续提供的截图"
- 副文案 "建议：Brainstorm / 拆解节点" / "建议：自动复盘 / 周报生成"
- 底部虚线辅助线（看起来有，是个 1px dashed baseline）

**需要改进**（不是重做，而是对齐统一规范）：

| 项目 | 当前 | 应改为 |
| --- | --- | --- |
| 尺寸/aspect 标注 | ❌ 无 | ✅ 加 badge "BRAINSTORM · 900 × 600" / "WEEKLY REPORT · 900 × 600" |
| 中央占位 cue | 仅靠文字 "你后续提供的截图" | 加 `SCREENSHOT` 小图标框 |
| 与上 2 格边界 | 上格是 `theme.primary` 浅灰描边，下格是紫色描边 | 对齐：上格 `E2E8F0` 1px、下格 `CBD5E1` 1.5px dashed + 角部紫色 badge |
| 占位配色 | 整边 2px 紫描边 | 改为局部强调：左边 3px 紫色色条 + 卡片整体 dashed 1.5px 灰（克制） |
| "建议" row | 已存在 | 保留，但改用 `theme.meta` 灰色，移到 badge 下方 |

**修复 Spec**：

| 项目 | 值 |
| --- | --- |
| 左 / 顶 / 宽 / 高 | (0.4, 4.0, 4.5, 0.85) — 第①格 / (5.1, 4.0, 4.5, 0.85) — 第②格 |
| 实际像素 | ≈ 432 × 81 px（太小，**建议把下格高度提到 1.0 in 以容纳 badge**） |
| Aspect ratio | **3:2**（≈1.5，宽景） |
| 建议源文件尺寸 | **1200 × 800 px** @2x |
| 容器样式 | 1.5 px `#CBD5E1` dashed + 左侧 3 px `#6D28D9` 紫色色条 |
| 角部 badge（左上） | `【占位 ①】 BRAINSTORM · 1200 × 800` |
| 副标题 | "你后续提供的截图"（不变） |
| 建议行 | "建议：Brainstorm / 拆解节点"（移下，10 px，斜体，`theme.meta`） |

---

## Slide 11 · Open Source · 2 截图位

**md 规范**："【截图位 ①】开源项目目录" + "【截图位 ②】版本迭代记录"，两个都该是真实截图，目前**完全是 mock**——还仿得很像。

**当前状态**：
- 左格 4.5 × 1.4 in：黑底白字 title "PROJECT DIRECTORY" + monospace 7 行假目录树（"dailyflow/        .  root" / "  . core/         .  engine" / …）
- 右格 4.5 × 1.4 in：黑底白字 title "RELEASE HISTORY" + monospace 7 行假版本日志（"v1.8.0  .  2026-08  .  99 tests" / …）
- 下半 2 × 2 是 4 个数字 + 标题 + 一行说明的"原因卡"（信任/二次开发/反锁定/开源不死）

**问题**：
- 这两个 mock 是**整个 deck 里最危险的**——它俩的视觉密度、字体（等宽）、行距、各栏 80% 字符宽度都太像真实 GitHub 截图了。投资人/用户扫一眼会当真。
- 错过的代价也最大：用户要替换成真实 GitHub 仓库截图和 CHANGELOG.md 截图时，发现下面是 PPT shape 不是 image，占位卡比真实截图还窄（1.4 in = 135 px 高度，对真实截图太小）。

**修复 Spec**（两个 reservation 并排，下半 2×2 原因卡不变）：

| 项目 | PROJECT DIRECTORY | RELEASE HISTORY |
| --- | --- | --- |
| 左 / 顶 | (0.4, 2.0) | (5.1, 2.0) |
| 宽 / 高 | 4.5 / 2.2 in（**改高到 2.2**！） | 4.5 / 2.2 in |
| 实际像素 | ≈ 432 × 211 px | 同 |
| Aspect ratio | **~2:1**（宽景，适合文件浏览器） | **~2:1** |
| 建议源文件尺寸 | **1600 × 800 px** @2x | 1600 × 800 px @2x |
| 容器边框 | 1.5 px `#475569` dashed（深色页灰阶） | 同 |
| 容器背景 | `rgba(255,255,255,0.04)` | 同 |
| 角部 badge | `PROJECT DIRECTORY · 1600 × 800` —— 11 px / `rgba(255,255,255,0.55)` | `RELEASE HISTORY · 1600 × 800` |
| 中央占位 | `SCREENSHOT` + 一行说明 | `SCREENSHOT` + 一行说明 |
| 副建议 | "建议：从 GitHub raw 截图 / show tree" | "建议：从 GitHub Releases 页截图" |

> ⚠️ 这页是**深色 hero 页**（DESIGN.md §2.2），所有占位元素都按 deep theme 调色：边框用 `rgba(255,255,255,0.15)`、badge 用 `rgba(255,255,255,0.55)`、中央虚线辅助框用 `rgba(255,255,255,0.15)`、中央 SCREENSHOT 标用 `rgba(255,255,255,0.55)`。**禁止**在这里沿用浅底页的 `#6D28D9`。

> 实操：把当前 7 行 monospace text shape 全部删掉，替换为 1 个 dashed rect + 1 个 badge text + 1 个 center placeholder。

---

## 通用 Reservation Spec（设计系统级）

> 在 DailyFlow deck 里，"empty screenshot reservation"长这样：

### 0 · 命名约定（用户视角）

不要写"占位"，写"截图位"。badge 统一前缀：`[ 截图位 N ]`（中文）或 `SCREENSHOT N`（英文 UPPERCASE）。一个 slide 多个位用 ①/②/③。中英文混排时遵循 DESIGN.md §3 字体表（CN 用 PingFang SC、EN/UPP 用 Inter）。

### 1 · 容器（dashed rect）

```
border    = 1.5 px
dashType  = 'dash'                       # PptxGenJS 库属性
color     = 浅底：#CBD5E1（slate-300）
            深底：rgba(255,255,255,0.18)
fill      = 浅底：#F8FAFC（slate-50）
            深底：rgba(255,255,255,0.04)
rectRadius = 0.08–0.10 in
```

为什么不用 2px 实色描边？DESIGN.md §2.3 禁用"多色卡片 / 多色描边"，1.5 px 单色 dashed 足够悄悄地把"这块是 image、不是 UI card"这件事讲清楚，不抢主视觉颜色配额（每页 ≤ 2 处品牌紫罗兰）。

### 2 · 角部 badge（左上 · 11 px）

```
格式      = `<DOMAIN>  ·  <W> × <H>`      例：MINDMAP · 1600 × 900
字号      = 11 px
字体      = Inter / SF Pro Display (EN)
粗细      = 500 (medium)
字距      = charSpacing: 3（UPPERCASE 风格）
颜色      = 浅底：#64748B（slate-500）
            深底：rgba(255,255,255,0.55)
位置      = 距容器左 0.2 in、距顶 0.18 in
```

EN 域名前缀对照表：

| Slide | EN domain | 中文含义 |
| --- | --- | --- |
| 04 | MINDMAP | 脑图 |
| 07-L | MINDMAP | 脑图 |
| 07-R | TODAY | 今天视图 |
| 08-3 | BRAINSTORM | AI 整理脑图节点 |
| 08-4 | WEEKLY REPORT | 周报自动生成 |
| 11-L | PROJECT DIRECTORY | 开源项目目录 |
| 11-R | RELEASE HISTORY | 版本迭代记录 |

### 3 · 中央占位 cue

```
中央虚线辅助框：80 × 60 px / 1 px dashed / 同色
  + 上方："SCREENSHOT"  （9 px UPPERCASE + charSpacing: 4 + meta 灰）
  + 下方："在此插入 …"  （10–11 px CN / meta 灰）
替代方案：如果空间紧张（< 80 px 高度），只保留 "SCREENSHOT" + 一行说明。
```

**禁止用 emoji**（DESIGN.md §2.3 已禁 📷/🖼/⌗）。改用居中文字 + 一个 1 px dashed 小框框的"约定俗成"视觉语法。

### 4 · 副建议行（容器底部 · 10 px italic）

```
格式      = 建议：<具体指引>
字号      = 10 px
字体      = PingFang SC (CN)
字形      = italic
颜色      = #94A3B8（slate-400 / theme.meta）
位置      = 距容器底 0.3 in、距左 0.2 in
```

作用：给后面拿到截图的人一条"应该截什么、应该避什么"的提示。这是 reservation 跟普通占位框最大的区别——它**告诉提交者预期**，不是被动等着别人塞图。

### 5 · 链接到真实图（生产期）

提交截图时不要直接 `slide.addImage`，而是把这块 reservation 整体做成一个命名 group：
```
slot_04_mindmap        / 1600x900
slot_07l_mindmap       / 1920x900
slot_07r_today         / 900x900
slot_08_3_brainstorm   / 1200x800
slot_08_4_weekly       / 1200x800
slot_11l_directory     / 1600x800
slot_11r_releases      / 1600x800
```

外层脚本里加 swap table，命名 group 命中后整体替换为 `slide.addImage`、保留 aspect、object-fit: contain、覆盖原 rect。

### 6 · 自检清单（每改一处 reservation 走一遍）

- [ ] 角部 badge 给出尺寸（用户能 1 秒判断要不要重新截图）
- [ ] 边框是 dashed 而不是实线
- [ ] 没有用 emoji（📷/🖼/⌗ 全部禁用）
- [ ] 没有用禁用色（#06B6D4/#F59E0B/#EF4444/#10B981 等）
- [ ] 浅底页 reservation 不消耗 `#6D28D9` 配额（≥ 2 处品牌紫罗兰同时出现会违规）
- [ ] 深底页 reservation 用 `rgba(255,255,255,0.x)` 而非 `#6D28D9`
- [ ] 整张 slide 的 C 区主视觉仍 ≥ 30%（DESIGN.md §4 门禁）

---

## 修改优先级与工作量估算

| 优先级 | Slide | 改动 | 估时 |
| --- | --- | --- | --- |
| **P0** | 11 | 删 2 个 mock 块、改 2 reservation、改尺寸 | 15 min |
| **P0** | 04 | 删整个左侧手画 mindmap、改 1 reservation | 10 min |
| **P0** | 07 | 删左右两个手画块、改 2 reservation | 15 min |
| **P1** | 08 | 已有 reservation pattern，只需补 badge + 边框 | 10 min |

合计：4 张、6 个 reservation。改完后整 deck 仍保持 16 页、保持现有 hero/text 卡片组织。


---

## 补 · Slide 14 · 随身 AI · PORTABLE DEVICE 截图位（v7.1 增补）

**用户反馈**："难道没有截图吗" — 随身 AI 是硬件方向，必须留一个 PORTABLE DEVICE 截图位。

**修复 Spec**：

| 项 | 值 |
| --- | --- |
| 位置 (x, y, w, h in) | (5.5, 3.3, 3.0, 0.9) |
| Domain badge | `PORTABLE DEVICE` |
| Size | `1200 × 1200` |
| 副建议 | "硬件渲染图：耳挂 / 胸针 / 录音笔 — 工业设计共创中。" |
| 视觉 | 深色 hero 风格（rgba 255/255/255/0.18 dashed + rgba 255/255/255/0.04 fill） |

**新 layout**：
- 顶部 3 列 · 它是什么（恢复 v6 横向布局）
- 底部 60/40 split：2 条为什么是硬件（左）+ PORTABLE DEVICE reservation（右）
- 状态 pill 在最下方

**命名 group**：`slot_14_portable_device / 1200x1200`
