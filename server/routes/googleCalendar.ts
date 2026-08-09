import { Router } from 'express';
import { z } from 'zod';
import {
  configureGoogleCalendar,
  finishGoogleCalendarAuthorization,
  getGoogleCalendarStatus,
  startGoogleCalendarAuthorization,
} from '../services/googleCalendarSync.js';

const router = Router();

router.get('/status', async (_req, res) => {
  try { res.json(await getGoogleCalendarStatus()); }
  catch (error: any) { res.status(error?.status || 500).json({ error: error?.message || String(error) }); }
});

router.post('/configure', async (req, res) => {
  try {
    const { clientId } = z.object({ clientId: z.string().min(10).max(512) }).parse(req.body);
    await configureGoogleCalendar(clientId);
    res.json(await getGoogleCalendarStatus());
  } catch (error: any) {
    res.status(error?.status || 400).json({ error: error?.message || String(error) });
  }
});

router.post('/auth/start', async (_req, res) => {
  try {
    const port = Number(process.env.PORT ?? 47832);
    const redirectUri = `http://127.0.0.1:${port}/api/google-calendar/auth/callback`;
    res.json(await startGoogleCalendarAuthorization(redirectUri));
  } catch (error: any) {
    res.status(error?.status || 500).json({ error: error?.message || String(error) });
  }
});

router.get('/auth/callback', async (req, res) => {
  try {
    const { state, code } = z.object({ state: z.string(), code: z.string() }).parse(req.query);
    await finishGoogleCalendarAuthorization(state, code);
    res.type('html').send('<!doctype html><meta charset="utf-8"><title>DailyFlow</title><body style="font:16px system-ui;padding:48px"><h2>Google Calendar 已连接</h2><p>可以关闭此页面并返回 DailyFlow。</p><script>setTimeout(()=>window.close(),1500)</script></body>');
  } catch (error: any) {
    res.status(error?.status || 400).type('html').send(`<h2>Google Calendar 连接失败</h2><p>${String(error?.message || error).replace(/[<>&]/g, '')}</p>`);
  }
});

export default router;
