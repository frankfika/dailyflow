import { describe, expect, it } from 'vitest';
import { EVENT_OPERATOR_GOLDEN_FIXTURES } from '../fixtures/eventOperatorGoldenFixtures';
import { evaluateEventOperatorGolden } from '../eventOperatorGoldenEvaluator';

describe('DFH-801 Event Operator golden dataset', () => {
  it('contains exactly the ten required de-identified semantic scenarios', () => {
    expect(EVENT_OPERATOR_GOLDEN_FIXTURES).toHaveLength(10);
    expect(new Set(EVENT_OPERATOR_GOLDEN_FIXTURES.map((fixture) => fixture.scenario))).toEqual(new Set([
      'simple_task_extraction',
      'existing_task_update',
      'explicit_decision',
      'waiting_review',
      'duplicate_commitment',
      'insufficient_evidence',
      'conflicting_deadline',
      'outcome_closure',
      'large_mindmap_pagination',
      'stale_after_user_edit',
    ]));
    expect(EVENT_OPERATOR_GOLDEN_FIXTURES.every((fixture) =>
      fixture.criteria.allowedOps.length > 0
      && fixture.criteria.forbiddenOps.length > 0
      && fixture.criteria.minimumEvidencePerDomainOperation >= 0,
    )).toBe(true);
  });

  it.each(EVENT_OPERATOR_GOLDEN_FIXTURES.map((fixture) => [fixture.id, fixture] as const))(
    '%s passes deterministic semantic evaluation',
    (_id, fixture) => {
      const result = evaluateEventOperatorGolden(fixture);
      expect(result.failures).toEqual([]);
      expect(result.passed).toBe(true);
      if (fixture.scenario === 'large_mindmap_pagination') expect(result.pageCount).toBe(3);
    },
  );

  it('detects duplicate commitments without depending on exact generated prose', () => {
    const base = EVENT_OPERATOR_GOLDEN_FIXTURES.find((fixture) => fixture.scenario === 'duplicate_commitment')!;
    const malicious = structuredClone(base);
    malicious.proposal.operations = [{
      changeId: 'duplicate-create',
      op: 'add_node',
      tempId: 'duplicate-temp',
      parentId: malicious.snapshot.nodes[0]!.id,
      node: { kind: 'task', text: '发送确认函' },
      domainDraft: { entity: 'commitment', title: ' 发送确认函 ', state: 'active' },
      evidenceIds: [...malicious.snapshot.knownEvidenceIds],
      confidence: 0.9,
      reason: '不应重复创建',
    }];
    const result = evaluateEventOperatorGolden(malicious);
    expect(result.passed).toBe(false);
    expect(result.failures).toContain('operation add_node is not allowed');
    expect(result.failures).toContain('duplicate-create duplicates an existing commitment');
  });

  it('rejects a factual domain operation when its minimum Evidence is removed', () => {
    const base = EVENT_OPERATOR_GOLDEN_FIXTURES.find((fixture) => fixture.scenario === 'explicit_decision')!;
    const unsupported = structuredClone(base);
    const operation = unsupported.proposal.operations[0];
    if (operation?.op === 'add_node') operation.evidenceIds = [];
    const result = evaluateEventOperatorGolden(unsupported);
    expect(result.passed).toBe(false);
    expect(result.failures).toEqual(expect.arrayContaining([
      'validator:EVIDENCE_REQUIRED',
      'change_decision has insufficient evidence',
    ]));
  });
});
