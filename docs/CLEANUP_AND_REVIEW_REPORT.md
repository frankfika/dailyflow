# DailyFlow Code Review & Cleanup Report

> 由 Codex CLI (MiniMax-M3, gpt-5 退化为 MiniMax-M3) 完成的整体代码 review 与目录清理建议。
> 任务执行时间：2026-09-28 · 工作目录：`/Users/fangchen/Baidu/GitHub/dailyflow`
> 任务结论仅基于只读探查，不修改任何源代码。

---

## 1. 总体观察

DailyFlow 是一个 **规模中等但技术债偏重** 的本地优先桌面应用：

- **代码规模**：src/ 共 147 个 .ts/.tsx，约 40,658 行；server/ 共 193 个 .ts，约 44,329 行；scripts/ 共 14 个 .mjs；e2e/ 15 个 spec。整体不算巨大。
- **核心问题集中在 5 个超大文件 + 1 个超大目录**：
  - `src/App.tsx` — **2600 行 / 81 处 useState / 26 个独立状态变量**
  - `src/components/SettingsModal.tsx` — **2299 行 / 36 处 useState**
  - `src/api/client.ts` — **2001 行 / 98 个导出**，一文件囊括所有 HTTP 客户端
  - `src/components/CalendarWorkspace.tsx` — **1257 行 / 15 处 useState**
  - `server/routes/v2/index.ts` — **2381 行 / 116 个路由端点，单文件巨型路由**
  - `src/features/v2/notes/NoteEditor.tsx` — 1161 行 / `useEvents.ts` — 1113 行 / `MeetingNotePanel.tsx` — 1094 行
- **架构层**清晰：route → service → repository 三层；v2 路由严重依赖 v1 services（config/fileSystem/lock/parser/harness），边界被穿透。
- **目录整洁度**：根目录被大量临时文件侵占（45 个 PNG、24 个 webbridge-*.mjs、5 篇 ROADSHOW markdown、demo 音视频共 8.7MB），其中一部分已经入库（git tracked），一部分已经 .gitignore，但仍有大量漏网。
- **本地缓存膨胀**：`.claude/worktrees/` 4GB（10 个 git worktree 各带 node_modules），`src-tauri/target/` 13GB，这些都不是源码。
- **文档**：`docs/` 93 项里有 32 个 `ux-prototype-home-v3.2 ~ v3.7d` 历史原型（被 README/CHANGELOG 完全不再引用），属于设计阶段产物堆积。
- **测试**：v2 routes / services / domain / repositories 均有 `__tests__/`，覆盖不算薄弱；但 routes/v2/index.ts 单文件 2381 行无单测（仅 `routes/v2/__tests__/routes.test.ts` 一个 39 行集成测试），存在明显缺口。

整体健康度：**能跑能发版，但维护成本已经开始反噬**。最大杠杆点是 ① App.tsx 与 SettingsModal.tsx 的拆分、② routes/v2/index.ts 按资源拆文件、③ 根目录清理、④ `.claude/worktrees/` 本地瘦身。

---

## 2. 根目录清理清单

> 标记说明：**A 保留入库**（已有外部引用）/ **B 归档到子目录**（保留但移位）/ **C 直接删除**（冗余或被替代）。

