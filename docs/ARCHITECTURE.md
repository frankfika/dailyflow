# DailyFlow 技术架构

> 设计目标：本地优先、Markdown 主数据、Web 操作体验、可私有化部署、可开源扩展。

---

## 1. 总体架构

```text
┌───────────────────────────────────────────────────────────┐
│                         Web UI                            │
│ React + TypeScript + Vite                                 │
│ Daily View · Project View · Mindmap · Settings            │
└───────────────────────────────┬───────────────────────────┘
                                │ HTTP / WebSocket optional
┌───────────────────────────────▼───────────────────────────┐
│                       API Server                          │
│ Express.js + TypeScript (tsx)                              │
│ Task API · Project API · Migration API · Sync API          │
└───────────────────────────────┬───────────────────────────┘
                                │
┌───────────────────────────────▼───────────────────────────┐
│                      Core Engine                          │
│ Markdown Parser · Rollover Engine · Indexer · Git Adapter  │
│ Mindmap Adapter · Attachment Resolver                      │
└───────────────────────────────┬───────────────────────────┘
                                │
┌───────────────────────────────▼───────────────────────────┐
│                       Data Layer                          │
│ Markdown files (source of truth) · SQLite index · Git repo │
└───────────────────────────────────────────────────────────┘
```

## 2. 模块职责

| 模块 | 职责 | 关键约束 |
|---|---|---|
| Markdown Parser | 解析任务块、标题上下文、标签、附件、行号 | 不破坏原文格式 |
| Rollover Engine | 迁移未完成任务、生成日期文件、标记来源 | 可预览、可撤销、不重复 |
| Indexer | 把 Markdown 重建为 SQLite 索引 | 索引可随时丢弃重建 |
| Task Writer | 更新 checkbox、插入任务、改标签 | 写入前检查文件 hash |
| Project Engine | 项目文件解析、进度计算、每日 pin | 项目仍是 Markdown |
| Mindmap Adapter | 图节点与任务互转 | 保留 JSON 和 Markdown 导出 |
| Attachment Resolver | 解析 wikilink、URL、本地文件路径 | 禁止越权访问数据目录外路径 |
| Git Adapter | status、commit、push、pull、冲突提示 | 不自动覆盖用户更改 |

## 3. 推荐项目结构

```text
dailyflow/
├── src/                        # 前端代码 (React + TypeScript)
│   ├── App.tsx                 # 主应用组件
│   ├── components/             # UI 组件
│   ├── api/                    # API 客户端
│   └── types/                  # TypeScript 类型
├── server/                     # 后端代码 (Express + TypeScript)
│   ├── index.ts                # 服务器入口 (端口 47832)
│   ├── routes/                 # API 路由
│   │   ├── files.ts
│   │   ├── tasks.ts
│   │   ├── rollover.ts
│   │   ├── config.ts
│   │   └── git.ts
│   ├── services/               # 业务逻辑
│   │   ├── parser.ts
│   │   ├── fileSystem.ts
│   │   ├── rollover.ts
│   │   ├── config.ts
│   │   └── git.ts
│   └── types/
├── src-tauri/                  # Tauri 桌面应用 (Rust)
├── e2e/                        # E2E 测试 (Playwright)
├── scripts/                    # 工具脚本
├── docs/                       # 文档
└── index.html                  # Vite 入口
```

## 4. 数据流

### 4.1 启动与索引

```text
App start
  → load config
  → scan daily/project directories
  → parse changed files only
  → update SQLite index
  → serve daily/project views
```

### 4.2 勾选任务

```text
User checks task
  → API receives task_id + expected content_hash
  → writer locates source file and line range
  → verify hash still matches
  → replace checkbox only
  → update index
  → optional Git commit
```

### 4.3 自动迁移

```text
Rollover trigger
  → resolve source date
  → parse source file
  → select rollover candidates
  → generate preview diff
  → write target daily file
  → append migration metadata to source file
  → rebuild affected index
  → optional Git commit
```

## 5. API 草案

