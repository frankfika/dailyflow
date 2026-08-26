import { computeBaseRevision, type GraphSnapshotBase } from '../../domain/v2/eventGraphValidator.js';
import type { EventGraphProposal, GraphOperation } from '../../domain/v2/eventOperator.js';

export type GoldenScenario =
  | 'simple_task_extraction'
  | 'existing_task_update'
  | 'explicit_decision'
  | 'waiting_review'
  | 'duplicate_commitment'
  | 'insufficient_evidence'
  | 'conflicting_deadline'
  | 'outcome_closure'
  | 'large_mindmap_pagination'
  | 'stale_after_user_edit';

export interface GoldenCriteria {
  allowedOps: GraphOperation['op'][];
  forbiddenOps: string[];
  minimumEvidencePerDomainOperation: number;
  requiredNodeKinds?: string[];
  forbiddenDomainEntities?: string[];
  forbidDuplicateCommitmentTitle?: boolean;
  forbidConflictingDeadline?: boolean;
  expectedStale?: boolean;
  pageSize?: number;
  minimumPageCount?: number;
}

export interface EventOperatorGoldenFixture {
  id: string;
  scenario: GoldenScenario;
  description: string;
  snapshot: GraphSnapshotBase;
  currentSnapshot?: GraphSnapshotBase;
  existingCommitments?: Array<{ id: string; title: string; dueAt?: string }>;
  proposal: EventGraphProposal;
  criteria: GoldenCriteria;
}

const WS = 'ws_golden';
const EVENT = 'event_golden_AAAAAAAAAAAAAAA';
const MAP = 'mindmap_golden_AAAAAAAAAAAAA';
const ROOT = 'node_root_golden_AAAAAAAAAAA';
const AT = '2026-08-20T00:00:00.000Z';
const EVIDENCE = 'evidence_golden_AAAAAAAAAAAA';

function snapshot(overrides: Partial<GraphSnapshotBase> = {}): GraphSnapshotBase {
  return {
    workspaceId: WS,
    eventId: EVENT,
    mindmapId: MAP,
    mindmapUpdatedAt: AT,
    eventStatus: 'active',
    nodes: [{ id: ROOT, kind: 'root', text: '匿名事项' }],
    edges: [],
    commitments: [],
    knownEntityIds: new Set(),
    knownEvidenceIds: new Set([EVIDENCE]),
    ...overrides,
  };
}

function proposal(id: string, snap: GraphSnapshotBase, operations: GraphOperation[], summary: string): EventGraphProposal {
  return {
    id: `gprop_${id}_AAAAAAAAAAAA`,
    schemaVersion: 1,
    workspaceId: WS,
    eventId: EVENT,
    mindmapId: MAP,
    agentRunId: `eval_${id}_AAAAAAAAAAAAAA`,
    baseRevision: computeBaseRevision(snap),
    status: 'pending',
    operations,
    summary,
    riskLevel: 'low',
    createdAt: AT,
  };
}

function addNode(
  id: string,
  kind: 'task' | 'decision' | 'waiting' | 'question' | 'risk' | 'outcome',
  text: string,
  domainDraft: Extract<GraphOperation, { op: 'add_node' }>['domainDraft'],
  evidenceIds = [EVIDENCE],
): Extract<GraphOperation, { op: 'add_node' }> {
  return {
    changeId: `change_${id}`,
    op: 'add_node',
    tempId: `temp_${id}`,
    parentId: ROOT,
    node: { kind, text },
    domainDraft,
    evidenceIds,
    confidence: 0.9,
    reason: '去敏样本中的结构化事实',
  };
}

