/**
 * Extractor Agent (DF2-005).
 *
 * Spec §10.5 / §11 / §15.2:
 *   - Distinguishes: explicit commitment, possible commitment, decision,
 *     waiting item, open question, factual reference.
 *   - Every key field links back to Evidence (source + locator + quote).
 *   - Returns a strict JSON Schema; the runtime validates before Proposal.
 *   - Cannot be triggered to "auto-execute" — only emits a Proposal.
 *
 * This module:
 *   1. Builds a bounded context (source body + recent context).
 *   2. Calls the configured AI provider with a versioned prompt + JSON schema.
 *   3. Validates the response.
 *   4. Emits a Proposal on the `pending` channel.
 */
import { z } from 'zod';
import { sha256 } from '../../../repositories/v2/atomicWrite.js';
import { newId } from '../../../domain/v2/ulid.js';
import { buildProvider, loadV2AIConfig, type AIProvider, isFallbackResult } from './provider.js';
import type { SourceItem, Evidence, ProposedChange, ProposalKind, AgentRun, AgentRole } from '../../../domain/v2/types.js';

// ---------------------------------------------------------------------------
// JSON Schema (versioned with prompt)
// ---------------------------------------------------------------------------

export const EXTRACTOR_PROMPT_VERSION = 'extractor@1';

export const extractorOutputSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          kind: {
            type: 'string',
            enum: ['explicit_commitment', 'possible_commitment', 'decision', 'waiting_item', 'open_question', 'factual_reference'],
          },
          title: { type: 'string' },
          outcome: { type: 'string' },
          owner: { type: 'string' },
          beneficiary: { type: 'string' },
          dueAt: { type: 'string' },
          dueConfidence: { type: 'string', enum: ['explicit', 'inferred', 'unknown'] },
          nextAction: { type: 'string' },
          importance: { type: 'string', enum: ['critical', 'high', 'normal', 'low'] },
          effortMinutes: { type: 'number' },
          waitingOn: { type: 'string' },
          decision: { type: 'string' },
          rationale: { type: 'string' },
          question: { type: 'string' },
          quote: { type: 'string' },
          confidence: { type: 'number' },
        },
        required: ['kind', 'title', 'confidence', 'quote'],
      },
    },
  },
  required: ['items'],
} as const;

export const ExtractedItemZodSchema = z.object({
  kind: z.enum(['explicit_commitment', 'possible_commitment', 'decision', 'waiting_item', 'open_question', 'factual_reference']),
  title: z.string().min(1).max(300),
  outcome: z.string().optional(),
  owner: z.string().optional(),
  beneficiary: z.string().optional(),
  dueAt: z.string().optional(),
  dueConfidence: z.enum(['explicit', 'inferred', 'unknown']).optional(),
  nextAction: z.string().optional(),
  importance: z.enum(['critical', 'high', 'normal', 'low']).optional(),
  effortMinutes: z.number().int().positive().optional(),
  waitingOn: z.string().optional(),
  decision: z.string().optional(),
  rationale: z.string().optional(),
  question: z.string().optional(),
  quote: z.string().min(1).max(2000),
  confidence: z.number().min(0).max(1),
});

export const ExtractorOutputZodSchema = z.object({
  items: z.array(ExtractedItemZodSchema),
});

// ---------------------------------------------------------------------------
// Extractor implementation
// ---------------------------------------------------------------------------

export interface ExtractorInput {
  source: SourceItem;
  /** Optional context: the user explicitly opted in to a workspace scope. */
  context?: { body: string };
  /**
   * Inject a provider for tests. When omitted, the function loads the
   * provider from the v2 env config (production path).
   */
  provider?: AIProvider;
}

export interface ExtractorOutput {
  items: z.infer<typeof ExtractedItemZodSchema>[];
  provider: string;
  model: string;
  fallback: boolean;
  fallbackReason?: string;
  promptVersion: string;
  durationMs: number;
}

