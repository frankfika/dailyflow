import { expect, test } from '@playwright/test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('Add to Today always uses today and appears without reloading', async ({ page, request }) => {
  const workspace = mkdtempSync(join(tmpdir(), 'df-mindmap-today-'));
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = `${yesterdayDate.getFullYear()}-${String(yesterdayDate.getMonth() + 1).padStart(2, '0')}-${String(yesterdayDate.getDate()).padStart(2, '0')}`;
  const [year, month] = today.split('-');
  const [yesterdayYear, yesterdayMonth] = yesterday.split('-');
  mkdirSync(join(workspace, '.dailyflow'), { recursive: true });
  mkdirSync(join(workspace, 'Daily', year, month), { recursive: true });
  writeFileSync(join(workspace, 'Daily', year, month, `${today}.md`), `# ${today}\n\n## Tasks\n`);
  mkdirSync(join(workspace, 'Daily', yesterdayYear, yesterdayMonth), { recursive: true });
  writeFileSync(join(workspace, 'Daily', yesterdayYear, yesterdayMonth, `${yesterday}.md`), `# ${yesterday}\n\n## Tasks\n`);

  const configured = await request.post('/api/config', {
    data: {
      workspaceRoot: workspace,
      activeWorkspaceId: 'mindmap-today-linkage',
      workspaces: [{ id: 'mindmap-today-linkage', name: 'Mindmap Today', path: workspace, createdAt: now.toISOString() }],
      dailyPathTemplate: 'Daily/{year}/{month}/{date}.md',
      rolloverTrigger: 'manual',
      rolloverSkipTags: [],
      activeContext: 'work',
      language: 'en',
      v2: { enabled: true, eventFirst: true },
    },
  });
  expect(configured.ok()).toBeTruthy();

  await page.goto('/', { waitUntil: 'networkidle' });
  // Reproduce the dangerous path: browse a historical day, then leave Today.
  // "Add to Today" must still schedule against the real calendar day.
  await page.getByTitle('Previous Day').click();
  await expect(page.getByRole('button', { name: 'Back to today' })).toBeVisible();
  await page.getByTestId('nav-more').click();
  await page.getByTestId('nav-mindmap').click();
  await page.getByTestId('mindmap-list-new').click();
  await expect(page.getByTestId('mindmap-outline')).toBeVisible();
  await page.getByTestId('mindmap-title-input').fill('Product launch');

  const rootRow = page.locator('[data-testid^="outline-row-"]').first();
  const rootInput = rootRow.locator('input');
  await rootInput.fill('Product launch');
  await rootInput.press('Control+Enter');

  const taskRow = page.locator('[data-testid^="outline-row-"]').nth(1);
  const taskInput = taskRow.locator('input');
  await expect(taskInput).toBeFocused();
  await taskInput.fill('Prepare launch checklist');
  await taskInput.press('Control+Shift+Enter');

  await expect.poll(async () => {
    const response = await request.get(`/api/events/today-items?date=${today}&context=work`);
    const payload = await response.json();
    const items = Array.isArray(payload) ? payload : payload.items;
    return items?.some((item: { title: string }) => item.title === 'Prepare launch checklist');
  }).toBe(true);

  const historicalResponse = await request.get(`/api/events/today-items?date=${yesterday}&context=work`);
  const historicalPayload = await historicalResponse.json();
  const historicalItems = Array.isArray(historicalPayload) ? historicalPayload : historicalPayload.items;
  expect(historicalItems?.some((item: { title: string }) => item.title === 'Prepare launch checklist')).toBe(false);

  await page.getByTestId('nav-today').click();
  await expect(page.getByRole('heading', { name: 'Prepare launch checklist' })).toBeVisible();
  await expect(page.getByText('Product launch', { exact: true })).toBeVisible();

  // Today -> Mindmap: completion must survive a full app reload and update
  // the map progress, not just the currently mounted task card.
  await page.getByRole('button', { name: 'Mark as done' }).click();
  await expect.poll(async () => {
    const response = await request.get(`/api/events/today-items?date=${today}&context=work`);
    const payload = await response.json();
    const items = Array.isArray(payload) ? payload : payload.items;
    return items?.find((item: { title: string }) => item.title === 'Prepare launch checklist')?.status;
  }).toBe('done');

  await page.reload({ waitUntil: 'networkidle' });
  await page.getByTestId('nav-more').click();
  await page.getByTestId('nav-mindmap').click();
  await expect(page.getByTestId('mindmap-progress')).toContainText('1/1');

  // Mindmap -> Today: toggling the linked node updates the canonical task.
  await page.getByTitle('In Today; click to toggle').click();
  await expect.poll(async () => {
    const response = await request.get(`/api/events/today-items?date=${today}&context=work`);
    const payload = await response.json();
    const items = Array.isArray(payload) ? payload : payload.items;
    return items?.find((item: { title: string }) => item.title === 'Prepare launch checklist')?.status;
  }).toBe('todo');

  await page.getByTestId('nav-today').click();
  await expect(page.getByRole('button', { name: 'Mark as done' })).toBeVisible();
});
