# EFP Baseline — 2026-08-10

> 任务：EFP-000 冻结基线与测试清单  
> 记录时间：2026-08-09T17:35 UTC  
> 授权范围：只读记录，零生产代码改动

---

## 1. 仓库与环境

| 项 | 值 |
|---|---|
| Branch | main |
| HEAD commit | `9214b3215afed10640912e108290bdbf7fb3f69f` |
| Node | v25.2.1 |
| npm | 11.6.2 |
| Package version | 1.5.6 |

---

## 2. 工作区改动（属于用户，非本任务）

```
 M docs/PRODUCT.md
 M e2e/smoke.spec.ts
 M src/App.tsx
 M src/__tests__/components/Sidebar.test.tsx
 M src/__tests__/components/TodayBacklog.test.tsx
 M src/components/Sidebar.tsx
 M src/components/TaskInputPanel.tsx
 M src/components/TodayBacklog.tsx
 M src/index.css
?? docs/EVENT_FIRST_IMPLEMENTATION_RUNBOOK.md
?? docs/EVENT_FIRST_PRODUCT_UPGRADE_PLAN.md
```

`git diff --check`：无空白错误。

---

## 3. 测试文件基线

### 3.1 按目录分组（合计 87 个测试文件）

**Server services / unit (25)**
- server/services/__tests__/config.test.ts
- server/services/__tests__/parser.test.ts
- server/services/__tests__/taskMetadata.test.ts
- server/services/__tests__/mindmap-v2.test.ts
- server/services/__tests__/topicSpaces.test.ts
- server/services/__tests__/diagnostics.test.ts
- server/services/__tests__/feishuCalendarTime.test.ts
- server/services/__tests__/calendarWorkspace.test.ts
- server/services/__tests__/fileSystem.test.ts
- server/services/__tests__/notes.test.ts
- server/services/__tests__/lock.test.ts
- server/services/__tests__/rollover.test.ts
- server/services/v2/__tests__/providerConfig.test.ts
- server/services/v2/__tests__/meetingService.test.ts
- server/services/v2/__tests__/noteMeetingCaptureService.test.ts
- server/services/v2/__tests__/localTranscriptionService.test.ts
- server/services/v2/__tests__/noteService.test.ts
- server/services/v2/__tests__/agentService.test.ts
- server/services/v2/__tests__/integration.test.ts
- server/services/v2/__tests__/reviewerService.test.ts
- server/services/v2/__tests__/importService.test.ts
- server/services/v2/__tests__/extractorFixture.test.ts
- server/services/v2/__tests__/followUpDetector.test.ts
- server/services/v2/__tests__/exportMobileService.test.ts
- server/services/v2/__tests__/externalWriteService.test.ts
- server/services/v2/__tests__/messageConnectors.test.ts
- server/services/v2/__tests__/calendarConnectors.test.ts

**Server routes (7)**
- server/routes/v2/__tests__/routes.test.ts
- server/routes/__tests__/mindmapNodeTask.test.ts
- server/routes/__tests__/tasksSpace.test.ts
- server/routes/__tests__/topicSpaceTasks.test.ts
- server/routes/__tests__/diagnostics.test.ts
- server/routes/__tests__/ai.test.ts

**Server domain / repositories / scripts (7)**
- server/domain/v2/__tests__/rules.test.ts
- server/repositories/v2/__tests__/atomicWrite.test.ts
- server/repositories/v2/__tests__/jobs.test.ts
- server/repositories/v2/__tests__/markdownRoundtrip.test.ts
- server/scripts/__tests__/migration.test.ts

