# DailyFlow 产品债务清单（Sprint 0 准备）

> **最后更新**: 2026-08-20
> **目的**: 在路演与产品宣传前，把所有"承诺了但没完全落地"或"半桶水"的功能摊开，按优先级排好偿债顺序。
> **范围**: 当前主分支 `codex/sprint1-roadshow-fixes`（基于 `v1.10.0` + sprint1 修复）。
> **方法**: 交叉对比 `docs/AI_NATIVE_PRODUCT_DEVELOPMENT_SPEC.md`（产品规范）、`docs/V2_FINAL_DELIVERY_REPORT.md`（自报完成度）、`README.md`（外部宣传）、`docs/EVENT_FIRST_PRODUCT_UPGRADE_PLAN.md`（最新方向）与实际代码/路由/UI。

## 0. 等级定义

| 等级 | 含义 | 偿债 SLA |
|---|---|---|
| **P0** | 路演里会被问、被点开演示、被截图贴进 README 的核心功能；现在要么不存在、要么跑不通 | Sprint 1（2 周内）必须修 |
| **P1** | 文档/规范承诺了但未实现，会被深挖的产品能力 | Sprint 2（1 个月内）补 |
| **P2** | 体验/工程债；不影响路演但下次版本前需要 | 季度内 |

---

## 1. P0 — 路演演示当天必须能跑

### DEBT-001 [P0] 会议录音的"说话人分离"在本地路径下是哑的
- **V2 承诺位置**: 16 页路演 Slide 06「会议闭环」承诺"录音 → 转写 → 说话人区分 → 决策/行动项提取 → Evidence 引用"
- **现状代码**:
  - `src/features/v2/notes/MeetingNotePanel.tsx:414` 本地路径强制 `diarize: false`
  - `docs/MEETING_AI_MODEL_GUIDE.md:38` 自己写"说话人分离：本地方案需另接 pyannote 等 diarization pipeline；未接入前 UI 不得声称本地可以识别人名或可靠区分多人"
- **缺口**: 路演讲"本地 whisper.cpp 不传音频"时，若用户追问"那说话人呢？"，答案是"我们不做"
- **建议偿债**: 短期（路演前）—— UI 文案改成"本地模式暂不区分说话人"；中期——接 pyannote-3.1 作为可选项（仍 0 上传）

### DEBT-002 [P0] 默认会议转写仍在走远程 Whisper，未默认走本地
- **V2 承诺位置**: 16 页路演 Slide 10「0 字节上传」承诺"会议录音默认本地 whisper.cpp"
- **现状代码**:
  - `src/features/v2/notes/MeetingNotePanel.tsx:403-422` 当 `selectedMode === 'local-endpoint'` 或 `local-managed` 才走本地；默认 mode 来自用户设置
  - `src/features/v2/notes/meetingTranscription.ts:30` 默认 `remoteModel: 'gpt-4o-transcribe-diarize'`（OpenAI），且 `remoteProvider: 'openai'`
  - `server/services/v2/noteMeetingCaptureService.ts:388-400` 远程 provider 仍会拼 `https://api.openai.com/v1/audio/transcriptions` FormData 上传
- **缺口**: 新装用户/未配置本地路径时，转写默认还是走 OpenAI 上传，违背"0 字节上传"承诺
- **建议偿债**: 默认 `mode='local-managed'`，未检测到 whisper-cli 时再降级到 `saved-only` 并提示"先配置本地路径"

### DEBT-003 [P0] "Memory 检索"只是字符串包含，不是语义检索
- **V2 承诺位置**: 16 页路演 Slide 07「Memory」承诺"承诺 → 决定 → 人员 → 项目跨域召回"
- **现状代码**: `server/services/v2/memoryService.ts:47-76` `addHit()` 函数内 `if (lower.includes(q)) score = scoreBase + 10`（line 56）+ token overlap 累分
- **缺口**: 问"为什么把上次会议推迟"时召回一堆无关 commit；无法做"按人/项目/决定类型聚合"
- **建议偿债**: 短期——加一个 `filters: { kind, projectId, personId, dateRange }` 参数；中期——接本地 sentence-transformers（仍 0 上传）

