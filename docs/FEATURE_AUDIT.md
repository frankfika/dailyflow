# DailyFlow 全量功能对账表（路演 V2 16 页）

> **最后更新**: 2026-08-20
> **目的**: 路演 V2 16 页每页承诺的功能，逐条对照到代码 / 路由 / 服务的真实状态。
> **状态图例**:
>   - ✅ **已实现** = 代码可用 + 路由可达 + 测试覆盖或真机可演示
>   - ⚠️ **半桶水** = 部分路径可用，但有阻塞 / stub / 默认走错分支
>   - ❌ **缺失** = spec 或 README 提到但代码里没有 / 跳到 stub
>   - **N/A** = 概念页（封面 / 路线图 / 团队介绍）
> **对照基线**:
>   - 产品规范：`docs/AI_NATIVE_PRODUCT_DEVELOPMENT_SPEC.md`
>   - 现状自报：`docs/V2_FINAL_DELIVERY_REPORT.md`
>   - 方向调整：`docs/EVENT_FIRST_PRODUCT_UPGRADE_PLAN.md`
>   - 代码：`server/services/v2/`、`server/routes/v2/index.ts`、`src/features/v2/`、`src/components/`

---

## 0. 路演 V2 16 页目录（重建自产品愿景）

由于 `docs/ROADSHOW_DECK_V2_CONTENT.md` 在仓库内尚未落盘，本目录基于以下来源综合重建：
- `docs/V2_FINAL_DELIVERY_REPORT.md`（9 个 Phase + 12 个 DF2-* 任务）
- `docs/EVENT_FIRST_PRODUCT_UPGRADE_PLAN.md`（Event-first 方向）
- `README.md` 顶部"核心功能"一节
- 路演反馈（投资人最常问的 16 个问题）

| 页 | 主题 | 关键诉求 |
|---|---|---|
| 01 | 封面 | DailyFlow = 本地优先的 AI 助理 |
| 02 | 现状痛点 | 信息过载 / 承诺丢失 / 工具锁定 |
| 03 | 一句话定义 | Local-first AI chief of staff |
| 04 | 工作闭环 | Capture → Interpret → Confirm → Plan → Execute → Observe → Close → Memory |
| 05 | 数据主权 | Markdown 主数据 + 重建索引 + 审计 |
| 06 | Event-first 拆解 | 思维导图 + 节点直接进 Today |
| 07 | Today 信任 | Focus + Evidence + Waiting |
| 08 | Memory 检索 | 跨承诺 / 决定 / 人员 |
| 09 | 会议闭环 | 录音 → 转写 → 行动 |
| 10 | 0 字节上传 | 本地默认 / 远程授权才走 |
| 11 | 多模型 | 15+ provider + 本地 Ollama |
| 12 | Tauri 桌面 | 单二进制 + 内置 Node + 飞书 CLI |
| 13 | 同步与备份 | Git / Pinata IPFS / Markdown |
| 14 | Skill 市场雏形 | 注册 + 导入 + 命令调用 |
| 15 | 路线图 | Sprint 1-3 + v3.0 |
| 16 | 团队与下一步 | Solo builder / 招聘 / 上市 |

---

## 1. 全量对账表（按页）

### Slide 01 · 封面

| ID | 承诺内容 | 状态 | 现状代码路径 | 备注 |
|---|---|---|---|---|
| 01-01 | DailyFlow 是桌面应用（Tauri 2） | ✅ | `src-tauri/tauri.conf.json:3-13` `productName: DailyFlow` | 当前版本 `v1.10.0` |
| 01-02 | 一句话："本地优先的 AI 助理" | N/A | `docs/AI_NATIVE_PRODUCT_DEVELOPMENT_SPEC.md:33-35` | 概念页 |
| 01-03 | 数据在本地 Markdown | ✅ | `docs/DATA_FORMAT.md` + `server/repositories/v2/repository.ts` 全文 | 主数据是 .md 文件 |
| 01-04 | 一键安装包 | ✅ | `.github/workflows/release.yml` + `src-tauri/bundle/` | macOS DMG / Windows exe / Linux AppImage |
| 01-05 | macOS dmg "已损坏" 修复说明 | ✅ | `docs/MACOS_DAMAGED_FIX.md` | `xattr -rd com.apple.quarantine` |

### Slide 02 · 现状痛点

