import { test, expect, request } from '@playwright/test';

test('today-backlog renders in Today view', async ({ page, baseURL }) => {
  // Seed workspace via API so WorkspaceSetup modal doesn't gate the page.
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
  console.log('ACTIVATE status:', activateRes.status(), await activateRes.text());
  expect(activateRes.ok()).toBeTruthy();
  await ctx.dispose();

  // Seed today's file with a few tasks so the backlog groups are populated.
  const today = new Date().toISOString().slice(0, 10);
  const fileCtx = await request.newContext({ baseURL });
  const fileRes = await fileCtx.get(`/api/files/${today}`);
  const seed =
    '## Tasks\n\n' +
    '- [ ] Reply to investor email\n' +
    '- [ ] Review v1.0.8 spec diff\n' +
    '- [ ] Write a 1.0.8 release note\n' +
    '- [ ] Tidy the test workspace\n' +
    '- [ ] Plan the connector OAuth work\n';
  if (fileRes.ok()) {
    const file = await fileRes.json();
    if (!(file.content || '').includes('Reply to investor email')) {
      await fileCtx.post(`/api/files/${today}`, { data: { content: seed } });
    }
  } else {
    await fileCtx.post(`/api/files/${today}`, { data: { content: seed } });
  }
  await fileCtx.dispose();

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  const backlog = page.getByTestId('today-backlog');
  await expect(backlog).toBeVisible({ timeout: 15000 });
  const focusBar = page.getByTestId('today-focus-bar');
  await expect(focusBar).toBeVisible();
  for (const key of ['all', 'overdue', 'today', 'week', 'later']) {
    await expect(page.getByTestId(`today-filter-${key}`)).toBeVisible();
  }
  await page.screenshot({
    path: '/Users/fangchen/Baidu/GitHub/dailyflow/e2e-screenshot-today-backlog.png',
    fullPage: true,
  });
});
