/**
 * Proactive Proposal Service (Gap 3 — Sprint 1).
 *
 * V2 promise: when an attached task has been overdue for 5+ days, the
 * AI should proactively ask "Do you want to schedule this into today?"
 * instead of waiting for the user to open Today.
 *
 * Design constraints (preventing nuisance):
 *   1. Global kill-switch (enabled === false  →  return []).
 *   2. Quiet hours (e.g. 22:00–08:00  →  return []).
 *   3. Weekly cap (maxPerWeek  →  return []).
 *
 * Reuses existing signals:
 *   - getWaitingOverdue  (reviewerService) for items whose reviewAt has passed
 *   - listCommitments    (repo)            for `dueAt`-based overdue items
 *
 * The proposal payload is shaped so the client can either:
 *   - promote the suggestion back into a real Proposal via
 *     `POST /api/v2/proposals/draft`, or
 *   - directly mark the linked commitment done via the existing
 *     commitment endpoints.
 *
 * Config persistence: ~/.dailyflow/proactive.json  (user-tunable).
 * History persistence: ~/.dailyflow/proactive_history.json  (per-channel
 * counter + lastFiredAt so we can show "this week you got 2/3").
 */
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { z } from 'zod';
import { newId } from '../../domain/v2/ulid.js';
import { V2Repository } from '../../repositories/v2/repository.js';
import { getWaitingOverdue } from './reviewerService.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ProactiveProposalKind =
  | 'overdue_task'
  | 'stale_commitment'
  | 'unreviewed_outcome';

export type ProactiveChannel =
  | 'today_load'
  | 'ai_chat_open'
  | 'app_start';

export type ProactiveSuggestionAction =
  | 'move_to_today'
  | 'regroup'
  | 'mark_done'
  | 'dismiss';

export interface ProactiveSuggestion {
  label: string;
  action: ProactiveSuggestionAction;
  payload?: Record<string, unknown>;
}

export interface ProactiveProposal {
  id: string;
  kind: ProactiveProposalKind;
  title: string;
  body: string;
  entityId: string;
  entityType: string;
  severity: 'info' | 'warning' | 'urgent';
  createdAt: string;
  cooldown: {
    channel: ProactiveChannel;
    lastFiredAt?: string;
  };
  suggestions: ProactiveSuggestion[];
}

export interface ProactiveConfig {
  enabled: boolean;
  quietHours: { start: number; end: number }; // 0-24 inclusive
  maxPerWeek: number; // default 3
  overdueTaskDays: number; // default 5
}

export const DEFAULT_PROACTIVE_CONFIG: ProactiveConfig = {
  enabled: true,
  quietHours: { start: 22, end: 8 },
  maxPerWeek: 3,
  overdueTaskDays: 5,
};

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

function getConfigFile(): string {
  // Resolve lazily so tests can override via env.
  const override = process.env.DAILYFLOW_PROACTIVE_CONFIG_FILE;
  if (override) return override;
  return path.join(os.homedir(), '.dailyflow', 'proactive.json');
}

function getHistoryFile(): string {
  const override = process.env.DAILYFLOW_PROACTIVE_HISTORY_FILE;
  if (override) return override;
  return path.join(os.homedir(), '.dailyflow', 'proactive_history.json');
}

const ProactiveConfigSchema = z.object({
  enabled: z.boolean(),
  quietHours: z.object({
    start: z.number().min(0).max(24),
    end: z.number().min(0).max(24),
  }),
  maxPerWeek: z.number().min(0).max(100),
  overdueTaskDays: z.number().min(1).max(60),
});

export async function loadProactiveConfig(): Promise<ProactiveConfig> {
  try {
    const raw = await fs.readFile(getConfigFile(), 'utf8');
    const parsed = JSON.parse(raw);
    return ProactiveConfigSchema.parse({ ...DEFAULT_PROACTIVE_CONFIG, ...parsed });
  } catch {
    return { ...DEFAULT_PROACTIVE_CONFIG };
  }
}

export async function saveProactiveConfig(cfg: ProactiveConfig): Promise<ProactiveConfig> {
  const validated = ProactiveConfigSchema.parse(cfg);
  const file = getConfigFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(validated, null, 2), 'utf8');
  return validated;
}

