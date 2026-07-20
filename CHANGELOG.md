# Changelog

All notable changes to DailyFlow will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Pending for next release

TBD.

## [1.0.9] - 2026-07-20

### Removed
- **Dead-code DailyFocus cleanup** (commit `b42ff22`) — `src/components/DailyFocus.tsx` (389 lines) and `src/__tests__/components/DailyFocus.test.tsx` (89 lines, 3 tests) deleted. DailyFocus was the modal-picker introduced in `f1ef5ec` and superseded by `TodayBacklog` in 1.0.8 (commit `160637a`); no production code referenced it at the time of this commit.

### Verified
- `npm run lint` ✅ 0 errors
- `npm test` ✅ 31 files / 287 tests pass (was 32/290 — 3 DailyFocus unit tests removed)
- `npm run build` ✅ main chunk 360 kB unchanged (DailyFocus was already tree-shaken out by 1.0.8)

## [1.0.8] - 2026-07-20

### Added
- **TodayBacklog — focus bar + urgency-grouped backlog** (commit `160637a`)
  - `src/components/TodayBacklog.tsx` (450 行) — replaces the 1.0.7 DailyFocus modal with a sticky "today's three" focus bar at the top + always-visible urgency-grouped backlog (overdue / today / this week / later / no-deadline) below. Each backlog card has a one-click `+` to add to today's three (or a `✓` to remove when already in the three). Filter pills at the top toggle the view between All / Overdue / Today / This week / Later.
  - `src/index.css` (+394 行) — TodayBacklog visual styles (sticky focus bar with backdrop-blur, urgency-group accent colors, filter pill states, add/remove affordances). Comment block explicitly notes this is the v1.0.7 redesign that supersedes the old `daily-focus-*` legacy styles.
  - `App.tsx` — Today tab now renders `<TodayBacklog>` instead of `<DailyFocus>` + the collapsible "everything else" fold. Net `-269` lines in App.tsx.
  - `docs/AI_NATIVE_UI_UX_SPEC.md` (+816 行新文件) — authoritative UI/UX spec referenced as equal-implementation-constraint from the main spec. Defines Today / Notes / Memory visual + interaction rules so future agents don't drift from the redesign.
- **Spec: NoteDocument as first-class object** (`docs/AI_NATIVE_PRODUCT_DEVELOPMENT_SPEC.md`, +218 行)
  - §5.2 adds `NoteDocument` alongside `SourceItem` — user-authored, document-first, persistent work journal (quick / daily / meeting / project / reference / general). Distinguishes Notes from "external facts captured automatically" so AI doesn't conflate them.
  - §7 main navigation renamed from `Today / Inbox / Memory` to `Today / Notes / Memory`. Inbox becomes a smart view inside Notes (Quick capture + recent + uncategorized).
  - §7.3 Notes full definition: Inbox / Recent / Daily / Meetings / Projects / Favorites.
  - F-02A "write a note" user flow: open-and-write, auto-save, AI suggestions only in review sidebar, no rewrite of body without explicit diff accept.
  - §11.3 `NoteDocument` type (title optional, kind, state, projectIds, personIds, sourceIds, pinned, autoSaveVersion, contentHash).
  - §11.4 `Evidence` broadened to allow `noteId` + `blockId` anchoring (in addition to `sourceId`).
  - Top of file: links `docs/AI_NATIVE_UI_UX_SPEC.md` as equal-implementation-constraint.

### Changed
- Today tab no longer shows a modal picker for choosing focus tasks; the "pick 3" is now a sticky bar visible at all times.
- Today tab backlog is always visible (no more "everything else" fold).
- Main navigation: `Inbox` tab renamed to `Notes` to match v2 spec narrative.

### Verified
- `npm run lint` ✅ 0 errors
- `npm test` ✅ 32 files / 290 tests pass (DailyFocus unit tests still cover the removed modal flow in isolation)
- `npm run build` ✅ vite build 3.22s, main chunk 360 kB (down from 367 kB at 1.0.7) — net code removal from dropping DailyFocus modal path
- Playwright e2e `e2e/today-backlog-visual.spec.ts` ✅ renders focus bar + 5 filter pills + empty state; screenshot at `e2e-screenshot-today-backlog.png`

### Known follow-ups
- `src/components/DailyFocus.tsx` and `src/__tests__/components/DailyFocus.test.tsx` are now dead code (DailyFocus is no longer mounted in App.tsx). Kept in this release so the commit stays scoped; recommend removing them in 1.0.9.
- 1.0.7's `fix(daily-focus): keep plan modal in Today when AI is not configured` had no production effect in 1.0.7 itself because App.tsx was already mid-refactor at the time of that commit. The same behavior now happens by construction in 1.0.8: TodayBacklog never kicks the user to AI Chat; it stays in Today and degrades to manual `addToFocus` in-place.

## [1.0.7] - 2026-07-20

### Fixed
- **Today plan modal stays in Today when AI is not configured** — `src/components/DailyFocus.tsx` (commit `75acf54`) — When no AI provider is configured (the default state — `useState('')` is never populated unless the user visits Settings), the empty-state primary CTA used to silently jump the user to the AI Chat tab via `onConfigureAI`, which was misleading because the AI Chat tab doesn't help pick 3 focus tasks and the only escape hatch was a "Connect an AI model" button inside the plan modal. Now the primary CTA and the plan modal both stay in Today: they degrade to manual mode in-place so the user can pick their 3 focus tasks directly. The misleading "Connect an AI model" CTA is removed from the planner footer because that flow is no longer reachable when AI is unavailable.

### Verified
- `npm run lint` ✅ 0 errors
- `npm run test` ✅ 32 files / 290 tests pass
- `npm run build` ✅ vite build 4.29s, 4062 modules, all chunks under warning threshold

## [1.0.6] - 2026-07-16

### Fixed
- **Lint baseline 修復** — 補齊 `@types/react` / `@types/react-dom` (React 19 從 npm 拆出類型) + `NoteEditor.tsx` 將 `className/style` 從 `ReactMarkdown` 移到外層 div (新版 props 不再支持) + 移除 vitest 對 `contracts/**` 的誤匹配 (硬節點的 sync-rpc/sync-request 會把 vitest run 拉 timeout)
- **`server/services/git.ts` ahead/behind 命令注入修復** — 對 `branch` 做白名單校驗 (`/^[A-Za-z0-9._\-\/]+$/`) + 把 `exec` 拼接字符串改為 `execFile` (即使 `git branch --show-current` 自身輸出也已防禦性加固)

### Changed
- **`vite.config.ts` manualChunks 改造為函數式** — 函數版按依賴前綴判定 → 拆出 `chain` (wagmi/viem/coinbase/safe-global) / `tanstack` / `vendor` 等 chunk; 主 `index` chunk 從 777kB → 380kB, 所有 chunk 都在 800kB 警告閾值內
- **`server/routes/meetings.ts` console.error 統一不打印整個 error 對象** — 改打印 `error.message` 字串, 避免 API key 之類敏感字段意外寫入服務器日誌
- `chunkSizeWarningLimit` 600 → 800 (手動 chunks 拆分後值合理)

### Verified
- `npm run lint` ✅ 0 errors
- `npm run test` ✅ 16 files / 164 tests pass
- `npm run build` ✅ 主 chunk gzip 97kB, 全 chunk 都在警告閾值下
- `cargo check` ✅ 0 warnings

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
