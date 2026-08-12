/**
 * Built-in mind map templates.
 *
 * Each template is a complete `MindMap` shape (sans `id`/timestamps) that
 * a user can fork into a new map. Templates should be opinionated enough
 * to be useful, but small enough that the user can see the structure
 * without feeling like they're editing someone else's project.
 *
 * Node ids and edge ids are deterministic (`tpl-...`) so the layout
 * algorithm can lay them out cleanly the moment the map is created.
 */
import type { MindMap, MindMapEdge, MindMapNode } from '../../api/client';

interface Template {
  id: string;
  /** Localized label shown in the picker. */
  title: string;
  titleEn: string;
  /** Subtitle shown under the title in the picker card. */
  hint: string;
  hintEn: string;
  /** Build the actual map shape for a new fork. */
  build: (language?: 'zh' | 'en') => Omit<MindMap, 'id' | 'createdAt' | 'updatedAt' | 'version'>;
}

function buildSimpleTree(
  title: string,
  rootText: string,
  branches: Array<{ text: string; children?: string[] }>,
): Omit<MindMap, 'id' | 'createdAt' | 'updatedAt' | 'version'> {
  const rootId = 'tpl-root';
  const nodes: MindMapNode[] = [{ id: rootId, text: rootText, position: { x: 0, y: 0 } }];
  const edges: MindMapEdge[] = [];
  for (let i = 0; i < branches.length; i++) {
    const b = branches[i];
    const bid = `tpl-b${i}`;
    nodes.push({ id: bid, text: b.text, position: { x: 0, y: 0 } });
    edges.push({ id: `tpl-e${i}`, source: rootId, target: bid });
    if (b.children) {
      for (let j = 0; j < b.children.length; j++) {
        const cid = `tpl-b${i}c${j}`;
        nodes.push({ id: cid, text: b.children[j], position: { x: 0, y: 0 } });
        edges.push({ id: `tpl-e${i}c${j}`, source: bid, target: cid });
      }
    }
  }
  return { title, rootId, nodes, edges };
}

export const MINDMAP_TEMPLATES: readonly Template[] = [
  {
    id: 'swot',
    title: 'SWOT 分析',
    titleEn: 'SWOT Analysis',
    hint: '优势 / 劣势 / 机会 / 威胁',
    hintEn: 'Strengths / Weaknesses / Opportunities / Threats',
    build: (language = 'zh') => language === 'zh' ? buildSimpleTree('SWOT 分析', '当前主题', [
      { text: 'S — 优势', children: ['核心能力', '资源优势', '团队优势'] },
      { text: 'W — 劣势', children: ['资源缺口', '能力短板', '流程瓶颈'] },
      { text: 'O — 机会', children: ['市场窗口', '政策红利', '技术趋势'] },
      { text: 'T — 威胁', children: ['竞争对手', '市场收缩', '技术替代'] },
    ]) : buildSimpleTree('SWOT Analysis', 'Current topic', [
      { text: 'S — Strengths', children: ['Core capabilities', 'Resource advantages', 'Team strengths'] },
      { text: 'W — Weaknesses', children: ['Resource gaps', 'Capability gaps', 'Process bottlenecks'] },
      { text: 'O — Opportunities', children: ['Market window', 'Policy tailwinds', 'Technology trends'] },
      { text: 'T — Threats', children: ['Competitors', 'Market contraction', 'Technology substitution'] },
    ]),
  },
  {
    id: '5w1h',
    title: '5W1H 分析',
    titleEn: '5W1H Analysis',
    hint: 'What / Why / Who / When / Where / How',
    hintEn: 'What / Why / Who / When / Where / How',
    build: (language = 'zh') => language === 'zh' ? buildSimpleTree('5W1H 分析', '要分析的问题', [
      { text: 'What — 是什么', children: ['定义', '范围', '关键指标'] },
      { text: 'Why — 为什么', children: ['根本原因', '业务动机', '影响范围'] },
      { text: 'Who — 谁', children: ['决策者', '执行者', '受影响方'] },
      { text: 'When — 何时', children: ['时间窗口', '里程碑', '截止日期'] },
      { text: 'Where — 何地', children: ['地域范围', '渠道', '触点'] },
      { text: 'How — 如何', children: ['方法路径', '所需资源', '风险点'] },
    ]) : buildSimpleTree('5W1H Analysis', 'Question to analyze', [
      { text: 'What', children: ['Definition', 'Scope', 'Key metrics'] },
      { text: 'Why', children: ['Root cause', 'Business motivation', 'Impact'] },
      { text: 'Who', children: ['Decision makers', 'Owners', 'Stakeholders'] },
      { text: 'When', children: ['Time window', 'Milestones', 'Deadline'] },
      { text: 'Where', children: ['Regions', 'Channels', 'Touchpoints'] },
      { text: 'How', children: ['Approach', 'Resources', 'Risks'] },
    ]),
  },
  {
    id: 'decision-tree',
    title: '决策树',
    titleEn: 'Decision Tree',
    hint: '目标 → 选项 → 评估 → 结论',
    hintEn: 'Goal → Options → Evaluation → Decision',
    build: (language = 'zh') => language === 'zh' ? buildSimpleTree('决策树', '要做的决策', [
      { text: '方案 A', children: ['优势', '劣势', '成本', '风险'] },
      { text: '方案 B', children: ['优势', '劣势', '成本', '风险'] },
      { text: '方案 C', children: ['优势', '劣势', '成本', '风险'] },
    ]) : buildSimpleTree('Decision Tree', 'Decision to make', [
      { text: 'Option A', children: ['Pros', 'Cons', 'Cost', 'Risks'] },
      { text: 'Option B', children: ['Pros', 'Cons', 'Cost', 'Risks'] },
      { text: 'Option C', children: ['Pros', 'Cons', 'Cost', 'Risks'] },
    ]),
  },
  {
    id: 'task-breakdown',
    title: '任务分解',
    titleEn: 'Task Breakdown',
    hint: '目标 → 阶段 → 任务',
    hintEn: 'Goal → Phases → Tasks',
    build: (language = 'zh') => language === 'zh' ? buildSimpleTree('任务分解', '要完成的目标', [
      { text: '阶段 1 — 调研', children: ['收集资料', '用户访谈', '竞品分析'] },
      { text: '阶段 2 — 规划', children: ['方案设计', '资源排期', '风险评估'] },
      { text: '阶段 3 — 执行', children: ['核心开发', '测试验证', '上线发布'] },
      { text: '阶段 4 — 复盘', children: ['数据回顾', '总结文档', '下期规划'] },
    ]) : buildSimpleTree('Task Breakdown', 'Goal to complete', [
      { text: 'Phase 1 — Research', children: ['Collect inputs', 'User interviews', 'Competitor analysis'] },
      { text: 'Phase 2 — Plan', children: ['Design approach', 'Schedule resources', 'Assess risks'] },
      { text: 'Phase 3 — Execute', children: ['Core implementation', 'Test and verify', 'Launch'] },
      { text: 'Phase 4 — Review', children: ['Review data', 'Document learnings', 'Plan next cycle'] },
    ]),
  },
];

export function getTemplate(id: string): Template | undefined {
  return MINDMAP_TEMPLATES.find((t) => t.id === id);
}
