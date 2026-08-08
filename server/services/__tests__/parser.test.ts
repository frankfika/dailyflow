import { describe, it, expect } from 'vitest';
import {
  parseMarkdown,
  generateMarkdown,
  updateTaskInMarkdown,
  editTaskInMarkdown,
  editTaskFullInMarkdown,
  appendTaskToMarkdown,
  removeTaskFromMarkdown,
} from '../parser.js';
import type { Task } from '../../types/task.js';

describe('parseMarkdown', () => {
  it('parses basic todo task', () => {
    const md = '## Tasks\n\n- [ ] Buy milk\n';
    const tasks = parseMarkdown(md);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('Buy milk');
    expect(tasks[0].status).toBe('todo');
  });

  it('parses done task', () => {
    const md = '## Tasks\n\n- [x] Completed task\n';
    const tasks = parseMarkdown(md);
    expect(tasks[0].status).toBe('done');
  });

  it('parses tasks with tags', () => {
    const md = '## Tasks\n\n- [ ] Task with tags #work #urgent\n';
    const tasks = parseMarkdown(md);
    expect(tasks[0].tags).toContain('work');
    expect(tasks[0].tags).toContain('urgent');
  });

  it('extracts category from ## heading', () => {
    const md = '## Work\n\n- [ ] Work task\n';
    const tasks = parseMarkdown(md);
    expect(tasks[0].tags).toContain('work');
  });

  it('extracts explicit id', () => {
    const md = '## Tasks\n\n- [ ] Task with id ^id-abc123\n';
    const tasks = parseMarkdown(md);
    expect(tasks[0].id).toBe('abc123');
  });

  it('extracts priority', () => {
    const md = '## Tasks\n\n- [ ] High priority #priority:high\n';
    const tasks = parseMarkdown(md);
    expect(tasks[0].priority).toBe('high');
  });

  it('extracts deadline', () => {
    const md = '## Tasks\n\n- [ ] Due soon #deadline:2026-05-10\n';
    const tasks = parseMarkdown(md);
    expect(tasks[0].deadline).toBe('2026-05-10');
  });

  it('extracts project', () => {
    const md = '## Tasks\n\n- [ ] Build feature #project:My_Project\n';
    const tasks = parseMarkdown(md);
    expect(tasks[0].project).toBe('My Project');
  });

  it('extracts source_date from migrated marker', () => {
    const md = '## Tasks\n\n- [ ] Migrated task ↗ migrated:2026-05-04 ^id-xyz\n';
    const tasks = parseMarkdown(md);
    expect(tasks[0].source_date).toBe('2026-05-04');
    expect(tasks[0].title).toBe('Migrated task');
  });

  it('parses description with blank lines (multi-paragraph)', () => {
    const md = `## Tasks

- [ ] Task with multi-paragraph description
  First paragraph line 1
  First paragraph line 2

  Second paragraph line 1
  Second paragraph line 2
- [ ] Next task
`;
    const tasks = parseMarkdown(md);
    expect(tasks).toHaveLength(2);
    expect(tasks[0].description).toBe('First paragraph line 1\nFirst paragraph line 2\n\nSecond paragraph line 1\nSecond paragraph line 2');
    expect(tasks[1].title).toBe('Next task');
  });

  it('does not include blank line between tasks as description', () => {
    const md = `## Tasks

- [ ] Task with description
  Description line

- [ ] Next task
`;
    const tasks = parseMarkdown(md);
    expect(tasks).toHaveLength(2);
    expect(tasks[0].description).toBe('Description line');
  });

  it('filters out "tasks" and "inbox" from tags', () => {
    const md = '## Tasks\n\n- [ ] Generic task\n';
    const tasks = parseMarkdown(md);
    expect(tasks[0].tags).not.toContain('tasks');
    expect(tasks[0].tags).not.toContain('inbox');
  });

  it('handles empty markdown', () => {
    expect(parseMarkdown('')).toHaveLength(0);
    expect(parseMarkdown('# Just a heading')).toHaveLength(0);
  });

  it('handles multiple tasks in different categories', () => {
    const md = `
## Work
- [ ] Work task 1
- [x] Work task 2
## Personal
- [ ] Personal task
`;
    const tasks = parseMarkdown(md);
    expect(tasks).toHaveLength(3);
    expect(tasks[0].tags).toContain('work');
    expect(tasks[2].tags).toContain('personal');
  });
});

