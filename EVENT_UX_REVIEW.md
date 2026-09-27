# dailyflow Event UX 实地审查 — 2026-09-28

> **目的**：给另一个 review model 当事实输入。所有发现都来自 2026-09-28 在 worktree `continue-5bfa10` 上对 live dev server (port 47841) 的 Playwright 实测。  
> **要求**：诚实记录,不修任何东西。

## 0. 测试环境

| 维度 | 值 |
|------|----|
| Worktree | `.claude/worktrees/continue-5bfa10` |
| 分支 | `claude/event-ux-review-097f84` |
| Dev server | `worktree-dev-all` (Vite + Tauri stub),http://localhost:47841 |
| Workspace | `dailytasks` (4 events: A +轮融资 / 报销 / A 轮打款交割事项 / 报喜) |
| 屏幕 | 1280 × 720 |
| 浏览器 | Playwright Chromium (desktop preset) |
| dailyflow 版本 | v2.16.2 (commit 5b90546 "chore(events): address review NITs") |

---

## 1. 关键文件清单

| 文件 | 行数 | 角色 |
|------|------|------|
| `src/App.tsx` | ~1300 | 全局键盘路由、Tab 切换、Escape 跳转 |
| `src/features/v2/events/EventsView.tsx` | 1282 | Event 列表 + 详情容器、title 编辑、undo/redo hook |
| `src/features/v2/events/EventCanvas.tsx` | 1042 | 画布、节点渲染、pointer/drag/click/scroll,floating 工具栏 |
| `src/features/v2/events/EventOutline.tsx` | 688 | 左侧列表、slash menu 触发、drag-reparent、ScheduleDatePopover |
| `src/features/v2/events/SlashMenu.tsx` | 147 | 节点类型选择 |
| `src/features/v2/events/ScheduleDatePopover.tsx` | 214 | 日期 + extras 录入 |
| `src/features/v2/events/EventCover.tsx` | ~? | 144px 渐变 + monogram |
| `src/features/v2/events/eventsStore.ts` | - | Zustand store + undo/redo |

---

## 2. P0 — 真正影响使用的 bug

### P0-1 Escape 跳出 Events 回 Today

**复现步骤**
1. 启动 dev server,进入 workspace `dailytasks`
2. Tab 切到 **Events**
3. 进入任意 event 详情(例"报销")
4. 选中一个节点 → 底部 toolbar 点 **Add to Task** → 打开 ScheduleDatePopover
5. 按 **Esc**

**期望**：popover 关闭,留在 Events 详情
**实际**：popover 关闭 → **整个 Event 详情消失,跳回 Today 列表**

**根因**(`src/App.tsx` 第 1126-1134 行附近)

```tsx
if (e.key === 'Escape') {
  const target = e.target as HTMLElement | null;
  const typing = !!target && (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable
  );
  if (typing) return;
  if (activeOverlay) {
    setActiveOverlay(null);
  } else if (activeTab === 'events') {
    setActiveTab('today');    // ← 跳回 Today
  }
}
```

子组件的 Escape handler 没有阻止事件冒泡:

- `ScheduleDatePopover.tsx:83-85`
  ```tsx
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') onCancel();
  }
  // 没有 preventDefault()、没有 stopPropagation()
  ```
- `SlashMenu.tsx:80-83` 有 `preventDefault + stopPropagation`,所以它不会冒泡(但 SlashMenu 是 mount-time focus trap,不是 input 字段,所以 App 的 typing 检查也不会拦)
- `EventOutline.tsx:211` Escape handler
- `EventCanvas.tsx:492` Escape handler

**影响范围**:任何在 Events 详情页按 Escape 想关闭弹窗/输入框/dialog 的用户,都会丢失整个上下文回到 Today。

**截图**: `events-after-esc.png`(已经跳回 Today)

---

### P0-2 Canvas 节点点击激活不可靠

**复现步骤**
1. 进入 "报销" 详情
2. canvas 上有 root + 若干子节点
3. 直接用鼠标点 canvas 上的**非根节点**(例"测试新建一个子任务")的**节点主体文字**
4. 观察浏览器 `:focus` 红框 + 底部 toolbar 状态

**期望**:节点变成 activeNodeId,toolbar 切换成该节点对应的 buttons
**实际**:浏览器 :focus 红框出现(节点"被选中"),但 React 的 `activeNodeId` 没变,toolbar 仍按 root 显示(只有 "Add child" + "More")

**对比**:同样在 Outline 行(左面板)点同一节点,toolbar 立即切换成完整版(Add child / Add sibling / Add to Task / Type / More)。