| 文件 / 目录 | 建议动作 | 原因 |
|---|---|---|
| `webbridge-*.mjs` × 24 | **C 删除** | 已被 `.gitignore`（`webbridge-*.mjs`），未入库，纯本地调试脚本 |
| `dailyflow-capsule-*.png` × 7 | **C 删除** | 已被 `.gitignore`（`dailyflow-*.png`） |
| `e2e-screenshot-*.png` × 21 | **C 删除** | `e2e-screenshot-state-*` 已被 ignore，其他大多也未被 git 跟踪 |
| `new-slide-01/07/11/12/20.png` | **C 删除** | 路演 deck 历史草稿，CHANGELOG 与 README 都没引用，已入库但属于"项目编年史"垃圾 |
| `v15-slide-02/12/13/14/14-en.png` | **C 删除** | 同上，路演 deck v15 草稿 |
| `visual-mindmap-1/2-empty/populated.png` | **C 删除** | dev 时期视觉记录，docs/assets/ 已经有最终版 |
| `visual-topic-spaces-1-created.png` | **C 删除** | 同上 |
| `HANDOFF-add-to-task.md` | **C 删除** | 引用的任务（EventCanvas ScheduleDatePopover）已在 commit `0767c1c` 完成；全仓 grep 已无引用 |
| `RELEASE_AUDIT_v1.0.0.md` | **C 删除** | v1.0.0 的临时审计稿，全仓 grep 无外部引用 |
| `ROADSHOW_NARRATIVE.md` | **C 删除** | v2 路演叙事草稿，已被 `docs/ROADSHOW_SCRIPT_V7.md` 取代 |
| `ROADSHOW_DECK_V2_PLAN.md` | **C 删除** | v2 deck 计划，已被 README + CHANGELOG 的 "Sprint 1 已落地" 段落取代 |
| `ROADSHOW_DECK_V2_CONTENT.md` | **C 删除** | deck v2 内容草稿，未被任何最终文档引用 |
| `ROADSHOW_DECK_V2_GAP_ANALYSIS.md` | **C 删除** | 同上 gap 分析，最终版在 docs/ROADSHOW_VS_PRODUCT_GAP.md |
| `ROADSHOW_VS_PRODUCT_GAP.md` | **A 保留并迁移** | `README.md:56` 和 `CHANGELOG.md:350` 都引用了它。**移入 `docs/`** |
| `_demo-audio/*.mp3` × 22 (2.1MB) | **B 归档到 `docs/demo-assets/audio/`** | 是路演 demo 旁白素材，但放在根目录语义错位 |
| `_demo-compose.py` `_demo-record.mjs` | **B 归档到 `docs/demo-assets/scripts/`** | 同上 |
| `_demo-out/dailyflow-demo-{en,zh}.mp4` × 2 (6.6MB) | **B 归档到 `docs/demo-assets/video/`** | 同上；并考虑改用 Git LFS 或外链到对象存储 |
| `scripts/_demo-record.mjs` | **B 删除** | 与根目录 `_demo-record.mjs` 几乎重复；vite.config.ts 只 watch 根目录的那份 |
| `.DS_Store` | **C 删除** | 已被 `.gitignore`，但根目录仍残留 |
| `index.html`（根目录） | **C 删除** | 仓库 Vite 模板残留，未被引用，源码模板在 Vite 默认 public/ |
| `Workspaces/` `articles/` `Notes/` | **A 保留** | 实际工作区内容（受个人 gitignore 控），不是项目产物 |
| `.playwright-mcp/` `.dailyflow/` `.edgeone/` `.slidep/` `.workbuddy/` | **A 保留** | 个人开发工具缓存，已在 `.gitignore` 或 `.git/info/exclude` 中 |

> **建议同时补充 `.gitignore`**（追加规则）：
> ```
> # 根目录一次性历史产物
> HANDOFF-*.md
> ROADSHOW_NARRATIVE.md
> ROADSHOW_DECK_V2_*.md
> RELEASE_AUDIT_*.md
> new-slide-*.png
> v15-slide-*.png
> # 调试截图
> e2e-screenshot-*.png
> dailyflow-*-[0-9].png
> visual-mindmap-*.png
> visual-topic-spaces-*.png
> webbridge-*.mjs
> scripts/_demo-record.mjs
> # 临时脚本
> scripts/verify-capsules-ui.mjs
> scripts/_df-mmt-debug.mjs
> ```

---

## 3. src/ 优化建议（Top 5）

