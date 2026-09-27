# Event UX 整改方案与计划 — 2026-09-28

> 输入:[EVENT_UX_REVIEW.md](EVENT_UX_REVIEW.md)(含 2 处复核修正)。
> 目标:最佳用户体验 —— 主链路可信、键盘语义一致、两套视图联动、UI 不承诺做不到的事。

---

## 一、结果分析:17 条发现 → 5 个系统性根因

修 17 条不如修 5 个根因。每条发现都能归到下面之一:

| # | 根因 | 覆盖的发现 | 一句话 |
|---|------|-----------|--------|
| R1 | **键盘语义没有分层** | P0-1 | Escape 一键多义:全局兜底直接切 tab,任何子组件没拦住冒泡就误伤。关闭弹窗/返回上一层/切 tab 三件事被压进一个键,由"谁抢到事件"决定结果 |
| R2 | **激活机制依赖脆弱的 click/drag 时序** | P0-2 | `didDragRef` + `setTimeout(0)` 重置 + click 事件链,三层时序耦合,任何一环错位就"点了没反应" |
| R3 | **UI 承诺了不存在/不可知的能力** | P0-3、P1-5(修正)、P2-9(修正) | 空 More 菜单、状态样式的可点按钮、静默失败的模板 seed —— 都是"看起来有功能,点了没下文",直接摧毁信任 |
| R4 | **空间模型失控** | P1-3、P1-1 | 新节点位置与父节点无关、Layout 后大片空白、浮动按钮和节点本体抢热区 —— 用户建立不起"我在哪、新东西会出现在哪"的空间预期 |
| R5 | **两套视图 + 两套视觉语言** | P1-2、P1-6、P1-4、P2-1、P2-2 | Outline 与 Canvas 各自激活、互不联动;root 文本 ≠ 标题;按钮换行参差 —— 同一份数据两种心智模型 |

修完 R1+R2(canvas 主链路可信)+ R3(信任),体验差的主体感受就会消失;R4、R5 决定"好用"到"愉悦"。

---

## 二、整改方案

### Sprint 1 — 修根因 R1/R2/R3(P0,1.5 天)

#### T1. Escape 语义分层(R1 → P0-1)

**设计**:Escape 按层级消费,每层只做一件事:

```
popover/弹层 → 关闭自己(拦住冒泡)
event 详情   → 返回事件列表
events 列表  → 返回 Today
```

**改动(3 处,全是小 diff)**:

1. `src/App.tsx:1132-1134` — 删掉 `else if (activeTab === 'events') setActiveTab('today')`。全局层不再替 Events 做决定(全局只保留 activeOverlay 一层)。
2. `EventsView.tsx` — 新增 window keydown handler:有 `selectedEventId` → `setSelectedEventId(null)`(即 onBack);没有 → 调用新 prop `onExitToToday`(App 传入 `() => setActiveTab('today')`)。
3. `ScheduleDatePopover.tsx:84` — `onKey` 里加 `e.stopPropagation()`(顺带 `preventDefault()`)。它挂在 document 冒泡阶段,先于 window 上的 handler 触发,能拦住。

SlashMenu 已有 stopPropagation,不用动;EventOutline/EventCanvas 内部的 Escape 处理回归时一并扫一遍。

**验收**:
- ScheduleDatePopover 开着按 Esc → 只关 popover,不离开详情页
- 详情页(无弹层)按 Esc → 回事件列表
- 列表页按 Esc → 回 Today
- 其它 tab 的 Escape/overlay 行为不回归(activeOverlay 分支还在)

#### T2. Canvas 激活改 pointerup 判定(R2 → P0-2)

**先花 30 分钟定位**:dev server 上对节点 click 加 console.log,确认是 didDragRef 时序、inline edit 吞 click、还是 pointerup 没回到同一元素(click 不触发)。

**设计**(不管上面查到哪种,这个方向都更稳):激活不再依赖 click 事件,在 `handlePointerUp`(EventCanvas.tsx:662)里判定:

