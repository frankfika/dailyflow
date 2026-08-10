import { expect, test } from '@playwright/test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test.use({ viewport: { width: 1440, height: 900 } });

test('legacy mind maps surface as Events without restoring the old navigation', async ({ page, request }) => {
  const workspace = mkdtempSync(join(tmpdir(), 'df-event-adapter-'));
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const [year, month] = today.split('-');
  mkdirSync(join(workspace, '.dailyflow', 'mindmaps'), { recursive: true });
  mkdirSync(join(workspace, 'Daily', year, month), { recursive: true });
  writeFileSync(join(workspace, 'Daily', year, month, `${today}.md`), `# ${today}\n\n## Tasks\n`);
  writeFileSync(join(workspace, '.dailyflow', 'mindmaps', 'legacy-map.json'), JSON.stringify({
    id: 'legacy-map',
    title: 'Legacy launch plan',
    rootId: 'root',
    nodes: [{ id: 'root', text: 'Legacy launch plan', position: { x: 0, y: 0 }, kind: 'root' }],
    edges: [],
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }, null, 2));

  const configured = await request.post('/api/config', {
    data: {
      workspaceRoot: workspace,
      activeWorkspaceId: 'event-adapter-e2e',
      workspaces: [{ id: 'event-adapter-e2e', name: 'Event adapter', path: workspace, createdAt: new Date().toISOString() }],
      dailyPathTemplate: 'Daily/{year}/{month}/{date}.md',
      rolloverTrigger: 'manual',
      rolloverSkipTags: [],
      language: 'en',
      v2: { eventFirst: true },
    },
  });
  expect(configured.ok()).toBeTruthy();

  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('nav-mindmap')).toHaveCount(0);
  await page.getByTestId('nav-events').click();
  await expect(page.getByTestId('event-card-legacy-map')).toContainText('Legacy launch plan');
  await page.getByTestId('event-card-legacy-map').click();
  await expect(page.getByTestId('event-detail')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Legacy launch plan' })).toBeVisible();
});
