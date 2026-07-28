import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { loadConfig } from './config.js';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

export interface GitStatus {
  hasChanges: boolean;
  branch: string;
  ahead: number;
  behind: number;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  lastCommitTime?: string;
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
      // Allowlist branch names — `git branch --show-current` should
      // always be sane, but defensive regex keeps a corrupt ref from
      // sneaking unexpected characters into the exec'd argv.
      if (!/^[A-Za-z0-9._\-\/]+$/.test(branch)) {
        throw new Error('Unusual branch name, skipping ahead/behind');
      }
      const { stdout: aheadBehind } = await execFileAsync(
        'git',
        ['rev-list', '--left-right', '--count', `origin/${branch}...HEAD`],
        { cwd: workspaceRoot }
      );
      const [behindStr, aheadStr] = aheadBehind.trim().split('\t');
      behind = parseInt(behindStr) || 0;
      ahead = parseInt(aheadStr) || 0;
    } catch {
      // 如果没有远程分支，忽略错误
    }

    // 获取最后一次提交时间
    let lastCommitTime = undefined;
    try {
      const { stdout: timeOutput } = await execAsync('git log -1 --format=%cI', { cwd: workspaceRoot });
      if (timeOutput.trim()) {
        lastCommitTime = timeOutput.trim();
      }
    } catch {
      // ignore
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
      lastCommitTime,
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
    const { stdout: commitOutput } = await execFileAsync(
      'git',
      ['commit', '-m', message],
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
export async function pushToRemote(token?: string): Promise<GitPushResult> {
  const config = await loadConfig();
  const workspaceRoot = config.workspaceRoot;

  try {
    // 获取当前分支
    const { stdout: branchOutput } = await execAsync('git branch --show-current', { cwd: workspaceRoot });
    let branch = branchOutput.trim();

    // 如果没有分支名（初始提交前），默认用 main
    if (!branch) {
      branch = 'main';
    }

    if (!/^[A-Za-z0-9._\-/]+$/.test(branch)) {
      return { success: false, error: 'Invalid branch name' };
    }

    let askPassPath: string | undefined;
    try {
      const env = { ...process.env };
      if (token) {
        askPassPath = path.join(os.tmpdir(), `dailyflow-git-askpass-${process.pid}-${crypto.randomBytes(6).toString('hex')}.sh`);
        await fs.writeFile(
          askPassPath,
          `#!/bin/sh
case "$1" in
  *Username*) printf '%s\\n' "x-access-token" ;;
  *) printf '%s\\n' "$DAILYFLOW_GIT_TOKEN" ;;
esac
`,
          { encoding: 'utf8', mode: 0o700 }
        );
        env.GIT_ASKPASS = askPassPath;
        env.GIT_TERMINAL_PROMPT = '0';
        env.DAILYFLOW_GIT_TOKEN = token;
      }
      // Token is passed only through the child environment and a generic
      // askpass helper. It never appears in argv or .git/config.
      const { stdout: pushOutput, stderr } = await execFileAsync(
        'git',
        ['push', '-u', 'origin', branch],
        { cwd: workspaceRoot, env }
      );

      return {
        success: true,
        message: (pushOutput || stderr).trim(),
      };
    } finally {
      if (askPassPath) {
        await fs.rm(askPassPath, { force: true }).catch(() => undefined);
      }
    }
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
 * 校验远程仓库 URL 是否为合法的 git 远端格式
 *
 * execFile 已经让 shell 不参与解析，但 repoUrl 仍然会作为参数被 git 接受，
 * 写入 .git/config 并参与后续 push/pull。先校验协议和形态，避免：
 *   - file:// 指向本地敏感路径（git 会读取 /etc/passwd 等）
 *   - ext:: 协议触发 git 的外部传输机制执行任意命令
 *   - ssh://user@host 中嵌入 shell 元字符
 */
export function isValidGitRemoteUrl(repoUrl: string): boolean {
  if (typeof repoUrl !== 'string' || repoUrl.length === 0 || repoUrl.length > 2048) {
    return false;
  }
  // 只允许 https://、http://、ssh://、git@ 三种形态
  if (/^https?:\/\/[^\s]+$/i.test(repoUrl)) {
    try {
      const parsed = new URL(repoUrl);
      return !parsed.username && !parsed.password;
    } catch {
      return false;
    }
  }
  if (/^ssh:\/\/[^\s]+$/i.test(repoUrl)) return true;
  if (/^git@[^\s]+:[^\s]+\.git$/i.test(repoUrl)) return true;
  return false;
}

/**
 * 设置远程仓库
 */
export async function setRemoteRepo(repoUrl: string): Promise<{ success: boolean; error?: string }> {
  const config = await loadConfig();
  const workspaceRoot = config.workspaceRoot;

  if (!isValidGitRemoteUrl(repoUrl)) {
    return {
      success: false,
      error: 'Invalid remote URL. Use https://, http://, ssh:// or git@host:owner/repo.git',
    };
  }

  try {
    // 检查是否已有 origin
    try {
      await execFileAsync('git', ['remote', 'get-url', 'origin'], { cwd: workspaceRoot });
      // 已有 origin，更新它
      await execFileAsync('git', ['remote', 'set-url', 'origin', repoUrl], { cwd: workspaceRoot });
    } catch {
      // 没有 origin，添加它
      await execFileAsync('git', ['remote', 'add', 'origin', repoUrl], { cwd: workspaceRoot });
    }

    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}
