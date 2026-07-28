import { Router } from 'express';
import { loadConfig } from '../services/config.js';
import { instantiateRecurringTasks } from '../services/recurring.js';
import { applyRollover } from '../services/rollover.js';

const router = Router();

router.post('/:date/initialize', async (req, res) => {
  try {
    const { date } = req.params;
    const context = req.body?.context === 'life' ? 'life' : 'work';
    const config = await loadConfig();
    const recurring = await instantiateRecurringTasks(date, config);
    const rollover = config.rolloverTrigger === 'on_app_open'
      ? await applyRollover(date, config, context)
      : { success: true, migratedCount: 0 };
    res.json({
      commandId: `daily-initialize:${config.activeWorkspaceId || 'default'}:${date}:${context}`,
      recurringCreated: recurring.created,
      migratedCount: rollover.migratedCount,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
