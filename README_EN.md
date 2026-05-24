<div align="center">

<img src="./docs/assets/logo.svg" width="480" alt="DailyFlow Logo" />

# DailyFlow

> Local-First Daily Task Management · 本地优先的每日任务管理工具

![Main Interface](./docs/assets/home.png)

### Markdown-powered. Auto-migrates unfinished tasks. Stay focused on today.

![Version](https://img.shields.io/badge/Version-0.5.2-blue?style=flat-square)
![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-green?style=flat-square)
![License](https://img.shields.io/badge/License-Apache--2.0-lightgrey?style=flat-square)
![Tech](https://img.shields.io/badge/Stack-React%20%2B%20Tauri%20%2B%20TypeScript-purple?style=flat-square)

[Features](#-features) • [Download](#-download) • [Screenshots](#-screenshots) • [Quick Start](#-quick-start) • [Architecture](#-architecture)

[简体中文](./README.md) | __English__

---
</div>

## Introduction

DailyFlow is a **local-first** daily task management desktop app. It uses Markdown files as its data source and automatically handles cross-day task migration, so you never have to manually carry over yesterday's unfinished items.

### Why DailyFlow?

| Traditional Way | DailyFlow |
|----------------|-----------|
| Manually copy unfinished tasks every morning | Auto-migration on app open |
| Task data locked in a SaaS platform | Local Markdown files, fully portable |
| Requires internet to function | Offline-first, always available |
| Complex project management UI | Minimal design, focused on today |
| Incompatible with Obsidian/other editors | Native Markdown, works everywhere |

## 📦 Download

Grab the installer for your platform from [Releases](https://github.com/frankfika/dailyflow/releases/latest):

| Platform | File |
|----------|------|
| macOS (Apple Silicon) | `DailyFlow_x.x.x_aarch64.dmg` |
| macOS (Intel) | `DailyFlow_x.x.x_x64.dmg` |
| Windows | `DailyFlow_x.x.x_x64-setup.exe` |
| Linux | `DailyFlow_x.x.x_amd64.AppImage` |

> **macOS Users**:
> 
> If you see "DailyFlow is damaged" error, run:
> ```bash
> sudo xattr -rd com.apple.quarantine /Applications/DailyFlow.app
> ```
> See [macOS Fix Guide](docs/MACOS_DAMAGED_FIX.md) for details.

## ✨ Features

### 1. Automatic Task Rollover

Unfinished tasks automatically migrate to today when you open the app, with source date tracking. Already-migrated tasks are never duplicated.

- **Auto-migrate**: Detects and migrates on app launch
- **Manual rollover**: Preview tasks before confirming migration
- **Source tracking**: Each migrated task shows its original date
- **No duplicates**: Tasks marked as migrated (`[>]`) won't appear in the migration list again

### 2. Visual Task Management

Beautiful card-based interface with tasks organized by tags. Data is always stored as Markdown — open it with any editor.

### 3. AI Brain Dump

Dump scattered thoughts in one go. AI extracts tasks, categorizes them, and sets deadlines. Supports DeepSeek, OpenAI, Anthropic, and custom providers. Built-in connection test to verify your API key in one click.

### 4. Work/Life Context Switching

Toggle between Work and Life modes with one click. Tasks filter automatically by context.

### 5. Projects Overview

Aggregate all pending tasks across dates, organized by category and project for a bird's-eye view. Keyword search and tag filters help you zero in on any project.

### 6. Notes System

A dedicated notes feature with three types:
- **Regular Notes**: Capture ideas, thoughts, and memos anytime
- **Meeting Notes**: Participants, time range, audio recording, transcription
- **AI Summaries**: Pick a scope and prompt, AI generates a structured summary saved as a note

Notes features:
- **@Mentions**: Write `@name` in notes for automatic parsing and person-based filtering
- **Multi-dimensional filtering**: By type, @person, project, tag, and date range
- **Task linking**: Notes can link to tasks and projects, bidirectional navigation
- **Timeline integration**: Today's notes appear inline in the Daily View
- **Work/Life context**: Follows context switching automatically
- **AI calls go through backend proxy**: API keys never leak to the browser, no CORS headaches (v0.3.0+)

### 7. Tag Filtering

Filter content by tags directly within Daily Notes and Notes pages:
- **Daily Notes**: Tag pills at the top for quick task filtering
- **Notes page**: Tag pills filter notes, supporting multi-dimensional combined filtering
- **Context-aware**: Follows Work/Life context switching

### 8. Git Sync

One-click commit to GitHub. Automatic backup for all your notes and task data. The top status bar shows sync status and last sync time in real time. Connection auto-verifies on launch and config save — no need to hit "Test Connection" manually.

### 9. In-App Update Checker

Automatically detects the latest version from GitHub Releases, no need to manually visit the repository:
- **Auto-check on startup**: Checks for updates 3 seconds after app launch
- **Top banner notification**: Shows update prompt when a new version is available, one-click to download
- **Manual check**: "Check for Updates" button in Settings for on-demand version checks
- **Smart platform detection**: Automatically recommends the installer for your current OS
- **Download button opens system browser**: Powered by `tauri-plugin-shell`, clicks now reliably open your default browser to the release page (v0.4.9+)
- **Surfaces failure reasons**: Network errors or GitHub API rate-limits now show a clear "Update check failed" message instead of silently reporting "up to date" (v0.4.9+)

## 📸 Screenshots

| Main Interface | Add Task |
|---------------|----------|
| ![Main](./docs/assets/home.png) | ![Add Task](./docs/assets/add-task.png) |

| Projects Overview | Notes List |
|------------------|------------|
| ![Projects](./docs/assets/projects.png) | ![Notes](./docs/assets/notes.png) |

## 🚀 Quick Start

### Option 1: Download from Releases (Recommended)

See the [📦 Download](#-download) section above.

### Option 2: Run from Source

```bash
# Clone the repo
git clone https://github.com/frankfika/dailyflow.git
cd dailyflow

# Install dependencies
npm install

# Start dev servers (frontend + backend)
npm run dev:all  # Start both frontend and backend

# Or launch the Tauri desktop app
npm run tauri dev
```

### First Use

1. On first launch, set your workspace directory (where Markdown files are stored)
2. The app creates today's daily note automatically
3. Start adding tasks with tags for categorization
4. Next day, unfinished tasks auto-migrate to today

## 🏗 Architecture

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

**Core Principles:**
- **Markdown is truth**: All data stored as Markdown files, the single source of truth
- **Local-first**: All operations happen locally, no network required
- **Non-destructive**: All write operations have preview and confirmation
- **Git-friendly**: Every action can generate a meaningful commit

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript + Tailwind CSS 4 |
| Animation | Framer Motion |
| Build | Vite 6 |
| Backend | Express.js (TypeScript) |
| Desktop | Tauri 2 (Rust) |
| AI | DeepSeek / OpenAI / Anthropic (optional) |
| Version Control | Git + GitHub API |

## 📝 Data Format

DailyFlow uses standard Markdown to store tasks:

```markdown
## Tasks

- [ ] Finish project report #work #deadline:2026-05-15
- [x] Reply to client email #work
- [>] Organize meeting notes #work (migrated to 2026-05-12)
```

**Notes format (Markdown + YAML frontmatter):**

```markdown
---
type: meeting_note
date: 2026-05-17
time: "14:00"
end_time: "15:00"
context: work
tags: [investment, strategy]
mentions: [alice, bob]
participants: [Alice Chen, Bob Wang]
---

# Investment Discussion Meeting

## Key Points

1. Board meeting postponed to early June
2. Need to supplement profit forecast materials

## Action Items

- [ ] Complete profit forecast @alice
- [ ] Send supplementary materials to @bob
```

**Task Status:**
- `- [ ]` Todo
- `- [x]` Done
- `- [>]` Migrated

**Supported Tags:**
- `#tag` — Category tag
- `#deadline:YYYY-MM-DD` — Due date
- `#priority:high|medium|low` — Priority level
- `#project:name` — Project association

## 📄 License

[Apache License 2.0](./LICENSE)
