# DSH Harness 实施基线

> 来源：DailyFlow 2.2 DeepSeek Harness 实施计划（DFH-001）
> 日期：2026-08-23
> 执行分支：历史基线记录（实施已收口到 `main`）

## 版本引用

| 项 | 值 |
|---|---|
| 当前分支 | `claude/beautiful-goldstine-8a684f` |
| HEAD | `f62a878663b82720add9ef9f9624c3beea339244`（`f62a878`） |
| 主基线（计划锁定） | `main` / `f62a878` / DailyFlow `2.1.1` |
| 目标版本 | DailyFlow `2.2` |
| 工作目录 | `/Users/fangchen/Baidu/GitHub/dailyflow/.claude/worktrees/beautiful-goldstine-8a684f` |

## 工具链版本

| 工具 | 版本 |
|---|---|
| node | `v25.2.1` |
| npm | `11.6.2` |
| TypeScript（tsc） | `5.9.3` |
| vitest | `4.1.5` |
| vite | `6.4.3` |

## 命令与结果

### 1. `npm run lint`（实为 `tsc --noEmit`）

> 注意：本项目 `lint` 脚本是 **TypeScript 全量类型检查**，不是 ESLint 风格检查。后续阶段「lint 通过」= typecheck 通过。

- 退出码：`0`
- 结果：无类型错误。

### 2. `npm test`（`vitest run`）

- 退出码：`0`
- 结果：**Test Files 108 passed**，**Tests 817 passed**（0 failed / 0 skipped），耗时 `23.53s`。
- 既有非失败警告：多个 worker 打印 `node --localstorage-file was provided without a valid path`。位于测试 worker 启动阶段，非断言失败，不影响通过性。

### 3. `npm run build`（`vite build && node scripts/verify-production-build.mjs`）

- 退出码：`0`
- 结果：2451 modules transformed；`dist/assets/main-*.js` gzip `335.55 kB`；构建 `2.00s`；`Production build verification passed: React mounted successfully.`
- 既有非失败警告：`src/features/v2/api/client.ts` 被 `meetingTranscription.ts` 动态引入、又被他处静态引入，vite warning「dynamic import will not move module into another chunk」。非致命，仅影响分包，不影响产物。

## Git 状态

- `git status --short`：仅 `?? docs/DAILYFLOW_2_2_DEEPSEEK_HARNESS_IMPLEMENTATION_PLAN.md`（规格文档，拷贝入 worktree，未提交）。
- 无用户遗留的未提交修改冲突；工作区清洁。

## 既有失败汇总

**无。** lint / 单测 / build 三项基线闸门均为 0 失败。仅存在两条既有的**非失败**警告（`--localstorage-file`、动态导入 chunk 提示），已在上文记录，后续任务不应将其误判为新增失败。

## 基线签名

三闸门全绿，可作为后续每个 DFH 任务回归对照的干净起点。

## 2026-08-26 实施收口

- DSH 生产路径锁定 `0.1.1-rc.2`，通过 ACP/stdio 启动；provider adapter 仅保留为显式 degraded 模式。
- 桌面产物包含 Node `22.19.0`、DSH profile 和依赖闭包；打包后 ACP boot 与精确 7 工具 schema 已由 `npm run check:dsh-bundle` 验证。
- 正式数据只能经 Proposal 审阅/应用写入；Run 事件持久化、SSE cursor、取消、恢复、诊断、隐私裁剪均已接入。
- 收口回归：TypeScript 通过，Vitest `128 files / 947 tests`，前端生产构建与 server/sidecar 打包通过。
