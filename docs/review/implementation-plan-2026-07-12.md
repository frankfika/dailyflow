# DailyFlow P0 修复 + Granola Phase 1 实施计划 (2026-07-12)

> 范围: 基于 `ux-audit-2026-07-12.md` + `granola-fusion-spec.md`. 24h 黑客松节奏, ship first.

## 1. P0 修复 (4 项, 引用 audit 行号)

1. **Notes 搜索漏字段** — `src/components/Notes.tsx:232-238` 搜索只检 title/body/mentions, 不检 meeting_note 的 `time`/`endTime`/`participants` (audit:10). 一行 + 几个 OR, 用户搜 "14:30" 找不到会议.
2. **@mention 不支持连字符/点** — `src/components/NoteCard.tsx:35` regex `@[\w一-龥-]+` 不匹配 `@jean-luc.picard` (audit:31). 改字符类, 兼容 CJK 名字.
3. **AI Summary 错误信息裸抛** — `src/components/Notes.tsx:191-192` `console.error` + 裸 `err.message`, 没走 `getFriendlyErrorMessage` (audit:28). 提取 `src/utils/aiErrorMessage.ts` 共享, Notes.tsx 接入.
4. **DailyNoteCards 缺 meeting_note 直达入口** — 虚线占位 `src/components/DailyNoteCards.tsx:65-78` 只产 `type: note`, 想开 meeting_note 得绕 3 步 (audit:10). 在 "笔记" 按钮旁加一个 "会议" 按钮.

## 2. Granola Phase 1 后端

新建 `server/routes/meetings.ts`, 仿 `server/routes/ai.ts:60-110` 模式:
- `POST /api/meetings/transcribe` — 接收 raw transcript 文本, mock 实现: split paragraphs → 假装转录 segments. 不传 key. Phase 2 接 whisper.cpp.
- `POST /api/meetings/summarize` — 接收 transcript + title + participants, 复用 `aiApi` 模式调 LLM, prompt 复用 `NoteEditor.tsx:264-265` 的 "meeting-notes expert". 输出 `{ markdown, actionItems: [{title, owner?, due?}] }`.

注册到 `server/index.ts:51-62`, `app.use('/api/meetings', meetingsRouter)`.

## 3. Granola Phase 1 前端

- `src/api/client.ts` 加 `meetingsApi.transcribe({ text })` + `meetingsApi.summarize({ ... })`.
- 新建 `src/components/MeetingCapture.tsx` — modal, 4 步流: 输入会议标题/参会人 → 粘贴 transcript → "转录" (mock) → "整理" (call summarize) → 预览 Markdown + action items 草稿 → 保存 (notesApi.create type=meeting_note) + 弹 "Add to today" 给每个 action item (调 tasksApi.create).
- `src/components/ContextPicker.tsx` 加第 5 个 tab "会议", 列出 `type === 'meeting_note'` 的最近笔记 (用现有 `notes` prop 过滤). 复用 `ContextItem` type 'note' (不动 type enum).
- `src/components/AIChat.tsx` 工具栏加 "会议" 按钮, 触发 MeetingCapture modal. 复用 `showToast` 回调.

## 4. 不做 (按 task spec)

- 不写 unit test / E2E
- 不改版本号 / 不 push
- 不碰 `docs/UX_REDESIGN.md`, `docs/ROADMAP.md`, `docs/PRODUCT.md`
- 不碰 `src-tauri/`, `.harness/`, `.mavis/`
- 不 cleanup 死代码 (Projects.tsx / AIWorkflow.tsx / showQuickNoteEditor)
- 不大规模重构 AIChat ↔ FloatingAIPanel 重复

## 5. 验证

- `npm run lint` (tsc --noEmit) 必须过
- `npm run build` 必须过
- 手动 smoke: 启 `npm run dev:all`, 在 AI Chat 点 "会议" → 填字段 → 跑通保存路径
