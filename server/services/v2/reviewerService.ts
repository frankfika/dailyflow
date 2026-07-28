/**
 * Reviewer service (Phase 7).
 *
 * Spec §3.4 + F-08/F-09/F-10:
 *   - Triage stale commitments (instead of auto-rollover)
 *   - Surface overdue Waiting items for review
 *   - Generate a weekly review digest
 *   - Compute project risk summary
 *   - Record correction preferences
 *
 * Reviewer reads from the repository only; it never writes Commitments
 * directly. It produces a Triage Proposal that the user reviews and
 * accepts.
 */
import { newId } from '../../domain/v2/ulid.js';
import {
  type Commitment,
  type CommitmentState,
  type ProposedChange,
} from '../../domain/v2/types.js';
import { V2Repository } from '../../repositories/v2/repository.js';

const STALE_DAYS = 14;

export interface StaleCommitmentItem {
  commitmentId: string;
  title: string;
  daysSinceProgress: number;
  reason: string;
  suggestions: Array<{ op: 'transition' | 'cancel' | 'merge'; to?: CommitmentState; reason: string }>;
}

export interface WaitingOverdueItem {
  commitmentId: string;
  title: string;
  waitingOn: string;
  reviewAt: string;
  daysOverdue: number;
}

export interface WeeklyReview {
  closedOutcomes: Array<{ commitmentId: string; title: string; completedAt: string }>;
  stillOpenCommitments: number;
  waitingOverdue: WaitingOverdueItem[];
  staleCommitments: StaleCommitmentItem[];
  projectsAtRisk: Array<{ projectId: string; name: string; reason: string }>;
  decisionsThisWeek: number;
  suggestions: string[];
}

export async function getStaleCommitments(repo: V2Repository): Promise<StaleCommitmentItem[]> {
  const all = await repo.listCommitments();
  const now = Date.now();
  const out: StaleCommitmentItem[] = [];
  for (const c of all) {
    if (c.state === 'completed' || c.state === 'cancelled' || c.state === 'archived') continue;
    const last = c.lastProgressAt ? new Date(c.lastProgressAt).getTime() : new Date(c.createdAt).getTime();
    const days = Math.floor((now - last) / 86_400_000);
    if (days < STALE_DAYS) continue;
    out.push({
      commitmentId: c.id,
      title: c.title,
      daysSinceProgress: days,
      reason: `No progress for ${days} days.`,
      suggestions: buildStaleSuggestions(c, days),
    });
  }
  return out.sort((a, b) => b.daysSinceProgress - a.daysSinceProgress);
}

function buildStaleSuggestions(c: Commitment, days: number): StaleCommitmentItem['suggestions'] {
  const out: StaleCommitmentItem['suggestions'] = [];
  if (c.state === 'inbox') {
    out.push({ op: 'transition', to: 'someday', reason: '从未推进，归到 Someday 避免噪音。' });
  }
  if (c.state === 'active' || c.state === 'planned') {
    out.push({ op: 'transition', to: 'waiting', reason: '是否在等谁？切到 Waiting 并设置复查。' });
  }
  if (days > 60) {
    out.push({ op: 'cancel', reason: '已超过 60 天未推进，建议取消或合并。' });
  }
  return out;
}

export async function getWaitingOverdue(repo: V2Repository): Promise<WaitingOverdueItem[]> {
  const all = await repo.listCommitments();
  const now = Date.now();
  const out: WaitingOverdueItem[] = [];
  for (const c of all) {
    if (c.state !== 'waiting' || !c.reviewAt) continue;
    const reviewAt = new Date(c.reviewAt).getTime();
    const overdue = Math.floor((now - reviewAt) / 86_400_000);
    // reviewAt is the moment the item should return to the user's attention.
    // Waiting another seven days made the queue look empty even though review
    // was already due.
    if (overdue < 0) continue;
    out.push({
      commitmentId: c.id,
      title: c.title,
      waitingOn: c.waitingOnText ?? c.waitingOnId ?? 'unknown',
      reviewAt: c.reviewAt,
      daysOverdue: overdue,
    });
  }
  return out.sort((a, b) => b.daysOverdue - a.daysOverdue);
}

