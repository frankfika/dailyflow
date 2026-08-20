import { z } from 'zod';
import { newId } from '../../domain/v2/ulid.js';
import {
  AgentDefinitionSchema,
  AgentRunSchema,
  type AgentDefinition,
  type AgentRun,
} from '../../domain/v2/types.js';
import type { V2Repository } from '../../repositories/v2/repository.js';

/** Built-in manifest. It describes future Chat-agent work; it never transcribes audio. */
export const MEETING_NOTES_AGENT: AgentDefinition = AgentDefinitionSchema.parse({
  id: 'meeting-notes@1',
  name: 'Meeting Notes',
  description: 'Turn a meeting Note and its transcript into reviewable minutes, decisions, and action items.',
  version: '1.0.0',
  acceptedInputs: ['note', 'meeting_transcript', 'source'],
  capabilities: ['summarize', 'rewrite', 'extract_tasks', 'extract_decisions'],
  permissions: ['read_note', 'read_sources', 'update_note', 'create_tasks'],
  modelRequirements: { type: 'chat', supportsLocal: true, supportsRemote: true },
});

export const AgentInvocationInputSchema = z.object({
  agentId: z.string().default(MEETING_NOTES_AGENT.id),
  noteId: z.string().min(1),
  sourceIds: z.array(z.string()).optional(),
});
export type AgentInvocationInput = z.input<typeof AgentInvocationInputSchema>;

export function listAgentDefinitions(): AgentDefinition[] {
  return [MEETING_NOTES_AGENT];
}

/**
 * Creates an auditable run context only. The future agent worker will consume
 * this run and write a proposal/result; no summary is generated here.
 */
export async function startAgentRun(
  repo: V2Repository,
  workspaceId: string,
  input: AgentInvocationInput,
): Promise<AgentRun> {
  const agentId = input.agentId ?? MEETING_NOTES_AGENT.id;
  const definition = listAgentDefinitions().find(item => item.id === agentId);
  if (!definition) throw new Error(`Unknown agent definition: ${agentId}`);
  const note = await repo.getNoteDocument(input.noteId);
  if (!note) throw new Error('Note not found');
  if (note.workspaceId !== workspaceId) throw new Error('Note workspace mismatch');
  if (note.kind !== 'meeting') throw new Error('Meeting Notes agent requires a meeting note');
  const sourceIds = input.sourceIds ?? note.sourceIds;
  const run = AgentRunSchema.parse({
    id: newId('run'), schemaVersion: 1, createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(), createdBy: 'user', workspaceId,
    agent: 'meeting_notes', agentDefinitionId: definition.id,
    modelProvider: 'pending', model: 'pending', promptVersion: `${definition.id}/pending`,
    inputEntityIds: [note.id, ...sourceIds], status: 'running',
    result: { state: 'awaiting_agent_runtime', noteId: note.id, sourceIds },
  });
  await repo.saveAgentRun(run, {
    auditKind: 'process', auditEntity: { type: 'run', id: run.id },
    auditData: { agentDefinitionId: definition.id, noteId: note.id, sourceIds },
  });
  return run;
}

// ---------------------------------------------------------------------------
// Mind-map "AI organize" — Sprint 1 / Gap 2
//
// This is a deterministic, no-AI fallback for the V2 promise "AI 把零散节点
// 整理成结构". Three strategies are exposed today:
//
//   - by_topic   → group every loose node by its `kind`. Each group becomes
//                  a branch under the root; semantic kinds (question /
//                  resource / risk) keep their dedicated parent label.
//   - by_priority → group every loose node by `status` (todo / in-progress
//                   / done). Groups become "状态 · TODO" etc.
//   - by_time    → group nodes whose `tags` contain a date-like string
//                  (YYYY-MM-DD / YYYY/MM / "Jan" / week numbers). Nodes
//                  without a recognized time tag fall into a single
//                  "未分配时间" bucket so the user still gets a place to
//                  triage them.
//
// Each strategy only produces a *suggestion* (groups + suggested edges +
// rationale). The server NEVER writes to the mind map. The client is
// responsible for previewing and asking the user to "应用" / "拒绝" before
// any node mutations are persisted (Gap 2 rule: 永远给撤销按钮 / 第一次仅给
// 推荐).
//
// Future AI hook: replace `organizeMindmap` with a model-backed planner
// that returns the same `OrganizeSuggestion` shape. The route and modal
// contract stay unchanged.
// ---------------------------------------------------------------------------

