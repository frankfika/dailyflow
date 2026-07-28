<div align="center">

<img src="./docs/assets/logo.svg" width="480" alt="DailyFlow Logo" />

# DailyFlow

> **把无限待办，收敛成今天的三件事**
>
> 每天少承诺一点，真正完成一点。数据只存在你的本地 Markdown 里。

![主界面](./docs/assets/home.png)

![Version](https://img.shields.io/badge/Version-1.1.14-blue?style=flat-square)
![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-green?style=flat-square)
![License](https://img.shields.io/badge/License-Apache--2.0-lightgrey?style=flat-square)
![Tech](https://img.shields.io/badge/Stack-React%20%2B%20Tauri%20%2B%20Express-purple?style=flat-square)

[核心功能](#-核心功能) · [界面预览](#-界面预览) · [快速开始](#-快速开始) · [技术栈](#-技术栈) · [贡献](#-贡献)

__简体中文__ | [English](./README_EN.md)

---

</div>

> [!IMPORTANT]
> 当前 README 描述的是已实现版本及其过渡中的 Today’s Three 体验。下一代 AI-native 产品的开发主规范是 [`docs/AI_NATIVE_PRODUCT_DEVELOPMENT_SPEC.md`](./docs/AI_NATIVE_PRODUCT_DEVELOPMENT_SPEC.md)。后续产品、数据模型和开发决策以该文档为准。

## ✦ 下一版：Today’s Three

大多数任务工具擅长帮你**收集更多**，DailyFlow 现在只解决一个更具体的问题：

> 当待办越积越多时，今天到底该做什么？

每天打开应用，AI 会先读完你的待办、优先级、截止日期和积压时间。你只需告诉它一句今天的现实限制，它会提出三件「今日承诺」并解释取舍；你可以继续用自然语言重排，也可以随时手动调整。

1. **收集**：把脑中的事情快速记进收集箱
2. **收敛**：只选今天最值得推进的三件事
3. **完成**：一次只盯下一件，完成后获得清晰的闭环
4. **回顾**：其余任务留在待办池，不用把“没做完”当成失败

---

## 📖 项目简介

DailyFlow 是一个为「待办过载」设计的 **本地优先（local-first）每日聚焦工具**。Markdown 文件是唯一数据源；AI 和笔记是辅助工具，核心始终是帮助你决定并完成今天最重要的三件事。

### 为什么选择 DailyFlow？

| 传统方式 | DailyFlow |
|---------|-----------|
| 打开应用先看到一整墙欠下的任务 | 先选「今日三件事」，其余自动退到背景 |
| 完成多少都觉得不够 | 三件完成即可明确收工 |
| 数据锁在 SaaS 平台 | 本地 Markdown，完全可控 |
| 需要网络才能使用 | 离线优先，**内置 Node.js 运行时** |
| 复杂项目管理工具上手难 | 不管理整个组织，只帮助你过好今天 |

---

## ✨ 核心功能

### 🎯 今日三件事（vNext）

- **AI 每日规划**：一句话描述时间、精力和硬约束，AI 直接生成今日三件事
- **解释而非黑盒**：明确说明为什么选这三件、哪些事情可以等待
- **持续重排**：情况变化后用一句话让 AI 重新规划
- **人工掌控**：任何时候都可以切换为手动选择
- **单一视觉重点**：选中后从普通列表移出，不再重复争夺注意力
- **明确进度**：实时显示 0/3 → 3/3，完成即闭环
- **本地记忆**：按日期、工作区和 Work/Life 模式分别保存

### 📋 任务管理

- **自动迁移**：未完成任务在次日自动迁移，保留来源日期标记
- **卡片式界面**：任务按标签分类，支持评论、关联笔记
- **Work/Life 切换**：一键切换工作/生活上下文，任务自动过滤
- **标签系统**：支持 `#tag`、`#deadline:日期`、`#priority:级别`、`#project:名称`

### 📅 日历工作区

- **统一日历视图**：在侧边栏直接进入日历，按天、周或月查看任务、定时笔记和外部日程
- **多来源聚合**：将 DailyFlow 本地内容与已连接的企业日历汇总到同一时间轴
- **飞书日程**：读取飞书日历并显示日程详情，可从 DailyFlow 跳转到原始日程
- **可扩展连接器**：连接器插件层已支持飞书，Google Calendar 接口预留中

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

- **飞书双向同步**：同步任务标题、描述、截止日和完成状态；定时会议笔记可推送到飞书日历
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
> **完全独立运行**：dmg 内置了 Node.js 运行时，无需用户机器上预装 Node——下载即可直接使用。

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
6. 进入 **智能工作台**，处理 Inbox、Commitment、Memory 和 Review

---

## 🏗 架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                  Tauri Desktop Shell                                  │
│           (内置 Node.js 运行时，零外部依赖)                            │
├─────────────────────────────────────────────────────────────────────┤
│  ┌────────────────┐         ┌─────────────────────────────┐         │
│  │   React UI     │◀───────▶│   Express Backend (3003)     │         │
│  │ (Vite/TS/TSX)  │  HTTP   │   (Bundled Node + Server)    │         │
│  └───────┬────────┘         └────────────┬────────────────┘         │
│          │                               │                          │
│                                          │                          │
│                                  ┌───────▼──────────────┐           │
│                                  │ Markdown + v2 Store │           │
│                                  └──────┬──────────────┘           │
│                                         │                          │
│              ┌──────────────────────────┼───────────────────────┐ │
│              ▼                          ▼                       ▼ │
│      ┌──────────────┐            ┌────────────┐          ┌────────┐ │
│      │ Git (GitHub) │            │ IPFS/Pinata│          │ AI API │ │
│      └──────────────┘            └────────────┘          └────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

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
| 测试 | Vitest + Testing Library |

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

### v1.1.14 (2026-07-28)

**🩹 首轮工作区路径修复**

- 修复 macOS 首轮工作区路径校验失败
- 统一使用 `127.0.0.1` 连接本地服务，避免 IPv6 `localhost` 解析问题
- 规范化路径末尾斜杠并补充回归验证

### v1.1.13 (2026-07-28)

**🧹 UX cleanup and focused workspace release**

- 移除时间胶囊及其合约、钱包和链依赖
- 接入 AI-Native 工作台，完善 Today / Inbox / Memory / Review
- 修复任务回滚、导入导出、笔记状态和 GitHub Token 安全问题
- 全量测试、E2E Smoke 和生产构建通过

### v1.1.12 (2026-07-27)

**📅 日历工作区与飞书企业同步**

#### ✨ 新功能

- 📅 **全新日历工作区**：新增侧边栏日历入口，支持日 / 周 / 月视图
- 🧩 **连接器插件架构**：聚合本地任务、定时笔记和外部日历，为更多服务预留统一接口
- 🔄 **飞书任务双向同步**：同步标题、描述、截止日和完成状态，并处理两端更新
- 🗓 **飞书日历集成**：读取飞书日程；带开始、结束时间的会议笔记可同步到飞书日历
- 🔐 **企业账号授权**：在设置中完成飞书授权、查看连接状态并手动触发同步
- 📝 **笔记体验优化**：改进笔记列表选择、预览和工作区内的导航体验

#### 🧪 质量

- 321 项测试全部通过
- TypeScript 类型检查、前端生产构建和内置服务端打包全部通过
- macOS Apple Silicon、macOS Intel、Windows 和 Linux 安装包均已发布

### v1.0.6 (2026-07-13)

此版本曾包含一个链上实验功能；该功能及其合约、钱包依赖和接口已从当前版本移除。

### v1.0.5 (2026-07)

chore: 版本号与依赖更新

### v1.0.1 (2026-06-19)

**🧹 精简产品边界，修复 AI Chat 笔记关联**

#### ✨ 改进

- 🗑️ **移除 Thinking Workspaces**：回退过度设计的思考工作台，回归任务 + 笔记 + AI 对话的核心体验
- 🔗 **AI Chat 全量笔记关联**：上下文选择器现在能搜索并挂载当前 context 下的全部笔记
- 🧭 **简化侧边栏导航**：移除「思考空间」入口，保留 Today / 笔记 / AI 对话

#### 🧪 质量

- 145 个测试全部通过，TypeScript 严格模式 0 错误

### v1.0.0 (2026-06)

**🎉 重大里程碑**

- 🧠 Thinking Workspaces（已在 v1.0.1 回退）
- 🤖 AI Brief / Journey / Mind Map
- ✅ AI Next Tasks 拆解
- 📅 Timeline 推进记录
- 🔒 加密随机 ID（防 ID 劫持）
- 📦 内置 Node.js 运行时（dmg 自带，零外部依赖）

### v0.11.0 之前版本

参见 [完整更新日志](https://github.com/frankfika/dailyflow/releases)。

---

## 📄 License

[Apache License 2.0](./LICENSE)

---

## 🙏 致谢

感谢所有贡献者和用户的反馈。DailyFlow 始于「不想每天手动整理待办」的小愿望，现在已经成长为包含任务、笔记、日历和 AI 工作台的完整系统。

<div align="center">

如果这个项目对你有帮助，欢迎点 ⭐ Star 支持！

[⭐ Star on GitHub](https://github.com/frankfika/dailyflow) · [📥 下载最新版本](https://github.com/frankfika/dailyflow/releases/latest) · [🐛 报告问题](https://github.com/frankfika/dailyflow/issues)

</div>
