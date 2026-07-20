import { test, expect, request } from '@playwright/test';

/**
 * Visual verification of the 1.1.3 focus mode: a user should be able
 * to collapse the note list to a 56px icon strip so the editor gets
 * the full pane width for long-form writing. The toggle round-trips
 * and the strip remains usable (each note is still one click away).
 */
test('notes focus mode toggles split ↔ note-only', async ({ page, baseURL }) => {
  // Bootstrap workspace + seed a note.
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
    expect(retry.ok()).toBeTruthy();
  }
  await ctx.dispose();

  const noteCtx = await request.newContext({ baseURL });
  const seedRes = await noteCtx.post('/api/v2/notes', {
    data: {
      body: '# Focus mode visual test\n\nLong enough to look different in the wider editor pane.\n',
      title: 'Focus mode visual test',
      kind: 'general',
      state: 'active',
    },
  });
  expect(seedRes.ok()).toBeTruthy();
  const seeded = await seedRes.json();
  const noteId = seeded.note.id;
  await noteCtx.dispose();

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /^notes$/i }).first().click();
  await expect(page.getByTestId('v2-notes-view')).toBeVisible({ timeout: 10000 });
  // Default layout is `split` (two-column 320px + 1fr).
  await expect(page.getByTestId('v2-notes-view')).toHaveAttribute('data-layout', 'split');

  // Open the seeded note so the editor shows the body and the
  // focus-mode toggle button is in the header.
  await page.getByTestId(`notes-item-${noteId}`).click();
  await expect(page.getByTestId('note-editor')).toBeVisible();
  await expect(page.getByTestId('note-body')).toContainText('Focus mode visual test');

  // Click the focus-mode toggle in the editor header.
  await page.getByTestId('note-toggle-layout').click();
  await expect(page.getByTestId('v2-notes-view')).toHaveAttribute('data-layout', 'note');
  // The list now shows as an icon strip.
  await expect(page.getByTestId('notes-strip')).toBeVisible();
  await expect(page.getByTestId(`notes-strip-${noteId}`)).toBeVisible();
  // The full list pane is gone.
  await expect(page.getByTestId('notes-list')).toHaveCount(0);
  // The editor still shows the body.
  await expect(page.getByTestId('note-body')).toContainText('Focus mode visual test');

  // Screenshot the focus-mode layout.
  await page.screenshot({
    path: '/Users/fangchen/Baidu/GitHub/dailyflow/e2e-screenshot-notes-focus-mode.png',
    fullPage: true,
  });

  // Click another note in the strip to confirm it switches the editor.
  await page.getByTestId(`notes-strip-${noteId}`).click();
  await expect(page.getByTestId('note-body')).toContainText('Focus mode visual test');

  // Toggle back to split mode.
  await page.getByTestId('note-toggle-layout').click();
  await expect(page.getByTestId('v2-notes-view')).toHaveAttribute('data-layout', 'split');
  await expect(page.getByTestId('notes-list')).toBeVisible();
});