export const OrganizeStrategySchema = z.enum(['by_topic', 'by_priority', 'by_time']);
export type OrganizeStrategy = z.infer<typeof OrganizeStrategySchema>;

/**
 * MindMapNode is referenced via a structural subset so v1 maps (no `kind`
 * field) keep working — `kind` / `status` / `tags` are all optional.
 */
export interface OrganizeNodeInput {
  id: string;
  text: string;
  /** Sprint 1 / Gap 1 kinds: 'root' | 'branch' | 'tag' | 'task' | 'question' | 'resource' | 'risk'. */
  kind?: string;
  /** v2 task status: 'todo' | 'in-progress' | 'done'. */
  status?: string;
  /** User-facing tag chips (free text — used by `by_time`). */
  tags?: string[];
}

export interface OrganizeEdgeInput {
  id: string;
  source: string;
  target: string;
}

export interface OrganizeInput {
  mindmapId: string;
  strategy: OrganizeStrategy;
  nodes: OrganizeNodeInput[];
  edges: OrganizeEdgeInput[];
}

export interface OrganizeSuggestionGroup {
  /** Display label for the new parent node (e.g. "📌 Tasks"). */
  parentText: string;
  /** What kind to give the new parent branch. */
  parentKind: 'branch' | 'question' | 'resource' | 'risk' | 'tag';
  /** Node ids that should hang under this parent. Order is preserved. */
  nodeIds: string[];
}

export interface OrganizeSuggestionEdge {
  source: string;
  target: string;
}

export interface OrganizeSuggestion {
  /** Strategy that produced this suggestion (echoed for the modal banner). */
  strategy: OrganizeStrategy;
  /** Human-readable rationale, shown verbatim in the modal. */
  rationale: string;
  /** Proposed parent groups. Each group becomes a new branch under root. */
  groups: OrganizeSuggestionGroup[];
  /**
   * Cross-group edges the planner would like to add (today: empty for the
   * three fallback strategies — the structure comes purely from groups).
   * Reserved for future AI planners that surface ad-hoc links.
   */
  suggestedEdges: OrganizeSuggestionEdge[];
  /** Per-group rationale shown beside the group title in the modal. */
  groupRationale: Record<string, string>;
  /** Stats for the modal summary line ("N 个节点已整理为 K 组"). */
  stats: {
    looseNodes: number;
    organizedNodes: number;
    groupCount: number;
  };
}

export const OrganizeInputSchema = z.object({
  mindmapId: z.string().min(1),
  strategy: OrganizeStrategySchema,
  nodes: z.array(
    z.object({
      id: z.string().min(1),
      text: z.string(),
      kind: z.string().optional(),
      status: z.string().optional(),
      tags: z.array(z.string()).optional(),
    }),
  ),
  edges: z.array(
    z.object({
      id: z.string(),
      source: z.string(),
      target: z.string(),
    }),
  ),
});

/** Kind -> display label + parent-kind mapping for `by_topic`. */
const TOPIC_GROUPS: ReadonlyArray<{
  match: (kind: string | undefined) => boolean;
  parentText: string;
  parentKind: OrganizeSuggestionGroup['parentKind'];
  rationale: string;
}> = [
  {
    match: (kind) => kind === 'task',
    parentText: '📌 Tasks',
    parentKind: 'branch',
    rationale: '已绑定 Task 的节点 → 直接挂在 "Tasks" 之下。',
  },
  {
    match: (kind) => kind === 'question',
    parentText: '❓ Questions',
    parentKind: 'question',
    rationale: '待澄清的疑问（保留 question 视觉）。',
  },
  {
    match: (kind) => kind === 'resource',
    parentText: '📚 Resources',
    parentKind: 'resource',
    rationale: '参考资料 / 链接（保留 resource 视觉）。',
  },
  {
    match: (kind) => kind === 'risk',
    parentText: '⚠️ Risks',
    parentKind: 'risk',
    rationale: '风险 / 注意事项（保留 risk 视觉）。',
  },
  {
    match: (kind) => kind === 'tag',
    parentText: '🏷️ Tags',
    parentKind: 'tag',
    rationale: '纯标签节点 → 放在 "Tags" 容器下。',
  },
  {
    match: (kind) => kind === 'branch' || kind === undefined,
    parentText: '🌿 Branches',
    parentKind: 'branch',
    rationale: '普通主题分支。',
  },
];

