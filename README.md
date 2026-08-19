<div align="center">

<img src="./docs/assets/logo.svg" width="420" alt="DailyFlow Logo" />

# DailyFlow

> **把无限待办，收敛成今天真正要推进的事**
>
> 本地优先的任务、笔记、日历与 AI 工作台。

![DailyFlow Today](./docs/assets/home.png)

![Version](https://img.shields.io/github/v/release/frankfika/dailyflow?style=flat-square&label=version)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-green?style=flat-square)
![Stack](https://img.shields.io/badge/stack-React%20%2B%20Tauri%20%2B%20Express-purple?style=flat-square)
![CI](https://img.shields.io/github/actions/workflow/status/frankfika/dailyflow/ci.yml?branch=main&style=flat-square&logo=githubactions&logoColor=white&label=CI)
![License](https://img.shields.io/badge/license-Apache--2.0-lightgrey?style=flat-square)

**当前稳定版：v1.9.0** · [下载与安装说明](https://github.com/frankfika/dailyflow/releases/latest) <!-- x-release-please-version -->

[核心功能](#-核心功能) · [界面预览](#-界面预览) · [快速开始](#-快速开始) · [开发](#-开发) · [文档](#-文档)

__简体中文__ | [English](./README_EN.md)

</div>

## DailyFlow 是什么？

DailyFlow 面向被待办过载、会议和零散想法拉扯的人。它把收集、计划、执行和回顾放在同一个桌面工作区里，同时让 Markdown 文件保留在你的本地目录中。

它的核心原则很简单：

1. **先收集**：把任务、想法和会议输入 Inbox 或笔记。
2. **再聚焦**：在 Today 中决定今天推进什么，处理等待项和遗留项。
3. **最后回顾**：用 Memory 和 Review 沉淀已确认的工作上下文。

如果你不想把工作资料锁在单一 SaaS 里，又希望拥有 AI 辅助整理和连接外部日历的能力，DailyFlow 就是为这个取舍设计的。

## ✨ 核心功能

### Today：每天从一个清晰的工作面开始

- 今日任务、逾期项、完成数和聚焦进度集中呈现。
- 支持手动选择今日重点，也支持 AI 根据时间、精力和约束提出计划。
- 未完成事项可以回顾、迁移；等待中的事项不会被误当成今天要做的事。
- Work / Life 上下文切换，让不同场景的任务互不干扰。

### Inbox 与 AI 工作流

- 快速捕获未经处理的任务、信息和想法。
- AI 可以从自然语言中提取任务、笔记和后续行动。
- 所有 AI 变更先以 proposal 形式展示，确认后才写入本地数据。
- 支持多会话 AI Chat、上下文挂载、Prompt Library 和 Agent Skill / Slash Command。

### Notes：文档优先的笔记

- 普通笔记、每日笔记、会议记录和 AI 总结统一管理。
- 列表 + 编辑器分栏布局，并支持专注模式。
- 笔记可关联任务、按人员筛选，并作为上下文发送到 AI Chat。
- Markdown 文件作为可读、可迁移的本地数据。

![Notes](./docs/assets/notes.png)

### Mind Map：把复杂问题拆成主分支

- 新增 `思维导图` 标签，每个工作区一组导图，独立的平移/缩放画布（基于 `@xyflow/react`）。
- 自动水平布局，拖拽改位置，`Tab` 加子节点、`Enter` 加同级节点、`Backspace` 删除、双击 / `F2` 编辑，色板按钮切换 6 个命名色。
- 子树折叠/展开、节点内联备注、Markdown 导出、撤销/重做（50 步历史）、画布内 `Ctrl/Cmd+F` 搜索。
- 每个节点有 `todo` / `in-progress` / `done` 三态进度，header 实时显示完成度。
- 4 个内置模板（SWOT、5W1H、决策树、任务分解），JSON 导入/导出。
- 自动保存到 `<workspaceRoot>/.dailyflow/mindmaps/<id>.json`（600ms 防抖）。

### Events：像飞书脑图笔记一样拆解项目

- 左侧大纲 + 右侧画布的双 pane 布局，项目和行动一目了然。
- 大纲支持单击直接编辑，`Enter` 创建同级、`Tab` 创建子级、`↑↓` 移动、`Backspace` 删除空节点。
- 画布节点常驻 `+` 按钮，一键添加子节点或同级节点。
- 画布节点可自由拖拽定位，位置持久化到 mindmap JSON；空白处拖拽平移画布，滚轮 + 缩放控件缩放，整体可在滚动区任意方向滚动。
- 新建事件后画布中央直接输入第一个步骤，零门槛开始拆解。
- 节点通过「添加为任务」转成任务：弹出日期浮层（今天 / 明天 / +3 天 / 下周 / 自定义日期），点「安排」确认后才排期，不再一键硬塞今天。
- 节点 chip、大纲行、底部工具栏三个入口共用同一个日期浮层；任务节点带绿色侧条和日期标记，可改期、移出日程或直接标记完成，Today 里能看到来源事件和节点路径。

![Mind Map](./visual-mindmap-2-populated.png)

### Topic Spaces：跨工作区的语义分组

- 新增 `主题`（Topic Space）维度，把一个项目 / 议题 / 长期目标的所有素材串起来。
- 每个主题有独立的思维导图（默认视图），Work / Life 上下文隔离。
- 节点右键：Promote（把分支节点升级成真实 Task）/ Link（关联已有 Task）/ Set Tag / Unclassify。
- Task 可以绑定到主题，列表视图按主题筛选，按 Tag 二次筛选，绑定状态在 TaskCard 上清晰可见。
- Markdown 文件里的 `^space:<id>` 系统标记是绑定关系的唯一权威来源，迁移 / 备份天然兼容。
- 提供 broken-link 诊断 + repair 接口，发现并清理指向已删除 Task 的悬挂节点。

### Calendar：把任务和日程放在一条时间线上

- 支持日、周、月视图。
- 聚合本地任务、定时笔记和外部日历事件。
- 本地任务、定时笔记和已配置的外部日历事件统一显示在时间线上。
- 外部日历连接器仅在完成正式授权和配置后开放；未配置时不会显示为可用能力。

### Memory 与 Review：让工作有上下文

- Memory 聚合已确认的 Commitment、项目、会议、人员、决定和结果。
- Review 展示每周工作摘要、仍在进行的事项和长期未推进的 Commitment。
- v2 数据模型按实体保存，并保留审计与导入/导出能力。

### 同步、备份与桌面体验

- Git / GitHub 同步本地工作区。
- Pinata IPFS 备份，生成可追踪的 CID。
- Tauri 桌面应用内置 Node.js 与 Feishu CLI 运行时，普通用户无需另装 Node、npm 或 Homebrew。
- macOS、Windows、Linux 桌面安装包支持应用内更新。

## 🤖 AI 模型

通过设置页配置 AI provider，支持国内、海外、聚合平台以及任意 OpenAI-compatible API。当前代码覆盖 B.AI、OpenRouter、OpenAI、Anthropic、Google Gemini、DeepSeek、Kimi、MiniMax、智谱 GLM、豆包、Qwen、SiliconFlow、Groq 等 provider；具体可用模型取决于 provider 的 API 配置。

![AI Chat](./docs/assets/ai-chat.png)

> AI 功能需要用户自行配置 API Key。DailyFlow 不托管你的模型凭据，也不会把本地 Markdown 工作区上传到 DailyFlow 服务。

## 📸 界面预览

| Today | AI Chat |
|:---:|:---:|
| ![Today](./docs/assets/home.png) | ![AI Chat](./docs/assets/ai-chat.png) |

| Notes | Settings |
|:---:|:---:|
| ![Notes](./docs/assets/notes.png) | ![Settings](./docs/assets/settings.png) |

截图来自真实运行的本地应用；如界面发生变化，可运行 `node scripts/capture-screenshots.mjs` 更新素材。文档中的外部连接能力以当前授权状态为准，不会用演示数据填充列表。

## 🚀 快速开始

### 下载桌面版

从 [最新 Release](https://github.com/frankfika/dailyflow/releases/latest) 下载对应平台的安装包。桌面安装包会携带本地服务运行所需的 Node.js；首次使用时只需选择一个 Markdown 工作区目录。

| 平台 | 常见安装包 |
|:---|:---|
| macOS Apple Silicon | `DailyFlow_*_aarch64.dmg` |
| macOS Intel | `DailyFlow_*_x64.dmg` |
| Windows | `DailyFlow_*_x64-setup.exe` |
| Linux | `DailyFlow_*_amd64.AppImage` |

macOS 安装后请将 DailyFlow 拖入“应用程序”。由于当前构建尚未经过 Apple 公证，如果提示“DailyFlow 已损坏”或无法验证开发者，请执行：

```bash
sudo xattr -rd com.apple.quarantine "/Applications/DailyFlow.app"
```

然后在 Finder 中右键 DailyFlow，选择“打开”。完整说明见 [MACOS_DAMAGED_FIX.md](./docs/MACOS_DAMAGED_FIX.md)。

### 从源码运行

开发环境要求：Node.js 20+。

```bash
git clone https://github.com/frankfika/dailyflow.git
cd dailyflow
npm install

# 前端 + 本地 Express 服务
npm run dev:all

# 或以 Tauri 桌面应用运行
npm run tauri dev
```

打开 <http://localhost:47831> 后，按引导选择工作区。生产构建：

```bash
npm run build
npm run build:server
npm run tauri build
```

## 🧭 开发

```bash
npm run lint          # TypeScript 类型检查
npm test              # Vitest 单元与服务测试
npm run test:coverage # 覆盖率报告
npm run build         # Vite 生产构建
```

项目结构：

```text
src/                  React + TypeScript 前端
server/               Express API、v2 domain 与本地 Markdown repository
src-tauri/            Tauri 2 桌面壳与内置运行时
scripts/              构建、打包、截图和验收脚本
e2e/                  Playwright 端到端测试
docs/                 产品、架构、数据格式与发布文档
```

## 🏗 架构

```mermaid
flowchart LR
  UI[React + Vite] <-->|HTTP| API[Express + TypeScript]
  API --> MD[Local Markdown + YAML frontmatter]
  Shell[Tauri 2 Desktop Shell] --> UI
  Shell --> API
  API --> AI[Configured AI providers]
  API --> Cal[Feishu / Google Calendar connectors]
  API --> Sync[GitHub / IPFS backup]
```

## 📚 文档

- [AI-native 产品开发规范](./docs/AI_NATIVE_PRODUCT_DEVELOPMENT_SPEC.md)
- [架构说明](./docs/ARCHITECTURE.md)
- [数据格式](./docs/DATA_FORMAT.md)
- [日历与 Feishu 同步](./docs/MAIL_WORKSPACE_PLAN.md)
- [发布流程](./docs/RELEASE_PROCESS.md)
- [完整变更记录](./CHANGELOG.md)

## 🤝 贡献

欢迎提交 Issue、改进建议和 Pull Request。提交前请确保 `npm run lint`、`npm test` 和相关构建通过；提交信息遵循 Conventional Commits（如 `feat:`、`fix:`、`docs:`、`test:`）。

## 📄 License

Apache License 2.0。代码文件中的 SPDX 标识和项目发布配置均采用 Apache-2.0；如果需要贡献代码，请在 PR 中说明新增依赖的许可证兼容性。

<div align="center">

[⭐ Star on GitHub](https://github.com/frankfika/dailyflow) · [📥 下载最新版本](https://github.com/frankfika/dailyflow/releases/latest) · [🐛 报告问题](https://github.com/frankfika/dailyflow/issues)

</div>
