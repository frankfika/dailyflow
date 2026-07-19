import { test, expect } from '@playwright/test';

test.describe('DailyFlow Smoke Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
  });

  test('page loads with correct title', async ({ page }) => {
    await expect(page).toHaveTitle(/DailyFlow/);
  });

  test('sidebar shows navigation items', async ({ page }) => {
    await expect(page.getByTestId('nav-today')).toBeVisible();
    await expect(page.getByTestId('nav-notes')).toBeVisible();
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