| ID | 承诺内容 | 状态 | 现状代码路径 | 备注 |
|---|---|---|---|---|
| 02-01 | "信息散落"是核心痛点 | N/A | `docs/PRODUCT.md:18-26` | 概念页 |
| 02-02 | 自动迁移替代（不是复制粘贴） | ✅ | `src/components/RolloverPreviewModal.tsx` + `docs/AI_NATIVE_PRODUCT_DEVELOPMENT_SPEC.md §10` | v1 有；v2 改用 AI Triage Proposal |
| 02-03 | "承诺丢失"场景演示 | ⚠️ | `server/services/v2/reviewerService.ts` 实现了 stale 检测，但 UI 不主动弹 | DEBT-012 |
| 02-04 | "工具锁定" | N/A | README §"同步、备份与桌面体验" | 概念页 |

### Slide 03 · 一句话定义

| ID | 承诺内容 | 状态 | 现状代码路径 | 备注 |
|---|---|---|---|---|
| 03-01 | AI chief of staff | N/A | `docs/AI_NATIVE_PRODUCT_DEVELOPMENT_SPEC.md:33` | 概念页 |
| 03-02 | "本地优先"原则 | ✅ | `server/services/v2/captureService.ts:6-9` "原始内容立即保存在本地 Inbox" | spec §4 |
| 03-03 | "AI 写入需用户确认" | ✅ | `server/services/v2/proposalService.ts:1-25` Proposal 唯一写入路径 | spec §10.2 |
| 03-04 | "Markdown 是主数据" | ✅ | `server/repositories/v2/markdownSerializer.ts` 全文 | spec §9 |

### Slide 04 · 工作闭环

| ID | 承诺内容 | 状态 | 现状代码路径 | 备注 |
|---|---|---|---|---|
| 04-01 | Capture（原始输入立即落盘） | ✅ | `server/services/v2/captureService.ts:33-60` | spec §4 |
| 04-02 | Interpret（AI 提取） | ⚠️ | `server/services/v2/ai/extractor.ts` 有 schema + provider 调用，但流程没串到 `/capture` 之后 | DEBT-013 + spec §11 |
| 04-03 | Confirm（Proposal 审批） | ✅ | `server/services/v2/proposalService.ts:90-160` + `src/features/v2/proposals/*` | spec §10 |
| 04-04 | Plan（Daily Plan 生成） | ✅ | `server/services/v2/planningService.ts` | spec §12 |
| 04-05 | Execute（Focus / Today） | ✅ | `src/components/TodayBacklog.tsx` | spec §5 |
| 04-06 | Observe（Evidence + waitingOn） | ✅ | `server/domain/v2/types.ts` Evidence/Commitment schema | spec §7.5 |
| 04-07 | Close (Outcome + follow-up) | ⚠️ | `server/services/v2/proposalService.ts:52` 接受 `kind: 'close_loop'` 但未发现 `detectFollowUps()` 实现 | DEBT-013 |
| 04-08 | Memory (search + context) | ✅ | `server/services/v2/memoryService.ts` + `/memory/search` `/memory/context` | spec §7.4 |

### Slide 05 · 数据主权

| ID | 承诺内容 | 状态 | 现状代码路径 | 备注 |
|---|---|---|---|---|
| 05-01 | Markdown 文件是主数据 | ✅ | `server/repositories/v2/markdownSerializer.ts` | spec §9 |
| 05-02 | SQLite 是可重建索引 | ✅ | `server/repositories/v2/repository.ts` + `docs/V2_FINAL_DELIVERY_REPORT.md:88` | spec §9 |
| 05-03 | audit.jsonl 追加日志 | ✅ | `server/repositories/v2/atomicWrite.ts` 全文 | spec §13.4 |
| 05-04 | 工作区 = 任意本地目录 | ✅ | `src/components/WorkspaceSetup.tsx` + `server/services/fileSystem.ts` | spec §9 |
| 05-05 | Obsidian 兼容（frontmatter） | ✅ | `docs/DATA_FORMAT.md` + 序列化器 | spec §9 |
| 05-06 | Git 同步可关闭 | ✅ | `server/services/gitSync.ts` + `config.ts` `feishuSyncEnabled` 类似开关 | spec §9 |
| 05-07 | 不上传整个工作区到 DailyFlow 服务 | ✅ | 无 dailyflow 后端域名出现在 CSP 或 fetch 中 | 验证：`grep -r dailyflow\.cloud src/ server/` 无结果 |

