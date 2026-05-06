import { exec } from 'child_process';
import { promisify } from 'util';
import { loadConfig } from './config.js';

const execAsync = promisify(exec);

export interface GitStatus {
  hasChanges: boolean;
  branch: string;
  ahead: number;
  behind: number;
  staged: string[];
  unstaged: string[];
  untracked: string[];
}

export interface GitCommitResult {
  success: boolean;
  commitHash?: string;
  message?: string;
  error?: string;
}

export interface GitPushResult {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * 获取 Git 仓库状态
 */
export async function getGitStatus(): Promise<GitStatus> {
  const config = await loadConfig();
  const workspaceRoot = config.workspaceRoot;

  try {
    // 检查是否是 Git 仓库
    await execAsync('git rev-parse --git-dir', { cwd: workspaceRoot });

    // 获取当前分支
    const { stdout: branchOutput } = await execAsync('git branch --show-current', { cwd: workspaceRoot });
    const branch = branchOutput.trim();

    // 获取状态
    const { stdout: statusOutput } = await execAsync('git status --porcelain', { cwd: workspaceRoot });
    const lines = statusOutput.split('\n').filter(l => l.trim());

    const staged: string[] = [];
    const unstaged: string[] = [];
    const untracked: string[] = [];

    lines.forEach(line => {
      const status = line.substring(0, 2);
      const file = line.substring(3);

      if (status[0] !== ' ' && status[0] !== '?') {
        staged.push(file);
      }
      if (status[1] !== ' ' && status[1] !== '?') {
        unstaged.push(file);
      }
      if (status[0] === '?' && status[1] === '?') {
        untracked.push(file);
      }
    });

    // 获取 ahead/behind 信息
    let ahead = 0;
    let behind = 0;
    try {
      const { stdout: aheadBehind } = await execAsync(
        `git rev-list --left-right --count origin/${branch}...HEAD`,
        { cwd: workspaceRoot }
      );
      const [behindStr, aheadStr] = aheadBehind.trim().split('\t');
      behind = parseInt(behindStr) || 0;
      ahead = parseInt(aheadStr) || 0;
    } catch {
      // 如果没有远程分支，忽略错误
    }

    const hasChanges = staged.length > 0 || unstaged.length > 0 || untracked.length > 0;

    return {
      hasChanges,
      branch,
      ahead,
      behind,
      staged,
      unstaged,
      untracked,
    };
  } catch (error: any) {
    // 不是 Git 仓库或其他错误
    throw new Error('Not a git repository or git command failed: ' + error.message);
  }
}

/**
 * 提交更改到 Git
 */
export async function commitChanges(message: string): Promise<GitCommitResult> {
  const config = await loadConfig();
  const workspaceRoot = config.workspaceRoot;

  try {
    // 添加所有更改（包括新文件）
    await execAsync('git add -A', { cwd: workspaceRoot });

    // 检查是否有更改需要提交
    const { stdout: statusOutput } = await execAsync('git status --porcelain', { cwd: workspaceRoot });
    if (!statusOutput.trim()) {
      return {
        success: false,
        error: 'No changes to commit',
      };
    }

    // 提交
    const { stdout: commitOutput } = await execAsync(
      `git commit -m "${message.replace(/"/g, '\\"')}"`,
      { cwd: workspaceRoot }
    );

    // 获取提交哈希
    const { stdout: hashOutput } = await execAsync('git rev-parse HEAD', { cwd: workspaceRoot });
    const commitHash = hashOutput.trim();

    return {
      success: true,
      commitHash,
      message: commitOutput.trim(),
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 推送到远程仓库
 */
export async function pushToRemote(): Promise<GitPushResult> {
  const config = await loadConfig();
  const workspaceRoot = config.workspaceRoot;

  try {
    // 获取当前分支
    const { stdout: branchOutput } = await execAsync('git branch --show-current', { cwd: workspaceRoot });
    const branch = branchOutput.trim();

    // 推送到远程
    const { stdout: pushOutput } = await execAsync(
      `git push origin ${branch}`,
      { cwd: workspaceRoot }
    );

    return {
      success: true,
      message: pushOutput.trim(),
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 初始化 Git 仓库（如果不存在）
 */
export async function initGitRepo(): Promise<{ success: boolean; error?: string }> {
  const config = await loadConfig();
  const workspaceRoot = config.workspaceRoot;

  try {
    // 检查是否已经是 Git 仓库
    try {
      await execAsync('git rev-parse --git-dir', { cwd: workspaceRoot });
      return { success: true }; // 已经是 Git 仓库
    } catch {
      // 不是 Git 仓库，初始化
      await execAsync('git init', { cwd: workspaceRoot });
      return { success: true };
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 设置远程仓库
 */
export async function setRemoteRepo(repoUrl: string): Promise<{ success: boolean; error?: string }> {
  const config = await loadConfig();
  const workspaceRoot = config.workspaceRoot;

  try {
    // 检查是否已有 origin
    try {
      await execAsync('git remote get-url origin', { cwd: workspaceRoot });
      // 已有 origin，更新它
      await execAsync(`git remote set-url origin ${repoUrl}`, { cwd: workspaceRoot });
    } catch {
      // 没有 origin，添加它
      await execAsync(`git remote add origin ${repoUrl}`, { cwd: workspaceRoot });
    }

    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}