```tsx
if (!didDragRef.current) {
  onActivate(d.nodeId);   // 位移 < 4px = 点击,直接激活
}
```

位移阈值复用现有的 4px(`EventCanvas.tsx:649`)。node onClick 的 didDragRef guard 保留作兜底或直接删掉(改完跑 E2E 决定)。

**验收**:点 canvas 任意节点 body(非浮动按钮区)→ toolbar 立即切到该节点的完整按钮组;拖拽节点 → 不触发激活。

#### T3. More 菜单不再弹空壳(R3 → P0-3)

**改动**:`EventCanvas.tsx:1024` — 当 `isRootActive && !activeNode.execution` 时整个 More 按钮不渲染(隐藏 > 空壳)。root 的重命名/归档能力本来就在顶栏(title 可编辑 + More 菜单),不缺入口。

**验收**:root active 时无 More 按钮;非 root 出现 Delete;有 execution 出现 Remove from day。

---

### Sprint 2 — 核心交互连贯(R4/R5,3-4 天)

#### T4. 浮动按钮让出热区(P1-1)
- delete/add-child/add-sibling 三个浮动按钮:`opacity-0` → `group-hover/node + group-active/node + focus-visible` 才显示(对齐项目里删除按钮的既有模式)
- 按钮外移出节点边缘 2-4px(`-right-3` 再外移),节点本体加右侧 padding
- 验收:点节点右 1/3 区域激活的是节点,不是 add child

#### T5. Toolbar 不换行(P1-2)
- 按钮加 `whitespace-nowrap`;容器放不下时改 icon-only + tooltip(优先:nowrap,最省)
- 统一按钮最小宽度,消除 "Type" vs "Add to Task" 参差
- 验收:1280px 下五个按钮单行、不换行、等距

#### T6. 新节点落位 + 自动对焦(P1-3)
- 新子节点初始位置 = 父节点右侧偏移(现有子节点数 × 行高错开),不再落到右下角
- 创建后 canvas `scrollIntoView` 该节点 + 1s 脉冲高亮(复用 T9 的高亮 token)
- Layout 改进:按子树宽度分层布局,消除一列挤右边 + 大空白(若现有算法是简单分列,这是局部改动)
- 验收:连续 Add child 三次,三个节点紧邻父节点且全部可见

#### T7. Root 文本与事件标题一致(P1-4)
- **先验证**(0.5h):新建一个 event,看 root 初始文本是否 = 标题。我测的"报销→得"可能是历史脏数据
- 若确是 bug:create 流程把 root.text 初始化为 title;rename 事件标题时同步 root
- 绑定策略:root 默认跟随标题;用户在 canvas 手动编辑过 root 后解除绑定(编辑即脱离,符合直觉)
- 验收:新建"测试事件" → root 显示"测试事件";改标题 → root 跟着变(未手动编辑过时)

#### T8. scheduled 状态可点性(P1-5 修正版)
- 已 scheduled 的按钮文案:`Task · 09-15 ▾`(加下拉箭头 affordance)+ title 提示"修改日期"
- 验收:用户能看出这个"标签"能点、点了能改期

#### T9. Outline ↔ Canvas 双向联动(P1-6)
- 点 Outline 行 → Canvas `scrollIntoView` 对应节点 + 同色高亮 1s
- 点 Canvas 节点 → Outline 对应行 `scrollIntoView` + 高亮
- 两侧高亮用同一个 token 色(active/brand),强化"这是同一个东西"
- 验收:在 Outline 点第 5 行,Canvas 平滑滚到对应节点并闪烁;反向同样

---

### Sprint 3 — 信任与信息密度(R3 收尾 + 高性价比 P2,2 天)

