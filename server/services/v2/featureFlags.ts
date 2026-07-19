/**
 * Feature flags for v2 (spec §Phase 0).
 *
 * The v2 stack lives behind a set of named gates so a workspace can opt
 * out of new behaviour without losing data. The default is "v2 enabled
 * with legacy coexistence" — i.e. v2 routes are live, v1 routes continue
 * to work, and the v2 Inbox/Today/Memory view appears as an additional
 * section in the React app.
 *
 * Persisted in `~/.dailyflow/config.json` under `v2`. The v1 stack does
 * not see or touch this field.
 */
import { loadConfig } from '../config.js';

export interface V2Flags {
  enabled: boolean;
  inboxV2: boolean;
  todayV2: boolean;
  memoryV2: boolean;
  /** When true, Connector v2 routes are exposed (still no auth in 1.0). */
  connectorsV2: boolean;
  /** When true, AI calls go through the real provider; otherwise fallback. */
  aiEnabled: boolean;
  /** Maximum bytes sent to the model per request (spec §15.4 budget). */
  contextBudgetBytes: number;
}

const DEFAULT_FLAGS: V2Flags = {
  enabled: true,
  inboxV2: true,
  todayV2: true,
  memoryV2: true,
  connectorsV2: false,
  aiEnabled: true,
  contextBudgetBytes: 32_000,
};

export async function getV2Flags(): Promise<V2Flags> {
  const cfg = await loadConfig();
  const v2 = cfg.v2;
  return { ...DEFAULT_FLAGS, ...(v2 ?? {}) };
}

export async function setV2Flags(partial: Partial<V2Flags>): Promise<V2Flags> {
  const cfg = await loadConfig();
  const current = cfg.v2;
  const merged = { ...DEFAULT_FLAGS, ...(current ?? {}), ...partial };
  cfg.v2 = merged;
  await persistConfig(cfg);
  return merged;
}

async function persistConfig(cfg: unknown): Promise<void> {
  // Defer the import to avoid a circular dep with config.ts
  const mod = await import('../config.js');
  await (mod as { saveConfig?: (c: unknown) => Promise<void> }).saveConfig?.(cfg as never);
}
