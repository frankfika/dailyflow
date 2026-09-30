import { beforeEach, describe, expect, it, vi } from 'vitest';

import { executeToolCall, type ToolContext } from '../../utils/aiToolExecutor';
import { eventsApi, notesApi, tasksApi } from '../../api/client';

vi.mock('../../api/client', () => ({
  tasksApi: {
    create: vi.fn().mockResolvedValue(undefined),
    updateStatus: vi.fn().mockResolvedValue(undefined),
    edit: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue([]),
    searchById: vi.fn().mockResolvedValue([]),
  },
  notesApi: {
    create: vi.fn().mockResolvedValue({ id: 'note_1', title: 't' }),
    delete: vi.fn().mockResolvedValue(undefined),
  },
  eventsApi: {
    create: vi.fn().mockResolvedValue({ id: 'evt_1', title: 'x' }),
    createTaskForNode: vi.fn().mockResolvedValue({ taskId: 'task_9', appended: true, alreadyPresent: false }),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
    completeNodeTask: vi.fn().mockResolvedValue({ completed: true, alreadyDone: false }),
    editNodeTask: vi.fn().mockResolvedValue({ updated: true }),
    unscheduleNodeTask: vi.fn().mockResolvedValue({ unscheduled: true, alreadyUnscheduled: false }),
  },
}));

const baseContext = (): ToolContext => ({
  currentDate: '2026-07-28',
  activeContext: 'work',
  language: 'en',
  tasks: [],
  notes: [],
  events: [],
  showToast: vi.fn(),
  onDataChanged: vi.fn(),
});

