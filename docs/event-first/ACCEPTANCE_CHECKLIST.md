# EFP Acceptance Checklist — 发布门验收清单

> 依据：`docs/EVENT_FIRST_IMPLEMENTATION_RUNBOOK.md` 第 7–9 节  
> 每项 Gate 通过 = 左侧必跑命令 PASS + 右侧数据证据成立 + 审查者签字。

---

## Gate A（EFP-004 后）—— Event adapter/API 在 flag 关闭时不影响旧 UI

### Required commands
- [ ] `npx vitest run server/services/__tests__/eventAdapter.test.ts server/services/__tests__/mindmap-v2.test.ts`
- [ ] `npx vitest run server/routes/__tests__/events.test.ts server/routes/__tests__/mindmapNodeTask.test.ts server/routes/__tests__/tasksSpace.test.ts`
- [ ] `npx vitest run src/hooks/useEvents.test.tsx src/hooks/useMindMapActions.test.tsx`
- [ ] `npm run lint`
- [ ] `npm run build`

### Acceptance evidence
- [ ] adapter 读函数对 fixture 文件前后内容 sha256 相等（零写盘）
- [ ] event facade create/update 只白名单映射 title/status/context/tags
- [ ] old topic-spaces, mindmaps, tasks routes 契约未变，原测试全过
- [ ] hooks 未复用 topicSpaces query key，失效范围严格按 §5
- [ ] `config.v2.eventFirst === false` 时：Sidebar、App render、Today 完全等价于 baseline

### Data proof
- [ ] 旧 fixture：v1 map / v2 map / linked task / standalone task / orphan 均可通过 adapter 读取
- [ ] useEvents 与旧 useTopicSpaces 在 cache 层隔离，一个清空不影响另一个

### Signature
Gate A reviewer: ______________  
Date: ______________

---

## Gate B（EFP-105 后）—— 可创建、浏览、编辑 Event，但旧入口仍可回退

### Required commands
- [ ] `npx vitest run src/components/Events/EventsIndex.test.tsx`
- [ ] `npx vitest run src/components/Events/EventDetail.test.tsx src/components/MindMap/MindMapView.autosave.test.tsx src/components/MindMap/MindMapView.mirror.test.tsx`
- [ ] `npx vitest run src/components/Events/EventNodeActions.test.tsx src/components/MindMap/NodeContextMenu.test.tsx`
- [ ] `npx playwright test e2e/events.spec.ts e2e/event-detail-visual.spec.ts --workers=1`
- [ ] `npm test`
- [ ] `npm run build`

### Acceptance evidence
- [ ] flag true：EventsIndex 四态 (loading/error/empty/data) + 创建自动打开
- [ ] flag true：EventDetail 首屏只含顶栏 + 单一画布，无 TopicTabs / Map List / view toggle
- [ ] flag true：event mode 节点操作条零出现 Promote / Link / Unlink / Tag kind
- [ ] flag false：Sidebar 导航、MindMapView legacy mode、smoke.spec 原场景全过
- [ ] 响应式 1440×900 / 1024×768 / 390×844 下 Back + 核心节点操作可见

### Data proof
- [ ] 创建 Event → 添加三层节点 → 刷新后完全恢复（对比节点 id/text/position）
- [ ] integrity missingMap / orphan / duplicate 场景 UI 不崩溃，只显示 info
- [ ] legacy 模式下 NodeContextMenu、promote/link 原测试 100% 保留

### Signature
Gate B reviewer: ______________  
Date: ______________

---

## Gate C（EFP-205 后）—— Node → Today → Complete 闭环幂等

### Required commands
- [ ] `npx vitest run server/services/__tests__/eventExecution.test.ts server/services/__tests__/mindmap-v2.test.ts server/routes/__tests__/mindmapNodeTask.test.ts server/routes/__tests__/tasksSpace.test.ts`
- [ ] `npx vitest run server/routes/__tests__/eventExecution.test.ts`
- [ ] `npx vitest run server/services/__tests__/today.test.ts server/routes/__tests__/today.test.ts`
- [ ] `npx vitest run src/hooks/useEvents.test.tsx src/hooks/useTodayItems.test.tsx src/__tests__/components/TodayBacklog.test.tsx`
- [ ] `npx playwright test e2e/event-today-loop.spec.ts --workers=1`
- [ ] `npm test`
- [ ] `npm run build`

### Acceptance evidence
- [ ] 并发 schedule 同一 node：最终只有 1 个 taskId，重试不复制
- [ ] reschedule 跨日期：同一 taskId 从旧 date 行消失，出现在新 date；两文件 hash 校验
- [ ] unschedule：保留 node，只清 taskId/taskDate/planOrder；TopicSpace.taskIds 移除
- [ ] Today 完成 Event item → 回 Event 节点状态同步；reopen 同样一致
- [ ] progress 只统计存在 execution 的非 root 节点；total=0 显示“尚未安排”，不显示 0%
- [ ] orphan derived task 在 Today 降级 standalone，不丢失、不报错

### Data proof
- [ ] taskId 不复制证据：对同一 node 连续 5 次 schedule → 所有 date 文件中该 taskId 出现次数 = 1
- [ ] 写失败补偿：构造 parser write error → 补偿后 node + space + daily note 内容与写前相同

### Signature
Gate C reviewer: ______________  
Date: ______________

---

