/**
 * Markdown serializer for v2 entities.
 *
 * Each entity becomes a single .md file with:
 *   - YAML frontmatter (parsed by `gray-matter` style; we keep it minimal and
 *     roll our own parser to avoid a heavy dependency).
 *   - Human-readable body (spec §12.3 example).
 *
 * The serializer is the **only** place that decides what a v2 markdown file
 * looks like. Tests pin the format and round-trip fidelity.
 */
import type {
  Commitment,
  SourceItem,
  Evidence,
  NoteDocument,
  Outcome,
  Project,
  Person,
  Organization,
  Decision,
  DailyPlan,
  Proposal,
  AgentRun,
} from '../../domain/v2/types.js';

interface Frontmatter {
  type: string;
  schema_version: number;
  id: string;
  [k: string]: unknown;
}

function yamlString(v: string | undefined | null): string {
  if (v === undefined || v === null) return '';
  // YAML-friendly: collapse newlines, escape double quotes.
  return `"${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')}"`;
}

function yamlList(values: string[] | undefined): string {
  if (!values || values.length === 0) return '[]';
  return '[' + values.map(v => yamlString(v)).join(', ') + ']';
}

function toYaml(meta: Frontmatter, body: string): string {
  const lines: string[] = ['---'];
  for (const [key, value] of Object.entries(meta)) {
    if (value === undefined) continue;
    if (value === '') continue; // empty string = not set
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
        continue;
      }
      // If all entries are primitive, use the inline list form. Otherwise
      // encode the array as a JSON string for lossless round-trip.
      const allPrimitive = value.every(v => v === null || ['string', 'number', 'boolean'].includes(typeof v));
      if (allPrimitive) {
        lines.push(`${key}: ${yamlList(value as string[])}`);
      } else {
        lines.push(`${key}: ${yamlString(JSON.stringify(value))}`);
      }
    } else if (typeof value === 'object' && value !== null) {
      lines.push(`${key}:`);
      for (const [k2, v2] of Object.entries(value as Record<string, unknown>)) {
        lines.push(`  ${k2}: ${yamlString(typeof v2 === 'string' ? v2 : JSON.stringify(v2))}`);
      }
    } else if (typeof value === 'string') {
      lines.push(`${key}: ${yamlString(value)}`);
    } else {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    }
  }
  lines.push('---', '');
  return lines.join('\n') + body;
}

export function serializeSourceItem(s: SourceItem): string {
  const meta: Frontmatter = {
    type: 'source',
    schema_version: 1,
    id: s.id,
    workspace_id: s.workspaceId,
    kind: s.kind,
    title: s.title ?? '',
    body: s.body ?? '',
    occurred_at: s.occurredAt ?? s.createdAt,
    processing_status: s.processingStatus,
    content_hash: s.contentHash,
    sensitivity: s.sensitivity ?? 'normal',
    created_at: s.createdAt,
    updated_at: s.updatedAt,
    created_by: s.createdBy,
  };
  if (s.externalRef) {
    (meta as Record<string, unknown>).external_ref = s.externalRef;
  }
  if (s.filePath) (meta as Record<string, unknown>).file_path = s.filePath;
  if (s.meta) (meta as Record<string, unknown>).meta = s.meta;

  const body = [
    s.title ? `# ${s.title}\n` : '',
    '',
    s.body ?? '',
    '',
  ].join('\n');

  return toYaml(meta, body);
}

export function serializeCommitment(c: Commitment): string {
  const meta: Frontmatter = {
    type: 'commitment',
    schema_version: 1,
    id: c.id,
    state: c.state,
    title: c.title,
    outcome: c.outcome,
    owner: c.ownerId ?? '',
    beneficiary: c.beneficiaryId ?? '',
    project: c.projectId ?? '',
    due_at: c.dueAt ?? '',
    due_confidence: c.dueConfidence ?? '',
    importance: c.importance ?? '',
    effort_minutes: c.effortMinutes ?? '',
    energy: c.energy ?? '',
    next_action: c.nextAction ?? '',
    waiting_on_id: c.waitingOnId ?? '',
    waiting_on_text: c.waitingOnText ?? '',
    waiting_since: c.waitingSince ?? '',
    review_at: c.reviewAt ?? '',
    evidence_ids: c.evidenceIds,
    source_ids: c.sourceIds,
    tag_ids: c.tagIds ?? [],
    completed_at: c.completedAt ?? '',
    outcome_id: c.outcomeId ?? '',
    last_progress_at: c.lastProgressAt ?? '',
    legacy_task_id: c.legacyTaskId ?? '',
    workspace_id: c.workspaceId,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
    created_by: c.createdBy,
  };

  const body = [
    `# ${c.title}`,
    '',
    '## Outcome',
    '',
    c.outcome,
    '',
    c.nextAction ? '## Next Action\n\n' + c.nextAction + '\n' : '',
    c.state === 'waiting'
      ? `## Waiting\n\nOn: ${c.waitingOnId ?? c.waitingOnText ?? 'unknown'}\nSince: ${c.waitingSince ?? ''}\nReview: ${c.reviewAt ?? ''}\n`
      : '',
    c.evidenceIds.length > 0
      ? `## Evidence\n\n${c.evidenceIds.map(id => `- [[evidence:${id}]]`).join('\n')}\n`
      : '',
    c.sourceIds.length > 0
      ? `## Sources\n\n${c.sourceIds.map(id => `- [[source:${id}]]`).join('\n')}\n`
      : '',
    '## History',
    '',
    `- ${c.updatedAt}: updated`,
    c.completedAt ? `- ${c.completedAt}: completed` : '',
  ]
    .filter(Boolean)
    .join('\n') + '\n';

  return toYaml(meta, body);
}