describe('executeToolCall — task CRUD', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a task on today\'s note with parsed tags and priority', async () => {
    const ctx = baseContext();
    const result = await executeToolCall({
      name: 'create_task',
      arguments: { title: 'Prepare review', deadline: '2026-07-30', priority: 'high', tags: 'work, deep', date: '2026-07-29' },
    }, ctx);

    expect(result.success).toBe(true);
    expect(result.mutated).toBe('tasks');
    expect(tasksApi.create).toHaveBeenCalledWith('2026-07-29', {
      title: 'Prepare review',
      deadline: '2026-07-30',
      priority: 'high',
      tags: ['work', 'deep'],
    });
  });

  it('rejects create_task without a title', async () => {
    const result = await executeToolCall({ name: 'create_task', arguments: {} }, baseContext());
    expect(result.success).toBe(false);
    expect(tasksApi.create).not.toHaveBeenCalled();
  });

  it('completes a task by unique title using its source date', async () => {
    const ctx = {
      ...baseContext(),
      tasks: [{ id: 't1', title: 'Prepare review', status: 'todo', source_date: '2026-07-20' }],
    };
    const result = await executeToolCall({ name: 'complete_task', arguments: { title_query: 'prepare review' } }, ctx);

    expect(result.success).toBe(true);
    expect(result.mutated).toBe('tasks');
    expect(tasksApi.updateStatus).toHaveBeenCalledWith('t1', '2026-07-20', 'done');
  });

  it('reports ambiguity instead of guessing when several tasks match', async () => {
    const ctx = {
      ...baseContext(),
      tasks: [
        { id: 't1', title: 'Review PR 1', status: 'todo' },
        { id: 't2', title: 'Review PR 2', status: 'todo' },
      ],
    };
    const result = await executeToolCall({ name: 'complete_task', arguments: { title_query: 'Review PR' } }, ctx);

    expect(result.success).toBe(false);
    expect(result.message).toContain('ambiguous');
    expect(result.data).toHaveLength(2);
    expect(tasksApi.updateStatus).not.toHaveBeenCalled();
  });

  it('updates only the provided fields', async () => {
    const ctx = { ...baseContext(), tasks: [{ id: 't1', title: 'Old title', status: 'todo' }] };
    const result = await executeToolCall({
      name: 'update_task',
      arguments: { title_query: 'Old title', new_title: 'New title', priority: 'high' },
    }, ctx);

    expect(result.success).toBe(true);
    expect(tasksApi.edit).toHaveBeenCalledWith('t1', '2026-07-28', { title: 'New title', priority: 'high' });
  });

  it('refuses delete_task without confirm and performs no mutation', async () => {
    const ctx = { ...baseContext(), tasks: [{ id: 't1', title: 'Doomed task', status: 'todo' }] };
    const result = await executeToolCall({ name: 'delete_task', arguments: { title_query: 'Doomed task' } }, ctx);

    expect(result.success).toBe(false);
    expect(result.message).toContain('confirm');
    expect(tasksApi.delete).not.toHaveBeenCalled();
  });

  it('deletes a task when the user confirmed via the model', async () => {
    const ctx = { ...baseContext(), tasks: [{ id: 't1', title: 'Doomed task', status: 'todo' }] };
    const result = await executeToolCall({ name: 'delete_task', arguments: { title_query: 'Doomed task', confirm: true } }, ctx);

    expect(result.success).toBe(true);
    expect(result.mutated).toBe('tasks');
    expect(tasksApi.delete).toHaveBeenCalledWith('t1', '2026-07-28');
  });

  it('resolves tasks that only exist on other dates via the server search fallback', async () => {
    vi.mocked(tasksApi.search).mockResolvedValueOnce([
      { id: 's1', title: 'Old idea', status: 'todo', source_date: '2026-07-01' },
    ] as any);
    const ctx = baseContext();
    const result = await executeToolCall({ name: 'complete_task', arguments: { title_query: 'Old idea' } }, ctx);

    expect(result.success).toBe(true);
    expect(tasksApi.search).toHaveBeenCalledWith('Old idea');
    expect(tasksApi.updateStatus).toHaveBeenCalledWith('s1', '2026-07-01', 'done');
  });

  it('resolves a task by id from another date via the server id lookup', async () => {
    vi.mocked(tasksApi.searchById).mockResolvedValueOnce([
      { id: 's9', title: 'Deep-archive item', status: 'todo', source_date: '2026-06-15' },
    ] as any);
    const result = await executeToolCall({ name: 'complete_task', arguments: { task_id: 's9' } }, baseContext());

    expect(result.success).toBe(true);
    expect(tasksApi.searchById).toHaveBeenCalledWith('s9');
    expect(tasksApi.updateStatus).toHaveBeenCalledWith('s9', '2026-06-15', 'done');
  });

  it('routes event-node task completion to the node-task API', async () => {
    const ctx = {
      ...baseContext(),
      tasks: [{
        id: 'nt1', title: 'Canvas item', status: 'todo', source_date: '2026-09-29',
        kind: 'event-node', originMindmapId: 'mm_1', originNodeId: 'node_1',
      }],
    };
    const result = await executeToolCall({ name: 'complete_task', arguments: { task_id: 'nt1' } }, ctx);
    expect(result.success).toBe(true);
    expect(eventsApi.completeNodeTask).toHaveBeenCalledWith({ taskId: 'nt1', scheduledDate: '2026-09-29' });
    expect(tasksApi.updateStatus).not.toHaveBeenCalled();
  });

  it('routes event-node deletion through unscheduleNodeTask', async () => {
    const ctx = {
      ...baseContext(),
      tasks: [{
        id: 'nt2', title: 'Canvas item to remove', status: 'todo', source_date: '2026-09-29',
        kind: 'event-node', originMindmapId: 'mm_2', originNodeId: 'node_2',
      }],
    };
    const result = await executeToolCall({
      name: 'delete_task', arguments: { task_id: 'nt2', confirm: true },
    }, ctx);
    expect(result.success).toBe(true);
    expect(eventsApi.unscheduleNodeTask).toHaveBeenCalledWith({
      taskId: 'nt2', scheduledDate: '2026-09-29', mindmapId: 'mm_2', nodeId: 'node_2',
    });
    expect(tasksApi.delete).not.toHaveBeenCalled();
  });

  it('routes event-node updates through editNodeTask (narrower field set)', async () => {
    const ctx = {
      ...baseContext(),
      tasks: [{
        id: 'nt3', title: 'Canvas item to update', status: 'todo', source_date: '2026-09-29',
        kind: 'event-node', originMindmapId: 'mm_3', originNodeId: 'node_3',
      }],
    };
    const result = await executeToolCall({
      name: 'update_task',
      arguments: { task_id: 'nt3', new_title: 'Renamed', deadline: '2026-10-05', project: 'skip-this' },
    }, ctx);
    expect(result.success).toBe(true);
    // project is not part of the node-task contract and is silently dropped.
    expect(eventsApi.editNodeTask).toHaveBeenCalledWith({
      taskId: 'nt3', scheduledDate: '2026-09-29',
      updates: { title: 'Renamed', deadline: '2026-10-05' },
    });
    expect(tasksApi.edit).not.toHaveBeenCalled();
  });

  it('rejects update_task when no fields are provided (standalone)', async () => {
    const ctx = { ...baseContext(), tasks: [{ id: 't1', title: 'X', status: 'todo' }] };
    const result = await executeToolCall({
      name: 'update_task', arguments: { task_id: 't1' },
    }, ctx);
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/no fields/i);
    expect(tasksApi.edit).not.toHaveBeenCalled();
  });

  it('rejects update_task when no fields are provided (event-node)', async () => {
    const ctx = { ...baseContext(), tasks: [{
      id: 'nt4', title: 'X', status: 'todo', source_date: '2026-09-29',
      kind: 'event-node', originMindmapId: 'mm_4', originNodeId: 'node_4',
    }] };
    const result = await executeToolCall({
      name: 'update_task', arguments: { task_id: 'nt4' },
    }, ctx);
    expect(result.success).toBe(false);
    expect(eventsApi.editNodeTask).not.toHaveBeenCalled();
  });

  it('ignores create_task fields that fail validation (bad date / bad priority)', async () => {
    const result = await executeToolCall({
      name: 'create_task',
      arguments: { title: 'X', date: 'not-a-date', priority: 'urgent' },
    }, baseContext());
    expect(result.success).toBe(true);
    // Falls back to today (real today, not the test's `currentDate`) and
    // drops the unrecognized priority rather than sending it to the API.
    expect(tasksApi.create).toHaveBeenCalledTimes(1);
    const [date, payload] = vi.mocked(tasksApi.create).mock.calls[0];
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(payload).toEqual({ title: 'X' });
    expect((payload as any).priority).toBeUndefined();
  });
});