describe('generateMarkdown', () => {
  it('generates markdown from tasks', () => {
    const tasks: Task[] = [
      { id: 't1', title: 'Task 1', status: 'todo', tags: ['work'] },
      { id: 't2', title: 'Task 2', status: 'done', tags: ['personal'] },
    ];
    const md = generateMarkdown(tasks);
    expect(md).toContain('- [ ] Task 1 #work ^id-t1');
    expect(md).toContain('- [x] Task 2 #personal ^id-t2');
  });

  it('includes migrated marker when source_date differs from currentDate', () => {
    const tasks: Task[] = [
      { id: 't1', title: 'Migrated', status: 'todo', source_date: '2026-05-04' },
    ];
    const md = generateMarkdown(tasks, '2026-05-05');
    expect(md).toContain('↗ migrated:2026-05-04');
  });

  it('omits migrated marker when source_date equals currentDate', () => {
    const tasks: Task[] = [
      { id: 't1', title: 'Native', status: 'todo', source_date: '2026-05-05' },
    ];
    const md = generateMarkdown(tasks, '2026-05-05');
    expect(md).not.toContain('migrated');
  });
});

describe('updateTaskInMarkdown', () => {
  it('toggles task from todo to done', () => {
    const md = '- [ ] Task to toggle\n';
    const result = updateTaskInMarkdown(md, 0, 'done');
    expect(result).toContain('- [x] Task to toggle');
  });

  it('toggles task from done to todo', () => {
    const md = '- [x] Task to untoggle\n';
    const result = updateTaskInMarkdown(md, 0, 'todo');
    expect(result).toContain('- [ ] Task to untoggle');
  });

  it('preserves other lines', () => {
    const md = '## Tasks\n- [ ] Task 1\n- [ ] Task 2\n';
    const result = updateTaskInMarkdown(md, 2, 'done');
    expect(result).toContain('- [x] Task 2');
    expect(result).toContain('- [ ] Task 1');
  });
});

describe('editTaskInMarkdown', () => {
  it('updates task title while preserving metadata', () => {
    const md = '- [ ] Old title #work #deadline:2026-05-10 ^id-abc\n';
    const result = editTaskInMarkdown(md, 0, 'New title');
    expect(result).toContain('- [ ] New title #work #deadline:2026-05-10 ^id-abc');
    expect(result).not.toContain('Old title');
  });

  it('returns original when line is out of bounds', () => {
    const md = '- [ ] Task\n';
    const result = editTaskInMarkdown(md, 99, 'New');
    expect(result).toBe(md);
  });

  it('replaces multi-paragraph description correctly', () => {
    const md = '- [ ] Task title\n  Old desc line 1\n\n  Old desc line 2\n- [ ] Next task\n';
    const result = editTaskInMarkdown(md, 0, 'Task title', 'New desc line 1\n\nNew desc line 2');
    expect(result).toContain('  New desc line 1');
    expect(result).toContain('  New desc line 2');
    expect(result).not.toContain('Old desc');
    expect(result).toContain('- [ ] Next task');
  });

  it('preserves multi-paragraph description when newDescription is undefined', () => {
    const md = '- [ ] Task title\n  Desc line 1\n\n  Desc line 2\n- [ ] Next task\n';
    const result = editTaskInMarkdown(md, 0, 'New title');
    expect(result).toContain('  Desc line 1');
    expect(result).toContain('  Desc line 2');
    expect(result).toContain('- [ ] New title');
    expect(result).toContain('- [ ] Next task');
  });
});

