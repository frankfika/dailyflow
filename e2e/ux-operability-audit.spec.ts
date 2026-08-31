import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Runtime operability audit of the Today home page (UX v3.1 S1):
 *  a. focus bar pick-3 flow
 *  b. event group head -> Events/mindmap canvas navigation and back
 *  c. event group collapse / expand
 *  d. blanket button sweep with pageerror/console capture
 *  e. no uncaught pageerror during any of the flows
 *
 * Seeding follows the conventions of e2e/mindmap-today-linkage.spec.ts:
 * a temp workspace + POST /api/config, then tasks are created through the
 * server APIs (event-node tasks via create-task-for-node, standalone tasks
 * via POST /api/tasks) and awaited through the today-items projection.
 */

const EVENT_TITLE = 'Audit Event';
const EVENT_TASKS = ['Event task one', 'Event task two', 'Event task three'];
const STANDALONE_TASKS = ['Standalone task one', 'Standalone task two'];

interface SeededToday {
  eventTaskIds: string[];
}

function todayStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

async function seedTodayPage(request: APIRequestContext): Promise<SeededToday> {
  const today = todayStr();
  const workspace = mkdtempSync(join(tmpdir(), 'df-ux-operability-'));
  const [year, month] = today.split('-');
  mkdirSync(join(workspace, 'Daily', year, month), { recursive: true });
  writeFileSync(join(workspace, 'Daily', year, month, `${today}.md`), `# ${today}\n\n## Tasks\n`);

  const configured = await request.post('/api/config', {
    data: {
      workspaceRoot: workspace,
      activeWorkspaceId: 'ux-operability-audit',
      workspaces: [{ id: 'ux-operability-audit', name: 'UX Audit', path: workspace, createdAt: new Date().toISOString() }],
      dailyPathTemplate: 'Daily/{year}/{month}/{date}.md',
      rolloverTrigger: 'manual',
      rolloverSkipTags: [],
      activeContext: 'work',
      language: 'en',
      v2: { enabled: true, eventFirst: true },
    },
  });
  expect(configured.ok()).toBeTruthy();

  const event = await (await request.post('/api/events', {
    data: { title: EVENT_TITLE, context: 'work' },
  })).json();

  const detail = event.nodes ? event : await (await request.get(`/api/events/${event.id}`)).json();
  const rootNode = (detail.nodes ?? [])[0];
  expect(rootNode, 'seeded event should expose at least a root node').toBeTruthy();
  const mindmapId = detail.mindmapId ?? event.mindmapId ?? event.id;

  // One node can carry at most one linked task (create-task-for-node 409s
  // otherwise), so give the event three child nodes and link one task each.
  const map = await (await request.get(`/api/mindmaps/${mindmapId}`)).json();
  const childIds = ['audit-node-1', 'audit-node-2', 'audit-node-3'];
  const mapUpdate = {
    title: map.title,
    rootId: map.rootId,
    nodes: [
      ...map.nodes,
      ...EVENT_TASKS.map((title, index) => ({
        id: childIds[index],
        text: title,
        position: { x: 120, y: 120 + index * 90 },
        kind: 'task',
      })),
    ],
    edges: [
      ...map.edges,
      ...childIds.map((id) => ({ id: `edge-${id}`, source: map.rootId, target: id })),
    ],
  };
  const updated = await request.put(`/api/mindmaps/${mindmapId}`, { data: mapUpdate });
  expect(updated.ok(), `mindmap PUT failed: ${updated.status()} ${await updated.text()}`).toBeTruthy();

  const eventTaskIds: string[] = [];
  for (const [index, title] of EVENT_TASKS.entries()) {
    const res = await request.post('/api/events/actions/create-task-for-node', {
      data: { mindmapId, nodeId: childIds[index], title, scheduledDate: today },
    });
    expect(res.ok(), `create-task-for-node failed for ${title}: ${res.status()} ${await res.text()}`).toBeTruthy();
    const body = await res.json();
    if (body?.taskId) eventTaskIds.push(body.taskId);
  }

  for (const [index, title] of STANDALONE_TASKS.entries()) {
    const res = await request.post('/api/tasks', {
      data: {
        date: today,
        task: { id: `audit-standalone-${index + 1}`, title, status: 'todo', tags: ['work'] },
      },
    });
    expect(res.ok(), `POST /api/tasks failed for ${title}: ${res.status()} ${await res.text()}`).toBeTruthy();
  }

  // Both kinds of tasks must be part of the Today projection before the UI is opened.
  await expect.poll(async () => {
    const response = await request.get(`/api/events/today-items?date=${today}&context=work`);
    const payload = await response.json();
    const items = Array.isArray(payload) ? payload : payload.items;
    const titles = (items ?? []).map((item: { title: string }) => item.title);
    return EVENT_TASKS.every((title) => titles.includes(title))
      && STANDALONE_TASKS.every((title) => titles.includes(title));
  }, { timeout: 15_000 }).toBe(true);

  return { eventTaskIds };
}

