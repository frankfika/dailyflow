# DailyFlow UX 重设计稿 v1

> **目标**：让 app 的结构匹配名字 — 「Daily Flow，每日的流动」。
> **核心原则**：今天是引力中心；Notes 是沉淀；AI 是从「流水账」到「沉淀」的桥梁。

---

## 1. 问题诊断（你看到的现象 → 真实根因）

| 你看到的现象 | 真实根因 |
|---|---|
| 4 个 tab 平铺，每次打开都得"选房间" | IA 没有引力中心，导航是肌肉而不是骨架 |
| Quick Note 按钮迷惑：写了之后在 daily 里找不到 | Daily 视图里的"快速笔记"实际写到 `Notes/` 目录，UI 入口和数据归属错配 |
| AI Summary 报错、行为奇怪 | 前端直接 `fetch(deepseek/anthropic)`，浏览器跨域+暴露 key；且数据范围只看 `Notes/`，不看 daily 任务 |
| Notes 里的 AI Summary 看起来"不太对" | Prompt 模板是写死的"summary"，没明确告诉用户能拿来做什么；总结后的笔记和原始 daily 没有反向链接 |
| Tasks 视图和 Notes 视图筛 work/life 结果不一致 | 两边过滤规则不一样：tasks 看 `#work` tag 或无 work/life tag；notes 看 frontmatter 的 `context` |
| 整体感觉 confuse | 数据模型有 4 类（daily tasks / daily 自由文本 / notes / projects），但视图用 3 个 tab 切片，关系没对齐 |

---

## 2. 心智模型重定义

```
                     ┌────────────────┐
                     │     TODAY      │  ← 引力中心：默认视图
                     │  (流水账层)    │
                     └────────┬───────┘
                              │
            ┌─────────────────┼─────────────────┐
            ▼                 ▼                 ▼
        Timeline          Projects            Notes
       (历史 Today)    (跨多天的事)        (沉淀的知识)
```

- **Today**：今天发生的所有事（任务+随手记）。这是默认页，打开 app 就在这里。
- **Timeline**：往前翻就是过去的 Today。它不是新视图，是 Today 的"时间维度"。
- **Projects**：把和某个项目相关的 task / note 聚合起来。它是横切的视图。
- **Notes**：长期沉淀。AI 总结、会议纪要、读书笔记 — **不属于某一天**的东西。

**关键判断**：用户每天打开 app 的 90% 时间都在 Today。Projects 和 Notes 是低频但重要。

---

## 3. 数据模型（现状梳理 + 调整）

### 现状（保留）
```
workspace/
├── Daily/{年}/{月}/{日}.md       # 行内 checkbox tasks（核心）
│                                  # 任务用 - [ ]，可带 #priority/#project/#tags
├── Notes/{年}/{月}/*.md           # 带 frontmatter 的独立笔记
│                                  # type: note | meeting_note | summary
├── Notes/.prompts/*.md            # AI 提示词模板
└── Projects/*.md                  # 项目元数据
```

### 关键调整：Daily 文件增加「自由记录区」
现在 daily 文件里只有 tasks，没有自然的"写点什么"的位置。新增一个固定段落：

```markdown
# 2026-05-18 Mon

## Tasks
- [ ] 修 release 显示 bug #priority:high
- [x] 看 PR #42

## Log                              ← 新增。用户写"刚刚和 X 聊了..."、随手想法
12:30 PR review 完了，schema 改动比较大，得告知前端
14:00 灵感：Notes 应该有反向链接到 daily

## Notes (refs)                     ← 新增。今天创建的 Note 自动反链
- [[Notes/2026/05/2026-05-18-meeting-with-X]]
```

> Log 段落是 **freeform timestamped log**：随手敲一行、加时间戳、不需要 frontmatter。它替代现在那个误导性的 "Quick Note" 按钮。

---

## 4. 信息架构（新）