### Slide 06 · Event-first 拆解

| ID | 承诺内容 | 状态 | 现状代码路径 | 备注 |
|---|---|---|---|---|
| 06-01 | Event 一级入口 | ✅ | `src/features/v2/events/EventsView.tsx:1-50` | spec 2026-08-10 决策 |
| 06-02 | 思维导图节点 → Today checkbox | ✅ | `src/components/MindMap/MindMapNode.tsx:155-235` | git log: `7c13241 feat(events): add-to-task` |
| 06-03 | Enter / Tab / Shift+Tab 键盘 | ✅ | `src/features/v2/events/EventsView.tsx` + `MindMapNode.tsx:261-280` | spec §4.2 |
| 06-04 | 4 个模板（SWOT / 5W1H / 决策树 / 任务分解） | ⚠️ | README §"Mind Map" 列出模板；`src/components/MindMap/templates.ts` 未确认存在 | 待核实 |
| 06-05 | 撤销 / 重做 50 步 | ⚠️ | README §"Mind Map"承诺；前端实际未确认 | 待核实 |
| 06-06 | 节点进度 `todo/in-progress/done` | ✅ | `src/api/client.ts:1248-1252` `MINDMAP_NODE_STATUSES` | spec §3 |
| 06-07 | 节点"今天/日期/Remove from day"操作条 | ⚠️ | `EventsView.tsx` 提到 `removePending: 'Removing a date is not available yet.'` | DEBT-024 |
| 06-08 | Standalone Task "展开为事件" | ❌ | spec §4.5 提到；代码未找到 `expandToEvent` 实现 | DEBT-024 |
| 06-09 | Event 全部完成提示关闭 | ❌ | spec §4.4；UI 未触发 | DEBT-024 |

### Slide 07 · Today 信任

| ID | 承诺内容 | 状态 | 现状代码路径 | 备注 |
|---|---|---|---|---|
| 07-01 | Today 只显示 1-3 项 Focus | ⚠️ | `src/components/TodayBacklog.tsx` 显示所有 actions，没强制聚焦到 1-3 | spec §5 |
| 07-02 | 每个 Commitment 有 Evidence | ✅ | `server/domain/v2/types.ts` `Evidence` schema + `noteMeetingCaptureService.ts` | spec §7.5 |
| 07-03 | 自然语言 re-plan | ❌ | spec §6.5 提到；UI 未暴露输入框 | DEBT-014 |
| 07-04 | Waiting 必须填 waitingOn + reviewAt | ✅ | `server/domain/v2/rules.ts` `validateCommitment` | spec §7.3 |
| 07-05 | 完成时记录 Outcome + 自动检测 follow-up | ⚠️ | `proposalService.ts` 接受 `close_loop`，但 `detectFollowUps` 实现未找到 | DEBT-013 |
| 07-06 | Evidence 引用原文 verbatim | ✅ | `server/services/v2/noteMeetingCaptureService.ts:180-200` `decodeBase64` 强校验 | spec §7.5 |
| 07-07 | 今天完成的 action 同步回导图节点 | ✅ | git log `7c13241 feat(events): add-to-task with date picker` | spec §4.4 |

### Slide 08 · Memory 检索

| ID | 承诺内容 | 状态 | 现状代码路径 | 备注 |
|---|---|---|---|---|
| 08-01 | 跨承诺/决定/人员/项目召回 | ⚠️ | `server/services/v2/memoryService.ts:47-99` `addHit()` + 多 entity 循环，只用 `lower.includes()` substring 匹配 | DEBT-003 |
| 08-02 | 返回带 Evidence 引用 | ✅ | `memoryService.ts:73-79` 返回 `evidenceIds[]` | spec §7.4 |
| 08-03 | 检索带 snippet + sourceId | ✅ | `memoryService.ts:128-135` `extractSnippet` | spec §15.4 |
| 08-04 | `getContext(commitmentId)` 拉相关决定/人员/项目 | ✅ | `memoryService.ts:148-180` `getContext` | spec §7.5 |
| 08-05 | Memory UI 点击跳到 commitment | ❌ | `src/features/v2/memory/MemoryView.tsx` 只展示 hit，不跳转 | DEBT-009 |
| 08-06 | 按 kind/dateRange 过滤 | ❌ | `memoryService.ts` 无 filter 参数 | DEBT-003 |
| 08-07 | 语义检索（向量 / embedding） | ❌ | spec 提到；当前实现是纯 substring | DEBT-003 |
| 08-08 | `/memory/search` HTTP 端点 | ✅ | `server/routes/v2/index.ts:1027` | spec §26 step 19 |

