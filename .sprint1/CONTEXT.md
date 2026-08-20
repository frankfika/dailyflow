# Sprint 1 上下文（所有 agent 必读）

## 项目
- 仓库根: /Users/fangchen/Baidu/GitHub/dailyflow/.claude/worktrees/sprint1-roadshow
- 分支: codex/sprint1-roadshow-fixes
- 主仓: dailyflow (Tauri 桌面 + React 前端 + Express 服务端)
- node_modules 已通过 symlink 共享

## 关键文档
- 缺口分析（必读）: docs/ROADSHOW_VS_PRODUCT_GAP.md
- 路演 V2 内容稿: docs/ROADSHOW_DECK_V2_CONTENT.md
- 产品规范: docs/AI_NATIVE_PRODUCT_DEVELOPMENT_SPEC.md

## 关键代码位置
- 前端 API 客户端: src/api/client.ts（注意：features/v2/api/client.ts 是旧的，不要改它）
- 脑图组件: src/components/MindMap/
  - MindMapNode.tsx (节点渲染)
  - NodeContextMenu.tsx (右键菜单)
  - MindMapView.tsx (主视图)
  - templates.ts (模板)
  - layout.ts (布局)
- 服务端 services: server/services/v2/
  - memoryService.ts (搜索 — Gap 4 重点)
  - agentService.ts (AI Agent — Gap 2 重点)
  - proposalService.ts (提案系统 — Gap 3 重点)
  - localTranscriptionService.ts (本地转写 — Gap 5 重点)
- 路由: server/routes/v2/index.ts
- 共享类型: src/types/models.ts

## 代码规范
- TypeScript strict mode
- 测试: vitest + @testing-library/react
- 后端测试: vitest (e.g. server/services/v2/__tests__/integration.test.ts)
- 前端组件测试: src/components/**/*.test.tsx
- 数据迁移：不要破坏现有数据（旧的 kind=branch 行为不变）

## 测试运行
```
npx vitest run <test_file>
# 或
npx vitest run src/components/MindMap/
```

## 提交规范
每个 agent 完成后 commit 自己的改动：
```
git add -A
git commit -m "feat(sprint1): [gap-N] 描述"
```

## 不要做
- 不要改 features/v2/api/client.ts（这是旧的，请改 src/api/client.ts）
- 不要破坏现有测试
- 不要做 Slide 14 硬件
- 不要做完整电商市场
