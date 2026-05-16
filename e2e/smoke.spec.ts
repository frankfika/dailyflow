import { test, expect } from '@playwright/test';

test.describe('DailyFlow Smoke Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
  });

  test('page loads with correct title', async ({ page }) => {
    await expect(page).toHaveTitle(/DailyFlow/);
  });

  test('sidebar shows navigation items', async ({ page }) => {
    await expect(page.getByTestId('nav-daily-notes')).toBeVisible();
    await expect(page.getByTestId('nav-projects')).toBeVisible();
    await expect(page.getByTestId('nav-ai-summary')).toBeVisible();
  });

  test('can switch between Visual and Raw Markdown views', async ({ page }) => {
    await page.click('text=Raw Markdown');
    await expect(page.locator('textarea').first()).toBeVisible();

    await page.click('text=Visual');
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });

  test('projects page loads', async ({ page }) => {
    await page.getByTestId('nav-projects').click();
    await expect(page.locator('text=/Projects|项目概览/i').first()).toBeVisible();
  });

  test('settings panel opens', async ({ page }) => {
    await page.getByTestId('settings-button').click();
    await expect(page.locator('text=/Settings|Configuration|Config|设置|全局设置/i').first()).toBeVisible();
  });

  test('AI Summary modal opens', async ({ page }) => {
    await page.getByTestId('nav-ai-summary').click();
    await expect(page.locator('text=/AI Summary|AI 洞察|Generate Insights|生成洞察/i').first()).toBeVisible();
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
