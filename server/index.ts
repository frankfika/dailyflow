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

const app = express();
const PORT = process.env.PORT || 3003;

// 中间件
app.use(cors({ origin: true, credentials: true }));
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

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`DailyFlow server running on http://localhost:${PORT}`);
});
