/**
 * Migration script tests.
 *
 * Covers SPEC §4.3:
 *   - Idempotency: running the script twice produces the same final state
 *   - Legacy workspaces get the 4 new fields added without `kind` upgrade
 *   - v1 mindmaps get bumped to v2
 *   - Already-migrated files are left alone
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import * as config from '../../services/config.ts';
import { migrateWorkspaces, migrateMindMaps, type MigrationReport } from '../migrate-to-topic-spaces.js';

describe.sequential('migrate-to-topic-spaces script', () => {
  let tmpRoot: string;
  let loadConfigSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'df-migrate-'));
    loadConfigSpy = vi.spyOn(config, 'loadConfig').mockResolvedValue({ workspaceRoot: tmpRoot } as any);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (tmpRoot) {
      await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
    }
  });

  function emptyReport(): MigrationReport {
    return {
      workspaceFilesScanned: 0,
      workspaceFilesTouched: 0,
      workspaceFieldsAdded: 0,
      mindmapFilesScanned: 0,
      mindmapFilesTouched: 0,
      mindmapBumpedToV2: 0,
      errors: [],
    };
  }

  async function seedLegacyWorkspace(id: string, body: string): Promise<string> {
    const dir = path.join(tmpRoot, 'Workspaces', '2025', '01');
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `${id}.md`);
    const content = [
      '---',
      'id: ' + id,
      'kind: workspace',
      'type: general',
      'status: active',
      'createdAt: 2025-01-01T00:00:00.000Z',
      'updatedAt: 2025-01-02T00:00:00.000Z',
      '---',
      '',
      body,
    ].join('\n');
    await fs.writeFile(filePath, content, 'utf-8');
    return filePath;
  }

  async function seedV1MindMap(id: string): Promise<string> {
    const dir = path.join(tmpRoot, '.dailyflow', 'mindmaps');
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `${id}.json`);
    const data = {
      id,
      title: 'Old map',
      rootId: 'root',
      nodes: [{ id: 'root', text: 'center', position: { x: 0, y: 0 } }],
      edges: [],
      version: 1,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    };
    await fs.writeFile(filePath, JSON.stringify(data), 'utf-8');
    return filePath;
  }

  it('migrates legacy workspace files and leaves kind unchanged', async () => {
    const filePath = await seedLegacyWorkspace('tw_legacy_a', '# Legacy\n\n## Intent\n\nfoo\n');

    const report = emptyReport();
    await migrateWorkspaces(tmpRoot, report);

    expect(report.workspaceFilesScanned).toBe(1);
    expect(report.workspaceFilesTouched).toBe(1);
    expect(report.workspaceFieldsAdded).toBe(4);

    const after = await fs.readFile(filePath, 'utf-8');
    expect(after).toContain('context: unclassified');
    expect(after).toContain('mindmapId:');
    expect(after).toContain('order: 0');
    expect(after).toContain('defaultView: mindmap');
    // CRUCIAL: the migration never upgrades `kind` (SPEC §4.3).
    expect(after).toContain('kind: workspace');
    expect(after).not.toContain('kind: topic-space');
    // User-authored content survives untouched.
    expect(after).toContain('## Intent');
    expect(after).toContain('foo');
  });

  it('bumps v1 mindmaps to v2 without altering any other field', async () => {
    const filePath = await seedV1MindMap('mm_old_one');
    const before = JSON.parse(await fs.readFile(filePath, 'utf-8'));

    const report = emptyReport();
    await migrateMindMaps(tmpRoot, report);

    expect(report.mindmapFilesScanned).toBe(1);
    expect(report.mindmapFilesTouched).toBe(1);
    expect(report.mindmapBumpedToV2).toBe(1);

    const after = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    expect(after.version).toBe(2);
    // Everything else is preserved.
    expect(after.id).toBe(before.id);
    expect(after.title).toBe(before.title);
    expect(after.nodes).toEqual(before.nodes);
    expect(after.edges).toEqual(before.edges);
  });

  it('is idempotent: running the migration twice yields zero changes on the second pass', async () => {
    await seedLegacyWorkspace('tw_legacy_a', '# A\n');
    await seedLegacyWorkspace('tw_legacy_b', '# B\n');
    await seedV1MindMap('mm_old_one');
    await seedV1MindMap('mm_old_two');

    const first = emptyReport();
    await migrateWorkspaces(tmpRoot, first);
    await migrateMindMaps(tmpRoot, first);

    // Capture a content snapshot for byte-equal verification.
    const snap1 = await snapshotAll(tmpRoot);

    const second = emptyReport();
    await migrateWorkspaces(tmpRoot, second);
    await migrateMindMaps(tmpRoot, second);

    const snap2 = await snapshotAll(tmpRoot);

    // Same files, same bytes, on the second pass.
    expect(second.workspaceFilesTouched).toBe(0);
    expect(second.workspaceFieldsAdded).toBe(0);
    expect(second.mindmapFilesTouched).toBe(0);
    expect(second.mindmapBumpedToV2).toBe(0);
    expect(snap1).toEqual(snap2);
  });

  it('leaves already-migrated workspace files alone (no-op)', async () => {
    // Write a file that ALREADY has all 4 new fields.
    const dir = path.join(tmpRoot, 'Workspaces', '2025', '02');
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, 'tw_already_done.md');
    const content = [
      '---',
      'id: tw_already_done',
      'kind: topic-space',
      'type: general',
      'status: active',
      'context: work',
      'mindmapId: mm_existing',
      'order: 3',
      'defaultView: list',
      'createdAt: 2025-02-01T00:00:00.000Z',
      'updatedAt: 2025-02-02T00:00:00.000Z',
      '---',
      '',
      '# Done\n',
    ].join('\n');
    await fs.writeFile(filePath, content, 'utf-8');

    const report = emptyReport();
    await migrateWorkspaces(tmpRoot, report);

    expect(report.workspaceFilesScanned).toBe(1);
    expect(report.workspaceFilesTouched).toBe(0);
    expect(report.workspaceFieldsAdded).toBe(0);

    const after = await fs.readFile(filePath, 'utf-8');
    expect(after).toBe(content);
  });

  it('leaves v2 mindmaps alone (no-op)', async () => {
    const dir = path.join(tmpRoot, '.dailyflow', 'mindmaps');
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, 'mm_new.json');
    const data = {
      id: 'mm_new',
      title: 'New',
      rootId: 'r',
      nodes: [{ id: 'r', text: 'c', position: { x: 0, y: 0 } }],
      edges: [],
      version: 2,
      spaceId: 'tw_x',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    };
    await fs.writeFile(filePath, JSON.stringify(data), 'utf-8');

    const report = emptyReport();
    await migrateMindMaps(tmpRoot, report);

    expect(report.mindmapFilesScanned).toBe(1);
    expect(report.mindmapFilesTouched).toBe(0);
    expect(report.mindmapBumpedToV2).toBe(0);
  });

  it('does not touch user-authored content sections (intent, scratchpad, etc.)', async () => {
    const body = [
      '# Keep me',
      '',
      '## Intent',
      '',
      'investor outreach plan',
      '',
      '## Scratchpad',
      '',
      '- todo A',
      '- todo B',
      '',
      '## Timeline',
      '',
      '### 2025-01-15',
      '',
      '- meeting with X',
      '',
    ].join('\n');
    const filePath = await seedLegacyWorkspace('tw_user_content', body);

    await migrateWorkspaces(tmpRoot, emptyReport());

    const after = await fs.readFile(filePath, 'utf-8');
    expect(after).toContain('investor outreach plan');
    expect(after).toContain('- todo A');
    expect(after).toContain('- todo B');
    expect(after).toContain('### 2025-01-15');
    expect(after).toContain('- meeting with X');
  });
});

/**
 * Take a deterministic snapshot of all `.md` and `.json` files under
 * `Workspaces/` and `.dailyflow/mindmaps/`, including their bytes.
 * Comparing two snapshots lets us assert the migration is byte-stable
 * across repeated runs.
 */
async function snapshotAll(root: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const dirs = [
    path.join(root, 'Workspaces'),
    path.join(root, '.dailyflow', 'mindmaps'),
  ];
  for (const dir of dirs) {
    await walk(dir, root, out);
  }
  return out;
}

async function walk(dir: string, root: string, out: Record<string, string>): Promise<void> {
  let entries: any[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, root, out);
    } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.json'))) {
      out[path.relative(root, full)] = await fs.readFile(full, 'utf-8');
    }
  }
}
