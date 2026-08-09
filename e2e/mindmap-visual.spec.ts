import { expect, test } from '@playwright/test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test.use({ viewport: { width: 1440, height: 900 } });

test('mind map keeps its viewport, keeps navigation, and treats nodes as tagged tasks', async ({ page, request }) => {
  const ws = mkdtempSync(join(tmpdir(), 'df-mindmap-simple-'));
  mkdirSync(join(ws, '.dailyflow'), { recursive: true });
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const today = `${yyyy}-${mm}-${dd}`;
  mkdirSync(join(ws, 'Daily', String(yyyy), mm), { recursive: true });
  writeFileSync(join(ws, 'Daily', String(yyyy), mm, `${today}.md`), `# ${today}\n`);

  const cfgRes = await request.post('http://localhost:47831/api/config', {
    data: {
      workspaceRoot: ws,
      activeWorkspaceId: 'mindmap-simple',
      workspaces: [{ id: 'mindmap-simple', name: 'mindmap-simple', path: ws, createdAt: '2026-01-01T00:00:00Z' }],
      rolloverTrigger: 'manual',
      rolloverSkipTags: [],
    },
  });
  expect(cfgRes.ok()).toBeTruthy();

  await page.goto('http://localhost:47831', { waitUntil: 'networkidle' });
  await page.getByTestId('nav-mindmap').click();
  await expect(page.getByTestId('mindmap-list')).toBeVisible();
  await page.getByTestId('mindmap-list-new').click();

  const title = page.getByTestId('mindmap-title-input');
  await expect(title).toBeVisible();
  await title.fill('产品发布');
  await page.mouse.click(500, 600);
  await page.waitForTimeout(700);

  const rootNode = page.locator('[data-kind="root"]').first();
  await expect(rootNode).toBeVisible();
  await rootNode.click();
  const viewport = page.locator('.react-flow__viewport');
  const viewportBefore = await viewport.evaluate((element) => getComputedStyle(element).transform);

  // Adding a node used to auto-layout the whole tree and visually snap back
  // to center. The new child is placed beside its parent and the viewport is
  // unchanged.
  await page.keyboard.press('Tab');
  const firstInput = page.locator('textarea[placeholder="任务"], textarea[placeholder="Task"]').first();
  await expect(firstInput).toBeVisible();
  await firstInput.fill('准备发布清单');
  await page.keyboard.press('Enter');

  await expect.poll(async () => {
    const maps = await (await request.get('http://localhost:47831/api/mindmaps')).json();
    return maps[0]?.nodes?.find((node: { text: string }) => node.text === '准备发布清单')?.taskId ?? null;
  }).not.toBeNull();
  expect(await viewport.evaluate((element) => getComputedStyle(element).transform)).toBe(viewportBefore);
  await expect(page.getByTestId('mindmap-list')).toBeVisible();
  await expect(page.locator('.react-flow__minimap')).toBeVisible();
  await expect(page.getByTestId('mindmap-immersive-toggle')).toHaveCount(0);

  const firstMap = (await (await request.get('http://localhost:47831/api/mindmaps')).json())[0];
  const firstNode = firstMap.nodes.find((node: { text: string }) => node.text === '准备发布清单');
  const positionsBefore = new Map(firstMap.nodes.map((node: { id: string; position: { x: number; y: number } }) => [node.id, node.position]));

  // Tags live directly inside the node/task; there is no Tag node mode.
  await page.getByTestId(`mindmap-node-${firstNode.id}`).click();
  await page.getByTestId(`mindmap-edit-tags-${firstNode.id}`).click();
  const tagInput = page.getByTestId(`mindmap-tags-input-${firstNode.id}`);
  await tagInput.fill('#发布 #重要');
  await tagInput.press('Enter');
  await expect(page.getByTestId(`mindmap-tags-${firstNode.id}`)).toContainText('#发布');
  await expect(page.getByTestId(`mindmap-tags-${firstNode.id}`)).toContainText('#重要');

  // One checkbox is the task status—no separate "make task" action.
  await page.getByTestId(`mindmap-status-${firstNode.id}`).click();
  await expect.poll(async () => {
    const maps = await (await request.get('http://localhost:47831/api/mindmaps')).json();
    return maps[0]?.nodes?.find((node: { id: string }) => node.id === firstNode.id)?.status;
  }).toBe('done');
  await expect(page.locator('[data-testid^="mindmap-promote-"]')).toHaveCount(0);

  // Add a sibling and prove all existing positions—and the viewport—stay put.
  await page.getByTestId(`mindmap-node-${firstNode.id}`).click();
  await page.keyboard.press('Enter');
  const siblingInput = page.locator('textarea[placeholder="任务"], textarea[placeholder="Task"]').first();
  await expect(siblingInput).toBeVisible();
  await siblingInput.fill('通知客户');
  await page.keyboard.press('Enter');
  await expect.poll(async () => {
    const maps = await (await request.get('http://localhost:47831/api/mindmaps')).json();
    return maps[0]?.nodes?.find((node: { text: string }) => node.text === '通知客户')?.taskId ?? null;
  }).not.toBeNull();

  const finalMap = (await (await request.get('http://localhost:47831/api/mindmaps')).json())[0];
  for (const [id, position] of positionsBefore) {
    expect(finalMap.nodes.find((node: { id: string }) => node.id === id)?.position).toEqual(position);
  }
  expect(await viewport.evaluate((element) => getComputedStyle(element).transform)).toBe(viewportBefore);

  await page.screenshot({ path: 'visual-mindmap-simple-tasks.png' });
});