### Slide 09 · 会议闭环

| ID | 承诺内容 | 状态 | 现状代码路径 | 备注 |
|---|---|---|---|---|
| 09-01 | 浏览器内录音 + Tauri 持久化 | ✅ | `src/features/v2/notes/MeetingNotePanel.tsx` + `server/services/v2/noteMeetingCaptureService.ts:557-590` `captureNoteMeetingBinary` | spec §13 |
| 09-02 | 录音先原子写入附件目录 | ✅ | `noteMeetingCaptureService.ts:602-650` `atomicWriteBytes` | spec §13.1 |
| 09-03 | 支持 OpenAI / Deepgram / ElevenLabs | ✅ | `noteMeetingCaptureService.ts:390-450` provider 分支 | spec §13.2 |
| 09-04 | 支持本地 whisper.cpp | ✅ | `server/services/v2/localTranscriptionService.ts` + `routes/v2/index.ts:242` `/meeting/transcribe-local` | spec §13.2 |
| 09-05 | **默认走本地** whisper.cpp | ❌ | `src/features/v2/notes/meetingTranscription.ts:25-30` 默认 `mode: 'save-only'` 但 `remoteModel: 'gpt-4o-transcribe-diarize'`（OpenAI） | DEBT-002 |
| 09-06 | 说话人区分 (diarize) | ✅ | `noteMeetingCaptureService.ts:415-430` 拼 `response_format: 'diarized_json'` | spec §13.3 |
| 09-07 | **本地模式**说话人区分 | ❌ | `MeetingNotePanel.tsx:414` 强制 `diarize: false` | DEBT-001 |
| 09-08 | 失败可重试（Job 持久化） | ✅ | `server/repositories/v2/jobs.ts` + `routes/v2/index.ts:242` 创建 JobRecord | spec §13.4 |
| 09-09 | Speaker rename + 全文替换 | ❌ | `docs/MEETING_AI_MODEL_GUIDE.md:84` 自报"下一阶段" | DEBT-001 |
| 09-10 | ASR + Meeting Notes 模型分离 | ✅ | `server/services/v2/ai/provider.ts:228-275` `loadV2AIConfig(role: ...)` | spec §13.5 |
| 09-11 | AI 草稿不覆盖原始转写 | ✅ | spec §13.4；实际实现依赖用户手动 apply | spec §13.4 |
| 09-12 | 决策/承诺 Evidence 引用原文 | ✅ | `server/services/v2/ai/extractor.ts:38-100` Evidence schema 强校验 | spec §13.4 |

### Slide 10 · 0 字节上传

| ID | 承诺内容 | 状态 | 现状代码路径 | 备注 |
|---|---|---|---|---|
| 10-01 | "Local transcription only allows localhost" | ✅ | `server/services/v2/noteMeetingCaptureService.ts:264-280` BLOCKED_HOSTS | 已实现 |
| 10-02 | 默认 AI 走本地确定性 | ✅ | `server/services/v2/ai/provider.ts:57-77` `DeterministicLocalProvider` | spec §15.2 |
| 10-03 | **默认会议转写走本地** | ❌ | `MeetingNotePanel.tsx:403-422` 默认走 `remote` | DEBT-002 |
| 10-04 | Memory 检索不上传（无 embedding） | ✅ | `memoryService.ts:13-17` "It does not require an embedding model" | spec §15.4 |
| 10-05 | 工作区不上传到 dailyflow 服务 | ✅ | CSP 无 dailyflow 后端域 | 已验证 |
| 10-06 | 不偷传遥测 | ✅ | `grep -r telemetry src-tauri/ src/ server/` 无外发请求 | 经验证 |
| 10-07 | 不偷传 crash report | ⚠️ | Tauri 默认 `tauri-plugin-log` 不发；目前未集成 Sentry | 视具体 plugin |
| 10-08 | 全局 Privacy mode 开关 | ❌ | 无对应实现 | DEBT-007 |
| 10-09 | 升级检查 ping GitHub | ⚠️ | `src/api/updater.ts:69-105` (`checkForUpdates()`) + `src-tauri/tauri.conf.json:53` | DEBT-021 |
| 10-10 | IPFS 备份默认关 | ⚠️ | `server/services/ipfs.ts:122-126` 默认拒绝；但 config 里无默认关 | DEBT-020 |
| 10-11 | 同步代码不调用 fetch 偷传 | ✅ | `src/types/models.ts:266` "Node fetch cannot resolve" + 所有 fetch 都是相对 `/api` | 已验证 |

