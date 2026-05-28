import { Router } from 'express';
import {
  loadRecurringTasks,
  saveRecurringTasks,
  shouldFireOnDate,
  type RecurringTask,
} from '../services/recurring.js';
import { readDailyNote } from '../services/fileSystem.js';
import { appendTaskToMarkdown } from '../services/parser.js';
import { loadConfig } from '../services/config.js';
import { writeDailyNote } from '../services/fileSystem.js';

const router = Router();

/**
 * GET /api/recurring - List all recurring tasks
 */
router.get('/', async (_req, res) => {
  try {
    const tasks = await loadRecurringTasks();
    res.json(tasks);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/recurring - Create a recurring task
 */
router.post('/', async (req, res) => {
  try {
    const task: RecurringTask = {
      ...req.body,
      id: `rec_${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    const tasks = await loadRecurringTasks();
    tasks.push(task);
    await saveRecurringTasks(tasks);
    res.json(task);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/recurring/:id - Delete a recurring task
 */
router.delete('/:id', async (req, res) => {
  try {
    const tasks = await loadRecurringTasks();
    const filtered = tasks.filter(t => t.id !== req.params.id);
    await saveRecurringTasks(filtered);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/recurring/instantiate - Create instances of recurring tasks for a given date
 * Called when loading a day's tasks. Idempotent: won't create duplicates.
 */
router.post('/instantiate', async (req, res) => {
  try {
    const { date } = req.body;
    const config = await loadConfig();
    const recurringTasks = await loadRecurringTasks();

    const tasksToFire = recurringTasks.filter(rt => shouldFireOnDate(rt.recurrence, date));
    if (tasksToFire.length === 0) {
      return res.json({ created: 0 });
    }

    const note = await readDailyNote(date, config);
    const existingContent = note ? note.content : '';
    const existingTasks = note ? note.tasks : [];

    let content = existingContent;
    let created = 0;

    for (const rt of tasksToFire) {
      const alreadyExists = existingTasks.some(
        t => t.title === rt.title && t.tags?.includes('recurring')
      );
      if (alreadyExists) continue;

      const tags = [...(rt.tags || [])];
      if (!tags.includes('recurring')) tags.push('recurring');
      if (!tags.some(t => ['work', 'life'].includes(t))) {
        tags.push('work');
      }

      const newTask = {
        id: `t_${Date.now()}_${created}`,
        title: rt.title,
        description: rt.description,
        status: 'todo' as const,
        tags,
        priority: rt.priority,
        project: rt.project,
        source_date: date,
      };

      content = appendTaskToMarkdown(content, newTask, date);
      created++;
    }

    if (created > 0) {
      await writeDailyNote(date, content, config);
    }

    res.json({ created });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
