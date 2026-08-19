# DailyFlow Agent / Skill 市场 v2 规划

> **最后更新**: 2026-08-20
> **目的**: 在路演前把 "Skill 市场" 这个卖点（README §"Inbox 与 AI 工作流" 提到的 "Agent Skill / Slash Command"）从 PPT 变成可点击的东西。
> **目标**: Sprint 1 末尾交付一个"Skill 注册中心雏形"——可以装、可以搜、可以评，但不做完整电商。
> **范围**: 仅客户端导入 + 本地仓库；不做付费、不做评论、不做 CDN 镜像。

---

## 0. 现状摘要（基于实际代码）

| 维度 | 现状 | 文件 |
|---|---|---|
| Skill 存储模型 | `PromptTemplateData` + frontmatter 序列化（`scope / icon / version / author / tags / commands / type`） | `src/components/SkillManager.tsx:295-300`、`src/api/client.ts:1176` |
| 内置 Skill | 6 个：`weekly_report / task_breakdown / meeting_notes / okr_review / daily_summary / dailyflow_kb` | `src/utils/builtInSkills.ts:18-200` |
| 持久化 | 后端 `/api/prompts` (CRUD) + 前端 store | `src/api/client.ts:1180-1212` `promptsApi` |
| 调用方式 | Slash command 路由 | `src/hooks/useAiSessionSend.ts:65-69` `resolveSlashCommand()` |
| 评级 | ❌ 没有 | — |
| 远程仓库 | ❌ 没有 | — |
| 沙箱 | ❌ 没有（skill 内容被当 system prompt 片段用） | — |

> **关键约束**（来自 `docs/V2_FINAL_DELIVERY_REPORT.md:11` Phase 9 + CONTEXT.md "不要做完整电商市场"）：**不能做完整电商市场**。本规划严格守住这条。

---

## 1. Skill Manifest Schema（v0）

> 兼容现有 `BUILT_IN_SKILLS` frontmatter + `src/api/client.ts:1034-1050` `PromptTemplateData`，**不破坏现有数据**。

### 1.1 顶层字段

```yaml
---
# === 必填 ===
id: string                   # 反向 DNS；建议 namespace/name@version
                              # 例: dailyflow/weekly-report@1.0.0
name: string                  # 展示名；中文/英文均可
description: string           # 一句话用途；出现在 Skill Manager 卡片
version: string              # semver；客户端按 version 决定是否升级
                              # 例: 1.0.0 / 1.0.0-beta.1

# === 强推荐 ===
author: string                # 名字或 org
scope: 'chat' | 'format' | 'note' | 'custom'
icon: string                  # lucide-react icon name (BarChart / GitBranch / ...)
tags: string[]                # 大写 enum：Productivity / Developer Tools / 
                              #         Content Creation / Data Analysis / UI Design / Custom

# === 调用方式（v2 新增） ===
commands: string[]            # slash command 别名；如 ["/weekly", "/wr"]
type: 'prompt' | 'agent'      # agent = 预留运行时；目前等价于 prompt
modelRequirements:            # 来自 AgentDefinitionSchema
  type: 'chat'
  supportsLocal: boolean
  supportsRemote: boolean
permissions:                  # 来自 AgentDefinitionSchema；声明能做什么
  - 'read_note'
  - 'read_sources'
  - 'update_note'
  - 'create_tasks'
acceptedInputs:               # 来自 AgentDefinitionSchema
  - 'note'
  - 'meeting_transcript'
  - 'source'
capabilities:                 # 来自 AgentDefinitionSchema
  - 'summarize'
  - 'rewrite'
  - 'extract_tasks'
  - 'extract_decisions'
  - 'chat'

# === 元数据（v0 占位，后续接 registry 时启用） ===
repository: string            # git url（仅记录，不下载代码）
homepage: string
license: string               # SPDX: MIT / Apache-2.0
rating: string            # 注册中心用；本地不写
installCount: string     # 注册中心用；本地不写
---

# Skill 正文（system prompt 或 agent instructions）
此处写 prompt / agent instructions。
```

### 1.2 字段对照

| v0 字段 | 来源 | 是否兼容现有 |
|---|---|---|
| id | `AgentDefinitionSchema.id` (server/domain/v2/types.ts:445) | ✅ 已有 |
| name / description / version | `AgentDefinitionSchema` | ✅ 已有 |
| scope / icon / tags / author | `SkillManager.tsx:295-300` frontmatter | ✅ 已有 |
| commands | `SkillManager.tsx:184` 前端解析 | ✅ 已有 |
| type (prompt/agent) | `SkillManager.tsx:183` 启发式 | ✅ 已有 |
| modelRequirements / permissions / acceptedInputs / capabilities | `AgentDefinitionSchema` | ✅ 已有 |
| repository / homepage / license | 新增 | ❌ 无（可空） |
| rating / installCount | 新增（占位） | ❌ 无 |