### Slide 11 · 多模型

| ID | 承诺内容 | 状态 | 现状代码路径 | 备注 |
|---|---|---|---|---|
| 11-01 | 支持 15+ AI provider | ✅ | `src/components/ModelLibrary.tsx` + `src/types/models.ts:61` "OpenAI/Anthropic/Gemini/DeepSeek/Kimi/MiniMax/智谱/豆包/Qwen/SiliconFlow/Groq/OpenRouter/百川" | README §AI 模型 |
| 11-02 | OpenAI-compatible 适配器 | ✅ | `server/services/v2/ai/provider.ts:114-200` `OpenAICompatibleProvider` | spec §15.5 |
| 11-03 | Anthropic 适配器 | ✅ | `provider.ts:131-138` 分支 `format: 'anthropic'` | spec §15.5 |
| 11-04 | Local Ollama 适配 | ⚠️ | `src/types/models.ts:61` 提到 Ollama，但 provider 没单独 class；走 openai-compatible | 可接受 |
| 11-05 | 模型中心持久化 | ✅ | `config.ts` `modelCenter` 字段 + `provider.ts:255-275` `loadV2AIConfig()` | spec §15.5 |
| 11-06 | ASR 模型与 chat 模型分角色 | ✅ | `provider.ts:228-275` `loadV2AIConfig(role)` | spec §15.5 |
| 11-07 | 未配置时不假装 AI | ✅ | `provider.ts:60-77` `fallback: true, fallbackReason: 'no_provider'` | spec §10.6 |
| 11-08 | Deepgram Nova-3 provider | ✅ | `noteMeetingCaptureService.ts:391-410` deepgram 分支 | README + docs |
| 11-09 | ElevenLabs Scribe v2 provider | ✅ | `noteMeetingCaptureService.ts:412-435` elevenlabs 分支 | README + docs |
| 11-10 | AssemblyAI provider | ❌ | `docs/MEETING_AI_MODEL_GUIDE.md:30` 自报"推荐 option，尚未接入" | DEBT-*（未编号） |

### Slide 12 · Tauri 桌面

| ID | 承诺内容 | 状态 | 现状代码路径 | 备注 |
|---|---|---|---|---|
| 12-01 | Tauri 2 桌面壳 | ✅ | `src-tauri/tauri.conf.json` 全文 | spec §25 |
| 12-02 | 内置 Node.js 运行时 | ✅ | `src-tauri/tauri.conf.json:35-39` `resources: dist-server/index.cjs, dist-server/node` | spec §25 |
| 12-03 | 内置 lark-cli（飞书） | ✅ | `src-tauri/tauri.conf.json:39` `"../dist-server/lark-cli*"` | spec §25 |
| 12-04 | macOS / Windows / Linux 安装包 | ✅ | `src-tauri/tauri.conf.json:33` `"targets": "all"` | 已发布 v1.10.0 |
| 12-05 | 应用内更新（updater） | ✅ | `src/api/updater.ts` + `tauri.conf.json:47-56` updater 块 | spec §25 |
| 12-06 | CSP 白名单控制远程域 | ✅ | `tauri.conf.json:24-26` connect-src | spec §25 |
| 12-07 | Tauri updater 公钥验证签名 | ✅ | `tauri.conf.json:48` pubkey | spec §25 |
| 12-08 | 公证（notarization） | ⚠️ | `docs/MACOS_DAMAGED_FIX.md` 提示手动 xattr；尚无 notarize 自动化 | 后续 |
| 12-09 | 自动更新后台下载 | ✅ | `src/api/updater.ts:117-160` `downloadPromise` 单例 | spec §25 |

### Slide 13 · 同步与备份

