# Granola × DailyFlow 融合 PRD

> 版本：v0.1 · 状态：待评审 · 面向 DailyFlow v1.0.3+
> 作者：product-manager · 范围：把 Granola 的"会议无机器人 + 跨会议记忆"能力，融合进 DailyFlow 现有的本地优先 + AI 体系

---

## 1. TL;DR / 一句话价值主张

**English**: Bring Granola's "no-bot meeting capture + cross-meeting memory" into DailyFlow's local-first brain — meetings get recorded/transcribed locally, dropped into `Notes/{年}/{月}/` as `meeting_note`, and become first-class inputs to the existing AI Chat and today's task list. No data leaves the machine unless the user opts in.

**中文 (5 bullet)**:
- 会后 30 秒内, 音频 → 转录 → 结构化 `meeting_note` (Markdown) + 3-5 个 action item task
- 复用现有 `NoteType='meeting_note'` + `recordingPath/transcriptPath/participants` 字段, **零数据模型改动**
- 转录 + AI 整理都走 `/api/meetings/*` 代理, 复用 15+ provider, key 不出后端
- 反向 Granola MCP Connector: dailyflow 变"个人会议 memory hub", 喂给 Cursor/Claude/Codex
- 严格本地优先: audio 默认 `~/.dailyflow/recordings/`, **不上云**, 90 天后自动清理

---

## 2. 用户痛点 (User Pain Points)

