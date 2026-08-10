import { test, expect } from '@playwright/test';

const initialLoadHealthTest = 'no unexpected console or HTTP errors on initial load';

test.describe('DailyFlow Smoke Tests', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    if (testInfo.title !== initialLoadHealthTest) {
      await page.goto('http://localhost:47831');
    }
  });

  test('page loads with correct title', async ({ page }) => {
    await expect(page).toHaveTitle(/DailyFlow/);
  });

  test('sidebar shows navigation items', async ({ page }) => {
    const firstRun = page.getByRole('heading', { name: /Commit to three things a day|每天承诺三件事/i });
    if (await firstRun.isVisible().catch(() => false)) {
      await expect(page.getByRole('button', { name: /Get Started|开始使用/i })).toBeVisible();
      return;
    }
    await expect(page.getByTestId('nav-today')).toBeVisible();
    await expect(page.getByTestId('nav-notes')).toBeVisible();
  });

  test('AI chat has one clear primary navigation entry', async ({ page }) => {
    const firstRun = page.getByRole('heading', { name: /Commit to three things a day|每天承诺三件事/i });
    if (await firstRun.isVisible().catch(() => false)) return;

    const entry = page.getByTestId('nav-ai-chat');
    await expect(entry).toBeVisible();
    await entry.click();
    await expect(entry).toHaveAttribute('data-active', 'true');
    await expect(page.getByTestId('floating-ai-chat-button')).toHaveCount(0);
  });

  test('settings panel opens', async ({ page }) => {
    const firstRun = page.getByRole('heading', { name: /Commit to three things a day|每天承诺三件事/i });
    if (await firstRun.isVisible().catch(() => false)) {
      await expect(page.getByText(/Workspace Directory|工作区目录/i)).toBeVisible();
      return;
    }
    await page.getByTestId('settings-button').click();
    await expect(page.locator('text=/Settings|Configuration|Config|设置|全局设置/i').first()).toBeVisible();
  });

  test(initialLoadHealthTest, async ({ page }) => {
    const consoleErrors: string[] = [];
    const httpErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('response', response => {
      if (response.status() >= 400) {
        httpErrors.push(`${response.status()} ${response.url()}`);
      }
    });

    // Install listeners before the only navigation so no in-flight requests are
    // aborted by a reload and every initial response remains observable.
    await page.goto('http://localhost:47831');
    await page.waitForLoadState('networkidle');

    // Chromium emits a generic console error for every failed HTTP response. The
    // response assertion below retains the URL and status, so it is more precise.
    const realConsoleErrors = consoleErrors.filter(error =>
      !error.includes('favicon') &&
      !error.includes('Failed to load resource'),
    );
    const unexpectedHttpErrors = httpErrors.filter(error =>
      !/^404 http:\/\/localhost:47831\/api\/files\/\d{4}-\d{2}-\d{2}$/.test(error),
    );

    expect(realConsoleErrors).toHaveLength(0);
    expect(unexpectedHttpErrors).toHaveLength(0);
  });
});
