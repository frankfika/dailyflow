import { Router } from 'express';
import {
  getGitStatus,
  commitChanges,
  pushToRemote,
  initGitRepo,
  setRemoteRepo,
} from '../services/git.js';
import { loadConfig } from '../services/config.js';

const router = Router();

/**
 * GET /api/git/status - 获取 Git 仓库状态
 */
router.get('/status', async (req, res) => {
  try {
    const status = await getGitStatus();
    res.json(status);
  } catch (error: any) {
    console.error('Error getting git status:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/git/commit - 提交更改
 */
router.post('/commit', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Commit message is required' });
    }

    const result = await commitChanges(message);
    res.json(result);
  } catch (error: any) {
    console.error('Error committing changes:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/git/push - 推送到远程仓库
 */
router.post('/push', async (req, res) => {
  try {
    const result = await pushToRemote();
    res.json(result);
  } catch (error: any) {
    console.error('Error pushing to remote:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/git/sync - 提交并推送（一键同步）
 */
router.post('/sync', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Commit message is required' });
    }

    const config = await loadConfig();

    // 0. 确保 git 仓库已初始化并设置了 remote
    const initResult = await initGitRepo();
    if (!initResult.success) {
      return res.json({
        success: false,
        error: initResult.error,
        stage: 'init',
      });
    }

    if (config.githubRepo && config.githubToken) {
      const repoPath = config.githubRepo.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '');
      const remoteUrl = `https://${config.githubToken}@github.com/${repoPath}.git`;
      const remoteResult = await setRemoteRepo(remoteUrl);
      if (!remoteResult.success) {
        return res.json({
          success: false,
          error: remoteResult.error,
          stage: 'remote',
        });
      }
    }

    // 1. 提交更改
    const commitResult = await commitChanges(message);
    if (!commitResult.success) {
      return res.json({
        success: false,
        error: commitResult.error,
        stage: 'commit',
      });
    }

    // 2. 推送到远程
    const pushResult = await pushToRemote();
    if (!pushResult.success) {
      return res.json({
        success: false,
        error: pushResult.error,
        stage: 'push',
        commitHash: commitResult.commitHash,
      });
    }

    res.json({
      success: true,
      commitHash: commitResult.commitHash,
      message: 'Changes committed and pushed successfully',
    });
  } catch (error: any) {
    console.error('Error syncing:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/git/init - 初始化 Git 仓库
 */
router.post('/init', async (req, res) => {
  try {
    const result = await initGitRepo();
    res.json(result);
  } catch (error: any) {
    console.error('Error initializing git repo:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/git/set-remote - 设置远程仓库
 */
router.post('/set-remote', async (req, res) => {
  try {
    const config = await loadConfig();
    const repoUrl = config.githubRepo;

    if (!repoUrl) {
      return res.status(400).json({ error: 'GitHub repository not configured' });
    }

    const result = await setRemoteRepo(repoUrl);
    res.json(result);
  } catch (error: any) {
    console.error('Error setting remote repo:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