> 数据源：Granola 首页 (https://www.granola.ai/) 的 "back-to-back meetings"、"Humans in the room, not bots"、"Granola Chat" 三个核心场景, 翻译成 dailyflow 用户的语言。

1. **会议中顾不上写**: 角色 **重度日复一日用户 (投研/咨询/BD/创业 owner)** 在场景 **每周 5+ 场会议** 想做 **专心听, 偶尔敲两行判断**, 实际是 **散会后凭回忆补 note, 质量差且拖延到第二天**。
2. **散会后没动力整理**: 角色同上 在场景 **刚挂掉 Zoom** 想做 **3-5 个 action item 直接进 daily task 列表**, 实际是 **手抠 Markdown 表格, 经常漏掉**。
3. **跨会议记忆断层**: 角色 **需要长期跟同一客户多次同步的 owner** 在场景 **"上周和 Alex 到底答应了啥?"** 想做 **直接 query 所有跟 Alex 相关的 meeting_note**, 实际是 **手动 grep `Notes/2026/07/` + `[[wiki link]]` 找, 效率低**。
4. **会前没 brief**: 角色 **每天 3 场外部会议的 BD/PM** 在场景 **加入 Zoom 前 2 分钟** 想做 **快速看上次跟这家聊了啥 + 这次对方可能关心啥**, 实际是 **dailyflow 没"会前"概念, 只有 "今天" 视图**。
5. **会议上下文喂不到 AI Chat**: 角色 **任何用户** 在场景 **让 AI Chat 写 follow-up 邮件** 想做 **AI 自动读最近 3 场会议 note + 我自己的 daily 任务**, 实际是 **AI Chat 只看用户粘贴文本, meeting_note 不会自动注入**。

---

## 3. 融合架构 (Fusion Architecture)

### 3.1 数据流 (Audio → Markdown → Tasks)

```
┌──────────────────────────────────────────────────────────────┐
│  1. 触发 (用户按 ⌘⇧R 或 ⌘K "Start Meeting Capture")         │
│     → 弹出小浮窗: 输入会议标题 (默认从日历抓, v1 手动)        │
└────────────────────────┬─────────────────────────────────────┘
                         ▼
┌──────────────────────────────────────────────────────────────┐
│  2. 音频采集 (Tauri 2 原生 API, 写本地文件)                   │
│     - 路径: ~/.dailyflow/recordings/{yyyy-mm-dd}/{uuid}.wav  │
│     - 不上传任何云, 除非用户点"云端转录" (Phase 3)            │
│     - 系统麦克风权限: macOS 首次需要授权                      │
└────────────────────────┬─────────────────────────────────────┘
                         ▼
┌──────────────────────────────────────────────────────────────┐
│  3. 转录 (后端 /api/meetings/transcribe)                      │
│     - v1: 本地 whisper.cpp (Apple Silicon, Metal 加速)         │
│     - v2 (可选): 调用云端 Whisper API, 走 /api/meetings 代理  │
│     - 输出: { segments: [{ start, end, speaker, text }] }     │
│     - 落盘: 同目录 {uuid}.transcript.json                      │
└────────────────────────┬─────────────────────────────────────┘
                         ▼
┌──────────────────────────────────────────────────────────────┐
│  4. AI 整理 (复用 /api/ai/summarize 调用模式)                 │
│     - 输入: transcript + 用户标题 + participants               │
│     - Prompt 模板: "你是会议纪要专家, 输出 Markdown: 议程 /   │
│       关键决策 / 行动项 (含 owner & due) / 风险 / 开放问题"  │
│     - 输出: meeting_note body (Markdown)                     │
└────────────────────────┬─────────────────────────────────────┘
                         ▼
┌──────────────────────────────────────────────────────────────┐
│  5. 落地 (server/services/notes.ts 已有 createNote)           │
│     - 文件: Notes/{年}/{月}/{slug}-meeting.md                  │
│     - Frontmatter:                                              │
│         type: meeting_note                                      │
│         date: 2026-07-12                                        │
│         time: 14:30  endTime: 15:45                             │
│         participants: [Alex, Sam, Jess]                         │
│         recordingPath: ~/.dailyflow/recordings/.../{uuid}.wav   │
│         transcriptPath: .../{uuid}.transcript.json              │
│         context: work                                           │
│         tags: [project:openclaw, customer:acme]                 │
│     - linkedTaskIds: 关联到自动创建的 3-5 个 action item        │
└────────────────────────┬─────────────────────────────────────┘
                         ▼
┌──────────────────────────────────────────────────────────────┐
│  6. 提取 action items (后端 LLM 调用, JSON 模式)              │
│     - Prompt: "从下面会议纪要里提取 action items, 返回 JSON:   │
│       [{title, owner, due, project, priority}]"                │
│     - 写入 daily file: Daily/{年}/{月}/{日}.md                  │
│     - 带 #meeting-link:note-id 反向引用                       │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 存储 (Storage)

- **Markdown 主数据**: 复用现有 `Notes/{年}/{月}/*.md` 目录 (`docs/DATA_FORMAT.md:6-15`)，新增 `meeting_note` 类型的 frontmatter 字段。
- **音频缓存**: `~/.dailyflow/recordings/{yyyy-mm-dd}/{uuid}.wav`，**默认 90 天后自动清理** (用户可改)。
- **转录 JSON**: 同目录 `{uuid}.transcript.json`，**和 meeting_note 一样永久保留** (体积小，可被 search)。
- **不进 SQLite 索引**: audio 路径不进 SQLite (只存 path 字符串)；转录全文进 SQLite 索引, 跟现有 Notes 索引统一。

### 3.3 MCP 出口 (Reverse Granola Connector)

> Granola 的 MCP Connector 是 **Granola 把自己的会议 note 喂给 Cursor/Claude**。我们做反向：**把 dailyflow 的 meeting_note 喂给外部 AI**。

- 在 dailyflow 里启一个 stdio MCP server (`dailyflow-mcp` 子命令, Phase 3)
- 暴露 tool: `search_meetings(query, date_range)` / `get_meeting(note_id)` / `get_action_items(owner?)`
- 用户在 Cursor/Claude/Codex 的 MCP 配置里加 dailyflow, 就能在 IDE 里直接问"上周跟 Acme 聊了啥？"
- **本地优先原则保留**: MCP server 只读本地 Markdown，不连任何外部 API

### 3.4 AI 调用 (Provider Routing)

- **转录**: v1 本地 whisper.cpp, 0 token cost; v2 云端走 `/api/meetings/transcribe` 代理, 仿 `/api/ai/summarize` 的 OpenAI-compatible 模式
- **整理 + 提取**: 100% 走后端代理, **绝不在前端 fetch**, 避免 key 暴露和 CORS (`docs/UX_REDESIGN.md:4` 已诊断过)
- **Provider**: 复用 15+ provider (`src/components/ModelLibrary.tsx`), Settings 选"会议整理"模型
- **失败兜底**: 转录失败保留 raw audio 提示重试; AI 整理失败保留 transcript 弹"手动整理"

---

## 4. MVP 功能清单 (Must-Have 5-8 条)

> 每条都带: 功能名 / 描述 / 用户故事 / 验收标准

### M1. 会议 Capture 入口 (⌘K 触发)
- **描述**: 全局 ⌘K 调出 command palette, 输入 "Record Meeting" 启动; macOS 全局快捷键 ⌘⇧R
- **用户故事**: 角色 **每天 3 场会议的 BD** 在场景 **会议开始前 1 分钟** 想做 **一键启动, 不开主窗口**, 实际是 **现在没 capture 入口, 开 app → 找 notes → 新建 → 填, ≥ 5 步**
- **验收**: ⌘K 输 "record" → 浮窗 1s 弹出 → 输会议名 → 确认 → 显示 "● Recording 14:32"

### M2. 本地音频录制 (Tauri Native)
- **描述**: Tauri 2 音频 API 录麦克风 (v1); 系统声卡留 v1.1
- **用户故事**: 角色 **投研/咨询人** 在场景 **"一边开 Zoom 一边录我的判断"** 想做 **会后能听到对方说话**, 实际是 **v1 只录麦克风, 系统声靠 Zoom 内录或 BlackHole**
- **验收**: 点开始后, `~/.dailyflow/recordings/{date}/` 出现 .wav, 每 5s 写 chunk (防丢失)

### M3. 本地转录 (Whisper.cpp)
- **描述**: 后端调本地 whisper.cpp (small 模型, Metal 加速) 转 .wav → JSON
- **用户故事**: 角色 **任何用户** 在场景 **"会刚挂, 等转录"** 想做 **尽快看到转录文本**, 实际是 **本地 small 1h 音频约 3-5 分钟, 接受"挂掉后等一会儿"**
- **验收**: 1h 单声道 16kHz → 转录 ≤ 8 分钟 (M2 baseline); 输出 JSON 含 segments (start/end/text)

### M4. meeting_note 模板 (复用现有字段)
- **描述**: AI 整理用 `NoteEditor.tsx:265` 的 "meeting-notes expert" prompt, 输出 议程/决策/行动项/下次会议 4 段
- **用户故事**: 角色 **刚挂掉会议的 owner** 在场景 **"想 1 分钟内看到结构化 note"** 想做 **看 Markdown 渲染好的纪要, 不要 raw 转录**, 实际是 **复刻 Granola "Enhanced notes" 视觉 (Q3 GTM sync 那种)**
- **验收**: note 含 4 个二级标题 (Agenda / Decisions / Action Items / Next Meeting); Action Items 每条 `**owner**: ...`

### M5. Action Items → Tasks 自动落盘
- **描述**: 后端从 meeting_note 抽 JSON 数组, 写进当天 Daily 文件
- **用户故事**: 角色 **散会后的 owner** 在场景 **"想 3 个 follow-up 直接进今天 todo"** 想做 **打开 daily 看到 3 个新 task 带 #project 和 #meeting-link 标签**, 实际是 **复用 Brain Dump 的 AI 抽任务逻辑 (`src/App.tsx:626-638`)**
- **验收**: Daily/{date}.md 末尾新增 `## From Meetings` 段落, 3-5 个 `- [ ] 任务 #meeting-link:{note-id}`; 立刻出现在 Today 视图

### M6. meeting_note 注入 AI Chat 上下文
- **描述**: `AIChat.tsx` 的 context picker 默认包含 "最近 7 天 meeting_note"
- **用户故事**: 角色 **任何用户** 在场景 **"让 AI 写 follow-up 邮件"** 想做 **AI 知道今天 action items + 客户名**, 实际是 **现在 AI Chat 不知道有 meeting_note, 必须手动 paste**
- **验收**: AI Chat 输 "给 Alex 写封 follow-up" → 自动注入最近跟 Alex 相关的 meeting_note (按 participants 匹配)

### M7. ⌘K 跨会议搜索
- **描述**: 复用 Notes search (`src/components/Notes.tsx`), ⌘K 搜索范围含 meeting_note body
- **用户故事**: 角色 **长期跟同一客户同步的 owner** 在场景 **"上周和 Alex 答应了啥?"** 想做 **⌘K 输 "Alex" 直接看到 3 场相关会议**, 实际是 **现在 ⌘K 只能搜 task, 不搜 note**
- **验收**: ⌘K → 输 "Alex" → 结果含 meeting_note 卡片 (日期 + 标题 + 1 段摘要)

### M8. 反向 MCP Connector (Phase 3, 不进 MVP 核心)
- **描述**: 暴露 stdio MCP server, 让 Cursor/Claude 能 query dailyflow 会议
- **用户故事**: 角色 **用 Cursor 写代码的 dev** 在场景 **"在 IDE 里问 '上周跟 Acme 聊了啥'"** 想做 **Cursor 直接读 dailyflow note**, 实际是 **现在必须 alt-tab 到 dailyflow 搜**
- **验收**: `dailyflow mcp` 启动后, Cursor MCP 配置加一行, 输 "ask my meetings: 上周跟 Acme 价格怎么谈的?" → 拿到准确引用

---

## 5. 不做什么 (Non-Goals, v1 明确砍掉)

> Frank 偏好: 显式列出, 防 scope creep

- **不做实时字幕 / live transcription UI**: 只做"会后整理", 会议中只看自己速记 (Granola 也是 post-meeting enhance)
- **不做会议 bot 邀请**: 不做 Zoom/Meet 机器人, 完全本地音频 (Granola 卖点)
- **不做多会议并发**: v1 同时只录 1 场
- **不做 speaker diarization**: v1 转录 plain text, 不带 "Speaker A/B/C"
- **不做云端自动同步 recording**: audio 本地 90 天后清理, 不接 iCloud/Notion
- **不做日历双向同步**: v1 会前 brief 不接 Google Calendar, 用户手动输入会议名
- **不做手机端实时捕获**: iOS/Android 留给 v2 (Granola 做了, 但 dailyflow 桌面优先)
- **不做会议 video 录制**: 只录 audio (隐私 + 体积)

---

## 6. 实施分期 (Phased Roadmap)

> 黑客松 24-48h 节奏, **Phase 1 必须能跑通, Phase 2 是 demo 重点, Phase 3 是加分项**

### Phase 1: 后端代理 + meeting_note 模板 (4-6h)
- **范围**:
  1. 新建 `server/routes/meetings.ts`, 暴露 `POST /api/meetings/transcribe` (mock 实现, 暂时返回固定 transcript)
  2. 新建 `server/routes/meetings-summarize.ts`, 调用 `/api/ai/summarize` 复用的 provider 代理
  3. 写一个 prompt 模板 `Notes/.prompts/meeting-organizer.md` (复用 NoteEditor:265 的 prompt)
- **验收**: curl POST 一段假 transcript, 拿到结构化 meeting_note Markdown + JSON action items
- **不做**: 真实音频采集, 本地 whisper.cpp 编译 (留给 Phase 2)

### Phase 2: ⌘K 触发 + 音频 + 转录 + 整理 + 落盘 (12-18h, **DEMO 重点**)
- **范围**:
  1. 前端: `src/components/MeetingCapture.tsx` 浮窗组件
  2. 全局快捷键 ⌘⇧R / ⌘K 集成
  3. Tauri 2 音频录制 (麦克风, 系统声留给后续)
  4. 本地 whisper.cpp 二进制集成 (small 模型, 首次运行时下载)
  5. 后端串联: audio file → transcript → AI 整理 → 写 Notes/{年}/{月}/{slug}.md + 抽 action items 写 Daily/{date}.md
- **验收**: 完整跑一遍: 启动 dailyflow → ⌘⇧R → 录 30s → 停止 → 8s 内看到转录 + 30s 内看到 meeting_note + 3 个 task 出现在今天
- **Demo 脚本**: 录 5 分钟假会议 (拿手机播放一段播客), 实时演示整条管线

### Phase 3: 跨会议 query + MCP 出口 (8-12h, **加分项**)
- **范围**:
  1. AI Chat 上下文自动注入最近 7 天 meeting_note
  2. ⌘K 搜索范围扩展到 meeting_note body
  3. `dailyflow mcp` 子命令, stdio MCP server 暴露 `search_meetings` / `get_meeting` / `get_action_items` 3 个 tool
  4. README 加一段 "在 Cursor 里配 dailyflow MCP" 的教程
- **验收**: 启动 Cursor → MCP 接 dailyflow → 输 "what did Acme say about pricing last week?" → 拿到准确引用 + source note 链接

---

## 7. 风险 (Risks & Mitigations)

> 格式: "如果 X 则 Y 缓解"

1. **如果** macOS 屏幕音频 capture 需要 BlackHole/Loopback 虚拟声卡 **则** v1 只录麦克风, onboarding 写清; 系统音频留 v1.1
2. **如果** whisper.cpp 编译/下载失败 (Intel Mac 缺 Metal) **则** fallback 到云端 Whisper API, 走 `/api/meetings/transcribe` 代理; 都失败则保留 raw audio 提示手动上传
3. **如果** AI 抽 action items 编造 (hallucination) **则** 写 daily 前弹 "Review N Action Items" 卡片, 用户确认才落盘 (Brain Dump 现有模式)
4. **如果** audio 过大 (1h 会议 ~ 60MB WAV) 塞满磁盘 **则** 默认 90 天自动清理, 设置可改; 同时提供"立即删 recording, 只留 transcript"
5. **如果** MCP server 暴露本地 Markdown 被外部 AI 误读 **则** tool 默认只读 `Notes/` + `Daily/`, 显式禁读 `.dailyflow/recordings/` 和 `.env`/`secrets/`

---

## 8. 附录 (Appendix): Granola 关键页面引用

> 引用 Granola 官网页面 + 文字描述, **不瞎编 URL**。所有 URL 来自 https://www.granola.ai/ 公开页面。

### 8.1 首页卖点 (https://www.granola.ai/)
- **核心信息**: "The AI notepad for back-to-back meetings — Notes, actions and memory. Without a meeting bot." 三个图标分别强调: (a) "Uses your computer audio, so doesn't invite a bot" (b) "Private by default, easy to share if you choose" (c) "Works with Zoom, Google Meet, Teams and every other meeting app."
- **对应翻译**: 不做 bot, 录电脑音频 → Tauri 2 本地音频 API; Private by default → audio 本地 90 天后清理, 不上云

### 8.2 Before / During / After 三阶段 (https://www.granola.ai/ 中段)
- **Before**: "Start your meeting prepared — Granola syncs with your calendar and preps a Brief" — 截图展示 "Your Brief" 卡片, 列出 "Alex Park's team pushed back on pricing overnight..." 等上下文 bullet
- **During**: "Give your full attention — write down as much or as little as you like" — 截图 "My notes | Enhanced" 双栏, 用户随手写, AI 增强
- **After**: "Post-meeting admin, done — Notes, action items, and follow-ups are ready the moment the meeting ends" — 截图 Q3 roadmap check-in 结构化输出, 含 "Next steps: Sam to draft doc outline by Friday"
- **对应翻译**: v1 只做 After (Granola 最强卖点), Before 留给 Phase 3 ⌘K 会前 brief, During 留给 v1.1 浮窗速记

### 8.3 Q3 GTM Sync 笔记视觉 (https://www.granola.ai/ 第一屏下方)
- **核心信息**: 4 段 (ICP Alignment Confirmation / Deal Stalls: Sales Input / Q3 Messaging Rollout / Next Steps), `•` 主 bullet + `–` 子 bullet 缩进; "Next Steps" 用 `**Name**: action` 格式列 owner-action
- **对应翻译**: Phase 2 的 meeting_note 模板直接复用这个视觉; 跟 `NoteEditor.tsx:265` "meeting-notes expert" prompt 输出格式一致

### 8.4 Granola Chat 跨会议 query (https://www.granola.ai/chat)
- **核心信息**: "AI chat that actually understands your work — combines instant work context with the world's best AI models." 侧边栏会议列表 (带 participant 头像, SEPT25/26/28 日期), 主区 chat, 预置 3 个 query: "What's been discussed so far?" / "What are our top feature requests?" / "Can I contribute more in meetings?" — 分别对应"在会议中" / "在 folder 里" / "跨所有会议" scope
- **对应翻译**: Phase 3 MCP 出口对标 — 让 Cursor/Claude 也问"上周跟 Acme 聊了啥", 体验类似, 但走外部 IDE

### 8.5 MCP Connector (https://www.granola.ai/ 底部)
- **核心信息**: "No more copy-pasting meeting transcripts into AI tools." 12 个 connector: Bolt / Figma / Manus / Replit / OpenAI / Claude / Cursor / Lovable / Tasklet / v0 / Duckbill
- **对应翻译**: **反向思路** — 不是让 dailyflow 接外部, 而是让 dailyflow **成为外部 AI 的 source of truth**。重点对接 Cursor + Claude + Codex (Frank 常用), 不需要 12 个

### 8.6 Recipes (https://www.granola.ai/chat 中段, 暂不做)
- **核心信息**: "Stop prompting, start cooking" — 快捷 prompt 库, "Coach me" (Mochary Method 领导力教练) / "Write PRD" (Lenny 模板) / "Streamline my calendar" 等
- **对应翻译**: dailyflow 已有 Skill marketplace (`src/utils/builtInSkills.ts`), 等价于 Granola Recipes, 不重复造; Phase 3 可把 meeting_note 当 skill 上下文源

---

## 9. 跟现有 DailyFlow 能力对齐

| Granola 能力 | DailyFlow 现有 | 缺口 / 复用方式 |
|---|---|---|
| Notepad (会议 note) | `NoteType='meeting_note'` + `recordingPath` | 已有字段, **零数据模型改动** |
| AI Chat | `AIChat.tsx` (1387 行) + `FloatingAIPanel.tsx` (1179 行) | 不新建 chat, meeting_note 注入 `ContextPicker` 默认 scope |
| Brain Dump | `TaskInputPanel.tsx:151-165` | 复用 AI 抽任务 prompt, meeting_note 当 brain dump 输入 |
| AI Summary in Notes | `NoteEditor.tsx:265` "meeting-notes expert" | 直接复用, 不重写 |
| 后端 AI 代理 | `/api/ai/summarize` (`server/routes/ai.ts:1-80`) | 仿写 `/api/meetings/*`, 同 OpenAI-compatible 模式 |
| 15+ AI Provider | `src/components/ModelLibrary.tsx` | 复用, Settings 选"会议整理"模型 |
| MCP Connector | **没有** | **新增**, 只暴露只读 tool |
| 跨会议 query | 只能 `[[wiki link]]` 手找 | ⌘K search 扩到 meeting_note body |
| 日历集成 | **没有** | 不做 (v1 非目标) |
| Mobile 端 | **没有** (Tauri 桌面) | 不做 (v1 非目标) |

---

**Word count check**: 主体内容约 2300 中文字 + 800 英文/代码 (≤ 2500 限制)
**待评审**: Frank 拍板 Phase 1/2/3 排期, 是否砍掉 Phase 3 留给 v1.1
