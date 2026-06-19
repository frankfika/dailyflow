import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import * as config from '../config.ts';
import {
  createThinkingWorkspace,
  getAllThinkingWorkspaces,
  getThinkingWorkspaceById,
  updateThinkingWorkspace,
  deleteThinkingWorkspace,
} from '../thinkingWorkspaces.js';

describe.sequential('thinkingWorkspaces service', () => {
  let tmpRoot: string;
  let loadConfigSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'df-thinking-workspaces-'));
    loadConfigSpy = vi.spyOn(config, 'loadConfig').mockResolvedValue({ workspaceRoot: tmpRoot } as any);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (tmpRoot) {
      await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('creates a workspace with tw_ prefix and ignores client-provided id', async () => {
    const ws = await createThinkingWorkspace({
      id: 'ws_malicious_../path',
      title: 'Test Workspace',
      intent: 'test intent',
    } as any);

    expect(ws.id.startsWith('tw_')).toBe(true);
    expect(ws.id.includes('ws_malicious')).toBe(false);
    expect(ws.title).toBe('Test Workspace');
    expect(ws.intent).toBe('test intent');
    expect(ws.filePath).toBeTruthy();
    expect(await fs.stat(ws.filePath!).then(() => true).catch(() => false)).toBe(true);
  });

  it('lists created workspaces', async () => {
    await createThinkingWorkspace({ title: 'Alpha' });
    await createThinkingWorkspace({ title: 'Beta' });

    const all = await getAllThinkingWorkspaces();
    expect(all.length).toBe(2);
    expect(all.map(w => w.title).sort()).toEqual(['Alpha', 'Beta']);
  });

  it('filters by query', async () => {
    await createThinkingWorkspace({ title: 'Apple', intent: 'keep doctors away' });
    await createThinkingWorkspace({ title: 'Banana', intent: 'yellow fruit' });

    const filtered = await getAllThinkingWorkspaces({ query: 'yellow' });
    expect(filtered.length).toBe(1);
    expect(filtered[0].title).toBe('Banana');
  });

  it('skips unreadable files instead of failing the whole request', async () => {
    await createThinkingWorkspace({ title: 'Readable' });

    const workspacesDir = path.join(tmpRoot, 'Workspaces');
    const now = new Date();
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const badFile = path.join(workspacesDir, year, month, 'tw_bad_unreadable.md');
    await fs.mkdir(path.dirname(badFile), { recursive: true });
    await fs.writeFile(badFile, '---\nid: tw_bad_unreadable\n---\n# Bad', 'utf-8');
    await fs.chmod(badFile, 0o000);

    try {
      const all = await getAllThinkingWorkspaces();
      expect(all.some(w => w.title === 'Readable')).toBe(true);
      expect(all.some(w => w.id === 'tw_bad_unreadable')).toBe(false);
    } finally {
      await fs.chmod(badFile, 0o644).catch(() => {});
    }
  });

  it('gets a workspace by id', async () => {
    const created = await createThinkingWorkspace({ title: 'ById' });
    const found = await getThinkingWorkspaceById(created.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
  });

  it('updates a workspace', async () => {
    const created = await createThinkingWorkspace({ title: 'Original' });
    const updated = await updateThinkingWorkspace(created.id, { title: 'Updated', brief: 'new brief' });
    expect(updated).not.toBeNull();
    expect(updated!.title).toBe('Updated');
    expect(updated!.brief).toBe('new brief');

    const all = await getAllThinkingWorkspaces();
    const found = all.find(w => w.id === created.id);
    expect(found?.title).toBe('Updated');
  });

  it('deletes a workspace', async () => {
    const created = await createThinkingWorkspace({ title: 'To Delete' });
    const ok = await deleteThinkingWorkspace(created.id);
    expect(ok).toBe(true);
    expect(await getThinkingWorkspaceById(created.id)).toBeNull();
  });
});
