import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import * as config from '../config.js';
import {
  listEvents,
  getEventDetail,
  listTodayItems,
  listStandaloneTasks,
  resolveEventIdToSpaceFile,
  getEventById,
} from '../eventQueryService.js';

describe.sequential('eventQueryService', () => {
  let tmpRoot: string;
  let loadConfigSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'df-event-query-'));
    loadConfigSpy = vi.spyOn(config, 'loadConfig').mockResolvedValue({ workspaceRoot: tmpRoot } as any);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (tmpRoot) {
      await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('listEvents from v1-unclassified workspace returns 1 summary id=tw_v1legacy', async () => {
    const fixtureSrc = path.join(
      __dirname,
      '../../routes/__tests__/fixtures/eventAdapter/v1-map-unclassified',
    );
    await fs.cp(fixtureSrc, tmpRoot, { recursive: true });

    const result = await listEvents();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('tw_v1legacy');
  });

  it('getEventDetail for v2 scenario returns status=completed with integrity checks', async () => {
    const fixtureSrc = path.join(
      __dirname,
      '../../routes/__tests__/fixtures/eventAdapter/v2-map-with-linked-tasks',
    );
    await fs.cp(fixtureSrc, tmpRoot, { recursive: true });

    const spaceFilePath = path.join(tmpRoot, 'Workspaces', '2026', '08', 'tw_workplan.md');
    const detail = await getEventDetail(spaceFilePath);

    expect(detail).not.toBeNull();
    expect(detail!.status).toBe('completed');
    expect(detail!.integrity).toBeDefined();
    expect(detail!.integrity.missingMap).toBe(false);
    expect(detail!.integrity.sourceContextWasUnclassified).toBe(false);
    expect(Array.isArray(detail!.integrity.orphanTaskIds)).toBe(true);
    expect(Array.isArray(detail!.integrity.duplicateNodeTaskIds)).toBe(true);
  });

  it('listStandaloneTasks from standalone-tasks scenario returns 3 items, orphan preserved', async () => {
    const fixtureSrc = path.join(
      __dirname,
      '../../routes/__tests__/fixtures/eventAdapter/standalone-tasks',
    );
    await fs.cp(fixtureSrc, tmpRoot, { recursive: true });

    const result = await listStandaloneTasks('2026-08-10');
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(3);

    const titles = result.map(t => t.title).sort();
    expect(titles).toContain('Buy groceries');
    expect(titles).toContain('Dentist visit done');
    expect(titles).toContain('Orphan errand');
  });

  it('listTodayItems orphan scenario no Workspaces context undefined returns 2 standalone items', async () => {
    const fixtureSrc = path.join(
      __dirname,
      '../../routes/__tests__/fixtures/eventAdapter/orphan-task-no-origin',
    );
    await fs.cp(fixtureSrc, tmpRoot, { recursive: true });

    const result = await listTodayItems('2026-08-10', undefined);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(2);
    expect(result.every(item => item.kind === 'standalone')).toBe(true);
  });

  it('invalid context argument coerced to undefined returns both items (guard test)', async () => {
    const fixtureSrc = path.join(
      __dirname,
      '../../routes/__tests__/fixtures/eventAdapter/orphan-task-no-origin',
    );
    await fs.cp(fixtureSrc, tmpRoot, { recursive: true });

    const result = await listTodayItems('2026-08-10', 'foo' as any);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(2);
  });

  it('EFP-005: resolveEventIdToSpaceFile returns .md path by topic-space ID (v1)', async () => {
    const fixtureSrc = path.join(
      __dirname,
      '../../routes/__tests__/fixtures/eventAdapter/v1-map-unclassified',
    );
    await fs.cp(fixtureSrc, tmpRoot, { recursive: true });
    const resolved = await resolveEventIdToSpaceFile('tw_v1legacy');
    expect(resolved).toBeTruthy();
    expect(resolved!.endsWith('tw_v1legacy.md')).toBe(true);
  });

  it('EFP-005: resolveEventIdToSpaceFile falls back to mindmapId → mindmapId in frontmatter', async () => {
    const fixtureSrc = path.join(
      __dirname,
      '../../routes/__tests__/fixtures/eventAdapter/v2-map-with-linked-tasks',
    );
    await fs.cp(fixtureSrc, tmpRoot, { recursive: true });
    const resolved = await resolveEventIdToSpaceFile('mm_workplan');
    expect(resolved).toBeTruthy();
    expect(resolved!.endsWith('tw_workplan.md')).toBe(true);
  });

  it('EFP-005: getEventById returns EventDetail for v2 linked space id, 404 for random id', async () => {
    const fixtureSrc = path.join(
      __dirname,
      '../../routes/__tests__/fixtures/eventAdapter/v2-map-with-linked-tasks',
    );
    await fs.cp(fixtureSrc, tmpRoot, { recursive: true });

    const detail = await getEventById('tw_workplan');
    expect(detail).not.toBeNull();
    expect(detail!.id).toBe('tw_workplan');
    expect(detail!.status).toBe('completed');

    const nope = await getEventById('does-not-exist-xxx');
    expect(nope).toBeNull();
  });
});