const simple = snapshot();
const existingTask = snapshot({
  nodes: [
    { id: ROOT, kind: 'root', text: '匿名事项' },
    { id: 'node_existing_task_AAAAAAAAAA', kind: 'task', text: '准备材料' },
  ],
  edges: [{ id: 'edge_existing_AAAAAAAAAAAA', source: ROOT, target: 'node_existing_task_AAAAAAAAAA' }],
});
const duplicate = snapshot({
  nodes: [
    { id: ROOT, kind: 'root', text: '匿名事项' },
    { id: 'node_duplicate_AAAAAAAAAAAAA', kind: 'task', text: '发送确认函' },
  ],
  edges: [{ id: 'edge_duplicate_AAAAAAAAAAAA', source: ROOT, target: 'node_duplicate_AAAAAAAAAAAAA' }],
  commitments: [{ id: 'commitment_existing_AAAAAAAAA', updatedAt: AT, state: 'active' }],
  knownEntityIds: new Set(['commitment_existing_AAAAAAAAA']),
});
const deadline = snapshot();
const outcomeClosure = snapshot({
  commitments: [{ id: 'commitment_outcome_AAAAAAAAAA', updatedAt: AT, state: 'active' }],
  knownEntityIds: new Set(['commitment_outcome_AAAAAAAAAA']),
});
const largeNodes = [
  { id: ROOT, kind: 'root', text: '匿名大图' },
  ...Array.from({ length: 119 }, (_, index) => ({
    id: `node_large_${String(index).padStart(3, '0')}_AAAAAAAAAAAA`,
    kind: 'branch',
    text: `分支 ${index + 1}`,
  })),
];
const large = snapshot({
  nodes: largeNodes,
  edges: largeNodes.slice(1).map((node, index) => ({ id: `edge_large_${String(index).padStart(3, '0')}_AAAAAAAAAAAA`, source: ROOT, target: node.id })),
});
const staleBase = snapshot();
const staleCurrent = snapshot({
  mindmapUpdatedAt: '2026-08-20T00:10:00.000Z',
  nodes: [...staleBase.nodes, { id: 'node_human_edit_AAAAAAAAAAAA', kind: 'branch', text: '用户新增' }],
  edges: [{ id: 'edge_human_edit_AAAAAAAAAAAA', source: ROOT, target: 'node_human_edit_AAAAAAAAAAAA' }],
});

