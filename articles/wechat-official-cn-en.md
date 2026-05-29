# 公众号推文 - 中文（有风格）

---

## 标题：我用一年「每天早上手动复制粘贴任务」，然后写了个工具彻底解决这个问题

---

**【开头 - 代入感】**

你有没有过这种经历：

每天早上第一件事，是打开某个 app，然后开始做一件极其无聊的事——把昨天的未完成任务，一个一个复制到今天。

一件、两件、三件……5分钟、10分钟、15分钟。

我做了整整一年。

直到有一天我受不了了，花了一周时间写了个工具，彻底解决这个问题。

这个工具叫 **DailyFlow**。

---

**【痛点共鸣】**

你可能觉得我在夸张——不就是复制粘贴吗？能花多少时间？

但你想过没有：

- 每天 15 分钟，一年就是 90 个小时
- 每次复制粘贴都要核对一遍，生怕漏了哪个
- 如果你用 Notion / Todoist 这类工具，数据还锁在人家服务器上
- 哪天服务停了，或者网络不好，你连自己的任务都看不了

这种「明明很简单但就是很烦」的事，才是真正的时间杀手。

---

**【解决方案】**

DailyFlow 的核心功能只有一个：**自动任务迁移 (Rollover)**。

每天打开 app，昨天没做完的任务自动出现在今天的清单里，标注来源日期。已迁移的任务不会重复出现。

你可以预览要迁移的任务，确认后再执行——完全可控。

不需要手动复制粘贴了。

---

**【Markdown 为数据源 - 为什么重要】**

这是 DailyFlow 和其他 Todo App 最大的区别。

DailyFlow 用 **Markdown 文件** 作为唯一数据源。

你的任务存在本地的 .md 文件里，不是存在某个公司的服务器里。

这意味着：

🔒 **没有云端锁定** — 你的数据永远是你的
✈️ **完全离线可用** — 飞机上、高铁上、信号不好的地方都能用
🔄 **天然版本控制** — 用 Git 备份，想回滚就回滚
📱 **不被某个 App 绑定** — Obsidian、Typora、VS Code 随便打开

---

**【截图展示】**

![主界面 - 每日任务视图](docs/assets/home.png)

![笔记系统](docs/assets/notes.png)

---

**【其他功能】**

**AI Brain Dump** — 脑子里一堆零散想法？一股脑倒进去，AI 自动帮你整理成任务，分类，打标签，设截止日期。支持 DeepSeek、OpenAI、Anthropic 等。

**工作/生活切换** — 一键切换「工作模式」和「生活模式」，任务自动过滤，互不干扰。

**笔记系统** — 普通笔记、会议记录、AI 总结。支持 @提及人员、多维筛选、任务关联。

**Git + IPFS 备份** — Git 一键同步到 GitHub，IPFS 做去中心化永久备份。双重保险。

---

**【技术栈 & 下载】**

技术栈：React 19 + TypeScript + Tailwind CSS 4 + Tauri 2 (Rust) + Express.js

支持 macOS / Windows / Linux

GitHub: github.com/frankfika/dailyflow
Releases: github.com/frankfika/dailyflow/releases

开源免费，欢迎 star ⭐

---

**【结尾互动】**

你每天早上第一件事是什么？有没有什么「明明很简单但就是很烦」的事？

评论区聊聊 👇

---

---

# 公众号推文 - English (With Style)

---

## Title: I Spent One Year "Manually Copy-Pasting Tasks Every Morning" — Then Built a Tool to Fix It Forever

---

**【Opening - Immersion】**

Have you ever had this experience:

Every morning, the first thing you do is open some app, then start doing something incredibly tedious — copying yesterday's unfinished tasks one by one to today's page.

One task, two tasks, three tasks... 5 minutes, 10 minutes, 15 minutes.

I did this for a full year.

Until one day I couldn't take it anymore. Spent a week building a tool to solve this problem permanently.

The tool is called **DailyFlow**.

---

**【Pain Point Resonance】**

You might think I'm exaggerating — it's just copy-paste, how much time can it take?

But have you thought about it:

- 15 minutes every day = 90 hours per year
- Every copy-paste requires checking to make sure you didn't miss anything
- If you're using Notion/Todoist, your data is locked on their servers
- If the service goes down or the network is bad, you can't even see your own tasks

This kind of "it's simple but it's so annoying" thing is the real time killer.

---

**【Solution】**

DailyFlow's core feature is only one: **Automatic Task Rollover**.

Every morning when you open the app, unfinished tasks from yesterday automatically appear in today's view with source date tracking. Already-migrated tasks won't show up again.

You can preview before committing — fully under your control.

No more manual copy-paste.

---

**【Markdown as Data Source - Why It Matters】**

This is the biggest difference between DailyFlow and other Todo apps.

DailyFlow uses **Markdown files** as its single source of truth.

Your tasks are stored in local .md files, not on some company's servers.

This means:

🔒 **No cloud lock-in** — your data is always yours
✈️ **Fully offline** — works on flights, trains, dead zones
🔄 **Native version control** — backup with Git, rollback anytime
📱 **Not locked to any app** — open with Obsidian, Typora, VS Code

---

**【Screenshots】**

![Main Interface - Daily Tasks View](docs/assets/home.png)

![Notes System](docs/assets/notes.png)

---

**【Other Features】**

**AI Brain Dump** — Have a bunch of scattered thoughts? Dump them all in, AI organizes them into tasks with categories, tags, and deadlines. Supports DeepSeek, OpenAI, Anthropic, and more.

**Work/Life Context Switching** — One tap to switch between Work and Life modes. Tasks filter automatically, no interference.

**Notes System** — Regular notes, meeting notes, AI summaries. Supports @mentions, multi-dimensional filtering, task linking.

**Git + IPFS Backup** — Git one-click sync to GitHub, IPFS for decentralized permanent backup. Dual insurance.

---

**【Tech Stack & Download】**

Tech stack: React 19 + TypeScript + Tailwind CSS 4 + Tauri 2 (Rust) + Express.js

Supports macOS / Windows / Linux

GitHub: github.com/frankfika/dailyflow
Releases: github.com/frankfika/dailyflow/releases

Open source, free. Star ⭐ welcome!

---

**【Closing Interaction】**

What's the first thing you do every morning? Is there anything that's "simple but so annoying"?

Let's chat in the comments 👇