### DEBT-004 [P0] Agent 运行时是空壳 —— `startAgentRun` 创建记录但不执行
- **V2 承诺位置**: 16 页路演 Slide 04「工作闭环」/ Slide 06「会议 Agent」
- **现状代码**:
  - `server/services/v2/agentService.ts:42-63` `startAgentRun()` 写一条 `state: 'awaiting_agent_runtime'` 的 run（line 57）就返回
  - `server/routes/v2/index.ts:727-732` HTTP 路由 `POST /notes/:id/agents/run` 返回 202 with `status: 'awaiting_agent_runtime'`（line 732）
  - 当前 Agent manifest 只有 1 个 `MEETING_NOTES_AGENT` (`server/services/v2/agentService.ts:12-21`)
- **缺口**: 路演 demo 时点了"AI 生成会议纪要"按钮，结果只是写了个 pending run，不出 Proposal
- **建议偿债**: Sprint 1 写一个最小 worker，调现有 `buildProvider()` 完成 Meeting Notes Agent；Proposal 走现有 `createProposal()`

### DEBT-005 [P0] Calendar 三家全部 default-blocked，"日历同步"功能实际不可用
- **V2 承诺位置**: 16 页路演 Slide 11「多端 + 外部世界」承诺"Google/Outlook/飞书 日历聚合"
- **现状代码**:
  - `server/services/v2/calendarConnectors.ts:71-104` `GoogleCalendarConnector` (71-82) / `OutlookCalendarConnector` (84-93) / `FeishuCalendarConnector` (95-104) 三个 connector 的 `isAuthorized()` 全部返回 `{ ready: false, reason: 'external_authorization' }`
  - `server/routes/v2/index.ts:1462` `/calendar/sync` 返回 424 with `blockedBy: 'external_authorization'`
  - 唯一"真"路径是 `server/services/googleCalendarSync.ts` 的 v1 实现（OAuth + `/calendar/v3/calendars/primary/events`），但 v2 没接
- **缺口**: 路演里若点"同步日历"，要么报错要么返回空数组；Google 路径在 v2 中也没暴露
- **建议偿债**: Sprint 1 让 v2 调用 v1 `getGoogleCalendarEvents()`（已有完整 OAuth），Outlook/飞书留 TODO

### DEBT-006 [P0] v1 Google Calendar 没暴露在 v2 UI 里
- **V2 承诺位置**: 16 页路演 Slide 11
- **现状代码**: `server/services/googleCalendarSync.ts:161-185` `getGoogleCalendarEvents()` 已可用；但 v2 CalendarConnectors 只走 `blockedBy: external_authorization`
- **缺口**: v1 真能调通的 Google Calendar 在 v2 架构里被屏蔽了，等于"功能存在但 v2 用不到"
- **建议偿债**: 在 `GoogleCalendarConnector.fetchEvents()` 里 delegate 到 v1 + 复用 token

### DEBT-007 [P0] "0 字节上传"的承诺文案散落多处但行为不一致
- **V2 承诺位置**: 16 页路演 Slide 10 是核心宣示
- **现状代码**:
  - `src/features/v2/notes/MeetingNotePanel.tsx:124` "Local transcription only allows localhost/127.0.0.1 and will not upload audio externally" —— 只在 `local-endpoint` 模式生效
  - `src/features/v2/notes/MeetingNotePanel.tsx:97` "只录音不需要 AI 或 API Key。自动转写可使用 OpenAI、Deepgram、ElevenLabs 等远程服务（需要对应服务的 API Key），也可使用本地 whisper.cpp（无需 API Key）" —— 隐式承认有上传路径
  - README 顶部又写"DailyFlow 不托管你的模型凭据，也不会把本地 Markdown 工作区上传到 DailyFlow 服务" —— 这是事实，但并未承诺"零字节"
