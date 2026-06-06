import { Router } from 'express';
import { loadConfig, saveConfig, generateWorkspaceId } from '../services/config.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { Workspace } from '../types/task.js';

const execAsync = promisify(exec);
const router = Router();

/**
 * Normalize a workspace path so equivalent inputs compare equal:
 * expands ~, resolves to absolute, strips trailing slash, follows symlinks,
 * and on macOS/Windows lowercases for case-insensitive comparison.
 * Falls back to the absolute form if realpath fails (path may not exist yet).
 */
async function canonicalizeWorkspacePath(input: string): Promise<string> {
  let p = input.trim();
  if (p.startsWith('~')) p = path.join(os.homedir(), p.slice(1));
  let abs = path.resolve(p);
  try {
    abs = await fs.realpath(abs);
  } catch {
    // path may not exist yet — keep resolved form
  }
  // Drop trailing separator (except root)
  if (abs.length > 1 && (abs.endsWith('/') || abs.endsWith('\\'))) {
    abs = abs.slice(0, -1);
  }
  if (process.platform === 'darwin' || process.platform === 'win32') {
    abs = abs.toLowerCase();
  }
  return abs;
}

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
 * 判定：工作区路径存在且可读 → 不是首次运行
 * AI 配置已迁移到 ModelLibrary（前端 localStorage），不再作为首次运行判定条件
 */
