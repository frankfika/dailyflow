import { z } from 'zod';
import { newId } from '../../domain/v2/ulid.js';
import {
  AgentDefinitionSchema,
  AgentRunSchema,
  type AgentDefinition,
  type AgentRun,
} from '../../domain/v2/types.js';
import type { V2Repository } from '../../repositories/v2/repository.js';

/** Built-in manifest. It describes future Chat-agent work; it never transcribes audio. */
export const MEETING_NOTES_AGENT: AgentDefinition = AgentDefinitionSchema.parse({
  id: 'meeting-notes@1',
  name: 'Meeting Notes',
  description: 'Turn a meeting Note and its transcript into reviewable minutes, decisions, and action items.',
  version: '1.0.0',
  acceptedInputs: ['note', 'meeting_transcript', 'source'],
  capabilities: ['summarize', 'rewrite', 'extract_tasks', 'extract_decisions'],
  permissions: ['read_note', 'read_sources', 'update_note', 'create_tasks'],
  modelRequirements: { type: 'chat', supportsLocal: true, supportsRemote: true },
});

export const AgentInvocationInputSchema = z.object({
  agentId: z.string().default(MEETING_NOTES_AGENT.id),
  noteId: z.string().min(1),
  sourceIds: z.array(z.string()).optional(),
});
export type AgentInvocationInput = z.infer<typeof AgentInvocationInputSchema>;

export function listAgentDefinitions(): AgentDefinition[] {
  return [MEETING_NOTES_AGENT];
}

/**
 * Creates an auditable run context only. The future agent worker will consume
 * this run and write a proposal/result; no summary is generated here.
 */
export async function startAgentRun(
  repo: V2Repository,
  workspaceId: string,
  input: AgentInvocationInput,
): Promise<AgentRun> {
  const agentId = input.agentId ?? MEETING_NOTES_AGENT.id;
  const definition = listAgentDefinitions().find(item => item.id === agentId);
  if (!definition) throw new Error(`Unknown agent definition: ${agentId}`);
  const note = await repo.getNoteDocument(input.noteId);
  if (!note) throw new Error('Note not found');
  if (note.workspaceId !== workspaceId) throw new Error('Note workspace mismatch');
  if (note.kind !== 'meeting') throw new Error('Meeting Notes agent requires a meeting note');
  const sourceIds = input.sourceIds ?? note.sourceIds;
  const run = AgentRunSchema.parse({
    id: newId('run'), schemaVersion: 1, createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(), createdBy: 'user', workspaceId,
    agent: 'meeting_notes', agentDefinitionId: definition.id,
    modelProvider: 'pending', model: 'pending', promptVersion: `${definition.id}/pending`,
    inputEntityIds: [note.id, ...sourceIds], status: 'running',
    result: { state: 'awaiting_agent_runtime', noteId: note.id, sourceIds },
  });
  await repo.saveAgentRun(run, {
    auditKind: 'process', auditEntity: { type: 'run', id: run.id },
    auditData: { agentDefinitionId: definition.id, noteId: note.id, sourceIds },
  });
  return run;
}