export async function generateWeeklyReview(repo: V2Repository): Promise<WeeklyReview> {
  const all = await repo.listCommitments();
  const decisions = await repo.listDecisions();
  const projects = await repo.listProjects();
  const now = Date.now();
  const weekAgo = now - 7 * 86_400_000;

  const closed = all
    .filter(c => c.state === 'completed' && c.completedAt)
    .filter(c => new Date(c.completedAt!).getTime() >= weekAgo)
    .map(c => ({ commitmentId: c.id, title: c.title, completedAt: c.completedAt! }));
  const waitingOverdue = await getWaitingOverdue(repo);
  const stale = await getStaleCommitments(repo);
  const stillOpen = all.filter(c => c.state !== 'completed' && c.state !== 'cancelled' && c.state !== 'archived').length;
  const decisionsThisWeek = decisions.filter(d => new Date(d.decidedAt).getTime() >= weekAgo).length;
  const projectsAtRisk = projects
    .filter(p => p.state === 'active')
    .map(p => {
      const linked = all.filter(c => c.projectId === p.id);
      const overdue = linked.filter(c => c.dueAt && new Date(c.dueAt) < new Date() && c.state !== 'completed').length;
      const waiting = linked.filter(c => c.state === 'waiting').length;
      const reasonParts: string[] = [];
      if (overdue > 0) reasonParts.push(`${overdue} 项超期`);
      if (waiting > 0) reasonParts.push(`${waiting} 项 Waiting`);
      if (linked.length === 0) reasonParts.push('无活跃 Commitment');
      return { projectId: p.id, name: p.name, reason: reasonParts.join('; ') || '健康' };
    })
    .filter(p => p.reason !== '健康');

  const suggestions: string[] = [];
  if (stale.length > 0) suggestions.push(`Triage ${stale.length} 个陈旧 Commitment。`);
  if (waitingOverdue.length > 0) suggestions.push(`复查 ${waitingOverdue.length} 个超期 Waiting。`);
  if (closed.length === 0) suggestions.push('本周没有完成的对外承诺 — 检查是否需要降低承诺密度。');
  if (projectsAtRisk.length > 0) suggestions.push(`${projectsAtRisk.length} 个项目需要风险关注。`);

  return {
    closedOutcomes: closed,
    stillOpenCommitments: stillOpen,
    waitingOverdue,
    staleCommitments: stale,
    projectsAtRisk,
    decisionsThisWeek,
    suggestions,
  };
}

/**
 * Build a Triage Proposal from current stale / overdue signals. The user
 * can then accept individual changes to transition / cancel / merge.
 */
export interface TriageProposalInput {
  workspaceId: string;
  userId: string;
}

export interface TriageProposal {
  id: string;
  kind: 'triage';
  changes: ProposedChange[];
  summary: string;
  generatedAt: string;
}

export async function buildTriageProposal(
  repo: V2Repository,
  input: TriageProposalInput
): Promise<TriageProposal> {
  const stale = await getStaleCommitments(repo);
  const waitingOverdue = await getWaitingOverdue(repo);
  const changes: ProposedChange[] = [];

  for (const s of stale) {
    for (const suggestion of s.suggestions) {
      changes.push({
        op: 'transition',
        entity: 'commitment',
        targetId: s.commitmentId,
        changeId: newId('chg'),
        draft: { state: suggestion.to ?? 'cancelled' },
        evidenceIds: [],
        confidence: 0.5,
        reason: `${s.reason} ${suggestion.reason}`,
      });
    }
  }
  for (const w of waitingOverdue) {
    changes.push({
      op: 'transition',
      entity: 'commitment',
      targetId: w.commitmentId,
      changeId: newId('chg'),
      draft: { state: 'inbox' },
      evidenceIds: [],
      confidence: 0.6,
      reason: `Waiting 已超期 ${w.daysOverdue} 天，建议回 Inbox 重新决策。`,
    });
  }

  return {
    id: newId('prop'),
    kind: 'triage',
    changes,
    summary: `Triage 候选: ${stale.length} 陈旧 + ${waitingOverdue.length} 超期`,
    generatedAt: new Date().toISOString(),
  };
}
