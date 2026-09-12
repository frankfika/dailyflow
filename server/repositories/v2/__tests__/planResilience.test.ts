import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { V2Repository } from '../repository';

let root: string;

beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'dailyflow-plan-')); });
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

describe('getPlanByDate resilience', () => {
  it('returns null for a malformed plan file instead of throwing', async () => {
    const repo = new V2Repository({ root, workspaceId: 'ws_plan' });
    const filePath = path.join(root, 'Plans', '2026', '08', '2026-08-26.md');
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, '---\ntitle: [broken\nid: 42\n---\nbody', 'utf8');
    await expect(repo.getPlanByDate('2026-08-26')).resolves.toBeNull();
  });
});