### 1.3 校验逻辑

```ts
// 复用 server/domain/v2/types.ts:445 AgentDefinitionSchema.parse()
// 复用 src/components/SkillManager.tsx:155-227 parseSkillMarkdown()
// 新增 server/services/v2/skillManifest.ts（v0 注册表）：
//   - parseSkillFrontmatter(md: string): SkillManifest
//   - validateSkillManifest(m: SkillManifest): ValidationError[]
```

---

## 2. 仓库结构（GitHub dailyflow-skills）

### 2.1 推荐布局

```
dailyflow-skills/                    # 公共仓库（公开 / MIT）
├── README.md                        # 仓库总览 + 贡献指南
├── index.json                       # 注册表入口（v0 见 §3）
├── schemas/
│   └── skill.v0.schema.json         # JSON Schema，供 IDE 自动补全
├── skills/
│   ├── dailyflow/
│   │   ├── weekly-report@1.0.0/
│   │   │   ├── SKILL.md             # manifest + body 二合一（兼容现有）
│   │   │   ├── LICENSE              # MIT 或 Apache-2.0
│   │   │   └── examples.md          # 可选：示例对话
│   │   └── meeting-notes@1.0.0/
│   │       └── SKILL.md
│   └── community/
│       └── fangchen/
│       │   └── investment-summary@0.1.0/
│       │       └── SKILL.md
└── CHANGELOG.md
```

### 2.2 SKILL.md 示例（迁移自 `builtInSkills.ts:18-44`）

```markdown
---
id: dailyflow/weekly-report@1.0.0
name: 周报生成器
description: 基于本周任务自动生成结构化周报
version: 1.0.0
author: DailyFlow Core Team
scope: chat
icon: BarChart
tags: [Productivity, weekly, report]
commands: [/weekly, /wr]
type: prompt
modelRequirements:
  type: chat
  supportsLocal: true
  supportsRemote: true
permissions: [read_note, read_sources]
acceptedInputs: [note]
capabilities: [summarize, extract_tasks]
repository: https://github.com/frankfika/dailyflow-skills
homepage: https://dailyflow.app/skills/weekly-report
license: Apache-2.0
---

请根据用户提供的任务列表，生成一份结构化的周报...

（这里写 system prompt body）
```

### 2.3 index.json（v0 注册表）

```json
{
  "$schema": "./schemas/skill.v0.schema.json",
  "version": "2026-08-20",
  "skills": [
    {
      "id": "dailyflow/weekly-report@1.0.0",
      "path": "skills/dailyflow/weekly-report@1.0.0/SKILL.md",
      "sha256": "<commit-pin>",
      "rating": "4.6",
      "installCount": 1284,
      "updatedAt": "2026-08-15"
    },
    {
      "id": "dailyflow/meeting-notes@1.0.0",
      "path": "skills/dailyflow/meeting-notes@1.0.0/SKILL.md",
      "sha256": "<commit-pin>",
      "rating": "4.8",
      "installCount": 2103,
      "updatedAt": "2026-08-12"
    }
  ]
}
```

> **关键设计**：`rating` 和 `installCount` 由 DailyFlow 官方手动维护，**不接自动统计**（避免被刷）。这是"占位"。

---

## 3. 客户端导入流程（v0）

### 3.1 用户视角

```
Settings → Models & Skills → 顶部 tab 切换
  ┌──────────────────────────────────────────────┐
  │ Local Skills (5)    Registry (12)    Built-in (3)│
  ├──────────────────────────────────────────────┤
  │ Registry tab:                                   │
  │   - 搜索框                                      │
  │   - 分类筛选 (Productivity / Developer / ...)   │
  │   - 卡片：name + description + 评级 + 安装次数  │
  │   - 按钮：Install / Update / View source        │
  └──────────────────────────────────────────────┘
```

### 3.2 数据流

```
1. App 启动
   ↓
2. useSkillRegistry() 拉 index.json (cache 24h, localStorage 'df:registry-cache')
   - 失败 fallback 到内置 6 个 built-in
   ↓
3. 用户点 Install
   ↓
4. fetch(SKILL.md) (commit-pin URL)
   ↓
5. parseSkillMarkdown() → 校验 → 写本地 store
   ↓
6. POST /api/prompts (existing) → 后端保存到 .dailyflow/prompts/<id>.json
   ↓
7. UI 提示 "已安装 weekly-report@1.0.0"
```

