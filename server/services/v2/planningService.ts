/**
 * Planning service (DF2-009).
 *
 * The Planner produces a DailyPlan:
 *   - Filters out Waiting / Completed / Cancelled.
 *   - Caps at 1–3 items by default; respects availableMinutes.
 *   - Each item carries a reason and a suggested next action.
 *   - A natural-language brief ("only 2 hours in the afternoon") is parsed
 *     into constraints.
 *
 * The deterministic planner (the default) is rule-based and works without
 * an AI provider. The model-powered variant delegates ranking to the
 * configured provider but always runs the rule-based filter first (spec
 * §15.3 "规则引擎先过滤不可执行项，模型不得把 Waiting 或缺少必要前置条件
 * 的事项排入 Today").
 */
import { z } from 'zod';
import { newId } from '../../domain/v2/ulid.js';
import { rankCandidates, pickTopCandidates, validatePlan } from '../../domain/v2/rules.js';
import {
  DailyPlanSchema,
  type Commitment,
  type DailyPlan,
  type DailyPlanItem,
  CommitmentSchema,
} from '../../domain/v2/types.js';
import { V2Repository } from '../../repositories/v2/repository.js';
import { getV2Flags } from './featureFlags.js';

export const PlanConstraintsSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  availableMinutes: z.number().int().nonnegative().max(60 * 24).optional(),
  maxItems: z.number().int().positive().max(10).optional(),
  brief: z.string().max(500).optional(),
});
export type PlanConstraints = z.infer<typeof PlanConstraintsSchema>;

export async function generatePlan(
  repo: V2Repository,
  workspaceId: string,
  constraints: PlanConstraints
): Promise<{ plan: DailyPlan; rejected: { id: string; reason: string }[] }> {
  const flags = await getV2Flags();
  const now = new Date(constraints.date + 'T00:00:00');
  const allCommitments = await repo.listCommitments();

  // Rule-based pre-filter (spec §15.3)
  const open = allCommitments.filter(
    c => c.state !== 'waiting' && c.state !== 'completed' && c.state !== 'cancelled' && c.state !== 'archived'
  );

  // Build blockedIds from waiting items (they become blocked for their dependents).
  const waitingIds = new Set(allCommitments.filter(c => c.state === 'waiting').map(c => c.id));

  const constraints2 = parseBrief(constraints.brief, constraints);
  const candidates = rankCandidates(open, {
    availableMinutes: constraints2.availableMinutes,
    now,
    blockedIds: waitingIds,
  });

  const items = pickTopCandidates(candidates, {
    availableMinutes: constraints2.availableMinutes ?? 480,
    maxItems: constraints2.maxItems ?? 3,
  });

  const deferredIds = open
    .filter(c => !items.find(i => i.commitmentId === c.id))
    .map(c => c.id);

  const plan: DailyPlan = {
    id: newId('plan'),
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: 'ai',
    workspaceId,
    date: constraints2.date,
    constraintSummary: constraints.brief,
    availableMinutes: constraints2.availableMinutes,
    items,
    deferredCommitmentIds: deferredIds,
  };

  const issues = validatePlan(plan, allCommitments);
  const rejected: { id: string; reason: string }[] = [];
  for (const it of issues) {
    if (it.code === 'plan_includes_waiting' || it.code === 'plan_includes_terminal') {
      // Should not happen because of the pre-filter, but if it does, surface it.
      rejected.push({ id: it.field ?? '?', reason: it.message });
    }
  }

  void flags;

  // Persist the plan so the UI can reload by date. We save before returning
  // so the route layer doesn't have to remember to.
  const validated = DailyPlanSchema.parse(plan);
  await repo.savePlan(validated, {
    auditKind: 'plan.create',
    auditEntity: { type: 'plan', id: validated.id },
    auditData: { date: validated.date, itemCount: validated.items.length, availableMinutes: validated.availableMinutes },
  });

  return { plan: validated, rejected };
}

export async function acceptPlan(repo: V2Repository, planId: string, expectedHash?: string): Promise<DailyPlan> {
  // Find the plan file on disk by scanning Plans/ and parsing each one.
  const layout = repo.layout;
  const fs = await import('fs/promises');
  const path = await import('path');
  const files: string[] = [];
  async function walk(d: string): Promise<void> {
    try {
      const ents = await fs.readdir(d, { withFileTypes: true });
      for (const e of ents) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) await walk(full);
        else if (e.isFile() && e.name.endsWith('.md')) files.push(full);
      }
    } catch {
      /* ignore */
    }
  }
  await walk(layout.plans);

  for (const f of files) {
    try {
      const date = path.basename(f, '.md');
      const existing = await repo.getPlanByDate(date);
      if (!existing || existing.id !== planId) continue;
      const updated = { ...existing, acceptedAt: new Date().toISOString() };
      await repo.savePlan(updated, { expectedHash, auditKind: 'plan.accept' });
      return updated;
    } catch {
      /* keep walking */
    }
  }
  throw new Error('Plan not found');
}

function parseBrief(brief: string | undefined, base: PlanConstraints): PlanConstraints {
  if (!brief) return base;
  const lower = brief.toLowerCase();
  let available = base.availableMinutes;
  let maxItems = base.maxItems;

  const hours = lower.match(/(\d+(?:\.\d+)?)\s*(?:小时|hours?|h)\b/);
  if (hours) available = Math.round(parseFloat(hours[1]!) * 60);

  if (lower.includes('只') || lower.includes('only')) {
    const m = lower.match(/(?:只|only)\s*(\d+)/);
    if (m) maxItems = Math.min(parseInt(m[1]!, 10), 5);
  }
  if (lower.includes('下午') || lower.includes('afternoon')) {
    available = Math.min(available ?? 240, 240);
  }

  return { ...base, availableMinutes: available, maxItems };
}