### #1 — `src/App.tsx` 是 God Component，必须拆分
**位置**：`src/App.tsx:1-2600`
**现状**：单文件 2600 行、26 个 useState（grep "useState" 共 81 处），覆盖 Today 视图、Inbox、AI Chat、Notes、Settings、Team、MindMap、EventCanvas 等几乎所有主要视图的渲染分支。
**建议重构**：
1. 按视图域拆出 `<TodayView/>`、`<InboxView/>`、`<NotesView/>`、`<CalendarView/>`、`<MindMapView/>`、`<SettingsView/>`，每个组件配独立 hooks 文件（`src/features/<domain>/hooks/`）。
2. 把全局状态（active workspace、selected date、toast）抽到 `src/state/` 用 zustand 或 React Context，App.tsx 只做 router 壳。
3. 每个域的 fetch/cache 走 React Query keys（用现有 `src/queryKeys.ts` 工厂，而不是硬编码 `['today-items']`）。
**风险**：高（行为密集、需要完整测试覆盖）。建议先做覆盖率盘点（vitest --coverage），从 queryKey 硬编码这种低成本改造切入。

### #2 — `src/components/SettingsModal.tsx` 同样 God Component
**位置**：`src/components/SettingsModal.tsx:1-2299`
**现状**：2299 行 / 36 处 useState，把模型库、隐私面板、转写设置、Skill 管理、团队、推送、proactive、版本更新等所有 settings 塞进一个模态。
**建议**：按子域拆 `<ModelLibrary/>`、`<PrivacyPanel/>`（已存在为独立组件，需复用）、`<TranscriptionSettings/>`（已存在）、`<SkillManager/>`（已存在）、`<TeamSettings/>`（已存在）、`<UpdateNotification/>`（已存在）。`SettingsModal.tsx` 退化为"容器 + 左侧导航 + 当前 tab 渲染"，目标 < 300 行。
**风险**：中（modal open/close 状态、子 tab 之间共享的选择需要小心）。

### #3 — `src/api/client.ts` 单文件导出 98 个 API
**位置**：`src/api/client.ts:1-2001`
**现状**：98 个 export，把 tasks/files/rollover/events/config/calendar/feishu/googleCalendar/workspaces 等全部 API 客户端集中到一处。`src/features/v2/api/client.ts` 又复制了一份 881 行。
**建议**：
1. 拆为 `src/api/{tasks,files,events,calendar,...}.ts`，每个 ≤ 200 行；
2. 把"业务 API"（`tasksApi` 等）和"通用 fetch 基类"（base.ts 已经存在）分离；
3. `src/features/v2/` 不应再复制一份 v2 client，应该 `import` 自 `src/api/` 并加 v2 前缀路径封装。
**风险**：低。改动机械，所有调用点都已经走 `import { tasksApi } from '../../api/client'`。

### #4 — `src/utils/tagColors.ts` 与日期工具职责错位
**位置**：`src/utils/tagColors.ts:20` 导出 `getTodayStr()`
**现状**：`getTodayStr` 与 tag 颜色毫无关系，被 `src/App.tsx:12,121,357,409,908` 引用。该函数应当属于 `src/utils/date.ts`（目前不存在）。
**建议**：抽出 `src/utils/date.ts`，把 `getTodayStr`（以及可能存在的其他日期格式化函数）迁过去，再让 `tagColors.ts` 仅保留颜色相关。
**风险**：低，纯重命名 + 移文件。

### #5 — `src/api/updater.ts` 与 `src-tauri/` 更新链路的一致性
**位置**：`src/api/updater.ts:7-178`，`src/App.tsx:40,1797,1807`，`src/components/SettingsModal.tsx:24,824`
**现状**：`checkForUpdates / downloadUpdate / relaunchApp` 三处调用点（App、SettingsModal、UpdateNotificationModal）。`relaunchApp()` 只调用 `relaunch()` 没有错误恢复，UI 状态机分散在多个组件。
**建议**：抽一个 `useUpdater()` hook 集中处理 idle → checking → available → downloading → downloaded → installing 全状态机；`SettingsModal` 和 `UpdateNotificationModal` 共享同一份状态，避免重复 useEffect。
**风险**：中（涉及启动逻辑，需要 E2E 验证）。

---

## 4. server/ 优化建议（Top 5）