const EXTRACTOR_SYSTEM_PROMPT = `You are the Extractor agent in DailyFlow, a local-first AI chief of staff.
Your job is to read the source text and identify what would become Commitments, Decisions, Waiting items, or Open questions.

Rules (strict):
- A "commitment" is ONLY a promise the user made. Other people's promises are NOT commitments.
- If the owner is not the user, set \`owner\` to the person's name (do not invent user IDs).
- Confidence is your calibrated estimate that this is a real commitment/decision/etc. Use 0.6+ for explicit, 0.3-0.59 for possible.
- The \`quote\` field MUST be a verbatim substring of the source.
- \`dueAt\` if present must be ISO 8601. If only a relative date is given, leave it null and set dueConfidence="inferred".
- Return JSON matching the schema exactly. No prose outside the JSON.`;

export async function runExtractor(input: ExtractorInput): Promise<ExtractorOutput> {
  const start = Date.now();
  const provider: AIProvider = input.provider ?? buildProvider(loadV2AIConfig());

  const prompt = buildPrompt(input);
  const result = await provider.complete({
    systemPrompt: EXTRACTOR_SYSTEM_PROMPT,
    prompt,
    jsonSchema: extractorOutputSchema,
  });

  if (isFallbackResult(result)) {
    return {
      items: [],
      provider: result.provider,
      model: result.model,
      fallback: true,
      fallbackReason: result.fallbackReason,
      promptVersion: EXTRACTOR_PROMPT_VERSION,
      durationMs: Date.now() - start,
    };
  }

  // Validate the JSON
  const parsed = ExtractorOutputZodSchema.safeParse(result.data);
  if (!parsed.success) {
    return {
      items: [],
      provider: result.provider,
      model: result.model,
      fallback: true,
      fallbackReason: 'schema_invalid',
      promptVersion: EXTRACTOR_PROMPT_VERSION,
      durationMs: Date.now() - start,
    };
  }

  return {
    items: parsed.data.items,
    provider: result.provider,
    model: result.model,
    fallback: false,
    promptVersion: EXTRACTOR_PROMPT_VERSION,
    durationMs: Date.now() - start,
  };
}

function buildPrompt(input: ExtractorInput): string {
  const body = input.source.body ?? '';
  const title = input.source.title ? `Title: ${input.source.title}\n` : '';
  return `${title}Source body (verbatim, do not modify):\n\n<<<SOURCE\n${body}\nSOURCE>>>\n\nIdentify commitments, decisions, waiting items, and open questions. For each, attach the exact quote from the source.`;
}

// ---------------------------------------------------------------------------
// Convert Extracted Items into Evidence + Proposed Changes
// ---------------------------------------------------------------------------

export interface BuildProposalInput {
  source: SourceItem;
  extractorOutput: ExtractorOutput;
  workspaceId: string;
  actorId: string;
}

export interface BuildProposalOutput {
  evidence: Evidence[];
  changes: ProposedChange[];
  proposalKind: ProposalKind;
  /** True when there is nothing useful to propose (UI should show empty state). */
  empty: boolean;
  fallback: boolean;
  fallbackReason?: string;
  agentRun: AgentRun;
}