**根因猜测**(`EventCanvas.tsx` 大约 800-900 行):

```tsx
onClick={(e) => {
  if (didDragRef.current) { e.preventDefault(); return; }
  e.stopPropagation();
  onActivate(node.id);
}}
```

- `didDragRef` 在 `pointerup` 后通过 `setTimeout(0)` 重置。**如果在 pointerup 后 0ms 内发生 click,会被误判为 drag 而 skip activate**
- 或 React 事件冒泡到 wrapper div,被另一个 handler 调用 `setActiveNodeId(...)` 之前被覆盖

**影响范围**:用户在 canvas 上几乎无法用底部 toolbar 操作非根节点。要操作必须先在 Outline 里点一下。

---

### P0-3 Root 节点的 "More" 弹出空菜单

**复现**
1. 进入任意 event 详情
2. 顶部 root 是 active(默认)
3. 点底部 toolbar **More**

**期望**:看到一组合理操作(归档 / 复制 / 重命名根标题 / …)
**实际**:弹出一个**没有任何菜单项**的浮动 div(只是一个半透明矩形)

**根因**(`EventCanvas.tsx` 大约 1020 行):

```tsx
{moreOpen && (
  <div className="absolute bottom-full mb-2 w-48 rounded-xl ...">
    {activeNode.execution && (
      <button onClick={...}>Remove from day</button>
    )}
    {!isRootActive && (
      <button onClick={...}>Delete node</button>
    )}
    {/* root 上 execution 通常为空 + isRootActive 为真 → 0 个按钮 */}
  </div>
)}
```

root 既 `!execution` 又 `isRootActive`,两个条件都不满足,渲染 0 个按钮。

**影响范围**:用户点击 More 后只看到反白反馈和一个空容器。看似 bug。

---

## 3. P1 — 明显影响体验的问题

### P1-1 Canvas 节点点击热区被浮动按钮吃掉

每个 canvas 节点边缘叠了 3-4 个浮动按钮:

- 右上 **X** (delete)
- 右中 **+** (add child)  
- 底中 **+** (add sibling)
- 节点高亮时多一个折叠按钮

这些按钮宽度都很小(28-32px),而且**离节点边缘 0px**。用户想点节点本体,经常会命中其中一个按钮。

例:点 "报销北京行程" 节点的右 1/3,实际触发了 add child。

**期望**:节点本体点击区不被遮挡;浮动按钮可以 hover 才显示 / 移到边缘外 / 长按才出
**实际**:浮动按钮常驻可见 + 占据节点边缘 = 命中错乱

---

### P1-2 底部 toolbar 文字窄到换行

底部 toolbar 五个按钮:**Add child** / **Add sibling** / **Add to Task** / **Type** / **More**

在 1280px 屏幕、toolbar 容器宽度 ~480px 的情况下,每个按钮被压到 80-90px 宽,**icon + label 垂直换行**:

```
+ Add        Add       Add to    Type    More
  child      sibling   Task
```

视觉非常乱,"Type" 单字按钮和 "Add child" 三字按钮挤在一起宽度不同。

**期望**:要么把 toolbar 做成 icon-only + tooltip,要么每个按钮最小宽度足够容纳 label
**实际**:换行 + 参差不齐

---

### P1-3 新建节点位置飘

通过 toolbar 的 **Add child** 输入框(或按钮)创建的子节点,显示位置和父节点无关:

- root "得" 在最左
- 用户输入"测试新建一个子任务" → 新节点显示在 canvas 右下角(远离 root 500px+)
- 即使点 **Layout** 按钮整理,root + 3 子节点挤在一列,中间仍然大量空白
- 没有 fit-all 也没看 View → Fit

**期望**:新节点紧邻父节点 + 自动 fit 到可视区
**实际**:节点在固定坐标或随机位置

---

### P1-4 Root 节点文本 ≠ 事件标题

事件标题叫 **"报销"**,但 mind-map 的 root 节点显示 **"得"**(单字,只有一个字符)。

新建 event 时只填了标题;root 节点的文本被独立初始化为别的字符串(或占位文案)。违反"事件标题即主题"的直觉。

**截图**: `events-canvas-view.png` `events-after-cleanup.png` 都清晰显示这个分歧。

**期望**:新建 event 时把 root 节点文本 = event 标题;后续改名时两者联动
**实际**:两个独立字段,不同步

---

### P1-5 已 scheduled 节点的按钮伪装成状态标签(2026-09-28 复核修正)

