import { Router } from 'express';
import { z } from 'zod';
import {
  createFeishuCalendarEvent,
  finishFeishuAuthorization,
  finishFeishuSetup,
  getFeishuAgenda,
  getFeishuAuthStatus,
  getFeishuSyncState,
  logoutFeishuAuthorization,
  pushTimedNotesToFeishu,
  startFeishuAuthorization,
  startFeishuSetup,
  syncFeishuTasks,
} from '../services/feishuSync.js';

const router = Router();

function sendError(res: any, error: any) {
  const status = typeof error?.status === 'number' ? error.status : 500;
  res.status(status).json({
    error: error?.message || String(error),
    code: error?.code,
    missingScopes: error?.missingScopes,
    consoleUrl: error?.consoleUrl,
  });
}

router.get('/status', async (_req, res) => {
  try {
    const [auth, sync] = await Promise.all([getFeishuAuthStatus(), getFeishuSyncState()]);
    res.json({ ...auth, ...sync });
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/auth/start', async (_req, res) => {
  try {
    res.json(await startFeishuAuthorization());
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/setup/start', async (_req, res) => {
  try {
    res.json(await startFeishuSetup());
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/setup/finish', async (_req, res) => {
  try {
    res.json(await finishFeishuSetup());
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/auth/finish', async (req, res) => {
  try {
    const { deviceCode } = z.object({ deviceCode: z.string().min(1).max(512) }).parse(req.body);
    res.json(await finishFeishuAuthorization(deviceCode));
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/auth/logout', async (_req, res) => {
  try {
    res.json(await logoutFeishuAuthorization());
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/sync/tasks', async (req, res) => {
  try {
    const { taskIds } = z.object({
      taskIds: z.array(z.string().min(1).max(128)).min(1).max(100).optional(),
    }).parse(req.body || {});
    res.json(await syncFeishuTasks({ taskIds }));
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/calendar/events', async (req, res) => {
  try {
    const input = z.object({
      title: z.string().trim().min(1).max(200),
      description: z.string().max(5000).optional(),
      start: z.string().datetime({ offset: true }),
      end: z.string().datetime({ offset: true }),
    }).parse(req.body);
    res.status(201).json(await createFeishuCalendarEvent({
      title: input.title!,
      description: input.description,
      start: input.start!,
      end: input.end!,
    }));
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/sync/calendar', async (_req, res) => {
  try {
    res.json(await pushTimedNotesToFeishu());
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/agenda', async (req, res) => {
  try {
    const { start, end } = z.object({
      start: z.string().min(10).max(64),
      end: z.string().min(10).max(64),
    }).parse(req.query);
    res.json({ events: await getFeishuAgenda(start, end) });
  } catch (error) {
    sendError(res, error);
  }
});

export default router;