```text
GET    /api/v1/health
GET    /api/v1/config
PUT    /api/v1/config

GET    /api/v1/daily/{date}
POST   /api/v1/daily/{date}/create
POST   /api/v1/daily/{date}/rollover-preview
POST   /api/v1/daily/{date}/rollover-apply

GET    /api/v1/tasks?date=YYYY-MM-DD&status=todo
POST   /api/v1/tasks
PATCH  /api/v1/tasks/{task_id}
POST   /api/v1/tasks/{task_id}/complete
POST   /api/v1/tasks/{task_id}/defer

GET    /api/v1/projects
POST   /api/v1/projects
GET    /api/v1/projects/{project_id}
PATCH  /api/v1/projects/{project_id}
POST   /api/v1/projects/{project_id}/pin-to-date

GET    /api/v1/mindmaps
POST   /api/v1/mindmaps
GET    /api/v1/mindmaps/{mindmap_id}
PATCH  /api/v1/mindmaps/{mindmap_id}
POST   /api/v1/mindmaps/{mindmap_id}/nodes-to-tasks

GET    /api/v1/sync/status
POST   /api/v1/sync/commit
POST   /api/v1/sync/pull
POST   /api/v1/sync/push
```

## 6. 配置文件

```yaml
workspace:
  root: /Users/fangchen/Baidu/日常Routine
  daily_path_template: "0、Dailynote/{year}年{month}月/{date}.md"
  project_dir: "DailyFlow/projects"
  attachment_dir: "DailyFlow/attachments"

rollover:
  trigger: on_app_open
  source: previous_existing_daily
  target_section: "## 待办"
  skip_tags: ["no-rollover"]
  add_migration_comment: true

git:
  enabled: true
  auto_commit: true
  auto_push: false
  commit_message_template: "dailyflow: {action} {date}"
```

## 7. 核心实现伪代码

```typescript
// server/services/rollover.ts
async function applyRollover(targetDate: string): Promise<RolloverResult> {
  const sourceDate = findPreviousExisting(targetDate);
  const sourceDoc = await parseMarkdown(sourceDate);

  const candidates = sourceDoc.tasks.filter(task =>
    task.status === 'todo'
    && !task.hasTag('no-rollover')
    && !task.wasMigratedTo(targetDate)
  );

  const patch = buildRolloverPatch(targetDate, sourceDate, candidates);
  await applyPatch(patch);
  return { count: candidates.length, target: targetDate };
}
```

## 8. SQLite Schema 草案

```sql
CREATE TABLE files (
  path TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  parsed_at DATETIME NOT NULL
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  category TEXT,
  project_id TEXT,
  scheduled DATE,
  deadline DATE,
  priority TEXT,
  source_file TEXT NOT NULL,
  line_start INTEGER NOT NULL,
  line_end INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  created_at DATETIME,
  updated_at DATETIME,
  FOREIGN KEY(source_file) REFERENCES files(path)
);

CREATE TABLE task_links (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  target TEXT NOT NULL,
  label TEXT,
  FOREIGN KEY(task_id) REFERENCES tasks(id)
);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT,
  category TEXT,
  start_date DATE,
  deadline DATE,
  source_file TEXT NOT NULL,
  updated_at DATETIME
);

CREATE VIRTUAL TABLE task_search USING fts5(title, body, tags);
```

## 9. 部署方式

### 9.1 本地开发

```bash
# 同时启动前后端
npm run dev:all

# 或分别启动
npm run dev      # 前端 (Vite, 端口 47831)
npm run server   # 后端 (Express, 端口 47832)

# 启动 Tauri 桌面应用
npm run tauri dev
```

### 9.2 构建桌面应用

```bash
npm run tauri build
# 产物: src-tauri/target/release/bundle/dmg/DailyFlow_*.dmg
```

## 10. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| Markdown 格式多样 | 解析遗漏或误写 | 先支持保守语法，写入前 diff 预览 |
| 文件被 Obsidian 同时编辑 | 写回覆盖 | content hash 检查 + 冲突提示 |
| Git 冲突 | 数据不同步 | 不自动 merge，显示冲突文件 |
| 大量历史文件扫描慢 | 首次启动慢 | 增量索引 + 文件 hash |
| 任务 ID 不稳定 | 重复迁移 | 内容 hash + migration comment |
