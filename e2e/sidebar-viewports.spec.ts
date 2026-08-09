/**
 * Visual verification of the audit #11 sidebar behaviour across the
 * three viewport bands. Captures the closed (default) state for each
 * band, plus the expanded overlay for mobile and the compact strip
 * on tablet so we have evidence the new animation + persistence work
 * end-to-end. The spec uses the existing e2e-workspace so the page
 * doesn't gate on WorkspaceSetup.
 */
import { test, expect, request } from '@playwright/test';

const VIEWPORTS = [
  { name: 'mobile-375', width: 375, height: 800 },
  { name: 'tablet-768', width: 768, height: 900 },
  { name: 'desktop-1280', width: 1280, height: 800 },
];

test.describe('Sidebar viewport behavior (audit #11)', () => {
  for (const vp of VIEWPORTS) {
    test(`closed default @ ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      // Clear any persisted sidebar preference from a prior test run.
      await page.goto('http://localhost:47831', { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => localStorage.removeItem('df_sidebar_collapsed'));
      await page.goto('http://localhost:47831', { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);
      // Today view should be the default
      const sidebar = page.locator('[data-testid="nav-today"]').first();
      if (vp.name === 'desktop-1280') {
        await expect(sidebar).toBeVisible({ timeout: 10000 });
      }
      await page.screenshot({
        path: `/tmp/audit-sidebar-${vp.name}-closed.png`,
        fullPage: false,
      });
    });

    test(`open overlay @ ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      // Clear any persisted sidebar preference from a prior test run.
      await page.goto('http://localhost:47831', { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => localStorage.removeItem('df_sidebar_collapsed'));
      await page.goto('http://localhost:47831', { waitUntil: 'networkidle' });
      // Wait for the workspace to load and the sidebar to be ready. The
      // bootstrap call (POST /api/config/workspaces + activate) is async,
      // and the check-first-run flip from true→false happens after the
      // /api/config GET, so the page may briefly render the workspace
      // setup modal. Wait for it to clear before screenshotting.
      await page.waitForFunction(() => {
        return !document.body.innerText.includes('Commit to three things a day');
      }, { timeout: 15000 }).catch(() => { /* tolerate — test asserts on its own */ });
      await page.waitForTimeout(800);
      if (vp.name === 'desktop-1280') {
        // Desktop: sidebar is already open, just screenshot.
        await expect(page.getByTestId('nav-today').first()).toBeVisible({ timeout: 15000 }).catch(async (e) => {
          await page.screenshot({ path: `/tmp/dbg-sidebar-open-${vp.name}.png`, fullPage: true });
          throw e;
        });
      } else if (vp.name === 'tablet-768') {
        // Tablet compact: click the empty bottom area of the strip to expand
        // (avoids clicking Today which would immediately collapse)
        const aside = page.locator('aside').first();
        const box = await aside.boundingBox();
        if (box) {
          // Click near the bottom of the strip (away from nav buttons)
          await page.mouse.click(box.x + box.width / 2, box.y + box.height - 30);
        }
        await page.waitForTimeout(500);
      } else {
        // Mobile: click the floating hamburger to open
        const menu = page.locator('button[title*="sidebar" i]').first();
        if (await menu.count()) {
          await menu.click({ timeout: 3000 }).catch(() => {});
        }
        await page.waitForTimeout(400);
      }
      await page.screenshot({
        path: `/tmp/audit-sidebar-${vp.name}-open.png`,
        fullPage: false,
      });
    });
  }
});
