import { defineConfig, devices } from '@playwright/test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const e2eRoot = mkdtempSync(join(tmpdir(), 'dailyflow-playwright-'));
process.env.DAILYFLOW_E2E_ROOT = e2eRoot;
const seededWorkspace = join(e2eRoot, 'seed-workspace');
mkdirSync(seededWorkspace, { recursive: true });
writeFileSync(join(e2eRoot, 'config.json'), JSON.stringify({
  workspaceRoot: seededWorkspace,
  workspaces: [{
    id: 'playwright-seed',
    name: 'Playwright',
    path: seededWorkspace,
    createdAt: new Date().toISOString(),
  }],
  activeWorkspaceId: 'playwright-seed',
  dailyPathTemplate: 'Daily/{year}/{month}/{date}.md',
  rolloverTrigger: 'manual',
  rolloverSkipTags: [],
  activeContext: 'work',
  language: 'en',
  v2: { enabled: true, eventFirst: true, connectorsV2: false },
}, null, 2), { mode: 0o600 });

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  // mindmap-visual.spec.ts is a deep visual walkthrough meant for owner
  // verification (per the file's own header comment). The HEAD version
  // pre-dates the SWOT template flow and is not safe to run on every push.
  // Frank keeps a refactored copy in his working tree; we exclude it from
  // CI until he lands that rewrite.
  testIgnore: [
    '**/mindmap-visual.spec.ts',
    '**/visual-check.spec.ts',
    '**/screenshot.spec.ts',
    // The standalone Events navigation was intentionally removed in favor of
    // the unified MindMap surface. Service-level adapter coverage remains in
    // Vitest; these legacy navigation specs must not wait for a dead tab.
    '**/event-first-loop.spec.ts',
    '**/topic-spaces.spec.ts',
  ],
  globalTeardown: './e2e/global-teardown.ts',
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:47831',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev:all',
    url: 'http://localhost:47831',
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      ...process.env,
      // Never fall back to the packaged DailyFlow server on 47832. A user may
      // have the desktop app open while the suite runs; sharing that port can
      // overwrite their real ~/.dailyflow/config.json and produce false-green
      // tests against production state.
      PORT: '47842',
      VITE_API_PROXY_TARGET: 'http://127.0.0.1:47842',
      DAILYFLOW_CONFIG_FILE: join(e2eRoot, 'config.json'),
      DAILYFLOW_RECURRING_FILE: join(e2eRoot, 'recurring_tasks.json'),
    },
  },
});