**Client hooks / components / utils (35)**
- src/__tests__/components/TodayBacklog.test.tsx
- src/__tests__/components/Sidebar.test.tsx
- src/__tests__/components/AIChat.test.tsx
- src/__tests__/components/CalendarWorkspace.test.tsx
- src/__tests__/components/TaskCard.test.tsx
- src/__tests__/hooks/useAiSession.test.ts
- src/__tests__/hooks/useAiSessionSend.test.tsx
- src/__tests__/utils/aiToolExecutor.test.ts
- src/hooks/useMindMapActions.test.tsx
- src/types/models.test.ts
- src/api/client.test.ts
- src/utils/tagColors.test.ts
- src/components/MindMap/MindMapView.mirror.test.tsx
- src/components/MindMap/MindMapNode.kind.test.tsx
- src/components/MindMap/MindMapCanvas.test.ts
- src/components/MindMap/NodeContextMenu.test.tsx
- src/components/MindMap/MindMapView.autosave.test.tsx
- src/components/MindMap/templates.test.ts
- src/components/MindMap/layout.test.ts
- src/components/TopicSpaceView/TaskListView.test.tsx
- src/components/TopicSpaceView/TagFilterRow.test.tsx
- src/components/TopicTabs/TopicTabs.test.tsx
- src/components/WorkspaceSetup.test.tsx
- src/components/WorkspaceSwitcher.test.tsx
- src/features/v2/notes/MeetingNotePanel.test.tsx
- src/features/v2/api/client.test.ts
- src/features/v2/notes/NotesView.test.tsx
- src/features/v2/memory/MemoryView.test.tsx
- src/features/v2/hooks/useNotes.test.tsx
- src/features/v2/notes/NoteList.test.tsx
- src/features/v2/notes/NoteEditor.test.tsx
- src/features/v2/components/States.test.tsx

**E2E (1)**
- e2e/smoke.spec.ts (Playwright)

---

## 4. EFP-000 基线命令结果

### 4.1 npm run lint
- 启动时间：2026-08-09T17:35:13Z
- 命令：`tsc --noEmit`
- 结果：PASS
- Exit code：0
- 错误数：0

### 4.2 指定 vitest 集合（6 个文件）
文件列表：
- server/services/__tests__/mindmap-v2.test.ts
- server/routes/__tests__/mindmapNodeTask.test.ts
- server/routes/__tests__/tasksSpace.test.ts
- src/hooks/useMindMapActions.test.tsx
- src/components/MindMap/NodeContextMenu.test.tsx
- src/__tests__/components/TodayBacklog.test.tsx

- 启动时间：2026-08-09T17:35:30Z
- Vitest 版本：v4.1.5
- 结果：PASS
- Test Files：6 passed (6)
- Tests：58 passed (58)
- Duration：7.11s

### 4.3 npm run build
- 启动时间：2026-08-09T17:35:46Z
- 子命令：vite build + verify-production-build.mjs
- 结果：PASS
- 产物：
  - dist/index.html (0.43 kB)
  - dist/assets/main-Fk9Zpuer.css (147.33 kB / gzip 23.06 kB)
  - dist/assets/main-DgDmAqA1.js (1,274.82 kB / gzip 376.74 kB)
- Build time：4.36s
- Production build verification：passed

---

## 5. 关键领域服务现状

| 服务文件 | 路径 | 测试覆盖 |
|---|---|---|
| TopicSpaces | server/services/topicSpaces.ts | topicSpaces.test.ts |
| MindMaps | server/services/mindmaps.ts | mindmap-v2.test.ts |
| Tasks / parser | server/services/parser.ts | parser.test.ts |
| Task metadata / index | server/services/taskMetadata.ts + taskIndex | taskMetadata.test.ts |
| Daily write lock | server/services/lock.ts | lock.test.ts |
| File system | server/services/fileSystem.ts | fileSystem.test.ts |
| Rollover | server/services/rollover.ts | rollover.test.ts |
| v2 feature flags | server/services/v2/featureFlags.ts | providerConfig.test.ts (部分) |
| Config | server/services/config.ts | config.test.ts |

---

## 6. 本任务文件改动

| 文件 | 改动类型 |
|---|---|
| docs/event-first/BASELINE.md | 新建 |
| docs/event-first/ACCEPTANCE_CHECKLIST.md | 新建 |

确认：未修改 `src/`、`server/`、`e2e/` 下任何文件。
