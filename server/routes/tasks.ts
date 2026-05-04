import { Router } from 'express';
import { readDailyNote, writeDailyNote } from '../services/fileSystem.js';
import {
  updateTaskInMarkdown,
  editTaskInMarkdown,
  appendTaskToMarkdown,
  removeTaskFromMarkdown,
} from '../services/parser.js';
import { loadConfig } from '../services/config.js';
import type { Task } from '../types/task.js';

const router = Router();

/**
 * GET /api/tasks/:date - 获取指定日期的所有任务
 */
router.get('/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const config = await loadConfig();
    const note = await readDailyNote(date, config);

    if (!note) {
      return res.json({ tasks: [] });
    }

    res.json({ tasks: note.tasks });
  } catch (error: any) {
    console.error('Error reading tasks:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/tasks/:taskId - 更新任务状态
 */
router.patch('/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { status, date } = req.body;
    const config = await loadConfig();

    const note = await readDailyNote(date, config);
    if (!note) {
      return res.status(404).json({ error: 'File not found' });
    }

    // 找到任务
    const task = note.tasks.find(t => t.id === taskId);
    if (!task || task.line === undefined) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // 更新 Markdown 内容
    const newContent = updateTaskInMarkdown(note.content, task.line, status);
    await writeDailyNote(date, newContent, config);

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error updating task:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/tasks/:taskId - 编辑任务标题/描述（保留元数据）
 */
router.put('/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { date, title, description } = req.body as {
      date: string;
      title: string;
      description?: string;
    };
    const config = await loadConfig();

    const note = await readDailyNote(date, config);
    if (!note) {
      return res.status(404).json({ error: 'File not found' });
    }

    const task = note.tasks.find(t => t.id === taskId);
    if (!task || task.line === undefined) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const newContent = editTaskInMarkdown(note.content, task.line, title, description);
    await writeDailyNote(date, newContent, config);

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error editing task:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/tasks - 创建新任务（仅追加单行，不重写整文件）
 */
router.post('/', async (req, res) => {
  try {
    const { date, task } = req.body as { date: string; task: Task };
    const config = await loadConfig();

    const note = await readDailyNote(date, config);
    const originalContent = note ? note.content : '';

    const newContent = appendTaskToMarkdown(originalContent, task, date);
    await writeDailyNote(date, newContent, config);

    res.json({ success: true, task });
  } catch (error: any) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/tasks/:taskId - 删除任务（按行号删除，保留其他内容）
 */
router.delete('/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { date } = req.body;
    const config = await loadConfig();

    const note = await readDailyNote(date, config);
    if (!note) {
      return res.status(404).json({ error: 'File not found' });
    }

    const task = note.tasks.find(t => t.id === taskId);
    if (!task || task.line === undefined) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const newContent = removeTaskFromMarkdown(note.content, task.line);
    await writeDailyNote(date, newContent, config);

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting task:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
