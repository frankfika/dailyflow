import { test, expect, request } from '@playwright/test';

test('debug sidebar @ desktop-1280', async ({ page, baseURL }) => {
  const ctx = await request.newContext({ baseURL });
  const createRes = await ctx.post('/api/config/workspaces', {
    data: { name: 'e2e-workspace', path: `${process.env.HOME}/dailyflow-v2` },
  });
  let workspaceId: string;
  if (createRes.ok()) {
    workspaceId = (await createRes.json()).id;
  } else {
    const listRes = await ctx.get('/api/config/workspaces');
    const list = await listRes.json();
    workspaceId = list.workspaces.find(
      (w: { name: string }) => w.name === 'e2e-workspace',
    ).id;
  }
  const activateRes = await ctx.post(`/api/config/workspaces/${workspaceId}/activate`);
  if (!activateRes.ok()) {
    await ctx.post('/api/config/workspaces', {
      data: { name: 'e2e-workspace', path: `${process.env.HOME}/dailyflow-v2` },
    });
    const fresh = await ctx.get('/api/config/workspaces');
    const flist = await fresh.json();
    const wid = flist.workspaces.find((w: { name: string }) => w.name === 'e2e-workspace').id;
    const retry = await ctx.post(`/api/config/workspaces/${wid}/activate`);
    expect(retry.ok()).toBe(true);
  }
  await ctx.dispose();

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // Dump key elements
  const navToday = await page.locator('[data-testid="nav-today"]').count();
  const navTodayVisible = await page.locator('[data-testid="nav-today"]').first().isVisible().catch(() => false);
  const aside = await page.locator('aside').count();
  const asideFirst = await page.locator('aside').first().isVisible().catch(() => false);
  const asideBounding = await page.locator('aside').first().boundingBox().catch(() => null);
  const sidebarState = await page.locator('aside').first().getAttribute('data-state').catch(() => 'none');
  const sidebarViewport = await page.locator('aside').first().getAttribute('data-viewport').catch(() => 'none');

  console.log('navToday count:', navToday);
  console.log('navToday visible:', navTodayVisible);
  console.log('aside count:', aside);
  console.log('aside first visible:', asideFirst);
  console.log('aside first bounding:', JSON.stringify(asideBounding));
  console.log('sidebar data-state:', sidebarState);
  console.log('sidebar data-viewport:', sidebarViewport);

  await page.screenshot({ path: '/tmp/debug-sidebar.png', fullPage: false });
});
