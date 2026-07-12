import express from 'express';
import cors from 'cors';
import filesRouter from './routes/files.js';
import tasksRouter from './routes/tasks.js';
import rolloverRouter from './routes/rollover.js';
import configRouter from './routes/config.js';
import projectsRouter from './routes/projects.js';
import gitRouter from './routes/git.js';
import notesRouter from './routes/notes.js';
import promptsRouter from './routes/prompts.js';
import aiRouter from './routes/ai.js';
import recurringRouter from './routes/recurring.js';
import ipfsRouter from './routes/ipfs.js';
import thinkingWorkspacesRouter from './routes/thinkingWorkspaces.js';
import meetingsRouter from './routes/meetings.js';

const app = express();
const PORT = process.env.PORT || 3003;
const IS_PROD = process.env.NODE_ENV === 'production';

// 中间件
// CORS: restrict to Tauri frontend origins and local dev server
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  'https://localhost:5173',
  'tauri://localhost',
];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
// Body limit raised to 200mb so a 1h recording (base64-encoded WebM ~ 80MB
// for a typical meeting) fits in a single POST to /api/meetings/transcribe.
// Other routes stay under 10mb; this is a safe ceiling for the audio path.
app.use(express.json({ limit: '200mb' }));

// Security headers (without bringing in helmet as a dependency).
// We deliberately do NOT set HSTS — per security-best-practices, HSTS can
// lock users out if mis-set, and the local dev server is not over TLS.
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  next();
});

// 路由
app.use('/api/files', filesRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/rollover', rolloverRouter);
app.use('/api/config', configRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/git', gitRouter);
app.use('/api/notes', notesRouter);
app.use('/api/prompts', promptsRouter);
app.use('/api/ai', aiRouter);
app.use('/api/recurring', recurringRouter);
app.use('/api/ipfs', ipfsRouter);
app.use('/api/thinking-workspaces', thinkingWorkspacesRouter);
app.use('/api/meetings', meetingsRouter);

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler — never leak stack traces / internal messages to the
// client in production. In dev we still keep the message but strip the
// stack so that an attacker who can reach this server doesn't get the full
// filesystem path / source layout for free.
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[error]', err);
  const status = typeof err?.status === 'number' ? err.status : 500;
  res.status(status).json({
    error: IS_PROD ? 'Internal server error' : (err?.message || 'Internal server error'),
  });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`DailyFlow server running on http://localhost:${PORT}`);
});
