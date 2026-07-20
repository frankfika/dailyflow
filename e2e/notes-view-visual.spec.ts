import { test, expect, request } from '@playwright/test';

/**
 * Visual verification of the 1.1.2 Notes tab integration: clicking
 * "Notes" in the sidebar now mounts the v2 NotesView (document-first
 * editor + filter pills + autosave indicator) instead of the v1 Notes
 * component.
 */
test('notes tab renders v2 NotesView', async ({ page, baseURL }) => {
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
  if (!activateRes.ok()) {
    // The previous test runs may have left the workspace in a half-state
    // (config written but workspaceRoot not bootstrapped). Retry by
    // re-creating the workspace fresh.
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

  // Pre-seed a note so the list is not empty when the page mounts.
  const noteCtx = await request.newContext({ baseURL });
  const createNoteRes = await noteCtx.post('/api/v2/notes', {
    data: {
      body: '# Visual test note\n\nThis note was created by the 1.1.2 e2e test to prove that the new NotesView renders both the list and the editor.\n',
      title: 'Visual test note',
      kind: 'general',
      state: 'active',
    },
  });
  console.log('CREATE NOTE status:', createNoteRes.status(), await createNoteRes.text());
  expect(createNoteRes.ok()).toBeTruthy();
  const created = await createNoteRes.json();
  const noteId: string = created.note.id;
  await noteCtx.dispose();

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  // Click the Notes sidebar entry. We use the visible text since the
  // sidebar doesn't expose a stable testid for nav items.
  await page.getByRole('button', { name: /^notes$/i }).first().click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/dbg-notes2.png', fullPage: true });
  await expect(page.getByTestId('v2-notes-view')).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('notes-list')).toBeVisible();
  await expect(page.getByTestId('notes-new')).toBeVisible({ timeout: 8000 });

  // Wait for the React Query list fetch to settle, then assert the
  // pre-seeded note shows up in the list.
  await expect(page.getByTestId(`notes-item-${noteId}`)).toBeVisible({ timeout: 8000 });

  // Click the note — the document-first editor should mount with the
  // title in the title input and the body in the textarea.
  await page.getByTestId(`notes-item-${noteId}`).click();
  await expect(page.getByTestId('note-editor')).toBeVisible();
  await expect(page.getByTestId('note-title')).toHaveValue('Visual test note');
  await expect(page.getByTestId('note-body')).toContainText('Visual test note');

  await page.screenshot({
    path: '/Users/fangchen/Baidu/GitHub/dailyflow/e2e-screenshot-notes-view.png',
    fullPage: true,
  });
});
