<div align="center">

<img src="./docs/assets/logo.svg" width="480" alt="DailyFlow Logo" />

# DailyFlow

> 本地优先的智能任务管理 · Local-First Intelligent Task Management

![Main Interface](./docs/assets/home.png)

![Version](https://img.shields.io/badge/Version-0.11.0-blue?style=flat-square)
![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-green?style=flat-square)
![License](https://img.shields.io/badge/License-Apache--2.0-lightgrey?style=flat-square)
![Tech](https://img.shields.io/badge/Stack-React%20%2B%20Tauri%20%2B%20TypeScript-purple?style=flat-square)

**[中文](#中文)** | **[English](#english)**

</div>

---

# 中文

## 项目简介

DailyFlow 是一个**本地优先**的智能任务管理桌面应用。以 Markdown 文件为数据源，内置 AI 助手，自动处理跨日任务迁移，让你不再每天手动整理昨天的未完成事项。

### 为什么选择 DailyFlow？

| 传统方式 | DailyFlow |
|---------|-----------|
| 每天手动复制未完成任务 | 自动迁移，打开即用 |
| 数据锁在 SaaS 平台 | 本地 Markdown，完全可控 |
| 需要网络才能使用 | 离线优先，随时可用 |
| 复杂的项目管理界面 | 极简设计，专注当日 |
| AI 功能要额外付费 | 内置 AI，支持 15+ 模型供应商 |

## 📦 下载

前往 [Releases](https://github.com/frankfika/dailyflow/releases/latest) 下载：

| 平台 | 文件 |
|------|------|
| macOS (Apple Silicon) | `DailyFlow_x.x.x_aarch64.dmg` |
| Windows | `DailyFlow_x.x.x_x64-setup.exe` |
| Linux | `DailyFlow_x.x.x_amd64.AppImage` |

> **macOS 用户**：遇到 "damaged" 错误请执行 `sudo xattr -rd com.apple.quarantine /Applications/DailyFlow.app`

## ✨ 核心功能

### 📋 任务管理

- **自动迁移**：未完成任务在次日自动迁移，保留来源日期标记
- **卡片式界面**：任务按标签分类展示，支持评论和关联笔记
- **Work/Life 切换**：一键切换工作/生活上下文，任务自动过滤
- **项目概览**：跨日期聚合待办，按分类查看全局进度
- **标签系统**：支持 `#tag`、`#deadline:日期`、`#priority:级别`、`#project:名称`

### 🤖 AI 助手

- **AI Chat**：完整聊���界���，支持多会话、上下文注入（今日任务/笔记/项目）
- **AI Tool Use**：AI 可直接创建任务、保存笔记、操作项目
- **Brain Dump**：把零散想法倒进去，AI 自动提取和分类任务
- **AI 总结**：选择范围和提示词，生成结构化日报/周报
- **Skill Marketplace**：技能市场，支持 Slash Command 和 Agent Skill
- **提示词库**：管理和测试 AI 格式化提示词模板

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
- **AI 助手**：润色、续写、提取待办、整理会议纪要，实时跟随当前 AI 模型
- **发到对话**：把笔记作为上下文绑定到 AI 对话，输入框只留你的提问
- **@提及**：`@人名` 自动解析，支持按人员筛选
- **多维筛选**：按类型、人员、项目、标签、时间范围过滤
- **任务关联**：笔记与任务双向关联

### 📚 多笔记本

- 侧边栏一键切换多个工作区
- 自动发现本地笔记文件夹
- 每个笔记本记住最后停留日期

### 🔄 同步与备份

- **Git 同步**：一键提交到 GitHub，侧边栏显示同步状态
- **IPFS 备份**：通过 Pinata 上传去中心化备份，获得永久 CID
- **应用内更新**：自动检测新版本，一键下载安装

## 📸 界面预览

| 主界面 | 添加任务 |
|--------|---------|
| ![主界面](./docs/assets/home.png) | ![添加任务](./docs/assets/add-task.png) |

| 项目概览 | 笔记列表 |
|---------|----------|
| ![项目概览](./docs/assets/projects.png) | ![笔记](./docs/assets/notes.png) |

## 🚀 快速开始

### 下载安装（推荐）

前往 [Releases](https://github.com/frankfika/dailyflow/releases/latest) 下载对应平台安装包。

### 从源码运行

```bash
git clone https://github.com/frankfika/dailyflow.git
cd dailyflow
npm install
npm run dev:all     # 前端 + 后端
# 或
npm run tauri dev   # Tauri 桌面应用
```

### 首次使用

1. 设置工作区目录（存放 Markdown 文件的位置）
2. 应用自动创建今天的日记文件
3. 开始添加任务，使用标签分类
4. 第二天打开时，未完成任务自动迁移

## 🏗 架构

```
┌──────────────────────────────────────────┐
│           Tauri Desktop Shell            │
├──────────────────────────────────────────┤
│  ┌────────────┐     ┌─────────────────┐ │
│  │  React UI  │◀───▶│ Express Backend  │ │
│  │ (Vite/TS)  │     │  (Port 3003)    │ │
│  └────────────┘     └────────┬────────┘ │
│                              │           │
│                    ┌─────────▼─────────┐ │
│                    │  Markdown Files   │ │
│                    │ (Source of Truth)  │ │
│                    └─────────┬─────────┘ │
│              ┌───────────────┼───────────┐
│              ▼               ▼           ▼
│     ┌──────────────┐ ┌────────────┐ ┌────────┐
│     │ Git (GitHub) │ │ IPFS/Pinata│ │ AI API │
│     └──────────────┘ └────────────┘ └────────┘
└──────────────────────────────────────────┘
```

## 🛠 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19 + TypeScript + Tailwind CSS 4 + Framer Motion |
| 构建 | Vite 6 |
| 后端 | Express.js (TypeScript) |
| 桌面 | Tauri 2 (Rust) |
| AI | 15+ 供应商（B.AI / Claude / GPT / Gemini / DeepSeek 等） |
| 同步 | Git + GitHub API |
| 备份 | IPFS + Pinata |

## 📄 License

[Apache License 2.0](./LICENSE)

---

# English

## Introduction

DailyFlow is a **local-first** intelligent task management desktop app. It uses Markdown files as its data source, features a built-in AI assistant, and automatically handles cross-day task migration — so you never have to manually carry over yesterday's unfinished items.

### Why DailyFlow?

| Traditional | DailyFlow |
|-------------|-----------|
| Manually copy unfinished tasks every day | Auto-migration, ready when you open |
| Data locked in SaaS platforms | Local Markdown files, full ownership |
| Requires internet | Offline-first, always available |
| Complex project management UI | Minimal design, focused on today |
| AI features cost extra | Built-in AI, 15+ model providers |

## 📦 Download

Head to [Releases](https://github.com/frankfika/dailyflow/releases/latest):

| Platform | File |
|----------|------|
| macOS (Apple Silicon) | `DailyFlow_x.x.x_aarch64.dmg` |
| Windows | `DailyFlow_x.x.x_x64-setup.exe` |
| Linux | `DailyFlow_x.x.x_amd64.AppImage` |

> **macOS users**: If you see a "damaged" error, run `sudo xattr -rd com.apple.quarantine /Applications/DailyFlow.app`

## ✨ Features

### 📋 Task Management

- **Auto Migration**: Unfinished tasks automatically roll over to the next day with source date tracking
- **Card-based UI**: Tasks grouped by tags, with comments and linked notes
- **Work/Life Switch**: One-click context switching, tasks auto-filtered
- **Project Overview**: Cross-date task aggregation by category
- **Tag System**: `#tag`, `#deadline:date`, `#priority:level`, `#project:name`

### 🤖 AI Assistant

- **AI Chat**: Full chat interface with multi-session, context injection (today's tasks/notes/projects)
- **AI Tool Use**: AI can directly create tasks, save notes, manage projects
- **Brain Dump**: Pour in scattered thoughts, AI extracts and categorizes tasks
- **AI Summary**: Generate structured daily/weekly reports
- **Skill Marketplace**: Slash commands and Agent Skills
- **Prompt Library**: Manage and test AI formatting prompt templates

### 🔌 AI Model Support

One-click configuration for 15+ AI providers:

| Type | Providers |
|------|-----------|
| Aggregator | **B.AI** (29+ models, one key), OpenRouter |
| China | DeepSeek, Kimi, MiniMax, GLM, Doubao, Qwen, SiliconFlow |
| Global | Anthropic Claude, OpenAI, Google Gemini, Groq |
| Custom | Any OpenAI-compatible API |

### 📝 Notes

- **Multi-type**: Regular notes, meeting notes, AI summaries
- **Read-only Preview**: Click a card to open in read-only view, hit Edit to modify — no accidental edits
- **AI Assist**: Polish, continue, extract todos, format meeting notes — always uses your current AI model
- **Send to Chat**: Bind a note as context in AI chat; the input box keeps only your question
- **@Mentions**: Auto-parsed, filterable by person
- **Multi-dimensional Filters**: By type, person, project, tag, date range
- **Task Linking**: Bidirectional linking between notes and tasks

### 📚 Multi-Notebook

- Sidebar switcher for multiple workspaces
- Auto-discovers local note folders
- Each notebook remembers last visited date

### 🔄 Sync & Backup

- **Git Sync**: One-click push to GitHub, status displayed in sidebar
- **IPFS Backup**: Decentralized backup via Pinata with permanent CID
- **In-app Updates**: Auto-detect new versions, one-click install

## 📸 Screenshots

| Home | Add Task |
|------|----------|
| ![Home](./docs/assets/home.png) | ![Add Task](./docs/assets/add-task.png) |

| Projects | Notes |
|----------|-------|
| ![Projects](./docs/assets/projects.png) | ![Notes](./docs/assets/notes.png) |

## 🚀 Quick Start

### Download (Recommended)

Grab the installer from [Releases](https://github.com/frankfika/dailyflow/releases/latest).

### Run from Source

```bash
git clone https://github.com/frankfika/dailyflow.git
cd dailyflow
npm install
npm run dev:all     # Frontend + Backend
# or
npm run tauri dev   # Tauri desktop app
```

### First Use

1. Set your workspace directory (where Markdown files will be stored)
2. App auto-creates today's journal file
3. Start adding tasks with tags
4. Next day, unfinished tasks auto-migrate

## 🏗 Architecture

```
┌──────────────────────────────────────────┐
│           Tauri Desktop Shell            │
├──────────────────────────────────────────┤
│  ┌────────────┐     ┌─────────────────┐ │
│  │  React UI  │◀───▶│ Express Backend  │ │
│  │ (Vite/TS)  │     │  (Port 3003)    │ │
│  └────────────┘     └────────┬────────┘ │
│                              │           │
│                    ┌─────────▼─────────┐ │
│                    │  Markdown Files   │ │
│                    │ (Source of Truth)  │ │
│                    └─────────┬─────────┘ │
│              ┌───────────────┼───────────┐
│              ▼               ▼           ▼
│     ┌──────────────┐ ┌────────────┐ ┌────────┐
│     │ Git (GitHub) │ │ IPFS/Pinata│ │ AI API │
│     └──────────────┘ └────────────┘ └────────┘
└──────────────────────────────────────────┘
```

## 🛠 Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19 + TypeScript + Tailwind CSS 4 + Framer Motion |
| Build | Vite 6 |
| Backend | Express.js (TypeScript) |
| Desktop | Tauri 2 (Rust) |
| AI | 15+ providers (B.AI / Claude / GPT / Gemini / DeepSeek etc.) |
| Sync | Git + GitHub API |
| Backup | IPFS + Pinata |

## 📄 License

[Apache License 2.0](./LICENSE)
