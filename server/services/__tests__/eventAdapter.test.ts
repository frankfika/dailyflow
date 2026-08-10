import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

import {
  summarizeTopicSpaceAsEvent,
  buildEventDetail,
  listAllEvents,
  listTodayItems,
  listStandaloneTasks,
  effectiveTagsForEvent,
  resolveTaskStateFromMarkdown,
  buildNodePath,
} from '../eventAdapter.js';
import { getEventById } from '../eventQueryService.js';

const FIXTURES_ROOT = path.resolve(
  __dirname,
  '..',
  '..',
  'routes',
  '__tests__',
  'fixtures',
  'eventAdapter',
);

/** Copy a fixture directory tree into a clean tmpdir so the adapter's
 *  `workspaceRoot/Workspaces` / `.dailyflow` / `daily` layout resolves
 *  exactly as it would on disk. Read-only at source; copy is cheap. */
async function setupWorkspace(scenario: string): Promise<{ root: string; dispose: () => Promise<void> }> {
  const src = path.join(FIXTURES_ROOT, scenario);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `df-adapter-${scenario}-`));
  await copyRecursive(src, root);
  const dispose = async () => {
    await fs.rm(root, { recursive: true, force: true });
  };
  return { root, dispose };
}

async function copyRecursive(src: string, dst: string): Promise<void> {
  const entries = await fs.readdir(src, { withFileTypes: true });
  await fs.mkdir(dst, { recursive: true });
  for (const entry of entries) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) await copyRecursive(s, d);
    else await fs.copyFile(s, d);
  }
}

function spacePath(root: string, rel: string): string {
  return path.join(root, rel);
}