// ---------------------------------------------------------------------------
// History (per-channel counters + lastFiredAt)
// ---------------------------------------------------------------------------

export interface ProactiveHistoryEntry {
  proposalId: string;
  kind: ProactiveProposalKind;
  entityId: string;
  channel: ProactiveChannel;
  firedAt: string;
  /** 'accepted' | 'dismissed' — recorded once user clicks an action. */
  outcome?: 'accepted' | 'dismissed';
  resolvedAt?: string;
}

export interface ProactiveState {
  entries: ProactiveHistoryEntry[];
}

export const EMPTY_PROACTIVE_STATE: ProactiveState = { entries: [] };

export async function loadProactiveState(): Promise<ProactiveState> {
  try {
    const raw = await fs.readFile(getHistoryFile(), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.entries)) {
      return { entries: parsed.entries };
    }
    return { ...EMPTY_PROACTIVE_STATE };
  } catch {
    return { ...EMPTY_PROACTIVE_STATE };
  }
}

export async function saveProactiveState(state: ProactiveState): Promise<void> {
  const file = getHistoryFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(state, null, 2), 'utf8');
}

// ---------------------------------------------------------------------------
// Scoring / filtering helpers
// ---------------------------------------------------------------------------

function isInQuietHours(now: Date, cfg: ProactiveConfig): boolean {
  const hour = now.getHours();
  const { start, end } = cfg.quietHours;
  if (start === end) return false; // disable
  if (start < end) {
    return hour >= start && hour < end;
  }
  // Wraps midnight (e.g. 22 → 8)
  return hour >= start || hour < end;
}

function startOfWeek(now: Date): number {
  // ISO week — Monday as start. Use Unix ms.
  const d = new Date(now);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d.getTime();
}

export function countThisWeek(state: ProactiveState, now: Date, channel?: ProactiveChannel): number {
  const weekStart = startOfWeek(now);
  return state.entries.filter(
    e => new Date(e.firedAt).getTime() >= weekStart && (channel === undefined || e.channel === channel),
  ).length;
}

export function hasResolvedEntityThisWeek(state: ProactiveState, entityId: string, now: Date): boolean {
  const weekStart = startOfWeek(now);
  return state.entries.some(
    e =>
      e.entityId === entityId &&
      (e.outcome === 'dismissed' || e.outcome === 'accepted') &&
      e.resolvedAt &&
      new Date(e.resolvedAt).getTime() >= weekStart,
  );
}

// ---------------------------------------------------------------------------
// Core: scan for proposals
// ---------------------------------------------------------------------------

export interface ScanOptions {
  /** Override the "now" timestamp — useful for tests. */
  now?: Date;
}

