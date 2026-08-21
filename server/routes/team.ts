import { Router } from 'express';
import { loadConfig } from '../services/config.js';
import {
  gitCommit,
  gitFetch,
  gitPull,
  gitPush,
  gitStatus,
  isLeader,
  isTeamMode,
  listMemberPaths,
} from '../services/gitSync.js';
import {
  getMemberNote,
  listMemberDates,
  listMemberNotes,
  listMemberTasks,
  readMemberDailyNote,
  buildTaskTimeline,
} from '../services/teamService.js';

const router = Router();

function handleError(err: unknown, res: import('express').Response) {
  const message = err instanceof Error ? err.message : String(err);
  console.error('[team]', message);
  const status = typeof (err as { status?: unknown })?.status === 'number'
    ? (err as { status: number }).status
    : 500;
  res.status(status).json({ error: message });
}

router.get('/members', async (_req, res) => {
  try {
    const config = await loadConfig();
    if (!isTeamMode(config)) {
      res.json({ enabled: false, members: [] });
      return;
    }
    res.json({ enabled: true, role: config.team!.role, members: listMemberPaths(config) });
  } catch (err) { handleError(err, res); }
});

router.get('/members/:memberId/tasks/:date', async (req, res) => {
  try {
    const config = await loadConfig();
    if (!isLeader(config)) {
      res.status(403).json({ error: 'Only leader can view member tasks' });
      return;
    }
    const { memberId, date } = req.params;
    const note = await readMemberDailyNote(config, memberId, date);
    const tasks = note?.tasks ?? [];
    res.json({ date, tasks, note: note ?? null });
  } catch (err) { handleError(err, res); }
});

router.get('/members/:memberId/dates', async (req, res) => {
  try {
    const config = await loadConfig();
    if (!isLeader(config)) {
      res.status(403).json({ error: 'Only leader can view member dates' });
      return;
    }
    const dates = await listMemberDates(config, req.params.memberId);
    res.json({ dates });
  } catch (err) { handleError(err, res); }
});

router.get('/members/:memberId/notes', async (req, res) => {
  try {
    const config = await loadConfig();
    if (!isLeader(config)) {
      res.status(403).json({ error: 'Only leader can view member notes' });
      return;
    }
    const notes = await listMemberNotes(config, req.params.memberId);
    res.json({ notes });
  } catch (err) { handleError(err, res); }
});

router.get('/members/:memberId/notes/:noteId', async (req, res) => {
  try {
    const config = await loadConfig();
    if (!isLeader(config)) {
      res.status(403).json({ error: 'Only leader can view member notes' });
      return;
    }
    const note = await getMemberNote(config, req.params.memberId, req.params.noteId);
    if (!note) { res.status(404).json({ error: 'Note not found' }); return; }
    res.json({ note });
  } catch (err) { handleError(err, res); }
});

router.get('/status', async (_req, res) => {
  try {
    const config = await loadConfig();
    if (!isTeamMode(config)) { res.json({ enabled: false }); return; }
    const status = await gitStatus(config.workspaceRoot);
    res.json({ enabled: true, status });
  } catch (err) { handleError(err, res); }
});

router.post('/sync', async (_req, res) => {
  try {
    const config = await loadConfig();
    if (!isTeamMode(config)) {
      res.status(400).json({ error: 'Team mode not enabled' });
      return;
    }
    await gitCommit(config.workspaceRoot, 'DailyFlow team sync');
    await gitFetch(config.workspaceRoot);
    await gitPull(config.workspaceRoot);
    await gitPush(config.workspaceRoot);
    const status = await gitStatus(config.workspaceRoot);
    res.json({ ok: true, status });
  } catch (err) { handleError(err, res); }
});

router.get('/members/:memberId/tasks/:date/timeline', async (req, res) => {
  try {
    const config = await loadConfig();
    if (!isLeader(config)) {
      res.status(403).json({ error: 'Only leader can view member task timeline' });
      return;
    }
    const { memberId, date } = req.params;
    const taskId = req.query.taskId as string | undefined;
    if (!taskId) {
      res.status(400).json({ error: 'taskId query param is required' });
      return;
    }
    const timeline = await buildTaskTimeline(config, memberId, date, taskId);
    res.json({ timeline });
  } catch (err) { handleError(err, res); }
});

export default router;
