import { Router } from 'express';
import { loadConfig, saveConfig } from '../services/config.js';
import fs from 'fs/promises';
import path from 'path';

const router = Router();

/**
 * GET /api/config - 获取当前配置
 */
router.get('/', async (req, res) => {
  try {
    const config = await loadConfig();
    res.json(config);
  } catch (error: any) {
    console.error('Error loading config:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/config - 更新配置
 */
router.post('/', async (req, res) => {
  try {
    const config = req.body;
    await saveConfig(config);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error saving config:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/config/validate-path - 验证工作区路径
 */
router.post('/validate-path', async (req, res) => {
  try {
    const { path: workspacePath } = req.body;

    if (!workspacePath) {
      return res.json({ valid: false, error: 'Path is required' });
    }

    // 检查路径是否存在
    try {
      const stats = await fs.stat(workspacePath);
      if (!stats.isDirectory()) {
        return res.json({ valid: false, error: 'Path is not a directory' });
      }

      // 检查是否有读写权限
      await fs.access(workspacePath, fs.constants.R_OK | fs.constants.W_OK);

      res.json({ valid: true });
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // 路径不存在，尝试创建
        try {
          await fs.mkdir(workspacePath, { recursive: true });
          res.json({ valid: true, created: true });
        } catch (createError: any) {
          res.json({ valid: false, error: 'Cannot create directory' });
        }
      } else if (error.code === 'EACCES') {
        res.json({ valid: false, error: 'Permission denied' });
      } else {
        res.json({ valid: false, error: error.message });
      }
    }
  } catch (error: any) {
    console.error('Error validating path:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/config/check-first-run - 检查是否首次运行
 */
router.get('/check-first-run', async (req, res) => {
  try {
    const config = await loadConfig();
    // 如果工作区路径不存在，认为是首次运行
    try {
      await fs.access(config.workspaceRoot, fs.constants.R_OK);
      res.json({ isFirstRun: false });
    } catch {
      res.json({ isFirstRun: true });
    }
  } catch (error: any) {
    console.error('Error checking first run:', error);
    res.json({ isFirstRun: true });
  }
});

/**
 * POST /api/config/validate-github - 验证 GitHub 仓库链接
 */
router.post('/validate-github', async (req, res) => {
  try {
    const { repoUrl } = req.body;

    if (!repoUrl) {
      return res.json({ valid: false, error: 'Repository URL is required' });
    }

    // 验证 URL 格式
    const githubUrlPattern = /^https?:\/\/(www\.)?github\.com\/[\w-]+\/[\w.-]+\/?$/;
    if (!githubUrlPattern.test(repoUrl)) {
      return res.json({ valid: false, error: 'Invalid GitHub repository URL format' });
    }

    // 尝试访问仓库（使用 fetch）
    try {
      const apiUrl = repoUrl.replace('github.com', 'api.github.com/repos');
      const response = await fetch(apiUrl);

      if (response.ok) {
        const data = await response.json();
        res.json({
          valid: true,
          repoName: data.full_name,
          isPrivate: data.private
        });
      } else if (response.status === 404) {
        res.json({ valid: false, error: 'Repository not found' });
      } else if (response.status === 403) {
        res.json({ valid: false, error: 'Access forbidden (may be private)' });
      } else {
        res.json({ valid: false, error: 'Failed to access repository' });
      }
    } catch (fetchError: any) {
      res.json({ valid: false, error: 'Network error: ' + fetchError.message });
    }
  } catch (error: any) {
    console.error('Error validating GitHub repo:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
