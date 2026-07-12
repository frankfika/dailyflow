# Changelog

All notable changes to DailyFlow will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Pending for next release

TBD.

## [1.0.4] - 2026-07-12

### Added
- **Granola × DailyFlow Phase 2 — 真实音频 + 转录 + 落盘完整管线** (PRD `docs/review/granola-fusion-spec.md` §6.2, 全部 6 个 M 落地)
  - **M1 ⌘⇧R 全局快捷键** — `src/App.tsx` 全局 keydown listener 触发 MeetingCapture modal; 拦下浏览器 reload 默认行为, 提示 dailyflow 会议快捷键; 同时 `⌘K` palette 加 "Record Meeting" 入口
  - **M2 本地音频录制 (Web API, 不破 src-tauri/)** — `MeetingCapture.tsx` 用 `navigator.mediaDevices.getUserMedia({audio:true})` 拿麦克风 + `MediaRecorder` 录到 Blob; macOS 首次自动弹权限框
  - **M3 server 端 OpenAI-compatible Whisper 转录** — `server/routes/meetings.ts` `POST /api/meetings/transcribe` 异步: 接 base64 audio → FormData → 转发到 provider 的 OpenAI-compatible `/audio/transcriptions` 端点; 返回 `jobId` 客户端轮询 status; 1h 音频 (~80MB base64) 走流式不爆内存; 转录失败保留 raw audio 让用户重试; 复用现有 15+ provider 配置, 不新加依赖
  - **M5 Action Items → Tasks 自动落盘** — `POST /api/meetings/extract-actions` (新 endpoint) 用 LLM 抽 action items JSON `[{title, owner, due, project, priority}]`; 客户端弹 "Review N Action Items" 卡片, 用户确认才落盘; 走 `tasksApi.create`, source_date = 今天, 带 `#meeting-link:{note-id}` tag
  - **M6 meeting_note 自动注入 AI Chat 上下文** — `ContextPicker.tsx` "会议" tab 默认 checked 包含最近 7 天 `type === 'meeting_note'` 的笔记; 顶部加 "Auto-include: 7 days" toggle
  - **M7 ⌘K 跨会议搜索** — 复用 Notes 搜索逻辑, 扩展到 `type === 'meeting_note'` 全文; 结果卡: 日期 + 标题 + 1 段摘要 + 点开进 Notes
- **R3 refactor — 抽 useAiSession 公共 hook 消 AIChat/FloatingAIPanel 90% 重复**
  - **统一状态共享** — `src/hooks/useAiSessionStore.ts` (113 行) 模块级 store, 跨 AIChat / FloatingAIPanel 实例同步 (修两个 session 列表互不可见 bug)
  - **send pipeline 抽离** — `src/hooks/useAiSessionSend.ts` (215 行) 持有 `isStreaming` + `abortRef` + `sendMessage` / `stopMessage` / `retryMessage`; 主 hook 减到 246 行 (< 400 上限)
  - **context builders 抽离** — `src/hooks/aiContextBuilders.ts` (108 行) 持有 `buildContextText` / `buildAutoContextText`; 主 hook 暴露稳定 callback (useCallback 包裹, React.memo 安全)
  - **API 兼容** — 父组件 props 不变; `localStorage['df_ai_chat_store']` 兼容, 老用户 session 不丢
  - **行数** — `AIChat.tsx` 1370 → 489, `FloatingAIPanel.tsx` 1133 → 473, 总 -1570 行重复

### Changed
- `package.json` version → `1.0.4`
- `src-tauri/tauri.conf.json` version → `1.0.4`

### Verified
- `npm run lint` ✓ (tsc --noEmit 0 错误)
- `npm run build` ✓ (vite build 2.85s, 2373 modules)
- 行数达标: AIChat 489 / FloatingAIPanel 473 / useAiSession 246 — 都 < plan 上限
- 禁区干净: UX_REDESIGN / ROADMAP / PRODUCT / src-tauri (config 除外) / .harness / .mavis / README 都没动

## [1.0.3] - 2026-07-12

### Added
- **Granola × DailyFlow Phase 1** — 后端代理 + 前端 MeetingCapture 入口
  - `server/routes/meetings.ts` (278 行) — `POST /api/meetings/transcribe` (mock) + `POST /api/meetings/summarize` (LLM 代理), 仿 `/api/ai/summarize` OpenAI-compatible 模式, SSRF 防护 (BLOCKED_HOSTS + `isBlockedHost` + `resolveUrl`), API key 不出服务器
  - `src/components/MeetingCapture.tsx` (488 行) — 4 步 modal (输入会议标题/参会人 → 粘贴 transcript → mock 转录 → LLM 整理 → 预览 Markdown → 保存 meeting_note + 抽 action items 转 task)
  - `src/components/ContextPicker.tsx` 第 5 个 tab "会议" — 列出 `type === 'meeting_note'` 最近笔记
  - `meetingsApi` (`src/api/client.ts:832`) — `transcribe` / `summarize` 类型化客户端

### Fixed
- **Notes 搜索漏字段** — `src/components/Notes.tsx:232-238` 搜索从 title/body/mentions 扩展到 meeting_note 的 `time`/`endTime`/`participants`
- **@mention 不支持连字符/点** — `src/components/NoteCard.tsx:35` regex 字符类扩展, 兼容 `@jean-luc.picard`
- **AI Summary 错误信息裸抛** — 抽 `src/utils/aiErrorMessage.ts` 共享 `getFriendlyAiErrorMessage`, Notes.tsx 接入, 不再 `console.error` + 裸 `err.message`
- **DailyNoteCards 缺 meeting_note 直达入口** — 虚线占位旁加 "会议" 按钮, 直接建 `type: meeting_note`

### Changed
- `package.json` version → `1.0.3`
- `app.use('/api/meetings', meetingsRouter)` 注册到 `server/index.ts:51-62`

### Removed
- 调试探针 `DEBUG_TASK_DUPLICATE_URL` (`src/App.tsx:50-86` 整段, ~37 行)
- 死代码 `src/components/Projects.tsx` (422 行, 全文 0 外部 import)
- 死代码 `src/components/AIWorkflow.tsx` (317 行, 全文 0 外部 import)

### Verified
- `npm run lint` ✓ / `npm run build` ✓ / `npm run build:server` ✓
- 11/11 端到端冒烟 PASS (qa-engineer verifier)