### 3.3 关键代码改动

| 文件 | 改动 |
|---|---|
| `src/api/client.ts` | 加 `skillRegistryApi.list()` / `.get(id)` |
| `src/components/SkillManager.tsx` | 加 "Registry" tab + 搜索 + 卡片 + Install 按钮（参考现有 builtInSkills 渲染） |
| `src/utils/builtInSkills.ts` | 不动；保留 6 个内置 fallback |
| `src/hooks/useAiSessionSend.ts` | 不动；Slash command 路由已能用 |
| `src/api/updater.ts` (前端) | 加 `loadSkillRegistry()` 缓存层 |

### 3.4 安装的副作用

- ✅ 本地 store 加一条记录
- ✅ 后端 `prompts` API 持久化
- ⚠️ 不做任何沙箱（DEBT-008）
- ⚠️ 不调用 `npm install`（不下载代码）
- ⚠️ 不修改 AI 模型配置（用户 system prompt 注入由 AI Chat 自己负责）

---

## 4. 评级系统占位

### 4.1 v0 不做自动统计

| 字段 | v0 来源 | 是否需要后端 |
|---|---|---|
| `rating` | 注册表手动维护（DailyFlow 团队） | ❌ 不需要 |
| `installCount` | 注册表手动维护（季度更新） | ❌ 不需要 |
| 用户个人"已安装次数" | 本地 localStorage 'df:skill-usage' | ❌ 不需要 |
| 用户评论 / 评分提交 | ❌ 不做 | — |

### 4.2 占位 UI（v0 卡片）

```tsx
// 卡片显示
<div className="flex items-center gap-2 text-xs text-text-muted">
  <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
  <span>{skill.rating ?? '—'}</span>
  <span>·</span>
  <Download className="w-3.5 h-3.5" />
  <span>{skill.installCount ?? '—'}</span>
  <span>installs</span>
</div>
```

### 4.3 用户本地使用统计（不暴露）

```ts
// src/utils/builtInSkills.ts:230 已有 recordSkillUse() 雏形
// 扩到所有 skill，不分 built-in / registry / local
function recordSkillUse(id: string) {
  const usage = JSON.parse(localStorage.getItem('df:skill-usage') ?? '{}');
  usage[id] = (usage[id] ?? 0) + 1;
  localStorage.setItem('df:skill-usage', JSON.stringify(usage));
}
```

> 仅用于客户端排序（`src/hooks/useAiSessionSend.ts` 已有 `sortSkillsByUsage`），不外发。

---

## 5. Sprint 1 最小可发布方案（2 周内）

### 5.1 范围（In / Out）

| In | Out |
|---|---|
| ✅ 注册表 index.json 拉取 + 缓存 | ❌ 付费 / 订阅 |
| ✅ 单 SKILL.md 下载 + 安装 | ❌ 评论系统 |
| ✅ Registry tab UI（搜索 + 分类） | ❌ 评分提交 |
| ✅ 评级 / 安装次数显示（占位） | ❌ 自动更新检查 |
| ✅ 内置 6 个迁移到 dailyflow-skills 仓库 | ❌ 沙箱隔离 |
| ✅ JSON Schema 校验 | ❌ CDN 镜像 |
| ✅ Settings 加 "Registry URL" 字段（默认 https://raw.githubusercontent.com/frankfika/dailyflow-skills/main/index.json） | ❌ 私有 registry |

### 5.2 任务分解（5 个 PR）

| ID | 任务 | 估时 | 依赖 |
|---|---|---|---|
| MKT-1 | 建 `dailyflow-skills` 仓库，迁移 6 个 built-in | 0.5d | — |
| MKT-2 | 写 `skill.v0.schema.json`（JSON Schema） + `schemas/README.md` | 0.5d | MKT-1 |
| MKT-3 | `src/api/client.ts` 加 `skillRegistryApi` (list / get) | 1d | MKT-2 |
| MKT-4 | `src/components/SkillManager.tsx` 加 Registry tab | 2d | MKT-3 |
| MKT-5 | Settings 加 Registry URL 字段 + 缓存策略 | 1d | MKT-3 |
| MKT-6 | 文档：`docs/SKILL_AUTHOR_GUIDE.md`（贡献者指南） | 0.5d | MKT-1 |

总计：**5.5 工作日**（约 1 周 sprint 容量，留 3-4 天 review + polish）。

### 5.3 验收清单

- [ ] `npm run lint` 通过
- [ ] `npm test` 通过
- [ ] 新增 3 个测试：
  - `parseSkillManifest()` 单元测试（用 `dailyflow-skills/skills/dailyflow/weekly-report@1.0.0/SKILL.md` fixture）
  - `skillRegistryApi.list()` mock 测试
  - `SkillManager.test.tsx` 加 Registry tab 交互测试