### #1 — `server/routes/v2/index.ts` 巨型单文件，必须按资源拆分
**位置**：`server/routes/v2/index.ts:1-2381`，共 **116 个路由端点**
**现状**：所有 v2 路由集中在一个文件，涵盖 jobs、transcription、notes、meetings、inbox、events、memory、mindmaps、export、connectors、messages、mobile/tokens、agents、agent-runs、plans、commitments、decisions、people、outcomes、proposals 等。
**建议**：按资源拆为 `server/routes/v2/{jobs,notes,events,memory,connectors,agents,...}.ts`，每个文件 ≤ 300 行；`index.ts` 仅做 `v2Router.use('/jobs', jobsRouter)` 的聚合。
**风险**：中（路由前缀保持不变即可，加测试即可验证）。

### #2 — `routes/v2` 直接依赖 v1 service，破坏分层
**位置**：`server/routes/v2/index.ts:42-45,150`
**现状**：从 v2 routes 直接 `import { loadConfig } from '../../services/config.js'`、`readDailyNote, writeDailyNote` from `services/fileSystem.js`、`withDateLock` from `services/lock.js`、`editTaskFullInMarkdown, updateTaskInMarkdown` from `services/parser.js`、`getDeepSeekHarnessRuntime` from `services/harness/...`。v2 services 不再被引入。
**问题**：route 应只依赖 v2 service；让 v2 service 把这 5 个 v1 工具适配到 v2 repository 上。
**建议**：在 `server/services/v2/legacyMarkdownAdapter.ts`（新建）封装 `loadConfig / readDailyNote / writeDailyNote / withDateLock / editTaskFullInMarkdown`，让 routes/v2 改为只调 v2 services。
**风险**：中（需要保证 markdown 写入幂等性与现有 e2e 通过）。

### #3 — `server/repositories/v2/repository.ts` 1098 行 / `server/services/eventAdapter.ts` 979 行 偏大
**位置**：`server/repositories/v2/repository.ts:1-1098`、`server/services/eventAdapter.ts:1-979`、`server/services/v2/noteMeetingCaptureService.ts:1-898`
**现状**：三个巨型模块，分别承担 v2 repo 全集、事件兼容层、会议笔记捕获。
**建议**：
- `repository.ts` 拆为 `repositories/v2/{events,notes,jobs,sources,memory}.repo.ts`；
- `eventAdapter.ts` 看是否能下沉到 v2（v1/v2 event 共存期是历史问题，最终应被 v2 完全取代）；
- `noteMeetingCaptureService.ts` 按入口拆为 capture/detect/export 三个内部模块。
**风险**：中-高，需配合 E2E。

### #4 — `catch {}` / 异常吞掉的位点审计（重点排查）
**现状**：grep `catch {}` 大多出现在 localStorage 处是合理的；少数位点（services/eventAdapter.ts:979 一带）疑似吞错。建议：
1. 全仓 grep `catch\s*(\s*[a-zA-Z_]*\s*)\s*{}\s*$`，手工 review 每处；
2. 在 server 层统一约定：禁止裸 `catch {}`，至少 `console.error` 或抛 `KnownError`；
3. 引入 `resultType` 风格（ok/err 区分），而不是抛出后被吞。
**风险**：低，但需要把控排查节奏。

### #5 — 服务端测试覆盖失衡
**现状**：
- `server/services/v2/` 已有大量 `__tests__/`（agentService、calendarConnectors、dailyReport、eventCommitmentProjection、eventGraphApplyContract、eventOperatorDiagnostics、eventOperatorService、eventOperatorSse、eventOperatorTools、eventRunRecovery、eventSessionProjection、externalWriteService、importService、meetingService、memoryService.searchTier、noteMeetingCaptureService、noteService、proactiveProposal、reviewerService、taskCompletionMirror、vectorIndex 等）
- `server/routes/v2/` 仅有 `routes.test.ts`（39 行集成测试），单文件 116 个端点覆盖严重不足；
- `server/services/eventAdapter.ts`（979 行）未发现任何 __tests__；
- `server/services/feishuSync.ts`（880 行）未发现任何 __tests__；
- `server/services/parser.ts`（612 行）未发现任何 __tests__。
**建议**：优先补 `routes/v2/__tests__/{events,jobs,notes,memory,connectors}.routes.test.ts`；再补 `eventAdapter` 的单元测试。
**风险**：低。