/** Installs pageerror/console capture and returns the shared recorders. */
function attachErrorCapture(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(String(error?.stack ?? error)));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (text.includes('favicon')) return;
    // Same known-noise class as smoke.spec.ts: browsing a past day with no
    // Daily note 404s the file API; Chromium logs every >=400 response, with
    // the URL only in location(), not in the message text.
    const url = msg.location()?.url ?? '';
    if (text.includes('the server responded with a status of 404') && url.includes('/api/files/')) return;
    consoleErrors.push(`${text}${url ? ` (at ${url})` : ''}`);
  });
  // A native confirm/alert would otherwise freeze every subsequent page call
  // and burn the whole test timeout. Record + dismiss instead.
  page.on('dialog', (dialog) => {
    consoleErrors.push(`native dialog "${dialog.type()}": ${dialog.message()}`);
    void dialog.dismiss();
  });
  return { pageErrors, consoleErrors };
}

async function openTodayPage(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('navigation', { name: 'Main navigation' }).waitFor({ state: 'visible' });
  await expect(page.getByTestId('today-focus-scroll-region')).toBeVisible();
  await expect(page.getByTestId('today-focus-bar')).toBeVisible();
}

test.describe('Today UX operability audit', () => {
  let seeded: SeededToday;

  test.beforeEach(async ({ request }) => {
    seeded = await seedTodayPage(request);
  });

  test('a. focus bar: collapsed row expands, picks 3 tasks with ordinals, Save collapses to 3/3', async ({ page }) => {
    const { pageErrors } = attachErrorCapture(page);
    await openTodayPage(page);

    const focusBar = page.getByTestId('today-focus-bar');
    await expect(focusBar).toBeVisible();

    // Collapsed row expands into the picker.
    await focusBar.locator('button.today-focus-main').click();
    const picker = focusBar.locator('.today-focus-list');
    await expect(picker).toBeVisible();

    // Pick three tasks; each picked item must show its ordinal.
    for (let i = 0; i < 3; i++) {
      await picker.locator('button.today-focus-item', { hasText: EVENT_TASKS[i] }).click();
      const item = picker.locator('button.today-focus-item', { hasText: EVENT_TASKS[i] });
      await expect(item).toHaveAttribute('aria-pressed', 'true');
      await expect(item.locator('.today-focus-order')).toHaveText(String(i + 1));
    }
    await expect(focusBar.locator('.today-focus-count')).toHaveText('3/3');

    // Save collapses the row again, showing the 3/3 count.
    await focusBar.locator('button.today-focus-save').click();
    await expect(picker).toBeHidden();
    await expect(focusBar.locator('.today-focus-main')).toBeVisible();
    await expect(focusBar.locator('.today-focus-count')).toHaveText('3/3');
    await expect(focusBar.locator('.today-focus-preview')).toContainText(EVENT_TASKS[0]);

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toHaveLength(0);
  });

  test('b. event group head navigates to the Events/mindmap canvas and back to Today', async ({ page }) => {
    const { pageErrors } = attachErrorCapture(page);
    await openTodayPage(page);

    const groupHead = page.locator('[data-testid^="today-event-head-"]').first();
    await expect(groupHead).toBeVisible();
    await expect(groupHead).toContainText(EVENT_TITLE);

    await groupHead.click();

    // Observable signal of the mindmap canvas: clicking the group head opens
    // the event detail view (heading + canvas). `events-surface` only exists
    // on the events LIST view; the drill-down renders EventCanvas directly.
    const canvas = page.getByTestId('event-canvas');
    await expect(canvas).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: EVENT_TITLE })).toBeVisible();

    // Return to Today and confirm the state is still rendered.
    await page.getByTestId('nav-today').click();
    await expect(page.getByTestId('today-focus-scroll-region')).toBeVisible();
    await expect(page.getByTestId('today-focus-bar')).toBeVisible();
    await expect(page.getByTestId('today-backlog')).toBeVisible();
    await expect(page.getByRole('heading', { name: EVENT_TASKS[0] })).toBeVisible();

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toHaveLength(0);
  });

  test('c. event group collapse hides its task titles, expand brings them back', async ({ page }) => {
    const { pageErrors } = attachErrorCapture(page);
    await openTodayPage(page);

    const eventGroup = page.locator('[data-testid^="today-event-group-"]:not([data-testid="today-event-group-standalone"])').first();
    await expect(eventGroup).toBeVisible();

    const toggleButton = eventGroup.locator('button.today-event-collapse');
    await expect(toggleButton).toHaveAttribute('aria-expanded', 'true');
    await expect(eventGroup).toContainText(EVENT_TASKS[0]);

    await toggleButton.click();
    await expect(toggleButton).toHaveAttribute('aria-expanded', 'false');
    await expect(eventGroup).not.toContainText(EVENT_TASKS[0]);
    await expect(eventGroup).not.toContainText(EVENT_TASKS[2]);
    // The rest of the page is unaffected.
    await expect(page.getByTestId('today-backlog')).toContainText(STANDALONE_TASKS[0]);

    await toggleButton.click();
    await expect(toggleButton).toHaveAttribute('aria-expanded', 'true');
    await expect(eventGroup).toContainText(EVENT_TASKS[0]);
    await expect(eventGroup).toContainText(EVENT_TASKS[2]);

    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toHaveLength(0);
  });

  test('d+e. blanket button sweep records errors and no uncaught pageerror occurs', async ({ page }) => {
    test.setTimeout(180_000);
    const { pageErrors, consoleErrors } = attachErrorCapture(page);
    await openTodayPage(page);

    // Give late renders (motion.div, proactive banner) a moment so the sweep
    // sees the full set of Today buttons.
    await expect(page.getByTestId('today-backlog')).toBeVisible();
    await page.waitForTimeout(500);

    // Sweep strategy: identify each visible button by a CLASS-FREE DOM-path
    // + text signature plus an occurrence index (sibling cards render
    // identical buttons). Re-locate at click time — the app remounts content
    // on many state changes and framer-motion mutates ancestor classes, so
    // neither handles, locators nor class-based signatures survive. Sidebar
    // nav, context tabs and the page header are swept LAST because they
    // change the surface (context switch, day navigation) that the other
    // buttons live on.
    const computeIdentity = computeIdentitySrc;
    type ButtonMeta = { identity: string; label: string; isNav: boolean; disabled: boolean };
    const collectButtons = async (): Promise<ButtonMeta[]> =>
      page.evaluate(({ identSrc }) => {
        const identOf = new Function('return ' + identSrc)();
        const isVisible = (el: Element) => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        };
        const buttons = Array.from(document.querySelectorAll('button')).filter(isVisible);
        const seen = new Map<string, number>();
        return buttons.map((el) => {
          const base = identOf(el);
          const occ = seen.get(base) ?? 0;
          seen.set(base, occ + 1);
          return {
            identity: `${base}##${occ}`,
            label: (el.textContent ?? '').trim().slice(0, 60)
              || el.getAttribute('aria-label')
              || el.getAttribute('title')
              || '(unnamed)',
            isNav: Boolean(el.closest('nav, [role="tablist"], header, [data-testid="sidebar-inner"]')),
            disabled: (el as HTMLButtonElement).disabled,
          };
        });
      }, { identSrc: computeIdentity });

    const initial = await collectButtons();
    expect(initial.length, 'the Today page should expose buttons to sweep').toBeGreaterThan(3);
    // Sidebar toggle goes last of all: collapsing the rail hides every other
    // sidebar button before they can be swept.
    const isSidebarToggle = (b: ButtonMeta) => /hide sidebar|show sidebar/i.test(b.label);
    const ordered = [
      ...initial.filter((b) => !b.isNav),
      ...initial.filter((b) => b.isNav && !isSidebarToggle(b)),
      ...initial.filter((b) => b.isNav && isSidebarToggle(b)),
    ];

    const results: Array<{ label: string; ok: boolean; detail?: string }> = [];
    const clicked = new Set<string>();
    const errorsBefore = pageErrors.length;

    for (const target of ordered) {
      if (clicked.has(target.identity)) continue;

      let located = false;
      try {
        const meta = await handlelessLocate(page, target.identity);
        if (!meta) {
          results.push({ label: target.label, ok: true, detail: 'skipped: no longer visible after earlier clicks' });
          continue;
        }
        located = true;
        if (meta.disabled) {
          results.push({ label: target.label, ok: true, detail: 'skipped: disabled' });
          continue;
        }

        const consoleBefore = consoleErrors.length;
        const clickStartedAt = Date.now();
        console.log(`[sweep] clicking "${target.label}"`);
        await meta.locator.click({ timeout: 2000 });
        await page.waitForTimeout(250);
        // Dismiss any overlay the click opened: Esc for real modals, then a
        // neutral click for outside-click-closable popovers (e.g. the
        // workspace switcher, which has no Escape handler).
        await page.keyboard.press('Escape');
        await page.waitForTimeout(150);
        await dismissPopover(page);
        await page.waitForTimeout(150);
        console.log(`[sweep] clicked "${target.label}" in ${Date.now() - clickStartedAt}ms`);
        clicked.add(target.identity);

        // If the click navigated away from Today, come back so the rest of
        // the sweep remains meaningful.
        await returnToToday(page, target.label, console);

        const newPageErrors = pageErrors.slice(errorsBefore);
        const newConsoleErrors = consoleErrors.slice(consoleBefore);
        results.push({
          label: target.label,
          ok: newPageErrors.length === 0 && newConsoleErrors.length === 0,
          detail: [...newPageErrors, ...newConsoleErrors].join(' | ') || undefined,
        });
      } catch (error) {
        if (located) clicked.add(target.identity);
        results.push({ label: target.label, ok: false, detail: `click failed: ${String(error).slice(0, 200)}` });
        // Recover sweep state before continuing.
        await page.keyboard.press('Escape').catch(() => {});
        await dismissPopover(page);
        await returnToToday(page, target.label, console);
      }
    }

    // Human-readable sweep table lands in the report output.
    for (const result of results) {
      console.log(`[sweep] ${result.ok ? 'OK  ' : 'FAIL'} | ${result.label}${result.detail ? ` | ${result.detail}` : ''}`);
    }

    const failing = results.filter((result) => !result.ok);
    if (failing.length > 0) {
      console.log(`[sweep] buttons with errors:\n${failing.map((f) => `${f.label}: ${f.detail}`).join('\n')}`);
    }

    // e. the whole flow must complete without uncaught page errors.
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toHaveLength(0);
    // Keep the sweep honest: every collected button must have been attempted.
    expect(results.length).toBe(initial.length);
  });
});

