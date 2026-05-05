<div align="center">

![DailyFlow](./docs/assets/logo.svg)

# DailyFlow

> 本地优先的智能日程管理系统 · Local-First Smart Daily Task Manager

![主界面](./docs/assets/home.png)

### 把 Markdown 日记变成智能任务工作台

![Version](https://img.shields.io/badge/Version-1.0.0-blue?style=flat-square)
![Platform](https://img.shields.io/badge/Platform-Web-green?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-lightgrey?style=flat-square)
![React](https://img.shields.io/badge/React-19.0-61DAFB?style=flat-square&logo=react)

[核心功能](#-核心功能) • [界面导览](#-界面导览) • [快速开始](#-快速开始) • [技术栈](#-技术栈)

__简体中文__ | [English](./README_EN.md)

---
</div>

## 项目简介

DailyFlow 是一个**本地优先**的智能日程管理系统，专为使用 Markdown 和 Obsidian 的用户设计。它不是另一个封闭的 Todo App，而是一个增强你现有工作流的智能工作台。

### 为什么选择 DailyFlow？

| 传统方式 | DailyFlow |
|---------|-----------|
| 手动复制粘贴未完成任务 | 自动滚动到下一天 |
| 任务散落在各个文件中 | 统一的项目管理视图 |
| 纯文本编辑，无可视化 | 可视化任务列表 + Markdown 编辑 |
| 无 AI 辅助 | AI 智能总结和任务生成 |
| 数据锁定在应用中 | 数据完全属于你（Markdown 文件）|

## ✨ 核心功能

### 1. 智能任务滚动
自动将未完成的任务迁移到下一天，无需手动复制粘贴：

- **自动识别**: 扫描昨天的 Markdown 文件，提取未完成任务
- **智能标记**: 保留任务的所有元数据（标签、截止日期、优先级）
- **来源追踪**: 标记任务来源日期，方便追溯

![任务列表](./docs/assets/tasks.png)

### 2. 项目管理
将长期任务组织成项目，统一追踪进度：

- **项目视图**: 独立的项目管理界面
- **状态追踪**: 进行中、已完成、已归档
- **任务关联**: 项目任务自动同步到每日视图

![项目管理](./docs/assets/projects.png)

### 3. AI 智能助手
使用 AI 提升工作效率：

- **智能总结**: 自动总结一段时间内的工作成果
- **任务生成**: 从自然语言描述生成结构化任务
- **自定义提示词**: 支持自定义 AI 提示词模板

### 4. 工作区配置
灵活的工作区管理：

- **首次启动向导**: 引导用户设置工作区路径
- **路径验证**: 自动验证和创建工作区目录
- **GitHub 同步**: 配置 GitHub 仓库进行数据同步

## 📸 界面导览

| 主界面 | 项目管理 | 功能特性 |
|--------|---------|---------|
| ![主界面](./docs/assets/home.png) | ![项目管理](./docs/assets/projects.png) | ![功能特性](./docs/assets/features.png) |

## 🚀 快速开始

### 安装依赖

```bash
git clone https://github.com/frankfika/dailyflow.git
cd dailyflow
npm install
```

### 启动应用

```bash
# 同时启动前端和后端
npm run dev:all

# 或者分别启动
npm run dev      # 前端 (http://localhost:3002)
npm run server   # 后端 (http://localhost:3003)
```

### 首次使用

1. 访问 http://localhost:3002
2. 按照向导设置工作区路径（可以是 Obsidian 目录）
3. 开始使用！

## 🛠️ 技术栈

```text
Frontend   React 19 + TypeScript + Vite + Tailwind CSS
Backend    Express.js + TypeScript
Storage    Markdown files (本地文件系统)
AI         Google Gemini API
Testing    Vitest + Testing Library
```

## 📁 项目结构

```text
dailyflow/
├── src/                    # 前端源代码
│   ├── components/         # React 组件
│   ├── api/               # API 客户端
│   └── types/             # TypeScript 类型定义
├── server/                # 后端源代码
│   ├── routes/            # API 路由
│   ├── services/          # 业务逻辑
│   └── types/             # 类型定义
├── docs/                  # 文档和资源
└── scripts/               # 工具脚本
```

## 🎯 核心特性

- ✅ **本地优先**: 所有数据存储在本地 Markdown 文件中
- ✅ **Obsidian 兼容**: 完全兼容 Obsidian 的 Markdown 格式
- ✅ **自动任务滚动**: 未完成任务自动迁移到下一天
- ✅ **项目管理**: 独立的项目管理视图
- ✅ **AI 智能助手**: 使用 AI 生成任务和总结
- ✅ **GitHub 同步**: 支持 GitHub 仓库同步
- ✅ **可视化编辑**: 可视化任务列表 + Markdown 编辑器

## 📝 更新日志

### v1.0.0 (2026-05)
- ✨ 添加工作区配置功能（首次启动向导、路径验证）
- ✨ 实现项目管理系统（完整的 CRUD 操作）
- ✨ 添加 AI 总结增强（自定义日期范围、提示词模板）
- ✨ 添加 GitHub 仓库验证功能
- 🐛 修复删除任务后状态不同步的 bug
- 🔧 更新后端端口从 3002 到 3003

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 🤝 贡献

欢迎贡献！请查看 [CONTRIBUTING.md](CONTRIBUTING.md) 了解详情。

## 📮 联系方式

- GitHub: [@frankfika](https://github.com/frankfika)
- Issues: [GitHub Issues](https://github.com/frankfika/dailyflow/issues)

---

<div align="center">

**[⬆ 回到顶部](#dailyflow)**

Made with ❤️ by DailyFlow Team

</div>

