import { test } from '@playwright/test';
test('debug', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.mouse.move(1200, 400);
  await page.goto('http://127.0.0.1:47831/', { waitUntil: 'domcontentloaded' });
  await page.mouse.move(1200, 400);
  await page.waitForTimeout(4000);
  const bodyText = await page.locator('body').textContent();
  console.log('Has another debug:', bodyText?.includes('another debug'));
  console.log('Has 调试 task:', bodyText?.includes('调试 task'));
  console.log('Has 本地测试 event:', bodyText?.includes('本地测试 event'));
  await page.screenshot({ path: '/tmp/df-debug/today-debug.png', fullPage: true });
  console.log('SCREENSHOT: /tmp/df-debug/today-debug.png');
});
