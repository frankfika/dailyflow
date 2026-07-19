import { describe, it, expect } from 'vitest';
import {
  serializeCommitment,
  serializeSourceItem,
  serializeEvidence,
  serializeOutcome,
  serializeProject,
  serializePerson,
  serializeDecision,
  serializePlan,
  serializeProposal,
} from '../markdownSerializer';
import { parseFrontmatter, snakeToCamel } from '../markdownParser';
import {
  CommitmentSchema,
  SourceItemSchema,
  EvidenceSchema,
  OutcomeSchema,
  ProjectSchema,
  PersonSchema,
  DecisionSchema,
  DailyPlanSchema,
  ProposalSchema,
} from '../../../domain/v2/types';

const baseTime = '2026-07-19T11:00:00+08:00';

describe('markdownSerializer round-trip', () => {
  it('commitment → yaml → schema', () => {
    const c = {
      id: 'com_01KAAAAAAAAAAAAAAAA',
      schemaVersion: 1 as const,
      createdAt: baseTime,
      updatedAt: baseTime,
      createdBy: 'ai' as const,
      workspaceId: 'ws_test',
      title: 'Send updated plan to Zhang',
      outcome: 'Zhang receives the updated collaboration plan with revised pricing.',
      state: 'waiting' as const,
      ownerId: 'person_self',
      beneficiaryId: 'person_zhang',
      dueAt: '2026-07-24T17:00:00+08:00',
      dueConfidence: 'explicit' as const,
      importance: 'high' as const,
      effortMinutes: 60,
      nextAction: 'Wait for Zhang to confirm direction for section 2.',
      waitingOnId: 'person_zhang',
      waitingSince: baseTime,
      reviewAt: '2026-07-22T09:00:00+08:00',
      evidenceIds: ['ev_01KAAAAAAAAAAAAAAAA'],
      sourceIds: ['src_01KAAAAAAAAAAAAAAAA'],
      tagIds: ['plan'],
    };
    const md = serializeCommitment(c);
    expect(md).toContain('---');
    expect(md).toContain('type: "commitment"');
    expect(md).toContain('id: "com_01KAAAAAAAAAAAAAAAA"');
    const { data, body } = parseFrontmatter(md);
    const parsed = CommitmentSchema.parse(snakeToCamel({ ...data, type: 'commitment' }));
    expect(parsed.id).toBe(c.id);
    expect(parsed.title).toBe(c.title);
    expect(parsed.state).toBe('waiting');
    expect(parsed.waitingOnId).toBe('person_zhang');
    expect(parsed.evidenceIds).toEqual(['ev_01KAAAAAAAAAAAAAAAA']);
    expect(body).toContain('# Send updated plan to Zhang');
    expect(body).toContain('## Outcome');
  });

  it('source item round-trip', () => {
    const s = {
      id: 'src_01KBBBBBBBBBBBBBBB',
      schemaVersion: 1 as const,
      createdAt: baseTime,
      updatedAt: baseTime,
      createdBy: 'user' as const,
      workspaceId: 'ws_test',
      kind: 'quick_capture' as const,
      title: 'Notes from Monday',
      body: 'Meeting with Zhang discussed revised pricing. Follow up by Friday.',
      occurredAt: baseTime,
      contentHash: 'abcdef1234567890',
      processingStatus: 'saved' as const,
    };
    const md = serializeSourceItem(s);
    const { data } = parseFrontmatter(md);
    const parsed = SourceItemSchema.parse(snakeToCamel({ ...data, type: 'source' }));
    expect(parsed.kind).toBe('quick_capture');
    expect(parsed.body).toContain('Follow up by Friday');
  });

  it('evidence round-trip', () => {
    const e = {
      id: 'ev_01KCCCCCCCCCCCCCCC',
      schemaVersion: 1 as const,
      createdAt: baseTime,
      updatedAt: baseTime,
      createdBy: 'ai' as const,
      workspaceId: 'ws_test',
      sourceId: 'src_01KBBBBBBBBBBBBBBB',
      quote: 'Zhang wants revised pricing by Friday.',
      locator: { kind: 'text' as const, start: 12, end: 56 },
      sourceContentHash: 'abcdef1234567890',
      stale: false,
      fieldRefs: ['title', 'dueAt'],
    };
    const md = serializeEvidence(e);
    const { data } = parseFrontmatter(md);
    const parsed = EvidenceSchema.parse(snakeToCamel({ ...data, type: 'evidence' }));
    expect(parsed.quote).toBe(e.quote);
    expect(parsed.fieldRefs).toEqual(['title', 'dueAt']);
    expect((parsed.locator as { start: number }).start).toBe(12);
  });

  it('outcome / project / person / decision / plan / proposal round-trip', () => {
    const o = {
      id: 'out_01KDDDDDDDDDDDDDDD',
      schemaVersion: 1 as const,
      createdAt: baseTime,
      updatedAt: baseTime,
      createdBy: 'user' as const,
      workspaceId: 'ws_test',
      commitmentId: 'com_01KAAAAAAAAAAAAAAAA',
      kind: 'delivered' as const,
      summary: 'Sent revised pricing to Zhang.',
      evidenceIds: [],
      followUpCommitmentIds: [],
    };
    const md1 = serializeOutcome(o);
    const parsed1 = OutcomeSchema.parse(snakeToCamel({ ...parseFrontmatter(md1).data, type: 'outcome' }));
    expect(parsed1.summary).toBe(o.summary);

    const p = {
      id: 'prj_01KEEEEEEEEEEEEEEE',
      schemaVersion: 1 as const,
      createdAt: baseTime,
      updatedAt: baseTime,
      createdBy: 'user' as const,
      workspaceId: 'ws_test',
      name: 'Zhang Partnership',
      objective: 'Close a partnership with Zhang on the Q4 launch.',
      successCriteria: ['Signed agreement', 'Joint press release'],
      state: 'active' as const,
      commitmentIds: [],
      decisionIds: [],
      sourceIds: [],
    };
    const md2 = serializeProject(p);
    const parsed2 = ProjectSchema.parse(snakeToCamel({ ...parseFrontmatter(md2).data, type: 'project' }));
    expect(parsed2.name).toBe('Zhang Partnership');

    const person = {
      id: 'per_01KFFFFFFFFFFFFFFF',
      schemaVersion: 1 as const,
      createdAt: baseTime,
      updatedAt: baseTime,
      createdBy: 'user' as const,
      workspaceId: 'ws_test',
      displayName: 'Zhang San',
      aliases: ['张总'],
    };
    const md3 = serializePerson(person);
    const parsed3 = PersonSchema.parse(snakeToCamel({ ...parseFrontmatter(md3).data, type: 'person' }));
    expect(parsed3.displayName).toBe('Zhang San');

    const dec = {
      id: 'dec_01KGGGGGGGGGGGGGGG',
      schemaVersion: 1 as const,
      createdAt: baseTime,
      updatedAt: baseTime,
      createdBy: 'ai' as const,
      workspaceId: 'ws_test',
      title: 'Use 2-tier pricing',
      decision: 'Use 2-tier pricing: standard and premium.',
      rationale: 'Simplifies sales motion and gives margin headroom.',
      decidedAt: baseTime,
      participantIds: ['per_01KFFFFFFFFFFFFFFF'],
      evidenceIds: ['ev_01KCCCCCCCCCCCCCCC'],
    };
    const md4 = serializeDecision(dec);
    const parsed4 = DecisionSchema.parse(snakeToCamel({ ...parseFrontmatter(md4).data, type: 'decision' }));
    expect(parsed4.decision).toContain('2-tier');

    const plan = {
      id: 'plan_01KHHHHHHHHHHHHHH',
      schemaVersion: 1 as const,
      createdAt: baseTime,
      updatedAt: baseTime,
      createdBy: 'ai' as const,
      workspaceId: 'ws_test',
      date: '2026-07-20',
      constraintSummary: 'Only 2 hours in the afternoon.',
      availableMinutes: 120,
      items: [
        {
          commitmentId: 'com_01KAAAAAAAAAAAAAAAA',
          intendedOutcome: 'Zhang receives updated plan.',
          suggestedNextAction: 'Send updated plan by email.',
          plannedMinutes: 60,
          reason: 'due in 5d, high importance',
          rank: 1,
        },
      ],
      deferredCommitmentIds: [],
    };
    const md5 = serializePlan(plan);
    const parsed5 = DailyPlanSchema.parse(snakeToCamel({ ...parseFrontmatter(md5).data, type: 'plan' }));
    expect(parsed5.items[0]!.rank).toBe(1);

    const prop = {
      id: 'prop_01KIIIIIIIIIIIIII',
      schemaVersion: 1 as const,
      createdAt: baseTime,
      updatedAt: baseTime,
      createdBy: 'ai' as const,
      workspaceId: 'ws_test',
      kind: 'extract_commitments' as const,
      status: 'pending' as const,
      sourceIds: ['src_01KBBBBBBBBBBBBBBB'],
      changes: [
        {
          op: 'create' as const,
          entity: 'commitment' as const,
          changeId: 'chg_01',
          draft: { title: 'Send updated plan' },
          evidenceIds: ['ev_01KCCCCCCCCCCCCCCC'],
          confidence: 0.91,
          reason: 'explicit commitment with owner and due date',
        },
      ],
      modelRunId: 'run_01',
    };
    const md6 = serializeProposal(prop);
    const parsed6 = ProposalSchema.parse(snakeToCamel({ ...parseFrontmatter(md6).data, type: 'proposal' }));
    expect(parsed6.changes[0]!.confidence).toBe(0.91);
  });

  it('rejects malformed frontmatter at load time', () => {
    const md = `---
type: commitment
schema_version: 1
id: com_01
title: ""
---
`;
    const { data } = parseFrontmatter(md);
    expect(() => CommitmentSchema.parse(snakeToCamel({ ...data, type: 'commitment' }))).toThrow();
  });
});
