import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { loadConfig } from './config.js';

const RECORDS_FILE = path.join(os.homedir(), '.dailyflow', 'ipfs-backups.json');
const PINATA_BASE = 'https://api.pinata.cloud';
const DEFAULT_GATEWAY = 'https://gateway.pinata.cloud';

export interface IpfsBackupRecord {
  cid: string;
  pinName: string;
  size: number;
  fileCount: number;
  createdAt: string;
  gateway?: string;
}

export interface IpfsTestResult {
  ok: boolean;
  message: string;
  account?: string;
}

interface WorkspaceSnapshot {
  app: 'dailyflow';
  schema: 1;
  exportedAt: string;
  workspaceRoot: string;
  fileCount: number;
  files: Array<{ relPath: string; content: string; mtime?: string }>;
}

async function walkMarkdown(root: string): Promise<string[]> {
  const out: string[] = [];
  const stack: string[] = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        out.push(full);
      }
    }
  }
  return out;
}

async function buildSnapshot(workspaceRoot: string): Promise<WorkspaceSnapshot> {
  const files = await walkMarkdown(workspaceRoot);
  const records: WorkspaceSnapshot['files'] = [];
  for (const filePath of files) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const stat = await fs.stat(filePath);
      records.push({
        relPath: path.relative(workspaceRoot, filePath),
        content,
        mtime: stat.mtime.toISOString(),
      });
    } catch {
      // skip unreadable files
    }
  }
  return {
    app: 'dailyflow',
    schema: 1,
    exportedAt: new Date().toISOString(),
    workspaceRoot,
    fileCount: records.length,
    files: records,
  };
}

function authHeader(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}` };
}

export async function testPinataConnection(apiKey: string): Promise<IpfsTestResult> {
  if (!apiKey) {
    return { ok: false, message: 'API key is required' };
  }
  try {
    const res = await fetch(`${PINATA_BASE}/data/testAuthentication`, {
      headers: authHeader(apiKey),
    });
    if (res.ok) {
      const data = (await res.json()) as { message?: string };
      return { ok: true, message: data.message || 'Authenticated' };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: 'Invalid or expired API key (JWT)' };
    }
    return { ok: false, message: `Pinata responded with ${res.status}` };
  } catch (error: any) {
    return { ok: false, message: `Network error: ${error.message}` };
  }
}

export interface BackupResult {
  success: boolean;
  cid?: string;
  pinName?: string;
  size?: number;
  fileCount?: number;
  gateway?: string;
  error?: string;
}

export async function backupToPinata(): Promise<BackupResult> {
  const config = await loadConfig();
  if (!config.ipfsEnabled) {
    return { success: false, error: 'IPFS backup is disabled' };
  }
  if (!config.ipfsApiKey) {
    return { success: false, error: 'Pinata API key is not configured' };
  }
  if (!config.workspaceRoot) {
    return { success: false, error: 'Workspace path is not configured' };
  }

  let snapshot: WorkspaceSnapshot;
  try {
    snapshot = await buildSnapshot(config.workspaceRoot);
  } catch (error: any) {
    return { success: false, error: `Failed to read workspace: ${error.message}` };
  }
  if (snapshot.files.length === 0) {
    return { success: false, error: 'No Markdown files found in workspace' };
  }

  const json = JSON.stringify(snapshot);
  const blob = new Blob([json], { type: 'application/json' });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const pinName = `dailyflow-backup-${stamp}.json`;

  const form = new FormData();
  form.append('file', blob, pinName);
  form.append(
    'pinataMetadata',
    JSON.stringify({
      name: pinName,
      keyvalues: {
        app: 'dailyflow',
        schema: '1',
        fileCount: String(snapshot.fileCount),
      },
    })
  );
  form.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));

  let res: Response;
  try {
    res = await fetch(`${PINATA_BASE}/pinning/pinFileToIPFS`, {
      method: 'POST',
      headers: authHeader(config.ipfsApiKey),
      body: form,
    });
  } catch (error: any) {
    return { success: false, error: `Network error: ${error.message}` };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return {
      success: false,
      error: `Pinata upload failed (${res.status}): ${text || res.statusText}`,
    };
  }

  const data = (await res.json()) as { IpfsHash: string; PinSize: number };
  const gateway = (config.ipfsGateway || DEFAULT_GATEWAY).replace(/\/$/, '');
  const record: IpfsBackupRecord = {
    cid: data.IpfsHash,
    pinName,
    size: data.PinSize,
    fileCount: snapshot.fileCount,
    createdAt: new Date().toISOString(),
    gateway,
  };
  await appendBackupRecord(record);

  return {
    success: true,
    cid: record.cid,
    pinName: record.pinName,
    size: record.size,
    fileCount: record.fileCount,
    gateway: record.gateway,
  };
}

async function readBackupRecords(): Promise<IpfsBackupRecord[]> {
  try {
    const content = await fs.readFile(RECORDS_FILE, 'utf-8');
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? (parsed as IpfsBackupRecord[]) : [];
  } catch (error: any) {
    if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
    return [];
  }
}

async function appendBackupRecord(record: IpfsBackupRecord): Promise<void> {
  const existing = await readBackupRecords();
  existing.unshift(record);
  const trimmed = existing.slice(0, 50);
  await fs.mkdir(path.dirname(RECORDS_FILE), { recursive: true });
  await fs.writeFile(RECORDS_FILE, JSON.stringify(trimmed, null, 2), 'utf-8');
}

export async function listBackupRecords(): Promise<IpfsBackupRecord[]> {
  return readBackupRecords();
}
