# Changelog

All notable changes to DailyFlow will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.6.0](https://github.com/frankfika/dailyflow/compare/v1.5.8...v1.6.0) (2026-08-11)


### Features

* improve mind notes and today workflows ([#34](https://github.com/frankfika/dailyflow/issues/34)) ([b3eb32a](https://github.com/frankfika/dailyflow/commit/b3eb32a3c7102e0b94dc0ceaf844db64eec94552))

## [1.5.8](https://github.com/frankfika/dailyflow/compare/v1.5.7...v1.5.8) (2026-08-10)


### Bug Fixes

* **today:** restore earlier standalone tasks ([9c06394](https://github.com/frankfika/dailyflow/commit/9c06394d57583f6084bd97c47f3d1033ca7aab28))

## [1.5.7](https://github.com/frankfika/dailyflow/compare/v1.5.6...v1.5.7) (2026-08-10)


### Bug Fixes

* **event-first:** make mind map actions flow into Today ([059fbad](https://github.com/frankfika/dailyflow/commit/059fbad5cb3a4bc33efaeb4f667d803e0a1f4395))

## [1.5.6](https://github.com/frankfika/dailyflow/compare/v1.5.5...v1.5.6) (2026-08-09)


### Bug Fixes

* save long meeting recordings reliably ([#28](https://github.com/frankfika/dailyflow/issues/28)) ([eec26ed](https://github.com/frankfika/dailyflow/commit/eec26ed5c4df465a565df13052fee9d697f228d7))

## [1.5.5](https://github.com/frankfika/dailyflow/compare/v1.5.4...v1.5.5) (2026-08-09)


### Bug Fixes

* clarify task planning and preserve sidebar navigation ([#26](https://github.com/frankfika/dailyflow/issues/26)) ([e2e83be](https://github.com/frankfika/dailyflow/commit/e2e83bedec64ec2baba3e7e6704f430e6d2e8e53))

## [1.5.4](https://github.com/frankfika/dailyflow/compare/v1.5.3...v1.5.4) (2026-08-09)


### Bug Fixes

* simplify mind map task workflow ([0a34741](https://github.com/frankfika/dailyflow/commit/0a34741650987cdc07fca9c92cafff470fbfe8f4))

## [1.5.3](https://github.com/frankfika/dailyflow/compare/v1.5.2...v1.5.3) (2026-08-08)


### Bug Fixes

* reconcile release branch histories ([8cf1778](https://github.com/frankfika/dailyflow/commit/8cf17780e72847d9cb9bd75527d5994536934b51))

## [1.5.2](https://github.com/frankfika/dailyflow/compare/v1.5.1...v1.5.2) (2026-08-09)

### Fixed

- Generate and upload signed Tauri updater archives, signatures, and `latest.json` using the maintained `tauri-action` v1 contract.
- Fail the release workflow when installers are missing or unexpectedly small, updater signatures are absent, or updater metadata does not cover all supported desktop platforms.

## [1.5.1](https://github.com/frankfika/dailyflow/compare/v1.5.0...v1.5.1) (2026-08-09)

### Changed

- Refactored the mind-map-to-Tasks planning workflow with persistent cross-date links, lifecycle synchronization, immersive canvas controls, batch task promotion, planning order, and parent-child task relationships.
- Fixed the blank-screen and responsive application layout regressions.

## [1.5.0](https://github.com/frankfika/dailyflow/compare/v1.4.1...v1.5.0) (2026-08-08)


### Features

* unify meeting capture and AI models ([#11](https://github.com/frankfika/dailyflow/issues/11)) ([4af309f](https://github.com/frankfika/dailyflow/commit/4af309f24cfc2311e1c868ac7558f5fef8023093))

## [Unreleased]

### Changed

- **One meeting workflow** — every meeting entry point now creates and opens a v2 meeting NoteDocument; audio, transcript, evidence, and review stay attached to that note.
- **Unified Model Center** — chat, meeting summary/extraction, and speech transcription share one versioned registry with automatic migration from the two legacy browser stores. V2 extraction uses the selected meeting-summary role; environment variables remain a headless override.
- **Scoped upload limit** — the 200 MB JSON parser applies only to the canonical v2 meeting capture endpoint; all other APIs use a 10 MB ceiling.

### Removed

- Removed the legacy MeetingCapture modal, `/api/meetings`, and its split recording/note storage path.
- Removed unused legacy Projects, Git, and Thinking Workspace APIs and their duplicate write services. Topic Space continues to read old `kind: workspace` files without rewriting them.
- Removed unreachable Today/Review/Tags/Prompt Library/Feishu Agenda components and their orphaned helpers and tests.

## [1.4.1] - 2026-08-08

### Fixed

- **Reliable mind map autosave** — serialize saves and flush pending edits when switching maps or leaving the view, preventing stale writes and lost changes.
- **Concurrent persistence safety** — make mind map updates atomic so simultaneous edits cannot overwrite newer data.
- **Task linking actions** — keep linked-task creation, selection, navigation, and context-menu actions consistent across the mind map UI.
- **Regression coverage** — add route, service, API client, autosave, mirroring, and context-menu tests for the repaired flows.

## [1.4.0] - 2026-08-08

### Added

- **Mind Map workspace** — a new `思维导图` tab with a per-workspace list of mind maps and a pan/zoom canvas (powered by `@xyflow/react`). Auto-laid-out horizontal tree, drag-to-reposition, Tab to add a child, Enter to add a sibling, Backspace to delete, double-click to edit, F2 to edit, color cycle button. Auto-save to `<workspaceRoot>/.dailyflow/mindmaps/<id>.json` (debounced 600ms). 6 named color tokens that match the rest of the design system.
- Mind map CRUD endpoints: `GET/POST /api/mindmaps`, `GET/PUT/DELETE /api/mindmaps/:id`.
- **Subtree collapse / expand** — toggle a node's children with a chevron button; collapsed state persists across reloads. The auto-layout and the canvas both skip hidden descendants.
- **Inline note editor** — click the sticky-note button on a selected node to add a longer-form note. The note renders as a side panel beside the node and is exported alongside the headline.
- **Markdown export** — `Copy Markdown` button in the header writes the visible tree (collapsed subtrees excluded) as a `#`-heading + nested list to the clipboard, with notes emitted as blockquotes.
- **Multi-line text wrapping** — long node text now wraps inside the card instead of forcing a wide card. The edit input is an auto-growing textarea.
- **Task status** — each node now has a three-state status (`todo` / `in-progress` / `done`). Click the badge on the left of a node to cycle; the canvas renders a check / dot / empty circle and strikes through the headline once a node is done. Persisted to the same JSON file.
- **Undo / redo** — `Ctrl/Cmd+Z` and `Ctrl/Cmd+Shift+Z` (or `Ctrl+Y`) walk a 50-entry history per map. The header has Undo/Redo buttons that disable when the stack is empty. Position-only drags do not pollute the history (they're coalesced by the autosave debounce).
- **In-map search** — `Ctrl/Cmd+F` opens a search bar that replaces the title; `Enter` / `↓` jumps to the next match, `↑` to the previous, `Esc` closes. Matches get a faint amber ring; the currently focused match gets a solid amber ring and the canvas auto-pans to keep it in view.
- **Mind map JSON import / export** — per-row export writes a `Blob` of the full map to disk; the empty-state Import button (and the list rail's upload button) re-creates the map from a JSON file. Filename uses a sanitized title + the last 6 chars of the id.
- **Mind map progress badge** — the header shows a `done/total` chip for the active map (skips the root). Tints to the success color when 100% done.
- **Mind map templates** — 4 starter templates (SWOT / 5W1H / Decision Tree / Task Breakdown) are offered from the empty state. Each template builds a real `MindMap` shape with deterministic ids so the auto-layout produces a clean tree on creation.

#### Topic Spaces (Phase 1-4)

The Topic Space refactor introduces a `主题` (Topic Space) as the primary
organizing unit: one project, initiative, or long-running goal owns its own
mind map, its own list of bound tasks, and its own tags. The refactor
lands in four phases and is fully implemented end-to-end.

- **Phase 1 — data model + UI** — `TopicSpace` lives as a new
  `<workspaceRoot>/Workspaces/yyyy/MM/tw_*.md` Markdown file with YAML
  frontmatter (id, kind, context, mindmapId, taskIds, defaultView, tags,
  intent, scratchpad, brief, journey, timeline). A new `Topic Tabs` rail
  lists `全部` / `未分类` / each space, with create / delete / select.
  The mind-map node schema gains `kind` (`root` | `branch` | `tag` |
  `task`) and optional `tag` / `taskId` fields. A one-time
  `migrate:topic-spaces` script pre-seeds the metadata for any
  pre-existing mind map.
- **Phase 2 — node kind editing + task mirror** — right-click on a
  node opens a context menu with four actions: `转为待办` (create a
  real Task and bind it to the node), `关联已有 Task` (search-driven
  picker over the active space's tasks), `设为 Tag` (re-classify the
  node as a tag), and `取消分类` (demote back to a plain branch). The
  root node hides the latter two. The mind-map view one-way mirrors
  `status` and `text` from linked Tasks so editing a task in TodayView
  reflects in the map. Endpoints:
  `POST /api/mindmaps/:id/nodes/:nodeId/promote-to-task`,
  `POST /api/mindmaps/:id/nodes/:nodeId/link-task`,
  `PUT /api/mindmaps/:id/nodes/:nodeId/kind`,
  `PUT /api/tasks/:taskId/space`.
- **Phase 3 — tag terminalization + inheritance** — `kind: 'tag'` nodes
  along a path to a leaf become inherited tags when the leaf is promoted
  to a Task. The walk is root-to-leaf, case-insensitive, deduplicated
  against user-supplied `#tag`s, and cycle-safe.
- **Phase 4 — `^space:xxx` system marker + diagnostics** — the binding
  between a Task and a Topic Space is recorded as a system marker at the
  end of the task line (`- [ ] title #user-tag #inherited-tag
  ^space:<id> ^id-<taskId>`), separate from user-visible tags so it
  survives migration. A new `/api/diagnostics` surface reports broken
  links (nodes whose `taskId` no longer resolves) and supports a
  surgical `repair-task-link` action to unlink dangling nodes
  (re-create is reserved for a future phase).

### Dual view (mindmap / list)

- The Topic Space surface offers two views: a `mindmap` view (the
  existing canvas) and a `list` view of the space's bound tasks. The
  active view is persisted on the space as `defaultView`; a transient
  `viewOverride` lets the user flip without committing.
- The list view has a tag filter (multi-select chip row, sourced from
  the union of the space's own tags and the tags scraped from its bound
  tasks). TaskCard surfaces the space binding with a `已绑定到 [Space]`
  chip plus an inline `×` to unlink.

### Verified

- `npm test` ✅ 69 files / **550 tests** (server 371 + client 179; +148
  vs 1.3.1)
- `npm run lint` ✅
- `npm run build` ✅
- `npx playwright test e2e/topic-spaces.spec.ts --workers=1` ✅
- Live curl smoke for `promote-to-task` / `link-task` / `PUT
  /tasks/:id/space` / `GET /diagnostics/broken-links` /
  `POST /diagnostics/repair-task-link` ✅
- `^space:<id>` marker round-trips through the Markdown file ✅

## [1.3.1] - 2026-08-06

## [1.3.1] - 2026-08-06

### Fixed

- **Ollama loopback support** — local Ollama/LM Studio chat endpoints on `localhost`, `127.0.0.1`, and `::1` are now accepted while LAN and link-local SSRF targets remain blocked.
- **Meeting model separation** — chat models are no longer treated as speech models; Ollama can organize transcripts while Whisper-compatible providers handle audio.
- **Durable-first meeting capture** — recordings are persisted before transcription and can be transcribed or retried later without recording again.
- **No fake transcripts** — missing speech models no longer produce placeholder text that flows into meeting summaries.
- **Local ASR readiness** — whisper.cpp executable, model, and ffmpeg availability are detected from the actual machine configuration.

### Added

- Local ASR path configuration and detection in Meeting Notes.
- A stored-audio transcription endpoint for remote and loopback speech providers.
- Meeting AI architecture notes in `docs/MEETING_AI_ARCHITECTURE.md`.

### Verified

- `npm test` ✅ 52 files / 402 tests
- `npm run lint` ✅
- `npm run build` ✅
- In-app browser UX verification ✅

## [1.2.2] - 2026-07-29

### Fixed

- **Reliable Note archive and restore** — archived Notes now show a clear Restore action, while working Notes show Archive; both paths use the same versioned state transition.
- **Atomic Note autosaves** — per-file compare-and-swap serialization prevents concurrent body, metadata, recording, and transcription updates from silently overwriting each other.
- **Conflict-safe editing** — field-level three-way checks preserve local text on genuine conflicts, retain failed edits for retry, and keep queued saves isolated when switching rapidly between Notes.
- **Meeting recording associations** — recording and local transcription updates re-read and safely merge source links after concurrent edits instead of rewriting stale Note documents.
- **Stable dated Notes** — changing a Note date across months keeps one physical file and no longer produces false conflicts or duplicate records.
- **Mobile Notes navigation** — returning to the Note list no longer immediately reopens the first document.

### Verified

- `npm run lint` ✅
- `npm test` ✅ 50 files / 396 tests
- `npm run build` ✅
- `cargo check --manifest-path src-tauri/Cargo.toml` ✅
- Desktop Notes archive/restore UI inspected with no browser errors ✅

## [1.2.1] - 2026-07-29

### Fixed

- **Explicit speech-provider opt-in** — an existing AI Chat provider is no longer treated as an audio transcription service. Meeting Notes now default to saving the original recording only, and remote audio upload is enabled only after the user explicitly selects remote transcription and configures its speech API URL, key, and model.

### Verified

- Meeting recording UI defaults to `Save recording only` even when AI Chat is configured.
- Explicit remote speech configuration still submits to the configured transcription endpoint.

## [1.2.0] - 2026-07-29

### Added

- **Native meeting Notes** — an existing Note can be switched to `meeting` and remains the owner of its handwritten minutes, original recordings, and transcript sources.
- **In-app recording** — start, stop, preview, discard, save, and replay multiple meeting recordings directly inside a meeting Note.
- **Flexible transcription providers** — choose save-only, a remote OpenAI-compatible speech API, a loopback-only local OpenAI-compatible endpoint, or an advanced managed `whisper.cpp` executable.
- **Editable transcript workflow** — preserved transcripts can be copied into the Note body with one action and then corrected or expanded in the normal editor.
- **Note tags and filters** — add or remove multiple tags, show them in the Note list, and filter Notes by tag.
- **Meeting Agent foundation** — declarative Agent definitions and reviewable AgentRun records keep future AI Chat summaries separate from literal transcription.
- **Ollama Chat template** — local Ollama remains available for future Chat/Agent work without being treated as an audio transcription provider.

### Security and reliability

- The original recording is written atomically before any transcription request is attempted.
- Remote transcription rejects localhost, private, and link-local destinations; local endpoints are restricted to `localhost`, `127.0.0.1`, and `::1`.
- Recording and transcript files remain separate private SourceItems linked to their Note.
- macOS packages declare microphone usage so the system can request recording permission correctly.

### Verified

- `npm run lint` ✅
- `npm test` ✅ 49 files / 384 tests
- `npm run build` ✅
- `npm run build:server` ✅
- `cargo check --manifest-path src-tauri/Cargo.toml` ✅
- Meeting Note recording UI inspected in the local desktop webview workflow ✅

## [1.1.18] - 2026-07-28

### Added

- **In-app Feishu onboarding** — DailyFlow now guides first-time app preparation and account authorization from Settings, including official links, QR codes, automatic result checks, retry controls, and local disconnect.
- **Bundled Feishu connector** — every desktop installer now includes the official platform-specific `@larksuite/cli` runtime; users no longer need Homebrew, npm, or a separate CLI installation.

### Fixed

- **Packaged server startup** — corrected Tauri resource discovery so production builds use the bundled Node runtime from `_up_/dist-server` instead of silently depending on a system Node installation.
- **Desktop process cleanup** — the bundled local server is terminated and reaped when DailyFlow exits.
- **Feishu authorization handoff** — the app retains the live device flow, displays a QR/link fallback, waits for confirmation, and refreshes the connected account automatically.

### Verified

- Packaged macOS `.app` starts with the bundled Node runtime.
- Packaged Feishu connector reports `cliAvailable`, configured application, and authorized account.
- Settings → Sync → Feishu displays the connected account and sync controls in the native desktop window.
- `npm run lint` ✅
- `npm test` ✅ 37 files / 336 tests
- `cargo check` ✅

## [1.1.17] - 2026-07-28

### Fixed

- **Desktop runtime jank** — replaced the permanently animated, viewport-sized `blur(140px)` background with static radial gradients.
- **Expensive full-window compositing** — removed always-on backdrop blur from the main pane, sidebar, task cards, glass panels, and sticky focus bar while preserving their visual hierarchy with opaque surfaces and gradients.
- **Over-broad transitions** — limited card transitions to the properties that actually animate, avoiding unnecessary style and paint work.

### Verified

- DailyFlow idle process CPU: `0.0%`
- WebKit content CPU: approximately `0.2%`
- WebKit GPU CPU: `0.0%`
- `npm run lint` ✅
- `npm run build` ✅
- `npm test` ✅ 37 files / 336 tests

## [1.1.10] - 2026-07-21

### Fixed
- **Notes right pane actually fills the viewport** (`src/App.tsx`, `src/features/v2/notes/NoteEditor.tsx`, `src/features/v2/notes/NotesView.tsx`) — Frank 多次反馈 "note 太小 / 中间空 / section 留白大", 根因是 3 层嵌套限制:
  - `App.tsx:1019` 的 page-style wrapper (`p-4 md:p-8 lg:p-12`) 给 Notes 套了 48px 横向 padding
  - `App.tsx:1020` 的 `max-w-3xl mx-auto` 把整页挤到 768px 居中, 1920 视口里左右各漏 ~576px 蓝白渐变 background
  - `App.tsx:1215` 我之前加的 `h-full w-full` wrapper 也被父级 max-w-3xl 卡住, 救不回来
  - **修法**: Notes 跟 ai-chat/capsules 一样走 full-bleed wrapper (`overflow-hidden` + `w-full h-full`), 删掉废的 L1215 wrapper
- **No-selection onboarding fills the right pane** (`src/features/v2/notes/NoteEditor.tsx`) — 之前 `!noteId` 早 return 用的是 `max-w-2xl` 简化 onboarding (标题 + 4 按钮 + hint), 右下半截完全空. 现在跟 body-empty 共享新抽出的 `OnboardingPanel` 组件 (大字 + 4 模板 + recent 3 个 + tips 双卡) 整片撑满
- **List column no longer gets stretched by content** (`src/features/v2/notes/NotesView.tsx`) — aside 加 `min-w-0`, 280px 是死的, 不被 Card 内容撑大
- **Shared `OnboardingPanel` component** (`src/features/v2/notes/NoteEditor.tsx`) — `!noteId` 分支和 empty-body 分支都渲染同一份 onboarding, 不会再出现两个 onboarding 长得不一样 (一个 max-w-2xl 小岛, 一个完整 3 段) 的分裂

### Verified
- `npx tsc --noEmit` ✅ 0 errors
- `npm test` ✅ 33 files / 315 tests pass
- `npx playwright test e2e/notes-focus-mode.spec.ts --workers=1` ✅ 4/4 pass
- `npx playwright test e2e/visual-check.spec.ts` ✅ 1920×1080 截图肉眼确认 A/B/C 三个状态右半屏都撑满 1410px (从 x=510 到 x=1920), 不再有 section 留白

## [1.1.9] - 2026-07-21

### Changed (rolled back in 1.1.10)
- **Focus mode is the default + body `max-w-[68ch] mx-auto` 居中** (`src/features/v2/notes/NotesView.tsx`, `src/features/v2/notes/NoteEditor.tsx`, commit `f144c0c`) — 试过把 focus 当 default 让长文写作有更多空间, 配合 `mod+\` 快捷键 + lucide `Maximize2`/`Minimize2` SVG toggle. **实际效果**: list 被压成 56px icon strip 是死列, 用户没法回 split. 1.1.10 改回 split default, focus mode 留作 opt-in
- **`pl-6 pr-8` 左对齐 + `w-full` 撑满** (commit `9867b71`) — Frank 拒绝居中岛 (1.1.9 居中版), 改回左对齐撑满, 1.1.10 完整保留

## [1.1.8] - 2026-07-21

### Added
- **Focus mode strip N+ in-place expansion** (`src/features/v2/notes/NoteList.tsx`, `src/features/v2/notes/NotesView.tsx`, commit `e3003d9`) — 之前点 N+ 直接 eject 回 split 模式打断 focus, 现在就地展开:
  - 点击 N+ → strip 解除 11-dot cap, 渲染所有 note 圆点, 焦点模式不丢
  - 再点 (或选中任意 note) → 收回 11-dot cap
  - a11y: `aria-expanded` 翻转, 按钮文案 `N+` ↔ `−`, tooltip 双向提示
- **Bilingual relative time** (`src/features/v2/notes/NoteList.tsx`, `src/features/v2/notes/NoteEditor.tsx`) — `just now / Nm / Nh / Nd` (en) + `刚刚 / N 分钟前 / N 小时前 / N 天前` (zh). List 单元格和 editor statusbar 用同一 helper, 语言一致
- **E2E expansion contract** (`e2e/notes-focus-mode.spec.ts`) — 重写后断言新行为: 始终留在 `note` layout, N+ 切到 `−`, 所有 seeded note 在 strip 内可见, 选中后塌回 cap

### Verified
- `npx tsc --noEmit` ✅ 0 errors
- `npm test` ✅ 33 files / 315 tests pass
- `npm run build` ✅ vite 2.x s, main chunk 376 kB
- `npx playwright test` ✅ 13/13 e2e pass (新增 + 重写的 N+ 展开合同)

## [1.1.7] - 2026-07-21

### Added
- **Server import/reset endpoints** (`server/routes/v2/index.ts`, `server/services/v2/importService.ts`, commit `f8defa8`) — 补齐 1.1.6 留的 mock 端点:
  - `POST /api/v2/import` — merge / overwrite 双模式, per-entity 错误回包
  - `POST /api/v2/reset` — `RESET WORKSPACE` confirm phrase guard
  - `importService.ts` (375 行) + 11 vitest 单测覆盖双模式 + 边界 case
  - 2 个新 audit event kind: `workspace.import`, `workspace.reset`
- **3-viewport responsive Sidebar** (`src/components/Sidebar.tsx`, +469 行) — 拆 mobile/tablet/desktop:
  - mobile (≤640): fixed overlay + slide 动画 + backdrop + Esc 关闭
  - tablet (641-1024): 60px icon strip 默认, hover/click 展开
  - desktop (>1024): 230px in flow
  - `localStorage df_sidebar_collapsed` 持久化 tablet/desktop 偏好
  - `AnimatePresence` + `motion.aside` 动画, a11y 完整 (`aria-expanded` / `aria-controls` / `role="navigation"` / `aria-label`)

### Fixed
- **loadConfig 不再回写空 workspaces 数组到磁盘** (`server/services/config.ts`) — 之前空数组被 cascade 到每个 server route, e2e workspace 在测试中途被剔除, 现在只在首次 true first-run 才 seed 文件
- **saveActiveContext 守 e2e race** — server 还没 workspace 时不再 echo 半截 config

### Verified
- `npx tsc --noEmit` ✅ 0 errors
- `npm test` ✅ 33 files / 315 tests pass (新增 11 importService 单测)
- `npm run build` ✅ vite 3.x s, main chunk ~360 kB
- `npx playwright test` ✅ 11/11 e2e pass (新增 6 个 sidebar-viewport 测: mobile/tablet/desktop × closed/open)

## [1.1.6] - 2026-07-20

### Added
- **Settings → Workspace Data section** (`src/components/SettingsModal.tsx`, commit `db29db4`) — 1.1.6 主线:
  - **Export all data**: fetch 8 个 entity endpoint (`/api/v2/export/entities?kind=X` × 8) + `/api/v2/notes` + `/api/v2/commitments`, 包成 JSON, Blob + `<a download>` 触发, 文件名 `dailyflow-${wsSlug}-${date}.json`. 成功 toast + "Last exported 5m ago" inline status
  - **Import from JSON**: file input accept=".json", 解析后 POST `/api/v2/import`. 服务端该 endpoint **暂不存在** (1.1.6 范围外), UI 友好提示 "server import endpoint not yet implemented, coming soon"
  - **Reset workspace**: 二次 `confirm()` 保护, 调 `POST /api/v2/reset`. 同上, endpoint 暂缺, UI 提示 "coming soon"
  - 完整 state 管理: 3 个 loading flag + lastExportTime (localStorage 持久化) + inline status banner
- **Sidebar Mode 切换器 visual polish** (`src/components/Sidebar.tsx`):
  - 从 small inline chip 改成 100% 宽 tab-style (grid-cols-2)
  - 加 uppercase "MODE" 标签 + 右侧 "On the clock" / "Off the clock" status
  - 选中态 `bg-surface text-accent shadow-sm` 加 14px icon, 视觉权重明显
  - aria `role="tablist"` + `aria-selected` 配 a11y

### Known limitations
- `/api/v2/import` + `/api/v2/reset` 1.1.6 暂未实现. UI 已加, 错误优雅 fallback. 1.2.x 真实接入.

### Verified
- `npx tsc --noEmit` ✅ 0 errors
- `npm test` ✅ 32 files / 304 tests pass
- `npm run build` ✅ vite 4.07s, main chunk 363 kB
- `npx playwright test` ✅ 7/7 e2e pass (no regression from 1.1.5)

## [1.1.5] - 2026-07-20

### Added
- **Notes focus mode icon strip polish** (`src/features/v2/notes/NoteList.tsx`, commit `<pending>`) — 之前 16+ 灰圆点垂直列, 选中不明显. 现在:
  - 12 cap: top 11 dots + 1 "N+" 折叠 indicator (灰底 + dashed border + count)
  - 选中 note 不在 top 11 时自动 `scrollIntoView({ block: 'nearest' })` 滚到可视区
  - Hover 200ms 后弹 portal tooltip (玻璃模糊 backdrop, 右侧浮, title + body 前 90 字符)
  - 选中态 `scale(1.05) ring-2 ring-accent` 强化
  - Scroll cue: 顶部/底部 fade gradient + `IntersectionObserver` 监听 first/last item
  - 抽出 `FocusStrip` 子组件 (310 行), 保留 split 模式原状
- **App.tsx: 传 `dailyNotes` + `onOpenNotesTab` 到 TodayBacklog, 删 DailyNoteCards 重复** — 之前同一份 "Today's notes" 数据在 `App.tsx` 渲染两次 (DailyNoteCards + TodayBacklog 备用 section), 现在统一在 TodayBacklog 内部:
  - TodayBacklog 备用 section 真的 list 前 3 个 note (title + preview 90 字符)
  - Empty 时显示 "Capture today's note" CTA → `onOpenNotesTab` 跳 Notes tab
  - 多于 3 时显示 "View all" 跳 Notes tab
  - 删 `src/components/DailyNoteCards.tsx` (220 行死代码)

### Removed
- `src/components/DailyNoteCards.tsx` — 被 TodayBacklog 收口替代 (220 行)

### Verified
- `npx tsc --noEmit` ✅ 0 errors
- `npm test` ✅ 32 files / 304 tests pass
- `npm run build` ✅ vite 2.75s, main chunk 359 kB (-9 kB from 1.1.4 — DailyNoteCards 删除 > strip polish 增加)
- `npx playwright test` ✅ 13/13 e2e pass (新增 cap test, 12 上限 + tooltip + N+ 跳转)

## [1.1.4] - 2026-07-20

### Added
- **Today view UX 收紧** (`src/components/TodayBacklog.tsx`, commit `<pending>`) — 之前 50% 空白 + 7 个 task 藏在折叠组看不见, 现在:
  - 4 stat cards strip: Tasks today / Overdue (红 if > 0) / Completed / Focus (0-3 进度条), 在 focus bar 与 filter pills 之间
  - "No deadline" 组默认展开 + "Hide tasks without deadline" checkbox
  - focus bar 短文案 "Add tasks below with + button, or let AI pick your 3."
  - focus bar 下面 anchor 行 "↓ N today, N overdue" 视觉锚到下方 backlog
  - 接口加可选 `dailyNotes` + `onOpenNotesTab` props (后向兼容, 父级没传则备用 section 不渲染)
  - 配套 CSS 在 `src/index.css`: `.today-stat-strip` 4 列 grid + 响应式 2 列断点
- **Note editor footer + polish** (`src/features/v2/notes/NoteEditor.tsx`, commit `<pending>`) — 让 editor 不再短 body 看起来太空:
  - 底部 statusbar: `N words / N chars / ~N min read` (11px muted, 右对齐), 空 body 显示 "Empty"/"空白"
  - body `min-h-[60vh]` 保证短 note 写区有合理高度
  - 无 backlinks 时 footer 左侧加 "Last updated 5m ago" 用 relativeTime
  - i18n COPY 加 5 个 key (zh + en): `words / chars / minRead / lastUpdated / bodyEmpty`

### Fixed
- **Settings 默认 Font Size 显示 280%** — `SettingsModal.tsx:483` 用 `80 + val*40` 算 label, 但实际 scale 用 `0.8 + val*0.04` (val=5 → CSS scale 1.0 = 100%, 但 label 显示 280%). 改 label 公式为 `Math.round((0.8 + val*0.04) * 100)`, 默认现在正确显示 "100%".

### Verified
- `npx tsc --noEmit` ✅ 0 errors
- `npm test` ✅ 32 files / 304 tests pass
- `npm run build` ✅ vite 2.92s, main chunk 368 kB (+5 kB for stat cards + footer)
- 6/6 e2e pass (today-backlog + note-acceptance ×3 + notes-focus + notes-view)

## [1.1.3] - 2026-07-20

### Added
- **Note editor focus mode** (commit `<pending>`) — toggle the side list to a 56px icon strip so the document-first editor gets the full pane width for long-form writing. The mode is persisted to `localStorage` (key `df_notes_layout`, namespaced by `workspaceId`) so the choice sticks across sessions.
  - `src/features/v2/notes/NotesView.tsx` — adds `layout: 'split' | 'note'` state, localStorage persistence, an inline grid-template style for the responsive collapse, and forwards `layout` + `onToggleLayout` to both children.
  - `src/features/v2/notes/NoteList.tsx` — adds an "icon strip" render path (`layout === 'note'`) with one circular avatar per note (first letter of the inferred title) and a `+` button to create a new note. Each avatar is a one-click switch.
  - `src/features/v2/notes/NoteEditor.tsx` — adds a `⛶` button in the header that calls `onToggleLayout`. The button stays reachable from focus mode so the user can come back to the list view.
- **Backlinks panel** (commit `<pending>`) — full reverse-relationship view in the editor footer. Lists every Commitment, Decision, Outcome, and Evidence that references the current note. Implements spec §26 step 19 ("用户一个月后询问当时为什么这样决定, 系统用 Decision 和 Evidence 回答") by surfacing the exact ids the user can click through to.
  - `server/services/v2/noteService.ts` `backlinks(id)` — was a stub returning `commitmentIds: []` etc. Now walks `repo.listCommitments` / `listDecisions` / `listOutcomes` and returns any whose `evidenceIds` intersect with the note's evidence set. The lookup is O(N×M) but bounded by typical note evidence count (< 50) so it stays cheap; an indexed join in `index.sqlite` is reserved for later if it ever becomes a hot path.
  - `src/features/v2/notes/NoteEditor.tsx` — new `BacklinksPanel` component renders the four row groups with their id lists (truncated to 16 chars + ellipsis for readability).
- **§26 step 17 / 18 / 19 acceptance** (`e2e/note-acceptance.spec.ts`, 3 tests, ~3.5s total) — verifies that an empty-body POST creates a `draft`, that a PATCH without `body` never rewrites the body, and that `memory.search` surfaces notes with a matching snippet.
- **Notes focus mode e2e** (`e2e/notes-focus-mode.spec.ts`) — verifies the toggle round-trips, the icon strip remains usable, and the editor body persists across the layout switch.
- **NoteDocument unit tests** (`server/services/v2/__tests__/noteService.test.ts`, 17 tests) — created + auto-update + concurrent-modification + partial update + sort + filter + text search + touchLastOpened + archive + delete + cascade + backlinks + markdown round-trip + class re-export identity.

### Fixed
- **Note body round-trip lost newlines** — `markdownSerializer.yamlString` collapsed `\n` into spaces for inline scalars, so any multi-paragraph note's body was silently mangled when serialized. `serializeNoteDocument` now writes the body to the markdown section only (frontmatter is metadata); the repository's `listNoteDocuments` and `findById` splice the markdown body back in (trimming the trailing newline the serializer adds for clean paragraph breaks). Found by `noteService.test.ts > markdown round-trip`.
- **Note evidence cascade didn't run** — `listEvidence` walked `notes/_evidence/` at the root, but `saveEvidence` writes `notes/YYYY/MM/_evidence/`. The list always returned `[]` so `listEvidenceForNote` found nothing and `deleteNoteDocument`'s cascade silently orphaned the per-month evidence files. `listEvidence` now walks the whole `notes/` tree and filters on the `_evidence/` path component. Found by `noteService.test.ts > delete cascade`.

### Verified
- `npx tsc --noEmit` ✅ 0 errors
- `npm test` ✅ 32 files / 304 tests pass (was 287; +17 NoteDocument tests)
- `npm run build` ✅ vite build 2.85s, main chunk 363 kB (was 359 kB at 1.1.2; +4 kB for focus mode + backlinks panel)
- `npx playwright test e2e/notes-focus-mode e2e/notes-view-visual e2e/note-acceptance e2e/today-backlog-visual` ✅ 6/6 pass (15.7s)
- Playwright e2e `e2e-screenshot-notes-focus-mode.png` shows the icon strip on the left and the editor at full pane width.

## [1.1.2] - 2026-07-20

### Added
- **Main App Notes tab integration with v2 NoteDocument** (commit `<pending>`) — the v1 `Notes` component is replaced by `NotesView` in the App's Notes tab so the 1.1.0 backend and 1.1.1 hooks are reachable from the default UI.
  - `src/features/v2/notes/NoteList.tsx` (new) — list of notes grouped by view (All / Recent / Daily / Meetings / Projects / Pinned / Archived). "+ New note" button creates a draft and opens the editor. Each row exposes archive + delete. Pinned-first sort.
  - `src/features/v2/notes/NoteEditor.tsx` (new) — document-first editor: optional title input, body fills the rest of the pane, kind/date/pin/archive controls in the header, autosave status badge ("saving…" / "Saved" / "Resolving conflict…" / "Save failed") driven by `useNoteAutosave`. Flushes on unmount to prevent the "edited → navigated → lost" race.
  - `src/features/v2/notes/NotesView.tsx` (new) — composes list + editor; two-column layout that collapses to a single column on mobile.
  - `src/App.tsx` — Notes tab default case now renders `<NotesView language={language} />` instead of the v1 `<Notes>`.

### Fixed
- **NoteDocument frontmatter read-back** — `serializeNoteDocument` now writes `body` to **both** the frontmatter and the markdown section, and `listNoteDocuments` / `findById` splice the markdown body in as a safety net for files written before this fix. Without this, `NoteDocumentSchema.parse` was rejecting the persisted notes because the schema requires `body` and the old serializer had only put it in the markdown section.
- **Button accepts `data-testid`** — `src/features/v2/components/States.tsx` `Button` now accepts and forwards a `data-testid` prop so callers don't have to wrap it for test selectors.

### Verified
- `npx tsc --noEmit` ✅ 0 errors
- `npm test` ✅ 31 files / 287 tests pass
- `npm run build` ✅ vite build 2.83s, main chunk 359 kB (down 1 kB from 1.1.1)
- Playwright e2e `e2e/notes-view-visual.spec.ts` ✅ renders NotesView with the list, opens the pre-seeded note, mounts the document-first editor with title + body, and screenshots the result. Screenshot at `e2e-screenshot-notes-view.png`.

## [1.1.1] - 2026-07-20

### Added
- **NoteDocument API client + React Query hooks** (commit `<pending>`) — frontend surface for the 1.1.0 backend. The hooks namespace list keys (`['v2-notes', state, kind, q]`) so Inbox / Recent / Daily / Favorites views mount independently and a single mutation can evict the right slice without invalidating the world.
  - `src/features/v2/api/client.ts` — adds `NoteDocument`, `CreateNoteInput`, `UpdateNoteInput`, `NoteBacklinks`, `NoteKind`, `NoteState` types and 7 functions: `listNotes` / `createNote` / `getNote` / `updateNote` / `deleteNote` / `archiveNote` / `getNoteBacklinks`.
  - `src/features/v2/hooks/useNotes.ts` (new) — `useNotes` (list, with state/kind/q filter), `useNote` (single + side-effect-touches `lastOpenedAt`), `useCreateNote`, `useUpdateNote`, `useDeleteNote`, `useArchiveNote`, `useNoteBacklinks`, and a 1-shot autosave helper `useNoteAutosave` that:
    - debounces body changes (800 ms),
    - tracks the local `expectedAutoSaveVersion` and bumps it after every successful save,
    - transparently retries on 409 `concurrent_modification` by re-reading the note and patching again,
    - exposes `status: 'idle' | 'saving' | 'saved' | 'error' | 'conflict'` so the editor can render a small status indicator without building its own retry machine.

### Verified
- `npx tsc --noEmit` ✅ 0 errors
- `npm test` ✅ 31 files / 287 tests pass (no regression)
- `npm run build` ✅ vite build 5.38s, main chunk 360 kB unchanged (hooks are tiny)

## [1.1.0] - 2026-07-20

### Added
- **NoteDocument as a first-class v2 entity** (commit `48cdbf7`) — the backend layer for spec §5.2 / §7.3 / §11.3 / F-02A. Notes are persisted to `.dailyflow/notes/YYYY/MM/<id>.md` (isolated from v1's `Notes/` legacy tree) and carry a stable `autoSaveVersion` + `contentHash` for optimistic-concurrency autosave.
  - `server/domain/v2/types.ts` (+87 行) — `NoteKindSchema` (quick / daily / meeting / project / reference / general) + `NoteDocumentSchema` (title optional, body, kind, state, date, projectIds, personIds, sourceIds, pinned, lastOpenedAt, autoSaveVersion, contentHash, tagIds). Adds NoteDocument to `AnyV2EntitySchema`.
  - `server/domain/v2/ulid.ts` — adds `'note'` prefix to `EntityPrefix`.
  - `server/repositories/v2/paths.ts` — `V2Layout.notes` + `entityPath('note', …)` and `entityPath('note_evidence', …)` for co-located per-note evidence.
  - `server/repositories/v2/markdownSerializer.ts` (+36 行) — `serializeNoteDocument(n)`; updated `serializeEvidence(e)` to emit `note_id` and `source_id` (exactly one, per schema) and an anchor header `Evidence (note:…)` or `Evidence (source:…)`.
  - `server/repositories/v2/repository.ts` (+127 行) — `saveNoteDocument` / `getNoteDocument` (walks the YYYY/MM partition) / `listNoteDocuments` (recursive + state filter, skips `_evidence/` subdirs) / `deleteNoteDocument` (cascades to note-anchored evidence) / `listEvidence` now unions source + note evidence trees / `listEvidenceForNote(noteId)`.
  - `server/services/v2/noteService.ts` (new, 299 行) — `NoteService` class wrapping the repo with:
    - `create(input)` — no title, no kind, no date required; `kind` and `title` inferred from body heuristically; state defaults to `draft`. Spec F-02A.
    - `update(id, input)` — requires `expectedAutoSaveVersion`; throws `ConcurrentModificationError` (re-exported from the repo for `instanceof` checks at the routes layer) on version mismatch; bumps `autoSaveVersion` and `contentHash`.
    - `touchLastOpened(id)`, `archive(id)`, `delete(id)`, `backlinks(id)`.
    - `list({ state, kind, q })` with pinned-first + recency sort, in-memory text filter.
  - `server/routes/v2/index.ts` (+191 行) — 7 new endpoints:
    - `GET    /api/v2/notes?state=&kind=&q=`
    - `POST   /api/v2/notes`
    - `GET    /api/v2/notes/:id` (side-effects `touchLastOpened` for Recent)
    - `PATCH  /api/v2/notes/:id` (version conflict → 409)
    - `DELETE /api/v2/notes/:id` (cascades)
    - `POST   /api/v2/notes/:id/archive`
    - `GET    /api/v2/notes/:id/backlinks`
  - `POST /api/v2/evidence` now accepts `noteId` + `note_block` locator; quote must be a verbatim substring of the note body (spec §10.5).
  - `server/services/v2/memoryService.ts` — `search` now includes `type: 'note'` hits (spec §26 step 19).

### Verified
- `npx tsc --noEmit` ✅ 0 errors
- `npm test` ✅ 31 files / 287 tests pass (no regression; NoteDocument unit tests deferred to 1.1.1)
- `npm run build` ✅ vite build 3.40s, main chunk 360 kB unchanged (backend-only)

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
