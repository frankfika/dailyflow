import { test, expect, request } from '@playwright/test';

/**
 * Capture a representative screenshot of every tab in the main app so
 * Frank can review the current visual state and the owner / sub-agents
 * can audit the "lots of empty space" feedback concretely.
 *
 * Each shot tries to look as "real" as possible: the Notes tab gets a
 * seeded long note, Today gets a few task candidates, the AI Chat tab
 * shows the empty state. Screenshots go to /tmp/audit-*.png (gitignored
 * location outside the repo) so they don't pollute the working tree.
 */
test('audit screenshots: all tabs', async ({ page, baseURL }) => {
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
    await ctx.post(`/api/config/workspaces/${wid}/activate`);
  }
  await ctx.dispose();

  // Seed a long note so the focus-mode editor screenshot has content.
  const noteCtx = await request.newContext({ baseURL });
  const seedRes = await noteCtx.post('/api/v2/notes', {
    data: {
      body:
        '# Monday planning\n\n' +
        'Today I want to ship three things before lunch:\n\n' +
        '1. The v2 spec acceptance tests — they are the only thing standing between us and 1.1.4.\n' +
        '2. The new backlinks panel — it should surface the commitments and decisions that reference this note.\n' +
        '3. A small visual pass on the Today view to make the focus row feel more substantial.\n\n' +
        'If I have time after that, the marketing site needs a real hero shot instead of the placeholder. ' +
        'Catching Alex on Slack would be faster than email — he is in the office today.\n\n' +
        '## Risk\n\n' +
        'The biggest risk is the 2.0 connector SDK. Until we have a real OAuth flow, the Calendar / Email ' +
        'tabs in Settings will all read "needs auth" no matter what. ' +
        'A 1.1.x release cannot be a real "1.0" without that loop closed.\n',
      title: 'Monday planning',
      kind: 'daily',
      state: 'active',
    },
  });
  expect(seedRes.ok()).toBeTruthy();
  const seeded = await seedRes.json();
  const noteId: string = seeded.note.id;
  await noteCtx.dispose();

  // Seed some tasks for the Today view.
  const today = new Date().toISOString().slice(0, 10);
  const fileCtx = await request.newContext({ baseURL });
  const fileRes = await fileCtx.get(`/api/files/${today}`);
  const seedTasks =
    '## Tasks\n\n' +
    '- [ ] Ship the v2 acceptance tests (high)\n' +
    '- [ ] Tidy the inbox (medium)\n' +
    '- [ ] Send the weekly update (high)\n' +
    '- [ ] Plan the connector OAuth work (medium)\n' +
    '- [ ] Review the new hero (low)\n' +
    '- [ ] Reply to investor email (high)\n' +
    '- [ ] Read the v2 spec acceptance script (medium)\n';
  if (fileRes.ok()) {
    const file = await fileRes.json();
    if (!(file.content || '').includes('Ship the v2 acceptance tests')) {
      await fileCtx.post(`/api/files/${today}`, { data: { content: seedTasks } });
    }
  } else {
    await fileCtx.post(`/api/files/${today}`, { data: { content: seedTasks } });
  }
  await fileCtx.dispose();

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });

  // Today (default tab).
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/audit-today.png', fullPage: true });

  // Notes split.
  await page.getByRole('button', { name: /^notes$/i }).first().click();
  await page.waitForTimeout(1500);
  await page.getByTestId(`notes-item-${noteId}`).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/audit-notes-split.png', fullPage: true });

  // Notes focus.
  await page.getByTestId('note-toggle-layout').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/audit-notes-focus.png', fullPage: true });

  // Settings (bottom-left).
  await page.getByRole('button', { name: /settings/i }).first().click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/audit-settings.png', fullPage: true });
});
