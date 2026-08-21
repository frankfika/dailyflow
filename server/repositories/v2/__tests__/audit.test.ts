import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { buildAuditLog } from '../audit.js';

describe('AuditLog', () => {
  let workspace: string;

  beforeEach(async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'df-v2-audit-'));
  });

  afterEach(async () => {
    await fs.rm(workspace, { recursive: true, force: true });
  });

  it('serializes concurrent appends into one hash chain', async () => {
    const audit = buildAuditLog(workspace, 'ws_test');
    await Promise.all(Array.from({ length: 20 }, (_, index) => audit.append({
      kind: 'file.write',
      actor: 'system',
      data: { index },
    })));

    const events = await audit.readAll();
    expect(events).toHaveLength(20);
    expect(events[0].prevHash).toBe('0'.repeat(64));
    for (let index = 1; index < events.length; index += 1) {
      expect(events[index].prevHash).toBe(events[index - 1].hash);
    }
  });
});
