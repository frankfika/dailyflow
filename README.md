<div align="center">

<img src="./docs/assets/logo.svg" width="480" alt="DailyFlow Logo" />

# DailyFlow

> 本地优先的每日任务管理工具 · Local-First Daily Task Management

![Main Interface](./docs/assets/home.png)

### Markdown 驱动，自动迁移未完成任务，让你专注于当下

![Version](https://img.shields.io/badge/Version-0.5.7-blue?style=flat-square)
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
| Windows | `DailyFlow_x.x.x_x64-setup.exe` |
| Linux | `DailyFlow_x.x.x_amd64.AppImage` |

> **macOS 用户注意**：
> 
> 如果遇到 "DailyFlow is damaged" 错误，请执行：
> ```bash
> sudo xattr -rd com.apple.quarantine /Applications/DailyFlow.app
> ```
> 详见 [macOS 错误修复指南](docs/MACOS_DAMAGED_FIX.md)

## ✨ 核心功能

### 1. 自动任务迁移 (Rollover)

未完成的任务会在你打开应用时自动迁移到今天，并保留来源日期标记。已迁移的任务不会重复迁移。

- **自动迁移**：打开应用时检测并迁移
- **手动迁移**：预览待迁移任务，确认后执行
- **来源追踪**：每个迁移任务标注原始日期
- **防重复**：已迁移任务（`[>]`）不会再次出现在迁移列表中

### 2. 可视化任务管理

精美的卡片式界面，任务按标签分类展示。数据始终以 Markdown 存储，你可以用任何编辑器打开。

### 3. AI Brain Dump

把零散想法一股脑倒进去，AI 自动提取任务、分类、设置截止日期。支持 DeepSeek、OpenAI、Anthropic 等多种 AI 服务，内置连接测试一键验证配置。

### 4. 工作/生活上下文切换

一键切换工作和生活模式，任务自动按上下文过滤，互不干扰。

### 5. 项目概览

跨日期聚合所有待办任务，按分类/项目维度查看全局进度。支持关键字搜索和标签筛选，快速定位任意项目下的待办事项。

### 6. 笔记系统 (Notes)

独立的笔记功能，支持三种类型：
- **普通笔记**：随时记录想法、灵感、备忘
- **会议记录**：参会人、时间段、录音文件、语音转文字
- **AI 总结**：选择范围和提示词，AI 生成结构化总结并保存为笔记

笔记特性：
- **@提及**：在笔记中 `@人名` 自动解析，支持按人员筛选
- **多维筛选**：按类型、@人员、项目、标签、时间范围过滤
- **任务关联**：笔记可关联任务和项目，双向可查
- **时间线集成**：当天的笔记自动出现在每日视图中
- **Work/Life 联动**：跟随上下文切换自动过滤
- **AI 调用走后端代理**：API key 不暴露到浏览器，避免 CORS 问题（v0.3.0+）

### 7. 标签筛选

在每日笔记和笔记页面内直接按标签筛选内容：
- **每日笔记**：顶部标签 pills 快速筛选当日任务
- **笔记页面**：标签 pills 筛选笔记，支持多维度组合过滤
- **上下文联动**：跟随 Work/Life 上下文自动过滤

### 8. Git 同步

一键提交到 GitHub，自动备份你的所有笔记和任务数据。顶部状态栏实时显示同步状态和最近同步时间，启动时自动验证连接状态，保存配置时也会自动重测，无需手动点击「测试连接」。

### 9. IPFS 去中心化备份

将工作区完整快照一键上传到 IPFS（通过 Pinata），获得永久、去中心化的数据备份。每次备份生成唯一的 CID，可在任意 IPFS 网关访问。

- **一键备份**：设置页面点击「立即备份」，自动打包所有 Markdown 文件上传
- **连接测试**：内置 Pinata JWT 验证，一键检测配置是否正确
- **备份历史**：查看最近 50 条备份记录，支持复制 CID 和在网关打开
- **自定义网关**：可配置私有 IPFS 网关，默认使用 Pinata Gateway

### 10. 应用内更新检测

自动检测 GitHub Releases 的最新版本，无需手动访问仓库查找更新：
- **启动时自动检查**：应用启动后 3 秒自动检测新版本
- **顶部横幅提示**：发现新版本时显示更新提示，一键跳转下载
- **手动检查**：设置页面提供"检查更新"按钮，随时查看版本状态
- **智能平台识别**：根据当前系统自动推荐对应平台的安装包
- **下载按钮调用系统浏览器**：基于 `tauri-plugin-shell` 打开系统默认浏览器，点击即跳转下载
- **失败时显示错误原因**：网络错误或 GitHub API 限流时，明确提示"检查更新失败"而不是误报"已是最新版本"

### 11. AI 功能中心

侧边栏新增独立的 AI 功能区域，包含三个模块：

#### 提示词库
- 管理和编辑 AI 格式化提示词模板
- 支持多种 scope（格式、日期范围、项目、人员、自定义）
- **提示词测试**：输入测试文本，运行提示词，实时查看 AI 输出效果
- 添加/编辑/删除提示词，完全可控

#### 模型库（即将推出）
预留扩展能力，支持多种 AI 模型配置管理。

#### AI Agent（即将推出）
预留扩展能力，支持 AI Agent 工作流。

**多配置支持**：
- 可创建多个 AI 配置（不同 API Key、不同模型）
- 同一时间只使用一个配置，点击切换
- 配置存储在本地，安全私密

## 📸 界面预览

| 主界面 | 添加任务 |
|--------|---------|
| ![主界面](./docs/assets/home.png) | ![添加任务](./docs/assets/add-task.png) |

| 项目概览 | 笔记列表 |
|---------|----------|
| ![项目概览](./docs/assets/projects.png) | ![笔记](./docs/assets/notes.png) |

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
│                    │  Markdown Files  │      │
│                    │  (Source of Truth)│      │
│                    └──────────────────┘      │
│                              │               │
│              ┌───────────────┴───────────────┐│
│              ▼                               ▼│
│    ┌──────────────────┐        ┌──────────────────┐ │
│    │   Git (Optional) │        │ IPFS (Optional)  │ │
│    │   GitHub Sync    │        │  Pinata Backup   │ │
│    └──────────────────┘        └──────────────────┘ │
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
| 去中心化备份 | IPFS + Pinata (可选) |

## 📝 数据格式

DailyFlow 使用标准 Markdown 格式存储任务：

```markdown
## Tasks

- [ ] 完成项目报告 #work #deadline:2026-05-15
- [x] 回复客户邮件 #work
- [>] 整理会议纪要 #work (migrated to 2026-05-12)
```

**笔记格式（Markdown + YAML frontmatter）：**

```markdown
---
type: meeting_note
date: 2026-05-17
time: "14:00"
end_time: "15:00"
context: work
tags: [投资, 策略]
mentions: [张总, 李明]
participants: [陈方, 东海投资-张总]
---

# 东海投资沟通会议

## 会议要点

1. 投决会延后到6月初
2. 需要补充盈利预测材料

## 待办事项

- [ ] 补充盈利预测 @李明
- [ ] 发送补充材料给 @张总
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
