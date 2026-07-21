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
   * Returns nothing; tests follow up with their own assertions.
   */
  async function openNotesTab(page: import('@playwright/test').Page): Promise<void> {
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /^notes$/i }).first().click();
    await expect(page.getByTestId('v2-notes-view')).toBeVisible({ timeout: 10000 });
  }

  test('default layout is focus mode — aside is 56px, not 280px', async ({ page, baseURL }) => {
    await bootstrapWorkspace(baseURL);
    await openNotesTab(page);

    // Layout starts as `note` (focus mode), not `split`.
    await expect(page.getByTestId('v2-notes-view')).toHaveAttribute('data-layout', 'note');

    // The aside collapses to a 56px icon strip. The split-mode list
    // pane (notes-list) is gone — it only exists in split layout.
    const aside = page.getByTestId('notes-aside');
    await expect(aside).toBeVisible();
    const asideWidth = await aside.evaluate((el) => el.getBoundingClientRect().width);
    expect(asideWidth).toBeCloseTo(56, 0);

    // The strip is the visible surface; the full list is hidden.
    await expect(page.getByTestId('notes-strip')).toBeVisible();
    await expect(page.getByTestId('notes-list')).toHaveCount(0);

    // The toggle button at the top of the strip is reachable inside
    // the 56px column (it must not overflow the aside).
    const toggle = page.getByTestId('notes-strip-show-list');
    await expect(toggle).toBeVisible();
    const toggleBox = await toggle.boundingBox();
    expect(toggleBox).not.toBeNull();
    if (toggleBox) {
      const asideBox = await aside.boundingBox();
      expect(asideBox).not.toBeNull();
      if (asideBox) {
        expect(toggleBox.x + toggleBox.width).toBeLessThanOrEqual(asideBox.x + asideBox.width + 1);
        expect(toggleBox.x).toBeGreaterThanOrEqual(asideBox.x - 1);
      }
    }
  });

  test('strip "Show list" button toggles back to split layout', async ({ page, baseURL }) => {
    await bootstrapWorkspace(baseURL);
    await openNotesTab(page);

    // Precondition: focus mode is the default.
    await expect(page.getByTestId('v2-notes-view')).toHaveAttribute('data-layout', 'note');

    // Click the toggle at the top of the strip.
    await page.getByTestId('notes-strip-show-list').click();
    await expect(page.getByTestId('v2-notes-view')).toHaveAttribute('data-layout', 'split');

    // Aside grows to 280px and the full list returns.
    const aside = page.getByTestId('notes-aside');
    const asideWidth = await aside.evaluate((el) => el.getBoundingClientRect().width);
    expect(asideWidth).toBeCloseTo(280, 0);
    await expect(page.getByTestId('notes-list')).toBeVisible();

    // The strip itself is no longer mounted — it's a focus-mode-only
    // view.
    await expect(page.getByTestId('notes-strip')).toHaveCount(0);
  });

  test('mod+\\ keyboard shortcut toggles split → focus', async ({ page, baseURL }) => {
    await bootstrapWorkspace(baseURL);
    // Seed a note so the editor has something to show once the
    // shortcut switches layouts.
    const noteId = await seedNote(baseURL, 'Keyboard shortcut test');
    await openNotesTab(page);

    // Precondition: start in split mode (click the strip's "Show
    // list" button), so the shortcut has somewhere to go.
    await page.getByTestId('notes-strip-show-list').click();
    await expect(page.getByTestId('v2-notes-view')).toHaveAttribute('data-layout', 'split');

    // Open the seeded note so the editor is mounted and the keyboard
    // event target is in a known place (not the empty-state CTA).
    await page.getByTestId(`notes-item-${noteId}`).click();
    await expect(page.getByTestId('note-editor')).toBeVisible();

    // Fire `Control+\` — the NotesView handler accepts either meta
    // or ctrl, and Control maps cleanly on both macOS and Linux dev
    // hosts. We need to first move focus out of any text input so
    // the handler's INPUT/TEXTAREA escape doesn't short-circuit.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Control+\\');
    await expect(page.getByTestId('v2-notes-view')).toHaveAttribute('data-layout', 'note');

    // Aside collapses back to 56px; editor stays mounted.
    const aside = page.getByTestId('notes-aside');
    const asideWidth = await aside.evaluate((el) => el.getBoundingClientRect().width);
    expect(asideWidth).toBeCloseTo(56, 0);
    await expect(page.getByTestId('notes-strip')).toBeVisible();
    await expect(page.getByTestId('note-editor')).toBeVisible();
    await expect(page.getByTestId('note-body')).toContainText('Keyboard shortcut test');
  });

  test('editor-header toggle switches focus mode → split', async ({ page, baseURL }) => {
    await bootstrapWorkspace(baseURL);
    // Seed + open the note so the editor header is mounted (the
    // toggle button only renders when a note is open).
    const noteId = await seedNote(baseURL, 'Editor header toggle test');
    await openNotesTab(page);

    // Open the note via the strip dot.
    await page.getByTestId(`notes-strip-${noteId}`).click();
    await expect(page.getByTestId('note-editor')).toBeVisible();

    // Precondition: focus mode.
    await expect(page.getByTestId('v2-notes-view')).toHaveAttribute('data-layout', 'note');

    // Click the editor-header toggle (different button from the
    // strip "Show list" — proves the second entry point also works).
    await page.getByTestId('note-toggle-layout').click();
    await expect(page.getByTestId('v2-notes-view')).toHaveAttribute('data-layout', 'split');

    // Aside widens to 280px; the strip is gone.
    const aside = page.getByTestId('notes-aside');
    const asideWidth = await aside.evaluate((el) => el.getBoundingClientRect().width);
    expect(asideWidth).toBeCloseTo(280, 0);
    await expect(page.getByTestId('notes-strip')).toHaveCount(0);
    await expect(page.getByTestId('notes-list')).toBeVisible();

    // The editor is still showing the same note.
    await expect(page.getByTestId('note-body')).toContainText('Editor header toggle test');
  });
});
