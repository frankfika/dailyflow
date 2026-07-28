export type WorkItemKind = 'task' | 'commitment';
export type WorkItemStatus = 'open' | 'in_progress' | 'waiting' | 'done' | 'cancelled';

export interface WorkItem {
  id: string;
  kind: WorkItemKind;
  workspaceId: string;
  title: string;
  status: WorkItemStatus;
  scheduledDate?: string;
  dueAt?: string;
  reviewAt?: string;
  sourceRefs: Array<{ workspaceId: string; type: string; id: string; label?: string }>;
  version: number;
  updatedAt: string;
  raw: unknown;
}

export interface LegacyTaskLike {
  id: string;
  title: string;
  status: 'todo' | 'done' | 'migrated' | string;
  source_date?: string;
  deadline?: string;
  date?: string;
  line?: number;
}

export interface CommitmentLike {
  id: string;
  workspaceId: string;
  title: string;
  state: string;
  reviewAt?: string;
  sourceIds?: string[];
  updatedAt: string;
  schemaVersion?: number;
  dueAt?: string;
  legacyTaskId?: string;
}

export function taskToWorkItem(task: LegacyTaskLike, workspaceId: string, date?: string): WorkItem {
  return {
    id: task.id,
    kind: 'task',
    workspaceId,
    title: task.title,
    status: task.status === 'done' ? 'done' : task.status === 'migrated' ? 'cancelled' : 'open',
    scheduledDate: date ?? task.date ?? task.source_date,
    dueAt: task.deadline,
    sourceRefs: [],
    version: 0,
    updatedAt: '',
    raw: task,
  };
}

export function commitmentToWorkItem(commitment: CommitmentLike): WorkItem {
  const status: WorkItemStatus =
    commitment.state === 'completed' ? 'done'
      : commitment.state === 'cancelled' || commitment.state === 'archived' ? 'cancelled'
        : commitment.state === 'waiting' ? 'waiting'
          : commitment.state === 'active' || commitment.state === 'planned' ? 'in_progress'
            : 'open';
  return {
    id: commitment.id,
    kind: 'commitment',
    workspaceId: commitment.workspaceId,
    title: commitment.title,
    status,
    reviewAt: commitment.reviewAt,
    dueAt: commitment.dueAt,
    sourceRefs: (commitment.sourceIds ?? []).map(id => ({
      workspaceId: commitment.workspaceId,
      type: 'source',
      id,
    })),
    version: commitment.schemaVersion ?? 1,
    updatedAt: commitment.updatedAt,
    raw: commitment,
  };
}

export function mergeWorkItems(
  tasks: LegacyTaskLike[],
  commitments: CommitmentLike[],
  workspaceId: string,
  date?: string,
): WorkItem[] {
  const migratedLegacyIds = new Set(
    commitments.map(commitment => commitment.legacyTaskId).filter((id): id is string => Boolean(id)),
  );
  return [
    ...tasks.filter(task => !migratedLegacyIds.has(task.id)).map(task => taskToWorkItem(task, workspaceId, date)),
    ...commitments.map(commitmentToWorkItem),
  ];
}