- **缺口**: 投资人说"零字节"，代码里多个远程路径就是会发字节
- **建议偿债**: 在 Settings 里加全局 "Privacy mode: Local only / Allow remote AI / Allow remote transcription" 开关，关闭时把远程按钮禁用

---

## 2. P1 — 文档承诺了但未实现的产品能力

### DEBT-008 [P1] "AI Chat 多会话 + 上下文挂载 + Prompt Library + Agent Skill" README 里全列了，但 Agent Skill 还没接入真正的运行时
- **V2 承诺位置**: README §"Inbox 与 AI 工作流"
- **现状代码**:
  - `src/components/SkillManager.tsx:99-320` 是个完整的 CRUD UI，支持 prompt / agent 两种类型
  - `src/utils/builtInSkills.ts:16-228` 6 个 built-in（18/49/76/111/142/178）（周报、任务拆解、会议记录、OKR、日报、DailyFlow KB）
  - `src/hooks/useAiSessionSend.ts:65-69` `resolveSlashCommand()` 只做字符串匹配，没有任何隔离的 Agent runtime
- **缺口**: "type: agent" 的 skill 被创建后只是另一种 prompt，没有真正的工具调用/隔离
- **建议偿债**: 文档降级为 "Agent Skill = 可注册的命令 + system prompt 片段"，不要暗示是 OpenAI Agent SDK 同款能力

### DEBT-009 [P1] "Memory"页面承诺的"决定 → 证据 → 下一步"链接在 MemoryView 里只显示纯文本
- **V2 承诺位置**: 16 页路演 Slide 07
- **现状代码**:
  - `server/services/v2/memoryService.ts:67-76` `addHit()` push 时附了 `sourceIds` / `evidenceIds`
  - `src/features/v2/memory/MemoryView.tsx` 渲染时未把 evidence 链接到 note/commitment 详情
- **缺口**: 点搜索结果不能跳到对应 commitment 看 Evidence 原句
- **建议偿债**: `MemoryView.tsx` 加 `onOpenEntity(kind, id)` 跳 `/commitments/:id` 或 `/notes/:id`

### DEBT-010 [P1] Phase 6 外部消息集成（Email/Slack/Feishu）全是空 stub
- **V2 承诺位置**: `docs/V2_FINAL_DELIVERY_REPORT.md:11` 标 ⚠️ "协议完成"
- **现状代码**:
  - `server/services/v2/messageConnectors.ts:58-86` Gmail/Outlook/Slack/Feishu Messages/Feishu Minutes 全部 `isAuthorized()` 返回 false
  - `server/services/v2/externalWriteService.ts:213-215` `blockedSendImpl()` 直接返回 `external_authorization` 错误
- **缺口**: 用户配置完 OAuth 也无法真发邮件/消息；UI 里这些按钮不应被默认显示为可用
- **建议偿债**: UI 在 Settings 列出 connectors 但 disabled 状态；v1 飞书 CLI 路径复用过来当 quick win

### DEBT-011 [P1] Phase 5 飞书日历 Sync 现在 v1/v2 双实现但 v2 路由 stub
- **V2 承诺位置**: README §"Calendar"承诺"外部日历连接器"
- **现状代码**:
  - `server/services/feishuSync.ts:869` `lastCalendarSyncAt = new Date().toISOString()` —— v1 真有
  - `server/services/v2/calendarConnectors.ts:96-103` `FeishuCalendarConnector.fetchEvents()` 直接返回 blocked
- **缺口**: 用户以为飞书日历可同步，其实只在 v1 路径里能跑，v2 同步走不通
- **建议偿债**: v2 connector delegate 到 v1 `getFeishuAgendaEvents()`

