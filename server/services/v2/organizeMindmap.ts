/**
 * AI organize mindmap nodes (Sprint 1 Gap 2).
 *
 * Three deterministic fallback strategies (no LLM call):
 *   - by_topic:   group by `kind` (task / question / resource / risk / branch / tag)
 *   - by_priority: group by `status` (in-progress / todo / done)
 *   - by_time:    group by `tags` containing date-like strings
 *
 * Output is an OrganizeSuggestion: a set of proposed parent nodes +
 * which existing nodes belong under each + suggested edges between
 * the proposed parents. The caller (UI) shows this as a "proposal
 * card" the user must accept before anything is written back.
 */
import { z } from 'zod';
import type { V2Repository } from '../../repositories/v2/repository.js';

export const OrganizeStrategySchema = z.enum(['by_topic', 'by_priority', 'by_time']);
export type OrganizeStrategy = z.infer<typeof OrganizeStrategySchema>;

export interface OrganizeNode {
  id: string;
  text: string;
  kind?: 'root' | 'branch' | 'tag' | 'task' | 'question' | 'resource' | 'risk';
  status?: 'todo' | 'in-progress' | 'done';
  tags?: string[];
}

export interface OrganizeEdge {
  id: string;
  source: string;
  target: string;
}

export interface OrganizeInput {
  mindmapId: string;
  strategy: OrganizeStrategy;
  nodes: OrganizeNode[];
  edges: OrganizeEdge[];
}

export interface OrganizeGroup {
  parentText: string;
  parentKind: 'branch' | 'question' | 'resource' | 'risk' | 'tag';
  nodeIds: string[];
}

export interface OrganizeSuggestion {
  groups: OrganizeGroup[];
  suggestedEdges: Array<{ source: string; target: string }>;
  rationale: string;
}

const DATE_TAG_RE = /\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/;

const STRATEGY_LABELS: Record<OrganizeStrategy, { zh: string; en: string }> = {
  by_topic: { zh: '按主题分类', en: 'Group by topic' },
  by_priority: { zh: '按执行状态分类', en: 'Group by execution status' },
  by_time: { zh: '按时间标签分类', en: 'Group by time tag' },
};

const TOPIC_GROUP_LABELS: Record<string, { zh: string; en: string }> = {
  task: { zh: '任务', en: 'Tasks' },
  question: { zh: '疑问', en: 'Questions' },
  resource: { zh: '资料', en: 'Resources' },
  risk: { zh: '风险', en: 'Risks' },
  tag: { zh: '标签', en: 'Tags' },
  branch: { zh: '其他想法', en: 'Other thoughts' },
};

const PRIORITY_GROUP_LABELS: Record<string, { zh: string; en: string }> = {
  'in-progress': { zh: '进行中', en: 'In progress' },
  todo: { zh: '待开始', en: 'To start' },
  done: { zh: '已完成', en: 'Done' },
};

/**
 * Pure: same input => same output. Does not touch the repo.
 */
export function organizeMindmap(
  _repo: V2Repository,
  input: OrganizeInput,
): OrganizeSuggestion {
  const rootNodes = input.nodes.filter((n) => n.kind === 'root');
  const candidates = input.nodes.filter((n) => n.kind !== 'root');

  let groups: OrganizeGroup[];
  let rationale: string;
  switch (input.strategy) {
    case 'by_topic':
      ({ groups, rationale } = groupByTopic(candidates));
      break;
    case 'by_priority':
      ({ groups, rationale } = groupByPriority(candidates));
      break;
    case 'by_time':
      ({ groups, rationale } = groupByTime(candidates));
      break;
  }

  // Wire the proposed groups together with the existing root(s) so
  // the suggestion is a connected forest ready to apply.
  const suggestedEdges = rootNodes.flatMap((root) =>
    groups.map((g, i) => ({
      source: root.id,
      target: `__proposed_${input.strategy}_${i}`,
    })),
  );

  return {
    groups,
    suggestedEdges,
    rationale: `${STRATEGY_LABELS[input.strategy].zh}: ${rationale}`,
  };
}

// ---------------------------------------------------------------------------
// Strategy implementations (each pure; tested independently below)
// ---------------------------------------------------------------------------

interface GroupResult {
  groups: OrganizeGroup[];
  rationale: string;
}

function groupByTopic(nodes: OrganizeNode[]): GroupResult {
  const buckets: Record<string, OrganizeNode[]> = {};
  for (const n of nodes) {
    const k = n.kind ?? 'branch';
    if (!buckets[k]) buckets[k] = [];
    buckets[k].push(n);
  }
  const groups: OrganizeGroup[] = Object.entries(buckets).map(([kind, items]) => {
    const label = TOPIC_GROUP_LABELS[kind] ?? { zh: kind, en: kind };
    return {
      parentText: label.zh,
      parentKind: kind === 'task' ? 'branch' : ((kind === 'question' || kind === 'resource' || kind === 'risk' || kind === 'tag') ? kind : 'branch'),
      nodeIds: items.map((n) => n.id),
    };
  });
  return { groups, rationale: `将 ${nodes.length} 个节点按类型分为 ${groups.length} 组` };
}

function groupByPriority(nodes: OrganizeNode[]): GroupResult {
  const buckets: Record<string, OrganizeNode[]> = {
    'in-progress': [],
    todo: [],
    done: [],
  };
  for (const n of nodes) {
    const s = n.status ?? 'todo';
    if (!buckets[s]) buckets[s] = [];
    buckets[s].push(n);
  }
  const order: Array<'in-progress' | 'todo' | 'done'> = ['in-progress', 'todo', 'done'];
  const groups: OrganizeGroup[] = order
    .filter((k) => buckets[k].length > 0)
    .map((k) => {
      const label = PRIORITY_GROUP_LABELS[k];
      return {
        parentText: label.zh,
        parentKind: 'branch' as const,
        nodeIds: buckets[k].map((n) => n.id),
      };
    });
  return { groups, rationale: `将 ${nodes.length} 个节点按执行状态分为 ${groups.length} 组` };
}

function groupByTime(nodes: OrganizeNode[]): GroupResult {
  const buckets: Record<string, OrganizeNode[]> = {};
  const ungrouped: OrganizeNode[] = [];
  for (const n of nodes) {
    const tag = (n.tags ?? []).find((t) => DATE_TAG_RE.test(t));
    if (tag) {
      const key = tag.match(DATE_TAG_RE)![0];
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push(n);
    } else {
      ungrouped.push(n);
    }
  }
  const groups: OrganizeGroup[] = Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({
      parentText: `📅 ${date}`,
      parentKind: 'tag' as const,
      nodeIds: items.map((n) => n.id),
    }));
  if (ungrouped.length > 0) {
    groups.push({
      parentText: '无日期',
      parentKind: 'branch',
      nodeIds: ungrouped.map((n) => n.id),
    });
  }
  return { groups, rationale: `将 ${nodes.length} 个节点按日期 tag 分为 ${groups.length} 组（含 ${ungrouped.length} 个无日期）` };
}
