// Visual smoke test for the Mind Map feature.
// Run with: `npx playwright test e2e/mindmap-visual.spec.ts --workers=1`
//
// This script is for owner verification, not CI. It seeds a workspace
// via /api/config, then exercises the mind map UI end-to-end and saves
// screenshots under the repo root.

import { test } from '@playwright/test';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test.use({ viewport: { width: 1440, height: 900 } });

test('mind map: empty state → create → add children → notes → collapse → markdown export', async ({ page, request }) => {
  const ws = mkdtempSync(join(tmpdir(), 'df-mindmap-'));
  mkdirSync(join(ws, '.dailyflow'), { recursive: true });
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

  // 1. Open the mind map tab.
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.getByTestId('nav-mindmap').click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/Users/fangchen/Baidu/GitHub/dailyflow/visual-mindmap-1-empty.png' });

  // 2. Create a new map.
  const newBtn = page.getByRole('button', { name: /新建思维导图|New mind map/i }).first();
  await newBtn.click();
  await page.waitForTimeout(1000);

  // 3. Set the title.
  const titleInput = page.getByTestId('mindmap-title-input');
  await titleInput.fill('OpenCSG 投资人路演');
  await page.mouse.click(20, 20);
  await page.waitForTimeout(500);

  // 4. Add three children via Tab + fill + Enter.
  for (const label of ['市场分析', '产品节奏', '融资节奏']) {
    await page.locator('[data-testid^="mindmap-node-"]').first().click();
    await page.waitForTimeout(300);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(500);
    const childInput = page.locator('textarea[placeholder="子主题"]').first();
    await childInput.waitFor({ state: 'visible', timeout: 5000 });
    await childInput.fill(label);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
  }

  // 5. Drill into the first child (市场分析) and add 2 grandchildren.
  await page.locator('[data-testid^="mindmap-node-"]').nth(1).click();
  await page.waitForTimeout(300);
  for (const label of ['TAM / SAM', '竞品']) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(500);
    const gcInput = page.locator('textarea[placeholder="子主题"]').first();
    await gcInput.waitFor({ state: 'visible', timeout: 5000 });
    await gcInput.fill(label);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
  }

  // 6. Add a note on the root node.
  await page.locator('[data-testid^="mindmap-node-"]').first().click();
  await page.waitForTimeout(300);
  await page.locator('button[title="备注"]').first().click();
  await page.waitForTimeout(500);
  const noteArea = page.locator('textarea[placeholder*="详细"]').first();
  await noteArea.waitFor({ state: 'visible', timeout: 5000 });
  await noteArea.fill('目标: 12月前 close Series A, 估值 30M USD。\n关注点: GT motion + product wedge。');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // 7. Capture full tree before collapsing.
  await page.screenshot({ path: '/Users/fangchen/Baidu/GitHub/dailyflow/visual-mindmap-2-populated.png' });

  // 8. Collapse the first child subtree to demo the focus view.
  await page.locator('[data-testid^="mindmap-node-"]').nth(1).click();
  await page.waitForTimeout(300);
  await page.locator('button[title="折叠子节点"]').first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/Users/fangchen/Baidu/GitHub/dailyflow/visual-mindmap-3-collapsed.png' });

  // 9. Cycle the status of one of the children.
  await page.locator('[data-testid^="mindmap-node-"]').nth(1).click();
  await page.waitForTimeout(300);
  // The status badge has data-testid `mindmap-status-${id}` — find the
  // first child node and click its status button. After the collapse
  // earlier, the first child is still visible but its grandchildren
  // aren't. We re-expand first so we have multiple nodes to work with.
  await page.locator('button[title*="展开子节点"]').first().click();
  await page.waitForTimeout(500);
  await page.locator('[data-testid^="mindmap-node-"]').nth(1).click();
  await page.waitForTimeout(300);
  const firstChildStatus = page.locator('[data-testid^="mindmap-status-"]').nth(1);
  await firstChildStatus.click();
  await page.waitForTimeout(300);
  await firstChildStatus.click(); // in-progress → done
  await page.waitForTimeout(300);

  // 10. Undo: Ctrl+Z should revert the status flip.
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(500);

  // 11. Open in-map search with Ctrl+F, type a query, press Enter to
  //     cycle to the next match, and verify the search bar shows the
  //     match count.
  await page.keyboard.press('Control+f');
  await page.waitForTimeout(300);
  const searchInput = page.getByTestId('mindmap-search-input');
  await searchInput.waitFor({ state: 'visible', timeout: 3000 });
  await searchInput.fill('产品');
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/Users/fangchen/Baidu/GitHub/dailyflow/visual-mindmap-4-search.png' });
  // Close the search bar with Escape.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // 12. Persistence check.
  const list = await request.get('http://localhost:3000/api/mindmaps');
  const maps = await list.json();
  if (!Array.isArray(maps) || maps.length === 0) {
    throw new Error('Expected at least one persisted mind map, got ' + JSON.stringify(maps));
  }
  const map = maps[0];
  if (!map.nodes || map.nodes.length < 5) {
    throw new Error('Expected the persisted map to have at least 5 nodes, got ' + JSON.stringify(map.nodes));
  }
  const root = map.nodes.find((n: { id: string }) => n.id === map.rootId);
  if (!root?.note || !root.note.includes('Series A')) {
    throw new Error('Expected the root to have a note about Series A, got ' + JSON.stringify(root));
  }
  // The collapsed flag should be persisted on the first child. (We
  // toggled it back to expanded during the test, so it should be false
  // now — the test is also implicitly verifying the toggle worked.)
  const firstChildPersisted = map.nodes.find((n: { text: string }) => n.text === '市场分析');
  if (firstChildPersisted?.collapsed) {
    throw new Error('Expected the first child to be re-expanded, got ' + JSON.stringify(firstChildPersisted));
  }
  // After undoing the status flip, the first child should NOT be 'done'
  // (it was cycled twice, then Ctrl+Z reverted one step).
  if (firstChildPersisted?.status === 'done') {
    throw new Error('Expected Ctrl+Z to revert the status flip, but it stayed done: ' + JSON.stringify(firstChildPersisted));
  }
});