describe('executeToolCall — notes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a note with the AI tag', async () => {
    const result = await executeToolCall({
      name: 'create_note',
      arguments: { title: 'Weekly plan', body: '# Plan', type: 'note' },
    }, baseContext());

    expect(result.success).toBe(true);
    expect(result.mutated).toBe('notes');
    expect(notesApi.create).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Weekly plan',
      body: '# Plan',
      date: '2026-07-28',
      context: 'work',
      tags: ['ai-generated'],
    }));
  });

  it('searches notes by title and body', async () => {
    const ctx = { ...baseContext(), notes: [{ id: 'n1', title: 'Roadmap', body: 'Q3 plans' }] };
    const result = await executeToolCall({ name: 'search_notes', arguments: { query: 'roadmap' } }, ctx);
    expect(result.success).toBe(true);
    expect(result.message).toContain('Roadmap');
  });

  it('returns an empty hit list when search_notes finds nothing', async () => {
    const ctx = { ...baseContext(), notes: [{ id: 'n1', title: 'Roadmap', body: '' }] };
    const result = await executeToolCall({ name: 'search_notes', arguments: { query: 'nonsense' } }, ctx);
    expect(result.success).toBe(true);
    expect(result.message).toMatch(/no matching/i);
    expect(result.data).toEqual([]);
  });

  it('rejects create_note when title or body is empty', async () => {
    const emptyTitle = await executeToolCall({ name: 'create_note', arguments: { title: '  ', body: '# x' } }, baseContext());
    expect(emptyTitle.success).toBe(false);
    const emptyBody = await executeToolCall({ name: 'create_note', arguments: { title: 'x', body: '   ' } }, baseContext());
    expect(emptyBody.success).toBe(false);
    expect(notesApi.create).not.toHaveBeenCalled();
  });

  it('defaults an unknown create_note type to "note" so the server never sees junk', async () => {
    const result = await executeToolCall({
      name: 'create_note',
      arguments: { title: 'X', body: '# x', type: 'made-up-type' },
    }, baseContext());
    expect(result.success).toBe(true);
    expect(notesApi.create).toHaveBeenCalledWith(expect.objectContaining({ type: 'note' }));
  });

  it('refuses delete_note without confirm', async () => {
    const result = await executeToolCall({ name: 'delete_note', arguments: { note_id: 'n1' } }, baseContext());
    expect(result.success).toBe(false);
    expect(notesApi.delete).not.toHaveBeenCalled();
  });

  it('deletes a note after the user confirms', async () => {
    const result = await executeToolCall({ name: 'delete_note', arguments: { note_id: 'n1', confirm: true } }, baseContext());
    expect(result.success).toBe(true);
    expect(result.mutated).toBe('notes');
    expect(notesApi.delete).toHaveBeenCalledWith('n1');
  });

  it('rejects delete_note when no note_id is provided', async () => {
    const result = await executeToolCall({ name: 'delete_note', arguments: { confirm: true } }, baseContext());
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/note_id is required/);
    expect(notesApi.delete).not.toHaveBeenCalled();
  });
});

