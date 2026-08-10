/**
 * EFP-004 EventExecutionService tests.
 *
 * Covers 6 frozen-write functions:
 *   1. createTaskForNode
 *   2. editNodeTask
 *   3. completeNodeTask
 *   4. undoCompleteNodeTask
 *   5. convertStandaloneToEventNodeTask
 *   6. undoConvertStandaloneToEventNodeTask
 *
 * Each test bootstraps a tmp workspaceRoot with an optional TopicSpace +
 * MindMap, writes a daily note line, calls the service, then verifies the
 * resulting daily-note content AND topic-space state.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import * as config from '../config.js';
import { writeDailyNote, readDailyNote } from '../fileSystem.js';
import { createTopicSpace, addTaskIdToTopicSpace } from '../topicSpaces.js';
import { createMindMap, getMindMap, updateMindMap } from '../mindmaps.js';
import { parseMarkdown } from '../parser.js';
import {
  createTaskForNode,
  editNodeTask,
  completeNodeTask,
  undoCompleteNodeTask,
  convertStandaloneToEventNodeTask,
  undoConvertStandaloneToEventNodeTask,
  unscheduleNodeTask,
  rescheduleNodeTask,
} from '../eventExecutionService.js';

describe.sequential('EFP-004 EventExecutionService (6 frozen writes)', () => {
  let tmpRoot: string;
  let cfg: any;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'df-efp004-'));
    cfg = {
      workspaceRoot: tmpRoot,
      dailyPathTemplate: 'Daily/{year}/{month}/{date}.md',
      rolloverTrigger: 'manual',
      rolloverSkipTags: [],
    };
    vi.spyOn(config, 'loadConfig').mockResolvedValue(cfg);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (tmpRoot) await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
  });

  it('1. createTaskForNode appends line with ^mm + ^node + ^id- markers and writes to daily/<date>.md', async () => {
    const date = '2026-08-10';
    await writeDailyNote(date, `## Work\n`, cfg);
    const space = await createTopicSpace({ title: 'Launch', context: 'work' });
    const map = await createMindMap({ title: 'Launch', spaceId: space.id });
    const nodeId = 'n_new_1';

    const r = await createTaskForNode({
      mindmapId: map.id,
      nodeId,
      title: 'Send press release',
      scheduledDate: date,
      manualTags: ['pr', 'marketing'],
      deadline: '2026-08-11',
      priority: 'high',
      config: cfg,
    });

    expect(r.appended).toBe(true);
    expect(r.alreadyPresent).toBe(false);
    expect(r.taskId.startsWith('t_')).toBe(true);

    const after = await readDailyNote(date, cfg);
    expect(after).not.toBeNull();
    const line = after!.content.split('\n').find(l => l.includes(r.taskId));
    expect(line).toBeDefined();
    // Marker order: user tags + #priority + #deadline + ^space + ^mm + ^node + ^id-
    // At minimum each marker substring must exist (order enforced in parser tests elsewhere)
    expect(line).toContain(`^mm:${map.id}`);
    expect(line).toContain(`^node:${nodeId}`);
    expect(line).toContain(`^id-${r.taskId}`);
    expect(line).toContain('#pr');
    expect(line).toContain('#deadline:2026-08-11');
    expect(line).toContain('#priority:high');
    expect(line).toContain('- [ ] Send press release');

    // Idempotency: calling twice with same existingTaskId → alreadyPresent
    const r2 = await createTaskForNode({
      mindmapId: map.id,
      nodeId,
      title: 'Send press release',
      scheduledDate: date,
      existingTaskId: r.taskId,
      config: cfg,
    });
    expect(r2.appended).toBe(false);
    expect(r2.alreadyPresent).toBe(true);
  });

  it('2. editNodeTask rewrites title/deadline/priority without wiping ^mm ^node ^id-', async () => {
    const date = '2026-08-10';
    const taskId = 't_edit_01';
    await writeDailyNote(date, `- [ ] Old title #oldtag ^mm:mm_edit ^node:n_edit ^id-${taskId}\n`, cfg);
    const r = await editNodeTask({
      taskId,
      scheduledDate: date,
      updates: {
        title: 'New title',
        deadline: '2026-09-01',
        priority: 'medium',
        tags: ['newtag'],
      },
      config: cfg,
    });
    expect(r.updated).toBe(true);
    expect(typeof r.taskLine).toBe('number');

    const after = await readDailyNote(date, cfg);
    const line = after!.content.split('\n').find(l => l.includes(taskId));
    expect(line).toContain('New title');
    expect(line).not.toContain('Old title');
    expect(line).toContain('#deadline:2026-09-01');
    expect(line).toContain('#priority:medium');
    expect(line).toContain('#newtag');
    // Markers PRESERVED
    expect(line).toContain('^mm:mm_edit');
    expect(line).toContain('^node:n_edit');
    expect(line).toContain(`^id-${taskId}`);
  });

  it('3. completeNodeTask toggles [x]; re-complete = idempotent alreadyDone', async () => {
    const date = '2026-08-10';
    const taskId = 't_comp_1';
    await writeDailyNote(date, `- [ ] Deliverable ^id-${taskId}\n`, cfg);
    const r1 = await completeNodeTask({ taskId, scheduledDate: date, config: cfg });
    expect(r1.completed).toBe(true);
    expect(r1.alreadyDone).toBe(false);

    const after1 = (await readDailyNote(date, cfg))!.content;
    expect(parseMarkdown(after1).find(t => t.id === taskId)!.status).toBe('done');

    const r2 = await completeNodeTask({ taskId, scheduledDate: date, config: cfg });
    expect(r2.completed).toBe(false);
    expect(r2.alreadyDone).toBe(true);
  });

  it('4. undoCompleteNodeTask reverts to [ ]; re-undo = idempotent alreadyTodo', async () => {
    const date = '2026-08-10';
    const taskId = 't_undo_1';
    await writeDailyNote(date, `- [x] Delivered ^id-${taskId}\n`, cfg);
    const r1 = await undoCompleteNodeTask({ taskId, scheduledDate: date, config: cfg });
    expect(r1.undone).toBe(true);
    expect(r1.alreadyTodo).toBe(false);
    expect(parseMarkdown((await readDailyNote(date, cfg))!.content).find(t => t.id === taskId)!.status).toBe('todo');

    const r2 = await undoCompleteNodeTask({ taskId, scheduledDate: date, config: cfg });
    expect(r2.undone).toBe(false);
    expect(r2.alreadyTodo).toBe(true);
  });

  it('5. convertStandaloneToEventNodeTask injects ^mm ^node + adds to space.taskIds', async () => {
    const date = '2026-08-10';
    const taskId = 't_conv_1';
    await writeDailyNote(date, `- [ ] Plain work #work ^space:tw_conv ^id-${taskId}\n`, cfg);
    const space = await createTopicSpace({ title: 'Conv space', context: 'work' });
    const map = await createMindMap({ title: 'Conv plan', spaceId: space.id });
    const nodeId = 'n_conv_1';

    const r = await convertStandaloneToEventNodeTask({
      taskId,
      scheduledDate: date,
      mindmapId: map.id,
      nodeId,
      config: cfg,
    });
    expect(r.converted).toBe(true);
    expect(r.alreadyConverted).toBe(false);
    expect(r.spaceLinked).toBe(true);

    const line = (await readDailyNote(date, cfg))!.content.split('\n').find(l => l.includes(taskId));
    expect(line).toContain(`^mm:${map.id}`);
    expect(line).toContain(`^node:${nodeId}`);
    expect(line).toContain('^space:tw_conv'); // preserved, not stripped
    expect(line).toContain(`^id-${taskId}`);

    // Idempotency
    const r2 = await convertStandaloneToEventNodeTask({ taskId, scheduledDate: date, mindmapId: map.id, nodeId, config: cfg });
    expect(r2.alreadyConverted).toBe(true);
    expect(r2.converted).toBe(false);
  });

  it('6. undoConvertStandaloneToEventNodeTask strips ^mm ^node, keeps ^id- and removes from space.taskIds', async () => {
    const date = '2026-08-10';
    const taskId = 't_unco_1';
    const space = await createTopicSpace({ title: 'Undo space', context: 'work' });
    const map = await createMindMap({ title: 'Undo plan', spaceId: space.id });
    // Write pre-converted line: both markers present
    await writeDailyNote(date, `- [ ] Already converted #life #urgent ^mm:${map.id} ^node:n_unco_1 ^space:${space.id} ^id-${taskId}\n`, cfg);
    // First register in space so undo can actually remove it
    await addTaskIdToTopicSpace(space.id, taskId);

    const r = await undoConvertStandaloneToEventNodeTask({ taskId, scheduledDate: date, config: cfg });
    expect(r.reverted).toBe(true);
    expect(r.alreadyStandalone).toBe(false);
    expect(r.removedFromSpace).toBe(true);

    const line = (await readDailyNote(date, cfg))!.content.split('\n').find(l => l.includes(taskId));
    // Stripped origin markers
    expect(line).not.toMatch(/\^mm:/);
    expect(line).not.toMatch(/\^node:/);
    // Kept stable id, space id, and user hashtags
    expect(line).toContain(`^id-${taskId}`);
    expect(line).toContain(`^space:${space.id}`);
    expect(line).toContain('#life');
    expect(line).toContain('#urgent');
  });

  it('reschedules one stable projection and unschedules without deleting its Event node', async () => {
    const fromDate = '2026-08-10';
    const toDate = '2026-08-12';
    const space = await createTopicSpace({ title: 'Release', context: 'work' });
    const map = (await getMindMap(space.mindmapId))!;
    const nodeId = 'n_ship';
    await updateMindMap(map.id, {
      nodes: [
        ...map.nodes,
        { id: nodeId, text: 'Ship build', position: { x: 300, y: 0 }, kind: 'task', status: 'todo' },
      ],
      edges: [...map.edges, { id: 'e_ship', source: map.rootId, target: nodeId }],
    });
    const created = await createTaskForNode({
      mindmapId: map.id,
      nodeId,
      title: 'Ship build',
      scheduledDate: fromDate,
      config: cfg,
    });
    const linkedMap = (await getMindMap(map.id))!;
    await updateMindMap(map.id, {
      nodes: linkedMap.nodes.map(node => node.id === nodeId
        ? { ...node, kind: 'task', taskId: created.taskId, taskDate: fromDate }
        : node),
    });

    await expect(rescheduleNodeTask({
      taskId: created.taskId,
      fromDate,
      toDate,
      mindmapId: map.id,
      nodeId,
      config: cfg,
    })).resolves.toEqual({ rescheduled: true, alreadyScheduled: false });
    expect(parseMarkdown((await readDailyNote(fromDate, cfg))!.content).some(task => task.id === created.taskId)).toBe(false);
    expect(parseMarkdown((await readDailyNote(toDate, cfg))!.content).filter(task => task.id === created.taskId)).toHaveLength(1);
    expect((await getMindMap(map.id))!.nodes.find(node => node.id === nodeId)?.taskDate).toBe(toDate);

    await expect(unscheduleNodeTask({
      taskId: created.taskId,
      scheduledDate: toDate,
      mindmapId: map.id,
      nodeId,
      config: cfg,
    })).resolves.toEqual({ unscheduled: true, alreadyUnscheduled: false });
    expect(parseMarkdown((await readDailyNote(toDate, cfg))!.content).some(task => task.id === created.taskId)).toBe(false);
    const preservedNode = (await getMindMap(map.id))!.nodes.find(node => node.id === nodeId);
    expect(preservedNode?.text).toBe('Ship build');
    expect(preservedNode?.taskId).toBeUndefined();
    expect(preservedNode?.taskDate).toBeUndefined();
  });
});
