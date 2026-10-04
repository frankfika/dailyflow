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

  it('refuses the run entry point even for a valid meeting note (converged to Event Operator)', async () => {
    const note = {
      id: 'note_123456', workspaceId: 'ws', kind: 'meeting', sourceIds: ['src_123456'],
    };
    const saveAgentRun = vi.fn().mockResolvedValue(undefined);
    const repo = { getNoteDocument: vi.fn().mockResolvedValue(note), saveAgentRun } as any;
    // DEBT-004: the dead entry point now answers 501 semantics instead of
    // writing an `awaiting_agent_runtime` stub run.
    await expect(startAgentRun(repo, 'ws', { noteId: note.id })).rejects.toMatchObject({
      code: 'not_implemented',
      status: 501,
    });
    expect(saveAgentRun).not.toHaveBeenCalled();
  });

  it('refuses non-meeting notes with the same not-implemented semantics', async () => {
    const repo = { getNoteDocument: vi.fn().mockResolvedValue({ id: 'note_123456', workspaceId: 'ws', kind: 'general', sourceIds: [] }) } as any;
    await expect(startAgentRun(repo, 'ws', { noteId: 'note_123456' })).rejects.toMatchObject({ code: 'not_implemented' });
  });
});
