<div align="center">

<img src="./docs/assets/logo.svg" width="480" alt="DailyFlow Logo" />

# DailyFlow

> **本地优先的任务与笔记系统** · Local-first tasks & notes system
>
> 简单记录，专注今天。 · Keep it simple. Focus on today.

![主界面](./docs/assets/home.png)

![Version](https://img.shields.io/badge/Version-1.0.1-blue?style=flat-square)
![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-green?style=flat-square)
![License](https://img.shields.io/badge/License-Apache--2.0-lightgrey?style=flat-square)
![Tech](https://img.shields.io/badge/Stack-React%20%2B%20Tauri%20%2B%20TypeScript-purple?style=flat-square)
![Runtime](https://img.shields.io/badge/Runtime-Node.js%20Bundled-success?style=flat-square)

[核心功能](#-核心功能) · [界面预览](#-界面预览) · [快速开始](#-快速开始) · [技术栈](#-技术栈) · [贡献](#-贡献)

__简体中文__ | [English](./README_EN.md)

---

</div>

## 🎉 v1.0.1 更新

本次更新精简了产品边界，移除了过度设计的 **Thinking Workspaces（思考工作台）**，让 DailyFlow 回归「任务 + 笔记 + AI 对话」的核心体验；同时修复了 AI Chat 中无法找到/关联非当日笔记的问题。

| 你要做的事 | v1.0.0 | v1.0.1 |
|-----------|-------|--------|
| 复杂项目 | 独立的思考工作台 | 回到「项目 / 标签 + 笔记」的简洁方式 |
| 整理思路 | AI 整理 Brief / Journey | 直接在 AI Chat 中挂载笔记/项目上下文提问 |
| 任务拆解 | AI 生成任务后投放 | Brain Dump + AI Chat 拆解 |
| 笔记关联 | 仅当日笔记可挂载 | **全部笔记**都可挂载到 AI Chat |

---

## 📖 项目简介

DailyFlow 是一个 **本地优先（local-first）** 的智能任务与笔记管理桌面应用。以 Markdown 文件作为唯一数据源，内置 AI 助手（支持 15+ 模型供应商），自动处理跨日任务迁移。

### 为什么选择 DailyFlow？

| 传统方式 | DailyFlow |
|---------|-----------|
| 每天手动复制未完成任务 | 自动迁移，打开即用 |
| 数据锁在 SaaS 平台 | 本地 Markdown，完全可控 |
| 需要网络才能使用 | 离线优先，**内置 Node.js 运行时** |
| 复杂项目管理工具上手难 | 极简设计，专注当日 |
| AI 功能要额外付费 | 内置 AI，支持 15+ 模型供应商 |

---

## ✨ 核心功能

### 📋 任务管理

- **自动迁移**：未完成任务在次日自动迁移，保留来源日期标记
- **卡片式界面**：任务按标签分类，支持评论、关联笔记
- **Work/Life 切换**：一键切换工作/生活上下文，任务自动过滤
- **项目概览**：跨日期聚合待办，按分类查看全局进度
- **标签系统**：支持 `#tag`、`#deadline:日期`、`#priority:级别`、`#project:名称`

### 🤖 AI 助手

- **AI Chat**：完整聊天界面，多会话上下文注入（今日任务/笔记/项目）
- **AI Tool Use**：AI 可直接创建任务、保存笔记
- **Brain Dump**：把零散想法倒进去，AI 自动提取和分类
- **AI 总结**：选择范围和提示词，生成结构化日报/周报
- **Skill Marketplace**：技能市场，支持 Slash Command 和 Agent Skill
- **提示词库**：管理和测试 AI 格式化提示词模板

![AI Chat](./docs/assets/ai-chat.png)

### 🔌 AI 模型支持

一键配置，支持 15+ AI 供应商：

| 类型 | 供应商 |
|------|--------|
| 聚合平台 | **B.AI**（29+ 模型一个 Key）、OpenRouter |
| 国内 | DeepSeek、Kimi、MiniMax、智谱 GLM、豆包、阿里云 Qwen、硅基流动 |
| 海外 | Anthropic Claude、OpenAI、Google Gemini、Groq |
| 自定义 | 任何 OpenAI 兼容 API |

### 📝 笔记系统

- **多类型**：普通笔记、会议记录、AI 总结
- **只读预览**：点击卡片进入只读预览，点编辑按钮再改，避免误编辑
- **AI 助手**：润色、续写、提取待办、整理会议纪要
- **发到对话**：把笔记作为上下文绑定到 AI 对话，输入框只留你的提问
- **@提及**：`@人名` 自动解析，支持按人员筛选
- **任务关联**：笔记与任务双向关联

![笔记列表](./docs/assets/notes.png)

### 📚 多笔记本 / 工作区

- 侧边栏一键切换多个 Markdown 工作区
- 自动发现本地笔记文件夹
- 每个工作区记住最后停留日期
- 工作台和笔记、任务共用同一棵文件树

### 🔄 同步与备份

- **Git 同步**：一键提交到 GitHub，侧边栏显示同步状态
- **IPFS 备份**：通过 Pinata 上传去中心化备份，获得永久 CID
- **应用内更新**：自动检测新版本，一键下载安装

---

## 📸 界面预览

| 主界面 (Today) | 项目概览 |
|:---:|:---:|
| ![Today](./docs/assets/home.png) | ![Projects](./docs/assets/projects.png) |

| AI Chat | 笔记 |
|:---:|:---:|
| ![AI Chat](./docs/assets/ai-chat.png) | ![Notes](./docs/assets/notes.png) |

---

## 🚀 快速开始

### 📦 下载安装（推荐）

前往 [Releases](https://github.com/frankfika/dailyflow/releases/latest) 下载对应平台安装包：

| 平台 | 文件 | 大小 |
|------|------|------|
| macOS (Apple Silicon) | `DailyFlow_x.x.x_aarch64.dmg` | ~33 MB |
| macOS (Intel) | `DailyFlow_x.x.x_x64.dmg` | ~35 MB |
| Windows | `DailyFlow_x.x.x_x64-setup.exe` | ~30 MB |
| Linux | `DailyFlow_x.x.x_amd64.AppImage` | ~34 MB |

> **macOS 用户**：遇到 "damaged" / "cannot be opened" 错误，请执行：
> ```bash
> sudo xattr -rd com.apple.quarantine /Applications/DailyFlow.app
> ```
>
> **完全独立运行**：v1.0.1 的 dmg 内置了 Node.js 运行时，无需用户机器上预装 Node——下载即可直接使用。

### 从源码运行

环境要求：**Node.js ≥ 20**（仅开发时需要，运行时不需要）

```bash
git clone https://github.com/frankfika/dailyflow.git
cd dailyflow
npm install

# 开发模式（前端 + 后端）
npm run dev:all

# 或以桌面应用形式开发
npm run tauri dev

# 完整构建（含 Tauri 桌面应用）
npm run build
npm run build:server
npm run tauri build
```

### 首次使用

1. 启动应用，设置**工作区目录**（存放 Markdown 文件的位置）
2. 应用自动创建今天的日记文件
3. 在 Today 页面写下今天的任务，用 `#project:名称` 标记项目
4. 切换到 **笔记** 标签，创建会议记录或想法笔记
5. 打开 **AI Chat**，挂载今日任务或任意笔记作为上下文提问

---

## 🏗 架构

```
┌──────────────────────────────────────────────────────────────┐
│                  Tauri Desktop Shell                          │
│           (内置 Node.js 运行时，零外部依赖)                    │
├──────────────────────────────────────────────────────────────┤
│  ┌────────────────┐         ┌─────────────────────────────┐  │
│  │   React UI     │◀───────▶│   Express Backend (3003)     │  │
│  │ (Vite/TS/TSX)  │  HTTP   │   (Bundled Node + Server)    │  │
│  └────────────────┘         └────────────┬────────────────┘  │
│                                          │                    │
│                       ┌──────────────────┼──────────────────┐│
│                       │                  │                  │ │
│                  ┌────▼────┐       ┌─────▼─────┐      ┌─────▼────┐
│                  │  Today  │       │  AI Chat  │      │  Notes   │
│                  │  Tasks  │       │           │      │          │
│                  └────┬────┘       └─────┬─────┘      └─────┬────┘
│                       │                  │                  │ │
│                       └──────────────────┼──────────────────┘│
│                                          │                    │
│                          ┌───────────────▼────────────────┐  │
│                          │    Markdown Files (Source of    │  │
│                          │   Truth: Daily/, Notes/,       │  │
│                          │   Projects/)                    │  │
│                          └───────────────┬────────────────┘  │
│                                          │                    │
│              ┌───────────────────────────┼───────────────────┐│
│              ▼                           ▼                   ▼│
│      ┌──────────────┐            ┌────────────┐        ┌────────┐│
│      │ Git (GitHub) │            │ IPFS/Pinata│        │ AI API ││
│      └──────────────┘            └────────────┘        └────────┘│
└──────────────────────────────────────────────────────────────────┘
```

### v1.0.0 关键架构变更

- **内置 Node.js 运行时**：Tauri 打包时下载并嵌入对应架构的 Node 二进制文件，运行时无需系统 Node
- **思考工作台一等对象**：独立存储在 `Workspaces/` 目录，与 `Tasks/` 平级
- **加密随机 ID**：所有 workspace ID 由服务端生成，使用 `crypto.randomBytes`，永不信任客户端传入
- **Rust 启动器增强**：`src-tauri/src/server.rs` 自动定位 bundled runtime，处理可执行权限，提供开发和生产环境的多条 fallback 路径

---

## 🛠 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19 + TypeScript + Tailwind CSS 4 + Motion (Framer Motion) |
| 构建 | Vite 6 + esbuild |
| 后端 | Express.js (TypeScript) |
| 桌面 | Tauri 2 (Rust) |
| 运行时 | **内置 Node.js 20+**（自动下载与权限处理） |
| 数据 | Markdown 文件 + YAML frontmatter（单一数据源） |
| AI | 15+ 供应商（B.AI / Claude / GPT / Gemini / DeepSeek / Kimi / GLM / Qwen 等） |
| 同步 | Git + GitHub API |
| 备份 | IPFS + Pinata |
| 测试 | Vitest + Testing Library（**149 个测试，全部通过**） |

---

## 🤝 贡献

欢迎贡献代码、报告 Bug、提出新功能建议。

### 本地开发

```bash
git clone https://github.com/frankfika/dailyflow.git
cd dailyflow
npm install
npm run dev:all
```

### 代码规范

- TypeScript 严格模式，所有 PR 必须通过 `npm run lint`
- 测试覆盖率：新增功能必须附带测试，运行 `npm test` 确认全绿
- 组件命名：PascalCase；工具函数：camelCase；类型定义：PascalCase
- 提交信息：遵循 Conventional Commits（`feat:` / `fix:` / `chore:` / `docs:` / `test:`）

### 提交流程

1. Fork 仓库，从 `main` 创建特性分支：`git checkout -b feat/your-feature`
2. 提交代码：`git commit -m "feat: add your feature"`
3. 推送分支：`git push origin feat/your-feature`
4. 在 GitHub 创建 Pull Request，描述变更和测试情况

### 报告问题

使用 [GitHub Issues](https://github.com/frankfika/dailyflow/issues)，附上：

- 复现步骤
- 期望行为 vs 实际行为
- 系统信息（macOS 版本 / Windows 版本 / Linux 发行版）
- 应用版本（设置 → About）

---

## 📜 更新日志

### v1.0.1 (2026-06-19)

**🧹 精简产品边界，修复 AI Chat 笔记关联**

#### ✨ 改进

- 🗑️ **移除 Thinking Workspaces**：回退过度设计的思考工作台，回归任务 + 笔记 + AI 对话的核心体验
- 🔗 **AI Chat 全量笔记关联**：上下文选择器现在能搜索并挂载当前 context 下的全部笔记，不再只显示当日笔记
- 🧭 **简化侧边栏导航**：移除「思考空间」入口，保留 Today / 笔记 / AI 对话

#### 🧪 质量

- 145 个测试全部通过，TypeScript 严格模式 0 错误

### v1.0.0 (2026-06)

**🎉 重大里程碑：Thinking Workspaces 正式发布**

#### ✨ 新功能

- 🧠 **Thinking Workspaces**：目标/想法/项目的一等对象，与 task 平级
- 🤖 **AI 整理 Brief**：从 scratchpad 自动生成结构化摘要
- 🛤️ **AI 规划 Journey**：阶段、里程碑、风险、本周重点、今天最小行动
- 🗺️ **AI 生成脑图**：Mermaid 格式，覆盖目标/输入/风险/资料/决策/下一步
- ✅ **AI 拆解任务**：3-7 个 15-60 分钟可完成的下一步，预览后投放到 Today
- 📅 **Timeline 推进记录**：自动记录 AI 输出、任务完成、决策
- 🔖 **多入口创建**：从 Today、note、project、`Cmd+K` 都能创建 workspace

#### 🔒 安全增强

- **加密随机 ID**：服务端强制忽略客户端 ID，使用 `tw_` 前缀 + crypto 随机后缀，防止 ID 劫持攻击
- **优雅错误处理**：单个 workspace 文件损坏不会拖垮整个列表
- **路径校验强化**：避免 `../` 等路径穿越

#### 📦 基础设施

- **内置 Node.js 运行时**：Tauri dmg 内置 91 MB 的 Node 二进制，**用户机器无需安装 Node**
- **Rust 启动器增强**：自动定位运行时，处理可执行权限，多条 fallback 路径
- **bundle 脚本**：`scripts/bundle-node.mjs` 自动下载并打包 Node 运行时

#### 🧪 测试

- 新增 6 个测试文件，覆盖 workspace 全生命周期
- 149 个测试全部通过，TypeScript 严格模式 0 错误

### v0.11.0 之前版本

参见 [完整更新日志](https://github.com/frankfika/dailyflow/releases)。

---

## 📄 License

[Apache License 2.0](./LICENSE)

---

## 🙏 致谢

感谢所有贡献者和用户的反馈。DailyFlow 始于「不想每天手动整理待办」的小愿望，现在已经成长为一个简洁的任务与笔记系统。

<div align="center">

如果这个项目对你有帮助，欢迎点 ⭐ Star 支持！

[⭐ Star on GitHub](https://github.com/frankfika/dailyflow) · [📥 下载 v1.0.1](https://github.com/frankfika/dailyflow/releases/latest) · [🐛 报告问题](https://github.com/frankfika/dailyflow/issues)

</div>