> **修正**:复核代码发现 toolbar 按钮在已 scheduled 时**确实**会换文案(EventCanvas.tsx:973-974):
> ```tsx
> label={activeNode.execution ? `${copy.date} · ${activeNode.execution.scheduledDate.slice(5)}` : copy.addToTask}
> ```
> 所以问题不是"没区分",而是:换了文案后**看起来像一个只读状态标签,不像一个可点的按钮**,用户不知道点它能改期。图标换成了 CalendarDays 但没有"点击修改"的 affordance(如下拉箭头或 hover 提示)。

**期望**:已 scheduled → 按钮明确表达可操作,如「任务 · 09-15 ▾」,hover 提示"修改日期"
**实际**:纯文字状态样式,可点性弱

---

### P1-6 Outline 与 Canvas 是两套 mental model

| 视图 | 呈现 |
|------|------|
| Outline (左) | 扁平列表,空格缩进,**无**连接线/树状指示 |
| Canvas (右) | 曲线箭头连接的有向图,Bezier 路径,节点可拖拽 |

两套视图都是 mind-map 的不同 projection,但视觉语言完全不统一:

- Outline 看不出谁是父谁是子(只是缩进)
- Canvas 看不出节点顺序(只是空间布局)
- 在 Outline 里激活某行 → Canvas 不一定滚到对应节点
- 反过来在 Canvas 里激活某节点 → Outline 对应行没有明显的高亮(只有 hover)

用户很难对应"Outline 第三行 = Canvas 左下那个节点"。

**期望**:至少有一种交互同步(点 Outline 行 → Canvas 平滑 scroll + 高亮对应节点;反之亦然)
**实际**:两套独立激活状态,缺乏视觉关联

---

## 4. P2 — 改进项

### P2-1 顶部 toolbar 全是图标无标签

`[AI] [Undo] [Redo] [Hide outline] [Search] [More]` 全是 18-20px 裸图标,在 1280px+ 屏幕上完全可以用文字标签。初次使用只能靠 tooltip 推断功能。

### P2-2 底部 hint 11px 灰色字

`Tab child · Enter sibling · ↑↓←→ navigate` 是 `text-[11px] text-gray-400`,几乎看不见。

### P2-3 Event 卡片封面信息密度低

每个 EventCard 顶部 144px 渐变 + monogram(只显示标题首字"报"、"A"),不承载任何信息。

同面积可以放:

- 节点总数 / 完成数
- tag chips
- 最近修改时间
- 关联到 Today 的 task 数

### P2-4 删除按钮 hover 才显示

```tsx
className="opacity-0 group-hover/node:opacity-100"
```

触屏 / trackpad 用户永远看不到删除入口。键盘用户不知道有删除能力。

### P2-5 Slash menu 仅 Outline 触发

- Outline 行编辑输入 `/` → 打开 SlashMenu
- Canvas 节点编辑输入 `/` → 不会触发,只会变成普通文本

两条路径行为不一致。

### P2-6 Undo/Redo 在 Events 列表页缺位

进入 event 详情才有 ⌘Z / ⇧⌘Z;Events 列表层的删除 / 归档 / 新建 event 不可撤销(只有 archive 的 5 秒 undo 弹窗)。

### P2-7 Events 列表无 filter

没有按 tag / 状态 / 时间筛选的输入框。3 个事件时没问题,30 个事件就难找。

### P2-8 Archived drawer 无搜索

Drawer 只能滚动浏览,不能搜索归档事件标题。

### P2-9 模板 seed 是 best-effort 静默失败(2026-09-28 复核修正)

> **修正**:模板 chip 并非死功能。EventsView.tsx:185-188:
> ```tsx
> if (newTemplateId && created.mindmapId) {
>   try {
>     await seedTemplate.mutateAsync({ eventId: created.id, mindmapId: created.mindmapId, templateId: newTemplateId, language });
>   } catch { /* template seeding is best-effort; the event itself exists */ }
> }
> ```
> 真实问题:**seed 失败被静默吞掉**,用户选了 SWOT 模板但拿到的可能是空白 canvas,零反馈;seed 成功也没有任何确认。是"信任"问题而非"死功能"。

---

## 5. 总结:这次体验差在哪

1. **两套视图打架**:Outline 列表 + Canvas 自由画布各自一套交互。点击行为、激活状态、菜单内容、键盘语义都不同 → cognitive load 翻倍。
2. **Canvas 节点激活不可靠**:主战场是 canvas,但点击节点不可信 → 用户被迫退到 Outline 操作。
3. **视觉信号 ≠ 状态**:浏览器 `:focus`(红框)与 React `activeNodeId`(toolbar)分离 → 用户感觉"点了没反应"。
4. **装饰 > 信息**:144px EventCover、Canvas 大空白、浮动 + 按钮、半透明加号菜单 → 视觉华丽,信息密度极低。
5. **键盘 shortcut 全局不一致**:⌘B 在 Event 详情页是 toggle outline,其他地方是 brainstorm 模式;Escape 在弹窗上关闭,在 Events 顶层跳回 Today → 一个键多个意思。
6. **More 菜单 / Template 芯片等"看起来有功能"但实际是空**:用户被引导去点,但点了啥都没有 → 信任崩塌。

