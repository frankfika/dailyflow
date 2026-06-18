# DailyFlow 路线图

> 原则：先验证最核心的「Markdown 自动迁移」价值，再扩展项目、思维导图和同步体验。

---

## Phase 0：需求与样本整理

时间：1 周

- 收集 20-50 个真实日记文件样本。
- 梳理标题结构、任务写法、附件写法、已完成写法。
- 确定路径模板和日期解析规则。
- 输出解析测试样例。

交付物：

- `fixtures/daily_notes/` 样本。
- Markdown parser 测试清单。
- 最终 MVP 范围确认。

## Phase 1：CLI 原型

时间：3-5 天

- `dailyflow scan`：扫描日记目录。
- `dailyflow today`：输出今日任务。
- `dailyflow rollover --to 2026-05-04 --dry-run`：预览迁移。
- `dailyflow rollover --apply`：执行迁移。

验收：

- 能处理中文路径。
- 能保留缩进子任务。
- 能输出 diff。
- 能避免重复迁移。

## Phase 2：Web MVP

时间：1-2 周

- 今日视图。
- 任务勾选写回 Markdown。
- 迁移预览和确认。
- 设置页：日记目录、路径模板、迁移规则。
- SQLite 增量索引。

验收：

- Docker 或本地命令可启动。
- 页面可在桌面浏览器稳定使用。
- 每次写入前有 hash 检查。

## Phase 3：思考工作台

时间：1-2 周

- 新增 Workspaces 顶级入口。
- 为目标、问题、note 片段或复杂 task 创建独立 `Workspaces/` Markdown 文件。
- 支持 Intent、Scratchpad、Brief、Journey、Tasks、Timeline 六个区块。
- 支持从 workspace 生成下一步 task，并投放到 Today、未来日期或项目。
- AI 整理思路、规划推进路径、生成下一步任务，全部先进入 preview。
- 先用 Markdown outline / Mermaid mindmap 表达脑图。

验收：

- 用户可以不依赖 task，直接创建一个思考空间。
- 用户可以从 task / note / project / Cmd+K 创建 workspace。
- 零散想法可以被 AI 整理为 brief、journey 和下一步任务。
- Today task 能显示来源 workspace，并在完成后回写 workspace timeline。
- 迁移 daily task 时保留 workspace 回链。

## Phase 4：项目追踪

时间：1-2 周

- 项目文件创建和解析。
- 项目列表和项目详情。
- 子任务进度计算。
- 每日记录。
- Pin 项目/子任务到某一天。

验收：

- 长期项目不必每天复制完整内容。
- 日视图可以只显示项目入口或当天推进项。
- 项目文件仍然是可读 Markdown。

## Phase 5：Git 同步与私有化部署

时间：1 周

- Git status、commit、push、pull。
- 冲突提示。
- Docker Compose 部署。
- 基础认证开关。
- README 真实截图和部署教程。

验收：

- 可在本机私有部署。
- 可推送到 GitHub repo 做多设备同步。
- 冲突不自动覆盖。

## Phase 6：思维导图增强

时间：2 周

- 在 Thinking Workspace 的 Mermaid/outline 基础上升级 React Flow 导图编辑器。
- 节点类型：想法、任务、风险、资料。
- 节点转任务预览。
- 任务回链到导图节点。
- Markdown outline 导出。

验收：

- 复杂项目可先导图拆解，再生成任务。
- 生成任务前可预览和取消。
- 导图数据可导出，不被 App 锁定。

## Phase 7：开源发布

时间：1 周

- 完整 README 中英文版。
- 从真实运行应用截图。
- 示例数据集。
- Issue templates。
- Roadmap 和贡献指南。
- MIT License。

验收：

- 新用户 10 分钟内跑起 demo。
- 30 分钟内接入自己的 Obsidian 日记目录。
- 文档解释清楚数据安全边界。