### DEBT-012 [P1] "Reviewer" 主动复盘只产生数据，不主动通知用户
- **V2 承诺位置**: README §"Memory 与 Review"
- **现状代码**:
  - `server/services/v2/reviewerService.ts` 实现了 `getStaleCommitments` / `getWaitingOverdue` / `weeklyReview`，但没有 cron / scheduler
  - `server/routes/v2/index.ts:1414` 暴露 `/reviewer/*` 端点供 UI 调用
  - UI 在 Today 里没有任何 "今日复盘建议" 主动 banner
- **缺口**: 用户得手动去 Settings 点 "Run weekly review" 才知道有 stale 项
- **建议偿债**: Today 启动时调一次 `getStaleCommitments`，Top 3 渲染为非阻塞横条

### DEBT-013 [P1] "Outcome close-loop + follow-up Proposal" 写进 `applyProposal` 了但 `detectFollowUps` 没找到入口
- **V2 承诺位置**: 16 页路演 Slide 08「可恢复闭环」
- **现状代码**:
  - `docs/V2_FINAL_DELIVERY_REPORT.md:39` 自报 "6702180 detectFollowUps 启发式 + close_loop Proposal" 完成
  - 当前 `server/services/v2/proposalService.ts` 接受 `kind: 'close_loop'`，但 grep 不到 `detectFollowUps` 实现（可能在 integration test fixture 里）
- **缺口**: completion 时不会主动生成 follow-up proposal；用户错过重要二次承诺
- **建议偿债**: 把 `detectFollowUps()` 单独抽成 `server/services/v2/followUpService.ts` 并补单元测试

### DEBT-014 [P1] "Today re-plan with natural language" 只在 spec 里，UI 没暴露
- **V2 承诺位置**: 16 页路演 Slide 08
- **现状代码**:
  - `docs/AI_NATIVE_PRODUCT_DEVELOPMENT_SPEC.md` 提 "下午只剩两小时" 自然语言 re-plan
  - `src/features/v2/inbox/InboxView.tsx` / Today UI 都没有 re-plan 输入框
- **缺口**: 路演里演示"下午只剩两小时，重新规划"无法演示
- **建议偿债**: Sprint 1 给 Today 加 `/replan` 命令输入框，调用已有 `createProposal({kind: 'replan'})`

### DEBT-015 [P1] "MCP 只读出口" 实现的是 JSON HTTP，不是真 MCP transport
- **V2 承诺位置**: `docs/AI_NATIVE_PRODUCT_DEVELOPMENT_SPEC.md:1767` 承诺
- **现状代码**:
  - `server/services/v2/exportService.ts:13-17` 自述 "MCP-shaped read-only API" 但只是 `listEntities` / `getEntity` / `search`
  - `server/routes/v2/index.ts:1599` 注释 "Export / MCP (Phase 9)" 但只是 HTTP 端点
- **缺口**: Claude/Cursor 等客户端没法通过 stdio / SSE 直接对接 DailyFlow 数据
- **建议偿债**: Sprint 2 用 `@modelcontextprotocol/sdk` 起一个 stdio 子进程，绑到 `listEntities`

### DEBT-016 [P1] Mobile Capture 协议在，但移动端 App 不在 Sprint 0 范围
- **V2 承诺位置**: `docs/AI_NATIVE_PRODUCT_DEVELOPMENT_SPEC.md:2043` "Mobile Capture 协议 + 实现"
- **现状代码**: `server/services/v2/mobileService.ts` 完整 + `issueMobileToken` / `authenticateMobileToken` / `mobileCapture` API 在
- **缺口**: 没有移动端 App 消费这套 API；token 过期机制有，但没人用
- **建议偿债**: 文档补"伴侣 App 暂未发布；API 已就绪，等待客户端"，避免被问"你们 App Store 啥时候上"

