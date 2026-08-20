# Task → MindMap 回写机制

> Sprint 1 缺口 7 · 路演 Slide 04 收束句"思考过程永远留在原地"的实现说明

## 目的

任务完成时，关联的脑图节点 **不被删除**，而是把完成状态/时间/摘要写回节点。节点保持原位，决策痕迹可追溯。

## 触发方式

### 自动（隐式）

`POST /api/v2/commitments/:id/complete` 完成时，若 commitment 携带 `legacyTaskId`，会同步触发回写。回写失败不会阻塞任务完成响应（try/catch + log warning）。

### 显式

`POST /api/v2/mirror/task-completion`

```json
{
  "taskId": "t_abc123",
  "taskDate": "2026-08-20",
  "completedAt": "2026-08-20T09:15:00.000Z",
  "outcomeSummary": "doc shipped"
}
```

## 行为

找到 `kind === 'task'` 且 `taskId === input.taskId` 的节点，patch：

- `status: 'done'`
- `note`: 现有 note + `\n\n## 完成 · YYYY-MM-DD\n_完成时间：..._\n[outcomeSummary]`
- `taskDate`: 重新盖戳

非 task 节点（branch / question / risk / resource）即使 taskId 相同也不动。

## 幂等性

- 多次调用，节点始终是 `status='done'`
- note 会追加多次"完成"块（保留历史同步记录），不去重

## 失败处理

- 单个节点 / 单张脑图失败不阻塞其他
- 整体失败也不阻塞任务完成（隐式触发路径）
- 错误打 `console.warn` + 跳过

## 数据迁移

- 现有 v1 节点（`kind` 缺失）默认按 `branch` 处理，不会被本机制改写
- 仅 `kind === 'task'` 的节点会受影响

## 相关文件

- `server/services/v2/taskCompletionMirror.ts` — 核心实现
- `server/services/v2/__tests__/taskCompletionMirror.test.ts` — 8 个测试
- `server/routes/v2/index.ts` — 路由（line 868 隐式 + line 915 显式）
- `src/api/client.ts` — `mirrorApi.taskCompletion()`
- `docs/ROADSHOW_VS_PRODUCT_GAP.md` — 缺口 7
