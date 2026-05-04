<div align="center">

![DailyFlow](./docs/assets/logo.svg)

# DailyFlow

**本地优先的智能日程管理系统**  
把 Obsidian/Markdown 日记变成可自动滚动、可项目化追踪、可思维导图拆解的任务工作台。

__简体中文__ | [English](./README_EN.md)

![Status](https://img.shields.io/badge/status-product%20design-8BA89A?style=flat-square)
![Version](https://img.shields.io/badge/version-0.1.0-173B35?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-A06435?style=flat-square)

[产品文档](./PRODUCT.md) · [MVP 规格](./docs/MVP_SPEC.md) · [数据格式](./docs/DATA_FORMAT.md) · [架构设计](./docs/ARCHITECTURE.md) · [UI 规范](./docs/UI_DESIGN.md) · [DINQ 风格转译](./docs/DESIGN_REFERENCE_DINQ.md) · [路线图](./docs/ROADMAP.md)

</div>

---

## 产品定位

DailyFlow 不是另一个封闭的 Todo App。它面向任务复杂、日程频繁变化、又希望保留 Markdown 与 Git 工作流的人：

- 每天的日记文件仍然是核心数据源，可继续被 Obsidian 读取和编辑。
- 未完成任务可自动滚动到下一天，不再手动复制粘贴。
- 持续数周或数月的大任务可沉淀为项目文件，并在每日视图中持续推进。
- 复杂任务可用思维导图拆解，再把节点转成可执行小任务。
- 所有数据默认在本地，SQLite 只做索引，GitHub repo 只做同步和备份。

## 核心能力

| 能力 | 说明 | MVP 状态 |
|---|---|---|
| 自动迁移 | 从上一天提取未完成任务，生成当天日记并标记来源 | P0 |
| Markdown 任务模型 | 支持任务、子任务、截止日期、计划日期、优先级、附件、链接 | P0 |
| 日视图 | 查看今天、明天、历史日期，完成/编辑/延期任务 | P0 |
| 长期项目 | 独立项目文件、进度记录、项目任务映射到每日任务 | P1 |
| 思维导图 | 用图形节点拆解任务，选中节点生成子任务 | P1 |
| Git 同步 | 本地提交、推送、拉取、冲突提示 | P1 |
| 附件管理 | 任务绑定文件、链接、说明，支持全局检索 | P1 |

## 推荐技术方向

```text
Frontend   React + TypeScript + Vite
Backend    Python + FastAPI
Data       Markdown files as source of truth + SQLite index
Mindmap    React Flow / markmap-compatible export
Sync       Git CLI wrapper + optional GitHub remote
Deploy     Docker Compose for private deployment
```

## 文档结构

```text
DailyFlow/
├── README.md                 # 项目入口说明
├── README_EN.md              # English README
├── PRODUCT.md                # 产品文档 / PRD 主文档
└── docs/
    ├── MVP_SPEC.md           # MVP 范围、用户故事、验收标准
    ├── DATA_FORMAT.md        # Markdown 数据格式和迁移规则
    ├── ARCHITECTURE.md       # 技术架构、模块、API、索引策略
    ├── UI_DESIGN.md          # 视觉风格、交互原则、关键页面
    ├── DESIGN_REFERENCE_DINQ.md # dinq.me 风格参考和 DailyFlow 转译
    ├── ROADMAP.md            # 分阶段路线图
    └── assets/logo.svg       # 本地 logo 资产
```

## 后续开发优先级

1. 先做一个只读/半自动原型：读取你的 Obsidian 日记目录，展示今天任务，并生成明天草稿。
2. 再做自动迁移闭环：保留任务属性、子任务、附件，并写回 Markdown。
3. 然后补项目视图：把长期任务从每日文件抽出，统一追踪进度。
4. 最后加入思维导图和 GitHub 同步，形成可开源发布的完整产品。

> 说明：当前仓库是产品设计文档阶段，还没有真实运行的应用，因此 README 未放置伪造截图。等 MVP 可运行后，应从 localhost 用 Playwright 捕获真实截图并放入 `docs/assets/`。
