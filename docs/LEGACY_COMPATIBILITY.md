# DailyFlow 兼容层清单

> 更新：2026-08-08。这里列出的兼容层都有真实运行依赖；未列出的旧实现不得重新引入。

## 已清除

- 独立 `MeetingCapture`、`/api/meetings` 和旧会议录音写入器。
- 旧 Projects REST/Markdown 写入器；V2 Project 是 `Projects/` 的唯一结构化写入器。
- 无 UI 调用的 Git REST 服务。
- `/api/thinking-workspaces` 及旧格式创建、更新、删除服务。
- 重复 Today/Review/CommitmentContext 产品壳，以及不可达的 Tags、PromptLibrary、FeishuAgenda 和辅助文件。
- 独立 V2 standalone 产品入口。

## 暂时保留

| 兼容层 | 为什么仍需保留 | 删除前必须满足 |
| --- | --- | --- |
| `/api/notes`、`server/services/notes.ts` | Today quick note、AI Chat 保存、旧日期上下文仍在调用 | 将这些入口迁移到 NoteDocument；扫描并导入真实工作区 `Notes/`；提供逐文件报告与回滚 |
| `/api/tasks`、Daily Markdown task | Today 和 Topic Space task list 的当前真实数据源 | Commitment 完整接管 Today；Legacy Adapter 报告零未迁移任务；保留原 Markdown 可读性 |
| V2 Legacy Task Adapter | 在不破坏 Daily Markdown 的前提下连接 Commitment | 所有受支持工作区完成显式迁移并通过双向引用审计 |
| Topic Space 对 `kind: workspace` 的读取 | 用户可能仍有旧 Workspaces Markdown | 可继续长期保留；读取不得自动改盘，显式更新才升级格式 |
| `POST /api/config` | 仅兼容历史打包客户端 | 当前发布策略明确不再支持旧客户端后删除；现已返回 `Deprecation` 和 `Warning` headers |
| `providerConfigs` 配置字段 | 仅作为一次性 Model Center 导入源 | 启动导入成功后写入 `modelCenter` 并删除旧字段 |
| `df_provider_configs` / `df_meeting_transcription_settings` | 仅作为浏览器本地一次性迁移源 | 成功写入 `df_model_center` 后立即删除旧 key |
| `~/.dailyflow/recordings` 历史文件 | 可能包含用户录音，不能猜测删除 | 用户确认或完成导入；当前代码不再向该目录写新录音 |

## 不属于旧版残留

- `/api/diagnostics` 是 Topic Space 数据完整性检查与定点修复能力，即使暂时没有独立 UI 也应保留。
- `src/test/setup.ts` 是 Vitest 初始化文件，不是主入口死代码。
- V2 的 `/legacy/tasks` 是有明确退出条件的迁移适配器，不是第二套 Task 写入器。

## 守门规则

1. 新功能不得写入旧会议或旧 Project 格式。
2. 保留兼容层必须在本文件写清消费者、数据路径和退出条件。
3. 删除任何数据兼容层前，先挂载真实工作区，生成只读盘点、备份和迁移结果；不得用临时测试工作区推断用户数据为空。
4. 历史报告可以描述当时实现，但当前架构以本文件、`MEETING_AI_ARCHITECTURE.md` 和统一产品实施方案为准。
