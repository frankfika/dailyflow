import { expect, test } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test.use({ viewport: { width: 1440, height: 900 } });

test('sidebar and Event outline resize independently and persist after refresh', async ({ page, request }) => {
  const workspace = mkdtempSync(join(tmpdir(), 'df-resizable-panes-e2e-'));
  await request.post('/api/config', {
    data: {
      workspaceRoot: workspace,
      activeWorkspaceId: 'resizable-panes-e2e',
      workspaces: [{ id: 'resizable-panes-e2e', name: 'Resizable', path: workspace, createdAt: new Date().toISOString() }],
      language: 'en',
      v2: { enabled: true, eventFirst: true },
    },
  });
  const event = await (await request.post('/api/events', {
    data: { title: 'Resize panes safely', context: 'work' },
  })).json();

  const openEvent = async () => {
    await page.getByTestId('nav-events').click();
    await page.getByTestId(`event-card-${event.id}`).click();
    await expect(page.getByTestId('event-outline-resize-handle')).toBeVisible();
  };

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await openEvent();

  const sidebar = page.locator('aside[role="navigation"]');
  const outline = page.getByTestId('event-outline-pane');
  const sidebarBefore = await widthOf(sidebar);
  const outlineBefore = await widthOf(outline);

  await dragRight(page, page.getByTestId('sidebar-resize-handle'), 84);
  await expect.poll(() => widthOf(sidebar)).toBeGreaterThan(sidebarBefore + 70);

  await dragRight(page, page.getByTestId('event-outline-resize-handle'), 96);
  await expect.poll(() => widthOf(outline)).toBeGreaterThan(outlineBefore + 80);
  const sidebarSaved = await widthOf(sidebar);
  const outlineSaved = await widthOf(outline);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await openEvent();
  await expect.poll(() => widthOf(sidebar)).toBeCloseTo(sidebarSaved, 0);
  await expect.poll(() => widthOf(outline)).toBeCloseTo(outlineSaved, 0);
});

async function widthOf(locator: import('@playwright/test').Locator): Promise<number> {
  return locator.evaluate(element => element.getBoundingClientRect().width);
}

async function dragRight(
  page: import('@playwright/test').Page,
  handle: import('@playwright/test').Locator,
  distance: number,
): Promise<void> {
  const box = await handle.boundingBox();
  if (!box) throw new Error('Resize handle has no bounding box');
  const x = box.x + Math.min(2, box.width / 2);
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + distance / 2, y, { steps: 4 });
  await page.mouse.move(x + distance, y, { steps: 4 });
  await page.mouse.up();
}
