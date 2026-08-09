import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  // mindmap-visual.spec.ts is a deep visual walkthrough meant for owner
  // verification (per the file's own header comment). The HEAD version
  // pre-dates the SWOT template flow and is not safe to run on every push.
  // Frank keeps a refactored copy in his working tree; we exclude it from
  // CI until he lands that rewrite.
  testIgnore: process.env.CI ? ['**/mindmap-visual.spec.ts'] : [],
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
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
