/**
 * Tests for Calendar connector (Phase 5).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { bootstrapV2 } from '../workspaceContext';
import { syncCalendar, listCalendarConnectors } from '../calendarConnectors';
import { V2Repository } from '../../../repositories/v2/repository';

let workspace: string;
let repo: V2Repository;

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'df-v2-cal-'));
  const b = await bootstrapV2({ workspaceRoot: workspace, workspaceId: 'ws_test' });
  repo = b.repo;
});

afterEach(async () => {
  await fs.rm(workspace, { recursive: true, force: true });
});

describe('Calendar connectors (Phase 5)', () => {
  it('listCalendarConnectors returns 3 entries', () => {
    const list = listCalendarConnectors();
    expect(list.length).toBeGreaterThanOrEqual(3);
  });

  it('sync returns blocked_by_external_authorization when not authorized', async () => {
    const r = await syncCalendar(repo, { connectorId: 'google-calendar' });
    expect(r.ok).toBe(false);
    expect(r.blockedBy).toBe('external_authorization');
  });

  it('sync returns error for unknown connector', async () => {
    const r = await syncCalendar(repo, { connectorId: 'unknown' });
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });
});