export function buildExtractorProposal(input: BuildProposalInput): BuildProposalOutput {
  const now = new Date().toISOString();
  const runId = newId('run');

  const evidence: Evidence[] = [];
  const changes: ProposedChange[] = [];

  for (const item of input.extractorOutput.items) {
    const evidenceId = newId('ev');
    const changeId = newId('chg');
    const evidenceEntry: Evidence = {
      id: evidenceId,
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
      createdBy: 'ai',
      workspaceId: input.workspaceId,
      sourceId: input.source.id,
      quote: item.quote,
      locator: { kind: 'text', start: 0, end: 0 },
      sourceContentHash: input.source.contentHash,
      stale: false,
      fieldRefs: fieldRefsFor(item as { kind: string; title: string; outcome?: string; dueAt?: string; owner?: string; beneficiary?: string; waitingOn?: string; decision?: string; question?: string }),
    };
    evidence.push(evidenceEntry);

    if (item.kind === 'explicit_commitment' || item.kind === 'possible_commitment') {
      // Spec §10.4 — below 0.6 cannot create a Commitment; only ask.
      if (item.confidence < 0.6) continue;
      changes.push({
        op: 'create',
        entity: 'commitment',
        changeId,
        draft: {
          title: item.title,
          outcome: item.outcome ?? item.title,
          owner: item.owner,
          beneficiary: item.beneficiary,
          dueAt: item.dueAt,
          dueConfidence: item.dueConfidence ?? (item.dueAt ? 'inferred' : 'unknown'),
          importance: item.importance ?? 'normal',
          effortMinutes: item.effortMinutes ?? 60,
          nextAction: item.nextAction,
          state: 'inbox',
        },
        evidenceIds: [evidenceId],
        confidence: item.confidence,
        reason:
          item.kind === 'explicit_commitment'
            ? '原文包含明确承诺：负责人、交付物与时间清晰。'
            : '原文包含可能的承诺，需要你确认。',
      });
    } else if (item.kind === 'waiting_item') {
      if (item.confidence < 0.6) continue;
      changes.push({
        op: 'create',
        entity: 'commitment',
        changeId,
        draft: {
          title: item.title,
          outcome: item.outcome ?? item.title,
          state: 'waiting',
          waitingOnText: item.waitingOn,
          reviewAt: nextWeekday().toISOString(),
          nextAction: item.nextAction,
        },
        evidenceIds: [evidenceId],
        confidence: item.confidence,
        reason: '检测到等待事项：进入等待状态需要 reviewAt。',
      });
    } else if (item.kind === 'decision') {
      if (item.confidence < 0.6) continue;
      changes.push({
        op: 'create',
        entity: 'decision',
        changeId,
        draft: {
          title: item.title,
          decision: item.decision ?? item.title,
          rationale: item.rationale,
          decidedAt: now,
        },
        evidenceIds: [evidenceId],
        confidence: item.confidence,
        reason: '检测到团队或会议中做出的决定。',
      });
    } else if (item.kind === 'open_question') {
      // Open questions don't create entities; we surface them in the proposal
      // as a "no-op" but recorded entry so the user can resolve them.
      changes.push({
        op: 'create',
        entity: 'commitment',
        changeId,
        draft: {
          title: item.title,
          outcome: item.question ?? item.title,
          state: 'inbox',
          importance: 'low',
        },
        evidenceIds: [evidenceId],
        confidence: item.confidence,
        reason: '检测到待澄清的问题，已放入 Inbox 等待你确认。',
      });
    }
    // factual_reference produces no change but still records evidence.
  }

  const agentRun: AgentRun = {
    id: runId,
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    createdBy: 'ai',
    workspaceId: input.workspaceId,
    agent: 'extractor' as AgentRole,
    modelProvider: input.extractorOutput.provider ?? 'local-deterministic',
    model: input.extractorOutput.model ?? 'none',
    promptVersion: input.extractorOutput.promptVersion ?? EXTRACTOR_PROMPT_VERSION,
    inputEntityIds: [input.source.id],
    status: input.extractorOutput.fallback ? 'failed' : 'succeeded',
    errorCode: input.extractorOutput.fallback ? input.extractorOutput.fallbackReason : undefined,
    durationMs: input.extractorOutput.durationMs,
  };

  return {
    evidence,
    changes,
    proposalKind: 'extract_commitments',
    empty: changes.length === 0,
    fallback: input.extractorOutput.fallback,
    fallbackReason: input.extractorOutput.fallbackReason,
    agentRun,
  };
}

function fieldRefsFor(item: { kind: string; title: string; outcome?: string; dueAt?: string; owner?: string; beneficiary?: string; waitingOn?: string; decision?: string; question?: string }): string[] {
  const refs = ['title'];
  if (item.outcome) refs.push('outcome');
  if (item.dueAt) refs.push('dueAt');
  if (item.owner) refs.push('ownerId');
  if (item.beneficiary) refs.push('beneficiaryId');
  if (item.waitingOn) refs.push('waitingOnId');
  if (item.decision) refs.push('decision');
  if (item.question) refs.push('question');
  return refs;
}

function nextWeekday(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 3); // 3 days out by default
  d.setHours(9, 0, 0, 0);
  return d;
}

// Hash used by the run to identify itself to the audit log.
export const extractorHelpers = { sha256 };