describe.sequential('EFP-002 event adapter (read-only)', () => {
  describe('scenario 1 — v1 map, legacy kind=workspace, missing context', () => {
    let root: string;
    let dispose: () => Promise<void>;

    beforeAll(async () => {
      const w = await setupWorkspace('v1-map-unclassified');
      root = w.root;
      dispose = w.dispose;
    });
    afterAll(async () => { await dispose(); });

    it('summarizeTopicSpaceAsEvent returns EventSummary with context=work fallback and status=active', async () => {
      const fp = spacePath(root, 'Workspaces/2026/08/tw_v1legacy.md');
      const ev = await summarizeTopicSpaceAsEvent(root, fp);
      expect(ev).not.toBeNull();
      expect(ev!.id).toBe('tw_v1legacy');
      expect(ev!.title).toBe('Legacy project');
      expect(ev!.context).toBe('work');
      expect(ev!.status).toBe('active');
      expect(ev!.progress.total).toBeGreaterThanOrEqual(1);
      expect(ev!.progress.done).toBe(0);
    });

    it('buildEventDetail flags integrity.sourceContextWasUnclassified=true and missingMap=false', async () => {
      const fp = spacePath(root, 'Workspaces/2026/08/tw_v1legacy.md');
      const detail = await buildEventDetail(root, fp);
      expect(detail).not.toBeNull();
      expect(detail!.integrity.sourceContextWasUnclassified).toBe(true);
      expect(detail!.integrity.missingMap).toBe(false);
      expect(detail!.mindmapId).toBeTruthy();
      expect(detail!.nodes.length).toBeGreaterThanOrEqual(2);
      const milestone = detail!.nodes.find(n => n.text === 'Milestone 1');
      expect(milestone).toBeDefined();
      // Daily task line is [ ] not completed → execution.status = todo
      expect(milestone!.execution?.taskId).toBeDefined();
      expect(milestone!.execution?.status).toBe('todo');
    });

    it('listTodayItems returns 1 event-node item for the linked task', async () => {
      const items = await listTodayItems(root, '2026-08-10');
      expect(items).toHaveLength(1);
      expect(items[0].kind).toBe('event-node');
      expect(items[0].id.startsWith('event-node:')).toBe(true);
      if (items[0].kind === 'event-node') {
        expect(items[0].eventId).toBe('tw_v1legacy');
      }
      expect(items[0].status).toBe('todo');
    });
  });

  describe('scenario 2 — v2 map with linked task, completed daily task', () => {
    let root: string;
    let dispose: () => Promise<void>;

    beforeAll(async () => {
      const w = await setupWorkspace('v2-map-with-linked-tasks');
      root = w.root;
      dispose = w.dispose;
    });
    afterAll(async () => { await dispose(); });

    it('buildEventDetail marks the linked node execution done and status=completed (allDone)', async () => {
      const fp = spacePath(root, 'Workspaces/2026/08/tw_workplan.md');
      const detail = await buildEventDetail(root, fp);
      expect(detail).not.toBeNull();
      expect(detail!.context).toBe('work');
      expect(detail!.status).toBe('completed');
      expect(detail!.progress.total).toBe(1);
      expect(detail!.progress.done).toBe(1);
      const action = detail!.nodes.find(n => n.id === 'n_act');
      expect(action!.execution!.status).toBe('done');
      expect(action!.execution!.taskId).toBe('t_ws1');
    });

    it('listStandaloneTasks returns 0 — this fixture has only linked tasks', async () => {
      const tasks = await listStandaloneTasks(root, '2026-08-10');
      expect(tasks).toHaveLength(0);
    });

    it('listTodayItems with context=work includes the linked one; context=life returns []', async () => {
      const work = await listTodayItems(root, '2026-08-10', 'work');
      const life = await listTodayItems(root, '2026-08-10', 'life');
      expect(work).toHaveLength(1);
      expect(life).toHaveLength(0);
    });
  });

  describe('scenario 3 — standalone tasks + 1 orphan line, context=life space', () => {
    let root: string;
    let dispose: () => Promise<void>;

    beforeAll(async () => {
      const w = await setupWorkspace('standalone-tasks');
      root = w.root;
      dispose = w.dispose;
    });
    afterAll(async () => { await dispose(); });

    it('listStandaloneTasks picks up the 3 lines (2 standalone + 1 orphan no id)', async () => {
      const tasks = await listStandaloneTasks(root, '2026-08-10');
      expect(tasks.length).toBe(3);
      const titles = tasks.map(t => t.title).sort();
      expect(titles).toEqual([
        'Buy groceries',
        'Dentist visit done',
        'Orphan errand',
      ].sort());
      const dentist = tasks.find(t => t.title === 'Dentist visit done')!;
      expect(dentist.status).toBe('done');
      expect(dentist.deadline).toBe('2026-08-10');
      expect(dentist.manualTags).toContain('life');
    });

    it('listTodayItems(,context=life) sees all 3; context=work sees 0', async () => {
      const life = await listTodayItems(root, '2026-08-10', 'life');
      const work = await listTodayItems(root, '2026-08-10', 'work');
      expect(life).toHaveLength(3);
      expect(work).toHaveLength(0);
      // Every item is kind=standalone because no ^mm/^node markers in this set
      expect(life.every(it => it.kind === 'standalone')).toBe(true);
    });

    it('orphan without any ^id- still appears as standalone with non-empty id derived from title+date', async () => {
      const items = await listTodayItems(root, '2026-08-10');
      const orphan = items.find(it => it.title === 'Orphan errand');
      expect(orphan).toBeDefined();
      expect(orphan!.id).toBeTruthy();
      expect(orphan!.id.startsWith('standalone:')).toBe(true);
    });
  });

  describe('scenario 4 — no Workspaces, two daily tasks with id but no origin (orphan set)', () => {
    let root: string;
    let dispose: () => Promise<void>;

    beforeAll(async () => {
      const w = await setupWorkspace('orphan-task-no-origin');
      root = w.root;
      dispose = w.dispose;
    });
    afterAll(async () => { await dispose(); });

    it('listAllEvents returns [] (no Workspaces dir / no topic-space files)', async () => {
      const events = await listAllEvents(root);
      expect(events).toEqual([]);
    });

    it('listTodayItems still surfaces both tasks as standalone; deadline/priority parsed', async () => {
      const items = await listTodayItems(root, '2026-08-10');
      expect(items).toHaveLength(2);
      expect(items.every(i => i.kind === 'standalone')).toBe(true);
      const report = items.find(i => i.title.includes('Report'))!;
      expect(report.deadline).toBe('2026-08-15');
      expect(report.taskId).toBe('t_rand2');
      const random = items.find(i => i.taskId === 't_rand1')!;
      expect(random.status).toBe('todo');
    });
  });

  describe('scenario 5 — duplicate node taskId claim', () => {
    let root: string;
    let dispose: () => Promise<void>;

    beforeAll(async () => {
      const w = await setupWorkspace('duplicate-node-task');
      root = w.root;
      dispose = w.dispose;
    });
    afterAll(async () => { await dispose(); });

    it('buildEventDetail reports integrity.duplicateNodeTaskIds = ["t_dup"]', async () => {
      const fp = spacePath(root, 'Workspaces/2026/08/tw_dup.md');
      const detail = await buildEventDetail(root, fp);
      expect(detail).not.toBeNull();
      expect(detail!.integrity.duplicateNodeTaskIds).toEqual(['t_dup']);
      // Both task-kind nodes get an execution object; one line in daily →
      // at least the one matching ^node:n_a resolves to status=todo, the other
      // also gets an execution (scheduled date fallback).
      const nA = detail!.nodes.find(n => n.id === 'n_a')!;
      const nB = detail!.nodes.find(n => n.id === 'n_b')!;
      expect(nA.execution).toBeDefined();
      expect(nB.execution).toBeDefined();
      expect(nA.execution!.taskId).toBe('t_dup');
      expect(nB.execution!.taskId).toBe('t_dup');
    });
  });

  describe('scenario 6 — independent MindMap compatibility Event', () => {
    let root: string;
    let dispose: () => Promise<void>;

    beforeAll(async () => {
      const w = await setupWorkspace('independent-mindmap');
      root = w.root;
      dispose = w.dispose;
    });
    afterAll(async () => { await dispose(); });

    async function snapshotFiles(): Promise<Record<string, string>> {
      const result: Record<string, string> = {};
      const visit = async (dir: string): Promise<void> => {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const absolute = path.join(dir, entry.name);
          if (entry.isDirectory()) await visit(absolute);
          else result[path.relative(root, absolute)] = await fs.readFile(absolute, 'utf-8');
        }
      };
      await visit(root);
      return result;
    }

    it('lists an independent map as an Event shell and prevents owned-map duplicates', async () => {
      const events = await listAllEvents(root);
      expect(events.map(event => event.id).sort()).toEqual(['mm_independent', 'tw_owned']);
      expect(events.some(event => event.id === 'mm_owned')).toBe(false);

      const independent = events.find(event => event.id === 'mm_independent')!;
      expect(independent.title).toBe('Independent launch plan');
      expect(independent.context).toBe('work');
      expect(independent.progress).toEqual({ done: 1, total: 1 });
      expect(independent.status).toBe('completed');
    });

    it('gets independent map detail by its preserved map id with linked task state', async () => {
      const detail = await getEventById(
        'mm_independent',
        root,
        '2026-08-10',
        '2026-08-10',
      );
      expect(detail).not.toBeNull();
      expect(detail!.id).toBe('mm_independent');
      expect(detail!.mindmapId).toBe('mm_independent');
      expect(detail!.rootNodeId).toBe('root_independent');
      expect(detail!.nodes.map(node => node.id)).toContain('n_independent_task');
      expect(detail!.nodes.find(node => node.id === 'n_independent_task')!.execution).toMatchObject({
        taskId: 't_independent',
        status: 'done',
        scheduledDate: '2026-08-10',
      });
    });

    it('surfaces the same independent Event id in Today and performs zero writes', async () => {
      const before = await snapshotFiles();
      const events = await listAllEvents(root);
      const detail = await getEventById('mm_independent', root);
      const today = await listTodayItems(root, '2026-08-10');
      const after = await snapshotFiles();

      expect(events.some(event => event.id === 'mm_independent')).toBe(true);
      expect(detail?.id).toBe('mm_independent');
      expect(today).toHaveLength(1);
      expect(today[0]).toMatchObject({
        kind: 'event-node',
        eventId: 'mm_independent',
        nodeId: 'n_independent_task',
        taskId: 't_independent',
        status: 'done',
      });
      expect(after).toEqual(before);
    });
  });

  describe('pure helpers (zero I/O)', () => {
    it('effectiveTagsForEvent dedups + includes context name, ignores unclassified, lowercases', () => {
      const tags = effectiveTagsForEvent({ tags: ['Urgent', 'urgent', ''], context: 'work' });
      expect(tags).toEqual(expect.arrayContaining(['urgent', 'work']));
      expect(tags).not.toContain('unclassified');
      const nocont = effectiveTagsForEvent({ context: 'unclassified' });
      expect(nocont).not.toContain('unclassified');
    });

    it('resolveTaskStateFromMarkdown parses checkbox + title + tags + deadline + priority + ignores markers', () => {
      const line = '- [x] Ship it #release #deadline:2026-08-15 #priority:high ^space:tw_a ^mm:mm_a ^node:n_x ^id-t_shipped';
      const r = resolveTaskStateFromMarkdown(line);
      expect(r.status).toBe('done');
      expect(r.title).toBe('Ship it');
      expect(r.tags).toContain('release');
      expect(r.deadline).toBe('2026-08-15');
      expect(r.priority).toBe('high');
    });

    it('buildNodePath builds breadcrumb excluding target; cycle-safe (self-loop on intermediate parent chain)', () => {
      const root = 'r';
      const edges = [
        { id: 'e1', source: 'r', target: 'a' },
        { id: 'e2', source: 'a', target: 'b' },
      ];
      const texts: Record<string,string> = { r: 'Root', a: 'A', b: 'B' };
      const p = buildNodePath(root, edges, 'b', texts);
      expect(p).toEqual([{ id: 'a', text: 'A' }]);
      // Real cycle: put a self-loop FIRST so parentOf.set('a', 'a') wins,
      // then walking b → a → a cycles → cycle detected → empty array.
      const cycleEdges = [
        { source: 'a', target: 'a' },
        { source: 'r', target: 'a' },
        { source: 'a', target: 'b' },
      ];
      const cyclic = buildNodePath(root, cycleEdges, 'b', texts);
      expect(cyclic).toEqual([]);
    });
  });
});