### 顶部导航
```
┌─────────────────────────────────────────────────────────────┐
│ DailyFlow              [⌘K 捕获]   ⊙ Work ▾    ⚙ 设置      │
├─────────────────────────────────────────────────────────────┤
│  ◉ Today    Timeline    Projects    Notes                   │
└─────────────────────────────────────────────────────────────┘
```

- **Today**：默认。点了就回到今天（不论现在停在哪个日期）。
- **Timeline**：日期翻页。左侧 sidebar 还是日期列表，但作为 Today 的"时间轴"理解。
- **Projects**：项目聚合视图。
- **Notes**：长期沉淀视图。
- **⌘K 捕获**：全局快捷键，从任何视图都能呼出。
- **Work/Life 切换**：全局，所有视图共用一套规则（见 §6）。

### 移除 / 降级
- ❌ **Prompts** 不再是顶级 tab。移到「设置 → AI → Prompt 模板」。
- ❌ Daily 视图右上角的 **+ Quick Note** 按钮去掉。改用 ⌘K 或直接在 Log 段落写。
- ⚠️ Notes 里的 AI Summary 面板**保留但重做**（见 §5）。

---

## 5. AI 的位置（你说的重点）

> 用户原话："AI应该是按现在的，帮助写 note。比如帮助写 summary，比如写 1 周内的 daily note 的 summary。"

把 AI 定位成 **"从流水账提炼成笔记"的助手**。它出现在 3 个地方：

### 5.1 Today 视图右下角：✨ 总结今天
- **数据源**：今天的 daily.md（tasks + Log 段落 + 关联 notes）
- **动作**：调 AI → 生成「今日总结」 → 保存为 `Notes/{date}-summary.md`（type: summary）
- **保存的 note 自动反链回 daily**（写入 daily 的 "Notes (refs)" 段落）

### 5.2 Notes 视图：AI 总结生成器（保留，重做）
现在面板的逻辑没问题（选时间范围 + 选 prompt + 生成），但要修：

| 现有问题 | 修复 |
|---|---|
| 数据源**只**是 `Notes/`，看不到 daily tasks | 改成「Daily + Notes 都读」，让 AI 看到完整上下文 |
| 前端直接 fetch LLM API | 改走后端 `POST /api/ai/summarize` 代理 |
| 时间范围只有 7/30/all 三档 | 加「自定义日期范围」+「按 project」|
| 生成的 summary 保存后没反链 | 保存时把 summary note 反链到覆盖的所有 daily 文件 |

### 5.3 ⌘K 捕获面板里："让 AI 整理这段话"
用户写完一段流水账，点击「✨ 整理」，AI 抽取 tasks / mentions / 标签，建议结构化保存。

> **关键**：AI 只生成内容，**保存**永远走 Notes 模块（type: summary | note），保留人工 review/edit 的机会。

---

## 6. Work / Life Context 统一规则

现在 tasks 和 notes 的 work 过滤逻辑不一样，必须统一。

**新规则（单一规则，前后端都用）**：
- Task 显示在 `work` 视图，当且仅当：tag 含 `work` **或** tag 既不含 `work` 也不含 `life`（默认归 work）
- Note 显示在 `work` 视图，当且仅当：frontmatter `context: work`
- Daily 文件本身没有 context（它是容器），里面的 tasks 各自归类

**实现位置**：`server/services/contextFilter.ts`（新文件，统一导出过滤函数）。

---

## 7. 关键交互流程（Wireframe）

### 7.1 Today 视图（默认页）

