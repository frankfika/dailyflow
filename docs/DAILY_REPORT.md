# Daily Report + Daily Reflection (Sprint 1 Gap 5 — Daily 闭环)

> **Status**: shipped on `codex/sprint1-roadshow-fixes`.
> **Last updated**: 2026-08-20.

This document closes the daily loop in DailyFlow: at the end of the day the
user can hit one button to reflect on what they actually did, and the result
is a single plain Markdown file that lives next to their other notes — so
it shows up in `git diff`, can be opened in any editor, and is never
trapped behind a proprietary index.

## 1. What changed

| Layer | File | Purpose |
| --- | --- | --- |
| Built-in Skill | `src/utils/builtInSkills.ts` | Adds `builtin_daily_report` — a prompt that asks the AI chat to render a structured daily report from the user's task snapshot. |
| Server service | `server/services/v2/dailyReport.ts` | Pure renderer + IO helpers + the high-level `generateAndSaveDailyReport` orchestrator. |
| Audit | `server/repositories/v2/audit.ts` | Adds `daily_report.create` / `daily_report.read` / `daily_report.list` event kinds. |
| Routes | `server/routes/v2/index.ts` | Adds `POST/GET /api/v2/reports/daily` and `GET /api/v2/reports/daily/list`. |
| API client | `src/api/client.ts` | Adds the `reportsApi` wrapper (`generateDaily` / `readDaily` / `listDaily`). |
| UI button | `src/components/TodayScopeTabs.tsx` | Adds the "今日复盘" button to the Today tab header. |
| UI modal | `src/components/DailyReflectionModal.tsx` | The reflection editor (completed / in-progress / postponed + free-form text). |
| App wiring | `src/App.tsx` | Owns the modal state, builds the task snapshot from `tasks`, and auto-opens the modal after rollover. |
| Tests | `server/services/v2/__tests__/dailyReport.test.ts`, `src/components/DailyReflectionModal.test.tsx` | 5 server cases + 3 UI cases. |

## 2. User flow

1. **Open the Today tab.** A new **"今日复盘"** button appears next to the
   Event filter tabs (top-right of the Today header strip).
2. **Click the button** → the DailyReflectionModal opens with:
   - ✅ 今日完成 (status: `done`)
   - ⏰ 进行中 (status: `todo`)
   - ⛔ 推迟 / 取消 (status: `migrated`, with the original `source_date` as reason)
   - A free-form text area for the reflection itself.
3. **Confirm** → the server writes `Journal/YYYY-MM-DD.md` and returns the
   absolute file path. A success toast and a "已保存到 …" line in the modal
   confirm what just landed on disk.
4. **Or roll over to a new day** → as soon as the rollover completes, the
   modal auto-opens for the day that was just archived. The user can
   dismiss it if they don't want to write a journal entry.

## 3. Persistence contract

- **Location**: `<workspaceRoot>/Journal/YYYY-MM-DD.md`
- **Format**: Plain UTF-8 Markdown. No frontmatter; the file is human-editable
  and `git diff`-friendly.
- **One file per day**: rewriting a date overwrites the previous journal.
  (Daily notes are also one-file-per-day, so this mirrors the convention.)
- **No AI server-side**: the renderer is a deterministic pure function
  (`renderDailyReport`) that the UI can also call from `<AIChat>` via the
  matching `builtin_daily_report` skill if the user wants the LLM to draft
  the report. Either way, the final Markdown that lands on disk is the same
  shape.
- **Audit**: every save appends a `daily_report.create` entry to the v2
  audit log (`.dailyflow/audit.jsonl`).

## 4. API

```http
POST /api/v2/reports/daily
Content-Type: application/json

{
  "date": "2026-08-20",
  "reflection": "进展：v2.0 已发布 …",
  "snapshot": {
    "completedTasks":   [{ "id": "...", "title": "...", "tags": ["..."] }],
    "inProgressTasks":  [{ "id": "...", "title": "...", "progress": "..." }],
    "postponedTasks":   [{ "id": "...", "title": "...", "reason":   "..." }]
  }
}
```

Response:

```json
{ "ok": true, "report": { "date": "2026-08-20", "filePath": "/…/Journal/2026-08-20.md", "byteSize": 1234 } }
```

```http
GET /api/v2/reports/daily?date=2026-08-20
→ { "ok": true, "date": "2026-08-20", "markdown": "…", "exists": true }
```

```http
GET /api/v2/reports/daily/list?year=2026&month=8
→ { "ok": true, "year": 2026, "month": 8, "total": 2,
     "reports": [
       { "date": "2026-08-19", "filePath": "…/Journal/2026-08-19.md", "byteSize": 900 },
       { "date": "2026-08-20", "filePath": "…/Journal/2026-08-20.md", "byteSize": 1234 }
     ] }
```

## 5. File format example

See `Journal/2026-08-20.md` for the live example. The renderer always
emits the same skeleton so downstream tooling (e.g. weekly reports) can
parse it back without relying on AI:

```markdown
# 日报 · 2026-08-20

## 元信息
- 日期：2026-08-20
- 生成时间：09:15
- 完成率：50% (2/4)
- 完成 / 进行中 / 推迟：2 / 1 / 1

## ✅ 今日完成
### launch
- **发布 v2.0** #launch #work

### work
- **客户演示** #work

## ⏰ 进行中
- **整合用户反馈** — 已收集 12 条

## ⛔ 推迟 / 取消
- **迁移旧数据库** — 原因：等待运维确认

## 💭 今日复盘
进展：v2.0 已发布，演示顺利。
卡点：反馈响应慢。
启发：先把质量门做扎实。

## 🎯 明日聚焦
_（请基于以上复盘填写明日 Top 3）_
```

## 6. Tests

```bash
# 5 server-side cases (renderer + IO + orchestrator)
npx vitest run server/services/v2/__tests__/dailyReport.test.ts

# 3 UI cases (prefill + confirm + cancel)
npx vitest run src/components/DailyReflectionModal.test.tsx
```

Expected: `5 passed` + `3 passed`.

## 7. Edge cases / non-goals

- **No network calls**: the renderer is pure; the AI is opt-in via the
  `builtin_daily_report` skill that the user can invoke from `<AIChat>`.
- **Concurrent writes**: `writeDailyReport` is a single `fs.writeFile`
  on a file the user owns. Two near-simultaneous saves from the same
  client race; the last write wins. (We don't need atomic semantics for a
  personal journal.)
- **Migration of old journals**: there is no migration. `Journal/` is a
  brand-new directory; existing users start fresh.
- **Mobile Capture parity**: the Mobile Capture protocol already lets a
  phone push a daily note; this slice does not add a Mobile entry point
  for daily reports. The file format is intentionally compatible so a
  future PR can extend the mobile schema to POST `/reports/daily`.
- **Weekly roll-up**: this slice does not yet have a "compile weekly
  report from daily reports" feature. The deterministic section headers
  make that easy to add later without re-architecting the renderer.
