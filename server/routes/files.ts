import { Router } from 'express';
import { readDailyNote, writeDailyNote, listDailyNotes } from '../services/fileSystem.js';
import { loadConfig } from '../services/config.js';

const router = Router();

/**
 * GET /api/files/list - 列出所有日记文件 (must be before /:date)
 */
router.get('/list', async (req, res) => {
  try {
    const config = await loadConfig();
    const files = await listDailyNotes(config);
    res.json({ files });
  } catch (error: any) {
    console.error('Error listing files:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/files/:date - 读取指定日期的日记文件
 */
router.get('/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const config = await loadConfig();
    const note = await readDailyNote(date, config);

    if (!note) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.json(note);
  } catch (error: any) {
    console.error('Error reading file:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/files/:date - 创建新的日记文件
 */
router.post('/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const { content } = req.body;
    const config = await loadConfig();

    await writeDailyNote(date, content, config);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error creating file:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/files/:date - 更新文件内容
 */
router.put('/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const { content } = req.body;
    const config = await loadConfig();

    await writeDailyNote(date, content, config);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error updating file:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