```
┌─────────────────────────────────────────────────────────────┐
│ DailyFlow                  [⌘K]  ⊙ Work ▾   ⚙              │
├─────────────────────────────────────────────────────────────┤
│  ◉ Today    Timeline    Projects    Notes                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Monday, May 18 2026                          [✨ 总结今天] │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  TASKS                                                      │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ☑ 修 release 显示 bug    #dailyflow #high          │   │
│  │ ☐ 看 PR #42              #work                      │   │
│  │ ☐ 写 weekly report       #work                      │   │
│  │   └ 注意 schema 改了                                │   │
│  │ + 添加任务...                                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  LOG                                                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 12:30  PR review 完了，schema 改动比较大            │   │
│  │ 14:00  灵感：Notes 应该有反向链接                   │   │
│  │ + 写一行...                              [⌘+Enter] │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  📚 NOTES (today)                                           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 📝 Meeting with X · 14:00                           │   │
│  │    @张三 @李四 · 30min · #planning                  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**变化点**：
1. Header 没有"+ Quick Note"按钮了（取消那个误导入口）
2. 多了 Log 段落，inline 时间戳
3. 多了"今日 Notes" 卡片，是反向链接（不是新数据源）
4. 右上角 [✨ 总结今天]，唯一的 AI 入口

### 7.2 ⌘K 捕获面板（全局）

```
┌─────────────────────────────────────────────────────┐
│ ⌘K  写点什么...                                     │
├─────────────────────────────────────────────────────┤
│                                                     │
│  下午和张三同步了一下 dailyflow 的进度，他建议把    │
│  AI 总结的入口收敛到 Today，我觉得有道理。下周一   │
│  开始重构。                                         │
│                                                     │
├─────────────────────────────────────────────────────┤
│ 保存为 →  ◉ Today Log   ○ Note   ○ Task            │
│ Context →  ◉ Work       ○ Life                     │
│                          [✨ 让 AI 整理]   [保存]   │
└─────────────────────────────────────────────────────┘
```

- 默认保存到「今天的 Log」（写入 daily.md 的 Log 段落）
- 选 Note → 进 NoteEditor
- 选 Task → 转成一行 `- [ ] xxx` 加到今天 tasks
- ✨ 整理：AI 自动判断要不要拆成 task / note / log，给出 preview 让用户确认

### 7.3 Notes 视图（保留 + 重做 AI 面板）

```
┌─────────────────────────────────────────────────────────────┐
│ ◉ Today    Timeline    Projects    Notes                    │
├─────────────────────────────────────────────────────────────┤
│  Notes                                          [+ 新建]    │
│  🔍 搜索...                                                  │
│  [全部] [笔记] [会议] [总结]    @人员 ▾                      │
│                                                             │
│  ┌────────────────────────────────────────────────────┐    │
│  │ ✨ AI 助手  ▾                                      │    │
│  │  数据源: ☑ Daily Tasks  ☑ Notes  ☐ 仅当前筛选     │    │
│  │  时间范围: [最近7天 ▾] 或 [自定义]                 │    │
│  │  Prompt:  [周报 ▾]  [复盘] [灵感整理] ...          │    │
│  │  关联 Project: [无 ▾]                              │    │
│  │  [✨ 生成总结]                                     │    │
│  └────────────────────────────────────────────────────┘    │
│                                                             │
│  2026-05-18                                                 │
│  ▸ Meeting with X                  📝 14:00                 │
│  ▸ 周报 - 2026-W20                  ✨ AI 生成              │
│                                                             │
│  2026-05-17                                                 │
│  ▸ 读书笔记：Designing Data-Intensive Apps                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**变化点**：
- AI 面板**默认收起**（避免占太多视觉空间）
- 数据源 checkbox：明确告诉用户"AI 看到的是 Daily + Notes"，不再黑盒
- 自定义时间范围
- 关联 Project：让 AI 只总结某个项目的内容
- 移除：直接 fetch LLM API → 改走后端

---

## 8. 后端改动清单

| 模块 | 现状 | 调整 |
|---|---|---|
| `server/routes/ai.ts` | **不存在** | **新建**。提供 `POST /api/ai/summarize` 代理 LLM 请求 |
| `server/services/parser.ts` | 只解析 tasks | 加 Log 段落解析（提取时间戳行），加 Notes refs 段落维护 |
| `server/services/notes.ts` | OK | 加 `linkBackToDaily(noteFilePath, dateRange)` 工具 |
| `server/services/contextFilter.ts` | **不存在** | **新建**。统一 work/life 过滤规则 |
| `server/routes/notes.ts` | OK | `getAll` 接受 `includeDaily=true` 参数，返回时合并 daily 内容 |

