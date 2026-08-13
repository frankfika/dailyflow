import { expect, test } from '@playwright/test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('a task created in Mindmap appears in Today without reloading', async ({ page, request }) => {
  const workspace = mkdtempSync(join(tmpdir(), 'df-mindmap-today-'));
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const [year, month] = today.split('-');
  mkdirSync(join(workspace, '.dailyflow'), { recursive: true });
  mkdirSync(join(workspace, 'Daily', year, month), { recursive: true });
  writeFileSync(join(workspace, 'Daily', year, month, `${today}.md`), `# ${today}\n\n## Tasks\n`);

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

  await page.getByTestId('nav-today').click();
  await expect(page.getByRole('heading', { name: 'Prepare launch checklist' })).toBeVisible();
  await expect(page.getByText('Product launch', { exact: true })).toBeVisible();
});