/**
 * Clicks a deliberately inert spot (top-center of the Today scroll region,
 * the date heading area) so outside-click-closable popovers dismiss. No-op
 * when Today is not on screen — locator.boundingBox() would otherwise wait
 * forever for an unmounted element.
 */
async function dismissPopover(page: Page) {
  const region = page.getByTestId('today-focus-scroll-region');
  if (!(await region.isVisible().catch(() => false))) return;
  const box = await region.boundingBox().catch(() => null);
  if (!box) return;
  await page.mouse.click(box.x + box.width / 2, Math.max(box.y + 8, 8));
}

/** Returns the sweep to the Today surface; reloads once if the SPA is wedged. */
async function returnToToday(page: Page, label: string, logger: { log: (msg: string) => void }) {
  if (await page.getByTestId('today-focus-scroll-region').isVisible().catch(() => false)) return;
  logger.log(`[sweep] "${label}" left Today; returning`);
  await page.getByTestId('nav-today').click({ timeout: 5000 }).catch(() => {});
  if (await page.getByTestId('today-focus-scroll-region').isVisible().catch(() => false)) return;
  // The dev server's first transform of a heavy route can 500 mid-HMR and
  // leave the SPA broken (blank pane, dead handlers); a reload restores it.
  logger.log(`[sweep] Today surface unresponsive after "${label}"; reloading`);
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.getByTestId('today-focus-scroll-region').waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
}

