<div align="center">

# DailyFlow
> Local-first Markdown Task Manager · 让任务自然流动

![Main Interface](./docs/assets/home.png)

### Drop In → Auto-organize → Tasks Flow

![Version](https://img.shields.io/badge/Version-0.1-blue?style=flat-square)
![Platform](https://img.shields.io/badge/Platform-macOS|Windows|Linux-green?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-lightgrey?style=flat-square)

[Features](#-features) • [Screenshots](#-screenshots) • [Quick Start](#-quick-start) • [Architecture](#-architecture)

[简体中文](./README.md) | __English__

---
</div>

## Introduction

DailyFlow is a **local-first** Markdown-based daily task management software: using Markdown files as the primary data source, a web interface to improve operational efficiency, and automatic task migration, project tracking, and AI summaries to reduce the daily burden of repetitive task organization.

### Why DailyFlow?

| Traditional Way | DailyFlow |
|----------------|-----------|
| Manually copy incomplete tasks daily | Auto-migrate, zero omissions |
| Tasks scattered across files | Unified project management |
| Commercial tools lock your data | Markdown files, fully controllable |
| Multi-device sync depends on cloud | GitHub sync, fully open source |

## Features

### 1. Automatic Task Rollover
Incomplete tasks automatically migrate to tomorrow, maintaining work continuity:

- **Smart Migration**: Only `- [ ]` incomplete tasks migrate, completed tasks stay
- **Complete Subtasks**: Indented subtasks, notes, attachments all migrate together
- **Skip Tags**: Tasks with `#no-rollover` won't migrate
- **Scheduled Dates**: `#scheduled:YYYY-MM-DD` controls when tasks appear

### 2. Project Tracking
Long-term projects no longer scatter across daily notes:

- Project cards showing progress and status
- Subtask trees with multi-level nesting
- Daily progress logging
- Attached files and references

### 3. GitHub Sync
Local-first with version history and multi-device sync:

- Automatic commits create readable history
- Manual or auto push to GitHub
- Conflict detection and resolution hints
- Private repository support

### 4. AI Smart Summary
Analyze recent tasks with AI, generate progress summaries:

- Support for DeepSeek, Claude, OpenAI and more
- 7-day / 30-day / all-time ranges
- Automatic completion rate and priority task identification

### 5. Multi AI Provider Support
Flexible configuration for your preferred AI service:

- **DeepSeek** - Cost effective
- **Anthropic Claude** - High quality reasoning
- **OpenAI GPT** - General purpose
- **Custom** - Any OpenAI-compatible API

## Screenshots

| Today View | Projects View | Settings |
|------------|---------------|----------|
| ![Today](./docs/assets/home.png) | ![Projects](./docs/assets/projects.png) | ![Settings](./docs/assets/settings.png) |

| Workspace Setup |
|-----------------|
| ![Workspace](./docs/assets/workspace-setup.png) |

## Quick Start

### Requirements

- Node.js 18+
- npm or yarn
- Git (for version sync)

### Installation

```bash
# Clone the project
git clone https://github.com/frankfika/dailyflow.git
cd dailyflow

# Install dependencies
npm install

# Start development server
npm run dev:all
```

Visit http://localhost:3000

### Configure Workspace

1. Workspace setup will appear on first launch
2. Select your Markdown notes root directory (e.g., `~/Obsidian/daily/`)
3. Set up GitHub sync (optional)
4. Start using!

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Frontend (React)                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ │
│  │ Today    │  │ Projects │  │ Settings │  │ AI     │ │
│  │ View     │  │ View     │  │          │  │ Summary│ │
│  └──────────┘  └──────────┘  └──────────┘  └────────┘ │
└────────────────────────┬────────────────────────────────┘
                         │ REST API
┌────────────────────────┴────────────────────────────────┐
│                    Backend (Express)                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ │
│  │ Config   │  │ Parser   │  │ Rollover │  │ Git    │ │
│  │ Service  │  │ Service  │  │ Service  │  │ Service│ │
│  └──────────┘  └──────────┘  └──────────┘  └────────┘ │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────┴────────────────────────────────┐
│                    Local File System                      │
│  ┌──────────────────────────────────────────────────┐   │
│  │  ~/Obsidian/daily/                               │   │
│  │  ├── 2026-05-01.md                                │   │
│  │  ├── 2026-05-02.md                                │   │
│  │  └── projects/                                    │   │
│  │      └── example.md                               │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19 + TypeScript |
| UI | Tailwind CSS + Lucide Icons |
| Animation | Motion (Framer Motion) |
| Backend | Express.js + TypeScript |
| Markdown | react-markdown + Prism |
| Testing | Vitest + Playwright |

## Changelog

### v0.1 (2026-05-06)
- ✨ GitHub sync functionality
- ✨ Multi AI provider configuration
- ✨ E2E testing infrastructure
- ✨ ContextSwitcher component
- 🐛 Bug fixes and UX improvements

## License

MIT License
