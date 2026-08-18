/**
 * Git sync service for team collaboration.
 *
 * Members share a git repository. Each member's workspaceRoot points to a
 * sub-directory (e.g. `members/<memberId>/`). Leader workspaces point to the
 * repo root and read member subdirectories in read-only mode.
 */
import path from 'path';
import { simpleGit, type SimpleGit } from 'simple-git';
import type { Config } from '../types/task.js';

export interface GitStatus {
  ahead: number;
  behind: number;
  current?: string;
  tracking?: string;
  dirty: boolean;
}

function gitFor(workspaceRoot: string): SimpleGit {
  return simpleGit(workspaceRoot);
}

export async function gitInit(workspaceRoot: string): Promise<void> {
  const git = gitFor(workspaceRoot);
  await git.init(['--bare']);
}

export async function gitStatus(workspaceRoot: string): Promise<GitStatus> {
  const git = gitFor(workspaceRoot);
  const status = await git.status();
  return {
    ahead: status.ahead,
    behind: status.behind,
    current: status.current || undefined,
    tracking: status.tracking || undefined,
    dirty: status.files.length > 0,
  };
}

export async function gitCommit(workspaceRoot: string, message: string): Promise<string | null> {
  const git = gitFor(workspaceRoot);
  const status = await git.status();
  if (status.files.length === 0) return null;
  await git.add('.');
  const result = await git.commit(message);
  return result.commit || null;
}

export async function gitPull(workspaceRoot: string, remote = 'origin', branch?: string): Promise<void> {
  const git = gitFor(workspaceRoot);
  await git.pull(remote, branch);
}

export async function gitPush(workspaceRoot: string, remote = 'origin', branch?: string): Promise<void> {
  const git = gitFor(workspaceRoot);
  await git.push(remote, branch);
}

export async function gitFetch(workspaceRoot: string, remote = 'origin'): Promise<void> {
  const git = gitFor(workspaceRoot);
  await git.fetch(remote);
}

export async function gitLog(workspaceRoot: string, filePath?: string, maxCount = 50): Promise<Array<{
  hash: string;
  date: string;
  message: string;
  author_name: string;
  author_email: string;
}>> {
  const git = gitFor(workspaceRoot);
  const options = filePath ? [filePath] : [];
  const log = await git.log({ maxCount, file: options[0] });
  return log.all.map((entry) => ({
    hash: entry.hash,
    date: entry.date,
    message: entry.message,
    author_name: entry.author_name,
    author_email: entry.author_email,
  }));
}

export function getMemberRoot(config: Config, memberId: string): string {
  return path.join(config.workspaceRoot, 'members', memberId);
}

export function listMemberPaths(config: Config): { id: string; name: string; path: string }[] {
  return config.team?.members ?? [];
}

export function isLeader(config: Config): boolean {
  return config.team?.role === 'leader';
}

export function isTeamMode(config: Config): boolean {
  return Boolean(config.team);
}
