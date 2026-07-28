import { describe, expect, it } from 'vitest';
import { commitmentToWorkItem, mergeWorkItems, taskToWorkItem } from './workItem';

describe('WorkItem adapters', () => {
  it('keeps a legacy task identity and routes it as task', () => {
    const item = taskToWorkItem({ id: 't1', title: 'Ship', status: 'todo', source_date: '2026-07-28' }, 'ws1');
    expect(item).toMatchObject({ id: 't1', kind: 'task', workspaceId: 'ws1', status: 'open' });
  });

  it('maps waiting commitments and preserves source references', () => {
    const item = commitmentToWorkItem({
      id: 'c1',
      workspaceId: 'ws1',
      title: 'Wait for legal',
      state: 'waiting',
      reviewAt: '2026-08-01T00:00:00.000Z',
      sourceIds: ['s1'],
      updatedAt: '2026-07-28T00:00:00.000Z',
    });
    expect(item.status).toBe('waiting');
    expect(item.sourceRefs[0]).toMatchObject({ type: 'source', id: 's1' });
  });

  it('does not collapse separate task and commitment identities with the same title', () => {
    const items = mergeWorkItems(
      [{ id: 't1', title: 'Follow up', status: 'todo' }],
      [{ id: 'c1', workspaceId: 'ws1', title: 'Follow up', state: 'active', updatedAt: '2026-07-28T00:00:00.000Z' }],
      'ws1',
    );
    expect(items.map(item => `${item.kind}:${item.id}`)).toEqual(['task:t1', 'commitment:c1']);
  });

  it('hides the legacy task once its linked commitment exists', () => {
    const items = mergeWorkItems(
      [{ id: '2026-07-28#4', title: 'Follow up', status: 'todo' }],
      [{
        id: 'c1',
        workspaceId: 'ws1',
        title: 'Follow up',
        state: 'active',
        updatedAt: '2026-07-28T00:00:00.000Z',
        legacyTaskId: '2026-07-28#4',
      }],
      'ws1',
    );
    expect(items.map(item => `${item.kind}:${item.id}`)).toEqual(['commitment:c1']);
  });
});