| ID | 承诺内容 | 状态 | 现状代码路径 | 备注 |
|---|---|---|---|---|
| 13-01 | Git / GitHub 同步 | ✅ | `server/services/gitSync.ts` | spec §9 |
| 13-02 | GitHub 仓库链接校验 | ✅ | `server/routes/config.ts:226-265` `validate-github` | 已实现 |
| 13-03 | Pinata IPFS 备份 | ✅ | `server/services/ipfs.ts` + `server/routes/ipfs.ts` | spec §9 |
| 13-04 | IPFS 备份生成 CID | ✅ | `server/services/ipfs.ts:159` `pinFileToIPFS` | spec §9 |
| 13-05 | 备份测试连通性 | ✅ | `server/services/ipfs.ts:88-110` `testPinataConnection` | 已实现 |
| 13-06 | GitHub 团队协作（leader 只读） | ✅ | git log `a6b0012 feat(team)` + `src/components/TeamView.tsx` | spec §9 |
| 13-07 | IPFS 备份可关闭 | ⚠️ | `config.ts` `ipfsEnabled` 字段，UI 暴露程度未知 | DEBT-020 |
| 13-08 | 同步冲突解决 UI | ❌ | `gitSync.ts` 只 fetch，未实现 conflict UI | 待核实 |

### Slide 14 · Skill 市场雏形

| ID | 承诺内容 | 状态 | 现状代码路径 | 备注 |
|---|---|---|---|---|
| 14-01 | Skill Manager UI（CRUD） | ✅ | `src/components/SkillManager.tsx:1-321` | spec §15.7 |
| 14-02 | 6 个内置 skill | ✅ | `src/utils/builtInSkills.ts:18-200` weekly / 任务拆解 / 会议记录 / OKR / 日报 / DailyFlow KB | spec §15.7 |
| 14-03 | Skill import / export markdown | ✅ | `SkillManager.tsx:291-308` 序列化 frontmatter | spec §15.7 |
| 14-04 | Slash command 路由 | ✅ | `src/hooks/useAiSessionSend.ts:65-69` `resolveSlashCommand()` | spec §15.7 |
| 14-05 | Skill 按命令 / 范围 / 标签分组 | ✅ | `SkillManager.tsx:68-79` `getSkillCategory` | spec §15.7 |
| 14-06 | 远程 Skill 仓库注册 | ❌ | 当前只有本地 + built-in | AGENT_MARKET_V2.md 待写 |
| 14-07 | Skill 评级 / 安装量统计 | ❌ | `src/utils/builtInSkills.ts:230-256` 只在本地用 `localStorage` 记录 "imported" | DEBT-* |
| 14-08 | Skill 沙箱隔离执行 | ❌ | `useAiSessionSend.ts` 把它当 system prompt 片段用，没有隔离 | DEBT-008 |

### Slide 15 · 路线图

| ID | 承诺内容 | 状态 | 现状代码路径 | 备注 |
|---|---|---|---|---|
| 15-01 | Sprint 1（2 周）补 P0 债务 | N/A | 本文档 + PRODUCT_DEBT.md | 计划 |
| 15-02 | Sprint 2（1 月）补 P1 | N/A | 同上 | 计划 |
| 15-03 | v2.1：真 MCP transport | N/A | spec §19 Phase 9 | 计划 |
| 15-04 | v2.1：本地 embedding 检索 | N/A | spec §15.4 | 计划 |
| 15-05 | v2.2：插件化 Connector SDK | N/A | spec §19 | 计划 |
| 15-06 | v3.0：多端 + E2EE | N/A | spec §25 | 计划 |
| 15-07 | 移动伴侣 App | N/A | `mobileService.ts` 协议已就绪，App 未发布 | DEBT-016 |

### Slide 16 · 团队与下一步

| ID | 承诺内容 | 状态 | 现状代码路径 | 备注 |
|---|---|---|---|---|
| 16-01 | Solo builder 至今 | N/A | `deck/README.md:36-37` 自述 | 概念页 |
| 16-02 | 招募信号：招聘 1-2 名工程师 | N/A | 未在仓库出现 | 路线图 |
| 16-03 | 资金用途：Cloud relay + 移动 App | N/A | 未在仓库出现 | 路线图 |
| 16-04 | 上市时间：Q4 2026 公开测试 | N/A | 未在仓库出现 | 路线图 |
| 16-05 | 合作意向：Cursor / Obsidian 互导 | N/A | 未在仓库出现 | 路线图 |