router.get('/check-first-run', async (_req, res) => {
  try {
    const config = await loadConfig();
    if (!config.workspaceRoot) {
      res.json({ isFirstRun: true });
      return;
    }
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
 * GET /api/config/choose-folder - 弹出系统文件夹选择对话框
 */
router.get('/choose-folder', async (req, res) => {
  try {
    let chosenPath = '';
    const platform = process.platform;

    if (platform === 'darwin') {
      // macOS: use osascript
      const { stdout } = await execAsync(
        `osascript -e 'POSIX path of (choose folder with prompt "Select DailyFlow Workspace")'`
      );
      chosenPath = stdout.trim();
    } else if (platform === 'linux') {
      // Linux: try zenity
      try {
        const { stdout } = await execAsync(`zenity --file-selection --directory --title="Select DailyFlow Workspace"`);
        chosenPath = stdout.trim();
      } catch {
        return res.status(500).json({ error: 'zenity not available. Please install zenity or enter path manually.' });
      }
    } else if (platform === 'win32') {
      // Windows: try PowerShell
      const { stdout } = await execAsync(
        `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = 'Select DailyFlow Workspace'; $f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK | Out-Null; $f.SelectedPath"`
      );
      chosenPath = stdout.trim();
    } else {
      return res.status(500).json({ error: 'Folder picker not supported on this platform' });
    }

    if (!chosenPath) {
      return res.status(400).json({ error: 'No folder selected' });
    }

    res.json({ path: chosenPath });
  } catch (error: any) {
    console.error('Error opening folder picker:', error);
    res.status(500).json({ error: error.message || 'Failed to open folder picker' });
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
    const githubUrlPattern = /^https?:\/\/(www\.)?github\.com\/[\w.-]+\/[\w.-]+(\.git)?\/?$/;
    if (!githubUrlPattern.test(repoUrl)) {
      return res.json({ valid: false, error: 'Invalid GitHub repository URL format' });
    }

    // 尝试访问仓库（使用 fetch）
    try {
      const apiUrl = repoUrl.replace('github.com', 'api.github.com/repos');
      const response = await fetch(apiUrl);

      if (response.ok) {
        const data = await response.json() as { full_name: string; private: boolean };
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

async function ensureDirectory(targetPath: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const stats = await fs.stat(targetPath);
    if (!stats.isDirectory()) return { ok: false, error: 'Path is not a directory' };
    await fs.access(targetPath, fs.constants.R_OK | fs.constants.W_OK);
    return { ok: true };
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      try {
        await fs.mkdir(targetPath, { recursive: true });
        return { ok: true };
      } catch (createError: any) {
        return { ok: false, error: 'Cannot create directory' };
      }
    }
    if (error.code === 'EACCES') return { ok: false, error: 'Permission denied' };
    return { ok: false, error: error.message };
  }
}

/**
 * GET /api/config/workspaces/discover - 自动发现可能的笔记本目录
 * 扫描：当前 active 工作区的父目录、~/Desktop、~/Documents 顶层
 * 候选条件：含 Daily/ 子目录，或顶层至少一个 .md 文件，且不在已配置列表中
 */
router.get('/workspaces/discover', async (_req, res) => {
  try {
    const config = await loadConfig();
    const existingPaths = new Set((config.workspaces || []).map(w => w.path));
    const home = process.env.HOME || '';
    const active = (config.workspaces || []).find(w => w.id === config.activeWorkspaceId);
    const roots = new Set<string>();
    if (active?.path) {
      const parent = path.dirname(active.path);
      if (parent && parent !== '/' && parent !== home) roots.add(parent);
    }
    if (home) {
      roots.add(path.join(home, 'Desktop'));
      roots.add(path.join(home, 'Documents'));
    }

    const candidates: { path: string; name: string }[] = [];
    for (const root of roots) {
      let entries: string[] = [];
      try {
        entries = await fs.readdir(root);
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (entry.startsWith('.')) continue;
        const full = path.join(root, entry);
        if (existingPaths.has(full)) continue;
        try {
          const stat = await fs.stat(full);
          if (!stat.isDirectory()) continue;
          let isCandidate = false;
          try {
            const dailyStat = await fs.stat(path.join(full, 'Daily'));
            if (dailyStat.isDirectory()) isCandidate = true;
          } catch { /* no Daily/ */ }
          if (!isCandidate) {
            try {
              const inner = await fs.readdir(full);
              if (inner.some(f => f.toLowerCase().endsWith('.md'))) isCandidate = true;
            } catch { /* skip */ }
          }
          if (isCandidate && !candidates.some(c => c.path === full)) {
            candidates.push({ path: full, name: entry });
          }
        } catch { /* skip */ }
      }
    }
    candidates.sort((a, b) => a.name.localeCompare(b.name));
    res.json({ candidates: candidates.slice(0, 20) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/config/workspaces - 列出所有笔记本
 */
router.get('/workspaces', async (_req, res) => {
  try {
    const config = await loadConfig();
    res.json({
      workspaces: config.workspaces || [],
      activeWorkspaceId: config.activeWorkspaceId || '',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/config/workspaces - 新建笔记本
 */
router.post('/workspaces', async (req, res) => {
  try {
    const { name, path: wsPath } = req.body as { name?: string; path?: string };
    if (!wsPath || !wsPath.trim()) {
      return res.status(400).json({ error: 'Path is required' });
    }
    const trimmedPath = wsPath.trim().replace(/[/\\]+$/, '') || wsPath.trim();
    const result = await ensureDirectory(trimmedPath);
    if (!result.ok) return res.status(400).json({ error: result.error });

    const config = await loadConfig();
    const workspaces = config.workspaces ? [...config.workspaces] : [];

    // Compare canonical forms so /foo, /foo/, /Foo, ~/foo, and symlinked variants all collapse.
    const incomingCanon = await canonicalizeWorkspacePath(trimmedPath);
    const existingCanons = await Promise.all(
      workspaces.map(w => canonicalizeWorkspacePath(w.path))
    );
    const dupIdx = existingCanons.findIndex(c => c === incomingCanon);
    if (dupIdx !== -1) {
      const existing = workspaces[dupIdx];
      return res.status(409).json({
        error: 'Workspace already exists',
        workspace: existing,
        duplicate: true,
      });
    }

    const ws: Workspace = {
      id: generateWorkspaceId(),
      name: (name && name.trim()) || path.basename(trimmedPath) || 'Workspace',
      path: trimmedPath,
      createdAt: new Date().toISOString(),
    };
    workspaces.push(ws);
    await saveConfig({ ...config, workspaces, activeWorkspaceId: config.activeWorkspaceId || ws.id });
    res.json({ workspace: ws });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/config/workspaces/:id - 重命名笔记本
 */
router.patch('/workspaces/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body as { name?: string };
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });

    const config = await loadConfig();
    const workspaces = (config.workspaces || []).map(w =>
      w.id === id ? { ...w, name: name.trim() } : w
    );
    if (!workspaces.some(w => w.id === id)) {
      return res.status(404).json({ error: 'Workspace not found' });
    }
    await saveConfig({ ...config, workspaces });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/config/workspaces/:id - 删除笔记本（不删磁盘文件）
 */
router.delete('/workspaces/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const config = await loadConfig();
    const workspaces = config.workspaces || [];
    if (workspaces.length <= 1) {
      return res.status(400).json({ error: 'Cannot delete the last workspace' });
    }
    if (!workspaces.some(w => w.id === id)) {
      return res.status(404).json({ error: 'Workspace not found' });
    }
    const remaining = workspaces.filter(w => w.id !== id);
    const nextActive = config.activeWorkspaceId === id ? remaining[0].id : config.activeWorkspaceId;
    await saveConfig({ ...config, workspaces: remaining, activeWorkspaceId: nextActive });
    res.json({ success: true, activeWorkspaceId: nextActive });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/config/workspaces/:id/activate - 切换当前笔记本
 */
router.post('/workspaces/:id/activate', async (req, res) => {
  try {
    const { id } = req.params;
    const config = await loadConfig();
    const target = (config.workspaces || []).find(w => w.id === id);
    if (!target) return res.status(404).json({ error: 'Workspace not found' });

    const result = await ensureDirectory(target.path);
    if (!result.ok) return res.status(400).json({ error: result.error });

    await saveConfig({ ...config, activeWorkspaceId: id });
    res.json({ success: true, workspace: target });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
