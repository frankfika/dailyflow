import { test, expect, request } from '@playwright/test';

/**
 * Resolve (or re-create) the e2e-workspace and activate it. If a prior
 * test run left a half-state (config entry exists but workspaceRoot
 * was never bootstrapped), the first activate will 404; in that case we
 * create the workspace fresh and try again. Mirrors the helper in
 * note-acceptance.spec.ts so the two tests behave the same way under
 * sequential execution.
 */
async function bootstrapWorkspace(baseURL: string | undefined): Promise<void> {
  if (!baseURL) throw new Error('baseURL is required');
  const ctx = await request.newContext({ baseURL });
  for (let attempt = 0; attempt < 2; attempt++) {
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
    if (activateRes.ok()) {
      await ctx.dispose();
      return;
    }
    if (attempt === 1) {
      throw new Error(
        `activate failed after retry: ${activateRes.status()} ${await activateRes.text()}`,
      );
    }
    // 404 on first try: stale config entry. Recreate on the next loop.
  }
}

test('today-backlog renders in Today view', async ({ page, baseURL }) => {
  await bootstrapWorkspace(baseURL);

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
