import { afterEach, describe, expect, it, vi } from 'vitest';

const { loadConfig, saveConfig } = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  saveConfig: vi.fn(),
}));
vi.mock('../../config.js', () => ({ loadConfig, saveConfig }));

import { getV2Flags, setV2Flags } from '../featureFlags';

describe('v2 feature flags (EFP-001 eventFirst)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('defaults eventFirst to true when config.v2 is completely missing (EFP-502)', async () => {
    loadConfig.mockResolvedValue({ workspaceRoot: '/tmp/x' });

    const flags = await getV2Flags();

    expect(flags.eventFirst).toBe(true);
    expect(flags.enabled).toBe(true);
    expect(flags.inboxV2).toBe(true);
    expect(flags.todayV2).toBe(true);
    expect(flags.memoryV2).toBe(true);
    expect(flags.connectorsV2).toBe(false);
    expect(flags.aiEnabled).toBe(true);
    expect(flags.contextBudgetBytes).toBe(32_000);
  });

  it('respects explicit eventFirst=true persisted in config.v2', async () => {
    loadConfig.mockResolvedValue({ v2: { eventFirst: true } });

    const flags = await getV2Flags();

    expect(flags.eventFirst).toBe(true);
    expect(flags.connectorsV2).toBe(false);
    expect(flags.enabled).toBe(true);
    expect(flags.aiEnabled).toBe(true);
    expect(flags.contextBudgetBytes).toBe(32_000);
  });

  it('respects explicit eventFirst=false persisted for one-version rollback window (EFP-502)', async () => {
    loadConfig.mockResolvedValue({ v2: { eventFirst: false } });

    const flags = await getV2Flags();

    expect(flags.eventFirst).toBe(false);
    expect(flags.enabled).toBe(true);
    expect(flags.inboxV2).toBe(true);
  });

  it('setV2Flags can flip eventFirst between false and true and writes back merged', async () => {
    loadConfig.mockResolvedValue({});
    saveConfig.mockImplementation(async () => {});

    const saved = await setV2Flags({ eventFirst: true });
    expect(saved.eventFirst).toBe(true);
    expect(saveConfig).toHaveBeenCalledTimes(1);
    const savedCfg = saveConfig.mock.calls[0][0];
    expect(savedCfg.v2.eventFirst).toBe(true);
    expect(savedCfg.v2.connectorsV2).toBe(false);

    loadConfig.mockResolvedValue({ v2: savedCfg.v2 });
    const flags = await getV2Flags();
    expect(flags.eventFirst).toBe(true);
  });
});