---

## 9. 前端改动清单

| 文件 | 改动 |
|---|---|
| `src/App.tsx` | 顶导航重构（Today/Timeline/Projects/Notes 4 项），去掉 Quick Note 按钮，加 ⌘K 全局快捷键 |
| `src/components/CommandK.tsx` | **新建**。⌘K 捕获面板 |
| `src/components/TodaySummary.tsx` | **新建**。Today 视图右上的「✨ 总结今天」按钮+面板 |
| `src/components/DailyLog.tsx` | **新建**。Daily 视图的 Log 段落（时间戳行） |
| `src/components/Notes.tsx` | AI 面板重做：数据源 checkbox + 自定义日期 + project 关联 + 改走 `/api/ai/summarize` |
| `src/components/AIAssistant.tsx` | **新建**。共享 AI 调用 hook（`useAISummarize`） |
| 删除 | `Notes.tsx` 里直接调 LLM API 的代码 |

---

## 10. 实施分期（建议 3 期，渐进发布）

### Phase 1 — 修地基（1-2 天，必做，先发 v0.3.0）
1. ✅ 后端 `/api/ai/summarize` 代理（修 key 暴露 + CORS）
2. ✅ Notes 视图改走代理（不改 UI，先把 bug 修了）
3. ✅ 统一 work/life 过滤规则
4. ✅ 移除 Daily 视图的 "+ Quick Note" 按钮（暂时改成跳到 Notes 新建）
5. ✅ Prompts 移到设置页

> Phase 1 不动 IA，只修 bug。用户立即感觉"不 confuse 了"。

### Phase 2 — 重构 IA（3-5 天，发 v0.4.0）
1. 顶导航 Today/Timeline/Projects/Notes
2. Today 视图：加 Log 段落 + Notes refs 反链
3. Today 视图：加「✨ 总结今天」入口
4. ⌘K 捕获面板

### Phase 3 — AI 增强（按需迭代，v0.5.0+）
1. AI 面板加自定义日期范围 / project 维度
2. ⌘K 的「让 AI 整理」自动分流（task/note/log）
3. AI 总结自动反链回所有覆盖的 daily

---

## 11. 取舍与风险

| 取舍 | 选择 | 理由 |
|---|---|---|
| Notes tab 是否保留？| **保留**（已确认） | 长期沉淀的位置不能消失，只是入口要改 |
| Daily 加 Log 段落，是否破坏现有 markdown？ | **向后兼容** | 没有 Log 段落的旧文件正常显示，新创建的才有 |
| ⌘K 是否一定要做？ | Phase 2 才做 | 改 IA 之前先把 bug 修了，不堆功能 |
| AI 是否要做 streaming？ | Phase 3 再说 | 现在 summary 短，一次性返回够用 |
| Tauri menu 集成？ | **暂不** | 桌面级菜单（File/Edit）和当前任务无关 |

**风险**：
- Phase 2 改 IA 是 breaking change，需要给老用户一个迁移说明（或在第一次升级时弹引导）
- AI 代理后端要存 API key 还是每次让前端传？建议**前端传**（key 还是在前端 settings，但只在请求时发到本地 server，不会暴露到第三方）

---

## 12. 待你确认的关键决策

1. **Log 段落** 这个新概念你接受吗？（替代 Quick Note 误导性入口）
2. **Phase 1 立即开干** 还是想再调整设计稿？
3. **顶导航 4 项**（Today/Timeline/Projects/Notes）vs **3 项**（合并 Today+Timeline 为一个，用日期翻页表达）— 你更喜欢哪个？

---

文档版本：v1（2026-05-18）
作者：Claude + Frank 讨论稿
