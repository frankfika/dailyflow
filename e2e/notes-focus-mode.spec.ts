import { test, expect, request } from '@playwright/test';

/**
 * Focus mode is the default layout for the Notes tab. The list
 * collapses to a 56px icon strip so the editor gets the full pane
 * width for long-form writing. The user can switch back to the 280px
 * split view via the "Show list" button on the strip, the
 * `note-toggle-layout` button in the editor header, or the
 * `mod+\` keyboard shortcut.
 */
test.describe('Notes focus mode (default layout)', () => {
  // Shared workspace + note bootstrap. Each test creates its own
  // unique note so parallel runs don't collide on the seeded body.
  async function bootstrapWorkspace(baseURL: string | undefined): Promise<void> {
    if (!baseURL) throw new Error('baseURL is required');
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
      // The previous test run may have left the workspace in a
      // half-state (config written but workspaceRoot not bootstrapped).
      // Retry by re-creating it fresh.
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
  }

  async function seedNote(baseURL: string | undefined, marker: string): Promise<string> {
    if (!baseURL) throw new Error('baseURL is required');
    const ctx = await request.newContext({ baseURL });
    const res = await ctx.post('/api/v2/notes', {
      data: {
        body: `# ${marker}\n\nThis note exists to prove the layout reflects the seed.`,
        title: marker,
        kind: 'general',
        state: 'active',
      },
    });
    expect(res.ok()).toBeTruthy();
    const out = await res.json();
    await ctx.dispose();
    return out.note.id;
  }

  /**
   * Open the app, click into Notes, and wait for the view to mount.
   * Clears the layout preference from localStorage first so each
   * test starts from a known default.
   */
  async function openNotesTab(page: import('@playwright/test').Page): Promise<void> {
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    // Wipe any stored layout so the test starts from the actual
    // loadLayout() default, not whatever a previous test / dev
    // session left in localStorage.
    await page.evaluate(() => localStorage.removeItem('df_notes_layout'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /^notes$/i }).first().click();
    await expect(page.getByTestId('v2-notes-view')).toBeVisible({ timeout: 10000 });
  }

  test('default layout is split — aside is 280px with the list, not 56px focus strip', async ({ page, baseURL }) => {
    await bootstrapWorkspace(baseURL);
    await openNotesTab(page);

    // Layout starts as `split` (full list), not `note` (focus strip).
    // The 56px focus strip was eating the left edge with no useful
    // content when the user wanted to look at the actual list.
    await expect(page.getByTestId('v2-notes-view')).toHaveAttribute('data-layout', 'split');

    // The aside is the full list at 280px. The focus strip is gone.
    const aside = page.getByTestId('notes-aside');
    await expect(aside).toBeVisible();
    const asideWidth = await aside.evaluate((el) => el.getBoundingClientRect().width);
    expect(asideWidth).toBeCloseTo(280, 0);

    await expect(page.getByTestId('notes-list')).toBeVisible();
    await expect(page.getByTestId('notes-strip')).toHaveCount(0);
  });

  test('mod+\\ keyboard shortcut toggles split → focus', async ({ page, baseURL }) => {
    await bootstrapWorkspace(baseURL);
    const noteId = await seedNote(baseURL, 'Keyboard shortcut test');
    await openNotesTab(page);

    // Precondition: start in split mode (the new default).
    await expect(page.getByTestId('v2-notes-view')).toHaveAttribute('data-layout', 'split');

    // Open the seeded note so the editor is mounted and the keyboard
    // event target is in a known place (not the empty-state CTA).
    await page.getByTestId(`notes-item-${noteId}`).click();
    await expect(page.getByTestId('note-editor')).toBeVisible();

    // Fire `Control+\` — the NotesView handler accepts either meta
    // or ctrl, and Control maps cleanly on both macOS and Linux dev
    // hosts. Move focus out of any text input first so the
    // handler's INPUT/TEXTAREA escape doesn't short-circuit.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Control+\\');
    await expect(page.getByTestId('v2-notes-view')).toHaveAttribute('data-layout', 'note');

    // Aside collapses to 56px strip; editor stays mounted.
    const aside = page.getByTestId('notes-aside');
    const asideWidth = await aside.evaluate((el) => el.getBoundingClientRect().width);
    expect(asideWidth).toBeCloseTo(56, 0);
    await expect(page.getByTestId('notes-strip')).toBeVisible();
    await expect(page.getByTestId('note-editor')).toBeVisible();
    await expect(page.getByTestId('note-body')).toContainText('Keyboard shortcut test');
  });

  test('editor-header toggle switches split → focus', async ({ page, baseURL }) => {
    await bootstrapWorkspace(baseURL);
    const noteId = await seedNote(baseURL, 'Editor header toggle test');
    await openNotesTab(page);

    // Precondition: split (default). Open the note from the list.
    await expect(page.getByTestId('v2-notes-view')).toHaveAttribute('data-layout', 'split');
    await page.getByTestId(`notes-item-${noteId}`).click();
    await expect(page.getByTestId('note-editor')).toBeVisible();

    // Click the editor-header toggle to enter focus mode.
    await page.getByTestId('note-toggle-layout').click();
    await expect(page.getByTestId('v2-notes-view')).toHaveAttribute('data-layout', 'note');

    // Aside collapses to 56px; the list is replaced by the strip.
    const aside = page.getByTestId('notes-aside');
    const asideWidth = await aside.evaluate((el) => el.getBoundingClientRect().width);
    expect(asideWidth).toBeCloseTo(56, 0);
    await expect(page.getByTestId('notes-strip')).toBeVisible();
    await expect(page.getByTestId('notes-list')).toHaveCount(0);

    // The editor is still showing the same note.
    await expect(page.getByTestId('note-body')).toContainText('Editor header toggle test');
  });

  test('list-header "Focus" button switches split → focus', async ({ page, baseURL }) => {
    await bootstrapWorkspace(baseURL);
    await openNotesTab(page);

    // Precondition: split (default). The list header has its own
    // focus-mode toggle so the user has three entry points
    // (mod+\, editor header, list header).
    await expect(page.getByTestId('v2-notes-view')).toHaveAttribute('data-layout', 'split');

    await page.getByTestId('notes-hide-list').click();
    await expect(page.getByTestId('v2-notes-view')).toHaveAttribute('data-layout', 'note');

    // Aside collapses to 56px; strip replaces the list.
    const aside = page.getByTestId('notes-aside');
    const asideWidth = await aside.evaluate((el) => el.getBoundingClientRect().width);
    expect(asideWidth).toBeCloseTo(56, 0);
    await expect(page.getByTestId('notes-strip')).toBeVisible();
  });
});