export function serializeEvidence(e: Evidence): string {
  // Exactly one of sourceId or noteId is set (enforced by EvidenceSchema.refine).
  // We omit the absent key so the frontmatter round-trip is unambiguous.
  const meta: Frontmatter = {
    type: 'evidence',
    schema_version: 1,
    id: e.id,
    workspace_id: e.workspaceId,
    source_id: e.sourceId,
    note_id: e.noteId,
    quote: e.quote,
    locator: e.locator as unknown as Frontmatter,
    source_content_hash: e.sourceContentHash,
    stale: e.stale,
    field_refs: e.fieldRefs ?? [],
    created_at: e.createdAt,
    updated_at: e.updatedAt,
    created_by: e.createdBy,
  };
  const anchor = e.noteId ? `note:${e.noteId}` : `source:${e.sourceId}`;
  const body = `# Evidence (${anchor})\n\n> ${e.quote.replace(/\n/g, '\n> ')}\n`;
  return toYaml(meta, body);
}

export function serializeOutcome(o: Outcome): string {
  const meta: Frontmatter = {
    type: 'outcome',
    schema_version: 1,
    id: o.id,
    workspace_id: o.workspaceId,
    commitment_id: o.commitmentId,
    kind: o.kind,
    summary: o.summary,
    evidence_ids: o.evidenceIds,
    follow_up_commitment_ids: o.followUpCommitmentIds,
    created_at: o.createdAt,
    updated_at: o.updatedAt,
    created_by: o.createdBy,
  };
  const body = `# Outcome (${o.kind})\n\n${o.summary}\n`;
  return toYaml(meta, body);
}

export function serializeProject(p: Project): string {
  const meta: Frontmatter = {
    type: 'project',
    schema_version: 1,
    id: p.id,
    workspace_id: p.workspaceId,
    name: p.name,
    objective: p.objective,
    state: p.state,
    success_criteria: p.successCriteria,
    owner: p.ownerId ?? '',
    target_at: p.targetAt ?? '',
    commitment_ids: p.commitmentIds,
    decision_ids: p.decisionIds,
    source_ids: p.sourceIds,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
    created_by: p.createdBy,
  };
  const body = `# ${p.name}\n\n## Objective\n\n${p.objective}\n\n## Success Criteria\n\n${p.successCriteria
    .map(c => `- ${c}`)
    .join('\n')}\n`;
  return toYaml(meta, body);
}

export function serializePerson(p: Person): string {
  const meta: Frontmatter = {
    type: 'person',
    schema_version: 1,
    id: p.id,
    workspace_id: p.workspaceId,
    display_name: p.displayName,
    aliases: p.aliases,
    organization: p.organizationId ?? '',
    external_refs: p.externalRefs ?? [],
    relationship_notes: p.relationshipNotes ?? '',
    created_at: p.createdAt,
    updated_at: p.updatedAt,
    created_by: p.createdBy,
  };
  const body = `# ${p.displayName}\n\n${p.relationshipNotes ?? ''}\n`;
  return toYaml(meta, body);
}

export function serializeOrganization(o: Organization): string {
  const meta: Frontmatter = {
    type: 'organization',
    schema_version: 1,
    id: o.id,
    workspace_id: o.workspaceId,
    name: o.name,
    aliases: o.aliases,
    created_at: o.createdAt,
    updated_at: o.updatedAt,
    created_by: o.createdBy,
  };
  const body = `# ${o.name}\n`;
  return toYaml(meta, body);
}

