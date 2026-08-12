import express from 'express';
import cors from 'cors';
import filesRouter from './routes/files.js';
import tasksRouter from './routes/tasks.js';
import rolloverRouter from './routes/rollover.js';
import configRouter from './routes/config.js';
import notesRouter from './routes/notes.js';
import promptsRouter from './routes/prompts.js';
import aiRouter from './routes/ai.js';
import recurringRouter from './routes/recurring.js';
import ipfsRouter from './routes/ipfs.js';
import feishuRouter from './routes/feishu.js';
import calendarRouter from './routes/calendar.js';
import googleCalendarRouter from './routes/googleCalendar.js';
import dailyRouter from './routes/daily.js';
import mindmapsRouter from './routes/mindmaps.js';
import topicSpacesRouter from './routes/topicSpaces.js';
import diagnosticsRouter from './routes/diagnostics.js';
import eventsRouter from './routes/events.js';
import { v2Router } from './routes/v2/index.js';

const app = express();
const PORT = Number(process.env.PORT ?? 47832);
const IS_PROD = process.env.NODE_ENV === 'production';

// 中间件
// CORS: restrict to Tauri frontend origins and local dev server.
// Development uses a dedicated high port. The regex remains as a convenience
// for local tooling that explicitly overrides the frontend port.
const ALLOWED_ORIGINS = [
  'http://localhost:47831',
  'http://localhost:5173',
  'https://localhost:5173',
  'tauri://localhost',
  // Tauri v2's production custom protocol is exposed as a local HTTP(S)
  // origin by WKWebView on macOS. Keep both schemes because the exact one
  // depends on the platform/custom-protocol configuration.
  'http://tauri.localhost',
  'https://tauri.localhost',
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
// Meeting audio is currently base64 encoded, so only its canonical v2 capture
// endpoint receives the larger parser. Keep every other API at a conservative
// ceiling instead of exposing the whole local server to 200 MB JSON bodies.
app.use('/api/v2/notes/:id/meeting/capture', express.json({ limit: '200mb' }));
app.use(express.json({ limit: '10mb' }));

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
app.use('/api/notes', notesRouter);
app.use('/api/prompts', promptsRouter);
app.use('/api/ai', aiRouter);
app.use('/api/recurring', recurringRouter);
app.use('/api/ipfs', ipfsRouter);
app.use('/api/feishu', feishuRouter);
app.use('/api/calendar', calendarRouter);
app.use('/api/google-calendar', googleCalendarRouter);
app.use('/api/daily', dailyRouter);
app.use('/api/mindmaps', mindmapsRouter);
app.use('/api/topic-spaces', topicSpacesRouter);
app.use('/api/diagnostics', diagnosticsRouter);
app.use('/api/events', eventsRouter);
app.use('/api/v2', v2Router);

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
  console.error('[error]', err instanceof Error ? err.message : String(err));
  const status = typeof err?.status === 'number' ? err.status : 500;
  res.status(status).json({
    error: IS_PROD ? 'Internal server error' : (err?.message || 'Internal server error'),
  });
});

// 启动服务器
app.listen(PORT, '127.0.0.1', () => {
  console.log(`DailyFlow server running on http://localhost:${PORT}`);
});