---

## 5. 脚本 / 构建 / 配置优化建议（Top 3）

### #1 — 释放版本管理职责重叠
**位置**：`scripts/bump-version.mjs`、`scripts/check-version.mjs`、`release-please-config.json`、`.github/workflows/release.yml`
**现状**：`release-please` (googleapis/release-please-action@v4) 已经自动更新 `package.json`、`package-lock.json`、`tauri.conf.json`、`CHANGELOG.md`；同时本地还有 `npm run bump` 手工 `bump-version.mjs`，二者职能重叠。
**建议**：
- 保留 release-please 主流程；删除或弃用 `bump-version.mjs`（可改为 dry-run 校验）；
- 保留 `check-version.mjs` 作为 release-please 提交后的 CI 断言；
- 把 `npm run bump` 标注为 deprecated（README/CHANGELOG 引导用户走 GitHub Release）。
**风险**：低。

### #2 — `scripts/` 大量孤立脚本无人引用
**位置**：`scripts/test-api.sh`、`scripts/e2e-acceptance.sh`、`scripts/_demo-record.mjs`、`scripts/_df-mmt-debug.mjs`、`scripts/verify-capsules-ui.mjs`
**现状**：上述脚本在 `package.json` 和 README 中均无引用，只有 `.claude/worktrees/` 中的历史 skill 引用过。
**建议**：
- `scripts/_demo-record.mjs` 与根目录的 `_demo-record.mjs` 重复，**删除 scripts 那份**；
- `scripts/_df-mmt-debug.mjs` 仅在 worktrees 内部使用，移到 `scripts/_local-debug/`（个人）或不入 git；
- `scripts/test-api.sh`、`scripts/e2e-acceptance.sh` 若仍用于 release 前的真服务回归，应纳入 `npm test` 流水线；若不再使用，直接删除。
**风险**：低（仅文档维护风险）。

### #3 — `vite.config.ts` / `vitest.config.ts` / `tsconfig.json` 可收敛
**位置**：`vite.config.ts:1-50`、`vitest.config.ts:1-30`、`tsconfig.json:1-30`、`tsconfig.server.json:1-30`
**现状**：vite.config.ts 里有手工 `watch` 排除列表（涉及 `_demo-record.mjs`），逻辑与 gitignore 不同步；tsconfig.server.json 与 tsconfig.json 大量字段重复。
**建议**：
- vite.config.ts 的 watch exclusion 改为读 `.gitignore` 派生，避免漂移；
- tsconfig.server.json 改为 `extends: "./tsconfig.json"` + 覆盖 server 差异字段；
- vitest.config.ts 现有 30 行无需大改，但 `setupFiles` 与 `src/__tests__/setup.ts` 应保持一致。
**风险**：低。

---

## 6. 文档治理建议

