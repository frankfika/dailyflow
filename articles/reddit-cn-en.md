# Reddit Post - 中文

---

**标题：** 我做了一个本地优先的每日任务管理工具，用 Markdown 做数据源，自动迁移跨日任务

**正文：**

各位好，

我之前每天早上要花10-15分钟把昨天的未完成任务手动复制到新页面。这种重复性劳动忍了一年，终于受不了，自己写了个工具。

**DailyFlow** — 本地优先的每日任务管理桌面应用。

**核心功能：**

• **自动任务迁移 (Rollover)** — 每天打开 app，未完成的任务自动迁移到今天，标注来源日期，已迁移的不会重复出现
• **Markdown 文件为数据源** — 所有数据是 .md 文件，完全离线，Obsidian/VS Code 随便打开
• **AI Brain Dump** — 把零散想法倒进去，AI 自动提取任务、分类、设截止日期
• **工作/生活上下文切换** — 一键过滤
• **笔记系统** — 普通笔记、会议记录、AI 总结
• **Git + IPFS 备份** — 双重保险

技术栈：React 19 + TypeScript + Tailwind CSS 4 + Tauri 2 (Rust) + Express.js

支持 macOS / Windows / Linux

截图👇

![主界面](docs/assets/home.png)

GitHub: github.com/frankfika/dailyflow
Releases: github.com/frankfika/dailyflow/releases

欢迎反馈！

---

**评论区备用回复：**

自动任务迁移功能每天帮我节省15分钟。所有数据是纯 Markdown 文件，不会被某个 app 绑定。有什么问题尽管问！

---

# Reddit Post - English

---

**Title:** I built a local-first daily task manager using Markdown files with automatic cross-day task rollover

**Body:**

Hey folks,

I used to spend 10-15 minutes every morning manually copying yesterday's unfinished tasks to today's page. Did this for a year. Finally built a tool to solve it.

**DailyFlow** — Local-first daily task management desktop app.

**Key features:**

• **Automatic task rollover** — Every morning, unfinished tasks auto-migrate to today's view with source date tracking. Already-migrated tasks won't show again.
• **Markdown-native** — All data as .md files, fully offline, open with Obsidian/VS Code
• **AI Brain Dump** — Dump scattered thoughts, AI extracts tasks with categories and deadlines
• **Work/Life context switching** — One tap filtered views
• **Notes system** — Regular notes, meeting notes, AI summaries
• **Git + IPFS backup** — Dual insurance

Tech stack: React 19, TypeScript, Tailwind CSS 4, Tauri 2 (Rust), Express.js

Supports macOS, Windows, Linux.

Screenshots👇

![Main Interface](docs/assets/home.png)

GitHub: github.com/frankfika/dailyflow
Releases: github.com/frankfika/dailyflow/releases

Feedback welcome!

---

**Comment backup:**

The automatic rollover alone saves me 15 minutes every morning. All data is plain Markdown files — you're not locked into any specific app. Ask me anything!