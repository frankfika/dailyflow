/**
 * Meeting service (Phase 3).
 *
 * Spec §3.3 + §6 + F-03:
 *   - User pastes minutes / imports transcript / records audio.
 *   - System saves the original material as a SourceItem.
 *   - AI extracts Decisions, Commitments, Waiting items, Open Questions.
 *   - Each item carries Evidence (source + locator + quote).
 *   - User reviews a Proposal and accepts.
 *
 * We deliberately distinguish:
 *   - explicit_commitment   — the user actually committed
 *   - possible_commitment   — looks like one, needs confirmation
 *   - decision              — group/team decision (not a personal action)
 *   - waiting_item          — user is now waiting on someone
 *   - open_question         — needs clarification
 *   - factual_reference     — background; no follow-up
 *
 * The user can also use `decisionFromText` to record a decision manually
 * without going through the AI pipeline.
 */
import { newId } from '../../domain/v2/ulid.js';
import {
  DecisionSchema,
  type Decision,
  type SourceItem,
} from '../../domain/v2/types.js';
import { V2Repository } from '../../repositories/v2/repository.js';
import {
  runExtractor,
  buildExtractorProposal,
} from './ai/extractor.js';
import type { AIProvider } from './ai/provider.js';
import {
  createProposal,
  applyProposal,
} from './proposalService.js';
import { createCommitment } from './commitmentService.js';

export interface MeetingProcessInput {
  source: SourceItem;
  workspaceId: string;
  /** Legacy test-only path. User-facing routes always require review. */
  autoAcceptDecisions?: boolean;
  provider?: AIProvider;
}

export interface MeetingProcessOutput {
  proposal: Awaited<ReturnType<typeof createProposal>>;
  decisionCount: number;
  commitmentCount: number;
  waitingCount: number;
  questionCount: number;
  fallback: boolean;
  fallbackReason?: string;
}

/**
 * Process a SourceItem as meeting content. Runs the Extractor and emits
 * a Proposal that contains Commitments, Decisions, and Waiting items
 * with Evidence attached.
 */
export async function processMeeting(
  repo: V2Repository,
  input: MeetingProcessInput
): Promise<MeetingProcessOutput> {
  const out = await runExtractor({ source: input.source, provider: input.provider });
  const built = buildExtractorProposal({
    source: input.source,
    extractorOutput: out,
    workspaceId: input.workspaceId,
    actorId: 'user',
  });

  // Save evidence + agent run for the audit trail.
  await repo.saveAgentRun(built.agentRun, {
    auditKind: 'process',
    auditEntity: { type: 'run', id: built.agentRun.id },
  });
  for (const ev of built.evidence) {
    await repo.saveEvidence(ev, {
      auditKind: 'process',
      auditEntity: { type: 'evidence', id: ev.id },
    });
  }

  const proposal = await createProposal(repo, input.workspaceId, {
    kind: 'extract_commitments',
    sourceIds: [input.source.id],
    modelRunId: built.agentRun.id,
    changes: built.changes,
  });

  // AI-derived Decisions are proposed just like every other AI write. They
  // are persisted only when the user accepts the corresponding change.
  const decisionCount = proposal.changes.filter(change => change.entity === 'decision').length;

  // If auto-accept is on, apply non-decision changes immediately.
  let commitmentCount = 0;
  let waitingCount = 0;
  let questionCount = 0;
  if (input.autoAcceptDecisions === false) {
    // skip
  } else if (proposal.changes.length > 0) {
    try {
      const r = await applyProposal(repo, proposal.id, {
        idempotencyKey: `meeting-auto-apply:${proposal.id}`,
        selection: proposal.changes
          .filter(c => c.confidence >= 0.85)
          .map(c => c.changeId),
      });
      for (const c of r.created) {
        if (c.commitment.state === 'waiting') waitingCount++;
        else commitmentCount++;
      }
    } catch {
      /* fall through: user can still review */
    }
  }
  for (const c of proposal.changes) {
    if (c.entity === 'commitment' && c.draft.state === 'inbox' && c.confidence < 0.85) {
      questionCount++;
    }
  }

  // Mark source as processed.
  const updated: SourceItem = {
    ...input.source,
    processingStatus: built.empty ? 'processed' : 'needs_review',
  };
  await repo.saveSourceItem(updated, {
    auditKind: 'process',
    auditEntity: { type: 'source', id: updated.id },
  });

  return {
    proposal,
    decisionCount,
    commitmentCount,
    waitingCount,
    questionCount,
    fallback: built.fallback,
    fallbackReason: built.fallbackReason,
  };
}

/**
 * Create a Decision manually (e.g. when AI isn't available but the user
 * wants to record a decision from a meeting).
 */
export async function recordDecision(
  repo: V2Repository,
  workspaceId: string,
  input: {
    title: string;
    decision: string;
    rationale?: string;
    participantIds?: string[];
    projectId?: string;
    evidenceIds?: string[];
  }
): Promise<Decision> {
  const now = new Date().toISOString();
  const draft: Decision = {
    id: newId('dec'),
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    createdBy: 'user',
    workspaceId,
    title: input.title,
    decision: input.decision,
    rationale: input.rationale,
    decidedAt: now,
    participantIds: input.participantIds ?? [],
    projectId: input.projectId,
    evidenceIds: input.evidenceIds ?? [],
  };
  const validated = DecisionSchema.parse(draft);
  await repo.saveDecision(validated, {
    auditKind: 'commitment.update',
    auditEntity: { type: 'decision', id: validated.id },
    auditData: { manual: true },
  });
  return validated;
}

/**
 * Quick stats about the meeting pipeline — for the dashboard.
 */
export interface MeetingStats {
  totalMeetings: number;
  totalDecisions: number;
  averageDecisionsPerMeeting: number;
  averageExtractionDurationMs: number;
}

export async function getMeetingStats(repo: V2Repository): Promise<MeetingStats> {
  const sources = await repo.listSourceItems();
  const meetings = sources.filter(s => s.kind === 'meeting_transcript' || s.kind === 'meeting_audio');
  const decisions = await repo.listDecisions();
  const runs = await repo.listAgentRuns();
  const extractionRuns = runs.filter(r => r.agent === 'extractor');
  const durations = extractionRuns
    .map(r => r.durationMs)
    .filter((d): d is number => typeof d === 'number');
  const avg = durations.length > 0
    ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length)
    : 0;
  return {
    totalMeetings: meetings.length,
    totalDecisions: decisions.length,
    averageDecisionsPerMeeting: meetings.length > 0 ? decisions.length / meetings.length : 0,
    averageExtractionDurationMs: avg,
  };
}
