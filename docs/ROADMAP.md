# DailyFlow 路线图

> 原则：先验证最核心的「Markdown 自动迁移」价值，再扩展项目、思维导图和同步体验。

## 当前统一产品基线（2026-07-28）

当前实现以 [`DAILYFLOW_UNIFIED_PRODUCT_IMPLEMENTATION_PLAN.md`](./DAILYFLOW_UNIFIED_PRODUCT_IMPLEMENTATION_PLAN.md) 为执行基线：一级入口为 Today、Notes、AI Chat、Memory；Calendar 位于 Today 的 Plan / Calendar 子视图，Review 位于 Needs decision，Inbox 位于 Notes。AI Workspace 不再作为独立导航入口。所有 AI 写入先进入 Proposal，后台长任务使用可恢复 Job。

---

## vNext 专项：Mail Workspace

邮件工作台候选版本已经形成独立规划，目标是在 DailyFlow 中提供可日常使用的 Gmail 阅读、附件查看、回复、标签和自定义回复能力，并将邮件中的承诺、等待项和项目资料接入 AI-Native 工作闭环。

完整范围、开源复用方案、架构、阶段计划与发布门槛见：

- [`MAIL_WORKSPACE_PLAN.md`](./MAIL_WORKSPACE_PLAN.md)

当前默认方向：

- Gmail 首发，Outlook 和通用 IMAP/SMTP 后续。
- Zero Email 作为主要参考和模块移植来源，不整体替换 DailyFlow 技术底座。
- 先建立安全的读取、正文和附件闭环，再开放回复、标签等受控写操作。
- 所有 AI 回复必须经过用户预览和确认，不自动发送。

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
