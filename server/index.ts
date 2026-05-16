import express from 'express';
import cors from 'cors';
import filesRouter from './routes/files.js';
import tasksRouter from './routes/tasks.js';
import rolloverRouter from './routes/rollover.js';
import configRouter from './routes/config.js';
import projectsRouter from './routes/projects.js';
import gitRouter from './routes/git.js';

const app = express();
const PORT = process.env.PORT || 3003;

// 中间件
app.use(cors({ origin: ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:1420', 'http://127.0.0.1:3000', 'http://127.0.0.1:5173'] }));
app.use(express.json());

// 路由
app.use('/api/files', filesRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/rollover', rolloverRouter);
app.use('/api/config', configRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/git', gitRouter);

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`DailyFlow server running on http://localhost:${PORT}`);
});