describe('executeToolCall — events', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates an event in the active context', async () => {
    const result = await executeToolCall({ name: 'create_event', arguments: { title: 'Launch v3' } }, baseContext());
    expect(result.success).toBe(true);
    expect(result.mutated).toBe('events');
    expect(eventsApi.create).toHaveBeenCalledWith({ title: 'Launch v3', context: 'work' });
  });

  it('adds a task to an event matched by title', async () => {
    const ctx = { ...baseContext(), events: [{ id: 'evt_1', mindmapId: 'map_1', title: 'Launch v3' }] };
    const result = await executeToolCall({
      name: 'add_task_to_event',
      arguments: { event_title: 'Launch v3', title: 'Write changelog' },
    }, ctx);

    expect(result.success).toBe(true);
    expect(eventsApi.createTaskForNode).toHaveBeenCalledWith(expect.objectContaining({
      mindmapId: 'map_1',
      title: 'Write changelog',
      scheduledDate: '2026-07-28',
    }));
  });

  it('renames an event', async () => {
    const ctx = { ...baseContext(), events: [{ id: 'evt_1', title: 'Old name' }] };
    const result = await executeToolCall({
      name: 'update_event',
      arguments: { title_query: 'Old name', new_title: 'New name' },
    }, ctx);
    expect(result.success).toBe(true);
    expect(eventsApi.update).toHaveBeenCalledWith('evt_1', { title: 'New name' });
  });

  it('marks an event completed via update_event status', async () => {
    const ctx = { ...baseContext(), events: [{ id: 'evt_1', title: 'Ship' }] };
    const result = await executeToolCall({
      name: 'update_event',
      arguments: { title_query: 'Ship', status: 'completed' },
    }, ctx);
    expect(result.success).toBe(true);
    expect(eventsApi.update).toHaveBeenCalledWith('evt_1', { status: 'completed' });
  });

  it('rejects update_event when no fields are provided', async () => {
    const ctx = { ...baseContext(), events: [{ id: 'evt_1', title: 'X' }] };
    const result = await executeToolCall({ name: 'update_event', arguments: { event_id: 'evt_1' } }, ctx);
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/no fields/i);
    expect(eventsApi.update).not.toHaveBeenCalled();
  });

  it('fails update_event with a useful diagnostic when the title does not match', async () => {
    const ctx = { ...baseContext(), events: [{ id: 'evt_1', title: 'Ship' }] };
    const result = await executeToolCall({
      name: 'update_event', arguments: { title_query: 'No-such-event', new_title: 'X' },
    }, ctx);
    expect(result.success).toBe(false);
    expect(eventsApi.update).not.toHaveBeenCalled();
  });

  it('refuses delete_event without confirm', async () => {
    const ctx = { ...baseContext(), events: [{ id: 'evt_1', title: 'Launch v3' }] };
    const result = await executeToolCall({ name: 'delete_event', arguments: { title_query: 'Launch v3' } }, ctx);
    expect(result.success).toBe(false);
    expect(eventsApi.delete).not.toHaveBeenCalled();
  });

  it('deletes an event after the user confirms', async () => {
    const ctx = { ...baseContext(), events: [{ id: 'evt_1', title: 'Launch v3' }] };
    const result = await executeToolCall({
      name: 'delete_event', arguments: { title_query: 'Launch v3', confirm: true },
    }, ctx);
    expect(result.success).toBe(true);
    expect(result.mutated).toBe('events');
    expect(eventsApi.delete).toHaveBeenCalledWith('evt_1');
  });

  it('rejects add_task_to_event when arguments are missing', async () => {
    const result = await executeToolCall({
      name: 'add_task_to_event', arguments: { title: 'X' },
    }, baseContext());
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/event_title and title/);
  });

  it('reports the available events when add_task_to_event cannot find the target', async () => {
    const ctx = { ...baseContext(), events: [{ id: 'evt_1', title: 'A' }, { id: 'evt_2', title: 'B' }] };
    const result = await executeToolCall({
      name: 'add_task_to_event', arguments: { event_title: 'C', title: 'X' },
    }, ctx);
    expect(result.success).toBe(false);
    expect(result.message).toContain('A');
    expect(result.message).toContain('B');
    expect(eventsApi.createTaskForNode).not.toHaveBeenCalled();
  });
});

describe('executeToolCall — reads', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists today\'s tasks', async () => {
    const ctx = { ...baseContext(), tasks: [{ id: 't1', title: 'A', status: 'todo', tags: ['work'] }] };
    const result = await executeToolCall({ name: 'list_today_tasks', arguments: {} }, ctx);
    expect(result.success).toBe(true);
    expect(result.message).toContain('- A (work)');
  });

  it('reports an empty today list without confusing the model', async () => {
    const result = await executeToolCall({ name: 'list_today_tasks', arguments: {} }, baseContext());
    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
    expect(result.message).toMatch(/no tasks/i);
  });

  it('rejects search_tasks with an empty query', async () => {
    const result = await executeToolCall({ name: 'search_tasks', arguments: { query: '   ' } }, baseContext());
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/query is required/i);
    expect(tasksApi.search).not.toHaveBeenCalled();
  });

  it('falls back to the server search when the local search misses', async () => {
    vi.mocked(tasksApi.search).mockResolvedValueOnce([
      { id: 's1', title: 'Archived idea', status: 'todo', source_date: '2026-07-01', tags: [] },
    ] as any);
    const result = await executeToolCall({ name: 'search_tasks', arguments: { query: 'archived' } }, baseContext());
    expect(result.success).toBe(true);
    expect(result.message).toContain('Archived idea');
  });
});
