// Visual smoke test for the Mind Map feature.
// Run with: `npx playwright test e2e/mindmap-visual.spec.ts --workers=1`
//
// This script is for owner verification, not CI. It seeds a workspace
// via /api/config, then exercises the mind map UI end-to-end and saves
// a screenshot under the repo root.

import { test } from '@playwright/test';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test.use({ viewport: { width: 1440, height: 900 } });

test('mind map: empty state → create → add children → re-layout', async ({ page, request }) => {
  // Seed a workspace directly via the server so we don't have to walk
  // through the onboarding modal in a fresh DB.
  const ws = mkdtempSync(join(tmpdir(), 'df-mindmap-'));
  mkdirSync(join(ws, '.dailyflow'), { recursive: true });
  // Pre-create today's daily file so the Today tab doesn't error out and
  // block the rest of the app behind a global error banner. The path
  // template is `Daily/{year}/{month}/{date}.md` and {month} comes from
  // the ISO date string (zero-padded), so we must match that exact shape.
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const today = `${yyyy}-${mm}-${dd}`;
  mkdirSync(join(ws, 'Daily', String(yyyy), mm), { recursive: true });
  const fs = await import('node:fs');
  fs.writeFileSync(join(ws, 'Daily', String(yyyy), mm, `${today}.md`), `# ${today}\n`);

  const cfgRes = await request.post('http://localhost:3000/api/config', {
    data: {
      workspaceRoot: ws,
      activeWorkspaceId: 'visual',
      workspaces: [{ id: 'visual', name: 'visual', path: ws, createdAt: '2026-01-01T00:00:00Z' }],
      rolloverTrigger: 'manual',
      rolloverSkipTags: [],
    },
  });
  if (!cfgRes.ok()) {
    throw new Error('Failed to seed workspace: ' + (await cfgRes.text()));
  }

  // 1. Open the app on the mind map tab.
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.getByTestId('nav-mindmap').click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/Users/fangchen/Baidu/GitHub/dailyflow/visual-mindmap-1-empty.png' });

  // 2. Create a new map from the empty state.
  const newBtn = page.getByRole('button', { name: /新建思维导图|New mind map/i }).first();
  await newBtn.click();
  await page.waitForTimeout(800);

  // 3. The auto-created child should be in edit mode. Type a topic.
  const input = page.locator('input[placeholder="子主题"]').first();
  if (await input.count()) {
    await input.fill('市场分析');
    await page.keyboard.press('Enter');
  }
  const titleInput = page.getByTestId('mindmap-title-input');
  await titleInput.fill('OpenCSG 投资人路演');
  // Click outside to commit.
  await page.mouse.click(20, 20);
  await page.waitForTimeout(500);

  // 4. Click the root to select it, then Tab to add a child.
  await page.locator('[data-testid^="mindmap-node-"]').first().click();
  await page.waitForTimeout(300);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(500);
  const childInput = page.locator('input[placeholder="子主题"]').first();
  await childInput.waitFor({ state: 'visible', timeout: 5000 });
  await childInput.fill('市场分析');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);

  // 5. Add a second child via Tab + Enter flow.
  await page.locator('[data-testid^="mindmap-node-"]').first().click();
  await page.waitForTimeout(300);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(500);
  const child2 = page.locator('input[placeholder="子主题"]').first();
  await child2.waitFor({ state: 'visible', timeout: 5000 });
  await child2.fill('产品节奏');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);

  // 6. Add a third child.
  await page.locator('[data-testid^="mindmap-node-"]').first().click();
  await page.waitForTimeout(300);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(500);
  const child3 = page.locator('input[placeholder="子主题"]').first();
  await child3.waitFor({ state: 'visible', timeout: 5000 });
  await child3.fill('融资节奏');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);

  // 6. Hit "整理布局" to confirm auto-layout works.
  await page.getByRole('button', { name: /整理布局|Re-layout/i }).click();
  await page.waitForTimeout(800);

  await page.screenshot({ path: '/Users/fangchen/Baidu/GitHub/dailyflow/visual-mindmap-2-populated.png' });

  // 7. Verify the persistence path: a GET should now return one map.
  const list = await request.get('http://localhost:3000/api/mindmaps');
  const maps = await list.json();
  if (!Array.isArray(maps) || maps.length === 0) {
    throw new Error('Expected at least one persisted mind map, got ' + JSON.stringify(maps));
  }
  if (!maps[0].nodes || maps[0].nodes.length < 2) {
    throw new Error('Expected the persisted map to have at least 2 nodes, got ' + JSON.stringify(maps[0]));
  }
});
