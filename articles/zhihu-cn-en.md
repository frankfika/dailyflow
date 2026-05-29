# 知乎回答/文章 - 中文

---

# 我做了个本地优先的每日任务管理工具，用 Markdown 做数据源，自动迁移跨日任务

## 先问个问题

你每天早上第一件事是什么？

我的答案是：把昨天的未完成任务「复制粘贴」到今天。

这件事我忍了一年，终于受不了，自己写了个工具：**DailyFlow**。

---

## 核心功能

### 1. 自动任务迁移 (Rollover)

这是核心功能。

每天打开应用，未完成的任务会自动迁移到今天的清单，标注来源日期。已迁移的任务不会重复出现。

你可以预览要迁移的任务，确认后再执行，完全可控。

![主界面](docs/assets/home.png)

### 2. Markdown 文件为数据源

所有数据以 Markdown 文件存储，没有云端锁定，完全离线可用。

可以用 Obsidian、Typora、VS Code 等任何编辑器打开，天然支持 Git 版本控制。

![Markdown视图](docs/assets/markdown-view.png)

### 3. AI Brain Dump

把零散想法、会议记录一股脑倒进去，AI 自动提取任务、分类、设截止日期。

支持 DeepSeek、OpenAI、Anthropic 等，内置连接测试。

![AI提示词库](docs/assets/ai-prompts.png)

### 4. 工作/生活上下文切换

一键切换「工作模式」和「生活模式」，任务自动过滤，互不干扰。

### 5. 笔记系统

三种笔记类型：普通笔记、会议记录、AI 总结。

支持 @提及人员、多维筛选、任务关联、时间线集成。

![笔记系统](docs/assets/notes.png)

### 6. Git + IPFS 备份

Git 同步一键提交到 GitHub，IPFS 通过 Pinata 做去中心化永久备份。

## 技术栈

- 前端：React 19 + TypeScript + Tailwind CSS 4
- 桌面：Tauri 2 (Rust)
- 后端：Express.js
- 支持：macOS / Windows / Linux

## 下载

github.com/frankfika/dailyflow/releases

---

欢迎交流讨论！

---

# 知乎回答/文章 - English

---

# I Built a Local-First Daily Task Manager with Markdown as Data Source and Automatic Cross-Day Task Migration

## Let me ask you first

What's the first thing you do every morning?

Mine was: copy yesterday's unfinished tasks to today's page.

I did this for a year. Finally built **DailyFlow** to solve it.

---

## Core Features

### 1. Automatic Task Rollover

This is the core feature.

Every morning when you open the app, unfinished tasks automatically migrate to today's view with source date tracking. Already-migrated tasks won't appear again.

You can preview tasks before committing. Fully under your control.

![Main Interface](docs/assets/home.png)

### 2. Markdown Files as Data Source

All data stored as Markdown files. No cloud lock-in, fully offline capable.

Open with Obsidian, Typora, VS Code — your choice. Native Git version control support.

![Markdown View](docs/assets/markdown-view.png)

### 3. AI Brain Dump

Dump scattered thoughts and meeting notes, AI automatically extracts tasks, categorizes, and sets deadlines.

Supports DeepSeek, OpenAI, Anthropic, and more. Built-in connection test.

![AI Prompt Library](docs/assets/ai-prompts.png)

### 4. Work/Life Context Switching

One tap to switch between Work and Life modes. Tasks filter automatically, no interference.

### 5. Notes System

Three note types: regular, meeting, AI summaries.

Supports @mentions, multi-dimensional filtering, task linking, timeline integration.

![Notes System](docs/assets/notes.png)

### 6. Git + IPFS Backup

Git sync with one-click commit to GitHub, IPFS via Pinata for decentralized permanent backup.

## Tech Stack

- Frontend: React 19 + TypeScript + Tailwind CSS 4
- Desktop: Tauri 2 (Rust)
- Backend: Express.js
- Supports: macOS / Windows / Linux

## Download

github.com/frankfika/dailyflow/releases

---

Let's discuss!