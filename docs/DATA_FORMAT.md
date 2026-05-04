# DailyFlow 数据格式

> 原则：Markdown 是主数据，SQLite 是索引，任何时候都应能脱离 DailyFlow 直接阅读和编辑文件。

---

## 1. 目录建议

```text
data/
├── daily/
│   └── 2026/
│       └── 05/
│           ├── 2026-05-03.md
│           └── 2026-05-04.md
├── projects/
│   └── 投资搞定.md
├── mindmaps/
│   └── 投资搞定.flow.json
└── attachments/
    └── 投资搞定/
        ├── 尽调资料包.pdf
        └── 商机分析.xlsx
```

也可以兼容用户现有 Obsidian 目录，例如：

```text
/Users/fangchen/Baidu/日常Routine/0、Dailynote/2026年4月/2026-04-19.md
```

兼容方式通过 `path_template` 配置完成。

## 2. 每日文件模板

```markdown
---
date: 2026-05-03
type: daily
created_by: dailyflow
---

# 2026-05-03 星期日

## 个人事项

- [ ] 示例任务 #priority:medium

## 公司事项

- [ ] 示例公司任务 #deadline:2026-05-10

## 项目推进

- [ ] [[projects/投资搞定.md|投资搞定]] #project:投资搞定

## 已完成

```

## 3. 任务块格式

### 3.1 基础任务

```markdown
- [ ] 完成 secondplanet 上线 #deadline:2026-05-10 #priority:high
```

### 3.2 带说明和附件

```markdown
- [ ] 整理初步尽调资料包 #project:投资搞定 #deadline:2026-05-20
  > 说明：补齐商机、客户、财务预测材料。
  > 附件：[[attachments/投资搞定/商机分析.xlsx]]
  > 链接：[资料清单](https://example.com/checklist)
  - [x] 商机分析 ✅ 2026-05-01
  - [ ] 盈利预测
```

### 3.3 推荐标签

| 标签 | 含义 | 示例 |
|---|---|---|
| `#deadline` | 截止日期 | `#deadline:2026-05-10` |
| `#scheduled` | 计划出现日期 | `#scheduled:2026-05-08` |
| `#priority` | 优先级 | `#priority:high` |
| `#project` | 项目归属 | `#project:投资搞定` |
| `#duration` | 预计时长 | `#duration:2h` |
| `#no-rollover` | 不自动迁移 | `#no-rollover` |
| `#recurring` | 重复规则 | `#recurring:weekly` |

## 4. 迁移标记

来源文件中的原任务可追加 HTML 注释，减少干扰 Obsidian 阅读：

```markdown
- [ ] 完成 secondplanet 上线 #deadline:2026-05-10
  <!-- dailyflow: migrated_to=2026-05-04 task_id=task_abc123 -->
```

今日文件中的迁移任务可记录来源：

```markdown
- [ ] 完成 secondplanet 上线 #deadline:2026-05-10
  <!-- dailyflow: source=2026-05-03 task_id=task_abc123 -->
```

## 5. 项目文件格式

```markdown
---
type: project
id: project_investment
status: active
category: company
start: 2026-04-01
deadline: 2026-06-30
---

# 投资搞定

## 进度概览

- 状态：进行中
- 完成率：40%
- 下一步：补齐盈利预测

## 子任务

- [x] NDA 协议 ✅ 2026-04-15
- [ ] 整理初步尽调资料包
  - [x] 商机分析 ✅ 2026-05-01
  - [ ] 盈利预测
- [ ] 投决会准备

## 每日记录

### 2026-05-03

- 补充商机和盈利预测材料。
- 与东海投资沟通，投决会可能延后。

## 附件

- [[attachments/投资搞定/尽调资料包v1.pdf]]
- [[attachments/投资搞定/商机分析.xlsx]]

## 相关链接

- [投资协议模板](https://example.com/template)
```

## 6. 思维导图格式

MVP 后推荐使用 React Flow JSON，并提供 Markdown outline 导出：

```json
{
  "id": "mindmap_investment",
  "project_id": "project_investment",
  "nodes": [
    { "id": "root", "type": "topic", "label": "投资搞定" },
    { "id": "node_dd", "type": "task", "label": "整理尽调资料", "parent": "root" }
  ],
  "edges": [
    { "source": "root", "target": "node_dd" }
  ]
}
```

生成任务时写入：

```markdown
- [ ] 整理尽调资料 #project:投资搞定
  <!-- dailyflow: mindmap=mindmap_investment node=node_dd -->
```

## 7. SQLite 索引

SQLite 不存储唯一真相，只存储可重建索引：

```sql
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
  line_start INTEGER,
  line_end INTEGER,
  content_hash TEXT NOT NULL,
  updated_at DATETIME NOT NULL
);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT,
  category TEXT,
  start_date DATE,
  deadline DATE,
  source_file TEXT NOT NULL,
  updated_at DATETIME NOT NULL
);

CREATE VIRTUAL TABLE task_search USING fts5(title, body, tags);
```

## 8. 冲突与安全

- 写入前检查 `content_hash`，文件变化时先重新解析。
- 批量写入前生成预览 diff。
- 每次迁移可生成 Git commit 或本地备份。
- 任何解析失败都应该 fail closed：停止写入，提示用户。