## Gate D（EFP-303 后）—— Today 完成极简化，Standalone 可升级

### Required commands
- [ ] `npx vitest run src/__tests__/components/TodayBacklog.test.tsx`
- [ ] `npx vitest run server/services/__tests__/taskEventConversion.test.ts`
- [ ] `npx playwright test e2e/smoke.spec.ts e2e/event-today-loop.spec.ts e2e/standalone-to-event.spec.ts --workers=1`
- [ ] `npm run lint`

### Acceptance evidence
- [ ] eventFirst Today 首屏无 Focus panel / planningGroups / 关联计划 / 标签墙
- [ ] Today item 主行只含 checkbox / title / event breadcrumb / 必要 deadline 状态
- [ ] Standalone 快速创建 5 秒路径；不要求用户选择 space/map/kind
- [ ] standalone → Event：标题/描述/标签/日期全量保留；Undo 10 分钟窗口内回原
- [ ] 转换失败：只留下 archived 外壳 + repair record，不出现半 Task 半 Event 状态

### Data proof
- [ ] conversion 记录路径：`<workspace>/.dailyflow/migrations/task-event-conversions/<conversionId>.json`
- [ ] undo 过期或 Event 被用户编辑后返回 409，不覆盖新内容
- [ ] detail drawer 关闭时主列表零额外重渲染（useMemo/key 验证）

### Signature
Gate D reviewer: ______________  
Date: ______________

---

## Gate E（EFP-402 后）—— 标签不增加默认视觉噪声，AI 失败不阻塞

### Required commands
- [ ] `npx vitest run server/services/__tests__/eventTags.test.ts server/services/__tests__/eventAdapter.test.ts server/services/__tests__/today.test.ts`
- [ ] `npx vitest run server/services/__tests__/eventTagSuggestions.test.ts`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] （核心 E2E 在 AI off 下重跑：手动切 env，跑 smoke / events / event-today-loop / standalone-to-event）

### Acceptance evidence
- [ ] 改 Event manualTags → 所有后代节点 effectiveTags 读取即时变化，节点文件批量改写数 = 0
- [ ] 过滤词（today/overdue/completed/work/life 及中文等价）不进入 effectiveTags
- [ ] AI provider 缺 key / 超时 / 非 JSON：Today / Events 主流程正常，suggestions=[]
- [ ] 用户 rejected 的 tag 进入 suppression，后续 create/suggest 不再出现
- [ ] Today 主行默认隐藏 tags，仅 Today header 次级 popover / detail drawer 可见

### Data proof
- [ ] suppression 持久化：TopicSpace/MindMapNode 写回 suppressedAiTags，重启后仍生效
- [ ] AI tag suggestion 单次 0–2 个，value 长度 1–24，confidence 合法

### Signature
Gate E reviewer: ______________  
Date: ______________

---

## Gate F（EFP-503 后）—— 迁移报告通过，才默认开启并移除旧入口

### Required commands
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npx playwright test --workers=1`
- [ ] `npm run build`
- [ ] `npm run migrate:event-first -- --verify`
- [ ] `git diff --check`
- [ ] 人工抽样 60 秒任务：创建 Event → 三层拆解 → 安排今天 → Today 完成 → 回 Event

### Acceptance evidence
- [ ] 全量单测 + E2E 通过；与 baseline 相比测试数量只增不减
- [ ] migration dry-run → apply → verify 三阶段：
  - [ ] dry-run 前后 workspace 根目录文件系统 tree + content hash 相同
  - [ ] apply 前未传 `--backup-dir` 被拒绝
  - [ ] apply 重复运行幂等：第二次 actions 数 = 0
  - [ ] backup 目录 manifest + sha256 可验证还原
- [ ] orphan / duplicate 计数在 report 与 adapter 读取之间差 ≤ 可解释清单
- [ ] 产品文案 rg 结果零出现：`Topic Space|Promote|Link to existing|Unlink|关联已有 Task|转为待办|解除绑定`
- [ ] 默认导航只看到 Today / Events / Notes / Ask AI；More = Calendar / Memory / Settings
- [ ] `config.v2.eventFirst = false` 仍能打开旧入口和旧数据（回退窗口一个版本）

### Data proof
- [ ] Migration report JSON 已存盘，schemaVersion=1，counts 可解释，issues 列全
- [ ] 60 秒人工任务全程无报错，Event 节点 + Today task 状态一致

### Signature
Gate F reviewer: ______________  
Date: ______________

---

## 跨 Gate 不变量（每 Gate 都必查）

- [ ] 旧 `/api/topic-spaces`、`/api/mindmaps`、`/api/tasks` 在 EFP-502 前响应契约 100% 兼容
- [ ] `.dailyflow/mindmaps/`、Topic Space Markdown 路径、Daily 文件路径从未被本任务重命名或移动
- [ ] React 组件没有直接复制 Task/MindMap 写逻辑；所有写走 route/service
- [ ] Event-derived Task 的写路径全部经 EventExecutionService（grep 验证）
- [ ] 没有用 `queryClient.clear()` 或失效 Notes / AI / Calendar 无关缓存
- [ ] 没有新增渐变/重阴影/全屏动画；尊重 `prefers-reduced-motion`
- [ ] 核心交互有键盘等价路径
- [ ] 未知 JSON 字段 / Markdown marker 读时保留、写时原封不动
