import { Router } from 'express';
import { z } from 'zod';
import {
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

router.post('/sync/tasks', async (_req, res) => {
  try {
    res.json(await syncFeishuTasks());
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
