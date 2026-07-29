/**
 * Atomic file write helper for v2 entities.
 *
 * Spec §13.4:
 *   1. read current version + hash
 *   2. build change with preview
 *   3. write to temp file
 *   4. fsync
 *   5. atomic rename
 *   6. append audit event
 *   7. update sqlite index
 *
 * If any step fails the main file must not be in a half-written state.
 * Conflicts are detected by `expectedHash` mismatch.
 */
import crypto from 'crypto';
import fs from 'fs/promises';
import fssync from 'fs';
import path from 'path';
import os from 'os';

export interface AtomicWriteOptions {
  filePath: string;
  content: string;
  expectedHash?: string;
}

export interface AtomicWriteResult {
  filePath: string;
  contentHash: string;
  bytes: number;
  previousHash: string | null;
  /** True if expectedHash was provided and matched (or there was no prior file). */
  hashMatched: boolean;
}

export class ConcurrentModificationError extends Error {
  code = 'concurrent_modification';
  constructor(public filePath: string, public expectedHash: string, public actualHash: string) {
    super(`Concurrent modification on ${filePath} (expected ${expectedHash.slice(0, 8)}, got ${actualHash.slice(0, 8)})`);
  }
}

export function sha256(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

// Serialize compare-and-swap writes per file inside this process. Without this
// queue, two requests can both read the same previous hash, both pass the CAS
// check, and then rename competing temp files over each other.
const fileWriteQueues = new Map<string, Promise<void>>();

async function withFileWriteLock<T>(filePath: string, action: () => Promise<T>): Promise<T> {
  const previous = fileWriteQueues.get(filePath) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.catch(() => undefined).then(() => gate);
  fileWriteQueues.set(filePath, queued);

  await previous.catch(() => undefined);
  try {
    return await action();
  } finally {
    release();
    if (fileWriteQueues.get(filePath) === queued) {
      fileWriteQueues.delete(filePath);
    }
  }
}

async function atomicWriteUnlocked(opts: AtomicWriteOptions): Promise<AtomicWriteResult> {
  const { filePath, content, expectedHash } = opts;
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  let previousHash: string | null = null;
  try {
    const prev = await fs.readFile(filePath, 'utf8');
    previousHash = sha256(prev);
  } catch (err: any) {
    if (err && err.code !== 'ENOENT') throw err;
  }

  if (expectedHash !== undefined && previousHash !== expectedHash) {
    throw new ConcurrentModificationError(
      filePath,
      expectedHash,
      previousHash ?? '<absent>'
    );
  }

  const newHash = sha256(content);
  const tmp = path.join(
    dir,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`
  );

  // Write + fsync + rename
  const fh = await fs.open(tmp, 'w');
  try {
    await fh.writeFile(content, 'utf8');
    await fh.sync();
  } finally {
    await fh.close();
  }

  // Atomic rename (POSIX guarantees atomicity on same filesystem).
  try {
    await fs.rename(tmp, filePath);
  } catch (err) {
    // Best-effort cleanup of temp file
    fs.unlink(tmp).catch(() => {});
    throw err;
  }

  // fsync the directory so the rename is durable.
  try {
    const dfd = await fs.open(dir, 'r');
    try {
      await dfd.sync();
    } finally {
      await dfd.close();
    }
  } catch {
    // Windows / some filesystems don't allow opening directories. Not fatal.
  }

  return {
    filePath,
    contentHash: newHash,
    bytes: Buffer.byteLength(content, 'utf8'),
    previousHash,
    hashMatched: previousHash === null || previousHash === newHash || previousHash === expectedHash,
  };
}

export async function atomicWrite(opts: AtomicWriteOptions): Promise<AtomicWriteResult> {
  return withFileWriteLock(opts.filePath, () => atomicWriteUnlocked(opts));
}

/**
 * Read a file if it exists, returning {content, hash}. Returns null if absent.
 * Used by repositories before issuing writes that carry expectedHash.
 */
export async function readWithHash(filePath: string): Promise<{ content: string; hash: string } | null> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return { content, hash: sha256(content) };
  } catch (err: any) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Compute the hash of an existing file (or null if absent). Used by tests
 * that need to confirm the on-disk hash matches the expected after a write.
 */
export async function hashOfFile(filePath: string): Promise<string | null> {
  const r = await readWithHash(filePath);
  return r ? r.hash : null;
}

// fsync helper exposed for tests that want to force a sync after writing.
export async function fsyncDir(dir: string): Promise<void> {
  if (process.platform === 'win32') return;
  let fd: fssync.promises.FileHandle | undefined;
  try {
    fd = await fssync.promises.open(dir, 'r');
    await fd.sync();
  } catch {
    /* ignore — not all FS support it */
  } finally {
    if (fd) await fd.close();
  }
}

/**
 * Best-effort system temp dir override. Some CI environments (and the Tauri
 * bundle) restrict /tmp; tests can monkey-patch this by setting
 * DAILYFLOW_TMP_DIR in the environment.
 */
export function tmpDir(): string {
  return process.env.DAILYFLOW_TMP_DIR ?? os.tmpdir();
}