describe('editTaskFullInMarkdown', () => {
  it('updates title and preserves multi-paragraph description', () => {
    const md = '- [ ] Task title #work ^id-abc\n  Desc line 1\n\n  Desc line 2\n- [ ] Next task\n';
    const result = editTaskFullInMarkdown(md, 0, { title: 'New title', tags: ['work'] });
    expect(result).toContain('- [ ] New title #work ^id-abc');
    expect(result).toContain('  Desc line 1');
    expect(result).toContain('  Desc line 2');
    expect(result).toContain('- [ ] Next task');
  });

  it('can edit a migrated task title', () => {
    const md = '- [>] Migrated task #work ↗ migrated:2026-05-01 ^id-mig1\n';
    const result = editTaskFullInMarkdown(md, 0, { title: 'Updated migrated task', tags: ['work'] }, '2026-05-05');
    expect(result).toContain('- [>] Updated migrated task');
    expect(result).toContain('↗ migrated:2026-05-01');
    expect(result).toContain('^id-mig1');
  });

  it('replaces multi-paragraph description', () => {
    const md = '- [ ] Task title\n  Old desc line 1\n\n  Old desc line 2\n- [ ] Next task\n';
    const result = editTaskFullInMarkdown(md, 0, { description: 'New desc line 1\n\nNew desc line 2' });
    expect(result).toContain('  New desc line 1');
    expect(result).toContain('  New desc line 2');
    expect(result).not.toContain('Old desc');
    expect(result).toContain('- [ ] Next task');
  });

  it('clears description when empty string is provided', () => {
    const md = '- [ ] Task title\n  Desc line 1\n\n  Desc line 2\n- [ ] Next task\n';
    const result = editTaskFullInMarkdown(md, 0, { description: '' });
    expect(result).toContain('- [ ] Task title');
    expect(result).not.toContain('Desc line 1');
    expect(result).toContain('- [ ] Next task');
  });

  // Partial-update semantics: fields left undefined MUST keep their existing value.
  // Regression guard for the "save a comment, lose all metadata" bug.
  describe('partial-update semantics', () => {
    it('preserves tags/deadline/priority/project when only comments is updated', () => {
      const md = '- [ ] Buy milk #work #urgent #project:Grocery #deadline:2026-05-10 #priority:high ^id-abc\n';
      const result = editTaskFullInMarkdown(
        md,
        0,
        { comments: [{ text: 'remembered at 9pm', timestamp: '2026-06-08 21:00' }] },
      );
      expect(result).toContain('Buy milk');
      expect(result).toContain('#work');
      expect(result).toContain('#urgent');
      expect(result).toContain('#project:Grocery');
      expect(result).toContain('#deadline:2026-05-10');
      expect(result).toContain('#priority:high');
      expect(result).toContain('^id-abc');
      expect(result).toContain('  > [2026-06-08 21:00] remembered at 9pm');
    });

    it('preserves all metadata when only title is updated', () => {
      const md = '- [ ] Old title #work #deadline:2026-05-10 #priority:medium ^id-xyz\n';
      const result = editTaskFullInMarkdown(md, 0, { title: 'New title' });
      expect(result).toContain('- [ ] New title');
      expect(result).toContain('#work');
      expect(result).toContain('#deadline:2026-05-10');
      expect(result).toContain('#priority:medium');
      expect(result).toContain('^id-xyz');
      expect(result).not.toContain('Old title');
    });

    it('clears deadline when explicit empty string is provided', () => {
      const md = '- [ ] Task #work #deadline:2026-05-10 ^id-abc\n';
      const result = editTaskFullInMarkdown(md, 0, { deadline: '' });
      expect(result).toContain('#work');
      expect(result).not.toContain('#deadline:');
      expect(result).toContain('^id-abc');
    });

    it('clears tags when explicit empty array is provided', () => {
      const md = '- [ ] Task #work #urgent ^id-abc\n';
      const result = editTaskFullInMarkdown(md, 0, { tags: [] });
      expect(result).not.toContain('#work');
      expect(result).not.toContain('#urgent');
      expect(result).toContain('Task');
      expect(result).toContain('^id-abc');
    });

    it('replaces existing comments list when comments is provided', () => {
      const md = '- [ ] Task #work ^id-abc\n  > [2026-06-01 10:00] old comment\n';
      const result = editTaskFullInMarkdown(
        md,
        0,
        { comments: [{ text: 'fresh', timestamp: '2026-06-08 12:00' }] },
      );
      expect(result).toContain('#work');
      expect(result).toContain('  > [2026-06-08 12:00] fresh');
      expect(result).not.toContain('old comment');
    });

    it('clears comments when an empty array is provided (delete-all)', () => {
      const md = '- [ ] Task #work ^id-abc\n  > [2026-06-01 10:00] only comment\n';
      const result = editTaskFullInMarkdown(md, 0, { comments: [] });
      expect(result).toContain('Task');
      expect(result).toContain('#work');
      expect(result).not.toContain('only comment');
    });
  });
});