export async function scanProactiveProposals(
  repo: V2Repository,
  config: ProactiveConfig,
  state: ProactiveState,
  channel: ProactiveChannel,
  options: ScanOptions = {},
): Promise<ProactiveProposal[]> {
  const now = options.now ?? new Date();

  // Limit 1 — global kill switch
  if (!config.enabled) return [];

  // Limit 2 — quiet hours
  if (isInQuietHours(now, config)) return [];

  // Limit 3 — weekly cap (across channels; per-channel is also enforced
  // because the client typically only fires from one channel.)
  const firedThisWeek = countThisWeek(state, now);
  if (firedThisWeek >= config.maxPerWeek) return [];

  const proposals: ProactiveProposal[] = [];

  // Source A: `dueAt`-based overdue commitments (the gap's headline case).
  const allCommitments = await repo.listCommitments();
  const overdueDays = config.overdueTaskDays;
  for (const c of allCommitments) {
    if (c.state === 'completed' || c.state === 'cancelled' || c.state === 'archived') continue;
    if (!c.dueAt) continue;
    const due = new Date(c.dueAt).getTime();
    const daysOverdue = Math.floor((now.getTime() - due) / 86_400_000);
    if (daysOverdue < overdueDays) continue;

    // Skip if user has accepted/dismissed THIS task this week.
    if (hasResolvedEntityThisWeek(state, c.id, now)) continue;

    const id = `pp_${newId('prop')}`;
    proposals.push({
      id,
      kind: 'overdue_task',
      title: `任务"${c.title}"已逾期 ${daysOverdue} 天`,
      body:
        `关联任务的截止日是 ${c.dueAt.slice(0, 10)}，` +
        `已逾期 ${daysOverdue} 天（阈值 ${overdueDays} 天）。` +
        `要不要把它排进今天？`,
      entityId: c.id,
      entityType: 'commitment',
      severity: daysOverdue >= overdueDays * 2 ? 'urgent' : 'warning',
      createdAt: now.toISOString(),
      cooldown: { channel },
      suggestions: [
        {
          label: '排进今天',
          action: 'move_to_today',
          payload: { commitmentId: c.id, dueAt: c.dueAt },
        },
        {
          label: '标记完成',
          action: 'mark_done',
          payload: { commitmentId: c.id },
        },
        {
          label: '关闭建议',
          action: 'dismiss',
          payload: { commitmentId: c.id },
        },
      ],
    });
  }

  // Source B: waiting-review overdue (gap 3 secondary path).
  const waitingOverdue = await getWaitingOverdue(repo);
  for (const w of waitingOverdue) {
    if (w.daysOverdue < overdueDays) continue;
    if (hasResolvedEntityThisWeek(state, w.commitmentId, now)) continue;
    proposals.push({
      id: `pp_${newId('prop')}`,
      kind: 'stale_commitment',
      title: `Waiting "${w.title}" 已过复查日 ${w.daysOverdue} 天`,
      body: `你把它放到了 Waiting@${w.waitingOn}，复查日已过 ${w.daysOverdue} 天。` +
            `要重新规划还是直接关闭？`,
      entityId: w.commitmentId,
      entityType: 'commitment',
      severity: 'warning',
      createdAt: now.toISOString(),
      cooldown: { channel },
      suggestions: [
        {
          label: '重新规划',
          action: 'regroup',
          payload: { commitmentId: w.commitmentId, waitingOn: w.waitingOn },
        },
        {
          label: '关闭',
          action: 'dismiss',
          payload: { commitmentId: w.commitmentId },
        },
      ],
    });
  }

  // Cap output so the UI never gets more than maxPerWeek fresh items.
  const remaining = Math.max(0, config.maxPerWeek - firedThisWeek);
  return proposals.slice(0, remaining);
}

// ---------------------------------------------------------------------------
// Recording actions
// ---------------------------------------------------------------------------

export async function recordProposalShown(
  proposal: ProactiveProposal,
  stateInput?: ProactiveState,
): Promise<ProactiveState> {
  const state = stateInput ?? (await loadProactiveState());
  // Avoid double-counting if the same proposal id is shown twice — overwrite.
  const without = state.entries.filter(e => e.proposalId !== proposal.id);
  const next: ProactiveState = {
    entries: [
      ...without,
      {
        proposalId: proposal.id,
        kind: proposal.kind,
        entityId: proposal.entityId,
        channel: proposal.cooldown.channel,
        firedAt: proposal.createdAt,
      },
    ],
  };
  await saveProactiveState(next);
  return next;
}

export async function recordProposalAction(
  proposalId: string,
  action: 'accepted' | 'dismissed',
  stateInput?: ProactiveState,
): Promise<ProactiveState> {
  const state = stateInput ?? (await loadProactiveState());
  const now = new Date().toISOString();
  const idx = state.entries.findIndex(e => e.proposalId === proposalId);
  if (idx === -1) {
    // Action without prior show — still record so we don't repeat.
    const next: ProactiveState = {
      entries: [
        ...state.entries,
        {
          proposalId,
          kind: 'overdue_task',
          entityId: '',
          channel: 'today_load',
          firedAt: now,
          outcome: action,
          resolvedAt: now,
        },
      ],
    };
    await saveProactiveState(next);
    return next;
  }
  const entries = [...state.entries];
  entries[idx] = { ...entries[idx], outcome: action, resolvedAt: now };
  const next: ProactiveState = { entries };
  await saveProactiveState(next);
  return next;
}
