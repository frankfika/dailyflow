import { Router } from 'express';
import { readDailyNote, writeDailyNote } from '../services/fileSystem.js';
import {
  updateTaskInMarkdown,
  editTaskInMarkdown,
  editTaskFullInMarkdown,
  appendTaskToMarkdown,
  removeTaskFromMarkdown,
} from '../services/parser.js';
import { loadConfig } from '../services/config.js';
import { withDateLock } from '../services/lock.js';
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

    await withDateLock(date, async () => {
      const note = await readDailyNote(date, config);
      if (!note) {
        throw Object.assign(new Error('File not found'), { status: 404 });
      }

      // 找到任务
      const task = note.tasks.find(t => t.id === taskId);
      if (!task || task.line === undefined) {
        throw Object.assign(new Error('Task not found'), { status: 404 });
      }

      // 更新 Markdown 内容
      const newContent = updateTaskInMarkdown(note.content, task.line, status);
      await writeDailyNote(date, newContent, config);
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error updating task:', error);
    const status = error?.status ?? 500;
    res.status(status).json({ error: error.message });
  }
});

/**
 * PUT /api/tasks/:taskId - 编辑任务标题/描述（保留元数据）
 */
router.put('/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { date, title, description, comment, comments, tags, deadline, priority, project } = req.body as {
      date: string;
      title?: string;
      description?: string;
      comment?: string;
      comments?: { text: string; timestamp: string }[];
      tags?: string[];
      deadline?: string;
      priority?: 'high' | 'medium' | 'low';
      project?: string;
    };
    const config = await loadConfig();

    await withDateLock(date, async () => {
      // 在锁内重新读取最新内容，避免读到陈旧快照
      const note = await readDailyNote(date, config);
      if (!note) {
        throw Object.assign(new Error('File not found'), { status: 404 });
      }

      const task = note.tasks.find(t => t.id === taskId);
      if (!task || task.line === undefined) {
        throw Object.assign(new Error('Task not found'), { status: 404 });
      }

      // 如果提供了完整的更新数据（tags, deadline等），使用完整编辑
      if (tags !== undefined || deadline !== undefined || priority !== undefined || project !== undefined || comment !== undefined || comments !== undefined) {
        const newContent = editTaskFullInMarkdown(note.content, task.line, {
          title,
          description,
          comment,
          comments,
          tags,
          deadline,
          priority,
          project
        }, date);
        await writeDailyNote(date, newContent, config);
      } else {
        // 否则只更新标题和描述（保留原有元数据）
        const newContent = editTaskInMarkdown(note.content, task.line, title || task.title, description);
        await writeDailyNote(date, newContent, config);
      }
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error editing task:', error);
    const status = error?.status ?? 500;
    res.status(status).json({ error: error.message });
  }
});

/**
 * POST /api/tasks - 创建新任务（仅追加单行，不重写整文件）
 */
router.post('/', async (req, res) => {
  try {
    const { date, task } = req.body as { date: string; task: Task };
    const config = await loadConfig();

    await withDateLock(date, async () => {
      const note = await readDailyNote(date, config);
      const originalContent = note ? note.content : '';

      const newContent = appendTaskToMarkdown(originalContent, task, date);
      await writeDailyNote(date, newContent, config);
    });

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

    await withDateLock(date, async () => {
      const note = await readDailyNote(date, config);
      if (!note) {
        throw Object.assign(new Error('File not found'), { status: 404 });
      }

      const task = note.tasks.find(t => t.id === taskId);
      if (!task || task.line === undefined) {
        throw Object.assign(new Error('Task not found'), { status: 404 });
      }

      const newContent = removeTaskFromMarkdown(note.content, task.line);
      await writeDailyNote(date, newContent, config);
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting task:', error);
    const status = error?.status ?? 500;
    res.status(status).json({ error: error.message });
  }
});

/**
 * PUT /api/tasks/:taskId/space - 改 task 的归属主题空间 (Phase 1 stub)
 *
 * Body: `{ spaceId: string | null, date?: string }`
 *
 * Phase 1 行为: 验证 task 存在, 在内存里把 spaceId 写到 task 对象, 不写
 * markdown (markdown 元数据留给 Phase 4 实现, SPEC §2.3 / §3.4)。
 * 所以这个端点的 response 直接 echo "in-memory patched task"。
 *
 * TODO(topic-spaces/phase-4): 把 `^space:xxx` 注释写进 markdown 行，
 * 让关系可持久化。
 */
router.put('/:taskId/space', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { spaceId, date } = req.body ?? {};
    const config = await loadConfig();

    if (spaceId !== null && typeof spaceId !== 'string') {
      return res.status(400).json({ error: 'spaceId must be a string or null' });
    }

    // 不传 date: 直接 echo 一个最小 Task 对象, 让前端可以把关系存到
    // 本地 state。传 date: 验证 task 存在, 并在 echo 中带上原始字段。
    if (typeof date === 'string' && date) {
      const note = await readDailyNote(date, config);
      if (!note) {
        return res.status(404).json({ error: 'File not found' });
      }
      const existing = note.tasks.find(t => t.id === taskId);
      if (!existing) {
        return res.status(404).json({ error: 'Task not found' });
      }
      const patched: Task = {
        ...existing,
        spaceId: spaceId ?? undefined,
      };
      // Phase 1: 不写 markdown; 仅返回 echo。
      return res.json({ success: true, task: patched, persisted: false });
    }

    const echo: Task = {
      id: taskId,
      title: '',
      status: 'todo',
      spaceId: spaceId ?? undefined,
    };
    return res.json({ success: true, task: echo, persisted: false });
  } catch (error: any) {
    console.error('Error setting task space:', error);
    const status = error?.status ?? 500;
    res.status(status).json({ error: error.message });
  }
});

export default router;