describe('appendTaskToMarkdown', () => {
  it('appends task to empty markdown', () => {
    const task: Task = { id: 't1', title: 'New task', status: 'todo' };
    const result = appendTaskToMarkdown('', task);
    expect(result).toContain('- [ ] New task ^id-t1');
  });

  it('appends task to existing markdown', () => {
    const md = '- [ ] Existing task\n';
    const task: Task = { id: 't2', title: 'New task', status: 'todo' };
    const result = appendTaskToMarkdown(md, task);
    expect(result).toContain('- [ ] Existing task');
    expect(result).toContain('- [ ] New task');
  });

  // Topic Spaces Phase 3: tag inheritance from `kind: 'tag'` ancestor
  // nodes. The `inheritedTags` option is pre-computed by the route and
  // merged into the task line in front of the system metadata.
  it('appends inherited tags from the source mindmap parent chain', () => {
    const task: Task = {
      id: 't_phase3_1',
      title: '新任务',
      status: 'todo',
      tags: ['user-tag'],
      spaceId: 'tw_space_a',
    };
    const result = appendTaskToMarkdown('', task, undefined, {
      inheritedTags: ['inherited-a', 'inherited-b'],
    });
    // User tags come first, inherited tags after, system metadata
    // (`^space:`, `^id-`) at the tail.
    expect(result).toContain('#user-tag');
    expect(result).toContain('#inherited-a');
    expect(result).toContain('#inherited-b');
    expect(result).toContain('^space:tw_space_a');
    expect(result).toContain('^id-t_phase3_1');
    // Order check: inherited tags appear BEFORE the system metadata.
    const inheritedIdx = result.indexOf('#inherited-b');
    const spaceIdx = result.indexOf('^space:');
    expect(inheritedIdx).toBeLessThan(spaceIdx);
  });

  it('does not duplicate a tag that the user already provided', () => {
    const task: Task = {
      id: 't_phase3_2',
      title: 'dedupe test',
      status: 'todo',
      tags: ['shared', 'only-user'],
    };
    const result = appendTaskToMarkdown('', task, undefined, {
      inheritedTags: ['shared', 'only-inherited'],
    });
    // "#shared" should appear exactly once.
    const occurrences = (result.match(/#shared\b/g) || []).length;
    expect(occurrences).toBe(1);
    expect(result).toContain('#only-user');
    expect(result).toContain('#only-inherited');
  });

  // Topic Spaces Phase 2: the `^space:` marker is written whenever
  // the task carries a `spaceId`. The marker sits between the migrated
  // marker and the `^id-` marker.
  it('writes ^space:<id> when the task has a spaceId', () => {
    const task: Task = {
      id: 't_phase2_1',
      title: '主题任务',
      status: 'todo',
      spaceId: 'tw_融资',
    };
    const result = appendTaskToMarkdown('', task);
    expect(result).toContain('^space:tw_融资');
    // Order: ^space: comes before ^id-
    const spaceIdx = result.indexOf('^space:');
    const idIdx = result.indexOf('^id-');
    expect(spaceIdx).toBeGreaterThan(-1);
    expect(idIdx).toBeGreaterThan(spaceIdx);
  });

  it('omits ^space: when the task has no spaceId', () => {
    const task: Task = { id: 't_phase2_2', title: 'no space', status: 'todo' };
    const result = appendTaskToMarkdown('', task);
    expect(result).not.toContain('^space:');
    expect(result).toContain('^id-t_phase2_2');
  });
});

describe('parseMarkdown ^space: round-trip', () => {
  it('populates spaceId when reading a task with the system marker', () => {
    const md = '- [ ] 主题任务 ^space:tw_融资 ^id-t_roundtrip\n';
    const tasks = parseMarkdown(md);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].spaceId).toBe('tw_融资');
    // The marker must not appear in the user-visible title.
    expect(tasks[0].title).toBe('主题任务');
  });

  it('leaves spaceId undefined for tasks without the marker', () => {
    const md = '- [ ] plain task ^id-t_plain\n';
    const tasks = parseMarkdown(md);
    expect(tasks[0].spaceId).toBeUndefined();
  });
});

describe('removeTaskFromMarkdown', () => {
  it('removes task line', () => {
    const md = '- [ ] Task 1\n- [ ] Task 2\n';
    const result = removeTaskFromMarkdown(md, 0);
    expect(result).not.toContain('Task 1');
    expect(result).toContain('Task 2');
  });

  it('removes indented description lines', () => {
    const md = '- [ ] Task\n  Description line 1\n  Description line 2\n- [ ] Next task\n';
    const result = removeTaskFromMarkdown(md, 0);
    expect(result).not.toContain('Task');
    expect(result).not.toContain('Description');
    expect(result).toContain('Next task');
  });

  it('removes multi-paragraph description with blank lines', () => {
    const md = '- [ ] Task\n  Desc line 1\n\n  Desc line 2\n- [ ] Next task\n';
    const result = removeTaskFromMarkdown(md, 0);
    expect(result).not.toContain('Task');
    expect(result).not.toContain('Desc line 1');
    expect(result).not.toContain('Desc line 2');
    expect(result).toContain('Next task');
  });
});