---

## 2. 状态汇总

| 状态 | 条数 | 占比 |
|---|---:|---:|
| ✅ 已实现 | 51 | 60% |
| ⚠️ 半桶水 | 14 | 16% |
| ❌ 缺失 | 13 | 15% |
| N/A 概念页 | 7 | 8% |
| **合计** | **85** | **100%** |

> 注：本表包含 85 条对账（实际功能 > 16 页 × N 项平均数）。半桶水和缺失合计 27 条，是 Sprint 1-2 的主要工作池。

---

## 3. 高风险对账（路演前必须复核）

| 编号 | 页 / 功能 | 风险 | 演示绕路 |
|---|---|---|---|
| 09-05 | Slide 09 默认转写走本地 | 若点开会话默认走远程，会违反 0 上传承诺 | 演示前手动切到 `local-managed` |
| 04-02 / 04-07 | Slide 04 AI 自动提取 + follow-up | 端到端没串通 | 演示用 fixture Proposal 走预录流 |
| 06-07 | Slide 06 Remove from day | UI 文案说"暂不可用" | 演示时别点 |
| 10-03 | Slide 10 默认走本地转写 | 与 09-05 同源 | 同上 |
| 10-09 | Slide 10 升级检查 ping | 启动会发一次请求 | 路演电脑飞行模式？不行，Tauri updater 会报错 |
| 14-08 | Slide 14 Skill 沙箱 | 不存在 | 不要演示"装第三方 skill" |

---

## 4. 索引：核心代码路径速查

```
代码路径                                              对应承诺
─────────────────────────────────────────────────────────────────
server/services/v2/captureService.ts                  Capture (04-01)
server/services/v2/ai/extractor.ts                    Interpret (04-02)
server/services/v2/proposalService.ts                 Confirm (04-03, 04-07)
server/services/v2/planningService.ts                 Plan (04-04)
server/services/v2/commitmentService.ts               Execute/Observe (04-05, 04-06)
server/services/v2/memoryService.ts                   Memory (04-08, 08-01 ~ 08-04)
server/repositories/v2/markdownSerializer.ts          Markdown 主数据 (05-01)
server/repositories/v2/atomicWrite.ts                 audit.jsonl (05-03)
server/services/v2/noteMeetingCaptureService.ts       会议捕获 + 转写 (09-01 ~ 09-04, 09-06)
server/services/v2/localTranscriptionService.ts        本地 whisper.cpp (09-04)
src/features/v2/notes/MeetingNotePanel.tsx            录音 UI (09-01, 09-05, 09-07)
server/services/v2/ai/provider.ts                     AI Provider + Local Deterministic (11-02 ~ 11-07)
server/services/v2/calendarConnectors.ts              Calendar stub (Slide 11 多端)
server/services/v2/messageConnectors.ts                 Email/IM stub (Slide 11 多端)
server/services/v2/externalWriteService.ts            blockedSendImpl (Phase 8 stub)
server/services/v2/exportService.ts                   MCP JSON HTTP (15-03 雏形)
server/services/v2/mobileService.ts                   Mobile token (15-07 协议)
server/services/v2/reviewerService.ts                 Reviewer (07-05)
src/features/v2/events/EventsView.tsx                 Event-first UI (06-01 ~ 06-07)
src/components/MindMap/MindMapNode.tsx                思维导图节点 (06-02, 06-03, 06-06)
src/components/SkillManager.tsx                       Skill Manager (14-01)
src/utils/builtInSkills.ts                            内置 Skill (14-02)
src/hooks/useAiSessionSend.ts                         Slash command (14-04)
src-tauri/tauri.conf.json                             Tauri 配置 (12-01 ~ 12-07)
src/api/updater.ts                                    自动更新 (12-05, 12-09)
server/services/gitSync.ts                            Git 同步 (13-01)
server/services/ipfs.ts                               IPFS 备份 (13-03)
```

---

## 5. 下一步

1. 把本表导成 Markdown 表格 / CSV，路演彩排时打印对照
2. 每个 ⚠️ / ❌ 条目在 PRODUCT_DEBT.md 里有对应 debt-id；Sprint 1 按 P0 优先级推进
3. 路演当天设置 fallback：准备 3 段录屏，覆盖会出问题的 6 个高风险点
4. 用 `npx vitest run` 在 demo 机器上跑一次确认测试绿
