import { Router } from 'express';
import { readDailyNote, writeDailyNote } from '../services/fileSystem.js';
import {
  updateTaskInMarkdown,
  editTaskInMarkdown,
  editTaskFullInMarkdown,
  appendTaskToMarkdown,
  removeTaskFromMarkdown,
  parseMarkdown,
} from '../services/parser.js';
import { setSpaceMarker } from '../services/taskMetadata.js';
import {
  addTaskIdToTopicSpace,
  removeTaskIdFromTopicSpace,
  findTopicSpaceByTaskId,
  getTopicSpace,
} from '../services/topicSpaces.js';
import { loadConfig } from '../services/config.js';
import { withDateLock } from '../services/lock.js';
import { invalidateTaskIndex } from '../services/taskIndex.js';
import { listMindMaps, updateNodeInMindMap } from '../services/mindmaps.js';
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

    const updatedTask = await withDateLock(date, async () => {
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
      return task;
    });

    if (updatedTask.originMindmapId && updatedTask.originNodeId) {
      await updateNodeInMindMap(updatedTask.originMindmapId, updatedTask.originNodeId, {
        status: status === 'done' ? 'done' : 'todo',
      });
    }

    // Status change does not move the task between files, but the
    // index memo includes parsed task objects that downstream readers
    // may cache — drop it so the next read sees the new status.
    invalidateTaskIndex();

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

    const editedTask = await withDateLock(date, async () => {
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
      return task;
    });

    if (editedTask.originMindmapId && editedTask.originNodeId && title !== undefined) {
      await updateNodeInMindMap(editedTask.originMindmapId, editedTask.originNodeId, { text: title });
    }

    invalidateTaskIndex();

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

    // A new task id joined the workspace — the cached index no longer
    // knows about it. Drop the memo so the next cross-date lookup
    // rebuilds and picks the new id up.
    invalidateTaskIndex();

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

    const deletedTask = await withDateLock(date, async () => {
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
      return task;
    });

    // A Task is authoritative for execution, but its mind-map node is a
    // durable planning projection. Deleting the Task therefore keeps the
    // node and turns it back into a regular branch.
    if (deletedTask.originMindmapId && deletedTask.originNodeId) {
      const updated = await updateNodeInMindMap(
        deletedTask.originMindmapId,
        deletedTask.originNodeId,
        { kind: 'branch', taskId: undefined, taskDate: undefined, status: 'todo' },
      );
      if (!updated) {
        console.warn(
          `[tasks] deleted ${taskId}, but its source node ` +
          `${deletedTask.originMindmapId}/${deletedTask.originNodeId} no longer exists`,
        );
      }
    }
    // Legacy linked tasks may predate persisted ^mm/^node markers. Scan
    // mindmaps by taskId as a compatibility fallback so deletion cannot
    // leave a kind:'task' projection pointing at a missing Task.
    const maps = await listMindMaps();
    for (const map of maps) {
      for (const node of map.nodes) {
        if (node.taskId !== taskId) continue;
        if (map.id === deletedTask.originMindmapId && node.id === deletedTask.originNodeId) continue;
        await updateNodeInMindMap(map.id, node.id, {
          kind: 'branch',
          taskId: undefined,
          taskDate: undefined,
          status: 'todo',
        });
      }
    }
    const owningSpace = await findTopicSpaceByTaskId(taskId);
    if (owningSpace) {
      await removeTaskIdFromTopicSpace(owningSpace.id, taskId);
    }

    // The task is gone — drop the memo so stale entries don't linger.
    invalidateTaskIndex();

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting task:', error);
    const status = error?.status ?? 500;
    res.status(status).json({ error: error.message });
  }
});