// ---------------------------------------------------------------------------
// Mindmap-origin markers (Phase 3) — ^mm: and ^node: round-trip through
// the parser and every mutation path that preserves metadata.
// ---------------------------------------------------------------------------

describe('parseMarkdown ^mm: / ^node: round-trip', () => {
  it('populates originMindmapId and originNodeId when reading a task with the markers', () => {
    const md = '- [ ] 准备BP ^space:tw_a ^mm:mm_01 ^node:n_01 ^id-t_roundtrip\n';
    const tasks = parseMarkdown(md);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].originMindmapId).toBe('mm_01');
    expect(tasks[0].originNodeId).toBe('n_01');
    // The markers must not leak into the user-visible title.
    expect(tasks[0].title).toBe('准备BP');
    // Space id is still parsed alongside.
    expect(tasks[0].spaceId).toBe('tw_a');
  });

  it('leaves origin fields undefined for tasks without the markers', () => {
    const md = '- [ ] plain task ^id-t_plain\n';
    const tasks = parseMarkdown(md);
    expect(tasks[0].originMindmapId).toBeUndefined();
    expect(tasks[0].originNodeId).toBeUndefined();
  });

  it('tolerates a mindmap marker without a node marker', () => {
    const md = '- [ ] half-linked ^mm:mm_only ^id-t_half\n';
    const tasks = parseMarkdown(md);
    expect(tasks[0].originMindmapId).toBe('mm_only');
    expect(tasks[0].originNodeId).toBeUndefined();
  });
});

describe('appendTaskToMarkdown writes ^mm: and ^node: when origin fields are set', () => {
  it('emits origin markers before the ^id- marker', () => {
    const task: Task = {
      id: 't_new',
      title: '准备BP',
      status: 'todo',
      originMindmapId: 'mm_seed',
      originNodeId: 'n_seed',
    };
    const out = appendTaskToMarkdown('## Tasks\n', task, '2026-08-08');
    const line = out.split('\n').find((l) => l.includes('t_new'))!;
    expect(line).toContain('^mm:mm_seed');
    expect(line).toContain('^node:n_seed');
    // Stable id stays last.
    expect(line.lastIndexOf('^id-')).toBeGreaterThan(line.lastIndexOf('^node:'));
    expect(line.lastIndexOf('^node:')).toBeGreaterThan(line.lastIndexOf('^mm:'));
  });

  it('omits origin markers when the task has no origin fields', () => {
    const task: Task = { id: 't_plain', title: 'plain', status: 'todo' };
    const out = appendTaskToMarkdown('## Tasks\n', task, '2026-08-08');
    const line = out.split('\n').find((l) => l.includes('t_plain'))!;
    expect(line).not.toContain('^mm:');
    expect(line).not.toContain('^node:');
  });
});

describe('editTaskInMarkdown preserves ^mm: and ^node: markers across a title edit', () => {
  it('keeps the origin markers when only the title changes', () => {
    const md = '- [ ] old title #work ^space:tw_a ^mm:mm_1 ^node:n_1 ^id-t_keep\n';
    const out = editTaskInMarkdown(md, 0, 'new title');
    const line = out.split('\n')[0];
    expect(line).toContain('new title');
    expect(line).toContain('^mm:mm_1');
    expect(line).toContain('^node:n_1');
    expect(line).toContain('^space:tw_a');
    expect(line).toContain('^id-t_keep');
  });
});

describe('editTaskFullInMarkdown preserves ^mm: and ^node: markers across a tag edit', () => {
  it('re-emits origin markers when rebuilding the line for a tag update', () => {
    const md = '- [ ] title #old ^space:tw_a ^mm:mm_1 ^node:n_1 ^id-t_full\n';
    const out = editTaskFullInMarkdown(md, 0, { tags: ['new'] }, '2026-08-08');
    const line = out.split('\n')[0];
    expect(line).toContain('#new');
    expect(line).not.toContain('#old');
    expect(line).toContain('^mm:mm_1');
    expect(line).toContain('^node:n_1');
    expect(line).toContain('^space:tw_a');
    expect(line).toContain('^id-t_full');
  });
});
