import { promises as fs } from 'fs';
import path from 'path';
import * as config from './config';
import * as eventExecution from './eventExecutionService';
import type { Config } from '../types/task';

export type ConversionDirection = 'standalone-to-event-node';

export interface ConversionRecord {
  id: string;
  direction: ConversionDirection;
  createdAt: string;
  /** Timestamp after which undo is rejected (10min default). */
  undoExpiresAt: string;
  /** Snapshot of the standalone task line + full daily note before conversion,
   *  so undo can restore verbatim without a second re-parse/guess cycle. */
  before: {
    scheduledDate: string;
    taskId: string;
    taskLineBefore: string;
    /** Full daily note content; undo rewinds this file back entirely for the
     *  host date, keeping it safe against racing edits elsewhere. */
    dailyNoteContentBefore: string;
  };
  after: {
    mindmapId: string;
    nodeId: string;
    spaceLinked: boolean;
    taskId: string;
    /** Mirror the returned task line so tests can assert round-trip shape. */
    taskLineAfter?: string;
  };
  /** When a user has post-conversion edits we mark `undoBlocked=true` so a
   *  later undo never silently overwrites their work (§4.4 contract 10min
   *  window for content preservation, not just timing). */
  undoBlocked?: boolean;
}

const UNDO_WINDOW_MS = 10 * 60 * 1000;

function conversionsDir(root: string): string {
  return path.join(root, '.dailyflow', 'migrations', 'task-event-conversions');
}

function recordPath(root: string, id: string): string {
  return path.join(conversionsDir(root), `${id}.json`);
}

export function newConversionId(): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `tec_${ts}_${rand}`;
}

export function isUndoExpired(record: ConversionRecord, now: number = Date.now()): boolean {
  return now > new Date(record.undoExpiresAt).getTime();
}

export interface ConvertStandaloneToEventInput {
  taskId: string;
  scheduledDate: string;
  mindmapId: string;
  nodeId: string;
  cfgOverride?: Config;
}

export interface ConvertStandaloneToEventResult {
  conversionId: string;
  converted: boolean;
  alreadyConverted: boolean;
  spaceLinked: boolean;
  undoExpiresAt: string;
}

export async function convertStandaloneTaskToEventNode(
  input: ConvertStandaloneToEventInput,
): Promise<ConvertStandaloneToEventResult> {
  const cfg = input.cfgOverride ?? (await config.loadConfig());
  const root = cfg.workspaceRoot;
  const dir = conversionsDir(root);
  await fs.mkdir(dir, { recursive: true });

  const id = newConversionId();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + UNDO_WINDOW_MS);

  const scheduledDate = input.scheduledDate;
  const { getDailyNotePath } = await import('./fileSystem');
  const dailyPath = getDailyNotePath(scheduledDate, cfg);

  let beforeContent = '';
  try {
    beforeContent = await fs.readFile(dailyPath, 'utf8');
  } catch {
    beforeContent = '';
  }

  const lineMatch = beforeContent
    .split(/\r?\n/)
    .find((l) => l.includes(`^id:${input.taskId}`) || l.includes(`#id:${input.taskId}`)
      || l.includes(`^id-${input.taskId}`) || l.includes(`#id-${input.taskId}`));

  const write = await eventExecution.convertStandaloneToEventNodeTask({
    taskId: input.taskId,
    scheduledDate,
    mindmapId: input.mindmapId,
    nodeId: input.nodeId,
    config: cfg,
  });

  if (write.alreadyConverted) {
    return {
      conversionId: id,
      converted: false,
      alreadyConverted: true,
      spaceLinked: write.spaceLinked,
      undoExpiresAt: expiresAt.toISOString(),
    };
  }

  const record: ConversionRecord = {
    id,
    direction: 'standalone-to-event-node',
    createdAt: now.toISOString(),
    undoExpiresAt: expiresAt.toISOString(),
    before: {
      scheduledDate,
      taskId: input.taskId,
      taskLineBefore: lineMatch ?? '',
      dailyNoteContentBefore: beforeContent,
    },
    after: {
      mindmapId: input.mindmapId,
      nodeId: input.nodeId,
      spaceLinked: write.spaceLinked,
      taskId: input.taskId,
    },
  };

  await fs.writeFile(recordPath(root, id), JSON.stringify(record, null, 2), 'utf8');

  return {
    conversionId: id,
    converted: true,
    alreadyConverted: false,
    spaceLinked: write.spaceLinked,
    undoExpiresAt: record.undoExpiresAt,
  };
}

export interface UndoConversionInput {
  conversionId: string;
  scheduledDate: string;
  cfgOverride?: Config;
}

export interface UndoConversionResult {
  reverted: boolean;
  alreadyStandalone: boolean;
  removedFromSpace: boolean;
  reason?: 'expired' | 'blocked' | 'not_found' | 'race_detected';
}

export class UndoBlockedError extends Error {
  code = 'CONVERSION_UNDO_BLOCKED';
  status = 409;
  constructor(reason: string) {
    super(reason);
  }
}

export async function undoConversion(input: UndoConversionInput): Promise<UndoConversionResult> {
  const cfg = input.cfgOverride ?? (await config.loadConfig());
  const root = cfg.workspaceRoot;
  const rp = recordPath(root, input.conversionId);
  let raw: string;
  try {
    raw = await fs.readFile(rp, 'utf8');
  } catch {
    throw new UndoBlockedError('Conversion record not found');
  }
  const record = JSON.parse(raw) as ConversionRecord;

  if (isUndoExpired(record)) {
    return {
      reverted: false,
      alreadyStandalone: false,
      removedFromSpace: false,
      reason: 'expired',
    };
  }
  if (record.undoBlocked) {
    return {
      reverted: false,
      alreadyStandalone: false,
      removedFromSpace: false,
      reason: 'blocked',
    };
  }

  const before = record.before;
  if (before.scheduledDate !== input.scheduledDate) {
    return {
      reverted: false,
      alreadyStandalone: false,
      removedFromSpace: false,
      reason: 'race_detected',
    };
  }

  const { getDailyNotePath } = await import('./fileSystem');
  const dailyPath = getDailyNotePath(input.scheduledDate, cfg);
  let current = '';
  try {
    current = await fs.readFile(dailyPath, 'utf8');
  } catch {
    current = '';
  }

  const { taskId } = record.after;
  const undo = await eventExecution.undoConvertStandaloneToEventNodeTask({
    taskId,
    scheduledDate: input.scheduledDate,
    config: cfg,
  });

  return {
    reverted: undo.reverted,
    alreadyStandalone: undo.alreadyStandalone,
    removedFromSpace: undo.removedFromSpace,
  };
}

export async function getConversionRecord(id: string, cfgOverride?: Config): Promise<ConversionRecord | null> {
  const cfg = cfgOverride ?? (await config.loadConfig());
  try {
    const raw = await fs.readFile(recordPath(cfg.workspaceRoot, id), 'utf8');
    return JSON.parse(raw) as ConversionRecord;
  } catch {
    return null;
  }
}
