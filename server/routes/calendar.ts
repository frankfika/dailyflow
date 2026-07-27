import { Router } from 'express';
import { getCalendarWorkspace } from '../services/calendarWorkspace.js';
import { listConnectorPlugins } from '../services/connectorPlugins.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const start = String(req.query.start || '');
    const end = String(req.query.end || '');
    res.json(await getCalendarWorkspace(start, end));
  } catch (error: any) {
    res.status(error?.status || 500).json({ error: error?.message || String(error) });
  }
});

router.get('/plugins', async (_req, res) => {
  try {
    const items = await Promise.all(listConnectorPlugins().map(async plugin => ({
      ...plugin.manifest,
      connection: await plugin.getStatus(),
    })));
    res.json({ items });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || String(error) });
  }
});

export default router;