/**
 * PUT /api/tasks/:taskId/space
 *
 * Body: `{ spaceId: string | null, date?: string }`
 *
 * Phase 2 行为: 把 task 绑到 / 解绑一个 topic space, 把
 * `^space:<id>` 标记 (或移除) 写进 markdown 行, 并同步更新
 * TopicSpace.taskIds (双向).
 *
 * - `spaceId` 为 string: 验证 space 存在, 写 ^space:<id>, 把
 *   taskId 加到新 space 的 taskIds, 从旧 space (如果有) 移除.
 * - `spaceId` 为 null: 找到当前持有这个 task 的 space (如果有),
 *   从它的 taskIds 移除, 然后从 markdown 行移除 ^space:xxx 标记.
 * - `date` 必须传, 这样我们能定位到 daily note 文件; Phase 1 的
 *   无 date echo-only 模式已经废弃.
 *
 * Status codes:
 *   200 — marker written/cleared, taskIds updated
 *   400 — body invalid (e.g. unknown spaceId)
 *   404 — task / daily note / topic space not found
 */
router.put('/:taskId/space', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { spaceId, date } = (req.body ?? {}) as {
      spaceId?: string | null;
      date?: string;
    };

    if (spaceId === undefined) {
      return res.status(400).json({ error: 'spaceId is required (string or null)' });
    }
    if (spaceId !== null && typeof spaceId !== 'string') {
      return res.status(400).json({ error: 'spaceId must be a string or null' });
    }
    if (typeof date !== 'string' || !date) {
      return res.status(400).json({ error: 'date is required' });
    }

    const config = await loadConfig();

    // 1. Find the current space, if any, so we can update both sides
    //    of the relationship in one request.
    const previousSpace = await findTopicSpaceByTaskId(taskId);

    // 2. Validate the target space (when not clearing).
    if (spaceId !== null) {
      const target = await getTopicSpace(spaceId);
      if (!target) {
        return res.status(400).json({ error: `Topic space ${spaceId} not found` });
      }
      if (previousSpace && previousSpace.id === spaceId) {
        // No-op re-bind: marker is already correct on disk. Just echo.
        return res.json({ success: true, task: { id: taskId, spaceId }, persisted: true });
      }
    }

    // 3. Update the markdown file under the date lock. We have to
    //    read-modify-write the file because the system marker lives
    //    on the existing task line.
    const patchedTask = await withDateLock(date, async () => {
      const note = await readDailyNote(date, config);
      if (!note) {
        throw Object.assign(new Error('File not found'), { status: 404 });
      }
      const tasks = parseMarkdown(note.content);
      const task = tasks.find(t => t.id === taskId);
      if (!task || task.line === undefined) {
        throw Object.assign(new Error('Task not found'), { status: 404 });
      }
      const lines = note.content.split('\n');
      const originalLine = lines[task.line];
      const nextLine = setSpaceMarker(originalLine, spaceId);
      if (nextLine === originalLine) {
        // The line was already in the desired state. No rewrite.
        return { ...task, spaceId: spaceId ?? undefined };
      }
      lines[task.line] = nextLine;
      await writeDailyNote(date, lines.join('\n'), config);
      return { ...task, spaceId: spaceId ?? undefined };
    });

    // 4. Update the topic-space side of the relationship. The order
    //    matters: when re-binding from A to B, we add to B first, then
    //    remove from A. If the order were reversed and the add failed,
    //    we'd be left with the task bound to no space at all.
    if (spaceId !== null) {
      await addTaskIdToTopicSpace(spaceId, taskId);
    }
    if (previousSpace && previousSpace.id !== spaceId) {
      await removeTaskIdFromTopicSpace(previousSpace.id, taskId);
    }

    // The task line was rewritten (marker added/cleared); the cached
    // index holds the old parsed line. Drop it so the next read picks
    // up the new marker state.
    invalidateTaskIndex();

    res.json({ success: true, task: patchedTask, persisted: true });
  } catch (error: any) {
    console.error('Error setting task space:', error);
    const status = error?.status ?? 500;
    res.status(status).json({ error: error.message });
  }
});

export default router;