export function serializeDecision(d: Decision): string {
  const meta: Frontmatter = {
    type: 'decision',
    schema_version: 1,
    id: d.id,
    workspace_id: d.workspaceId,
    title: d.title,
    decision: d.decision,
    rationale: d.rationale ?? '',
    decided_at: d.decidedAt,
    participant_ids: d.participantIds,
    project: d.projectId ?? '',
    evidence_ids: d.evidenceIds,
    supersedes: d.supersedesId ?? '',
    created_at: d.createdAt,
    updated_at: d.updatedAt,
    created_by: d.createdBy,
  };
  const body = `# ${d.title}\n\n**Decision:** ${d.decision}\n${d.rationale ? `\n**Rationale:** ${d.rationale}\n` : ''}\n`;
  return toYaml(meta, body);
}

export function serializeNoteDocument(n: NoteDocument): string {
  // Body is the note's authored content. We keep it OUT of the
  // frontmatter (the YAML scalar encoding collapses newlines into
  // spaces, which would silently mangle multi-paragraph notes) and
  // instead place the body in the markdown section below the
  // frontmatter. The repository's list/getNote splice it back in
  // when reading.
  const meta: Frontmatter = {
    type: 'note',
    schema_version: 1,
    id: n.id,
    workspace_id: n.workspaceId,
    title: n.title ?? '',
    kind: n.kind,
    state: n.state,
    date: n.date ?? '',
    project_ids: n.projectIds,
    person_ids: n.personIds,
    source_ids: n.sourceIds,
    pinned: n.pinned,
    last_opened_at: n.lastOpenedAt ?? '',
    auto_save_version: n.autoSaveVersion,
    content_hash: n.contentHash,
    tag_ids: n.tagIds ?? [],
    created_at: n.createdAt,
    updated_at: n.updatedAt,
    created_by: n.createdBy,
  };
  // We add a trailing newline so the markdown section ends cleanly
  // (frontmatter `---\n` followed immediately by a `body` line would
  // not parse as a separate paragraph). The reader trims the
  // trailing \n so the round-trip is lossless.
  const body = n.body.endsWith('\n') ? n.body : n.body + '\n';
  return toYaml(meta, body);
}

export function serializePlan(p: DailyPlan): string {
  const meta: Frontmatter = {
    type: 'plan',
    schema_version: 1,
    id: p.id,
    workspace_id: p.workspaceId,
    date: p.date,
    constraint_summary: p.constraintSummary ?? '',
    available_minutes: p.availableMinutes ?? '',
    superseded_by: p.supersededById ?? '',
    accepted_at: p.acceptedAt ?? '',
    items: p.items as unknown as Frontmatter,
    deferred_commitment_ids: p.deferredCommitmentIds,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
    created_by: p.createdBy,
  };
  const body = [
    `# Plan ${p.date}`,
    '',
    p.constraintSummary ? `> ${p.constraintSummary}\n` : '',
    p.availableMinutes ? `> Available: ${p.availableMinutes} min\n` : '',
    '',
    '## Focus',
    '',
    ...p.items.map(i => {
      const mins = i.plannedMinutes ? ` (${i.plannedMinutes}m)` : '';
      return `### ${i.rank}. ${i.commitmentId}${mins}\n\n- **Outcome:** ${i.intendedOutcome}\n- **Next:** ${i.suggestedNextAction}\n- **Why:** ${i.reason}\n`;
    }),
    '',
    p.deferredCommitmentIds.length > 0
      ? `## Deferred\n\n${p.deferredCommitmentIds.map(id => `- ${id}`).join('\n')}\n`
      : '',
  ].join('\n');
  return toYaml(meta, body);
}

export function serializeProposal(p: Proposal): string {
  const meta: Frontmatter = {
    type: 'proposal',
    schema_version: 1,
    id: p.id,
    workspace_id: p.workspaceId,
    kind: p.kind,
    status: p.status,
    source_ids: p.sourceIds,
    model_run_id: p.modelRunId,
    changes: p.changes as unknown as Frontmatter,
    expires_at: p.expiresAt ?? '',
    rejected_reason: p.rejectedReason ?? '',
    accepted_change_ids: p.acceptedChangeIds ?? [],
    created_at: p.createdAt,
    updated_at: p.updatedAt,
    created_by: p.createdBy,
  };
  const body = [
    `# Proposal ${p.kind}`,
    '',
    `Status: **${p.status}**`,
    '',
    p.changes
      .map((c, i) => {
        return `## Change ${i + 1} (${c.op} ${c.entity})\n\n- Confidence: ${c.confidence}\n- Reason: ${c.reason}\n- Evidence: ${c.evidenceIds.join(', ') || '—'}\n\n\`\`\`json\n${JSON.stringify(c.draft, null, 2)}\n\`\`\`\n`;
      })
      .join('\n'),
  ].join('\n');
  return toYaml(meta, body);
}

export function serializeAgentRun(r: AgentRun): string {
  // AgentRun lives in JSON, not Markdown.
  return JSON.stringify(r, null, 2);
}
