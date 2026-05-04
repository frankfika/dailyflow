import { Router } from 'express';
import { loadConfig, saveConfig } from '../services/config.js';

const router = Router();

/**
 * GET /api/config - 获取当前配置
 */
router.get('/', async (req, res) => {
  try {
    const config = await loadConfig();
    res.json(config);
  } catch (error: any) {
    console.error('Error loading config:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/config - 更新配置
 */
router.post('/', async (req, res) => {
  try {
    const config = req.body;
    await saveConfig(config);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error saving config:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
