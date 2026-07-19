/**
 * Tests for Message/Email connectors (Phase 6).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { bootstrapV2 } from '../workspaceContext';
import {
  syncMessages,
  listMessageConnectors,
  sanitizeExternalContent,
} from '../messageConnectors';
import { V2Repository } from '../../../repositories/v2/repository';

let workspace: string;
let repo: V2Repository;

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'df-v2-msg-'));
  const b = await bootstrapV2({ workspaceRoot: workspace, workspaceId: 'ws_test' });
  repo = b.repo;
});

afterEach(async () => {
  await fs.rm(workspace, { recursive: true, force: true });
});

describe('Message connectors (Phase 6)', () => {
  it('listMessageConnectors returns 5 entries', () => {
    expect(listMessageConnectors().length).toBe(5);
  });

  it('sync returns blocked_by_external_authorization when not authorized', async () => {
    const r = await syncMessages(repo, { connectorId: 'gmail' });
    expect(r.ok).toBe(false);
    expect(r.blockedBy).toBe('external_authorization');
  });

  it('sync returns error for unknown connector', async () => {
    const r = await syncMessages(repo, { connectorId: 'unknown' });
    expect(r.ok).toBe(false);
  });

  it('sanitizeExternalContent strips <script>, on*, javascript:', () => {
    const dirty = '<script>alert(1)</script><a href="javascript:bad">x</a><img onerror="bad" src="x">';
    const clean = sanitizeExternalContent(dirty);
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('javascript:');
    expect(clean).not.toContain('onerror');
  });

  it('sanitizeExternalContent strips null bytes', () => {
    const s = sanitizeExternalContent('hello\u0000world');
    expect(s).toBe('helloworld');
  });
});
