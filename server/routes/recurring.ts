import { Router } from 'express';
import {
  loadRecurringTasks,
  saveRecurringTasks,
  instantiateRecurringTasks,
  type RecurringTask,
} from '../services/recurring.js';

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
    res.json(await instantiateRecurringTasks(date));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
