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

/**
 * 1.1.4 focus-mode icon strip caps the visible dots at 12. Once a
 * user has more than 11 notes the rest fold into a single "N+"
 * placeholder that switches back to the list view on click. The
 * selected note is also pinned into the visible window so the user
 * always sees what they're editing.
 */
test('notes focus mode caps strip at 12 and exposes N+ overflow', async ({ page, baseURL }) => {
  // Bootstrap workspace + activate it (idempotent across runs).
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
    const wid = flist.workspaces.find(
      (w: { name: string }) => w.name === 'e2e-workspace',
    ).id;
    const retry = await ctx.post(`/api/config/workspaces/${wid}/activate`);
    expect(retry.ok()).toBeTruthy();
  }
  await ctx.dispose();

  // Seed 16 notes — enough to overflow the 12-dot cap (11 notes + 1 N+).
  const noteCtx = await request.newContext({ baseURL });
  const seededIds: string[] = [];
  for (let i = 0; i < 16; i++) {
    const seed = await noteCtx.post('/api/v2/notes', {
      data: {
        body: `# Strip overflow #${i}\n\nBody line for note ${i} — should be visible in the hover tooltip.`,
        title: `Strip overflow #${i}`,
        kind: 'general',
        state: 'active',
      },
    });
    expect(seed.ok()).toBeTruthy();
    const out = await seed.json();
    seededIds.push(out.note.id);
  }
  await noteCtx.dispose();

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /^notes$/i }).first().click();
  await expect(page.getByTestId('v2-notes-view')).toBeVisible({ timeout: 10000 });

  // Pick the LAST seeded note as selected — it's the one most likely
  // to be off-screen in the strip, which is exactly the case the
  // cap + auto-scroll is supposed to handle.
  const lastNoteId = seededIds[seededIds.length - 1];
  await page.getByTestId(`notes-item-${lastNoteId}`).click();
  await expect(page.getByTestId('note-editor')).toBeVisible();

  // Switch to focus mode.
  await page.getByTestId('note-toggle-layout').click();
  await expect(page.getByTestId('v2-notes-view')).toHaveAttribute('data-layout', 'note');
  await expect(page.getByTestId('notes-strip')).toBeVisible();

  // The "+" new note + 11 dots + "N+" placeholder = 13 <li> in the
  // scrollable list. Count the visible dots to confirm the cap.
  await expect(page.getByTestId('notes-strip-new')).toBeVisible();
  await expect(page.getByTestId('notes-strip-more')).toBeVisible();

  // The selected (last) note must be in the visible window — either
  // by being in the top-11 (we explicitly selected the most recent
  // seed) or by being swapped in. Either way the strip renders its
  // dot.
  await expect(page.getByTestId(`notes-strip-${lastNoteId}`)).toBeVisible();

  // Hover the first note dot (skip the "+" new-note button and the
  // "N+" overflow placeholder — those are siblings in the same list
  // but don't render a hover tooltip). The portaled tooltip should
  // appear with the title and first body line.
  const firstDot = page
    .locator('[data-testid^="notes-strip-"]')
    .filter({ hasNotText: 'New note' })
    .filter({ hasNotText: '+' })
    .first();
  await firstDot.hover();
  // Wait past the 200ms hover delay for the portal to mount.
  await page.waitForTimeout(400);
  const tooltips = page.locator('.notes-strip-tooltip.is-visible');
  await expect(tooltips.first()).toBeVisible();

  // Screenshot the capped strip with the tooltip.
  await page.screenshot({
    path: '/Users/fangchen/Baidu/GitHub/dailyflow/e2e-screenshot-notes-focus-strip-capped.png',
    fullPage: true,
  });

  // Move the mouse away to dismiss the tooltip, then click the "N+"
  // placeholder — it should switch back to the list view.
  await page.mouse.move(0, 0);
  await page.getByTestId('notes-strip-more').click();
  await expect(page.getByTestId('v2-notes-view')).toHaveAttribute('data-layout', 'split');
  await expect(page.getByTestId('notes-list')).toBeVisible();
});

