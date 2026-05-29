# Reddit (r/programming, r/productivity, r/selfhosted)

---

**Title:**

I built a local-first daily task manager that auto-migrates unfinished tasks using Markdown files

**Body:**

Hey folks,

I've been working on a personal tool to solve a daily pain point: every morning I had to manually copy yesterday's unfinished tasks to today's page.

Meet **DailyFlow** — a local-first daily task management desktop app.

**Key features:**

- **Automatic task rollover**: Unfinished tasks automatically migrate to today with source date tracking
- **Markdown-native**: All data stored as Markdown files. No cloud lock-in, works offline, git-versioned
- **AI Brain Dump**: Dump scattered thoughts, AI extracts tasks with categories and deadlines
- **Work/Life context switching**: One click to filter by context
- **Notes system**: Regular notes, meeting notes with @mentions, AI summaries
- **Git + IPFS backup**: Commit to GitHub or upload to IPFS for decentralized backup

Built with: React 19, TypeScript, Tailwind CSS 4, Tauri 2 (Rust), Express.js

Available on macOS, Windows, Linux.

GitHub: https://github.com/frankfika/dailyflow
Releases: https://github.com/frankfika/dailyflow/releases

Would love feedback from the productivity tool community!

---

**Comment (to include):**

The automatic rollover alone has saved me 10-15 minutes every morning. All data is plain Markdown files, so you're not locked into any specific app.

Happy to answer questions!