/** Locates a visible button by its class-free path + text identity at click time. */async function handlelessLocate(page: Page, identity: string): Promise<{ locator: Locator; disabled: boolean } | null> {
  const [targetSig, targetOccRaw] = identity.split('##');
  const targetOcc = Number(targetOccRaw);
  const found = await page.evaluate(({ identSrc, targetSig, targetOcc }) => {
    const identOf = new Function('return ' + identSrc)();
    const isVisible = (el: Element) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    document.querySelectorAll('[data-audit-target]').forEach((el) => el.removeAttribute('data-audit-target'));
    const buttons = Array.from(document.querySelectorAll('button')).filter(isVisible);
    const seen = new Map<string, number>();
    for (const el of buttons) {
      const base = identOf(el);
      const occ = seen.get(base) ?? 0;
      seen.set(base, occ + 1);
      if (base === targetSig && occ === targetOcc) {
        el.setAttribute('data-audit-target', '1');
        return { disabled: (el as HTMLButtonElement).disabled };
      }
    }
    return null;
  }, { identSrc: computeIdentitySrc, targetSig, targetOcc });
  if (!found) return null;
  return { locator: page.locator('[data-audit-target="1"]'), disabled: found.disabled };
}

/** Class-free DOM path + trimmed text; must match the sweep's identity logic. */
const computeIdentitySrc = `(el) => {
  const path = [];
  let node = el;
  while (node && node !== document.body) {
    path.unshift(node.tagName.toLowerCase());
    node = node.parentElement;
  }
  return path.join('>') + '::' + (el.textContent ?? '').trim().slice(0, 40);
}`;