#### T10. 模板 seed 不再静默(P2-9 修正版)
- `seedTemplate` 失败 → toast 报错(项目已有 notice 机制 `onNotice`);成功 → 无需打扰(打开详情自然看到)
- 顺手在 dev 环境验证一次模板内容真的 seed 出来了
- 验收:选 SWOT 创建 → 详情里有 SWOT 骨架;若 seed 失败有 toast

#### T11. Cover 承载信息(P2-3)
- 144px 封面 overlay 加:节点数 / 任务数(`statNodes`/`statTasks` copy 已存在,数据现成)/ 最近更新时间
- 验收:不点进详情就能横向比较 4 个事件的规模

#### T12. 触屏可见删除入口(P2-4)
- `group-hover` opacity 改为 hover + `group-active` + `focus-visible` 都显示
- 验收:手指按下(模拟 active)即见删除按钮

#### T13. 图标可理解(P2-1)
- 顶栏全部 icon 按钮补 `title` / `aria-label`(一行一个,机械活)

#### T14. 列表搜索(P2-7 + P2-8)
- Events 列表头部一个搜索框过滤标题;Archived drawer 复用同一输入组件过滤归档标题
- 不做 tag/状态复合筛选(YAGNI,30 个事件内用不上)

---

### 明确不做(这轮 out of scope)

- **重写 Canvas 为 xyflow/react-flow**:自研 1042 行能跑,重写是大风险大周期,和 UX 修复解耦
- **⌘B 全局语义重构**:events 内 toggle outline 是合理的局部覆盖(已有注释说明),不动
- **Canvas 内 slash menu**:等 Outline 侧验证高频后再加,避免双入口双实现
- **Events 列表 undo 栈**:archive 已有 5 秒 undo,delete 有 confirm,够用

---

## 三、验证计划(每条 T 的 DoD)

| 项 | 要求 |
|----|------|
| 单元测试 | 每个非平凡逻辑改动(escape 分层、pointerup 判定、落位算法)留一个最小 runnable check |
| E2E | 改 UI 前先扫 `e2e/` 里 stale testid,改完本地跑相关 spec(Vitest 不覆盖 E2E — 已知 gap) |
| Escape 回归 | T1 完成后手测其它 tab:overlay 开着 Esc 只关 overlay;Today 页 Esc 无副作用 |
| Today 投影 | 涉及 Add to Task / schedule 的改动(T8)必须失效 today-items 查询,否则新任务不出现(已知坑) |
| 删除/归档回归 | T3/T12 涉及删除入口的,删除后要 GET 列表验证真的没了(已知 ghost shell 坑) |
| 双语 | 所有新文案 en/zh 双份(项目惯例,COPY 对象) |

---

## 四、时间表

| Sprint | 内容 | 工时 | 出口条件 |
|--------|------|------|----------|
| S1 | T1-T3(三个 P0) | 1.5 天 | canvas 主链路可信:点得动、Esc 不跳、无空壳 |
| S2 | T4-T9(P1) | 3-4 天 | 核心体验连贯:热区不误触、不换行、落位准、两视图联动 |
| S3 | T10-T14(P2 高性价比) | 2 天 | 信任感:无静默失败;信息密度:封面有料 |
| 合计 | | **6.5-7.5 天** | |

依赖关系:S1 无依赖先行;T6 依赖 T9 的高亮 token(先做 T9 也行);T7 有 0.5h 验证前置,若验证发现是脏数据不是 bug,直接降级为数据清理 + 标题 rename 同步。

---

## 五、给执行者的顺序建议

1. T1(Escape)先做 —— diff 最小、体感提升最大、且给后续测试扫清干扰(Esc 不再乱跳,E2E 稳定)
2. T2 激活问题先 log 30 分钟再动手 —— 根因没确认前别改 pointerup,万一真凶是 inline edit 吞 click,改了也白改
3. T3 顺手 5 分钟
4. S2 按 T9 → T6 → T4 → T5 → T7 → T8(先联动,后视觉)
5. S3 独立,可并行/延后,不影响前两程
