import { Router } from 'express';
import { previewRollover, applyRollover } from '../services/rollover.js';
import { loadConfig } from '../services/config.js';

const router = Router();

/**
 * POST /api/rollover/preview - 预览任务迁移
 */
router.post('/preview', async (req, res) => {
  try {
    const { toDate, context } = req.body;
    const config = await loadConfig();
    const preview = await previewRollover(toDate, config, context);

    if (!preview) {
      return res.json({ tasksToMigrate: [] });
    }

    res.json(preview);
  } catch (error: any) {
    console.error('Error previewing rollover:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/rollover/apply - 执行任务迁移
 */
router.post('/apply', async (req, res) => {
  try {
    const { toDate, context } = req.body;
    const config = await loadConfig();
    const result = await applyRollover(toDate, config, context);

    res.json(result);
  } catch (error: any) {
    console.error('Error applying rollover:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
