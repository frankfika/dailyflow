# Changelog

All notable changes to DailyFlow will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Pending for v1.0.4

TBD — entries land after R3 refactor + Granola Phase 2 land.

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
