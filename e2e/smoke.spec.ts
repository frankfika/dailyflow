import { test, expect } from '@playwright/test';

test.describe('DailyFlow Smoke Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
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

  test('AI chat launcher is available outside the chat page', async ({ page }) => {
    const firstRun = page.getByRole('heading', { name: /Commit to three things a day|每天承诺三件事/i });
    if (await firstRun.isVisible().catch(() => false)) return;

    const launcher = page.getByTestId('floating-ai-chat-button');
    await expect(launcher).toBeVisible();
    await launcher.click();
    await expect(page.getByTestId('floating-ai-chat')).toBeVisible();
    await launcher.click();
    await expect(page.getByTestId('floating-ai-chat')).toBeHidden();
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

  test('no console errors on initial load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    await page.waitForLoadState('networkidle');
    const realErrors = errors.filter(e => !e.includes('favicon'));
    expect(realErrors).toHaveLength(0);
  });
});
