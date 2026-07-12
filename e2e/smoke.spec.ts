import { test, expect } from '@playwright/test';

test.describe('DailyFlow Smoke Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
  });

  test('page loads with correct title', async ({ page }) => {
    await expect(page).toHaveTitle(/DailyFlow/);
  });

  test('sidebar shows navigation items', async ({ page }) => {
    await expect(page.getByTestId('nav-notes')).toBeVisible();
    await expect(page.getByTestId('nav-ai-chat')).toBeVisible();
    await expect(page.getByTestId('nav-capsules')).toBeVisible();
  });

  test('can switch to Capsules tab', async ({ page }) => {
    await page.getByTestId('nav-capsules').click();
    await expect(page.getByText(/Time Capsules|时间胶囊/i).first()).toBeVisible();
  });

  test('can switch to AI Chat tab', async ({ page }) => {
    await page.getByTestId('nav-ai-chat').click();
    await expect(page.getByText(/AI Chat|AI 对话/i).first()).toBeVisible();
  });

  test('settings panel opens', async ({ page }) => {
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
