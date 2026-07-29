import { describe, expect, it, vi } from 'vitest';
import { listAgentDefinitions, startAgentRun } from '../agentService.js';

describe('agentService', () => {
  it('exposes a meeting notes manifest without coupling to transcription', () => {
    const [agent] = listAgentDefinitions();
    expect(agent.id).toBe('meeting-notes@1');
    expect(agent.acceptedInputs).toContain('meeting_transcript');
    expect(agent.capabilities).toContain('summarize');
    expect(agent.modelRequirements.type).toBe('chat');
  });

  it('creates an auditable pending runtime context for a meeting note', async () => {
    const note = {
      id: 'note_123456', workspaceId: 'ws', kind: 'meeting', sourceIds: ['src_123456'],
    };
    const saveAgentRun = vi.fn().mockResolvedValue(undefined);
    const repo = { getNoteDocument: vi.fn().mockResolvedValue(note), saveAgentRun } as any;
    const run = await startAgentRun(repo, 'ws', { noteId: note.id });
    expect(run.agent).toBe('meeting_notes');
    expect(run.status).toBe('running');
    expect(run.result).toMatchObject({ state: 'awaiting_agent_runtime', noteId: note.id });
    expect(saveAgentRun).toHaveBeenCalledOnce();
  });

  it('rejects non-meeting notes', async () => {
    const repo = { getNoteDocument: vi.fn().mockResolvedValue({ id: 'note_123456', workspaceId: 'ws', kind: 'general', sourceIds: [] }) } as any;
    await expect(startAgentRun(repo, 'ws', { noteId: 'note_123456' })).rejects.toThrow('meeting note');
  });
});