### DEBT-017 [P1] "Plugin 化 Connector SDK" 在 Phase 9 但未真正公开
- **V2 承诺位置**: `docs/V2_FINAL_DELIVERY_REPORT.md:11` 提到 "插件化 Connector SDK"
- **现状代码**: connector 都是 hard-coded class，没看到注册中心/动态加载
- **缺口**: 用户无法"装一个 Notion connector"
- **建议偿债**: 把 `ConnectorSDK` 文档化但延期到 v2.1

---

## 3. P2 — 工程/体验债

### DEBT-018 [P2] v1 和 v2 两套 API 共存，迁移路径未对用户披露
- **V2 承诺位置**: README §"API"
- **现状代码**:
  - `src/api/client.ts` (推荐路径) + `src/features/v2/api/client.ts` (旧路径，CONTEXT.md 警告不要改)
  - `server/routes/v2/index.ts` 挂载在 `/api/v2`，与 `/api/*` (v1) 并行
  - 用户工作区里 v1 daily notes + v2 SourceItems 共存，但 UI 主要展示 v1
- **缺口**: 用户不知道在用哪一套；feature flag `v2.enabled` 切换会带来什么
- **建议偿债**: Settings → "About" 显示当前激活的是 v1 还是 v2 数据栈；附迁移状态

### DEBT-019 [P2] builtInSkills 里 "DailyFlow KB" 在客户端只是 markdown 字符串，没接到 RAG
- **V2 承诺位置**: 自带 skill 列表里的 "DailyFlow KB"
- **现状代码**: `src/utils/builtInSkills.ts:178` 是个空 markdown frontmatter，正文描述了 KB 用途但没真去读产品文档
- **缺口**: 用户选了 KB skill 后 AI 还是不知道 DailyFlow 数据存在哪
- **建议偿债**: 把它接成"读取 docs/ + 当前 workspace 结构"的 system prompt

### DEBT-020 [P2] IPFS 备份仍然走 Pinata 第三方
- **V2 承诺位置**: README §"同步、备份与桌面体验" 提到 "Pinata IPFS 备份"
- **现状代码**:
  - `server/services/ipfs.ts:7-8` `PINATA_BASE = 'https://api.pinata.cloud'`
  - `src-tauri/tauri.conf.json:25` CSP 白名单包含 `https://api.pinata.cloud` 和 `https://gateway.pinata.cloud`
  - `backupToPinata()` 把整个工作区 base64 上传
- **缺口**: 走"备份路径"反而是会上传整个工作区的事实；如果用户以为开了 IPFS 备份就 0 上传，会失望
- **建议偿债**: 备份页面文案明确"此功能会将整个工作区上传到 Pinata 公共 IPFS 网关，关掉即 0 上传"

### DEBT-021 [P2] Tauri Updater 默认走 `github.com/frankfika/dailyflow/releases`
- **V2 承诺位置**: 16 页路演可能提到"自动更新"
- **现状代码**:
  - `src/api/updater.ts:29` `RELEASES_PAGE = 'https://github.com/frankfika/dailyflow/releases/latest'`
  - `src-tauri/tauri.conf.json:53` `endpoints` 指向上面
- **缺口**: 升级检查每次开 App 都会发请求到 GitHub；不致命但不是"0 字节"承诺的纯字面版本
- **建议偿债**: 在 docs/UPDATE_CHECKER.md 加 "App 启动时会 ping 一次 GitHub Releases 仅检查版本号"

### DEBT-022 [P2] 团队模式（leader / member）git timeline 已实装但 UI 入口偏弱
- **V2 承诺位置**: git log 显示 `feat(team): team collaboration with leader read-only view`
- **现状代码**: `src/components/TeamSettings.tsx` + `src/components/TeamView.tsx` 存在
- **缺口**: 团队功能对单人用户完全多余，但占 Settings 一整块
- **建议偿债**: 把团队设置折叠进 `Settings → Advanced`，不在主入口吹

