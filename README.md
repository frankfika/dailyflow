<div align="center">

<img src="./docs/assets/logo.svg" width="480" alt="DailyFlow Logo" />

# DailyFlow

> 本地优先的每日任务管理工具 · Local-First Daily Task Management

![Main Interface](./docs/assets/home.png)

### Markdown 驱动，自动迁移未完成任务，让你专注于当下

![Version](https://img.shields.io/badge/Version-0.2.0-blue?style=flat-square)
![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-green?style=flat-square)
![License](https://img.shields.io/badge/License-Apache--2.0-lightgrey?style=flat-square)
![Tech](https://img.shields.io/badge/Stack-React%20%2B%20Tauri%20%2B%20TypeScript-purple?style=flat-square)

[核心功能](#-核心功能) • [下载](#-下载) • [界面预览](#-界面预览) • [快速开始](#-快速开始) • [架构设计](#-架构设计)

__简体中文__ | [English](./README_EN.md)

---
</div>

## 项目简介

DailyFlow 是一个**本地优先**的每日任务管理桌面应用。它以 Markdown 文件为数据源，自动处理跨日任务迁移，让你不再需要每天手动整理昨天的未完成事项。

### 为什么选择 DailyFlow？

| 传统方式 | DailyFlow |
|---------|-----------|
| 每天手动复制未完成任务到新页面 | 自动迁移，打开即用 |
| 任务数据锁在某个 SaaS 平台 | 本地 Markdown 文件，完全可控 |
| 需要网络才能使用 | 离线优先，随时可用 |
| 复杂的项目管理界面 | 极简设计，专注当日 |
| 与 Obsidian 等工具不兼容 | 原生 Markdown，无缝衔接 |

## 📦 下载

前往 [Releases](https://github.com/frankfika/dailyflow/releases/latest) 下载对应平台的安装包：

| 平台 | 文件 |
|------|------|
| macOS (Apple Silicon) | `DailyFlow_x.x.x_aarch64.dmg` |
| macOS (Intel) | `DailyFlow_x.x.x_x64.dmg` |
| Windows | `DailyFlow_x.x.x_x64-setup.exe` |
| Linux | `DailyFlow_x.x.x_amd64.AppImage` |

> macOS 用户：当前发行版未做苹果公证，首次打开时请在「访达」里**右键 → 打开**，绕过 Gatekeeper 提示。

## ✨ 核心功能

### 1. 自动任务迁移 (Rollover)

未完成的任务会在你打开应用时自动迁移到今天，并保留来源日期标记。已迁移的任务不会重复迁移。

- **自动迁移**：打开应用时检测并迁移
- **手动迁移**：预览待迁移任务，确认后执行
- **来源追踪**：每个迁移任务标注原始日期
- **防重复**：已迁移任务（`[>]`）不会再次出现在迁移列表中

### 2. 可视化 + Markdown 双模式

在精美的可视化界面和原始 Markdown 之间自由切换。数据始终以 Markdown 存储，你可以用任何编辑器打开。

### 3. AI Brain Dump

把零散想法一股脑倒进去，AI 自动提取任务、分类、设置截止日期。支持 DeepSeek、OpenAI、Anthropic 等多种 AI 服务，内置连接测试一键验证配置。

### 4. 工作/生活上下文切换

一键切换工作和生活模式，任务自动按上下文过滤，互不干扰。

### 5. 项目概览

跨日期聚合所有待办任务，按分类/项目维度查看全局进度。支持关键字搜索和标签筛选，快速定位任意项目下的待办事项。

### 6. Git 同步

一键提交到 GitHub，自动备份你的所有笔记和任务数据。启动时自动验证连接状态，侧栏点击和保存配置时也会自动重测，无需手动点击「测试连接」。

## 📸 界面预览

| 主界面 | 添加任务 |
|--------|---------|
| ![主界面](./docs/assets/home.png) | ![添加任务](./docs/assets/add-task.png) |

| 项目概览 | Markdown 编辑 |
|---------|--------------|
| ![项目概览](./docs/assets/projects.png) | ![Markdown](./docs/assets/markdown-view.png) |

## 🚀 快速开始

### 方式一：下载安装包（推荐）

见上方 [📦 下载](#-下载) 章节。

### 方式二：从源码运行

```bash
# 克隆仓库
git clone https://github.com/frankfika/dailyflow.git
cd dailyflow

# 安装依赖
npm install

# 启动开发服务器（前端 + 后端）
npm run dev:all  # 同时启动前端和后端

# 或者启动 Tauri 桌面应用
npm run tauri dev
```

### 首次使用

1. 启动应用后，设置你的工作区目录（存放 Markdown 文件的位置）
2. 应用会自动创建今天的日记文件
3. 开始添加任务，使用标签分类
4. 第二天打开时，未完成任务自动迁移到今天

## 🏗 架构设计

```
┌─────────────────────────────────────────────┐
│              Tauri Desktop Shell             │
├─────────────────────────────────────────────┤
│                                             │
│  ┌─────────────┐     ┌──────────────────┐  │
│  │   React UI  │────▶│  Express Backend  │  │
│  │  (Vite/TS)  │◀────│   (Port 3003)    │  │
│  └─────────────┘     └──────────────────┘  │
│                              │               │
│                              ▼               │
│                    ┌──────────────────┐      │
│                    │  Markdown Files  │      │
│                    │  (Source of Truth)│      │
│                    └──────────────────┘      │
│                              │               │
│                              ▼               │
│                    ┌──────────────────┐      │
│                    │   Git (Optional) │      │
│                    │   GitHub Sync    │      │
│                    └──────────────────┘      │
│                                             │
└─────────────────────────────────────────────┘
```

**核心原则：**
- **Markdown 为源**：所有数据以 Markdown 文件存储，是唯一的数据源
- **本地优先**：所有操作在本地完成，无需网络
- **非破坏性**：所有写入操作都有预览和确认机制
- **Git 友好**：每次操作都可以生成有意义的 commit

## 🛠 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19 + TypeScript + Tailwind CSS 4 |
| 动画 | Framer Motion |
| 构建 | Vite 6 |
| 后端 | Express.js (TypeScript) |
| 桌面 | Tauri 2 (Rust) |
| AI | DeepSeek / OpenAI / Anthropic (可选) |
| 版本控制 | Git + GitHub API |

## 📝 数据格式

DailyFlow 使用标准 Markdown 格式存储任务：

```markdown
## Tasks

- [ ] 完成项目报告 #work #deadline:2026-05-15
- [x] 回复客户邮件 #work
- [>] 整理会议纪要 #work (migrated to 2026-05-12)

## Notes

今天的会议讨论了 Q3 计划...
```

**任务状态：**
- `- [ ]` 待办
- `- [x]` 已完成
- `- [>]` 已迁移

**支持的标签：**
- `#tag` — 分类标签
- `#deadline:YYYY-MM-DD` — 截止日期
- `#priority:high|medium|low` — 优先级
- `#project:name` — 所属项目

## 📄 License

[Apache License 2.0](./LICENSE)
