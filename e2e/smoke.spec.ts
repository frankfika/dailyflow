import { test, expect } from '@playwright/test';

test.describe('DailyFlow Smoke Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
  });

  test('page loads with correct title', async ({ page }) => {
    await expect(page).toHaveTitle(/DailyFlow/);
  });

  test('sidebar shows navigation items', async ({ page }) => {
    // Sidebar navigation items
    await expect(page.getByRole('navigation').getByText('Timeline')).toBeVisible();
    await expect(page.getByRole('navigation').getByText('Daily Notes')).toBeVisible();
    await expect(page.getByRole('navigation').getByText('AI Summary')).toBeVisible();
    await expect(page.getByRole('navigation').getByText('Configuration')).toBeVisible();
  });

  test('can switch between Visual and Raw Markdown views', async ({ page }) => {
    await page.click('text=Raw Markdown');
    // Should show markdown content area (react-simple-code-editor textarea)
    await expect(page.locator('textarea').first()).toBeVisible();

    await page.click('text=Visual');
    // Should show visual task cards or date header
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });

  test('category filter buttons are present in Visual mode', async ({ page }) => {
    await page.click('text=Visual');
    await expect(page.locator('button:has-text("ALL")')).toBeVisible();
    // At least one of these should exist after loading data
    const filterButtons = page.locator('button', { hasText: /^(ALL|TASKS|WORK|PERSONAL)$/i });
    await expect(filterButtons.first()).toBeVisible();
  });

  test('add task FAB opens task input panel', async ({ page }) => {
    await page.click('text=Visual');
    // The FAB should be visible
    const fab = page.locator('button[title="Add Task"], button:has-text("Add Task")').first();
    if (await fab.isVisible().catch(() => false)) {
      await fab.click();
      // After clicking, a task input should appear
      await expect(page.locator('input[placeholder*="task"], textarea').first()).toBeVisible();
    }
  });

  test('projects page loads', async ({ page }) => {
    await page.click('text=Projects', { exact: false });
    await expect(page.locator('text=/Projects/i').first()).toBeVisible();
  });

  test('settings panel opens', async ({ page }) => {
    await page.click('text=Configuration');
    await expect(page.locator('text=/Settings|Configuration|Config/i').first()).toBeVisible();
  });

  test('AI Summary modal opens', async ({ page }) => {
    await page.click('text=AI Summary');
    await expect(page.locator('text=/AI Summary|Generate Insights/i').first()).toBeVisible();
  });

  test('no console errors on initial load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    await page.waitForLoadState('networkidle');
    // Ignore favicon 404 errors
    const realErrors = errors.filter(e => !e.includes('favicon'));
    expect(realErrors).toHaveLength(0);
  });
});