### DEBT-023 [P2] GitHub README 自动改写 skill 已经加进 builtInSkills，但 CLI 入口未配
- **V2 承诺位置**: git log `3eec616 feat: add github-readme-pro skill and refresh Events section in README`
- **现状代码**: `.claude/skills/github-readme-pro/SKILL.md` 仅在 `.claude/` 内；`src/utils/builtInSkills.ts` 里没看到对应 entry
- **缺口**: 用户看不到这个 skill；和 v2 内置 Skill 列表脱节
- **建议偿债**: 决定走 Claude Code 还是 DailyFlow 内置，二选一，不要双轨

### DEBT-024 [P2] Events 视图承诺了"事件完成时提示是否结束 Event"，但 UI 未触发
- **V2 承诺位置**: `docs/EVENT_FIRST_PRODUCT_UPGRADE_PLAN.md` §4.4
- **现状代码**: `src/features/v2/events/EventsView.tsx` 没有看到 "Event 全部行动节点完成 → 提示关闭" 的逻辑
- **缺口**: 完成所有 actions 后 Event 仍为 active
- **建议偿债**: 在 useEvents hook 监听 progress=100，弹 confirm("Close event?")

### DEBT-025 [P2] "Top 3 Focus" 实验性产品建议未落地
- **V2 承诺位置**: `docs/EVENT_FIRST_PRODUCT_UPGRADE_PLAN.md §3.4` 提到"是否限制每天三件事...可在验证阶段观察后决定"
- **现状代码**: Today 只按 events 列出全部 action，没有 Top 3 折叠
- **缺口**: 演示时无法说明"用户主动选 Top 3"路径
- **建议偿债**: 推迟到 v2.1，先收集用户行为

### DEBT-026 [P2] Calendar 跨时区处理只在 spec 里提到
- **V2 承诺位置**: `server/services/v2/calendarConnectors.ts:33` "Timezone is preserved verbatim"
- **现状代码**: connector 没真正接 timezone，事件不显式带 `timezone` 字段透传
- **缺口**: 海外用户会发现事件时间错位
- **建议偿债**: Sprint 2 补 tz 字段

### DEBT-027 [P2] Tauri CSP 允许一堆第三方域，0 上传承诺靠用户信任
- **V2 承诺位置**: 16 页路演 Slide 10
- **现状代码**: `src-tauri/tauri.conf.json:25` connect-src 列出 13 个第三方域
- **缺口**: 没法在 UI 拦截这些域；用户得信任代码不乱发请求
- **建议偿债**: 在 Settings 暴露 "Network: Allow all / Local only" 切换；切换时回写到 connect-src（需要重启）

### DEBT-028 [P2] 文档里 `ROADSHOW_VS_PRODUCT_GAP.md` 和 `ROADSHOW_DECK_V2_CONTENT.md` 不在仓库
- **V2 承诺位置**: `.sprint1/CONTEXT.md` 引用这两个文件作为必读
- **现状代码**: 文件不存在；本清单本身是补这个缺口的临时产物
- **缺口**: 新人接手 sprint 时找不到权威 gap 分析
- **建议偿债**: 把本文件和 FEATURE_AUDIT.md 整合成 `docs/SPRINT1_GAP.md`，避免名字不一致

---

## 4. 总结

- **P0**: 7 条 —— 必须 Sprint 1 (2 周) 全部偿还，否则路演 live demo 翻车
- **P1**: 10 条 —— Sprint 2 (1 个月) 处理，决定 v2 是不是"真闭环"
- **P2**: 11 条 —— 体验/工程债，按季度节奏补

最大风险是 **DEBT-004 (Agent runtime 空壳)** + **DEBT-002 (默认仍走远程 Whisper)**：
前者让"AI Agent"卖点无法演示；后者让"0 字节上传"承诺变成营销口号。

下一步：在 Sprint 1 把这两条打掉，再挑 DEBT-005/006 让 Calendar 能 demo，最后做 DEBT-007 的 privacy mode 开关作为路演锚点。
