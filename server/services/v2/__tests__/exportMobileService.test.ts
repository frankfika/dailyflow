/**
 * Tests for export + mobile services (Phase 9 first slice).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { bootstrapV2 } from '../workspaceContext';
import { capture } from '../captureService';
import { createCommitment } from '../commitmentService';
import { listEntities, getEntity, searchEntities } from '../exportService';
import {
  issueMobileToken,
  listMobileTokens,
  authenticateMobileToken,
  revokeMobileToken,
  mobileCapture,
} from '../mobileService';
import { V2Repository } from '../../../repositories/v2/repository';

let workspace: string;
let repo: V2Repository;
let workspaceId: string;

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'df-v2-export-'));
  const b = await bootstrapV2({ workspaceRoot: workspace, workspaceId: 'ws_test' });
  repo = b.repo;
  workspaceId = b.ctx.workspaceId;
});

afterEach(async () => {
  await fs.rm(workspace, { recursive: true, force: true });
});

describe('Export service (Phase 9 - MCP shape)', () => {
  it('listEntities returns each kind with provenance', async () => {
    await createCommitment(repo, workspaceId, { title: 'A', outcome: 'A', state: 'active' });
    const items = await listEntities(repo, 'commitment');
    expect(items.length).toBe(1);
    expect(items[0]!.kind).toBe('commitment');
    expect(items[0]!.workspaceId).toBe(workspaceId);
  });

  it('getEntity returns a single commitment', async () => {
    const c = await createCommitment(repo, workspaceId, { title: 'B', outcome: 'B', state: 'active' });
    const r = await getEntity(repo, 'commitment', c.id);
    expect(r).not.toBeNull();
    expect(r!.id).toBe(c.id);
  });

  it('searchEntities returns hits with evidence IDs', async () => {
    const { source } = await capture(repo, { kind: 'quick_capture', body: 'Q3 planning for Zhang' });
    void source;
    const r = await searchEntities(repo, 'Zhang');
    expect(r.hits.length).toBeGreaterThan(0);
  });
});

describe('Mobile service (Phase 9 - capture API)', () => {
  it('issues, authenticates, and revokes tokens', async () => {
    const t = await issueMobileToken(workspace, 'iPhone 15');
    expect(t.token).toBeDefined();
    const auth = await authenticateMobileToken(workspace, t.token);
    expect(auth).not.toBeNull();
    const all = await listMobileTokens(workspace);
    expect(all.length).toBe(1);
    await revokeMobileToken(workspace, t.id);
    const auth2 = await authenticateMobileToken(workspace, t.token);
    expect(auth2).toBeNull();
  });

  it('mobileCapture persists a quick note', async () => {
    const r = await mobileCapture(repo, workspaceId, {
      kind: 'quick_capture',
      body: 'iPhone note: call Alex tomorrow',
    });
    expect(r.source.id).toMatch(/^src_/);
    const list = await listEntities(repo, 'source');
    expect(list.find(s => s.id === r.source.id)).toBeDefined();
  });
});
