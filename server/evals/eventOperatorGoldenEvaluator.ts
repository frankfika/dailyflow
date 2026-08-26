import { GraphOperationSchema, type GraphOperation } from '../domain/v2/eventOperator.js';
import { buildGraphApplyPlan } from '../domain/v2/eventGraphApplier.js';
import { validateGraphProposal } from '../domain/v2/eventGraphValidator.js';
import type { EventOperatorGoldenFixture } from './fixtures/eventOperatorGoldenFixtures.js';

export interface GoldenEvaluation {
  passed: boolean;
  failures: string[];
  operationCounts: Record<string, number>;
  pageCount?: number;
}

function domainEntity(op: GraphOperation): string | undefined {
  return op.op === 'add_node' ? op.domainDraft?.entity : undefined;
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

/** Semantic evaluator: it deliberately never asserts exact model prose. */
export function evaluateEventOperatorGolden(fixture: EventOperatorGoldenFixture): GoldenEvaluation {
  const failures: string[] = [];
  const operations = fixture.proposal.operations.map((operation, index) => {
    const parsed = GraphOperationSchema.safeParse(operation);
    if (!parsed.success) failures.push(`operation[${index}] is schema-invalid`);
    return parsed.success ? parsed.data : operation;
  });
  const validation = validateGraphProposal(fixture.proposal, fixture.snapshot);
  for (const issue of validation.issues) failures.push(`validator:${issue.code}`);

  const allowed = new Set<string>(fixture.criteria.allowedOps);
  const forbidden = new Set(fixture.criteria.forbiddenOps);
  const operationCounts: Record<string, number> = {};
  for (const operation of operations) {
    operationCounts[operation.op] = (operationCounts[operation.op] ?? 0) + 1;
    if (!allowed.has(operation.op)) failures.push(`operation ${operation.op} is not allowed`);
    if (forbidden.has(operation.op)) failures.push(`operation ${operation.op} is forbidden`);
    const entity = domainEntity(operation);
    if (entity && entity !== 'none') {
      const evidenceCount = operation.op === 'add_node' ? operation.evidenceIds.length : 0;
      if (evidenceCount < fixture.criteria.minimumEvidencePerDomainOperation) {
        failures.push(`${operation.changeId} has insufficient evidence`);
      }
    }
    if (entity && fixture.criteria.forbiddenDomainEntities?.includes(entity)) {
      failures.push(`${operation.changeId} creates forbidden domain entity ${entity}`);
    }
    if (operation.op === 'add_node' && entity === 'commitment' && fixture.criteria.forbidDuplicateCommitmentTitle) {
      const title = normalized(operation.domainDraft?.title ?? operation.node.text);
      if (fixture.existingCommitments?.some((item) => normalized(item.title) === title)) {
        failures.push(`${operation.changeId} duplicates an existing commitment`);
      }
    }
    if (operation.op === 'add_node' && entity === 'commitment' && fixture.criteria.forbidConflictingDeadline) {
      const title = normalized(operation.domainDraft?.title ?? operation.node.text);
      const existing = fixture.existingCommitments?.find((item) => normalized(item.title) === title);
      if (existing?.dueAt && operation.domainDraft?.dueAt && existing.dueAt !== operation.domainDraft.dueAt) {
        failures.push(`${operation.changeId} overwrites a conflicting deadline`);
      }
    }
  }

  for (const kind of fixture.criteria.requiredNodeKinds ?? []) {
    if (!operations.some((operation) => operation.op === 'add_node' && operation.node.kind === kind)) {
      failures.push(`required node kind ${kind} is missing`);
    }
  }

  const currentSnapshot = fixture.currentSnapshot ?? fixture.snapshot;
  const plan = buildGraphApplyPlan(fixture.proposal, currentSnapshot, undefined, undefined);
  const isStale = plan.staleChangeIds.length === fixture.proposal.operations.length && plan.staleChangeIds.length > 0;
  if (fixture.criteria.expectedStale === true && !isStale) failures.push('proposal should be stale');
  if (fixture.criteria.expectedStale !== true && plan.staleChangeIds.length > 0) failures.push('proposal unexpectedly stale');

  let pageCount: number | undefined;
  if (fixture.criteria.pageSize) {
    const ids = fixture.snapshot.nodes.map((node) => node.id).sort();
    const pages = paginate(ids, fixture.criteria.pageSize);
    pageCount = pages.length;
    const replayed = pages.flat();
    if (new Set(replayed).size !== ids.length || replayed.length !== ids.length) failures.push('pagination lost or duplicated nodes');
    if (pageCount < (fixture.criteria.minimumPageCount ?? 1)) failures.push('pagination did not exercise enough pages');
  }

  return { passed: failures.length === 0, failures, operationCounts, pageCount };
}

export function paginate<T>(items: readonly T[], pageSize: number): T[][] {
  if (!Number.isInteger(pageSize) || pageSize <= 0) throw new Error('pageSize must be a positive integer');
  const pages: T[][] = [];
  for (let cursor = 0; cursor < items.length; cursor += pageSize) pages.push(items.slice(cursor, cursor + pageSize));
  return pages;
}
