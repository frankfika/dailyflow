import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { atomicWrite, ConcurrentModificationError, readWithHash, sha256, hashOfFile } from '../atomicWrite';

let workspace: string;

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'df-v2-atomic-'));
});

afterEach(async () => {
  await fs.rm(workspace, { recursive: true, force: true });
});

describe('atomicWrite', () => {
  it('writes a new file and returns its hash', async () => {
    const filePath = path.join(workspace, 'a.md');
    const r = await atomicWrite({ filePath, content: 'hello' });
    expect(r.contentHash).toBe(sha256('hello'));
    expect(r.previousHash).toBeNull();
    expect(r.bytes).toBe(5);
    expect(await hashOfFile(filePath)).toBe(sha256('hello'));
  });

  it('overwrites an existing file when expectedHash is omitted', async () => {
    const filePath = path.join(workspace, 'a.md');
    await atomicWrite({ filePath, content: 'one' });
    const r = await atomicWrite({ filePath, content: 'two' });
    expect(r.previousHash).toBe(sha256('one'));
    expect(await hashOfFile(filePath)).toBe(sha256('two'));
  });

  it('throws ConcurrentModificationError when expectedHash does not match', async () => {
    const filePath = path.join(workspace, 'a.md');
    await atomicWrite({ filePath, content: 'one' });
    await expect(
      atomicWrite({ filePath, content: 'two', expectedHash: sha256('WRONG') })
    ).rejects.toBeInstanceOf(ConcurrentModificationError);
    // The on-disk content should remain the original.
    expect(await hashOfFile(filePath)).toBe(sha256('one'));
  });

  it('succeeds when expectedHash matches the current content', async () => {
    const filePath = path.join(workspace, 'a.md');
    const r1 = await atomicWrite({ filePath, content: 'one' });
    const r2 = await atomicWrite({ filePath, content: 'two', expectedHash: r1.contentHash });
    expect(r2.previousHash).toBe(sha256('one'));
    expect(await hashOfFile(filePath)).toBe(sha256('two'));
  });

  it('leaves no temp files on success', async () => {
    const filePath = path.join(workspace, 'a.md');
    await atomicWrite({ filePath, content: 'one' });
    const entries = await fs.readdir(workspace);
    expect(entries.filter(e => e.startsWith('.') && e.endsWith('.tmp'))).toHaveLength(0);
  });

  it('creates the parent directory if missing', async () => {
    const filePath = path.join(workspace, 'deep/nested/dir/a.md');
    await atomicWrite({ filePath, content: 'hello' });
    expect(await hashOfFile(filePath)).toBe(sha256('hello'));
  });

  it('handles concurrent writes deterministically (last writer wins)', async () => {
    const filePath = path.join(workspace, 'a.md');
    const results = await Promise.all([
      atomicWrite({ filePath, content: 'A' }),
      atomicWrite({ filePath, content: 'B' }),
      atomicWrite({ filePath, content: 'C' }),
    ]);
    const onDisk = await fs.readFile(filePath, 'utf8');
    expect(['A', 'B', 'C']).toContain(onDisk);
    expect(results.length).toBe(3);
  });

  it('allows only one concurrent compare-and-swap writer', async () => {
    const filePath = path.join(workspace, 'a.md');
    const initial = await atomicWrite({ filePath, content: 'base' });
    const results = await Promise.allSettled([
      atomicWrite({ filePath, content: 'A', expectedHash: initial.contentHash }),
      atomicWrite({ filePath, content: 'B', expectedHash: initial.contentHash }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  });

  it('readWithHash returns null for missing files', async () => {
    expect(await readWithHash(path.join(workspace, 'absent.md'))).toBeNull();
  });
});
