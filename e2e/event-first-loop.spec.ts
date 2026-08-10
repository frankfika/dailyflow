import { expect, test } from '@playwright/test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test.use({ viewport: { width: 1440, height: 900 } });

test('Event breakdown schedules into Today and completion returns to the Event', async ({ page, request }) => {
  const workspace = mkdtempSync(join(tmpdir(), 'df-event-first-'));
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const [year, month] = today.split('-');
  mkdirSync(join(workspace, '.dailyflow'), { recursive: true });
  mkdirSync(join(workspace, 'Daily', year, month), { recursive: true });
  writeFileSync(join(workspace, 'Daily', year, month, `${today}.md`), `# ${today}\n\n## Tasks\n`);

  const configured = await request.post('/api/config', {
    data: {
      workspaceRoot: workspace,
      activeWorkspaceId: 'event-first-e2e',
      workspaces: [{ id: 'event-first-e2e', name: 'Event first', path: workspace, createdAt: new Date().toISOString() }],
      dailyPathTemplate: 'Daily/{year}/{month}/{date}.md',
      rolloverTrigger: 'manual',
      rolloverSkipTags: [],
      language: 'en',
      v2: { eventFirst: true },
    },
  });
  expect(configured.ok()).toBeTruthy();

  await page.goto('/', { waitUntil: 'networkidle' });
  await page.getByTestId('nav-events').click();
  await expect(page.getByTestId('events-surface')).toBeVisible();
  await expect(page.getByText('Today', { exact: true })).toHaveCount(1); // navigation only; Events no longer duplicates Today

  await page.getByTestId('new-event-button').click();
  await page.getByLabel('What are you moving forward?').fill('Launch DailyFlow 2.0');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByTestId('event-detail')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Launch DailyFlow 2.0' })).toBeVisible();

  const toolbar = page.getByTestId('event-node-toolbar');
  await toolbar.getByRole('button', { name: 'Child', exact: true }).click();
  await page.getByLabel('Add step').fill('Prepare release checklist');
  await page.getByRole('button', { name: 'Add step', exact: true }).click();

  const events = await (await request.get('/api/events')).json();
  const created = events.find((event: { title: string }) => event.title === 'Launch DailyFlow 2.0');
  expect(created).toBeTruthy();
  await expect.poll(async () => {
    const detail = await (await request.get(`/api/events/${created.id}`)).json();
    return detail.nodes.find((node: { text: string }) => node.text === 'Prepare release checklist')?.id ?? null;
  }).not.toBeNull();
  const detail = await (await request.get(`/api/events/${created.id}`)).json();
  const actionNode = detail.nodes.find((node: { text: string }) => node.text === 'Prepare release checklist');

  await page.getByTestId(`event-node-${actionNode.id}`).getByRole('button').click();
  await toolbar.getByRole('button', { name: 'Today', exact: true }).click();
  await expect.poll(async () => {
    const refreshed = await (await request.get(`/api/events/${created.id}`)).json();
    return refreshed.nodes.find((node: { id: string }) => node.id === actionNode.id)?.execution?.scheduledDate ?? null;
  }).toBe(today);

  await page.getByTestId('nav-today').click();
  await expect(page.getByRole('heading', { name: 'Prepare release checklist' })).toBeVisible();
  await expect(page.getByText('Launch DailyFlow 2.0', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Mark as done' }).click();

  await page.getByTestId('nav-events').click();
  const completedGroup = page.getByRole('button', { name: /Completed/ });
  await expect(completedGroup).toBeVisible();
  await completedGroup.click();
  await page.getByTestId(`event-card-${created.id}`).click();
  await expect(page.getByTestId(`event-node-${actionNode.id}`).getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');

  await page.getByLabel('Back to Events').click();
  await page.getByTestId('nav-more').click();
  await expect(page.getByTestId('nav-mindmap')).toHaveCount(0);
  await expect(page.getByTestId('nav-calendar')).toBeVisible();
  await expect(page.getByTestId('nav-memory')).toBeVisible();
});
