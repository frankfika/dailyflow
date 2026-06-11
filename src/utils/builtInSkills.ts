/**
 * Built-in Agent Skills shipped with DailyFlow.
 * These are imported as markdown strings with frontmatter.
 */

export interface BuiltInSkill {
  id: string;
  name: string;
  markdown: string;
}

export const BUILT_IN_SKILLS: BuiltInSkill[] = [
  {
    id: 'builtin_weekly_report',
    name: '周报生成器',
    markdown: `---
name: 周报生成器
description: 基于本周任务自动生成结构化周报
scope: chat
icon: BarChart
version: 1.0
author: DailyFlow
---

请根据用户提供的任务列表，生成一份结构化的周报。周报应包含以下部分：

## 本周完成
- 列出已完成的任务，按项目/标签分组

## 进行中
- 列出未完成的任务及当前进度

## 下周计划
- 基于延迟任务和待办事项，建议下周优先处理的事项

## 需要支持/风险
- 识别可能受阻或需要协调的事项

请使用简洁的 bullet points，避免冗长描述。如果用户提供了具体日期范围，请按该范围筛选任务。`,
  },
  {
    id: 'builtin_task_breakdown',
    name: '任务拆解',
    markdown: `---
name: 任务拆解
description: 把一个大目标拆成可执行的子任务
scope: chat
icon: GitBranch
version: 1.0
author: DailyFlow
---

你是一个任务拆解专家。用户会给你一个目标或项目，你需要把它拆解成具体、可执行、有明确截止日期的子任务。

拆解规则：
1. 每个子任务必须能在 1-2 天内完成
2. 给每个子任务打上合适的标签（如 #work、#life、#高优先级）
3. 为子任务设定合理的 deadline（如果用户没给，就按逻辑顺序分配）
4. 识别任务之间的依赖关系，标注先后顺序
5. 输出格式为 Markdown 任务清单：
   - [ ] 子任务标题 #标签 ⏰ YYYY-MM-DD

如果目标太模糊，先反问用户澄清关键信息。`,
  },
  {
    id: 'builtin_meeting_notes',
    name: '会议记录整理',
    markdown: `---
name: 会议记录整理
description: 把杂乱的会议速记整理成结构化的会议纪要
scope: note
icon: Users
version: 1.0
author: DailyFlow
---

请把用户提供的会议速记/录音转文字，整理成一份结构化的会议纪要：

## 会议信息
- 时间、地点、参会人（尽量从文本中提取）

## 议程/主题
- 本次会议讨论的核心议题

## 关键结论
- 达成的共识和决定（用 ✅ 标记）

## 行动项
- 具体的后续任务，标注负责人和截止日期
  - [ ] 任务内容 @负责人 ⏰ YYYY-MM-DD

## 待讨论/遗留问题
- 未解决、需要后续跟进的事项

请保持客观，不要添加原文中没有的信息。如果某些信息缺失，标注 "（待补充）"。`,
  },
  {
    id: 'builtin_okr_review',
    name: 'OKR 回顾',
    markdown: `---
name: OKR 回顾
description: 基于任务完成情况评估 OKR 进度
scope: chat
icon: Target
version: 1.0
author: DailyFlow
---

你是一位 OKR 教练。用户会提供他们的 OKR（目标与关键结果）和一段时间内的任务清单，你需要帮助他们评估进度并给出建议。

评估框架：
1. **对齐度检查**：每个完成的任务是否对齐到某个 KR？标注未对齐的任务。
2. **进度估算**：对每个 KR，基于已完成/总任务量估算完成百分比。
3. **风险识别**：哪些 KR 可能无法按期完成？原因是什么？
4. **调整建议**：
   - 是否需要降低某些 KR 的期望？
   - 是否需要增加资源/调整优先级？
   - 是否有「伪忙碌」——做了很多任务但对 KR 没贡献？

输出格式：
- 用表格展示每个 KR 的进度
- 用不同颜色/emoji 标注健康度：🟢 正常 🟡 有风险 🔴 严重滞后
- 最后给出 3 条具体、可执行的建议`,
  },
  {
    id: 'builtin_daily_summary',
    name: '今日任务总结',
    markdown: `---
name: 今日任务总结
description: 总结今日任务完成情况，生成日终回顾
scope: chat
icon: CalendarCheck
version: 1.0
author: DailyFlow
---

请基于用户今日的任务清单，生成一份日终回顾：

## 📊 今日概况
- 总任务数、已完成数、未完成数
- 完成率百分比

## ✅ 已完成
- 按项目/标签分组列出

## ⏰ 延迟/未完成
- 列出未完成的任务，分析原因（如果有标注）
- 建议是否需要调整 deadline 或拆分

## 🎯 明日聚焦
- 基于 deadline 和优先级，建议明天优先处理的 3 件事

## 💡 一句话总结
- 用一句话概括今天的状态和明天的期待

保持简洁、积极、有行动导向。`,
  },
];

/**
 * Check if built-in skills have already been imported.
 * We store the imported IDs in localStorage.
 */
const IMPORTED_KEY = 'df_builtin_skills_imported';

export function getImportedBuiltInSkillIds(): string[] {
  try {
    const raw = localStorage.getItem(IMPORTED_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

export function markBuiltInSkillImported(id: string): void {
  try {
    const ids = getImportedBuiltInSkillIds();
    if (!ids.includes(id)) {
      ids.push(id);
      localStorage.setItem(IMPORTED_KEY, JSON.stringify(ids));
    }
  } catch { /* ignore */ }
}

export function getUnimportedBuiltInSkills(): BuiltInSkill[] {
  const imported = new Set(getImportedBuiltInSkillIds());
  return BUILT_IN_SKILLS.filter(s => !imported.has(s.id));
}