- [ ] 手动验证：
  1. Settings → Registry URL 默认值能拉
  2. 装 `weekly-report@1.0.0`，AI Chat 输入 `/weekly` 能命中
  3. 卸载后命令失效
  4. 离线状态下能 fallback 到内置 6 个
- [ ] 文档：
  - `docs/SKILL_AUTHOR_GUIDE.md`（MKT-6 输出）
  - `README.md` 加一句 "Browse Skills → Settings → Models & Skills → Registry"

### 5.4 风险与对应

| 风险 | 应对 |
|---|---|
| `raw.githubusercontent.com` 在国内访问慢 | Settings 暴露 Registry URL，可换成 jsdelivr CDN mirror（MKT-5） |
| 用户装恶意 skill 偷 system prompt | v0 加免责声明；DEBT-008 沙箱留 Sprint 3 |
| 6 个 built-in 迁出破坏现有用户 | 保持 `src/utils/builtInSkills.ts` 的 6 个 hard-coded，dailyflow-skills 是镜像而非源 |
| `parseSkillMarkdown()` 不接受新字段（repository / homepage / license） | MKT-3 在 client 加 `unknownFields` 透传，存进 `meta` |
| JSON Schema 过严导致社区贡献失败 | v0 不强制 `repository/homepage/license`，全部 optional |

---

## 6. 路演演示脚本（5 分钟）

### 场景
> "DailyFlow 的 Skill 不只是 prompt 模板，它是一个**可安装、可搜索、可审计**的小程序。今天 demo 装一个开源周报 skill。"

### 步骤

1. **(30s)** 打开 Settings → Models & Skills → Registry tab
   - 截图：12 个 skill 卡片（6 个 DailyFlow 官方 + 6 个 community）
   - 念出："我们采用白名单 registry，不是 npm —— 每个 skill 都过 review"
2. **(60s)** 搜索框输入 "weekly"
   - 过滤出 3 个结果：dailyflow/weekly-report、dailyflow/task-breakdown、community/fangchen/investment-summary
3. **(30s)** 点 "Install" on dailyflow/weekly-report@1.0.0
   - UI 提示 "已安装"
   - 切到 Local tab，能看到多了一条
4. **(60s)** 切到 AI Chat，输入 `/weekly`
   - Slash command 命中 weekly-report skill
   - 屏幕出现 system prompt 注入提示
5. **(30s)** 切回 Settings → Models & Skills，演示 "卸载" / "更新" / "View source"
6. **(60s)** 切换 Registry URL 到自托管（演示企业部署场景）

### 演示 fallback

- 如果 live demo 网络抽风：把 index.json 预下载到本地，URL 指向 `file:///path/to/index.json`
- Registry 后端临时挂：UI 显示 "Registry unavailable, using built-in cache"

---

## 7. 不做的事（明确划线）

参考 `CONTEXT.md` "不要做完整电商市场" + 本规划对"路演场景"的克制：

- ❌ 付费 / 订阅 / 充值
- ❌ 用户评分 / 评论 / 举报
- ❌ CDN 镜像 / 全球加速（v0 用 GitHub raw）
- ❌ 私有 Registry 鉴权（v0 只读公开仓库）
- ❌ Skill 沙箱 / 隔离执行（DEBT-008 留 Sprint 3）
- ❌ Skill 热更新 / 自动升级（每次手动 Install）
- ❌ 二进制 Skill（v0 纯 markdown，不下载 .js / .py）
- ❌ MCP-style Tool 协议（v0 只有 prompt 注入）

---

## 8. 后续路线图（不在 Sprint 1）

| 时间 | 里程碑 |
|---|---|
| Sprint 2 | 自动升级提示（registry 检查 sha256 mismatch）+ JSON Schema 离线校验 |
| Sprint 3 | Skill 沙箱（system prompt 注入边界 + 输出 schema 校验）+ DEBT-008 |
| v2.1 | 私有 Registry（Self-host）+ 企业 SSO |
| v2.2 | Skill 组合（multi-skill pipeline）+ 社区评级 |
| v3.0 | Skill Marketplace with web frontend（独立站 dailyflow.app/skills） |

---

## 9. 一句话总结

> **Sprint 1 交付一个"能装、能搜、能看评级"的 Skill Registry 雏形，用一个 GitHub 仓库 + 一张 index.json 实现，严格不做电商 —— 让"Agent Skill"从 PPT 变成 Settings 里能点的 tab。**