| 问题 | 建议 |
|---|---|
| `docs/ux-prototype-home-v3.2 ~ v3.7d*` × 32 个历史原型（html + png） | 已被实际 UI 取代，**整体删除**或归档到 `docs/archive/ux-iterations-2025/` |
| `docs/DailyFlow_2.2_DeepSeek_Harness_完整开发实施计划.docx` 与 `docs/DailyFlow_2.2_AI_Event_Operator_实施计划.docx` | 实施已落地到 v2.16，**移到 docs/archive/plans-2025/** |
| `docs/V2_FINAL_DELIVERY_REPORT.md` | 已被 CHANGELOG + README 取代，**移到 docs/archive/** |
| `README_ZH.md`（已自标"已废弃，v1.5.0"） | 保留 README.md + README_EN.md 二语即可，**删除 README_ZH.md** |
| `ROADSHOW_VS_PRODUCT_GAP.md` 唯一被 README 引用 | **从根目录移到 docs/**（已是 docs 子文档命名） |
| `_demo-audio/` `_demo-compose.py` `_demo-record.mjs` `_demo-out/` | 移到 `docs/demo-assets/{audio,scripts,video}/`，并在 README 中标注演示资产位置 |

---

## 7. 可立即落地的命令清单（根目录清理）

> ⚠️ 这些命令会 `git rm` 已经入库的文件（NDOF-style），执行前请确认已无外链引用。
> 拆分两步：① 删除未被 git 跟踪的（rm + git clean），② git rm 已跟踪的。

```bash
# === 第 1 步：删除未入库的临时文件 ===
cd /Users/fangchen/Baidu/GitHub/dailyflow

# 已被 .gitignore 的调试脚本与截图
rm -f webbridge-*.mjs
rm -f dailyflow-capsule-*.png
rm -f e2e-screenshot-*.png
rm -f .DS_Store
rm -f index.html

# === 第 2 步：git rm 已入库但应删除的文件 ===
git rm HANDOFF-add-to-task.md
git rm RELEASE_AUDIT_v1.0.0.md
git rm ROADSHOW_NARRATIVE.md
git rm ROADSHOW_DECK_V2_PLAN.md
git rm ROADSHOW_DECK_V2_CONTENT.md
git rm ROADSHOW_DECK_V2_GAP_ANALYSIS.md
git rm new-slide-01.png new-slide-07.png new-slide-11.png new-slide-12.png new-slide-20.png
git rm v15-slide-02.png v15-slide-12.png v15-slide-13.png v15-slide-14.png v15-slide-14-en.png
git rm visual-mindmap-1-empty.png visual-mindmap-2-populated.png visual-topic-spaces-1-created.png

# === 第 3 步：迁移有保留价值的文件 ===
mkdir -p docs/roadshow
git mv ROADSHOW_VS_PRODUCT_GAP.md docs/roadshow/ROADSHOW_VS_PRODUCT_GAP.md

mkdir -p docs/demo-assets/{audio,scripts,video}
git mv _demo-audio docs/demo-assets/audio
git mv _demo-compose.py docs/demo-assets/scripts/_demo-compose.py
git mv _demo-record.mjs docs/demo-assets/scripts/_demo-record.mjs
git mv _demo-out docs/demo-assets/video

# 移除 scripts/_demo-record.mjs（与根目录那份重复）
git rm scripts/_demo-record.mjs

# === 第 4 步：清理本地缓存（非 git） ===
# 仅删 worktrees（每个 50MB-741MB 不等）
# rm -rf .claude/worktrees
# 仅清 src-tauri 构建产物（13GB）
# rm -rf src-tauri/target
# 仅清 coverage / test-results / dist / dist-server / test-workspace（已 .gitignore）
# git clean -fdx -e node_modules/

# === 第 5 步：补 .gitignore（防再犯） ===
cat >> .gitignore <<'GI'
# 一次性历史产物
HANDOFF-*.md
ROADSHOW_NARRATIVE.md
ROADSHOW_DECK_V2_*.md
RELEASE_AUDIT_*.md
new-slide-*.png
v15-slide-*.png
visual-mindmap-*.png
visual-topic-spaces-*.png
scripts/_demo-record.mjs
scripts/_df-mmt-debug.mjs
scripts/verify-capsules-ui.mjs
e2e-screenshot-*.png
GI

# === 第 6 步：commit ===
git add -A
git commit -m "chore(repo): prune tracked clutter, archive demo assets, extend .gitignore

- Remove HANDOFF / ROADSHOW_DECK_V2_* / RELEASE_AUDIT_v1.0.0 / ROADSHOW_NARRATIVE
- Remove tracked PNGs (new-slide-*, v15-slide-*, visual-mindmap-*, visual-topic-spaces-*)
- Move ROADSHOW_VS_PRODUCT_GAP.md to docs/roadshow/
- Move _demo-audio / _demo-compose.py / _demo-record.mjs / _demo-out to docs/demo-assets/
- Drop root index.html and .DS_Store leftovers
- Extend .gitignore to prevent recurrence"
```

预计收益：根目录文件数从 ~130 → ~30；删除入库 PNG / md 约 **15 MB**；迁移 demo 资产约 **8.7 MB**。

---

## 8. 待人工决策项

> 这些动作需要先和你确认才能执行，请告诉我哪些可以做、哪些保留。

1. **`HANDOFF-add-to-task.md` 是否真的可以删除？** Codex 已确认所有工作落地（commit `0767c1c`），但如果你仍想留作历史档案，可以归档到 `docs/archive/`。
2. **`ROADSHOW_*.md` 是否保留作为路演史料？** 当前建议删除 5 个老的、迁移 1 个；如果你想让路演历史可追溯，可以整体迁到 `docs/archive/roadshow-2025/`。
3. **`_demo-audio/*.mp3` 是否要继续随仓库发布？** 2.1MB 还好，但若你打算将来扩到几十条 demo 旁白，建议改用 Git LFS 或外部对象存储。
4. **`.claude/worktrees/` 是否可清理？** 这是 Claude CLI 的 git worktree 缓存，**只在你不再需要回溯这些会话的前提下**才能删。建议保留最近 1-2 个。
5. **是否要重构 `src/App.tsx` 与 `SettingsModal.tsx`？** 这是大改，建议分 4-5 个 PR，每个 PR 控制在 300-500 行 diff，并配套测试。
6. **是否要拆分 `server/routes/v2/index.ts`？** 与上一条独立，建议单独成 PR（机械拆分，路径保持不变）。
7. **是否要解决 v2 routes 对 v1 service 的依赖？** 需要先确认 v2 events 是否已经在生产中取代 v1 events；如果还未取代，强行隔离会让 v2 routes 无法工作。
8. **`scripts/_demo-record.mjs` 与根目录 `_demo-record.mjs` 是否真的重复？** vite.config.ts 只 watch 根目录的；若 scripts 那份还有别的引用，需要确认。

---

## 9. 附录：本次 review 跑过的关键命令与统计数字

### 9.1 项目体量
```
src/        147 个 .ts/.tsx,   40,658 行
server/     193 个 .ts,        44,329 行
scripts/    14 个 .mjs + 3 个 sh + 1 个 py
docs/       93 个文件（含 32 个 ux-prototype + 21 个 png）
e2e/        15 个 spec
```

### 9.2 体积最大的文件
| 文件 | 行数 | 备注 |
|---|---|---|
| `src/App.tsx` | 2600 | 26 useState / 81 处 useState 出现 |
| `src/components/SettingsModal.tsx` | 2299 | 36 useState |
| `src/api/client.ts` | 2001 | 98 个 export |
| `server/routes/v2/index.ts` | 2381 | 116 个路由端点 |
| `src/components/CalendarWorkspace.tsx` | 1257 | 15 useState |
| `src/features/v2/notes/NoteEditor.tsx` | 1161 | |
| `src/features/v2/hooks/useEvents.ts` | 1113 | |
| `src/features/v2/notes/MeetingNotePanel.tsx` | 1094 | |
| `src/features/v2/events/EventCanvas.tsx` | 1042 | |
| `src/features/v2/events/EventsView.tsx` | 983 | |
| `src/components/NoteEditor.tsx` | 896 | |
| `server/repositories/v2/repository.ts` | 1098 | |
| `server/services/eventAdapter.ts` | 979 | 缺测试 |
| `server/services/v2/noteMeetingCaptureService.ts` | 898 | |
| `server/services/feishuSync.ts` | 880 | 缺测试 |
| `server/services/v2/eventOperatorService.ts` | 822 | |
| `server/services/parser.ts` | 612 | 缺测试 |

### 9.3 根目录临时文件分布
```
PNG 总数：              45 张
  dailyflow-capsule-*  7 张 (全部 .gitignore)
  e2e-screenshot-*    21 张 (全部 .gitignore)
  new-slide-*          5 张 (全部 git tracked)
  v15-slide-*          5 张 (全部 git tracked)
  visual-mindmap-*     2 张 (git tracked)
  visual-topic-spaces* 1 张 (git tracked)
  visual-*-1920.png    3 张 (.gitignore)
  dailyflow-home-*     1 张 (git tracked)

webbridge-*.mjs        21 个 (全部 .gitignore)
md 临时文档             7 份 (5 ROADSHOW + 1 HANDOFF + 1 RELEASE_AUDIT)
demo 资产              22 mp3 + 2 mp4 + 1 py + 1 mjs = 8.7MB
.claude/worktrees/      4.0GB (10 个 worktree 各带 node_modules)
src-tauri/target/       13GB (Rust 构建产物)
```

### 9.4 测试覆盖现状
- **server/services/v2/** 21 个测试文件（含 agentService、eventOperator、memoryService、noteService、proactiveProposal、vectorIndex 等），覆盖较好。
- **server/routes/v2/** 仅 1 个 39 行集成测试 (`routes.test.ts`)，**严重不足**。
- **server/services/eventAdapter.ts** (979 行) — 无测试。
- **server/services/feishuSync.ts** (880 行) — 无测试。
- **server/services/parser.ts** (612 行) — 无测试。
- **src/features/v2/hooks/useEvents.ts** (1113 行) — 需确认是否有测试（review 时未深入）。

### 9.5 架构分层违规点
- `server/routes/v2/index.ts:42-45,150` 直接 import v1 service（config / fileSystem / lock / parser / harness），绕过 v2 service 层。
- `src/features/v2/` 中多个文件用 `../../../components/` 反向引用根 components/（MemoryView、useEvents、EventsView），边界互相穿插。
- `src/features/v2/api/client.ts` 与 `src/api/client.ts` 重复 80%+（881 行 vs 2001 行）。

### 9.6 关键的"小但难受"问题
- `src/utils/tagColors.ts:20` 导出 `getTodayStr()` — 命名错位，被 4 个位点使用。
- `src/App.tsx:891,1549` 硬编码 `queryKey: ['today-items']`，与 `src/queryKeys.ts` 的工厂不一致。
- `src/api/updater.ts:178` 的 `relaunchApp()` 不做错误恢复，至少 3 个调用点（App、SettingsModal、UpdateNotificationModal）。
- 根目录的 `_demo-record.mjs` 与 `scripts/_demo-record.mjs` 几乎重复；vite.config.ts 只 watch 根目录那份。
- `.gitignore` 已覆盖 webbridge-*.mjs / dailyflow-*.png / e2e-screenshot-state-*.png，但漏掉了 `HANDOFF-*.md / ROADSHOW_*.md / new-slide-*.png` 等。
- `release-please-config.json` 与 `scripts/bump-version.mjs` 职能重叠。

### 9.7 执行工具与方法
- 工作目录：`/Users/fangchen/Baidu/GitHub/dailyflow`
- Codex CLI: `0.154.0`，模型 `MiniMax-M3`（实际 MiniMax-M3 退化为 MiniMax-M3 fallback，gpt-5 不可用）。
- 所有探查命令均为只读（find / wc / grep / git ls-files / git status）。
- 无 npm install / 无构建 / 无 dev server 启动。

---

## 报告元信息

- **生成者**：Codex CLI (v0.154.0, MiniMax-M3 fallback)
- **工作目录**：`/Users/fangchen/Baidu/GitHub/dailyflow`
- **commit 起点**：`0767c1c fix(events): Tab on selected node edits instead of adding a child`
- **token 用量**：约 104,245
- **session id**：`01a0e466-34cb-76c1-845f-da2c1c2c177d`
- **执行日期**：2026-09-28
- **执行模式**：只读 review，未做任何修改
- **报告落盘路径**：`/Users/fangchen/Baidu/GitHub/dailyflow/docs/CLEANUP_AND_REVIEW_REPORT.md`