const PRIORITY_GROUPS: ReadonlyArray<{
  status: string;
  parentText: string;
  rationale: string;
}> = [
  {
    status: 'in-progress',
    parentText: '🟡 状态 · 进行中',
    rationale: '正在推进的节点排在第一位，方便今天继续推进。',
  },
  {
    status: 'todo',
    parentText: '⚪ 状态 · 待办',
    rationale: '待启动节点；按当前散落位置搬到同一容器。',
  },
  {
    status: 'done',
    parentText: '✅ 状态 · 已完成',
    rationale: '已完成的节点移到末尾容器，便于回顾。',
  },
];

/**
 * Loose date detector: matches `YYYY-MM-DD`, `YYYY/MM/DD`, `YYYY/MM`,
 * ISO weeks (`2026-W32`), and a few common month tokens. Returns the
 * matched token so the caller can use it as the group label.
 */
const TIME_TAG_REGEXES: ReadonlyArray<{ regex: RegExp; format: (m: RegExpMatchArray) => string }> = [
  { regex: /(\d{4}-\d{2}-\d{2})/, format: (m) => m[1]! },
  { regex: /(\d{4}\/\d{2}\/\d{2})/, format: (m) => m[1]!.replace(/\//g, '-') },
  { regex: /(\d{4}-\d{2})/, format: (m) => m[1]! },
  { regex: /(\d{4}\/\d{2})/, format: (m) => m[1]!.replace(/\//g, '-') },
  { regex: /(\d{4}-W\d{2})/i, format: (m) => m[1]!.toUpperCase() },
];

const MONTH_NAMES = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
];

function detectTimeToken(tags: ReadonlyArray<string> | undefined): string | null {
  if (!tags || tags.length === 0) return null;
  for (const tag of tags) {
    const normalized = tag.trim();
    if (!normalized) continue;
    for (const { regex, format } of TIME_TAG_REGEXES) {
      const match = normalized.match(regex);
      if (match) return format(match);
    }
    const lower = normalized.toLowerCase().replace(/^#+/, '');
    if (MONTH_NAMES.includes(lower)) {
      return lower.slice(0, 1).toUpperCase() + lower.slice(1);
    }
  }
  return null;
}

/**
 * Returns the existing parent id for `nodeId`, or `null` if it has none.
 * A node is considered "loose" when it has zero incoming edges (the root
 * is naturally excluded by definition — it sits at depth 0 with no parent).
 */
function findExistingParentId(
  nodeId: string,
  edges: ReadonlyArray<OrganizeEdgeInput>,
): string | null {
  for (const edge of edges) {
    if (edge.target === nodeId) return edge.source;
  }
  return null;
}

interface OrganizePlanInput {
  rootId: string;
  nodes: OrganizeNodeInput[];
  edges: OrganizeEdgeInput[];
}

interface OrganizePlanOutput {
  groups: OrganizeSuggestionGroup[];
  suggestedEdges: OrganizeSuggestionEdge[];
  groupRationale: Record<string, string>;
}

function planByTopic(plan: OrganizePlanInput): OrganizePlanOutput {
  const loose = plan.nodes.filter(
    (node) => node.id !== plan.rootId && findExistingParentId(node.id, plan.edges) === null,
  );
  const groups: OrganizeSuggestionGroup[] = [];
  const groupRationale: Record<string, string> = {};
  for (const def of TOPIC_GROUPS) {
    const matched = loose.filter((node) => def.match(node.kind));
    if (matched.length === 0) continue;
    groups.push({
      parentText: def.parentText,
      parentKind: def.parentKind,
      nodeIds: matched.map((node) => node.id),
    });
    groupRationale[def.parentText] = def.rationale;
  }
  return { groups, suggestedEdges: [], groupRationale };
}

function planByPriority(plan: OrganizePlanInput): OrganizePlanOutput {
  const loose = plan.nodes.filter(
    (node) => node.id !== plan.rootId && findExistingParentId(node.id, plan.edges) === null,
  );
  const groups: OrganizeSuggestionGroup[] = [];
  const groupRationale: Record<string, string> = {};
  for (const def of PRIORITY_GROUPS) {
    const matched = loose.filter((node) => (node.status ?? 'todo') === def.status);
    if (matched.length === 0) continue;
    groups.push({
      parentText: def.parentText,
      parentKind: 'branch',
      nodeIds: matched.map((node) => node.id),
    });
    groupRationale[def.parentText] = def.rationale;
  }
  return { groups, suggestedEdges: [], groupRationale };
}

function planByTime(plan: OrganizePlanInput): OrganizePlanOutput {
  const loose = plan.nodes.filter(
    (node) => node.id !== plan.rootId && findExistingParentId(node.id, plan.edges) === null,
  );
  const groups: OrganizeSuggestionGroup[] = [];
  const groupRationale: Record<string, string> = {};
  const unassigned: OrganizeNodeInput[] = [];
  const detectedByToken = new Map<string, OrganizeNodeInput[]>();

  for (const node of loose) {
    const token = detectTimeToken(node.tags);
    if (token === null) {
      unassigned.push(node);
      continue;
    }
    const bucket = detectedByToken.get(token) ?? [];
    bucket.push(node);
    detectedByToken.set(token, bucket);
  }

  const sortedKeys = Array.from(detectedByToken.keys()).sort();
  for (const key of sortedKeys) {
    const matched = detectedByToken.get(key) ?? [];
    if (matched.length === 0) continue;
    const parentText = `📅 ${key}`;
    groups.push({
      parentText,
      parentKind: 'branch',
      nodeIds: matched.map((node) => node.id),
    });
    groupRationale[parentText] = `标签里出现 "${key}" 的节点，按时间聚合。`;
  }

  if (unassigned.length > 0) {
    const parentText = '❔ 未分配时间';
    groups.push({
      parentText,
      parentKind: 'branch',
      nodeIds: unassigned.map((node) => node.id),
    });
    groupRationale[parentText] = '没有识别到时间标签的节点，留在这里以便你手动分拣。';
  }

  return { groups, suggestedEdges: [], groupRationale };
}

const STRATEGY_PLANNERS: Record<
  OrganizeStrategy,
  (plan: OrganizePlanInput) => OrganizePlanOutput
> = {
  by_topic: planByTopic,
  by_priority: planByPriority,
  by_time: planByTime,
};

const STRATEGY_RATIONALE: Record<OrganizeStrategy, string> = {
  by_topic:
    '按节点的 kind 分组：Task / Question / Resource / Risk / Tag / Branch 各成一组。适合刚开始收集零散想法、想先按"是什么"分门别类的场景。',
  by_priority:
    '按 status 分组：进行中 / 待办 / 已完成。适合今天的 Today 视图已经打开、想立刻看到"哪些还差一步完成"的场景。',
  by_time:
    '按节点 tag 里的时间标签（YYYY-MM-DD / YYYY-MM / 月份 / 周）聚合。适合节点已经被你打上日期、想按时间线整理的场景。',
};

/** Resolve the root id for `organizeMindmap` (kind === 'root' wins; else the node with no incoming edge). */
function resolveRootId(nodes: ReadonlyArray<OrganizeNodeInput>, edges: ReadonlyArray<OrganizeEdgeInput>): string {
  const explicit = nodes.find((node) => node.kind === 'root');
  if (explicit) return explicit.id;
  const incomingCount = new Map<string, number>();
  for (const edge of edges) {
    incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1);
  }
  const orphan = nodes.find((node) => (incomingCount.get(node.id) ?? 0) === 0);
  return orphan?.id ?? nodes[0]?.id ?? '';
}

/**
 * Build an `OrganizeSuggestion` from a snapshot of the current mind map.
 *
 * Pure / synchronous / deterministic — no model call. The route handler
 * is responsible for returning the suggestion to the client *without*
 * writing. The first argument is kept in the signature (and currently
 * unused) so a future AI-backed planner can persist a planner run /
 * audit entry without changing the call site (Sprint 1 / Gap 2 hook).
 */
export function organizeMindmap(
  _repo: V2Repository | null,
  input: OrganizeInput,
): OrganizeSuggestion {
  const parsed = OrganizeInputSchema.parse(input);
  const rootId = resolveRootId(parsed.nodes, parsed.edges);
  const planner = STRATEGY_PLANNERS[parsed.strategy];
  const plan = planner({ rootId, nodes: parsed.nodes, edges: parsed.edges });
  const organizedNodes = plan.groups.reduce((sum, group) => sum + group.nodeIds.length, 0);
  const looseCount = parsed.nodes.filter(
    (node) => node.id !== rootId && findExistingParentId(node.id, parsed.edges) === null,
  ).length;
  return {
    strategy: parsed.strategy,
    rationale: STRATEGY_RATIONALE[parsed.strategy],
    groups: plan.groups,
    suggestedEdges: plan.suggestedEdges,
    groupRationale: plan.groupRationale,
    stats: {
      looseNodes: looseCount,
      organizedNodes,
      groupCount: plan.groups.length,
    },
  };
}
