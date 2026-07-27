import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

vi.mock('../connectorPlugins.js', () => ({
  listConnectorPlugins: () => [{
    manifest: {
      id: 'mock-calendar',
      displayName: 'Mock Calendar',
      provider: 'google',
    },
    getStatus: async () => ({ connected: true, accountLabel: 'test@example.com' }),
    listCalendarEvents: async () => [{
      externalId: 'event-1',
      title: 'External planning',
      start: '2026-07-28T09:00:00+08:00',
      end: '2026-07-28T10:00:00+08:00',
      allDay: false,
      status: 'confirmed',
    }],
  }],
}));

import { saveConfig } from '../config.js';
import { writeDailyNote } from '../fileSystem.js';
import { createNote } from '../notes.js';
import { getCalendarWorkspace } from '../calendarWorkspace.js';
import type { Config } from '../../types/task.js';

let root: string;
let configFile: string;
let previousConfigFile: string | undefined;
let config: Config;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'dailyflow-calendar-'));
  configFile = path.join(root, 'config.json');
  previousConfigFile = process.env.DAILYFLOW_CONFIG_FILE;
  process.env.DAILYFLOW_CONFIG_FILE = configFile;
  config = {
    workspaceRoot: root,
    workspaces: [{ id: 'ws_test', name: 'Test', path: root, createdAt: new Date().toISOString() }],
    activeWorkspaceId: 'ws_test',
    dailyPathTemplate: 'Daily/{year}/{month}/{date}.md',
    rolloverTrigger: 'manual',
    rolloverSkipTags: [],
  };
  await saveConfig(config);
});

afterEach(async () => {
  if (previousConfigFile === undefined) delete process.env.DAILYFLOW_CONFIG_FILE;
  else process.env.DAILYFLOW_CONFIG_FILE = previousConfigFile;
  await fs.rm(root, { recursive: true, force: true });
});

describe('calendar workspace aggregation', () => {
  it('combines task dates, timed notes, and connector events', async () => {
    await writeDailyNote(
      '2026-06-01',
      '- [ ] Submit proposal #deadline:2026-07-29 ^id-task-calendar\n',
      config
    );
    await createNote({
      title: 'Product review',
      body: '# Product review\n\nReview launch readiness.',
      type: 'meeting_note',
      date: '2026-07-28',
      time: '14:00',
      endTime: '15:00',
      context: 'work',
      tags: [],
      linkedTaskIds: [],
      linkedProjectIds: [],
    });

    const result = await getCalendarWorkspace('2026-07-27', '2026-08-02');

    expect(result.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'task',
        source: 'dailyflow',
        title: 'Submit proposal',
        start: '2026-07-29',
        allDay: true,
        localDate: '2026-06-01',
      }),
      expect.objectContaining({
        kind: 'event',
        source: 'dailyflow',
        title: 'Product review',
        start: '2026-07-28T14:00:00+08:00',
      }),
      expect.objectContaining({
        kind: 'event',
        source: 'google',
        title: 'External planning',
      }),
    ]));
    expect(result.connectors).toEqual([
      expect.objectContaining({ id: 'mock-calendar', connected: true }),
    ]);
  });

  it('rejects ranges larger than two months', async () => {
    await expect(getCalendarWorkspace('2026-01-01', '2026-04-01')).rejects.toMatchObject({
      status: 400,
    });
  });

  it('rejects calendar-looking strings that are not real dates', async () => {
    await expect(getCalendarWorkspace('2026-02-30', '2026-03-01')).rejects.toMatchObject({
      status: 400,
    });
  });
});
