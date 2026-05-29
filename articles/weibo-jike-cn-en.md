# 微博/即刻长文 - 中文

---

【我做了个本地优先的每日任务管理工具，彻底告别每天早上手动整理任务】

你们有没有同感——每天早上要花10-15分钟把昨天的未完成任务「复制粘贴」到新页面？

这件事我忍了一年，终于受不了，自己写了个工具。

**DailyFlow** — 本地优先的每日任务管理桌面应用。

---

**它解决了什么问题？**

每天打开 app，昨天没做完的任务自动出现在今天的清单里，标注来源日期。已迁移的任务不会重复出现。

你可以预览要迁移的任务，确认后再执行，完全可控。

---

**为什么用 Markdown 做数据源？**

所有任务和笔记都是 .md 文件，存你本地。
- 没有云端锁定
- 没有服务跑路风险
- 完全离线可用
- Obsidian / Typora / VS Code 随便打开
- 天然支持 Git 版本控制

---

**核心功能：**

1. 自动任务迁移 (Rollover)
2. AI Brain Dump — 把零散想法倒进去，AI自动提取任务、分类、设截止日期
3. 工作/生活上下文切换 — 一键过滤，互不干扰
4. 笔记系统 — 普通笔记、会议记录、AI总结
5. Git + IPFS 备份 — 双重保险

---

技术栈：React 19 + TypeScript + Tailwind CSS 4 + Tauri 2 (Rust) + Express.js

支持 macOS / Windows / Linux

截图：

![主界面](docs/assets/home.png)

---

GitHub: github.com/frankfika/dailyflow
下载: github.com/frankfika/dailyflow/releases

开源免费，欢迎 star ⭐ 和反馈！

---

# 微博/即刻长文 - English

---

【Built a local-first daily task manager. No more manually copying yesterday's tasks every morning.】

Do you spend 10-15 minutes every morning manually copying yesterday's unfinished tasks to a new page?

I did this for a year. Finally built DailyFlow to solve it.

**Local-first daily task management desktop app.**

---

**What problem does it solve?**

Every morning when you open the app, unfinished tasks from yesterday automatically appear in today's view with source date tracking. Already-migrated tasks won't show up again.

Preview before committing. Fully under your control.

---

**Why Markdown as data source?**

All tasks and notes are .md files stored locally.
- No cloud lock-in
- No service shutdown risk
- 100% offline capable
- Open with Obsidian / Typora / VS Code
- Native Git version control

---

**Core Features:**

1. Automatic task rollover
2. AI Brain Dump — dump scattered thoughts, AI extracts tasks with categories and deadlines
3. Work/Life context switching — one tap, filtered views
4. Notes system — regular, meeting, AI summaries
5. Git + IPFS backup — dual insurance

---

Tech stack: React 19 + TypeScript + Tailwind CSS 4 + Tauri 2 (Rust) + Express.js

Supports macOS / Windows / Linux

Screenshots:

![Main Interface](docs/assets/home.png)

---

GitHub: github.com/frankfika/dailyflow
Download: github.com/frankfika/dailyflow/releases

Open source, free. Star ⭐ and feedback welcome!