---

## 6. 修复优先级建议

| 优先级 | 处理 | 理由 |
|--------|------|------|
| **P0-1** | ScheduleDatePopover / SlashMenu / 等子组件 Escape 加 `e.stopPropagation()`,或 App.tsx Escape 改用 `target.closest('[data-skip-escape-jump]')` 排除 | 一行修复,体验质变 |
| **P0-2** | Canvas 节点 onClick 不要被 didDragRef 误判;或者 `setActiveNodeId` 在 pointerup 时立刻同步一次 | 修复核心交互链路 |
| **P0-3** | root 节点的 More 菜单至少加一个 "Rename event" / "Archive event" / "Duplicate event" 操作 | 不允许空菜单 |
| **P1-1** | 浮动按钮改成 hover 才出 + 移到节点外侧;或节点 padding 加大避免重叠 | 减少误操作 |
| **P1-2** | toolbar 改 icon-only + tooltip,或 buttons flex-1 让 label 不换行 | 视觉清爽 |
| **P1-3** | 新节点初始位置 = 父节点右侧 + 自动 fit;Layout 算法减少空白 | 改善空间感 |
| **P1-4** | 新建 event 把 title 同步到 root.text;rename event 双向同步 | 一致性 |
| **P1-5** | 已 scheduled 节点 toolbar 按钮变 "Edit Task" / "Change date" | 区分状态 |
| **P1-6** | Outline 行点击 → Canvas 自动 scrollTo + 高亮;反之亦然 | 两套视图联动 |
| **P2** | 视时间做;其中 P2-3 / P2-9 性价比高 | 信息密度 + 移除死功能 |

---

## 7. 证据截图清单

| 文件 | 内容 |
|------|------|
| `events-list-view.png` | Events 列表(4 张卡片) |
| `events-canvas-view.png` | "报销" 详情:Outline + Canvas(root "得") |
| `events-canvas-clicked.png` | 点击 canvas 节点后状态 |
| `events-click-test.png` | 多次 click 测试 |
| `events-node-2clicks.png` | 节点双击测试 |
| `events-node-active.png` | 通过 Outline 点击后的 active 状态(对比) |
| `events-addchild.png` | toolbar Add child 弹框 |
| `events-after-add.png` | 添加子节点后 |
| `events-after-layout.png` | Layout 整理后 |
| `events-add-to-task.png` | Add to Task 打开 ScheduleDatePopover |
| `events-after-esc.png` | 按 Escape 后跳回 Today(关键证据) |
| `events-more-menu.png` | root More 弹空菜单(关键证据) |
| `events-outline-clicked.png` | 点 Outline 后 toolbar 切换 |
| `events-slash-menu.png` | Outline 行输入 `/` 打开 SlashMenu |
| `events-type-menu.png` | Type 选择器 |
| `events-fresh-detail.png` | 详情页初始态 |
| `events-after-cleanup.png` | 删除测试节点后(根仍是"得") |
| `events-new-form.png` | New Event 弹窗(template chips) |

> 截图都在 worktree 根目录 `/Users/fangchen/Baidu/GitHub/dailyflow/.claude/worktrees/continue-5bfa10/` 下,以 `events-*.png` 开头。

---

## 8. 给 review model 的指引

1. **重点关注 P0 三条** — 这是用户旅程核心,任何一条不修,新功能都白搭
2. **P1 选做**：P1-1 / P1-3 / P1-4 是"核心交互链路",P1-2 / P1-5 / P1-6 是"一致性"
3. **P2 是 polish**:P2-3(cover 信息密度)、P2-9(模板死功能)性价比高
4. **不要从 P2 开始改**:不要陷入"加 tooltip / 改 cover 颜色"这种不解决根本问题的优化

建议 next step:

- 先用 ExitPlanMode 列一个"P0-1 全局 Escape 修复"的最小 diff 给我审(我确认思路后再写)
- 然后 P0-2 的 Canvas 激活同步,建议先把 root cause(`didDragRef` / `setActiveNodeId` 顺序) 摸清
- P0-3 在 P0-1 修复后顺势补完即可