export const EVENT_OPERATOR_GOLDEN_FIXTURES: EventOperatorGoldenFixture[] = [
  {
    id: 'golden-01', scenario: 'simple_task_extraction', description: '从明确证据提取一个行动', snapshot: simple,
    proposal: proposal('golden01', simple, [addNode('simple', 'task', '准备匿名材料', { entity: 'commitment', title: '准备匿名材料', state: 'active' })], '提取行动'),
    criteria: { allowedOps: ['add_node'], forbiddenOps: ['delete_node'], minimumEvidencePerDomainOperation: 1, requiredNodeKinds: ['task'] },
  },
  {
    id: 'golden-02', scenario: 'existing_task_update', description: '优先更新已有节点', snapshot: existingTask,
    proposal: proposal('golden02', existingTask, [{ changeId: 'change_update', op: 'update_node', nodeId: 'node_existing_task_AAAAAAAAAA', patch: { note: '补充验收条件' }, evidenceIds: [EVIDENCE], confidence: 0.8, reason: '已有任务应增量更新' }], '更新已有任务'),
    criteria: { allowedOps: ['update_node'], forbiddenOps: ['add_node', 'delete_node'], minimumEvidencePerDomainOperation: 0 },
  },
  {
    id: 'golden-03', scenario: 'explicit_decision', description: '有证据的明确决策', snapshot: simple,
    proposal: proposal('golden03', simple, [addNode('decision', 'decision', '采用匿名方案 B', { entity: 'decision', title: '方案选择', decision: '采用匿名方案 B', rationale: '证据中明确记录' })], '记录决策'),
    criteria: { allowedOps: ['add_node'], forbiddenOps: ['delete_node'], minimumEvidencePerDomainOperation: 1, requiredNodeKinds: ['decision'] },
  },
  {
    id: 'golden-04', scenario: 'waiting_review', description: '等待项包含复查时间', snapshot: simple,
    proposal: proposal('golden04', simple, [addNode('waiting', 'waiting', '等待匿名方确认', { entity: 'waiting_commitment', title: '等待匿名方确认', waitingOnText: '外部协作方', reviewAt: '2026-08-27T09:00:00.000Z' })], '建立等待循环'),
    criteria: { allowedOps: ['add_node'], forbiddenOps: ['delete_node'], minimumEvidencePerDomainOperation: 1, requiredNodeKinds: ['waiting'] },
  },
  {
    id: 'golden-05', scenario: 'duplicate_commitment', description: '命中已有 Commitment 时不重复创建', snapshot: duplicate,
    existingCommitments: [{ id: 'commitment_existing_AAAAAAAAA', title: '发送确认函' }],
    proposal: proposal('golden05', duplicate, [{ changeId: 'change_duplicate_update', op: 'update_node', nodeId: 'node_duplicate_AAAAAAAAAAAAA', patch: { note: '补充发送渠道' }, evidenceIds: [EVIDENCE], confidence: 0.9, reason: '复用已有行动' }], '避免重复'),
    criteria: { allowedOps: ['update_node', 'link_entity'], forbiddenOps: ['add_node', 'delete_node'], minimumEvidencePerDomainOperation: 0, forbidDuplicateCommitmentTitle: true },
  },
  {
    id: 'golden-06', scenario: 'insufficient_evidence', description: '证据不足时只提出问题', snapshot: snapshot({ knownEvidenceIds: new Set() }),
    proposal: proposal('golden06', snapshot({ knownEvidenceIds: new Set() }), [addNode('question', 'question', '负责人尚待确认', { entity: 'none' }, [])], '标记待确认信息'),
    criteria: { allowedOps: ['add_node'], forbiddenOps: ['link_entity', 'delete_node'], minimumEvidencePerDomainOperation: 1, requiredNodeKinds: ['question'], forbiddenDomainEntities: ['commitment', 'waiting_commitment', 'decision', 'outcome'] },
  },
  {
    id: 'golden-07', scenario: 'conflicting_deadline', description: '冲突 deadline 不覆盖正式行动', snapshot: deadline,
    existingCommitments: [{ id: 'commitment_deadline_AAAAAAAAA', title: '提交匿名文件', dueAt: '2026-09-01T09:00:00.000Z' }],
    proposal: proposal('golden07', deadline, [addNode('deadline_question', 'question', '截止时间存在冲突，需确认', { entity: 'none' })], '提示截止时间冲突'),
    criteria: { allowedOps: ['add_node'], forbiddenOps: ['update_node', 'delete_node'], minimumEvidencePerDomainOperation: 1, requiredNodeKinds: ['question'], forbiddenDomainEntities: ['commitment'], forbidConflictingDeadline: true },
  },
  {
    id: 'golden-08', scenario: 'outcome_closure', description: '以有证据 Outcome 关闭循环', snapshot: outcomeClosure,
    proposal: proposal('golden08', outcomeClosure, [addNode('outcome', 'outcome', '匿名交付已确认', { entity: 'outcome', title: '匿名交付完成', outcomeSummary: '交付已由证据确认', outcomeKind: 'confirmed', commitmentId: 'commitment_outcome_AAAAAAAAAA' })], '记录结果'),
    criteria: { allowedOps: ['add_node'], forbiddenOps: ['delete_node'], minimumEvidencePerDomainOperation: 1, requiredNodeKinds: ['outcome'] },
  },
  {
    id: 'golden-09', scenario: 'large_mindmap_pagination', description: '大图评测必须分页且不丢节点', snapshot: large,
    proposal: proposal('golden09', large, [{ changeId: 'change_large_update', op: 'update_node', nodeId: largeNodes[1]!.id, patch: { note: '已检查' }, evidenceIds: [], confidence: 0.7, reason: '只更新命中节点' }], '更新大图中的单个节点'),
    criteria: { allowedOps: ['update_node'], forbiddenOps: ['delete_node'], minimumEvidencePerDomainOperation: 0, pageSize: 50, minimumPageCount: 3 },
  },
  {
    id: 'golden-10', scenario: 'stale_after_user_edit', description: 'Proposal 后用户改图必须 stale', snapshot: staleBase, currentSnapshot: staleCurrent,
    proposal: proposal('golden10', staleBase, [addNode('stale', 'task', '旧版本中的行动', { entity: 'commitment', title: '旧版本中的行动', state: 'active' })], '旧 revision 建议'),
    criteria: { allowedOps: ['add_node'], forbiddenOps: ['delete_node'], minimumEvidencePerDomainOperation: 1, expectedStale: true },
  },
];
