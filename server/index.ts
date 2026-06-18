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

const app = express();
const PORT = process.env.PORT || 3003;

// 中间件
// CORS: restrict to Tauri frontend origins and local dev server
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
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
app.use(express.json());

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

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`DailyFlow server running on http://localhost:${PORT}`);
});
